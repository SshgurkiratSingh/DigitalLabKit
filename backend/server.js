const express = require("express");
const mqtt = require("mqtt");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// MQTT Configuration
const MQTT_BROKER_URL =
  process.env.MQTT_BROKER_URL || "ws://98.93.38.49:9001/mqtt";
let mqttClient = null;

// Store connected SSE clients
const sseClients = new Map();

// Store recent MQTT messages for polling (keep last 100 messages)
const recentMessages = [];
const MAX_RECENT_MESSAGES = 100;

// Initialize MQTT connection
function connectMQTT() {
  console.log("Connecting to MQTT broker:", MQTT_BROKER_URL);

  mqttClient = mqtt.connect(MQTT_BROKER_URL, {
    clientId: `digitalkit-backend-${Math.random().toString(16).slice(2, 10)}`,
    clean: true,
    reconnectPeriod: 2000,
  });

  mqttClient.on("connect", () => {
    console.log("Connected to MQTT broker");

    // Subscribe to all topics under digitalkit
    mqttClient.subscribe("digitalkit/#", (err) => {
      if (err) {
        console.error("Failed to subscribe:", err);
      } else {
        console.log("Subscribed to digitalkit/#");
      }
    });
  });

  mqttClient.on("message", (topic, payload) => {
    const message = payload.toString();
    console.log("MQTT ←", topic, message);

    // Determine event type for better logging
    const eventType = determineEventType(topic);
    if (eventType === "pin") {
      const pinMatch = topic.match(/\/pin\/(\d+)$/);
      if (pinMatch) {
        console.log(`  → Pin ${pinMatch[1]} update: ${message}`);
      }
    }

    // Store in recent messages for polling
    const messageData = {
      topic,
      payload: message,
      timestamp: Date.now(),
    };
    recentMessages.push(messageData);
    if (recentMessages.length > MAX_RECENT_MESSAGES) {
      recentMessages.shift(); // Remove oldest
    }

    console.log(
      `  → Stored in recent messages (total: ${recentMessages.length})`
    );

    // Broadcast to all SSE clients
    broadcastToClients(topic, message);
  });

  mqttClient.on("error", (err) => {
    console.error("MQTT error:", err);
  });

  mqttClient.on("close", () => {
    console.log("MQTT connection closed");
  });
}

// Broadcast message to SSE clients
function broadcastToClients(topic, payload) {
  const event = determineEventType(topic);

  sseClients.forEach((client) => {
    // Check if topic matches client's base topic
    if (topic.startsWith(client.baseTopic)) {
      const data = {
        topic,
        payload,
        timestamp: Date.now(),
      };

      // Parse pin messages
      if (event === "pin") {
        const pinMatch = topic.match(/\/pin\/(\d+)$/);
        if (pinMatch) {
          data.pin = parseInt(pinMatch[1], 10);
          data.level = normalizeLevel(payload);
        }
      }

      client.res.write(`event: ${event}\n`);
      client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  });
}

// Determine event type from topic
function determineEventType(topic) {
  if (topic.includes("/pin/")) return "pin";
  if (topic.includes("/inputs") || topic.includes("/outputs"))
    return "collections";
  return "metadata";
}

// Normalize level value
function normalizeLevel(value) {
  const normalized = value.trim().toLowerCase();
  if (["1", "high", "true", "on"].includes(normalized)) return 1;
  if (["0", "low", "false", "off"].includes(normalized)) return 0;
  const parsed = Number(normalized);
  return !isNaN(parsed) && parsed ? 1 : 0;
}

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    mqtt: mqttClient?.connected ? "connected" : "disconnected",
    clients: sseClients.size,
  });
});

// Polling endpoint for MQTT updates
app.get("/api/messages", (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const baseTopic = req.query.baseTopic || "digitalkit/pins";

  console.log(
    `[API] /api/messages request - since: ${since}, baseTopic: ${baseTopic}, total stored: ${recentMessages.length}`
  );

  // Filter messages by timestamp and base topic
  const filteredMessages = recentMessages
    .filter((msg) => msg.timestamp > since && msg.topic.startsWith(baseTopic))
    .map((msg) => {
      const event = determineEventType(msg.topic);
      const data = {
        topic: msg.topic,
        payload: msg.payload,
        timestamp: msg.timestamp,
      };

      // Parse pin messages
      if (event === "pin") {
        const pinMatch = msg.topic.match(/\/pin\/(\d+)$/);
        if (pinMatch) {
          data.pin = parseInt(pinMatch[1], 10);
          data.level = normalizeLevel(msg.payload);
        }
      }

      return { event, data };
    });

  console.log(
    `[API] Returning ${filteredMessages.length} messages (${
      filteredMessages.filter((m) => m.event === "pin").length
    } pin updates)`
  );

  res.json({
    messages: filteredMessages,
    serverTime: Date.now(),
    mqtt: mqttClient?.connected ? "connected" : "disconnected",
  });
});

// SSE endpoint for real-time updates
app.get("/events", (req, res) => {
  const clientId = req.query.clientId || `client-${Date.now()}`;
  const baseTopic = req.query.baseTopic || "digitalkit/pins";

  console.log(`SSE client connected: ${clientId} (baseTopic: ${baseTopic})`);

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Store client
  sseClients.set(clientId, { res, baseTopic });

  // Send initial connection message
  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({ clientId, baseTopic })}\n\n`);

  // Handle client disconnect
  req.on("close", () => {
    console.log(`SSE client disconnected: ${clientId}`);
    sseClients.delete(clientId);
  });
});

// Publish metadata
app.post("/api/metadata", (req, res) => {
  const { baseTopic, topic, payload, clientId } = req.body;

  if (!mqttClient || !mqttClient.connected) {
    return res
      .status(503)
      .json({ success: false, error: "MQTT not connected" });
  }

  const mqttTopic = topic || `${baseTopic}/metadata`;
  const message =
    typeof payload === "string" ? payload : JSON.stringify(payload);

  mqttClient.publish(mqttTopic, message, { qos: 1, retain: true }, (err) => {
    if (err) {
      console.error("Publish error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
    console.log("MQTT →", mqttTopic, message);
    res.json({ success: true, topic: mqttTopic });
  });
});

// Publish pin level
app.post("/api/pin-level", (req, res) => {
  const { baseTopic, topic, pin, level, clientId } = req.body;

  if (!mqttClient || !mqttClient.connected) {
    return res
      .status(503)
      .json({ success: false, error: "MQTT not connected" });
  }

  const mqttTopic = topic || `${baseTopic}/pin/${pin}`;
  const message = String(level);

  mqttClient.publish(mqttTopic, message, { qos: 1, retain: true }, (err) => {
    if (err) {
      console.error("Publish error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
    console.log("MQTT →", mqttTopic, message);
    res.json({ success: true, topic: mqttTopic });
  });
});

// Publish pin collections
app.post("/api/pin-collections", (req, res) => {
  const { baseTopic, inputs, outputs, clientId } = req.body;

  if (!mqttClient || !mqttClient.connected) {
    return res
      .status(503)
      .json({ success: false, error: "MQTT not connected" });
  }

  const inputTopic = `${baseTopic}/inputs`;
  const outputTopic = `${baseTopic}/outputs`;

  const inputMessage = JSON.stringify(inputs);
  const outputMessage = JSON.stringify(outputs);

  let errors = [];

  mqttClient.publish(
    inputTopic,
    inputMessage,
    { qos: 1, retain: true },
    (err) => {
      if (err) errors.push(err.message);
    }
  );

  mqttClient.publish(
    outputTopic,
    outputMessage,
    { qos: 1, retain: true },
    (err) => {
      if (err) errors.push(err.message);
    }
  );

  if (errors.length > 0) {
    return res.status(500).json({ success: false, errors });
  }

  console.log("MQTT →", inputTopic, inputMessage);
  console.log("MQTT →", outputTopic, outputMessage);
  res.json({ success: true, topics: [inputTopic, outputTopic] });
});

// Start server
app.listen(PORT, () => {
  console.log(`API Backend listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`SSE endpoint: http://localhost:${PORT}/events`);
  connectMQTT();
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing server...");
  if (mqttClient) {
    mqttClient.end();
  }
  process.exit(0);
});
