# MQTT Bridge Architecture

## Overview

The v2 interface uses an HTTP/SSE bridge architecture to communicate with hardware devices over MQTT. The frontend connects to a Node.js backend server via Next.js API proxy routes, and the backend manages the MQTT broker connection.

## Architecture

```
Frontend (Browser) ←→ Next.js API Proxy ←→ Backend Server ←→ MQTT Broker ←→ Hardware
```

### Benefits of Proxy Architecture

1. **Security**: Backend API URL not exposed to client
2. **Flexibility**: Easy to change backend without frontend updates
3. **CORS**: No cross-origin issues
4. **Environment**: Backend URL configured server-side only

## Backend Server

The backend server (located in `/backend/server.js`) provides:

The backend server (located in `/backend/server.js`) provides:

### API Endpoints

- `GET /health` - Health check
- `POST /api/metadata` - Publish IC metadata to MQTT
- `POST /api/pin-level` - Publish individual pin state to MQTT
- `POST /api/pin-collections` - Publish pin collections (inputs/outputs) to MQTT
- `GET /api/messages` - Poll for recent MQTT messages
- `GET /events` - Server-Sent Events (SSE) stream for real-time MQTT updates

### Backend Features

1. Connects to MQTT broker on startup
2. Subscribes to `digitalkit/#` topics
3. Maintains message history (last 100 messages)
4. Broadcasts MQTT updates to SSE clients
5. Handles QoS 1 retained messages

## Next.js API Proxy

The frontend uses Next.js API routes to proxy requests to the backend:

### Proxy Routes

- `/api/proxy/[...path]` - Proxies all HTTP requests (GET/POST)
  - Example: `/api/proxy/api/metadata` → `http://localhost:3001/api/metadata`
- `/api/events` - Proxies SSE stream from backend
  - Forwards: `http://localhost:3001/events`

### Configuration

Backend URL is configured server-side only (not exposed to browser):

```env
# .env or .env.local
BACKEND_API_URL=http://localhost:3001
```

Default: `http://localhost:3001`

## Setup Instructions

### 1. Start Backend Server

```bash
cd backend
npm install
npm start  # Runs on port 3001
```

### 2. Configure Backend URL (Optional)

Create `/FrontEnd/digitalkit/.env.local`:

```env
BACKEND_API_URL=http://localhost:3001
# Or your production backend URL
```

### 3. Start Frontend

```bash
cd FrontEnd/digitalkit
npm install
npm run dev  # Runs on port 3000
```

### 4. Verify Connection

- Open `http://localhost:3000/v2` or `http://localhost:3000/monitor`
- Check browser console for `[API Bridge]` logs
- Status should show "connected" when backend + MQTT are working

## Using Without Backend

## Using Without Backend

You can still use the application with Web Serial API and Web Bluetooth:

1. Connect via Web Serial API (Chrome/Edge required)
2. Connect via Web Bluetooth API
3. Control ICs directly through these interfaces
4. The MQTT/API bridge is optional for remote monitoring

## Advanced Configuration

### Custom Backend URL

If you need to connect to a different backend (e.g., production server), you have two options:

**Option 1: Environment Variable (Recommended)**

```env
# .env.local
BACKEND_API_URL=https://your-backend.example.com
```

**Option 2: Runtime Override (Advanced)**

In the v2 interface, you can use the API Floating Bar to set a custom backend URL. This bypasses the proxy and connects directly:

1. Open API settings panel
2. Enter custom backend URL (e.g., `https://api.example.com`)
3. The hook will use this instead of the proxy

### Proxy vs Direct Connection

- **Proxy mode** (default): `backendUrl = ""` → uses `/api/proxy/*` and `/api/events`
- **Direct mode**: `backendUrl = "http://..."` → bypasses proxy, connects directly

The proxy mode is recommended for production as it keeps backend URLs server-side.

## MQTT Broker Configuration

The backend connects to an MQTT broker. Configure in `/backend/server.js`:

```javascript
const MQTT_BROKER_URL =
  process.env.MQTT_BROKER_URL || "ws://98.93.38.49:9001/mqtt";
```

Default topics: `digitalkit/pins/*`

## Troubleshooting

### Frontend shows "connecting" forever

- Check backend is running: `curl http://localhost:3001/health`
- Check browser console for `[API Bridge]` errors
- Verify proxy routes exist: `/app/api/proxy/[...path]/route.ts`

### Backend shows "MQTT connection failed"

- Verify MQTT broker URL and port
- Check broker is WebSocket-enabled (e.g., port 9001 for Mosquitto WS)
- Test with MQTT client: `mqtt-explorer` or `mosquitto_sub`

### SSE stream not working

- Check `/api/events` route exists
- Verify backend `/events` endpoint returns `text/event-stream`
- Look for CORS or network issues in browser DevTools

## Development

### Testing Proxy Locally

```bash
# Terminal 1: Backend
cd backend && npm start

# Terminal 2: Frontend
cd FrontEnd/digitalkit && npm run dev

# Terminal 3: Test endpoints
curl http://localhost:3000/api/proxy/api/messages
curl http://localhost:3000/api/events
```

### Logs

- Frontend: Browser console `[API Bridge]`, `[Proxy]`
- Backend: Terminal output with MQTT connection status
- Next.js: Terminal output for API route requests
