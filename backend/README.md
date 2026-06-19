# DigitalLabKit API Backend

HTTP API backend that bridges web clients to MQTT for real-time communication with hardware devices.

## Features

- **HTTP REST API**: Simple endpoints for publishing data to MQTT
- **Server-Sent Events (SSE)**: Real-time updates from MQTT to web clients
- **MQTT Bridge**: Seamless integration with MQTT broker
- **Multiple Clients**: Support for multiple concurrent web clients

## Installation

```bash
cd backend
npm install
```

## Configuration

Environment variables:

- `PORT` - Server port (default: 3001)
- `MQTT_BROKER_URL` - MQTT broker URL (default: mqtt://broker.hivemq.com:1883)

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

## API Endpoints

### Health Check

```
GET /health
```

Returns server and MQTT connection status.

### Event Stream (SSE)

```
GET /events?clientId=xxx&baseTopic=digitalkit/pins
```

Server-Sent Events stream for real-time MQTT messages.

**Query Parameters:**

- `clientId` - Unique client identifier
- `baseTopic` - Base MQTT topic to filter messages (default: digitalkit/pins)

**Events:**

- `connected` - Initial connection confirmation
- `pin` - Pin state changes
- `metadata` - IC metadata updates
- `collections` - Pin collections (inputs/outputs)
- `message` - Other messages

### Publish Metadata

```
POST /api/metadata
Content-Type: application/json

{
  "baseTopic": "digitalkit/pins",
  "topic": "digitalkit/pins/7400",
  "payload": {
    "partNumber": "7400",
    "description": "Quad 2-input NAND gate",
    "pinCount": 14
  },
  "clientId": "client-123"
}
```

### Publish Pin Level

```
POST /api/pin-level
Content-Type: application/json

{
  "baseTopic": "digitalkit/pins",
  "pin": 1,
  "level": 1,
  "clientId": "client-123"
}
```

### Publish Pin Collections

```
POST /api/pin-collections
Content-Type: application/json

{
  "baseTopic": "digitalkit/pins",
  "inputs": [1, 2, 4, 5, 9, 10, 12, 13],
  "outputs": [3, 6, 8, 11],
  "clientId": "client-123"
}
```

## Architecture

```
┌─────────────┐     HTTP/SSE      ┌─────────────┐      MQTT       ┌──────────────┐
│   Web App   │ ←────────────────→ │  Backend    │ ←──────────────→ │ MQTT Broker  │
│  (Browser)  │                    │   Server    │                  │              │
└─────────────┘                    └─────────────┘                  └──────────────┘
                                          ↕
                                   ┌─────────────┐
                                   │  Hardware   │
                                   │   Devices   │
                                   └─────────────┘
```

1. **Frontend → Backend**: HTTP POST requests to publish data
2. **Backend → MQTT**: Publishes to MQTT broker
3. **MQTT → Backend**: Receives messages from broker
4. **Backend → Frontend**: Broadcasts via SSE to all connected clients

## MQTT Topics

The backend subscribes to `digitalkit/#` and handles:

- `digitalkit/pins/pin/<number>` - Individual pin states
- `digitalkit/pins/inputs` - Input pin collections
- `digitalkit/pins/outputs` - Output pin collections
- `digitalkit/pins/<ic-name>` - IC metadata

## Error Handling

All endpoints return JSON responses:

**Success:**

```json
{
  "success": true,
  "topic": "digitalkit/pins/pin/1"
}
```

**Error:**

```json
{
  "success": false,
  "error": "MQTT not connected"
}
```

HTTP Status Codes:

- `200` - Success
- `500` - Server error
- `503` - Service unavailable (MQTT disconnected)

## Testing

Test the SSE connection:

```bash
curl -N http://localhost:3001/events?clientId=test&baseTopic=digitalkit/pins
```

Test publishing:

```bash
curl -X POST http://localhost:3001/api/pin-level \
  -H "Content-Type: application/json" \
  -d '{"baseTopic":"digitalkit/pins","pin":1,"level":1,"clientId":"test"}'
```

## Deployment

The backend can be deployed to:

- **Local**: Run on your development machine
- **Cloud**: Deploy to Heroku, Railway, Render, etc.
- **Docker**: Container-based deployment

For cloud deployment, ensure:

1. Your MQTT broker is accessible
2. Set the `MQTT_BROKER_URL` environment variable
3. Configure CORS if needed

## Troubleshooting

**MQTT connection fails:**

- Check `MQTT_BROKER_URL` is correct
- Ensure broker is accessible from server
- Check firewall/network settings

**SSE disconnects:**

- Check reverse proxy timeout settings (nginx, etc.)
- Increase timeout values for long-lived connections

**Messages not received:**

- Verify baseTopic matches MQTT topics
- Check MQTT QoS settings
- Ensure client is subscribed to correct topics
