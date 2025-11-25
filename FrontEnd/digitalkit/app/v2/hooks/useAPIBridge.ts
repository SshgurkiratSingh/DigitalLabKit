"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type APIStatus = "idle" | "connecting" | "connected" | "error";

type PinMessageHandler = (message: PinMessage) => void;

export interface APIMetadataPayload {
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

interface APIBridgeOptions {
  defaultBackendUrl?: string;
  defaultBaseTopic?: string;
  autoEnable?: boolean;
  pollingInterval?: number; // milliseconds, default 2000
}

export interface APIMessageSummary {
  topic: string;
  payload: string;
  timestamp: number;
}

interface APIBridgeResult {
  backendUrl: string;
  setBackendUrl: (url: string) => void;
  baseTopic: string;
  setBaseTopic: (value: string) => void;
  isEnabled: boolean;
  setEnabled: (value: boolean) => void;
  pollingInterval: number;
  setPollingInterval: (value: number) => void;
  status: APIStatus;
  error: string | null;
  clientId: string;
  lastMessage: APIMessageSummary | null;
  publishMetadata: (
    icName: string,
    payload: APIMetadataPayload
  ) => Promise<boolean>;
  publishExtendedMetadata: (
    icName: string,
    payload: APIMetadataPayload & {
      inputPins?: number[];
      outputPins?: number[];
      powerPins?: { vcc?: number; gnd?: number };
      clockPins?: number[];
    }
  ) => Promise<boolean>;
  publishPinLevel: (pin: number, level: 0 | 1) => Promise<boolean>;
  publishPinCollections: (
    inputs: number[],
    outputs: number[]
  ) => Promise<boolean>;
  setPinMessageHandler: (handler: PinMessageHandler | null) => void;
}

// Use Next.js API proxy instead of direct backend connection
const DEFAULT_BACKEND_URL = "";
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

export const useAPIBridge = (
  options?: APIBridgeOptions
): APIBridgeResult => {
  const [backendUrl, setBackendUrl] = useState(
    options?.defaultBackendUrl ?? DEFAULT_BACKEND_URL
  );
  const [baseTopic, setBaseTopicState] = useState(
    sanitizeTopicBase(options?.defaultBaseTopic ?? DEFAULT_BASE_TOPIC)
  );
  const setBaseTopic = useCallback((value: string) => {
    setBaseTopicState(sanitizeTopicBase(value));
  }, []);

  const [isEnabled, setEnabled] = useState(options?.autoEnable ?? true);
  const [pollingInterval, setPollingInterval] = useState(
    options?.pollingInterval ?? 2000
  );
  const [status, setStatus] = useState<APIStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<APIMessageSummary | null>(
    null
  );

  const clientIdRef = useRef(
    `digitalkit-${Math.random().toString(16).slice(2, 10)}`
  );
  const pinHandlerRef = useRef<PinMessageHandler | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const isMountedRef = useRef(true);

  // Use browser-safe timeout/interval types
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  const lastPollTimestampRef = useRef<number>(0);
  const lastPublishTimeRef = useRef<number>(0);

  const cleanupEventSource = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const source = eventSourceRef.current;
    if (!source) return;
    try {
      source.close();
    } catch (cleanupError) {
      console.warn("[API Bridge] cleanup error", cleanupError);
    }
    eventSourceRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      // On unmount, clean SSE + polling
      cleanupEventSource();
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [cleanupEventSource]);

  const sendToBackend = useCallback(
    async (
      endpoint: string,
      payload: Record<string, unknown>
    ): Promise<boolean> => {
      if (!isEnabled) {
        console.warn(`[API Bridge] request dropped ${endpoint} (disabled)`);
        return false;
      }
      try {
        // Use Next.js proxy: /api/proxy/api/... => backend /api/...
        const proxyEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
        const url = backendUrl ? `${backendUrl}${endpoint}` : `/api/proxy/${proxyEndpoint}`;
        
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...payload, clientId: clientIdRef.current }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        console.info("[API Bridge] ↑", endpoint, payload);

        // Track publish time to delay next poll
        lastPublishTimeRef.current = Date.now();

        return result.success !== false;
      } catch (err) {
        console.error(`[API Bridge] request failed ${endpoint}`, err);
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
        return false;
      }
    },
    [backendUrl, isEnabled]
  );

  const pollForUpdates = useCallback(async () => {
    if (!isEnabled || typeof window === "undefined") return;

    // Wait 1 second after publishing before polling
    const timeSinceLastPublish = Date.now() - lastPublishTimeRef.current;
    if (timeSinceLastPublish < 1000) {
      console.info("[API Bridge] Skipping poll - recently published data");
      return;
    }

    try {
      // Use Next.js proxy for polling
      const endpoint = backendUrl 
        ? `${backendUrl}/api/messages` 
        : `/api/proxy/api/messages`;
      
      const url = new URL(endpoint, typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
      url.searchParams.set("since", String(lastPollTimestampRef.current));
      url.searchParams.set("baseTopic", baseTopic);

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // Update last poll timestamp
      if (data.serverTime) {
        lastPollTimestampRef.current = data.serverTime;
      }

      // Process messages
      if (data.messages && data.messages.length > 0) {
        console.info(
          "[API Bridge] Poll received",
          data.messages.length,
          "messages"
        );

        data.messages.forEach((msg: any) => {
          if (msg.event === "pin" && msg.data.pin && msg.data.level !== undefined) {
            const normalizedLevel = normalizeIncomingLevel(
              String(msg.data.level)
            );
            if (normalizedLevel !== null) {
              console.info(
                "[API Bridge] ↓ MQTT pin update (poll): pin",
                msg.data.pin,
                "=>",
                normalizedLevel
              );
              pinHandlerRef.current?.({
                pin: msg.data.pin,
                level: normalizedLevel,
                topic: msg.data.topic,
                rawPayload: String(msg.data.payload),
              });
            }
          }
        });
      }

      // Update status based on backend's MQTT state
      if (data.mqtt === "connected") {
        setStatus("connected");
        setError(null);
      } else if (data.mqtt === "disconnected") {
        setStatus("error");
        setError("MQTT broker disconnected");
      }
    } catch (err) {
      console.error("[API Bridge] poll error", err);
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [backendUrl, baseTopic, isEnabled]);

  // Keep latest pollForUpdates in a ref so intervals always see the newest version
  const pollForUpdatesRef = useRef(pollForUpdates);
  useEffect(() => {
    pollForUpdatesRef.current = pollForUpdates;
  }, [pollForUpdates]);

  const connectEventStream = useCallback(() => {
    if (!isEnabled || typeof window === "undefined") return;

    cleanupEventSource();

    console.info("[API Bridge] connecting to event stream via proxy");
    setStatus("connecting");
    setError(null);

    // Use Next.js proxy for SSE
    const endpoint = backendUrl ? `${backendUrl}/events` : `/api/events`;
    const url = new URL(endpoint, typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
    url.searchParams.set("clientId", clientIdRef.current);
    url.searchParams.set("baseTopic", baseTopic);

    const source = new EventSource(url.toString());
    eventSourceRef.current = source;

    source.onopen = () => {
      if (!isMountedRef.current) return;
      console.info("[API Bridge] connected to event stream");
      setStatus("connected");
      setError(null);
    };

    source.onerror = (event) => {
      if (!isMountedRef.current) return;
      console.error("[API Bridge] event stream error", event);
      setStatus("error");
      setError("Event stream connection failed");

      cleanupEventSource();

      if (isEnabled) {
        reconnectTimeoutRef.current = setTimeout(() => {
          console.info("[API Bridge] attempting reconnection...");
          connectEventStream();
        }, 3000);
      }
    };

    source.addEventListener("pin", (event) => {
      if (!isMountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        const { pin, level, topic, payload } = data;

        setLastMessage({
          topic,
          payload: String(payload),
          timestamp: Date.now(),
        });

        const normalizedLevel = normalizeIncomingLevel(String(level));
        if (normalizedLevel === null) {
          console.warn("[API Bridge] ↓ pin", pin, "invalid level:", level);
          return;
        }

        console.info(
          "[API Bridge] ↓ MQTT pin update: pin",
          pin,
          "=>",
          normalizedLevel,
          "forwarding to hardware"
        );
        pinHandlerRef.current?.({
          pin,
          level: normalizedLevel,
          topic,
          rawPayload: String(payload),
        });
      } catch (err) {
        console.error("[API Bridge] failed to parse pin message", err);
      }
    });

    source.addEventListener("metadata", (event) => {
      if (!isMountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        console.info("[API Bridge] ↓ metadata", data);
        setLastMessage({
          topic: data.topic || "metadata",
          payload: event.data,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error("[API Bridge] failed to parse metadata message", err);
      }
    });

    source.addEventListener("message", (event) => {
      if (!isMountedRef.current) return;
      console.info("[API Bridge] ↓ message", event.data);
      setLastMessage({
        topic: "message",
        payload: event.data,
        timestamp: Date.now(),
      });
    });
  }, [backendUrl, baseTopic, isEnabled, cleanupEventSource]);

  // Helper that (re)starts polling whenever needed
  const startPolling = useCallback(() => {
    if (!isEnabled || typeof window === "undefined") {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    // Clear any existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    // Immediate poll
    console.info("[API Bridge] Polling immediately (startPolling)");
    pollForUpdatesRef.current();

    // Start interval with current pollingInterval
    console.info(
      "[API Bridge] Starting polling with interval:",
      pollingInterval,
      "ms"
    );
    const id = setInterval(() => {
      console.info(
        "[API Bridge] Polling tick at",
        new Date().toLocaleTimeString()
      );
      pollForUpdatesRef.current();
    }, pollingInterval);

    pollingIntervalRef.current = id;
  }, [isEnabled, pollingInterval]);

  // Main effect to wire polling + SSE together
  useEffect(() => {
    if (!isEnabled) {
      console.info("[API Bridge] Disabled - cleaning up polling + SSE");
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      cleanupEventSource();
      setStatus("idle");
      setError(null);
      return;
    }

    // Initialize last poll window
    lastPollTimestampRef.current = Date.now() - 5000; // last 5 seconds

    // Start polling with current interval
    startPolling();

    // Connect SSE for real-time updates
    connectEventStream();

    return () => {
      console.info("[API Bridge] Cleaning up polling + SSE (effect cleanup)");
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      cleanupEventSource();
      if (isMountedRef.current) {
        setStatus("idle");
      }
    };
  }, [isEnabled, backendUrl, baseTopic, startPolling, connectEventStream, cleanupEventSource]);

  const publishMetadata = useCallback(
    async (icName: string, payload: APIMetadataPayload): Promise<boolean> => {
      const slug = slugifySegment(icName || "ic");
      const topic = `${baseTopic}/${slug}`;
      const enriched = {
        ...payload,
        icName,
        slug,
        publishedAt: Date.now(),
      };

      const success = await sendToBackend("/api/metadata", {
        baseTopic,
        topic,
        payload: enriched,
      });

      if (success) {
        setLastMessage({
          topic,
          payload: stringifyPayload(enriched),
          timestamp: Date.now(),
        });
      }

      return success;
    },
    [baseTopic, sendToBackend]
  );

  const publishExtendedMetadata = useCallback(
    async (
      icName: string,
      payload: APIMetadataPayload & {
        inputPins?: number[];
        outputPins?: number[];
        powerPins?: { vcc?: number; gnd?: number };
        clockPins?: number[];
      }
    ): Promise<boolean> => {
      const slug = slugifySegment(icName || "ic");
      const topic = `${baseTopic}/${slug}`;
      const enriched = {
        ...payload,
        icName,
        slug,
        publishedAt: Date.now(),
      };

      const success = await sendToBackend("/api/metadata", {
        baseTopic,
        topic,
        payload: enriched,
      });

      if (success) {
        setLastMessage({
          topic,
          payload: stringifyPayload(enriched),
          timestamp: Date.now(),
        });
      }

      return success;
    },
    [baseTopic, sendToBackend]
  );

  const publishPinLevel = useCallback(
    async (pin: number, level: 0 | 1): Promise<boolean> => {
      if (!Number.isFinite(pin)) return false;
      const topic = `${baseTopic}/pin/${pin}`;

      const success = await sendToBackend("/api/pin-level", {
        baseTopic,
        topic,
        pin,
        level,
      });

      if (success) {
        setLastMessage({
          topic,
          payload: `${level}`,
          timestamp: Date.now(),
        });
      }

      return success;
    },
    [baseTopic, sendToBackend]
  );

  const publishPinCollections = useCallback(
    async (inputs: number[], outputs: number[]): Promise<boolean> => {
      const inputTopic = `${baseTopic}/inputs`;
      const outputTopic = `${baseTopic}/outputs`;
      const nextInputs = [...new Set(inputs)].sort((a, b) => a - b);
      const nextOutputs = [...new Set(outputs)].sort((a, b) => a - b);

      const success = await sendToBackend("/api/pin-collections", {
        baseTopic,
        inputs: nextInputs,
        outputs: nextOutputs,
      });

      if (success) {
        setLastMessage({
          topic: `${inputTopic}, ${outputTopic}`,
          payload: `inputs: ${nextInputs.length}, outputs: ${nextOutputs.length}`,
          timestamp: Date.now(),
        });
      }

      return success;
    },
    [baseTopic, sendToBackend]
  );

  const setPinMessageHandler = useCallback(
    (handler: PinMessageHandler | null) => {
      pinHandlerRef.current = handler;
    },
    []
  );

  return {
    backendUrl,
    setBackendUrl,
    baseTopic,
    setBaseTopic,
    isEnabled,
    setEnabled,
    pollingInterval,
    setPollingInterval,
    status,
    error,
    clientId: clientIdRef.current,
    lastMessage,
    publishMetadata,
    publishExtendedMetadata,
    publishPinLevel,
    publishPinCollections,
    setPinMessageHandler,
  };
};
