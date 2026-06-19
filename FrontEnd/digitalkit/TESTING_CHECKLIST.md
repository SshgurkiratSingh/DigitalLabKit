# Proxy Implementation Testing Checklist

## Pre-Testing Setup

- [ ] Backend server running on port 3001

  ```bash
  cd backend && npm start
  ```

- [ ] Frontend server running on port 3000

  ```bash
  cd FrontEnd/digitalkit && npm run dev
  ```

- [ ] Environment variable set (optional)
  ```bash
  echo "BACKEND_API_URL=http://localhost:3001" > .env.local
  ```

## Basic Proxy Tests

### 1. HTTP Proxy (REST Endpoints)

- [ ] Test health endpoint

  ```bash
  curl http://localhost:3000/api/proxy/health
  ```

  Expected: `{"status":"ok","mqtt":"connected"}`

- [ ] Test messages endpoint

  ```bash
  curl "http://localhost:3000/api/proxy/api/messages?since=0&baseTopic=digitalkit/pins"
  ```

  Expected: `{"messages":[...],"serverTime":...,"mqtt":"connected"}`

- [ ] Test metadata POST

  ```bash
  curl -X POST http://localhost:3000/api/proxy/api/metadata \
    -H "Content-Type: application/json" \
    -d '{"topic":"digitalkit/pins/metadata","payload":{"partNumber":"7408","description":"Quad 2-input AND","pinCount":14}}'
  ```

  Expected: `{"success":true}`

- [ ] Test pin-level POST
  ```bash
  curl -X POST http://localhost:3000/api/proxy/api/pin-level \
    -H "Content-Type: application/json" \
    -d '{"topic":"digitalkit/pins/pin/2","payload":"1"}'
  ```
  Expected: `{"success":true}`

### 2. SSE Proxy (Event Stream)

- [ ] Connect to SSE endpoint

  ```bash
  curl http://localhost:3000/api/events?clientId=test123
  ```

  Expected: Stream of events like:

  ```
  event: pin
  data: {"pin":2,"level":1,"topic":"digitalkit/pins/pin/2","payload":"1"}
  ```

- [ ] Keep connection open and observe events
  - Should receive MQTT updates in real-time
  - Connection should remain stable

## Frontend Integration Tests

### 3. v2 Page Tests

- [ ] Open http://localhost:3000/v2
- [ ] Check browser console for logs:
  ```
  [API Bridge] connecting to event stream via proxy
  [API Bridge] connected to event stream
  ```
- [ ] Open API Floating Bar (bottom-right panel)
- [ ] Verify settings:
  - Backend URL: (empty or localhost:3001)
  - Status: Connected
  - Last message: Shows recent MQTT activity
- [ ] Test IC metadata publish:
  - Select an IC from library
  - Check console: `[API Bridge] ↑ /api/metadata`
  - Verify MQTT message sent
- [ ] Test pin toggle (if hardware connected):
  - Toggle an input pin
  - Check console: `[API Bridge] ↑ /api/pin-level`
  - Verify pin changes on hardware

### 4. Monitor Page Tests

- [ ] Open http://localhost:3000/monitor
- [ ] Check connection status indicator (top-right)
  - Should show "Connected" with green indicator
- [ ] Verify IC metadata displays:
  - Part number
  - Description
  - Pin count
  - Category
- [ ] Check pin visualization:
  - All 14 pins displayed
  - Input pins show toggle switches
  - Output pins show read-only state
- [ ] Test pin toggle:
  - Click toggle on input pin
  - Verify state changes
  - Check backend receives publish
- [ ] Monitor statistics:
  - Connection time counter
  - Total inputs count
  - Total outputs count
  - Pin state summary

### 5. Test Script Panel Tests

- [ ] Open http://localhost:3000/monitor
- [ ] Expand Test Script Panel (bottom-left)
- [ ] Load example script (e.g., "Basic")
- [ ] Click "Run Script"
- [ ] Verify:
  - Execution log shows progress
  - Delays of 1500ms observed
  - Pin states change according to script
  - Script completes successfully
- [ ] Test abort functionality:
  - Run a long script
  - Click "Abort"
  - Verify script stops immediately

## Proxy-Specific Tests

### 6. Verify Proxy is Working

- [ ] Check Network tab in browser DevTools
- [ ] Verify requests go to `/api/proxy/*` NOT `http://localhost:3001`
- [ ] Verify SSE connects to `/api/events` NOT `http://localhost:3001/events`
- [ ] No CORS errors in console
- [ ] No 404 errors for proxy routes

### 7. Backend URL Hidden

- [ ] Open browser DevTools → Sources tab
- [ ] Search for "localhost:3001" in client bundle
- [ ] Should NOT find any hardcoded backend URLs
- [ ] Backend URL only visible in server-side code

### 8. Environment Variable Test

- [ ] Stop frontend server
- [ ] Set environment variable:
  ```bash
  echo "BACKEND_API_URL=http://127.0.0.1:3001" > .env.local
  ```
- [ ] Restart frontend server
- [ ] Verify proxy uses new URL (check Next.js terminal logs)
- [ ] Test connection still works

### 9. Direct Connection Override

- [ ] In v2 page, open API Floating Bar
- [ ] Set Backend URL to: `http://localhost:3001`
- [ ] Toggle Enable on
- [ ] Verify connection works (bypassing proxy)
- [ ] Check Network tab: requests go directly to localhost:3001

## Error Handling Tests

### 10. Backend Down

- [ ] Stop backend server
- [ ] Open http://localhost:3000/monitor
- [ ] Verify error message displays
- [ ] Check console: `[API Bridge] poll error`
- [ ] Status shows "error" state

### 11. MQTT Broker Down

- [ ] Backend running but MQTT broker unreachable
- [ ] Check status shows MQTT disconnected
- [ ] Error message indicates MQTT issue
- [ ] REST endpoints still respond (but with mqtt: "disconnected")

### 12. Invalid Proxy Route

- [ ] Test non-existent endpoint:
  ```bash
  curl http://localhost:3000/api/proxy/invalid/endpoint
  ```
- [ ] Should return 404 or appropriate error

## Performance Tests

### 13. Polling Performance

- [ ] Open http://localhost:3000/monitor
- [ ] Monitor Network tab
- [ ] Verify polling interval (should be ~1000ms for monitor)
- [ ] Check message sizes are reasonable
- [ ] No excessive network traffic

### 14. SSE Performance

- [ ] Keep connection open for 5+ minutes
- [ ] Verify no disconnections
- [ ] Memory usage remains stable
- [ ] Events received immediately (low latency)

### 15. Concurrent Clients

- [ ] Open multiple browser tabs (v2, monitor)
- [ ] Verify all receive updates
- [ ] Toggle pin in one tab, others update
- [ ] No conflicts or race conditions

## Production Readiness

### 16. Build Test

- [ ] Build production bundle:
  ```bash
  cd FrontEnd/digitalkit
  npm run build
  ```
- [ ] Verify build succeeds
- [ ] No TypeScript errors
- [ ] No build warnings about proxy routes

### 17. Production Mode Test

- [ ] Start production server:
  ```bash
  npm run start
  ```
- [ ] Test all functionality works in production mode
- [ ] Verify proxy routes work
- [ ] Check performance

### 18. Environment Variables

- [ ] Test with production backend URL:
  ```env
  BACKEND_API_URL=https://api.production.com
  ```
- [ ] Verify proxy uses correct URL
- [ ] Check logs show production URL

## Documentation Verification

### 19. Documentation

- [ ] Read PROXY_SETUP.md - Clear and accurate?
- [ ] Read PROXY_ARCHITECTURE.md - Diagrams correct?
- [ ] Read PROXY_IMPLEMENTATION.md - Summary complete?
- [ ] Read MQTT_BRIDGE_README.md - Updated correctly?
- [ ] Read app/api/README.md - Routes documented?

### 20. Code Comments

- [ ] Proxy routes have clear comments?
- [ ] useAPIBridge changes documented?
- [ ] Environment variables explained?

## Final Checklist

- [ ] All tests passing
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] Documentation complete
- [ ] Ready for production deployment

## Issues Found

Document any issues discovered during testing:

1. Issue: ******\_\_\_******
   Solution: ******\_\_\_******

2. Issue: ******\_\_\_******
   Solution: ******\_\_\_******

## Notes

Additional observations or suggestions:

---

---

---
