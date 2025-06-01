# IC Testing Interface

A web-based interface for testing and controlling integrated circuits (ICs) through a serial connection.

## Features

- Direct IC selection without category navigation
- Real-time pin state visualization and control
- Serial communication with automatic reconnection
- Debug logging for serial data and actions
- Supports 14-16 pin ICs
- Automatic IC detection and configuration

## Serial Protocol

### Commands from Device to Interface

1. IC Selection:
   ```
   IC:7400
   ```
   - Automatically updates the selected IC in the interface
   - Numbers 7400-7499 are supported
   - Interface will request pin states after IC selection

2. Pin States:
   ```
   1010101010101010
   ```
   - 14-16 bit binary string
   - Each bit represents the state of a pin (1=HIGH, 0=LOW)
   - Bits are ordered from pin 1 to pin 14/16
   - No prefix needed, just raw binary data

3. Error Messages:
   ```
   ERROR:message
   ```
   - Reports errors from the device

4. Sync Response:
   ```
   SYNC:OK
   ```
   - Response to sync request from interface

### Commands from Interface to Device

1. Pin State Changes:
   ```
   1010101010101010
   ```
   - 14-16 bit binary string
   - Each bit represents desired pin state
   - Only changed bits are updated, others maintain previous state

2. Sync Request:
   ```
   SYNC
   ```
   - Sent periodically to check device connection
   - Also sent when manual sync is requested
   - Device should respond with SYNC:OK

3. Pin State Request:
   ```
   PINS?
   ```
   - Requests current pin states from device
   - Device should respond with binary pin state data

## Interface Features

1. IC Selection:
   - Direct list of all supported ICs
   - Search by part number or description
   - Automatic update when device sends IC selection

2. Pin Visualization:
   - Color-coded pin states
   - Interactive pin state control
   - Real-time updates from device

3. Debug Log:
   - Timestamps for all events
   - Color-coded message types
   - Sent and received data logging
   - Error reporting
   - Manual sync request button

4. Connection Management:
   - Automatic port detection
   - Connection status indicator
   - Automatic reconnection attempts
   - Manual connect/disconnect control

## Requirements

- Browser with Web Serial API support (Chrome, Edge, or Opera)
- Serial device configured for:
  - Baud rate: 115200
  - Data bits: 8
  - Stop bits: 1
  - No parity
  - No flow control

## Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

## Error Handling

1. Connection Errors:
   - Automatic reconnection attempts (max 3)
   - Error logging in debug panel
   - Visual connection status indicator

2. Data Validation:
   - Pin count validation (14-16 pins)
   - Binary data format validation
   - IC part number validation

3. Command Timeouts:
   - 100ms timeout for incomplete commands
   - Buffer clearing on timeout
   - Timeout events logged in debug panel