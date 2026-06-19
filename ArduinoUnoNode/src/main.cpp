#include <Arduino.h>
#include <SoftwareSerial.h>

// ===================== USER CONFIG =====================

// 1 = talk to PC over USB Serial
// 0 = talk to another node via SoftwareSerial on pins 2 (RX), 3 (TX)
#define USE_PC_SERIAL         1

// Serial baud rate
#define CMD_BAUD_RATE         115200

// Status frame interval (ms)
#define STATUS_INTERVAL_MS    200

// Max number of pins in the virtual IC node
#define NUM_PINS              16

// Clock settings
#define MAX_CLK_PINS          3
#define NO_CLK_PIN           -1

// ===================== PIN MAP =========================

// Map logical pin indices 0..15 to actual Arduino pins
const uint8_t pins[NUM_PINS] = {
  13, 12, 11, 10,
   9,  8,  7,  6,
   5,  4, A0, A1,
  A2, A3, A4, A5
};

// ===================== SERIAL SELECTION =================

#if USE_PC_SERIAL
  #define CMD_PORT Serial
  // If someone includes SoftwareSerial elsewhere, we keep it quiet
  SoftwareSerial DummySerial(2, 3);
#else
  SoftwareSerial NodeSerial(2, 3);  // RX, TX
  #define CMD_PORT NodeSerial
#endif

// ===================== PIN ROLES ========================

typedef enum
{
  ROLE_INPUT = 0,
  ROLE_OUTPUT,
  ROLE_GND,
  ROLE_VCC,
  ROLE_UNUSED,
  ROLE_CLK
} PinRole;

// Current role of each logical pin
PinRole pinRoles[NUM_PINS];

// Last known logic level of each pin (0/1)
uint8_t pinStatus[NUM_PINS];

// ===================== CLOCK STATE ======================

unsigned long clkOnTime  = 1000;   // ms high
unsigned long clkOffTime = 1000;   // ms low

int8_t clkPin[MAX_CLK_PINS] = { NO_CLK_PIN, NO_CLK_PIN, NO_CLK_PIN };

bool clkTracker       = false;     // false = low phase, true = high phase
bool clkEnabled       = false;
unsigned long previousClkMillis = 0;

// ===================== STATUS STREAM ====================

unsigned long previousStatusMillis = 0;

// ===================== BINARY PROTOCOL ==================
//
// Frame format (PC <-> Arduino):
//
//  [0]  0xAA        // START byte
//  [1]  CMD         // Command / Message ID
//  [2]  LEN         // Payload length in bytes (0–255)
//  [3]  PAYLOAD...  // LEN bytes
//  [3+LEN] CHK      // Checksum = 0xFF - ((CMD + LEN + sum(payload)) & 0xFF)
//
// CMDs PC -> Arduino:
//   0x01  SET_ROLE
//   0x02  SET_LEVEL
//   0x03  CLK_CONFIG
//   0x04  CLK_ENABLE
//   0x05  RESET
//   0x06  SYNC_REQUEST
//   0x07  STATUS_REQUEST
//
// CMDs Arduino -> PC:
//   0x80  ACK         (refCmd, status)
//   0x81  STATUS_FRAME
//   0x82  SYNC_DUMP
//
// STATUS_FRAME payload:
//   [0] millis_low8
//   [1..16] per-pin packed: lower 4 bits = roleCode, bit4 = level
//
// SYNC_DUMP payload:
//   [0] numPins
//   then for each pin:
//      [2*i+1] = roleCode
//      [2*i+2] = level
//
// Role codes:
//   0 = INPUT
//   1 = OUTPUT
//   2 = GND
//   3 = VCC
//   4 = UNUSED
//   5 = CLK
//
// =======================================================

// ---------- Helpers: role mapping ----------

uint8_t roleCodeFromPinRole(PinRole r) {
  switch (r) {
    case ROLE_INPUT:  return 0;
    case ROLE_OUTPUT: return 1;
    case ROLE_GND:    return 2;
    case ROLE_VCC:    return 3;
    case ROLE_UNUSED: return 4;
    case ROLE_CLK:    return 5;
    default:          return 4;
  }
}

PinRole pinRoleFromCode(uint8_t code) {
  switch (code) {
    case 0: return ROLE_INPUT;
    case 1: return ROLE_OUTPUT;
    case 2: return ROLE_GND;
    case 3: return ROLE_VCC;
    case 4: return ROLE_UNUSED;
    case 5: return ROLE_CLK;
    default: return ROLE_UNUSED;
  }
}

// ---------- Clock pin registration ----------

void registerClockPin(int idx) {
  for (int i = 0; i < MAX_CLK_PINS; i++) {
    if (clkPin[i] == idx) return; // already registered
  }
  for (int i = 0; i < MAX_CLK_PINS; i++) {
    if (clkPin[i] == NO_CLK_PIN) {
      clkPin[i] = idx;
      return;
    }
  }
}

void unregisterClockPin(int idx) {
  for (int i = 0; i < MAX_CLK_PINS; i++) {
    if (clkPin[i] == idx) {
      clkPin[i] = NO_CLK_PIN;
    }
  }
}

// ---------- Apply role to one pin ----------

void applyPinRole(uint8_t idx) {
  if (idx >= NUM_PINS) return;

  switch (pinRoles[idx]) {
    case ROLE_INPUT:
      pinMode(pins[idx], INPUT);
      break;

    case ROLE_OUTPUT:
      pinMode(pins[idx], OUTPUT);
      digitalWrite(pins[idx], pinStatus[idx] ? HIGH : LOW);
      break;

    case ROLE_GND:
      pinMode(pins[idx], OUTPUT);
      digitalWrite(pins[idx], LOW);
      pinStatus[idx] = 0;
      break;

    case ROLE_VCC:
      pinMode(pins[idx], OUTPUT);
      digitalWrite(pins[idx], HIGH);
      pinStatus[idx] = 1;
      break;

    case ROLE_UNUSED:
      pinMode(pins[idx], INPUT); // high-impedance
      break;

    case ROLE_CLK:
      pinMode(pins[idx], OUTPUT);
      registerClockPin(idx);
      break;
  }
}

// ---------- Reset all pins ----------

void RESET_PINS() {
  for (int i = 0; i < NUM_PINS; i++) {
    pinRoles[i]  = ROLE_UNUSED;
    pinStatus[i] = 0;
    pinMode(pins[i], OUTPUT);
    digitalWrite(pins[i], LOW);
  }
  clkEnabled = false;
  clkTracker = false;
  previousClkMillis = millis();
  for (int i = 0; i < MAX_CLK_PINS; i++) {
    clkPin[i] = NO_CLK_PIN;
  }
}

// ---------- Clock engine (non-blocking) ----------

void START_CLK() {
  if (!clkEnabled) return;

  unsigned long currentMillis = millis();
  unsigned long interval = clkTracker ? clkOnTime : clkOffTime;

  if (currentMillis - previousClkMillis >= interval) {
    previousClkMillis = currentMillis;
    clkTracker = !clkTracker;

    for (int i = 0; i < MAX_CLK_PINS; i++) {
      if (clkPin[i] != NO_CLK_PIN) {
        uint8_t idx = clkPin[i];
        if (idx < NUM_PINS && pinRoles[idx] == ROLE_CLK) {
          digitalWrite(pins[idx], clkTracker ? HIGH : LOW);
          pinStatus[idx] = clkTracker ? 1 : 0;
        }
      }
    }
  }
}

// ---------- Input refresh ----------

void refreshInputStates() {
  for (int i = 0; i < NUM_PINS; i++) {
    if (pinRoles[i] == ROLE_INPUT) {
      pinStatus[i] = digitalRead(pins[i]) ? 1 : 0;
    }
  }
}

// ---------- Checksum ----------

uint8_t calcChecksum(uint8_t cmd, uint8_t len, const uint8_t *data) {
  uint16_t sum = cmd + len;
  for (uint8_t i = 0; i < len; i++) sum += data[i];
  return (uint8_t)(0xFF - (sum & 0xFF));
}

// ---------- TX helpers ----------

void sendFrame(uint8_t cmd, uint8_t len, const uint8_t *payload) {
  uint8_t chk = calcChecksum(cmd, len, payload);
  CMD_PORT.write(0xAA);
  CMD_PORT.write(cmd);
  CMD_PORT.write(len);
  if (len > 0 && payload != nullptr) {
    CMD_PORT.write(payload, len);
  }
  CMD_PORT.write(chk);
}

void sendAck(uint8_t refCmd, uint8_t status) {
  uint8_t payload[2] = { refCmd, status };
  sendFrame(0x80, 2, payload);
}

// STATUS_FRAME: CMD=0x81
void sendStatusFrameBinary() {
  refreshInputStates();

  uint8_t payload[1 + NUM_PINS];
  payload[0] = (uint8_t)(millis() & 0xFF); // coarse time

  for (int i = 0; i < NUM_PINS; i++) {
    uint8_t roleCode = roleCodeFromPinRole(pinRoles[i]);
    uint8_t level    = pinStatus[i] ? 1 : 0;
    payload[1 + i]   = (roleCode & 0x0F) | (level << 4);
  }

  sendFrame(0x81, (uint8_t)(1 + NUM_PINS), payload);
}

// SYNC_DUMP: CMD=0x82
void sendSyncFrameBinary() {
  uint8_t payload[1 + NUM_PINS * 2];
  payload[0] = NUM_PINS;
  for (int i = 0; i < NUM_PINS; i++) {
    payload[1 + 2*i]     = roleCodeFromPinRole(pinRoles[i]);
    payload[1 + 2*i + 1] = pinStatus[i] ? 1 : 0;
  }
  sendFrame(0x82, (uint8_t)(1 + NUM_PINS * 2), payload);
}

// ===================== RX PARSER ========================

enum RxState {
  RX_WAIT_START,
  RX_CMD,
  RX_LEN,
  RX_PAYLOAD,
  RX_CHK
};

RxState rxState = RX_WAIT_START;
uint8_t rxCmd = 0;
uint8_t rxLen = 0;
uint8_t rxIndex = 0;
uint8_t rxPayload[32];  // enough for our frames

// ---------- Command handler (after checksum OK) ----------

void handleFrame(uint8_t cmd, uint8_t len, uint8_t *data) {
  switch (cmd) {
    // SET_ROLE: CMD=0x01, LEN=2, [0]=pin, [1]=roleCode
    case 0x01: {
      if (len != 2) { sendAck(cmd, 0x04); break; }
      uint8_t idx = data[0];
      uint8_t rc  = data[1];
      if (idx >= NUM_PINS || rc > 5) {
        sendAck(cmd, 0x02);
        break;
      }
      // If previously CLK, de-register
      if (pinRoles[idx] == ROLE_CLK) {
        unregisterClockPin(idx);
      }
      pinRoles[idx] = pinRoleFromCode(rc);
      applyPinRole(idx);
      sendAck(cmd, 0x00);
      break;
    }

    // SET_LEVEL: CMD=0x02, LEN=2, [0]=pin, [1]=value
    case 0x02: {
      if (len != 2) { sendAck(cmd, 0x04); break; }
      uint8_t idx = data[0];
      uint8_t v   = data[1] ? 1 : 0;
      if (idx >= NUM_PINS) { sendAck(cmd, 0x01); break; }
      if (pinRoles[idx] != ROLE_OUTPUT) { sendAck(cmd, 0x03); break; }
      pinStatus[idx] = v;
      digitalWrite(pins[idx], v ? HIGH : LOW);
      sendAck(cmd, 0x00);
      break;
    }

    // CLK_CONFIG: CMD=0x03, LEN=4, on/off 16-bit each (little-endian)
    case 0x03: {
      if (len != 4) { sendAck(cmd, 0x04); break; }
      uint16_t on  = (uint16_t)data[0] | ((uint16_t)data[1] << 8);
      uint16_t off = (uint16_t)data[2] | ((uint16_t)data[3] << 8);
      if (!on || !off) { sendAck(cmd, 0x04); break; }
      clkOnTime  = on;
      clkOffTime = off;
      sendAck(cmd, 0x00);
      break;
    }

    // CLK_ENABLE: CMD=0x04, LEN=1, [0]=0/1
    case 0x04: {
      if (len != 1) { sendAck(cmd, 0x04); break; }
      clkEnabled = data[0] ? true : false;
      previousClkMillis = millis();
      sendAck(cmd, 0x00);
      break;
    }

    // RESET: CMD=0x05, LEN=0
    case 0x05: {
      RESET_PINS();
      sendAck(cmd, 0x00);
      break;
    }

    // SYNC_REQUEST: CMD=0x06, LEN=0
    case 0x06: {
      sendSyncFrameBinary();
      sendAck(cmd, 0x00);
      break;
    }

    // STATUS_REQUEST: CMD=0x07, LEN=0
    case 0x07: {
      sendStatusFrameBinary();
      sendAck(cmd, 0x00);
      break;
    }

    default:
      // Unknown command
      sendAck(cmd, 0xFF);
      break;
  }
}

// ---------- Parser pump: call from loop() ----------

void pollBinaryCommands() {
  while (CMD_PORT.available()) {
    uint8_t b = CMD_PORT.read();

    switch (rxState) {
      case RX_WAIT_START:
        if (b == 0xAA) {
          rxState = RX_CMD;
        }
        break;

      case RX_CMD:
        rxCmd = b;
        rxState = RX_LEN;
        break;

      case RX_LEN:
        rxLen = b;
        if (rxLen > sizeof(rxPayload)) {
          // payload too big, drop and resync
          rxState = RX_WAIT_START;
        } else {
          rxIndex = 0;
          rxState = (rxLen == 0) ? RX_CHK : RX_PAYLOAD;
        }
        break;

      case RX_PAYLOAD:
        rxPayload[rxIndex++] = b;
        if (rxIndex >= rxLen) {
          rxState = RX_CHK;
        }
        break;

      case RX_CHK: {
        uint8_t chk = calcChecksum(rxCmd, rxLen, rxPayload);
        if (chk == b) {
          handleFrame(rxCmd, rxLen, rxPayload);
        }
        // whether valid or not, reset state
        rxState = RX_WAIT_START;
        break;
      }
    }
  }
}

// ===================== SETUP & LOOP =====================

void setup() {
#if USE_PC_SERIAL
  Serial.begin(CMD_BAUD_RATE);
#else
  NodeSerial.begin(CMD_BAUD_RATE);
#endif

  RESET_PINS();

  // Simple banner (for human debugging – you can remove)
  CMD_PORT.println("ICNODE-BINARY READY");
}

void loop() {
  // 1) Handle incoming commands
  pollBinaryCommands();

  // 2) Run clock state machine (non-blocking)
  START_CLK();

  // 3) Periodically send status frame
  unsigned long now = millis();
  if (now - previousStatusMillis >= STATUS_INTERVAL_MS) {
    previousStatusMillis = now;
    sendStatusFrameBinary();
  }
}
