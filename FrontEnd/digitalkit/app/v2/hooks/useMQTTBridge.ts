"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Buffer } from "buffer";
import mqtt, { MqttClient } from "mqtt";

const globalForBuffer = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
};

if (!globalForBuffer.Buffer) {
  globalForBuffer.Buffer = Buffer;
}

export type MQTTStatus = "idle" | "connecting" | "connected" | "error";

type PinMessageHandler = (message: PinMessage) => void;

export interface MQTTMetadataPayload {
  partNumber: string;
  description: string;
  pinCount: number;
  category?: string;
}

export interface PinMessage {
  pin: number;
  level: 0 | 1;
  topic: string;
  rawPayload: string;
}

interface MQTTBridgeOptions {
  defaultBrokerUrl?: string;
  defaultBaseTopic?: string;
  autoEnable?: boolean;
}

export interface MQTTMessageSummary {
  topic: string;
  payload: string;
  timestamp: number;
}

interface MQTTBridgeResult {
  brokerUrl: string;
  setBrokerUrl: (url: string) => void;
  baseTopic: string;
  setBaseTopic: (value: string) => void;
  isEnabled: boolean;
  setEnabled: (value: boolean) => void;
  status: MQTTStatus;
  error: string | null;
  clientId: string;
  lastMessage: MQTTMessageSummary | null;
  publishMetadata: (icName: string, payload: MQTTMetadataPayload) => boolean;
  publishPinLevel: (pin: number, level: 0 | 1) => boolean;
  publishPinCollections: (inputs: number[], outputs: number[]) => boolean;
  setPinMessageHandler: (handler: PinMessageHandler | null) => void;
}

const DEFAULT_BROKER =
  process.env.NEXT_PUBLIC_MQTT_WS_URL || "ws://98.93.38.49:9001/mqtt";
const DEFAULT_BASE_TOPIC = "digitalkit/pins";

const sanitizeTopicBase = (value: string) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return DEFAULT_BASE_TOPIC;
  return trimmed.replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
};

const slugifySegment = (value: string) => {
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return safe || "ic";
};

const normalizeIncomingLevel = (value: string): 0 | 1 | null => {
  const normalized = value.trim().toLowerCase();
  if (["1", "high", "true", "on"].includes(normalized)) return 1;
  if (["0", "low", "false", "off"].includes(normalized)) return 0;
  const parsed = Number(normalized);
  if (!Number.isNaN(parsed)) return parsed ? 1 : 0;
  return null;
};

const stringifyPayload = (payload: unknown) => {
  if (typeof payload === "string") return payload;
  return JSON.stringify(payload);
};

export const useMQTTBridge = (
  options?: MQTTBridgeOptions
): MQTTBridgeResult => {
  const [brokerUrl, setBrokerUrl] = useState(
    options?.defaultBrokerUrl ?? DEFAULT_BROKER
  );
  const [baseTopic, setBaseTopicState] = useState(
    sanitizeTopicBase(options?.defaultBaseTopic ?? DEFAULT_BASE_TOPIC)
  );
  const setBaseTopic = useCallback((value: string) => {
    setBaseTopicState(sanitizeTopicBase(value));
  }, []);

  const [isEnabled, setEnabled] = useState(options?.autoEnable ?? true);
  const [status, setStatus] = useState<MQTTStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<MQTTMessageSummary | null>(
    null
  );

  const clientRef = useRef<MqttClient | null>(null);
  const clientIdRef = useRef(
    `digitalkit-${Math.random().toString(16).slice(2, 10)}`
  );
  const pinHandlerRef = useRef<PinMessageHandler | null>(null);
  const pinSubscriptionRef = useRef<string | null>(null);
  const decoderRef = useRef<TextDecoder | null>(null);
  const isMountedRef = useRef(true);

  const decodePayload = useCallback((payload: Uint8Array | string) => {
    if (typeof payload === "string") return payload;
    if (!decoderRef.current) {
      decoderRef.current = new TextDecoder();
    }
    return decoderRef.current.decode(payload);
  }, []);

  const cleanupClient = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    try {
      client.end(true);
    } catch (cleanupError) {
      console.warn("[MQTT] cleanup error", cleanupError);
    }
    clientRef.current = null;
    pinSubscriptionRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cleanupClient();
    };
  }, [cleanupClient]);

  const publishRetained = useCallback(
    (topic: string, payload: string) => {
      const client = clientRef.current;
      if (!client || !client.connected) {
        console.warn(`[MQTT] publish dropped ${topic} (disconnected)`);
        return false;
      }
      client.publish(topic, payload, { qos: 1, retain: true });
      console.info("[MQTT] ↑", topic, payload);
      setLastMessage({ topic, payload, timestamp: Date.now() });
      return true;
    },
    []
  );

  const subscribeToPins = useCallback(() => {
    const client = clientRef.current;
    if (!client || !client.connected) return;
    const wildcard = `${baseTopic}/pin/+`;
    const previous = pinSubscriptionRef.current;
    if (previous && previous !== wildcard) {
      client.unsubscribe(previous, (err) => {
        if (err) console.warn("[MQTT] unsubscribe error", err);
      });
    }
    pinSubscriptionRef.current = wildcard;
    client.subscribe(wildcard, { qos: 1 }, (err) => {
      if (err) console.warn("[MQTT] subscribe error", err);
      else console.info("[MQTT] subscribed", wildcard);
    });
  }, [baseTopic]);

  useEffect(() => {
    if (!isEnabled) {
      cleanupClient();
      setStatus("idle");
      setError(null);
      return;
    }
    if (typeof window === "undefined") return;

    console.info("[MQTT] connecting", brokerUrl);
    setStatus("connecting");
    setError(null);

    const client = mqtt.connect(brokerUrl, {
      clientId: clientIdRef.current,
      reconnectPeriod: 2000,
      connectTimeout: 5000,
      clean: true,
    });
    clientRef.current = client;

    const handleConnect = () => {
      if (!isMountedRef.current) return;
      console.info("[MQTT] connected as", clientIdRef.current);
      setStatus("connected");
      setError(null);
      subscribeToPins();
    };

    const handleReconnect = () => {
      if (!isMountedRef.current) return;
      console.info("[MQTT] reconnecting");
      setStatus("connecting");
    };

    const handleClose = () => {
      if (!isMountedRef.current) return;
      console.info("[MQTT] connection closed");
      setStatus(isEnabled ? "connecting" : "idle");
    };

    const handleMessage = (topic: string, payload: Buffer) => {
      if (!isMountedRef.current) return;
      const text = decodePayload(payload);
      setLastMessage({ topic, payload: text, timestamp: Date.now() });
      if (!topic.startsWith(`${baseTopic}/pin/`)) return;
      const pinSegment = topic.slice(`${baseTopic}/pin/`.length);
      const pin = Number(pinSegment);
      if (Number.isNaN(pin)) return;
      const derived = normalizeIncomingLevel(text);
      if (derived === null) return;
      console.info("[MQTT] ↓ pin", pin, "<=", derived);
      pinHandlerRef.current?.({ pin, level: derived, topic, rawPayload: text });
    };

    const handleError = (incomingError: Error) => {
      if (!isMountedRef.current) return;
      console.error("[MQTT] client error", incomingError);
      setStatus("error");
      setError(incomingError.message);
    };

    client.on("connect", handleConnect);
    client.on("reconnect", handleReconnect);
    client.on("close", handleClose);
    client.on("message", handleMessage);
    client.on("error", handleError);

    return () => {
      client.removeListener("connect", handleConnect);
      client.removeListener("reconnect", handleReconnect);
      client.removeListener("close", handleClose);
      client.removeListener("message", handleMessage);
      client.removeListener("error", handleError);
      cleanupClient();
      if (isMountedRef.current) {
        setStatus("idle");
      }
    };
  }, [brokerUrl, cleanupClient, decodePayload, isEnabled, subscribeToPins]);

  useEffect(() => {
    if (status !== "connected") return;
    subscribeToPins();
  }, [status, subscribeToPins]);

  const publishMetadata = useCallback(
    (icName: string, payload: MQTTMetadataPayload) => {
      const slug = slugifySegment(icName || "ic");
      const topic = `${baseTopic}/${slug}`;
      const enriched = {
        ...payload,
        icName,
        slug,
        publishedAt: Date.now(),
      };
      return publishRetained(topic, stringifyPayload(enriched));
    },
    [baseTopic, publishRetained]
  );

  const publishPinLevel = useCallback(
    (pin: number, level: 0 | 1) => {
      if (!Number.isFinite(pin)) return false;
      const topic = `${baseTopic}/pin/${pin}`;
      return publishRetained(topic, `${level}`);
    },
    [baseTopic, publishRetained]
  );

  const publishPinCollections = useCallback(
    (inputs: number[], outputs: number[]) => {
      const inputTopic = `${baseTopic}/inputs`;
      const outputTopic = `${baseTopic}/outputs`;
      const nextInputs = [...new Set(inputs)].sort((a, b) => a - b);
      const nextOutputs = [...new Set(outputs)].sort((a, b) => a - b);
      const inputsResult = publishRetained(
        inputTopic,
        stringifyPayload(nextInputs)
      );
      const outputsResult = publishRetained(
        outputTopic,
        stringifyPayload(nextOutputs)
      );
      return inputsResult && outputsResult;
    },
    [baseTopic, publishRetained]
  );

  const setPinMessageHandler = useCallback((handler: PinMessageHandler | null) => {
    pinHandlerRef.current = handler;
  }, []);

  return {
    brokerUrl,
    setBrokerUrl,
    baseTopic,
    setBaseTopic,
    isEnabled,
    setEnabled,
    status,
    error,
    clientId: clientIdRef.current,
    lastMessage,
    publishMetadata,
    publishPinLevel,
    publishPinCollections,
    setPinMessageHandler,
  };
};
