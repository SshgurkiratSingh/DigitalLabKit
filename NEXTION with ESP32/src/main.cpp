#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <HardwareSerial.h>

// BLE UUIDs
#define SERVICE_UUID "00000000-0000-1000-8000-00805f9b34fb"
#define IC_CHAR_UUID "00000001-0000-1000-8000-00805f9b34fb"
#define PINS_CHAR_UUID "00000002-0000-1000-8000-00805f9b34fb"
#define CLOCK_CHAR_UUID "00000003-0000-1000-8000-00805f9b34fb"
#define STATUS_CHAR_UUID "00000004-0000-1000-8000-00805f9b34fb"

// Nextion UART Configuration
#define NEXTION_RX 16 // GPIO16 for RX (ESP32 <- Nextion TX)
#define NEXTION_TX 17 // GPIO17 for TX (ESP32 -> Nextion RX)
HardwareSerial SerialNextion(1);

// BLE Objects
BLEServer *pServer = NULL;
BLEService *pService = NULL;
BLECharacteristic *pICChar = NULL;
BLECharacteristic *pPinsChar = NULL;
BLECharacteristic *pClockChar = NULL;
BLECharacteristic *pStatusChar = NULL;

// Connection Management
bool deviceConnected = false;
bool oldDeviceConnected = false;
bool bleEnabled = false;
String currentIC = "";

class MyServerCallbacks : public BLEServerCallbacks
{
  void onConnect(BLEServer *pServer)
  {
    deviceConnected = true;
    Serial.println("BLE Device Connected");
  };

  void onDisconnect(BLEServer *pServer)
  {
    deviceConnected = false;
    Serial.println("BLE Device Disconnected");
  }
};

class PinsCharCallbacks : public BLECharacteristicCallbacks
{
  void onWrite(BLECharacteristic *pCharacteristic)
  {
    std::string value = pCharacteristic->getValue();
    if (value.length() > 0)
    {
      String pinData = String(value.c_str());
      // Forward to Nextion and Serial
      SerialNextion.print("PINS:" + pinData);
      SerialNextion.write(0xFF);
      SerialNextion.write(0xFF);
      SerialNextion.write(0xFF);
      Serial.println("PINS:" + pinData);
    }
  }
};

void sendToNextion(String command)
{
  SerialNextion.print(command);
  SerialNextion.write(0xFF);
  SerialNextion.write(0xFF);
  SerialNextion.write(0xFF);
}

void startBLEServer()
{
  BLEDevice::init("ESP32-IC-Tester");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  pService = pServer->createService(SERVICE_UUID);

  // IC Characteristic (Write Only)
  pICChar = pService->createCharacteristic(
      IC_CHAR_UUID,
      BLECharacteristic::PROPERTY_WRITE);

  // Pins Characteristic (Read/Write/Notify)
  pPinsChar = pService->createCharacteristic(
      PINS_CHAR_UUID,
      BLECharacteristic::PROPERTY_READ |
          BLECharacteristic::PROPERTY_WRITE |
          BLECharacteristic::PROPERTY_NOTIFY);
  pPinsChar->setCallbacks(new PinsCharCallbacks());
  pPinsChar->addDescriptor(new BLE2902());

  // Clock Characteristic (Read/Write)
  pClockChar = pService->createCharacteristic(
      CLOCK_CHAR_UUID,
      BLECharacteristic::PROPERTY_READ |
          BLECharacteristic::PROPERTY_WRITE);

  // Status Characteristic (Notify Only)
  pStatusChar = pService->createCharacteristic(
      STATUS_CHAR_UUID,
      BLECharacteristic::PROPERTY_NOTIFY);
  pStatusChar->addDescriptor(new BLE2902());

  pService->start();
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  bleEnabled = true;
  Serial.println("BLE Server Started");
}

void stopBLEServer()
{
  if (deviceConnected)
  {
    pServer->disconnect(deviceConnected ? pServer->getConnId() : 0);
  }
  BLEDevice::deinit();
  bleEnabled = false;
  Serial.println("BLE Server Stopped");
}

void setup()
{
  Serial.begin(115200);
  SerialNextion.begin(9600, SERIAL_8N1, NEXTION_RX, NEXTION_TX);
  Serial.println("Device Initialized");
}

void loop()
{
  // Handle Nextion UART
  if (SerialNextion.available())
  {
    String msg = SerialNextion.readStringUntil('\n');
    msg.trim();

    if (msg == "BLE:ON" && !bleEnabled)
    {
      startBLEServer();
    }
    else if (msg == "BLE:OFF" && bleEnabled)
    {
      stopBLEServer();
    }
    else if (msg.startsWith("IC:"))
    {
      currentIC = msg.substring(3);
      Serial.println("IC:" + currentIC);
      sendToNextion("t0.txt=\"" + currentIC + "\"");

      // Update BLE if connected
      if (bleEnabled && deviceConnected)
      {
        pICChar->setValue(currentIC.c_str());
      }
    }
    else if (msg.startsWith("PINS:"))
    {
      // Forward to BLE and Serial
      String pinData = msg.substring(5);
      if (bleEnabled && deviceConnected)
      {
        pPinsChar->setValue(pinData.c_str());
        pPinsChar->notify();
      }
      Serial.println(msg);

      // Update IcVisualiser
      String binary = "";
      for (int i = 0; i < pinData.length(); i++)
      {
        if (pinData.charAt(i) == '1')
        {
          binary += "1";
        }
        else
        {
          binary += "0";
        }
      }
      sendToNextion("IcVisualiser.t1.txt=\"" + binary + "\"");
    }
    else if (msg.startsWith("CLOCK:PULSE"))
    {
      // Forward to BLE
      if (bleEnabled && deviceConnected)
      {
        pClockChar->setValue(msg.c_str());
        pClockChar->notify();
      }
      Serial.println(msg);
    }
    else if (msg.startsWith("RESTART"))
    {
      // Forward to BLE
      if (bleEnabled && deviceConnected)
      {
        pClockChar->setValue(msg.c_str());
        pClockChar->notify();
      }
      Serial.println(msg);
    }
  }

  // Handle USB Serial
  if (Serial.available())
  {
    String msg = Serial.readStringUntil('\n');
    msg.trim();

    if (msg.startsWith("IC:"))
    {
      currentIC = msg.substring(3);
      Serial.println("IC:" + currentIC);

      // Update Nextion and BLE
      sendToNextion("t0.txt=\"" + currentIC + "\"");
      if (bleEnabled && deviceConnected)
      {
        pICChar->setValue(currentIC.c_str());
      }
    }
    else if (msg.startsWith("PINS:"))
    {
      // Forward to Nextion and BLE
      sendToNextion(msg);
      if (bleEnabled && deviceConnected)
      {
        String pinData = msg.substring(5);
        pPinsChar->setValue(pinData.c_str());
        pPinsChar->notify();
      }
    }
  }

  // Handle BLE Connection Status
  if (!deviceConnected && oldDeviceConnected)
  {
    delay(500);
    pServer->startAdvertising();
    oldDeviceConnected = deviceConnected;
  }
  if (deviceConnected && !oldDeviceConnected)
  {
    oldDeviceConnected = deviceConnected;
  }

  // Send status updates to BLE (every 5 seconds)
  static unsigned long lastStatusUpdate = 0;
  if (bleEnabled && deviceConnected && millis() - lastStatusUpdate >= 5000)
  {
    const char *status = "STATUS:OK";
    pStatusChar->setValue(status);
    pStatusChar->notify();
    lastStatusUpdate = millis();
  }

  delay(10);
}