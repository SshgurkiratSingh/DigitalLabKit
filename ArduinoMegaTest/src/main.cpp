#include <Arduino.h>
#include <FastLED.h>

// Forward declarations
void configurePins();
uint8_t activePinCount();
void setInputPins(const String &bits);
void handleICSelection(const String &name);
void handlePinData(const String &pinData);
void handleStatusRequest();
void processNextionMessage(const String &msg);
void handleNextion();
void updateLEDs();
String getPinStates();
void setInputPins(const String &bits);
void handleSerial();
void handleButtons();
void setupClockPin();
void generateClockPulse();
void mapClockToButton();

// Constants
const uint8_t TOTAL_PINS = 16;
const uint8_t IC_PINS[TOTAL_PINS] = {22, 24, 26, 28, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41};
const uint8_t BUTTON_PINS[8]   = {2, 3, 4, 5, 6, 7, 8, 9};
#define LEDS_PER_STRIP 3
#define NUM_STRIPS 3
#define LED_PIN_STRIP1 10
#define LED_PIN_STRIP2 11
#define LED_PIN_STRIP3 12
static CRGB strip1[LEDS_PER_STRIP];
static CRGB strip2[LEDS_PER_STRIP];
static CRGB strip3[LEDS_PER_STRIP];

// Gate types
enum GateType { AND, OR, NAND, NOR, XOR, XNOR, NOT };

// Structures
struct LogicGate {
  GateType type;
  uint8_t  inputs[4];
  uint8_t  inputCount;
  uint8_t  output;
};
struct ICPinConfig {
  uint8_t     number;
  const char *role;
  bool        isActiveLow;
};
struct ICProfile {
  const char *name;
  ICPinConfig pins[TOTAL_PINS];
  LogicGate   gates[8];
  uint8_t     gateCount;
};

// IC database
ICProfile IC_DB[] = {
  // Existing ICs...
  {"7432", {{1,"INPUT",0},{2,"INPUT",0},{3,"OUTPUT",0},{4,"INPUT",0},
            {5,"INPUT",0},{6,"OUTPUT",0},{7,"GND",0},{8,"NC",0},
            {9,"NC",0},{10,"OUTPUT",0},{11,"INPUT",0},{12,"INPUT",0},
            {13,"OUTPUT",0},{14,"INPUT",0},{15,"INPUT",0},{16,"VCC",0}},
           {{OR,{2,3},2,1},{OR,{5,6},2,4},{OR,{11,10},2,12},{OR,{14,13},2,15}},4},
  {"7404", {{1,"INPUT",0},{2,"OUTPUT",0},{3,"INPUT",0},{4,"OUTPUT",0},
            {5,"INPUT",0},{6,"OUTPUT",0},{7,"GND",0},{8,"NC",0},
            {9,"NC",0},{10,"OUTPUT",0},{11,"INPUT",0},{12,"OUTPUT",0},
            {13,"INPUT",0},{14,"INPUT",0},{15,"OUTPUT",0},{16,"VCC",0}},
           {{NOT,{1},1,2},{NOT,{3},1,4},{NOT,{5},1,6},
            {NOT,{11},1,10},{NOT,{14},1,15},{NOT,{13},1,12}},6},
  {"7400", {{1,"INPUT",0},{2,"INPUT",0},{3,"OUTPUT",0},{4,"INPUT",0},
            {5,"INPUT",0},{6,"OUTPUT",0},{7,"GND",0},{8,"NC",0},
            {9,"NC",0},{10,"OUTPUT",0},{11,"INPUT",0},{12,"INPUT",0},
            {13,"OUTPUT",0},{14,"INPUT",0},{15,"INPUT",0},{16,"VCC",0}},
           {{NAND,{1,2},2,3},{NAND,{4,5},2,6},{NAND,{11,10},2,13},{NAND,{14,15},2,12}},4},
  {"7408", {{1,"INPUT",0},{2,"INPUT",0},{3,"OUTPUT",0},{4,"INPUT",0},
            {5,"INPUT",0},{6,"OUTPUT",0},{7,"GND",0},{8,"NC",0},
            {9,"NC",0},{10,"OUTPUT",0},{11,"INPUT",0},{12,"INPUT",0},
            {13,"OUTPUT",0},{14,"INPUT",0},{15,"INPUT",0},{16,"VCC",0}},
           {{AND,{1,2},2,3},{AND,{4,5},2,6},{AND,{11,10},2,13},{AND,{14,15},2,12}},4},
  {"7486", {{1,"INPUT",0},{2,"INPUT",0},{3,"OUTPUT",0},{4,"INPUT",0},
            {5,"INPUT",0},{6,"OUTPUT",0},{7,"GND",0},{8,"NC",0},
            {9,"NC",0},{10,"OUTPUT",0},{11,"INPUT",0},{12,"INPUT",0},
            {13,"OUTPUT",0},{14,"INPUT",0},{15,"INPUT",0},{16,"VCC",0}},
           {{XOR,{1,2},2,3},{XOR,{4,5},2,6},{XOR,{11,10},2,13},{XOR,{14,15},2,12}},4},
  // New ICs:
  {"194",   {{1,"RESET",0},{2,"DSR",0},{3,"D0",0},{4,"D1",0},
             {5,"D2",0},{6,"D3",0},{7,"DSL",0},{8,"GND",0},
             {9,"S0",0},{10,"S1",0},{11,"CLOCK",0},{12,"Q3",0},
             {13,"Q2",0},{14,"Q1",0},{15,"Q0",0},{16,"VCC",0}}, {},0},
  {"7402",  {{1,"OUTPUT",0},{2,"INPUT",0},{3,"INPUT",0},{4,"OUTPUT",0},
             {5,"INPUT",0},{6,"INPUT",0},{7,"GND",0},{8,"NC",0},
             {9,"NC",0},{10,"INPUT",0},{11,"OUTPUT",0},{12,"INPUT",0},
             {13,"INPUT",0},{14,"VCC",0},{15,"NC",0},{16,"NC",0}},
            {{NOR,{2,3},2,1},{NOR,{5,6},2,4},{NOR,{12,13},2,11},{NOR,{10,9},2,8}},4},
  {"7485",  {{1,"B3",0},{2,"IA<B",0},{3,"IA=B",0},{4,"IA>B",0},
             {5,"OA>B",0},{6,"OA=B",0},{7,"OA<B",0},{8,"GND",0},
             {9,"B0",0},{10,"A0",0},{11,"B1",0},{12,"A1",0},
             {13,"A2",0},{14,"B2",0},{15,"A3",0},{16,"VCC",0}}, {},0},
  {"7473",  {{1,"CLK1",0},{2,"RST1",0},{3,"K1",0},{4,"VCC",0},
             {5,"CLK2",0},{6,"RST2",0},{7,"J2",0},{8,"Q2N",0},
             {9,"Q2",0},{10,"K2",0},{11,"GND",0},{12,"Q1",0},
             {13,"Q1N",0},{14,"J1",0},{15,"NC",0},{16,"NC",0}}, {},0},
  {"74139", {{1,"1E",0},{2,"1A0",0},{3,"1A1",0},{4,"1Y0",0},
             {5,"1Y1",0},{6,"1Y2",0},{7,"1Y3",0},{8,"GND",0},
             {9,"2Y3",0},{10,"2Y2",0},{11,"2Y1",0},{12,"2Y0",0},
             {13,"2A1",0},{14,"2A0",0},{15,"2E",0},{16,"VCC",0}}, {},0},
  {"74157", {{1,"SEL",0},{2,"1A",0},{3,"1B",0},{4,"1Y",0},
             {5,"2A",0},{6,"2B",0},{7,"2Y",0},{8,"GND",0},
             {9,"3Y",0},{10,"3B",0},{11,"3A",0},{12,"4Y",0},
             {13,"4B",0},{14,"4A",0},{15,"ENABLE",0},{16,"VCC",0}}, {},0}
};

ICProfile *currentIC = nullptr;
bool lastButtonStates[8] = {false};
uint8_t inputPinMapping[8], inputPinCount = 0;
bool clockState = false;
uint8_t clockPin = 255;

void setup() {
  Serial.begin(115200);
  Serial3.begin(9600, SERIAL_8N1);
  Serial3.setTimeout(50);
  Serial.println("IC Logic Tester with Nextion Display Ready");
  for (auto b: BUTTON_PINS) pinMode(b, INPUT_PULLUP);
  for (auto p: IC_PINS)     pinMode(p, INPUT);
  FastLED.addLeds<WS2812, LED_PIN_STRIP1, GRB>(strip1, LEDS_PER_STRIP);
  FastLED.addLeds<WS2812, LED_PIN_STRIP2, GRB>(strip2, LEDS_PER_STRIP);
  FastLED.addLeds<WS2812, LED_PIN_STRIP3, GRB>(strip3, LEDS_PER_STRIP);
  fill_solid(strip1, LEDS_PER_STRIP, CRGB::Black);
  fill_solid(strip2, LEDS_PER_STRIP, CRGB::Black);
  fill_solid(strip3, LEDS_PER_STRIP, CRGB::Black);
  FastLED.show();
  for (int i=0; i<3; i++) {
    sendToNextion("t0.txt=\"IC Tester Ready\"");
    delay(100);
  }
  Serial.println("Setup complete!");
}

void loop() {
  handleSerial();
  handleNextion();
  handleButtons();
  if (currentIC && millis() % 200 < 2) {
    String states = getPinStates();
    Serial.print("PINS:"); Serial.println(states);
    sendToNextion("PINS:" + states);
    sendToNextion("IcVisualiser.t1.txt=\"" + states + "\"");
    updateLEDs();
  }
}

// --- Configuration & Helpers ---
void configurePins() {
  if (!currentIC) return;
  for (uint8_t i=0; i<TOTAL_PINS; i++) {
    const char *r = currentIC->pins[i].role;
    if (!strcmp(r,"NC"))      pinMode(IC_PINS[i], INPUT);
    else if (!strcmp(r,"VCC")){pinMode(IC_PINS[i], OUTPUT); digitalWrite(IC_PINS[i], HIGH);}
    else if (!strcmp(r,"GND")){pinMode(IC_PINS[i], OUTPUT); digitalWrite(IC_PINS[i], LOW);}
    else if (!strcmp(r,"INPUT")) {pinMode(IC_PINS[i], OUTPUT); digitalWrite(IC_PINS[i], LOW);}
    else if (!strcmp(r,"OUTPUT")) pinMode(IC_PINS[i], INPUT);
    else if (!strcmp(r,"CLOCK")||!strcmp(r,"CLK1")||!strcmp(r,"CLK2"))
      {pinMode(IC_PINS[i], OUTPUT); digitalWrite(IC_PINS[i], LOW);}
    else pinMode(IC_PINS[i], OUTPUT), digitalWrite(IC_PINS[i], LOW);
  }
  setupClockPin();
  mapClockToButton();
  setupInputMapping();
  Serial.print("INFO:Configured "); Serial.print(currentIC->name);
  Serial.print(" ("); Serial.print(activePinCount()); Serial.println(" pins)");
}

uint8_t activePinCount() {
  if (!currentIC) return 0;
  uint8_t n=0;
  for (auto &p: currentIC->pins) if (strcmp(p.role,"NC")) n++;
  return n;
}

void setupInputMapping() {
  inputPinCount=0;
  if (!currentIC) return;
  for (uint8_t i=0; i<TOTAL_PINS && inputPinCount<8; i++)
    if (!strcmp(currentIC->pins[i].role,"INPUT"))
      inputPinMapping[inputPinCount++]=i;
}

String getPinStates() {
  String s;
  for (uint8_t i=0; i<TOTAL_PINS; i++)
    if (strcmp(currentIC->pins[i].role,"NC"))
      s += digitalRead(IC_PINS[i]) ? '1':'0';
  return s;
}

void setInputPins(const String &bits) {
  if (!currentIC || bits.length()!=activePinCount()) return;
  for (uint8_t i=0,j=0;i<TOTAL_PINS;i++) {
    if (strcmp(currentIC->pins[i].role,"NC")==0) continue;
    if (!strcmp(currentIC->pins[i].role,"INPUT")) {
      digitalWrite(IC_PINS[i], bits.charAt(j)=='1');
    }
    j++;
  }
}

// --- Clock Functions ---
void setupClockPin() {
  clockPin=255;
  if (!currentIC) return;
  for (uint8_t i=0;i<TOTAL_PINS;i++) {
    const char *r = currentIC->pins[i].role;
    if (!strcmp(r,"CLOCK")||!strcmp(r,"CLK1")||!strcmp(r,"CLK2")) {
      clockPin=i;
      pinMode(IC_PINS[i], OUTPUT);
      digitalWrite(IC_PINS[i], LOW);
      break;
    }
  }
}

void generateClockPulse() {
  if (clockPin==255||!currentIC) return;
  digitalWrite(IC_PINS[clockPin], LOW);
  delayMicroseconds(10);
  digitalWrite(IC_PINS[clockPin], HIGH);
  delayMicroseconds(10);
  digitalWrite(IC_PINS[clockPin], LOW);
  Serial.println("CLOCK:PULSE_GENERATED");
  sendToNextion("CLOCK:PULSED");
}

void mapClockToButton() {
  if (clockPin!=255 && currentIC) {
    Serial.print("INFO:Clock mapped to button 8 (Pin ");
    Serial.print(clockPin+1); Serial.println(")");
  }
}

// --- Communication & Handling ---
void sendToNextion(const String &cmd) {
  while (Serial3.available()) Serial3.read();
  Serial3.print(cmd);
  Serial3.write(0xFF); Serial3.write(0xFF); Serial3.write(0xFF);
  delay(10);
}

void handleICSelection(const String &name) {
  currentIC=nullptr;
  for (auto &ic:IC_DB) if (name==ic.name) { currentIC=&ic; break; }
  if (currentIC) {
    configurePins();
    Serial.println("IC:"+name);
    sendToNextion("t0.txt=\""+name+"\"");
  } else {
    Serial.println("ERROR: IC not found - "+name);
  }
}

void handlePinData(const String &pinData) {
  if (!currentIC || pinData.length()!=activePinCount()) return;
  setInputPins(pinData);
  Serial.println("PINS:"+pinData);
  sendToNextion("IcVisualiser.t1.txt=\""+pinData+"\"");
}

void handleStatusRequest() {
  if (!currentIC) sendToNextion("t0.txt=\"No IC Selected\"");
  else {
    String st="IC:"+String(currentIC->name)+" Pins:"+String(activePinCount())+" Gates:"+String(currentIC->gateCount);
    Serial.println("STATUS:"+st);
  }
}

void processNextionMessage(const String &msg) {
  if (msg.startsWith("IC:")) {
    handleICSelection(msg.substring(3,7));
  } else if (msg.startsWith("PINS:")) {
    handlePinData(msg.substring(5));
  } else if (msg=="CLOCK:PULSE") {
    Serial.println("CLOCK:PULSE received from Nextion");
    generateClockPulse();
  } else if (msg=="STATUS") {
    handleStatusRequest();
  }
}

void handleNextion() {
  if (!Serial3.available()) return;
  String raw=Serial3.readString();
  String clean;
  for (char c:raw) if ((c>=32&&c<=126)||c=='\n'||c=='\r') clean+=c;
  int pos=0;
  while (pos<clean.length()) {
    int nl=clean.indexOf('\n',pos);
    if (nl<0) nl=clean.length();
    String line=clean.substring(pos,nl);
    line.trim();
    if (line.length()) processNextionMessage(line);
    pos=nl+1;
  }
}

void handleSerial() {
  if (!Serial.available()) return;
  String cmd=Serial.readStringUntil('\n');
  cmd.trim();
  if (cmd.startsWith("IC:")) {
    handleICSelection(cmd.substring(3));
  } else if (cmd.startsWith("PINS:")) {
    if (!currentIC) { Serial.println("ERR:NO_IC_SELECTED"); return; }
    String b=cmd.substring(5);
    if (b.length()!=activePinCount()) { Serial.println("ERR:INVALID_PIN_LENGTH"); return; }
    for (char c:b) if (c!='0'&&c!='1'){ Serial.println("ERR:INVALID_BINARY"); return; }
    setInputPins(b);
    Serial.println("OK:PINS_SET");
    sendToNextion("PINS:"+b);
    sendToNextion("IcVisualiser.t1.txt=\""+b+"\"");
  } else if (cmd=="CLOCK:PULSE") {
    Serial.println("CLOCK:PULSE received from PC");
    generateClockPulse();
  } else if (cmd=="STATUS") {
    handleStatusRequest();
  } else if (cmd=="LIST") {
    Serial.println("AVAILABLE_ICS:");
    for (auto &ic:IC_DB) {
      Serial.print(ic.name); Serial.print(" (");
      ICProfile *tmp=currentIC; currentIC=(ICProfile*)&ic;
      Serial.print(activePinCount()); Serial.println(" pins)");
      currentIC=tmp;
    }
  } else if (cmd=="SYNC") {
    Serial.println("SYNC:OK");
  } else {
    Serial.println("ERR:INVALID_CMD");
  }
}

void handleButtons() {
  static unsigned long lastDebounce=0;
  if (millis()-lastDebounce<50) return;
  bool changed=false;
  for (uint8_t i=0;i<8;i++) {
    bool now=!digitalRead(BUTTON_PINS[i]);
    if (now!=lastButtonStates[i]) {
      lastButtonStates[i]=now; changed=true;
      if (now && currentIC) {
        if (i==7 && clockPin!=255) {
          generateClockPulse();
        } else if (i<inputPinCount) {
          uint8_t idx=inputPinMapping[i];
          bool v=!digitalRead(IC_PINS[idx]);
          digitalWrite(IC_PINS[idx], v);
          Serial.print("BUTTON:");Serial.print(i+1);
          Serial.print(" -> Pin ");Serial.print(idx+1);
          Serial.print(" = ");Serial.println(v?"HIGH":"LOW");
          String s=getPinStates();
          sendToNextion("PINS:"+s);
          sendToNextion("IcVisualiser.t1.txt=\""+s+"\"");
        }
      }
    }
  }
  if (changed) lastDebounce=millis();
}

void updateLEDs() {
  if (!currentIC) return;
  fill_solid(strip1, LEDS_PER_STRIP, CRGB::Black);
  fill_solid(strip2, LEDS_PER_STRIP, CRGB::Black);
  fill_solid(strip3, LEDS_PER_STRIP, CRGB::Black);
  for (uint8_t i=0;i<currentIC->gateCount;i++) {
    bool st=digitalRead(IC_PINS[currentIC->gates[i].output-1]);
    CRGB c=st?CRGB::Green:CRGB::Red;
    if (i<LEDS_PER_STRIP) strip1[i]=c;
    else if (i<2*LEDS_PER_STRIP) strip2[i-LEDS_PER_STRIP]=c;
    else strip3[i-2*LEDS_PER_STRIP]=c;
  }
  FastLED.show();
}
