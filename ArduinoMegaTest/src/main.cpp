#include <Arduino.h>

// Arduino Mega GPIO Configuration
const uint8_t IC_PINS[14] = {22, 24, 26, 28, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39};
const uint8_t BUTTON_PINS[8] = {2, 3, 4, 5, 6, 7, 8, 9};

// Logic gate types
enum GateType { AND, OR, NAND, NOR, XOR, XNOR, NOT, BUFFER };

struct LogicGate {
  GateType type;
  uint8_t inputs[4]; // Input pin numbers (0 = unused)
  uint8_t inputCount; // Number of inputs for this gate
  uint8_t output; // Output pin number
};

struct ICPinConfig {
  uint8_t number;
  const char *type; // VCC, GND, INPUT, OUTPUT
  bool isActiveLow;
};

struct ICProfile {
  const char *name;
  ICPinConfig pins[14];
  LogicGate gates[6]; // Max 6 gates per IC (like hex inverter)
  uint8_t gateCount;
};

// Logic function lookup table
bool (*logicFunctions[])(bool*, uint8_t) = {
  // AND
  [AND] = [](bool* inputs, uint8_t count) -> bool {
    for(uint8_t i = 0; i < count; i++) {
      if(!inputs[i]) return false;
    }
    return true;
  },
  
  // OR  
  [OR] = [](bool* inputs, uint8_t count) -> bool {
    for(uint8_t i = 0; i < count; i++) {
      if(inputs[i]) return true;
    }
    return false;
  },
  
  // NAND
  [NAND] = [](bool* inputs, uint8_t count) -> bool {
    for(uint8_t i = 0; i < count; i++) {
      if(!inputs[i]) return true;
    }
    return false;
  },
  
  // NOR
  [NOR] = [](bool* inputs, uint8_t count) -> bool {
    for(uint8_t i = 0; i < count; i++) {
      if(inputs[i]) return false;
    }
    return true;
  },
  
  // XOR
  [XOR] = [](bool* inputs, uint8_t count) -> bool {
    bool result = inputs[0];
    for(uint8_t i = 1; i < count; i++) {
      result ^= inputs[i];
    }
    return result;
  },
  
  // XNOR
  [XNOR] = [](bool* inputs, uint8_t count) -> bool {
    bool result = inputs[0];
    for(uint8_t i = 1; i < count; i++) {
      result ^= inputs[i];
    }
    return !result;
  },
  
  // NOT
  [NOT] = [](bool* inputs, uint8_t count) -> bool {
    return !inputs[0];
  },
  
  // BUFFER
  [BUFFER] = [](bool* inputs, uint8_t count) -> bool {
    return inputs[0];
  }
};

// IC Database with gate definitions
ICProfile IC_DB[] = {
  // 7432 Quad 2-Input OR
  {"7432", 
   {{1,"OUTPUT",false},{2,"INPUT",false},{3,"INPUT",false},{4,"OUTPUT",false},{5,"INPUT",false},{6,"INPUT",false},{7,"GND",false},{8,"INPUT",false},{9,"INPUT",false},{10,"OUTPUT",false},{11,"INPUT",false},{12,"INPUT",false},{13,"OUTPUT",false},{14,"VCC",false}},
   {{OR,{1,2},2,3}, {OR,{4,5},2,6}, {OR,{9,10},2,8}, {OR,{12,13},2,11}}, 4},

  // 7404 Hex Inverter  
  {"7404",
   {{1,"INPUT",false},{2,"OUTPUT",false},{3,"INPUT",false},{4,"OUTPUT",false},{5,"INPUT",false},{6,"OUTPUT",false},{7,"GND",false},{8,"OUTPUT",false},{9,"INPUT",false},{10,"OUTPUT",false},{11,"INPUT",false},{12,"OUTPUT",false},{13,"INPUT",false},{14,"VCC",false}},
   {{NOT,{1},1,2}, {NOT,{3},1,4}, {NOT,{5},1,6}, {NOT,{9},1,8}, {NOT,{11},1,10}, {NOT,{13},1,12}}, 6},

  // 7400 Quad NAND
  {"7400",
   {{1,"INPUT",false},{2,"INPUT",false},{3,"OUTPUT",false},{4,"INPUT",false},{5,"INPUT",false},{6,"OUTPUT",false},{7,"GND",false},{8,"OUTPUT",false},{9,"INPUT",false},{10,"INPUT",false},{11,"OUTPUT",false},{12,"INPUT",false},{13,"INPUT",false},{14,"VCC",false}},
   {{NAND,{1,2},2,3}, {NAND,{4,5},2,6}, {NAND,{9,10},2,8}, {NAND,{12,13},2,11}}, 4},

  // 7408 Quad AND
  {"7408",
   {{1,"INPUT",false},{2,"INPUT",false},{3,"OUTPUT",false},{4,"INPUT",false},{5,"INPUT",false},{6,"OUTPUT",false},{7,"GND",false},{8,"OUTPUT",false},{9,"INPUT",false},{10,"INPUT",false},{11,"OUTPUT",false},{12,"INPUT",false},{13,"INPUT",false},{14,"VCC",false}},
   {{AND,{1,2},2,3}, {AND,{4,5},2,6}, {AND,{9,10},2,8}, {AND,{12,13},2,11}}, 4},

  // 7486 Quad XOR
  {"7486",
   {{1,"INPUT",false},{2,"INPUT",false},{3,"OUTPUT",false},{4,"INPUT",false},{5,"INPUT",false},{6,"OUTPUT",false},{7,"GND",false},{8,"OUTPUT",false},{9,"INPUT",false},{10,"INPUT",false},{11,"OUTPUT",false},{12,"INPUT",false},{13,"INPUT",false},{14,"VCC",false}},
   {{XOR,{1,2},2,3}, {XOR,{4,5},2,6}, {XOR,{9,10},2,8}, {XOR,{12,13},2,11}}, 4},

  // 7402 Quad NOR - CORRECTED
  {"7402",
   {{1,"OUTPUT",false},{2,"INPUT",false},{3,"INPUT",false},{4,"OUTPUT",false},{5,"INPUT",false},{6,"INPUT",false},{7,"GND",false},{8,"INPUT",false},{9,"INPUT",false},{10,"OUTPUT",false},{11,"INPUT",false},{12,"INPUT",false},{13,"OUTPUT",false},{14,"VCC",false}},
   {{NOR,{2,3},2,1}, {NOR,{5,6},2,4}, {NOR,{8,9},2,10}, {NOR,{11,12},2,13}}, 4},
};

ICProfile *currentIC = nullptr;
bool lastButtonStates[8] = {false};
uint8_t inputPinMapping[8];
uint8_t inputPinCount = 0;

void setupInputMapping() {
  inputPinCount = 0;
  if (!currentIC) return;

  for (int i = 0; i < 14; i++) {
    if (strcmp(currentIC->pins[i].type, "INPUT") == 0 && inputPinCount < 8) {
      inputPinMapping[inputPinCount] = i;
      inputPinCount++;
    }
  }
}

// Generic logic gate calculator
void updateLogicOutputs() {
  if (!currentIC) return;
  
  // Process each gate in the current IC
  for (uint8_t g = 0; g < currentIC->gateCount; g++) {
    LogicGate* gate = &currentIC->gates[g];
    bool inputs[4];
    
    // Read input values for this gate
    for (uint8_t i = 0; i < gate->inputCount; i++) {
      uint8_t pinNum = gate->inputs[i];
      inputs[i] = digitalRead(IC_PINS[pinNum - 1]); // Convert to 0-based index
    }
    
    // Calculate output using function pointer
    bool output = logicFunctions[gate->type](inputs, gate->inputCount);
    
    // Set the output pin
    digitalWrite(IC_PINS[gate->output - 1], output); // Convert to 0-based index
  }
}

void configurePins() {
  if (!currentIC) return;

  for (int i = 0; i < 14; i++) {
    if (strcmp(currentIC->pins[i].type, "VCC") == 0) {
      pinMode(IC_PINS[i], OUTPUT);
      digitalWrite(IC_PINS[i], HIGH);
    } else if (strcmp(currentIC->pins[i].type, "GND") == 0) {
      pinMode(IC_PINS[i], OUTPUT);
      digitalWrite(IC_PINS[i], LOW);
    } else if (strcmp(currentIC->pins[i].type, "INPUT") == 0) {
      pinMode(IC_PINS[i], OUTPUT);
      digitalWrite(IC_PINS[i], LOW);
    } else if (strcmp(currentIC->pins[i].type, "OUTPUT") == 0) {
      pinMode(IC_PINS[i], OUTPUT);
      digitalWrite(IC_PINS[i], LOW);
    }
  }

  setupInputMapping();
  updateLogicOutputs(); // Calculate initial outputs
  Serial.print("INFO:Configured ");
  Serial.print(currentIC->name);
  Serial.print(" with ");
  Serial.print(currentIC->gateCount);
  Serial.print(" gates, ");
  Serial.print(inputPinCount);
  Serial.println(" input pins mapped to buttons");
}

String getPinStates() {
  String result = "";
  for (int i = 0; i < 14; i++) {
    bool state = digitalRead(IC_PINS[i]);
    result += (state ? '1' : '0');
  }
  return result;
}

void setInputPins(String pinData) {
  if (!currentIC || pinData.length() != 14) return;

  for (int i = 0; i < 14; i++) {
    if (strcmp(currentIC->pins[i].type, "INPUT") == 0) {
      bool state = pinData.charAt(i) == '1';
      digitalWrite(IC_PINS[i], state);
    }
  }
  
  updateLogicOutputs();
}

void handleSerial() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd.startsWith("IC:")) {
      String icName = cmd.substring(3);
      bool found = false;

      for (int i = 0; i < sizeof(IC_DB) / sizeof(IC_DB[0]); i++) {
        if (icName.equals(IC_DB[i].name)) {
          currentIC = &IC_DB[i];
          configurePins();
          Serial.println("OK:IC_SELECTED");
          found = true;
          break;
        }
      }

      if (!found)
        Serial.println("ERR:IC_NOT_FOUND");

    } else if (cmd.startsWith("PINS:")) {
      String pinData = cmd.substring(5);
      if (pinData.length() == 14) {
        bool valid = true;
        for (int i = 0; i < 14; i++) {
          if (pinData.charAt(i) != '0' && pinData.charAt(i) != '1') {
            valid = false;
            break;
          }
        }

        if (!valid) {
          Serial.println("ERR:INVALID_BINARY");
          return;
        }

        if (currentIC) {
          setInputPins(pinData);
          Serial.println("OK:PINS_SET");
        } else {
          Serial.println("ERR:NO_IC_SELECTED");
        }
      } else {
        Serial.println("ERR:INVALID_PIN_LENGTH");
      }

    } else if (cmd == "STATUS") {
      if (currentIC) {
        Serial.print("STATUS:IC=");
        Serial.print(currentIC->name);
        Serial.print(",GATES=");
        Serial.print(currentIC->gateCount);
        Serial.print(",INPUTS=");
        Serial.println(inputPinCount);
      } else {
        Serial.println("STATUS:NO_IC");
      }

    } else if (cmd == "LIST") {
      Serial.println("AVAILABLE_ICS:");
      for (int i = 0; i < sizeof(IC_DB) / sizeof(IC_DB[0]); i++) {
        Serial.print(IC_DB[i].name);
        Serial.print(" (");
        Serial.print(IC_DB[i].gateCount);
        Serial.println(" gates)");
      }

    } else if (cmd == "SYNC") {
      Serial.println("SYNC:OK");

    } else {
      Serial.println("ERR:INVALID_CMD");
    }
  }
}

void handleButtons() {
  static unsigned long lastDebounce = 0;
  if (millis() - lastDebounce < 50) return;

  bool anyChanged = false;
  for (int i = 0; i < 8; i++) {
    bool currentState = !digitalRead(BUTTON_PINS[i]);
    if (currentState != lastButtonStates[i]) {
      lastButtonStates[i] = currentState;
      anyChanged = true;

      if (currentState && currentIC && i < inputPinCount) {
        uint8_t pinIndex = inputPinMapping[i];
        bool currentPinState = digitalRead(IC_PINS[pinIndex]);
        digitalWrite(IC_PINS[pinIndex], !currentPinState);
        
        updateLogicOutputs();
        
        Serial.print("BUTTON:");
        Serial.print(i + 1);
        Serial.print(" -> Pin ");
        Serial.print(pinIndex + 1);
        Serial.print(" = ");
        Serial.println(!currentPinState ? "HIGH" : "LOW");
      }
    }
  }

  if (anyChanged) lastDebounce = millis();
}

void setup() {
  Serial.begin(115200);
  Serial.println("IC Logic Tester Ready");
  Serial.println("Commands: IC:<name>, PINS:<14bits>, STATUS, LIST, SYNC");

  for (int i = 0; i < 8; i++)
    pinMode(BUTTON_PINS[i], INPUT_PULLUP);

  for (int i = 0; i < 14; i++)
    pinMode(IC_PINS[i], INPUT);
}

void loop() {
  handleSerial();
  handleButtons();

  if (currentIC) {
    static unsigned long lastUpdate = 0;
    if (millis() - lastUpdate > 1000) {
      Serial.print("PINS:");
      Serial.println(getPinStates());
      lastUpdate = millis();
    }
  }

  delay(1);
}
