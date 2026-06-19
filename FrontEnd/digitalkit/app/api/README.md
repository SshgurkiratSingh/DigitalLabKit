# API Proxy Routes

This directory contains Next.js API routes that proxy requests to the backend server.

## Routes

### `/api/proxy/[...path]`

Dynamic catch-all route that proxies all HTTP requests (GET/POST) to the backend.

**Examples:**

- `/api/proxy/api/metadata` → `http://localhost:3001/api/metadata`
- `/api/proxy/api/pin-level` → `http://localhost:3001/api/pin-level`
- `/api/proxy/api/messages?since=123` → `http://localhost:3001/api/messages?since=123`

### `/api/events`

Proxies Server-Sent Events (SSE) stream from the backend.

**Forwards:**

- `/api/events` → `http://localhost:3001/events`

## Configuration

Backend URL is configured via environment variable:

```env
BACKEND_API_URL=http://localhost:3001
```

Default: `http://localhost:3001`

## Purpose

1. **Security**: Backend URL not exposed to client
2. **Flexibility**: Easy to change backend without frontend rebuild
3. **CORS**: No cross-origin issues (same-origin requests)
4. **Environment**: Different backend per deployment environment

## See Also

- `../../../PROXY_SETUP.md` - Detailed setup guide
- `../../../PROXY_ARCHITECTURE.md` - Architecture diagrams
- `../../../MQTT_BRIDGE_README.md` - Backend integration
