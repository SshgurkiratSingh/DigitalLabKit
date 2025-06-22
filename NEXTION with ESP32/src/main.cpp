#include <Arduino.h>
#define NEXTION_TX 17
#define NEXTION_RX 16

HardwareSerial nextionSerial(2); // Use UART2

void setup()
{
  Serial.begin(115200);                                          // For serial monitor
  nextionSerial.begin(9600, SERIAL_8N1, NEXTION_RX, NEXTION_TX); // Nextion
}
void loop()
{
  while (nextionSerial.available())
  {
    char c = nextionSerial.read();
    Serial.write(c); // Log to monitor
  }
  // ... your other code ...
}
