# BLE Integration Guide

This document describes the Bluetooth Low Energy (BLE) implementation for devices that cannot connect through serial connection.

## BLE Server Implementation Requirements

The device should implement a BLE GATT server with the following characteristics:

### Service UUID: "ic-test-service"
UUID: `00000000-0000-1000-8000-00805f9b34fb`

### Characteristics

1. **IC Selection Characteristic**
   - UUID: `00000001-0000-1000-8000-00805f9b34fb`
   - Properties: Read, Write
   - Description: Used to select and identify the IC being tested
   - Format: String (IC part number, e.g., "7400")

2. **Pin States Characteristic**
   - UUID: `00000002-0000-1000-8000-00805f9b34fb`
   - Properties: Read, Write, Notify
   - Description: Represents the current state of IC pins
   - Format: Binary string (14-16 bits depending on IC)
   - Example: "1100110011001100" for 16 pins

3. **Clock Frequency Characteristic**
   - UUID: `00000003-0000-1000-8000-00805f9b34fb`
   - Properties: Write
   - Description: Sets the clock frequency for testing
   - Format: Integer (Hz)

4. **Status Characteristic**
   - UUID: `00000004-0000-1000-8000-00805f9b34fb`
   - Properties: Read, Notify
   - Description: Device status and error reporting
   - Format: String

## Communication Protocol

### IC Selection
1. Client writes IC part number to IC Selection characteristic
2. Server validates IC and responds through Status characteristic
3. Server configures pins according to IC specification

### Pin State Control
1. Client writes pin states as binary string
2. Server applies states to physical pins
3. Server notifies actual pin states through Pin States characteristic
4. Any errors are reported through Status characteristic

### Clock Control
1. Client writes desired frequency to Clock Frequency characteristic
2. Server adjusts clock generator
3. Status updates sent through Status characteristic

### Error Handling
- Invalid IC selection: Status characteristic reports "ERROR:INVALID_IC"
- Invalid pin states: Status characteristic reports "ERROR:INVALID_PIN_STATE"
- Clock frequency errors: Status characteristic reports "ERROR:INVALID_FREQUENCY"

## Security Considerations

1. Implement BLE security mode 1, level 2 (encryption, no MITM protection)
2. Use static passkey bonding
3. Implement service and characteristic permissions

## Power Management

1. Implement connection parameter updates for power optimization
2. Use notification instead of indications when possible
3. Implement power-efficient advertising intervals

## Implementation Example

```cpp
// Arduino example for BLE server implementation
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define SERVICE_UUID        "00000000-0000-1000-8000-00805f9b34fb"
#define IC_CHAR_UUID       "00000001-0000-1000-8000-00805f9b34fb"
#define PINS_CHAR_UUID     "00000002-0000-1000-8000-00805f9b34fb"
#define CLOCK_CHAR_UUID    "00000003-0000-1000-8000-00805f9b34fb"
#define STATUS_CHAR_UUID   "00000004-0000-1000-8000-00805f9b34fb"

BLEServer* pServer = NULL;
BLECharacteristic* pICCharacteristic = NULL;
BLECharacteristic* pPinsCharacteristic = NULL;
BLECharacteristic* pClockCharacteristic = NULL;
BLECharacteristic* pStatusCharacteristic = NULL;

void setup() {
  BLEDevice::init("IC-Tester");
  pServer = BLEDevice::createServer();
  
  BLEService *pService = pServer->createService(SERVICE_UUID);
  
  pICCharacteristic = pService->createCharacteristic(
    IC_CHAR_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE
  );
  
  pPinsCharacteristic = pService->createCharacteristic(
    PINS_CHAR_UUID,
    BLECharacteristic::PROPERTY_READ | 
    BLECharacteristic::PROPERTY_WRITE | 
    BLECharacteristic::PROPERTY_NOTIFY
  );
  
  pClockCharacteristic = pService->createCharacteristic(
    CLOCK_CHAR_UUID,
    BLECharacteristic::PROPERTY_WRITE
  );
  
  pStatusCharacteristic = pService->createCharacteristic(
    STATUS_CHAR_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  
  pService->start();
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->start();
}

void loop() {
  // Handle BLE events and IC testing logic
}
```

## Testing and Validation

1. Use nRF Connect or similar BLE scanner to verify service and characteristic discovery
2. Verify data format compliance
3. Test error conditions and recovery
4. Validate power consumption in different states
5. Test connection stability and recovery

## Troubleshooting

Common issues and solutions:

1. Connection drops
   - Check signal strength
   - Verify power supply stability
   - Review connection parameters

2. Data corruption
   - Verify checksum implementation
   - Check for buffer overflows
   - Validate data length

3. High latency
   - Optimize connection parameters
   - Review notification strategy
   - Check for processing bottlenecks

## References

1. Bluetooth Core Specification 5.3
2. Web Bluetooth API Documentation
3. Arduino BLE Library Documentation