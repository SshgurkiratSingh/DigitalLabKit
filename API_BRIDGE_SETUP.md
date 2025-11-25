# API Bridge Setup Guide

Quick start guide for the new HTTP API + MQTT architecture.

## What Changed?

**Before**: Browser directly connected to MQTT broker using MQTT.js
**Now**: Browser → HTTP/SSE → Backend Server → MQTT Broker

This provides better security, smaller bundle size, and easier deployment.

## Quick Start

### 1. Start the Backend

```bash
cd backend
npm install
npm run dev
```

Backend starts on `http://localhost:3001`

### 2. Start the Frontend

```bash
cd FrontEnd/digitalkit
npm install
npm run dev
```

Frontend starts on `http://localhost:3000`

### 3. Use the Application

1. Open http://localhost:3000/v2
2. Check the "API Bridge" panel (bottom-right)
3. Should show "Connected" status
4. Select an IC and start testing!

## Configuration

### Backend (.env file in backend/)

```env
PORT=3001
MQTT_BROKER_URL=mqtt://broker.hivemq.com:1883
```

### Frontend (.env.local in FrontEnd/digitalkit/)

```env
NEXT_PUBLIC_API_BACKEND_URL=http://localhost:3001
```

## Features

✅ **HTTP REST API** - Simple POST requests for publishing data
✅ **Server-Sent Events (SSE)** - Real-time updates from MQTT
✅ **Multiple Clients** - Support concurrent web clients
✅ **Auto Reconnection** - Handles network interruptions
✅ **MQTT Bridge** - Backend handles all MQTT communication

## Project Structure

```
DigitalLabKit/
├── backend/                    # NEW: API server with MQTT bridge
│   ├── server.js              # Main server
│   ├── package.json
│   ├── .env.example
│   └── README.md              # Detailed API docs
│
└── FrontEnd/digitalkit/
    ├── app/v2/
    │   ├── hooks/
    │   │   └── useAPIBridge.ts        # NEW: HTTP client hook
    │   └── components/
    │       ├── APIFloatingBar.tsx     # NEW: Control panel
    │       └── ICTesterWorkspace.tsx  # Updated to use API
    │
    ├── API_BRIDGE_README.md           # User guide
    └── API_BRIDGE_ARCHITECTURE.md     # Technical details
```

## Documentation

- **Backend API**: See `backend/README.md`
- **User Guide**: See `FrontEnd/digitalkit/API_BRIDGE_README.md`
- **Architecture**: See `FrontEnd/digitalkit/API_BRIDGE_ARCHITECTURE.md`

## Testing

### Check Backend Health

```bash
curl http://localhost:3001/health
```

### Test SSE Stream

```bash
curl -N http://localhost:3001/events?clientId=test&baseTopic=digitalkit/pins
```

### Publish Test Message

```bash
curl -X POST http://localhost:3001/api/pin-level \
  -H "Content-Type: application/json" \
  -d '{"baseTopic":"digitalkit/pins","pin":1,"level":1,"clientId":"test"}'
```

## Troubleshooting

**Frontend shows "Error"**

- Ensure backend is running on port 3001
- Check browser console for errors

**Backend can't connect to MQTT**

- Verify MQTT broker URL in .env
- Check network/firewall settings

**No real-time updates**

- Check browser Network tab for SSE connection
- Verify baseTopic matches in both frontend and backend

## Deployment

### Local Development

Both backend and frontend on localhost (current setup)

### Production

- Deploy backend to Railway/Render/Heroku
- Deploy frontend to Vercel/Netlify
- Update `NEXT_PUBLIC_API_BACKEND_URL` to backend URL
- Use secure MQTT broker (not localhost)

## Migration Notes

Old files (no longer used):

- ❌ `useMQTTBridge.ts` → ✅ `useAPIBridge.ts`
- ❌ `MQTTFloatingBar.tsx` → ✅ `APIFloatingBar.tsx`

The frontend no longer includes MQTT.js library, reducing bundle size significantly.

## Support

For detailed information:

1. Backend API: `backend/README.md`
2. Architecture: `FrontEnd/digitalkit/API_BRIDGE_ARCHITECTURE.md`
3. User Guide: `FrontEnd/digitalkit/API_BRIDGE_README.md`
