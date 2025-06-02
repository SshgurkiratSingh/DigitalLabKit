#include <BluetoothSerial.h>

// Check if Bluetooth configs are enabled
#if !defined(CONFIG_BT_ENABLED) || !defined(CONFIG_BLUEDROID_ENABLED)
#error Bluetooth is not enabled! Please run `make menuconfig` to enable it
#endif

BluetoothSerial SerialBT;

// Touch pins
const int touchPins[] = {T0, T3, T4, T5};
// Commands associated with each touch pin
const String commands[] = {"IC:7400", "IC:7432", "PINS:01101101111111", "PINS:11101101111111"};

void setup() {
  // Start Serial communication
  Serial.begin(115200);
  // Start Bluetooth serial
  SerialBT.begin("ESP32_BT"); // Bluetooth device name
}

void loop() {
  // Forward data from Serial to Bluetooth
  if (Serial.available()) {
    SerialBT.write(Serial.read());
  }
  
  // Forward data from Bluetooth to Serial
  if (SerialBT.available()) {
    Serial.write(SerialBT.read()); 
  }
  
  // Read touch pins
  for (int i = 0; i < 4; i++) {
    if (touchRead(touchPins[i]) < 50) {
      Serial.println(commands[i]);
      SerialBT.println(commands[i]);
      delay(500); // Debounce delay
    }
  }
  
  delay(20); // Small delay to prevent overwhelming
}

