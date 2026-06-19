# API Proxy Architecture Diagram

## Request Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                       │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  useAPIBridge Hook                                       │   │
│  │  - publishMetadata()                                     │   │
│  │  - publishPinLevel()                                     │   │
│  │  - publishPinCollections()                               │   │
│  │  - pollForUpdates()                                      │   │
│  │  - connectEventStream()                                  │   │
│  └────────────────┬────────────────────────────────────────┘   │
│                   │                                              │
│                   │ HTTP POST/GET                                │
│                   ▼                                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Next.js API Routes (Proxy)                             │   │
│  │                                                           │   │
│  │  POST /api/proxy/api/metadata                           │   │
│  │  POST /api/proxy/api/pin-level                          │   │
│  │  POST /api/proxy/api/pin-collections                    │   │
│  │  GET  /api/proxy/api/messages?since=...                 │   │
│  │  GET  /api/events (SSE stream)                          │   │
│  └────────────────┬────────────────────────────────────────┘   │
│                   │                                              │
└───────────────────┼──────────────────────────────────────────────┘
                    │
                    │ HTTP (Server-Side)
                    │ BACKEND_API_URL (env variable)
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Express + MQTT.js)                   │
│                    http://localhost:3001                         │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Express Routes                                          │   │
│  │                                                           │   │
│  │  POST /api/metadata       → Publish to MQTT             │   │
│  │  POST /api/pin-level      → Publish to MQTT             │   │
│  │  POST /api/pin-collections → Publish to MQTT            │   │
│  │  GET  /api/messages       → Return cached messages      │   │
│  │  GET  /events             → SSE stream (MQTT updates)   │   │
│  └────────────────┬────────────────────────────────────────┘   │
│                   │                                              │
│                   │ MQTT.js Client                               │
│                   ▼                                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  MQTT Connection                                         │   │
│  │  - Subscribe: digitalkit/#                               │   │
│  │  - Publish: digitalkit/pins/*                            │   │
│  │  - QoS 1, Retained messages                              │   │
│  └────────────────┬────────────────────────────────────────┘   │
│                   │                                              │
└───────────────────┼──────────────────────────────────────────────┘
                    │
                    │ MQTT Protocol (WebSocket)
                    │ ws://98.93.38.49:9001/mqtt
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                       MQTT BROKER                                │
│                   ws://98.93.38.49:9001/mqtt                     │
│                                                                   │
│  Topics:                                                         │
│  - digitalkit/pins/metadata                                      │
│  - digitalkit/pins/pin/{number}                                  │
│  - digitalkit/pins/inputs                                        │
│  - digitalkit/pins/outputs                                       │
│  - digitalkit/pins/{ic-slug}                                     │
└───────────────────┬──────────────────────────────────────────────┘
                    │
                    │ MQTT Protocol
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                          HARDWARE                                │
│                     (ESP32/Arduino)                              │
│                                                                   │
│  - Subscribes to digitalkit/pins/*                              │
│  - Publishes pin state changes                                  │
│  - Processes IC testing commands                                │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Examples

### Example 1: Publishing Pin Level

```
1. User toggles pin in UI
   ↓
2. useAPIBridge.publishPinLevel(pin=2, level=1)
   ↓
3. fetch('/api/proxy/api/pin-level', {
     method: 'POST',
     body: { topic: 'digitalkit/pins/pin/2', payload: '1' }
   })
   ↓
4. Next.js proxy receives request
   ↓
5. fetch('http://localhost:3001/api/pin-level', {
     method: 'POST',
     body: { topic: 'digitalkit/pins/pin/2', payload: '1' }
   })
   ↓
6. Backend Express handler
   ↓
7. mqttClient.publish('digitalkit/pins/pin/2', '1', { qos: 1, retain: true })
   ↓
8. MQTT Broker
   ↓
9. Hardware receives message, sets pin 2 to HIGH
   ↓
10. Hardware publishes confirmation back to MQTT
    ↓
11. Backend receives MQTT message
    ↓
12. Backend broadcasts via SSE to all connected clients
    ↓
13. Frontend EventSource receives 'pin' event
    ↓
14. UI updates to reflect new pin state
```

### Example 2: Real-time Updates (SSE)

```
1. Frontend connects to SSE
   ↓
2. new EventSource('/api/events?clientId=abc123')
   ↓
3. Next.js proxy connects to backend
   ↓
4. fetch('http://localhost:3001/events?clientId=abc123')
   ↓
5. Backend establishes SSE connection
   ↓
6. Backend subscribes to MQTT: digitalkit/#
   ↓
7. Hardware publishes pin change to MQTT
   ↓
8. Backend receives MQTT message
   ↓
9. Backend sends SSE event: event: pin\ndata: {...}\n\n
   ↓
10. Next.js proxy streams event to browser
    ↓
11. Frontend EventSource fires 'pin' event
    ↓
12. useAPIBridge handles message
    ↓
13. UI updates pin state
```

### Example 3: Polling for Updates

```
1. setInterval() triggers every 1000ms
   ↓
2. pollForUpdates()
   ↓
3. fetch('/api/proxy/api/messages?since=1234567890&baseTopic=digitalkit/pins')
   ↓
4. Next.js proxy forwards to backend
   ↓
5. fetch('http://localhost:3001/api/messages?since=1234567890&baseTopic=digitalkit/pins')
   ↓
6. Backend filters cached messages (last 100)
   ↓
7. Returns: { messages: [...], serverTime: 1234567899, mqtt: "connected" }
   ↓
8. Next.js proxy returns to frontend
   ↓
9. Frontend processes messages array
   ↓
10. UI updates with new pin states
```

## Configuration Options

### Default (Proxy Mode)

```typescript
useAPIBridge(); // backendUrl = "" → uses /api/proxy/* and /api/events
```

### Direct Connection (Bypass Proxy)

```typescript
useAPIBridge({
  defaultBackendUrl: "http://localhost:3001", // → direct connection
});
```

### Environment-Based

```env
# .env.local
BACKEND_API_URL=https://api.production.com
```

## Security Benefits

1. **Backend URL Hidden**

   - Not in client bundle
   - Not visible in browser DevTools
   - Only in server environment

2. **No CORS Issues**

   - All requests same-origin (Next.js domain)
   - No preflight requests
   - Works in all browsers

3. **Flexible Deployment**

   - Change backend without frontend rebuild
   - Different URLs per environment
   - Easy rollback

4. **Rate Limiting**
   - Can add in proxy layer
   - Protect backend from abuse
   - Per-client limits

## Performance

- **Latency**: +5-10ms (proxy overhead)
- **SSE**: Direct stream (minimal overhead)
- **Polling**: Same as direct connection
- **Caching**: Can add in proxy layer

## Monitoring

### Frontend Logs (Browser Console)

```
[API Bridge] ↑ /api/metadata {...}
[API Bridge] ↓ MQTT pin update: pin 2 => 1
[API Bridge] Poll received 3 messages
[API Bridge] connected to event stream via proxy
```

### Proxy Logs (Next.js Terminal)

```
[Proxy] GET /api/proxy/api/messages
[Proxy] POST /api/proxy/api/pin-level {...}
[Proxy] SSE /events connection initiated
[Proxy] Connecting to SSE: http://localhost:3001/events
```

### Backend Logs (Express Terminal)

```
POST /api/pin-level 200 - 5ms
MQTT message: digitalkit/pins/pin/2
SSE client connected: abc123
Broadcasting to 2 SSE clients
```
