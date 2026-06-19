# HTTP Proxy Middleware Implementation

## Summary

Successfully implemented Next.js API proxy middleware to route frontend requests through Next.js API routes instead of hardcoding the backend API URL in the client code.

## Changes Made

### 1. Created Proxy API Routes

#### `/app/api/proxy/[...path]/route.ts`

- Handles all REST API requests (GET/POST)
- Forwards requests to backend server
- Maps `/api/proxy/api/*` → `http://localhost:3001/api/*`
- Forwards query parameters and request bodies
- Returns JSON responses with proper error handling

#### `/app/api/events/route.ts`

- Proxies Server-Sent Events stream
- Maps `/api/events` → `http://localhost:3001/events`
- Streams real-time MQTT updates to frontend
- Maintains persistent connection with backend

### 2. Updated Frontend Hook

#### `app/v2/hooks/useAPIBridge.ts`

**Changed default backend URL:**

```typescript
// Before
const DEFAULT_BACKEND_URL = "http://localhost:3001";

// After
const DEFAULT_BACKEND_URL = ""; // Use Next.js proxy
```

**Updated `sendToBackend()` to use proxy:**

```typescript
// Uses /api/proxy/... when backendUrl is empty
const url = backendUrl
  ? `${backendUrl}${endpoint}`
  : `/api/proxy/${proxyEndpoint}`;
```

**Updated `pollForUpdates()` to use proxy:**

```typescript
// Uses /api/proxy/api/messages when backendUrl is empty
const endpoint = backendUrl
  ? `${backendUrl}/api/messages`
  : `/api/proxy/api/messages`;
```

**Updated `connectEventStream()` to use proxy:**

```typescript
// Uses /api/events when backendUrl is empty
const endpoint = backendUrl ? `${backendUrl}/events` : `/api/events`;
```

### 3. Configuration Files

#### `.env.example`

Created environment variable template:

```env
BACKEND_API_URL=http://localhost:3001
```

### 4. Documentation

#### `PROXY_SETUP.md`

Comprehensive guide covering:

- Architecture overview
- Configuration instructions
- Development workflow
- Production deployment
- Troubleshooting

#### `MQTT_BRIDGE_README.md`

Updated to reflect new proxy architecture:

- Architecture diagram
- Setup instructions
- Advanced configuration
- Troubleshooting guide

## How It Works

### Request Flow

1. **Frontend makes request:**

   ```typescript
   fetch('/api/proxy/api/metadata', { method: 'POST', body: {...} })
   ```

2. **Next.js proxy receives:**

   - Extracts path: `api/metadata`
   - Adds backend URL: `http://localhost:3001/api/metadata`
   - Forwards with same method and body

3. **Backend processes:**

   - Receives request
   - Publishes to MQTT broker
   - Returns response

4. **Proxy returns response:**
   - Forwards backend response to frontend
   - Frontend receives result

### SSE Stream Flow

1. **Frontend opens EventSource:**

   ```typescript
   new EventSource("/api/events?clientId=abc123");
   ```

2. **Next.js proxy:**

   - Connects to `http://localhost:3001/events`
   - Streams events in real-time
   - Forwards all SSE events to browser

3. **Backend streams:**
   - Publishes MQTT updates as SSE events
   - Proxy forwards to all connected clients

## Benefits

### Security

- Backend URL not exposed to browser
- Configuration only server-side
- No hardcoded URLs in client bundle

### Flexibility

- Change backend URL via environment variable
- No frontend rebuild needed
- Different URLs per environment (dev/staging/prod)

### Reliability

- No CORS issues (same-origin requests)
- Works in all browsers
- Fallback to direct connection still available

### Development

- Easier local development
- Single environment variable to configure
- Clear separation of concerns

## Testing

### Local Development

```bash
# Start backend
cd backend && npm start

# Start frontend (uses proxy by default)
cd FrontEnd/digitalkit && npm run dev

# Test proxy endpoints
curl http://localhost:3000/api/proxy/health
curl http://localhost:3000/api/events
```

### Expected Behavior

1. **No environment variable set:**

   - Uses default: `http://localhost:3001`
   - Proxy forwards all requests

2. **Environment variable set:**

   ```env
   BACKEND_API_URL=https://api.production.com
   ```

   - Proxy uses custom URL
   - Frontend unaware of backend URL

3. **Direct connection (bypass proxy):**
   ```typescript
   useAPIBridge({ defaultBackendUrl: "http://custom.com" });
   ```
   - Skips proxy, connects directly
   - Useful for testing or special cases

## Backward Compatibility

✅ **Fully backward compatible**

- Existing code works without changes
- Monitor page already uses default (now proxy)
- v2 page already uses default (now proxy)
- Direct connection still available if needed
- Environment variable `NEXT_PUBLIC_API_BACKEND_URL` still works

## Files Created/Modified

### Created:

- `/app/api/proxy/[...path]/route.ts` - HTTP proxy route
- `/app/api/events/route.ts` - SSE proxy route
- `.env.example` - Environment template
- `PROXY_SETUP.md` - Proxy documentation

### Modified:

- `/app/v2/hooks/useAPIBridge.ts` - Updated to use proxy
- `MQTT_BRIDGE_README.md` - Updated architecture docs

### Unchanged:

- `/app/monitor/page.tsx` - Already uses default (now proxy)
- `/app/v2/page.tsx` - Already uses default (now proxy)
- `/backend/server.js` - No changes needed

## Next Steps

1. **Test locally:**

   - Start backend and frontend
   - Verify proxy routes work
   - Check browser console logs

2. **Set environment variable (optional):**

   ```bash
   cd FrontEnd/digitalkit
   echo "BACKEND_API_URL=http://localhost:3001" > .env.local
   ```

3. **Deploy to production:**
   - Set `BACKEND_API_URL` in deployment environment
   - Deploy frontend (Next.js)
   - Deploy backend (Express + MQTT)
   - Verify proxy connections work

## Troubleshooting

### Issue: "Proxy request failed"

**Solution:** Check backend is running and `BACKEND_API_URL` is correct

### Issue: SSE not connecting

**Solution:** Verify `/api/events` route exists and backend `/events` works

### Issue: Still seeing hardcoded URL

**Solution:** Check `backendUrl` is empty (default) in useAPIBridge options

## Conclusion

The proxy middleware successfully decouples frontend from backend URL configuration, improving security, flexibility, and maintainability while maintaining full backward compatibility with existing code.
