# API Bridge Architecture

This document explains the new HTTP API + MQTT architecture that replaced the direct MQTT connection from the browser.

## Why the Change?

**Previous**: Browser → MQTT.js library → MQTT Broker

- Large bundle size (MQTT.js in browser)
- Security concerns (MQTT credentials in frontend)
- Limited error handling
- No central logging

**Current**: Browser → HTTP/SSE → Backend → MQTT Broker

- Smaller frontend bundle
- Backend manages MQTT credentials
- Better error handling and logging
- Easier to scale and secure

## Data Flow

### Publishing (Frontend → MQTT)

```
┌─────────┐  HTTP POST   ┌─────────┐  MQTT Publish  ┌──────────┐
│ Browser │ ───────────→ │ Backend │ ─────────────→ │  Broker  │
└─────────┘              └─────────┘                └──────────┘
            /api/pin-level
            {pin: 1, level: 1}
```

1. User interacts with UI (sets pin level)
2. Frontend calls `publishPinLevel(pin, level)`
3. Hook sends HTTP POST to `/api/pin-level`
4. Backend publishes to MQTT topic `digitalkit/pins/pin/1`
5. MQTT broker receives message

### Subscribing (MQTT → Frontend)

```
┌──────────┐  MQTT Sub    ┌─────────┐    SSE       ┌─────────┐
│  Broker  │ ───────────→ │ Backend │ ───────────→ │ Browser │
└──────────┘              └─────────┘              └─────────┘
   Topic: digitalkit/pins/pin/1         Event: pin
   Payload: "1"                         {pin: 1, level: 1}
```

1. Hardware device publishes to MQTT
2. Backend receives MQTT message
3. Backend broadcasts to all SSE clients
4. Frontend receives SSE event
5. Hook calls `pinMessageHandler`
6. UI updates automatically

## Components

### Frontend Hook: `useAPIBridge.ts`

```typescript
const {
  backendUrl, // Backend server URL
  baseTopic, // MQTT base topic
  isEnabled, // Enable/disable bridge
  status, // Connection status
  publishMetadata, // Publish IC info
  publishPinLevel, // Publish pin state
  publishPinCollections, // Publish pin groups
  setPinMessageHandler, // Handle incoming messages
} = useAPIBridge({
  defaultBackendUrl: "http://localhost:3001",
  defaultBaseTopic: "digitalkit/pins",
  autoEnable: true,
});
```

**Key Features:**

- Establishes SSE connection to backend
- Sends HTTP POST requests for publishing
- Handles reconnection automatically
- Parses incoming pin messages
- Manages client ID

### Backend Server: `server.js`

**Responsibilities:**

1. Connect to MQTT broker
2. Subscribe to `digitalkit/#`
3. Handle HTTP POST endpoints
4. Manage SSE connections
5. Broadcast MQTT messages to clients
6. Log all activity

**Key Functions:**

- `connectMQTT()` - Initialize MQTT connection
- `broadcastToClients()` - Send to all SSE clients
- `determineEventType()` - Parse message types
- `normalizeLevel()` - Convert pin values

### UI Component: `APIFloatingBar.tsx`

Floating control panel showing:

- Connection status (Idle/Connecting/Connected/Error)
- Enable/disable toggle
- Backend URL configuration
- Base topic configuration
- Client ID
- Last message received
- Error messages

## Message Types

### Metadata

```json
{
  "partNumber": "7400",
  "description": "Quad 2-input NAND gate",
  "pinCount": 14,
  "category": "logic"
}
```

Published to: `digitalkit/pins/7400`

### Pin Level

```
Topic: digitalkit/pins/pin/1
Payload: "1"
```

### Pin Collections

```json
{
  "inputs": [1, 2, 4, 5],
  "outputs": [3, 6]
}
```

Published to:

- `digitalkit/pins/inputs`
- `digitalkit/pins/outputs`

## SSE Events

### `connected`

Initial connection acknowledgment

```json
{
  "clientId": "digitalkit-abc123",
  "baseTopic": "digitalkit/pins"
}
```

### `pin`

Pin state change

```json
{
  "topic": "digitalkit/pins/pin/1",
  "payload": "1",
  "pin": 1,
  "level": 1,
  "timestamp": 1700000000000
}
```

### `metadata`

IC metadata update

```json
{
  "topic": "digitalkit/pins/7400",
  "payload": "{...}",
  "timestamp": 1700000000000
}
```

## Error Handling

### Frontend

- Connection failures → Retry with exponential backoff
- HTTP errors → Show in API panel, log to console
- SSE disconnects → Automatic reconnection
- Parse errors → Log and continue

### Backend

- MQTT disconnects → Automatic reconnection
- Publish failures → Return 500 error
- SSE client disconnects → Clean up gracefully
- Invalid data → Log warning and skip

## Configuration

### Frontend Environment

`.env.local` (optional):

```env
NEXT_PUBLIC_API_BACKEND_URL=http://localhost:3001
```

### Backend Environment

`.env`:

```env
PORT=3001
MQTT_BROKER_URL=mqtt://broker.hivemq.com:1883
```

## Testing

### Test Backend Health

```bash
curl http://localhost:3001/health
```

### Test SSE Stream

```bash
curl -N http://localhost:3001/events?clientId=test&baseTopic=digitalkit/pins
```

### Test Publishing

```bash
curl -X POST http://localhost:3001/api/pin-level \
  -H "Content-Type: application/json" \
  -d '{"baseTopic":"digitalkit/pins","pin":1,"level":1,"clientId":"test"}'
```

### Monitor MQTT

```bash
# Subscribe to all topics
mosquitto_sub -h broker.hivemq.com -t 'digitalkit/#' -v

# Publish test message
mosquitto_pub -h broker.hivemq.com -t 'digitalkit/pins/pin/1' -m '1'
```

## Deployment Considerations

### Local Development

- Backend: `cd backend && npm run dev`
- Frontend: `cd FrontEnd/digitalkit && npm run dev`
- Both on localhost

### Production

- Backend on cloud server (Railway, Render, etc.)
- Frontend on Vercel/Netlify
- Update `NEXT_PUBLIC_API_BACKEND_URL`
- Use secure MQTT broker
- Add authentication (optional)

### Scaling

- Multiple backend instances (load balance)
- Redis for shared state (if needed)
- Separate MQTT broker
- CDN for frontend static assets

## Troubleshooting

### SSE Connection Dies

**Symptom**: Frontend shows "Error" status repeatedly

**Solutions**:

1. Check backend logs for errors
2. Increase proxy timeout (nginx/Apache)
3. Verify firewall allows long-lived connections
4. Test backend `/health` endpoint

### Messages Not Received

**Symptom**: Publishing works but no events received

**Solutions**:

1. Check baseTopic matches between frontend/backend
2. Verify MQTT subscription in backend logs
3. Test MQTT broker independently
4. Check SSE event type filtering

### High Latency

**Symptom**: Slow updates

**Solutions**:

1. Use lower MQTT QoS (1 or 0)
2. Deploy backend closer to broker
3. Optimize network path
4. Check for message queuing

## Future Enhancements

Potential improvements:

- [ ] WebSocket alternative to SSE
- [ ] Authentication/authorization
- [ ] Message history/replay
- [ ] Multiple MQTT brokers
- [ ] Message transformation/filtering
- [ ] Grafana metrics integration
- [ ] Rate limiting
