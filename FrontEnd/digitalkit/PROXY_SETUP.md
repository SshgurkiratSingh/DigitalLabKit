# Next.js API Proxy Setup

## Overview

The frontend uses Next.js API routes to proxy all backend requests, avoiding hardcoded backend URLs in the client code.

## Architecture

```
Browser → Next.js API Proxy → Backend Server → MQTT Broker
```

### Why Use Proxy?

1. **Security**: Backend URL not exposed to browser (server-side only)
2. **Flexibility**: Change backend URL without rebuilding frontend
3. **CORS**: No cross-origin issues since requests are same-origin
4. **Environment-based**: Different backend URLs per environment (dev/staging/prod)

## Proxy Routes

### 1. HTTP Proxy: `/api/proxy/[...path]/route.ts`

Handles all REST API requests (GET/POST) to the backend.

**Example mappings:**

- `/api/proxy/api/messages` → `http://localhost:3001/api/messages`
- `/api/proxy/api/metadata` → `http://localhost:3001/api/metadata`
- `/api/proxy/api/pin-level` → `http://localhost:3001/api/pin-level`
- `/api/proxy/api/pin-collections` → `http://localhost:3001/api/pin-collections`

**Features:**

- Forwards query parameters
- Passes request body for POST requests
- Returns JSON responses
- Handles errors with 500 status

### 2. SSE Proxy: `/api/events/route.ts`

Proxies Server-Sent Events stream from backend.

**Mapping:**

- `/api/events` → `http://localhost:3001/events`

**Features:**

- Streams events in real-time
- Maintains connection with backend
- Forwards all SSE events to browser
- Proper headers for event streaming

## Configuration

### Environment Variable

Create `.env.local` in `/FrontEnd/digitalkit/`:

```env
BACKEND_API_URL=http://localhost:3001
```

**Defaults:**

- Development: `http://localhost:3001`
- Production: Set via environment variable

### Frontend Usage

The `useAPIBridge` hook automatically uses the proxy when `backendUrl` is empty (default):

```typescript
// Uses proxy (default)
const bridge = useAPIBridge({
  defaultBaseTopic: "digitalkit/pins",
  autoEnable: true,
});

// Direct connection (bypass proxy)
const bridge = useAPIBridge({
  defaultBackendUrl: "http://custom-backend.com",
  defaultBaseTopic: "digitalkit/pins",
});
```

## How It Works

### POST Requests (e.g., publishing pin state)

```typescript
// Frontend code
await fetch("/api/proxy/api/pin-level", {
  method: "POST",
  body: JSON.stringify({ topic: "digitalkit/pins/pin/2", payload: "1" }),
});

// Next.js proxy receives request
// Forwards to: http://localhost:3001/api/pin-level
// Backend publishes to MQTT
// Response returned to frontend
```

### GET Requests (e.g., polling messages)

```typescript
// Frontend code
const response = await fetch("/api/proxy/api/messages?since=1234567890");

// Next.js proxy forwards with query params
// Backend returns: { messages: [...], serverTime: 1234567899, mqtt: "connected" }
// Frontend receives response
```

### SSE Stream (real-time updates)

```typescript
// Frontend code
const source = new EventSource("/api/events?clientId=abc123");

// Next.js proxy connects to backend SSE
// Backend sends: event: pin\ndata: {"pin":2,"level":1}\n\n
// Proxy streams to frontend EventSource
// Frontend receives event
```

## Development

### Local Testing

```bash
# Terminal 1: Start backend
cd backend
npm start  # Port 3001

# Terminal 2: Start frontend with proxy
cd FrontEnd/digitalkit
npm run dev  # Port 3000

# Terminal 3: Test proxy
curl http://localhost:3000/api/proxy/health
curl http://localhost:3000/api/events
```

### Debugging

**Browser Console:**

```
[API Bridge] ↑ /api/metadata {...}
[Proxy] POST /api/metadata {...}
[API Bridge] ↓ MQTT pin update: pin 2 => 1
```

**Backend Logs:**

```
POST /api/metadata 200 - 5ms
MQTT message: digitalkit/pins/metadata
```

## Production Deployment

### 1. Deploy Backend

Deploy backend server (Express + MQTT) to your hosting service.

### 2. Set Environment Variable

Set `BACKEND_API_URL` in your Next.js deployment:

**Vercel:**

```bash
vercel env add BACKEND_API_URL
# Enter: https://api.your-domain.com
```

**Docker:**

```yaml
services:
  frontend:
    environment:
      - BACKEND_API_URL=http://backend:3001
```

**Environment file:**

```env
BACKEND_API_URL=https://api.production.com
```

### 3. Verify

Check that frontend connects through proxy:

```bash
curl https://your-app.vercel.app/api/proxy/health
```

## Bypassing Proxy (Advanced)

If you need direct connection (not recommended for production):

### Option 1: Environment Variable

```env
NEXT_PUBLIC_API_BACKEND_URL=http://localhost:3001
```

This exposes the backend URL to the browser.

### Option 2: Runtime Configuration

Use the API Floating Bar in the UI to set a custom backend URL. The hook will bypass the proxy and connect directly.

## Security Considerations

1. **Never expose backend URL in client code** - Use proxy
2. **Validate backend responses** - Proxy doesn't modify responses
3. **Use HTTPS in production** - Encrypt backend connections
4. **Rate limiting** - Implement in backend, not proxy
5. **Authentication** - Add auth headers in proxy if needed

## Troubleshooting

### Error: "Proxy request failed"

- Check backend is running and accessible
- Verify `BACKEND_API_URL` is correct
- Check backend endpoint path matches proxy path
- Look for network/firewall issues

### SSE connection fails

- Verify `/api/events` route exists
- Check backend `/events` returns `text/event-stream` header
- Test backend SSE directly: `curl http://localhost:3001/events`

### CORS errors even with proxy

- Shouldn't happen with proxy (same-origin)
- If direct connection used, check backend CORS config
- Verify you're using proxy (empty `backendUrl`)

## Files

- `/app/api/proxy/[...path]/route.ts` - HTTP proxy (GET/POST)
- `/app/api/events/route.ts` - SSE proxy
- `/app/v2/hooks/useAPIBridge.ts` - Hook using proxy
- `.env.example` - Environment template
- `.env.local` - Local environment config (not committed)
