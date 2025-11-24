"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Buffer } from "buffer";
import mqtt, { IClientPublishOptions, MqttClient } from "mqtt";

const globalForBuffer = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
};

if (!globalForBuffer.Buffer) {
  globalForBuffer.Buffer = Buffer;
}

type SubscriptionHandler = (topic: string, payload: Uint8Array) => void;

type MQTTStatus = "idle" | "connecting" | "connected" | "error";

interface MQTTBridgeOptions {
  defaultBrokerUrl?: string; // e.g. ws://localhost:9001/mqtt
}

interface MQTTMessage {
  topic: string;
  payload: string;
  timestamp: number;
}

interface MQTTBridgeResult {
  brokerUrl: string;
  setBrokerUrl: (value: string) => void;
  isEnabled: boolean;
  setEnabled: (value: boolean) => void;
  status: MQTTStatus;
  error: string | null;
  lastMessage: MQTTMessage | null;
  clientId: string;
  publish: (
    topic: string,
    payload: string | Uint8Array,
    options?: IClientPublishOptions
  ) => boolean;
  replaceSubscriptions: (
    topics: string[],
    handler: SubscriptionHandler | null
  ) => void;
}

const DEFAULT_BROKER =
  process.env.NEXT_PUBLIC_MQTT_WS_URL || "ws://localhost:9001/mqtt";

export const useMQTTBridge = (
  options?: MQTTBridgeOptions
): MQTTBridgeResult => {
  const [brokerUrl, setBrokerUrl] = useState(
    options?.defaultBrokerUrl ?? DEFAULT_BROKER
  );
  const [isEnabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<MQTTStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<MQTTMessage | null>(null);

  const clientRef = useRef<MqttClient | null>(null);
  const desiredTopicsRef = useRef<string[]>([]);
  const activeTopicsRef = useRef<string[]>([]);
  const handlerRef = useRef<SubscriptionHandler | null>(null);
  const decoderRef = useRef<TextDecoder | null>(null);
  const isMountedRef = useRef(true);
  const clientIdRef = useRef(
    `digitalkit-${Math.random().toString(16).slice(2, 10)}`
  );

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
    } catch (err) {
      console.warn("MQTT cleanup error", err);
    }
    clientRef.current = null;
    activeTopicsRef.current = [];
  }, []);

  const syncSubscriptions = useCallback(() => {
    const client = clientRef.current;
    if (!client || !client.connected) return;
    const desired = desiredTopicsRef.current;
    const active = activeTopicsRef.current;
    const toUnsub = active.filter((topic) => !desired.includes(topic));
    const toSub = desired.filter((topic) => !active.includes(topic));
    if (toUnsub.length) {
      client.unsubscribe(toUnsub, (err) => {
        if (err) console.warn("MQTT unsubscribe error", err);
      });
    }
    if (toSub.length) {
      client.subscribe(toSub, (err) => {
        if (err) console.warn("MQTT subscribe error", err);
      });
    }
    activeTopicsRef.current = [...desired];
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cleanupClient();
    };
  }, [cleanupClient]);

  useEffect(() => {
    if (!isEnabled) {
      cleanupClient();
      setStatus("idle");
      setError(null);
      return;
    }
    if (typeof window === "undefined") return;
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
      setStatus("connected");
      setError(null);
      syncSubscriptions();
    };

    const handleReconnect = () => {
      if (!isMountedRef.current) return;
      setStatus("connecting");
    };

    const handleClose = () => {
      if (!isMountedRef.current) return;
      setStatus(isEnabled ? "connecting" : "idle");
    };

    const handleMessage = (topic: string, payload: Uint8Array) => {
      if (!isMountedRef.current) return;
      const arrayPayload =
        payload instanceof Uint8Array ? payload : new Uint8Array(payload);
      const text = decodePayload(arrayPayload);
      handlerRef.current?.(topic, arrayPayload);
      setLastMessage({ topic, payload: text, timestamp: Date.now() });
    };

    const handleError = (mqttError: Error) => {
      if (!isMountedRef.current) return;
      setStatus("error");
      setError(mqttError.message);
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
  }, [brokerUrl, cleanupClient, decodePayload, isEnabled, syncSubscriptions]);

  const replaceSubscriptions = useCallback(
    (topics: string[], handler: SubscriptionHandler | null) => {
      desiredTopicsRef.current = topics;
      handlerRef.current = handler;
      syncSubscriptions();
    },
    [syncSubscriptions]
  );

  const publish = useCallback(
    (
      topic: string,
      payload: string | Uint8Array,
      options?: IClientPublishOptions
    ) => {
      const client = clientRef.current;
      if (!client || !client.connected || !topic) return false;
      const message =
        typeof payload === "string"
          ? payload
          : Buffer.from(payload instanceof Uint8Array ? payload : new Uint8Array(payload));
      client.publish(topic, message, options ?? {});
      setLastMessage({
        topic,
        payload: typeof payload === "string" ? payload : decodePayload(payload),
        timestamp: Date.now(),
      });
      return true;
    },
    [decodePayload]
  );

  return {
    brokerUrl,
    setBrokerUrl,
    isEnabled,
    setEnabled,
    status,
    error,
    lastMessage,
    clientId: clientIdRef.current,
    publish,
    replaceSubscriptions,
  };
};
