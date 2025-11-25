# MQTT Topics Documentation

This document describes all MQTT topics used in the DigitalLabKit system for IC testing and hardware communication.

## Overview

The system uses MQTT as a message bus for communication between:

- Hardware clients (connected to physical testing board via Web Serial)
- Monitor clients (viewing real-time data without hardware)
- Backend server (MQTT bridge and message storage)

**Broker:** `ws://98.93.38.49:9001/mqtt` (WebSocket MQTT)

## Topic Hierarchy

```
digitalkit/
├── pins/
│   ├── <ic-slug>/                  (IC-specific metadata)
│   ├── inputs                       (Input pin collection)
│   ├── outputs                      (Output pin collection)
│   └── pin/
│       ├── 1                        (Individual pin states)
│       ├── 2
│       ├── 3
│       └── ...
```

---

## Topic Details

### 1. IC Metadata Topic

**Topic Pattern:** `digitalkit/pins/<ic-slug>`

**Purpose:** Publishes IC configuration and metadata when an IC is selected

**Message Format:** JSON string

**QoS:** 1 (at least once)

**Retained:** Yes

**Example Topic:**

```
digitalkit/pins/7402-quad-2-input-nor-gate
```

**Example Payload:**

```json
{
  "partNumber": "7402",
  "description": "Quad 2-Input NOR Gate",
  "pinCount": 14,
  "category": "LOGIC_GATE",
  "icName": "7402",
  "slug": "7402-quad-2-input-nor-gate",
  "publishedAt": 1732550425123,
  "inputPins": [2, 3, 5, 6, 8, 9, 11, 12],
  "outputPins": [1, 4, 10, 13],
  "powerPins": {
    "vcc": 14,
    "gnd": 7
  },
  "clockPins": []
}
```

**Fields:**

- `partNumber` (string): IC part number (e.g., "7402", "555", "4017")
- `description` (string): Human-readable description
- `pinCount` (number): Total number of pins on the IC
- `category` (string): IC category (e.g., "LOGIC_GATE", "TIMER", "COUNTER")
- `icName` (string): Name of the IC
- `slug` (string): URL-safe identifier (auto-generated)
- `publishedAt` (number): Unix timestamp in milliseconds
- `inputPins` (array): Pin numbers designated as inputs
- `outputPins` (array): Pin numbers designated as outputs
- `powerPins` (object): VCC and GND pin numbers
- `clockPins` (array): Pin numbers designated as clock inputs

---

### 2. Input Pins Collection

**Topic:** `digitalkit/pins/inputs`

**Purpose:** Publishes array of all input pin numbers for the selected IC

**Message Format:** JSON array

**QoS:** 1

**Retained:** Yes

**Example Payload:**

```json
[2, 3, 5, 6, 8, 9, 11, 12]
```

**Notes:**

- Input pins can be driven by the testing hardware
- Typically includes data inputs and control signals
- Does not include power pins (VCC/GND)

---

### 3. Output Pins Collection

**Topic:** `digitalkit/pins/outputs`

**Purpose:** Publishes array of all output pin numbers for the selected IC

**Message Format:** JSON array

**QoS:** 1

**Retained:** Yes

**Example Payload:**

```json
[1, 4, 10, 13]
```

**Notes:**

- Output pins are read-only (sensed by testing hardware)
- Cannot be directly driven by the testing board
- Represent the IC's response to input conditions

---

### 4. Individual Pin State

**Topic Pattern:** `digitalkit/pins/pin/<pin-number>`

**Purpose:** Real-time state updates for individual pins

**Message Format:** String

**QoS:** 1

**Retained:** Yes

**Update Frequency:** As pins change state (typically <100ms intervals)

**Example Topics:**

```
digitalkit/pins/pin/1
digitalkit/pins/pin/2
digitalkit/pins/pin/14
```

**Example Payloads:**

```
0        # Pin is LOW
1        # Pin is HIGH
HIGH     # Alternative format (normalized to 1)
LOW      # Alternative format (normalized to 0)
```

**Valid Values:**

- `0`, `"0"`, `"LOW"`, `"low"`, `"false"`, `"off"` → Normalized to **0**
- `1`, `"1"`, `"HIGH"`, `"high"`, `"true"`, `"on"` → Normalized to **1**

**Notes:**

- Published whenever pin state changes
- Can be triggered by:
  - Hardware input changes
  - User toggling pins in UI
  - Truth table row application
  - MQTT commands from other clients

---

## Message Flow Examples

### Example 1: IC Selection and Configuration

1. **User selects IC "7402" in workspace**

2. **System publishes metadata:**

   ```
   Topic: digitalkit/pins/7402-quad-2-input-nor-gate
   Payload: {"partNumber":"7402","description":"Quad 2-Input NOR Gate",...}
   ```

3. **System publishes pin collections:**

   ```
   Topic: digitalkit/pins/inputs
   Payload: [2,3,5,6,8,9,11,12]

   Topic: digitalkit/pins/outputs
   Payload: [1,4,10,13]
   ```

### Example 2: Pin State Changes

1. **User toggles input pin 2 to HIGH:**

   ```
   Topic: digitalkit/pins/pin/2
   Payload: 1
   ```

2. **IC responds, output pin 1 changes to LOW:**

   ```
   Topic: digitalkit/pins/pin/1
   Payload: 0
   ```

3. **All connected clients receive updates in real-time**

### Example 3: Truth Table Application

1. **User applies truth table row: inputs=[1,0,1,1], outputs=[0,1]**

2. **System publishes input changes:**

   ```
   Topic: digitalkit/pins/pin/2
   Payload: 1

   Topic: digitalkit/pins/pin/3
   Payload: 0

   Topic: digitalkit/pins/pin/5
   Payload: 1

   Topic: digitalkit/pins/pin/6
   Payload: 1
   ```

3. **Hardware reads IC outputs and publishes:**

   ```
   Topic: digitalkit/pins/pin/1
   Payload: 0

   Topic: digitalkit/pins/pin/4
   Payload: 1
   ```

---

## Backend API Integration

### Polling Endpoint

**GET** `/api/messages?since=<timestamp>&baseTopic=digitalkit/pins`

**Response:**

```json
{
  "messages": [
    {
      "event": "pin",
      "data": {
        "topic": "digitalkit/pins/pin/5",
        "payload": "1",
        "timestamp": 1732550425123,
        "pin": 5,
        "level": 1
      }
    },
    {
      "event": "metadata",
      "data": {
        "topic": "digitalkit/pins/7402-quad-2-input-nor-gate",
        "payload": "{\"partNumber\":\"7402\",...}",
        "timestamp": 1732550420000
      }
    },
    {
      "event": "collections",
      "data": {
        "topic": "digitalkit/pins/inputs",
        "payload": "[2,3,5,6,8,9,11,12]",
        "timestamp": 1732550420100
      }
    }
  ],
  "serverTime": 1732550425500,
  "mqtt": "connected"
}
```

### Server-Sent Events (SSE)

**GET** `/events?clientId=<id>&baseTopic=digitalkit/pins`

**Event Types:**

- `connected` - Initial connection established
- `pin` - Pin state update
- `metadata` - IC metadata update
- `collections` - Pin collection update

**Example SSE Stream:**

```
event: connected
data: {"clientId":"client-abc123","baseTopic":"digitalkit/pins"}

event: pin
data: {"topic":"digitalkit/pins/pin/5","payload":"1","timestamp":1732550425123,"pin":5,"level":1}

event: metadata
data: {"topic":"digitalkit/pins/7402","payload":"{...}","timestamp":1732550420000}
```

---

## Publishing via API

### Publish Metadata

**POST** `/api/metadata`

**Request Body:**

```json
{
  "baseTopic": "digitalkit/pins",
  "topic": "digitalkit/pins/7402-quad-2-input-nor-gate",
  "payload": {
    "partNumber": "7402",
    "description": "Quad 2-Input NOR Gate",
    "pinCount": 14,
    "category": "LOGIC_GATE",
    "inputPins": [2, 3, 5, 6, 8, 9, 11, 12],
    "outputPins": [1, 4, 10, 13],
    "powerPins": { "vcc": 14, "gnd": 7 }
  }
}
```

### Publish Pin Level

**POST** `/api/pin-level`

**Request Body:**

```json
{
  "baseTopic": "digitalkit/pins",
  "pin": 5,
  "level": 1
}
```

### Publish Pin Collections

**POST** `/api/pin-collections`

**Request Body:**

```json
{
  "baseTopic": "digitalkit/pins",
  "inputs": [2, 3, 5, 6, 8, 9, 11, 12],
  "outputs": [1, 4, 10, 13]
}
```

---

## Client Implementation Examples

### JavaScript/TypeScript (Browser)

```typescript
// Subscribe to all pin updates
const backendUrl = "http://localhost:3001";
const eventSource = new EventSource(
  `${backendUrl}/events?baseTopic=digitalkit/pins`
);

eventSource.addEventListener("pin", (event) => {
  const data = JSON.parse(event.data);
  console.log(`Pin ${data.pin} changed to ${data.level}`);
  // Update UI with new pin state
  updatePinDisplay(data.pin, data.level);
});

eventSource.addEventListener("metadata", (event) => {
  const data = JSON.parse(event.data);
  const metadata = JSON.parse(data.payload);
  console.log("IC loaded:", metadata.partNumber);
  // Update UI with IC info
  displayICInfo(metadata);
});
```

### Polling Example

```typescript
let lastPollTimestamp = Date.now();

setInterval(async () => {
  const response = await fetch(
    `${backendUrl}/api/messages?since=${lastPollTimestamp}&baseTopic=digitalkit/pins`
  );
  const data = await response.json();

  if (data.messages.length > 0) {
    data.messages.forEach((msg) => {
      if (msg.event === "pin") {
        updatePinDisplay(msg.data.pin, msg.data.level);
      }
    });
  }

  lastPollTimestamp = data.serverTime;
}, 2000); // Poll every 2 seconds
```

### Publishing Pin Changes

```typescript
async function setPin(pin: number, level: 0 | 1) {
  const response = await fetch(`${backendUrl}/api/pin-level`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseTopic: "digitalkit/pins",
      pin,
      level,
    }),
  });

  const result = await response.json();
  if (result.success) {
    console.log(`Pin ${pin} set to ${level}`);
  }
}
```

---

## Topic Naming Conventions

1. **IC Slugs:** Generated from IC name using lowercase, hyphen-separated format

   - `7402` → `7402-quad-2-input-nor-gate`
   - `555` → `555-timer`
   - `CD4017` → `cd4017-decade-counter`

2. **Pin Numbers:** Always use physical pin numbers (1-indexed)

   - Not zero-indexed
   - Match IC datasheet pin numbering

3. **Base Topic:** Configurable but defaults to `digitalkit/pins`
   - Can be changed per session
   - All messages use the same base topic within a session

---

## Performance Characteristics

- **Latency:** <100ms from hardware to MQTT to clients
- **Message Rate:** Up to 100 messages/second per topic
- **Retention:** Last message retained on broker
- **History:** Backend stores last 100 messages for polling clients
- **SSE:** Real-time push for low latency
- **Polling:** 500ms-10000ms configurable interval as fallback

---

## Troubleshooting

### No Pin Updates Received

1. **Check backend connection:**

   ```bash
   curl http://localhost:3001/health
   ```

2. **Verify MQTT broker connectivity:**

   - Backend should log "Connected to MQTT broker"
   - Check broker URL: `ws://98.93.38.49:9001/mqtt`

3. **Check topic subscription:**
   - Backend subscribes to `digitalkit/#`
   - Verify messages are being published to correct base topic

### Stale Data

- Check `retain: true` flag on critical messages (metadata, collections)
- New clients receive last retained message immediately
- Pin states are retained so monitors always show current state

### Duplicate Messages

- System uses 1-second post-publish delay before polling
- MQTT echo window prevents hardware loops (800ms)
- Check client deduplication logic using timestamps

---

## Security Notes

⚠️ **Current Implementation:** No authentication (development only)

**For Production:**

- Add MQTT broker authentication (username/password)
- Implement JWT tokens for HTTP API
- Use TLS/WSS for encrypted transport
- Restrict CORS origins
- Add rate limiting on API endpoints

---

## Related Documentation

- [API Bridge Architecture](FrontEnd/digitalkit/API_BRIDGE_ARCHITECTURE.md)
- [Backend Server Setup](backend/README.md)
- [Hardware Serial Protocol](FrontEnd/digitalkit/app/v2/hooks/useSerialProtocol.ts)
