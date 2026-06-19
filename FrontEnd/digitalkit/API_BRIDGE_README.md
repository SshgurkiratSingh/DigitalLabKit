# API Bridge Backend

## Overview

The v2 interface includes an HTTP API Bridge feature that allows real-time communication with hardware devices over MQTT. The frontend communicates with a backend server via HTTP and Server-Sent Events (SSE), and the backend bridges these requests to an MQTT broker.

## Architecture

```
┌─────────────┐   HTTP/SSE    ┌─────────────┐    MQTT     ┌──────────────┐
│   Frontend  │ ←───────────→ │  Backend    │ ←─────────→ │ MQTT Broker  │
│  (Browser)  │               │   Server    │             │              │
└─────────────┘               └─────────────┘             └──────────────┘
                                     ↕
                              ┌─────────────┐
                              │  Hardware   │
                              │   Devices   │
                              └─────────────┘
```

## Backend Setup

### Installation

1. Navigate to the backend directory:

```bash
cd backend
npm install
```

2. Configure environment (optional):

```bash
cp .env.example .env
# Edit .env with your MQTT broker URL
```

3. Start the server:

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The backend will start on `http://localhost:3001` by default.

### Configuration

Environment variables in `.env`:

- `PORT` - Server port (default: 3001)
- `MQTT_BROKER_URL` - MQTT broker URL (default: mqtt://broker.hivemq.com:1883)

## Frontend Configuration

The frontend automatically connects to the backend. You can configure the backend URL:

### Environment Variable (Optional)

Create `.env.local` in the FrontEnd/digitalkit directory:

```env
NEXT_PUBLIC_API_BACKEND_URL=http://localhost:3001
```

### UI Configuration

You can also change the backend URL directly in the API Bridge panel in the UI:

1. Open the v2 interface
2. Look for the "API Bridge" floating panel (bottom-right)
3. Expand the panel
4. Update the "Backend API URL" field

## Features

### Real-time Communication

- **HTTP REST API**: Send commands and data to MQTT
- **Server-Sent Events (SSE)**: Receive real-time updates from MQTT
- **Multiple Clients**: Support for multiple concurrent web clients

### Supported Operations

1. **Publish Metadata**: Send IC information
2. **Publish Pin Levels**: Send individual pin states
3. **Publish Pin Collections**: Send input/output pin groups
4. **Receive Pin Updates**: Get real-time pin state changes from hardware

## Using the Application

### With API Bridge (Recommended for MQTT)

1. Start the backend server (see Backend Setup above)
2. Open the frontend application
3. In the API Bridge panel:
   - Toggle to "On"
   - Verify status shows "Connected"
4. Select an IC and interact with pins
5. Changes will be published to MQTT and synced across all connected clients

### Without API Bridge

The API bridge is optional. You can use the application with:

1. **Web Serial API** (Chrome/Edge required)
2. **Web Bluetooth API**
3. Direct control without backend server

Just toggle the API Bridge to "Off" in the floating panel.

## API Endpoints

The backend provides these endpoints:

- `GET /health` - Health check and status
- `GET /events` - SSE stream for real-time updates
- `POST /api/metadata` - Publish IC metadata
- `POST /api/pin-level` - Publish pin state
- `POST /api/pin-collections` - Publish pin groups

See `backend/README.md` for detailed API documentation.

## MQTT Topics

Default base topic: `digitalkit/pins`

- `digitalkit/pins/pin/<number>` - Individual pin states (0 or 1)
- `digitalkit/pins/inputs` - Array of input pin numbers
- `digitalkit/pins/outputs` - Array of output pin numbers
- `digitalkit/pins/<ic-name>` - IC metadata JSON

## Deployment

### Local Development

```bash
cd backend
npm run dev
```

### Cloud Deployment

Deploy the backend to any Node.js hosting platform:

- **Railway**: One-click deploy with GitHub
- **Render**: Free tier available
- **Heroku**: Classic choice
- **DigitalOcean App Platform**: Easy scaling
- **Vercel/Netlify**: Not ideal (need long-running SSE support)

Ensure:

1. Set `MQTT_BROKER_URL` environment variable
2. Use a persistent MQTT broker (not local)
3. Configure CORS if using different domains

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
```

## Troubleshooting

### Backend Connection Issues

**Frontend shows "Error" or "Connecting":**

- Ensure backend is running on `http://localhost:3001`
- Check browser console for errors
- Verify backend URL in API Bridge panel

**Backend can't connect to MQTT:**

- Check `MQTT_BROKER_URL` in `.env`
- Verify MQTT broker is accessible
- Test with `mqtt` CLI tool

### SSE Connection Issues

**Events not received:**

- Check browser Network tab for `/events` connection
- Verify baseTopic matches between frontend and backend
- Look for CORS errors in browser console

**Connection drops:**

- Increase server/proxy timeout settings
- Check for intermediate proxies killing long-lived connections

### MQTT Issues

**Messages not publishing:**

- Check backend logs for MQTT connection status
- Verify topics match expected format
- Test MQTT broker with external client (MQTT Explorer, mosquitto_pub)

**Messages not received:**

- Ensure hardware devices publish to correct topics
- Check QoS settings (backend uses QoS 1)
- Verify broker is routing messages correctly

## Development

### Project Structure

```
backend/
├── server.js          # Main server file
├── package.json       # Dependencies
├── .env.example       # Environment template
└── README.md          # API documentation

FrontEnd/digitalkit/app/v2/
├── hooks/
│   └── useAPIBridge.ts    # Frontend API client
├── components/
│   ├── APIFloatingBar.tsx # UI control panel
│   └── ICTesterWorkspace.tsx # Main workspace
```

### Adding New Features

To add new message types:

1. Add endpoint in `backend/server.js`
2. Update `determineEventType()` function
3. Add method in `useAPIBridge.ts`
4. Handle event in SSE listener

## Migration from Direct MQTT

The old direct MQTT connection has been replaced with this HTTP API architecture because:

1. **Browser Compatibility**: No MQTT.js bundle in frontend
2. **Security**: Backend handles MQTT credentials
3. **Flexibility**: Easier to add authentication, logging, validation
4. **Scalability**: Backend can manage multiple MQTT brokers

Old code using `useMQTTBridge` has been replaced with `useAPIBridge`.

## Support

For issues or questions:

1. Check backend logs: `npm run dev` shows detailed logging
2. Check browser console: Frontend shows API bridge status
3. Test MQTT broker independently
4. Review backend README.md for API details
