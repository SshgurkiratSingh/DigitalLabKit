#include <Arduino.h>

// ESP32 Safe GPIO Configuration
const uint8_t IC_PINS[14] = {4, 5, 13, 14, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27}; // Safe pins for IC connection
const uint8_t BUTTON_PINS[8] = {32, 33, 34, 35, 36, 39, 36, 39};                    // Input-only pins for buttons

struct ICPinConfig
{
  uint8_t number;
  const char *type; // VCC, GND, INPUT, OUTPUT
  bool isActiveLow;
};

struct ICProfile
{
  const char *name;
  ICPinConfig pins[14];
};

// IC Database with common logic ICs
ICProfile IC_DB[] = {
    {// 7432 Quad 2-Input OR
     "7432",
     {{1, "INPUT", false}, {2, "INPUT", false}, {3, "OUTPUT", false}, {4, "INPUT", false}, {5, "INPUT", false}, {6, "OUTPUT", false}, {7, "GND", false}, {8, "OUTPUT", false}, {9, "INPUT", false}, {10, "INPUT", false}, {11, "OUTPUT", false}, {12, "INPUT", false}, {13, "INPUT", false}, {14, "VCC", false}}},
    {// 7404 Hex Inverter
     "7404",
     {{1, "INPUT", false}, {2, "OUTPUT", false}, {3, "INPUT", false}, {4, "OUTPUT", false}, {5, "INPUT", false}, {6, "OUTPUT", false}, {7, "GND", false}, {8, "OUTPUT", false}, {9, "INPUT", false}, {10, "OUTPUT", false}, {11, "INPUT", false}, {12, "OUTPUT", false}, {13, "INPUT", false}, {14, "VCC", false}}},
    {// 7400 Quad NAND
     "7400",
     {{1, "INPUT", false}, {2, "INPUT", false}, {3, "OUTPUT", false}, {4, "INPUT", false}, {5, "INPUT", false}, {6, "OUTPUT", false}, {7, "GND", false}, {8, "OUTPUT", false}, {9, "INPUT", false}, {10, "INPUT", false}, {11, "OUTPUT", false}, {12, "INPUT", false}, {13, "INPUT", false}, {14, "VCC", false}}},
    {// 7408 Quad AND
     "7408",
     {{1, "INPUT", false}, {2, "INPUT", false}, {3, "OUTPUT", false}, {4, "INPUT", false}, {5, "INPUT", false}, {6, "OUTPUT", false}, {7, "GND", false}, {8, "OUTPUT", false}, {9, "INPUT", false}, {10, "INPUT", false}, {11, "OUTPUT", false}, {12, "INPUT", false}, {13, "INPUT", false}, {14, "VCC", false}}},
    {// 7486 Quad XOR
     "7486",
     {{1, "INPUT", false}, {2, "INPUT", false}, {3, "OUTPUT", false}, {4, "INPUT", false}, {5, "INPUT", false}, {6, "OUTPUT", false}, {7, "GND", false}, {8, "OUTPUT", false}, {9, "INPUT", false}, {10, "INPUT", false}, {11, "OUTPUT", false}, {12, "INPUT", false}, {13, "INPUT", false}, {14, "VCC", false}}},
    {// 7402 Quad NOR
     "7402",
     {{1, "OUTPUT", false}, {2, "INPUT", false}, {3, "INPUT", false}, {4, "OUTPUT", false}, {5, "INPUT", false}, {6, "INPUT", false}, {7, "GND", false}, {8, "INPUT", false}, {9, "INPUT", false}, {10, "OUTPUT", false}, {11, "INPUT", false}, {12, "INPUT", false}, {13, "OUTPUT", false}, {14, "VCC", false}}}};

ICProfile *currentIC = nullptr;
bool lastButtonStates[8] = {false};
uint8_t inputPinMapping[8]; // Maps button index to IC pin index
uint8_t inputPinCount = 0;

void setupInputMapping()
{
  inputPinCount = 0;
  if (!currentIC)
    return;

  // Map buttons to input pins only
  for (int i = 0; i < 14; i++)
  {
    if (strcmp(currentIC->pins[i].type, "INPUT") == 0 && inputPinCount < 8)
    {
      inputPinMapping[inputPinCount] = i;
      inputPinCount++;
    }
  }
}

void configurePins()
{
  if (!currentIC)
    return;

  for (int i = 0; i < 14; i++)
  {
    if (strcmp(currentIC->pins[i].type, "VCC") == 0)
    {
      pinMode(IC_PINS[i], OUTPUT);
      digitalWrite(IC_PINS[i], HIGH); // Provide 3.3V (ESP32 logic level)
    }
    else if (strcmp(currentIC->pins[i].type, "GND") == 0)
    {
      pinMode(IC_PINS[i], OUTPUT);
      digitalWrite(IC_PINS[i], LOW); // Ground
    }
    else if (strcmp(currentIC->pins[i].type, "INPUT") == 0)
    {
      pinMode(IC_PINS[i], OUTPUT);
      digitalWrite(IC_PINS[i], LOW); // Default to LOW
    }
    else if (strcmp(currentIC->pins[i].type, "OUTPUT") == 0)
    {
      if (currentIC->pins[i].isActiveLow)
        pinMode(IC_PINS[i], INPUT_PULLUP);
      else
        pinMode(IC_PINS[i], INPUT);
    }
  }

  setupInputMapping();
  Serial.print("INFO:Mapped ");
  Serial.print(inputPinCount);
  Serial.println(" input pins to buttons");
}

String getPinStates()
{
  String result = "";
  for (int i = 13; i >= 0; i--) // MSB first (pin 14 to pin 1)
  {
    bool state = digitalRead(IC_PINS[i]);
    result += state ? '1' : '0';
  }
  return result;
}

void setInputPins(String pinData)
{
  if (!currentIC || pinData.length() != 14)
    return;

  for (int i = 0; i < 14; i++)
  {
    if (strcmp(currentIC->pins[i].type, "INPUT") == 0)
    {
      bool state = pinData.charAt(13 - i) == '1'; // MSB first
      digitalWrite(IC_PINS[i], state);
    }
  }
}

void handleSerial()
{
  if (Serial.available())
  {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd.startsWith("IC:"))
    {
      String icName = cmd.substring(3);
      bool found = false;

      for (int i = 0; i < sizeof(IC_DB) / sizeof(IC_DB[0]); i++)
      {
        if (icName.equals(IC_DB[i].name))
        {
          currentIC = &IC_DB[i];
          configurePins();
          Serial.println("OK:IC_SELECTED");
          found = true;
          break;
        }
      }

      if (!found)
        Serial.println("ERR:IC_NOT_FOUND");
    }
    else if (cmd.startsWith("PINS:"))
    {
      String pinData = cmd.substring(5);
      if (pinData.length() == 14)
      {
        bool valid = true;
        for (int i = 0; i < 14; i++)
        {
          if (pinData.charAt(i) != '0' && pinData.charAt(i) != '1')
          {
            valid = false;
            break;
          }
        }

        if (!valid)
        {
          Serial.println("ERR:INVALID_BINARY");
          return;
        }

        if (currentIC)
        {
          setInputPins(pinData);
          Serial.println("OK:PINS_SET");
        }
        else
          Serial.println("ERR:NO_IC_SELECTED");
      }
      else
        Serial.println("ERR:INVALID_PIN_LENGTH");
    }
    else if (cmd == "STATUS")
    {
      if (currentIC)
      {
        Serial.print("STATUS:IC=");
        Serial.print(currentIC->name);
        Serial.print(",INPUTS=");
        Serial.println(inputPinCount);
      }
      else
        Serial.println("STATUS:NO_IC");
    }
    else if (cmd == "LIST")
    {
      Serial.println("AVAILABLE_ICS:");
      for (int i = 0; i < sizeof(IC_DB) / sizeof(IC_DB[0]); i++)
      {
        Serial.println(IC_DB[i].name);
      }
    }
    else
      Serial.println("ERR:INVALID_CMD");
  }
}

void handleButtons()
{
  static unsigned long lastDebounce = 0;
  if (millis() - lastDebounce < 50) // Debounce
    return;

  bool anyChanged = false;
  for (int i = 0; i < 8; i++)
  {
    bool currentState = !digitalRead(BUTTON_PINS[i]); // Active low (pullup)
    if (currentState != lastButtonStates[i])
    {
      lastButtonStates[i] = currentState;
      anyChanged = true;

      if (currentState && currentIC && i < inputPinCount) // Button pressed
      {
        uint8_t pinIndex = inputPinMapping[i];
        bool currentPinState = digitalRead(IC_PINS[pinIndex]);
        digitalWrite(IC_PINS[pinIndex], !currentPinState); // Toggle

        Serial.print("BTN:");
        Serial.print(i + 1);
        Serial.print(":PIN");
        Serial.print(pinIndex + 1);
        Serial.print(":");
        Serial.println(!currentPinState ? "HIGH" : "LOW");
      }
    }
  }

  if (anyChanged)
    lastDebounce = millis();
}

void setup()
{
  Serial.begin(115200);
  Serial.println("ESP32 IC Tester Ready");
  Serial.println("Commands: IC:<name>, PINS:<14bits>, STATUS, LIST");

  // Initialize button pins
  for (int i = 0; i < 8; i++)
    pinMode(BUTTON_PINS[i], INPUT_PULLUP);

  // Initialize all IC pins as input initially
  for (int i = 0; i < 14; i++)
    pinMode(IC_PINS[i], INPUT);
}

void loop()
{
  handleSerial();
  // handleButtons();

  // Send pin states periodically
  if (currentIC)
  {
    static unsigned long lastUpdate = 0;
    if (millis() - lastUpdate > 10000) // 10Hz update rate
    {
      Serial.print("PINS:");
      Serial.println(getPinStates());
      lastUpdate = millis();
    }
  }

  delay(1); // Small delay to prevent watchdog issues
}