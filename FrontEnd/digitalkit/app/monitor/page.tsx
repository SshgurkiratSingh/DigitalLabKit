"use client";

import { useEffect, useState, useCallback } from "react";
import { useAPIBridge } from "../v2/hooks/useAPIBridge";
import TestScriptPanel from "../v2/components/TestScriptPanel";

interface ICMetadata {
  partNumber: string;
  description: string;
  pinCount: number;
  category?: string;
  icName?: string;
  slug?: string;
  publishedAt?: number;
  inputPins?: number[];
  outputPins?: number[];
  powerPins?: { vcc?: number; gnd?: number };
  clockPins?: number[];
}

interface PinState {
  pin: number;
  level: 0 | 1;
  lastUpdate: number;
  source: string;
}

export default function MonitorPage() {
  const [metadata, setMetadata] = useState<ICMetadata | null>(null);
  const [pinStates, setPinStates] = useState<Map<number, PinState>>(new Map());
  const [inputPins, setInputPins] = useState<number[]>([]);
  const [outputPins, setOutputPins] = useState<number[]>([]);
  const [connectionTime, setConnectionTime] = useState<number | null>(null);
  const [scriptPanelCollapsed, setScriptPanelCollapsed] = useState(true);

  const {
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
    clientId,
    lastMessage,
    setPinMessageHandler,
    publishPinLevel,
  } = useAPIBridge({
    defaultBaseTopic: "digitalkit/pins",
    autoEnable: true,
    pollingInterval: 1000, // More frequent for monitoring
  });

  useEffect(() => {
    if (status === "connected" && !connectionTime) {
      setConnectionTime(Date.now());
    }
  }, [status, connectionTime]);

  // Handle incoming pin messages from SSE and polling
  useEffect(() => {
    const handler = ({
      pin,
      level,
      topic,
    }: {
      pin: number;
      level: 0 | 1;
      topic: string;
      rawPayload: string;
    }) => {
      console.log("[Monitor] Pin handler called:", pin, "=>", level);
      setPinStates((prev) => {
        const newMap = new Map(prev);
        newMap.set(pin, {
          pin,
          level,
          lastUpdate: Date.now(),
          source: topic,
        });
        return newMap;
      });
    };

    setPinMessageHandler(handler);

    return () => {
      setPinMessageHandler(null);
    };
  }, [setPinMessageHandler]);

  // Fetch initial metadata and pin collections from backend
  useEffect(() => {
    if (!isEnabled || status !== "connected") return;

    const fetchMetadata = async () => {
      try {
        const response = await fetch(
          `${backendUrl}/api/messages?since=0&baseTopic=${baseTopic}`
        );
        const data = await response.json();

        console.log("[Monitor] Fetched messages:", data.messages?.length || 0);

        if (data.messages) {
          data.messages.forEach(
            (msg: {
              event: string;
              data: {
                topic: string;
                payload: string;
                pin?: number;
                level?: number | string;
              };
            }) => {
              console.log(
                "[Monitor] Processing message:",
                msg.event,
                msg.data.topic
              );

              if (msg.event === "metadata" && msg.data.payload) {
                try {
                  const parsed = JSON.parse(msg.data.payload);
                  console.log("[Monitor] Setting metadata:", parsed);
                  setMetadata(parsed);
                } catch (e) {
                  console.error("Failed to parse metadata", e);
                }
              } else if (msg.event === "collections") {
                if (msg.data.topic.includes("/inputs")) {
                  try {
                    const pins = JSON.parse(msg.data.payload);
                    console.log("[Monitor] Setting input pins:", pins);
                    setInputPins(pins);
                  } catch {}
                } else if (msg.data.topic.includes("/outputs")) {
                  try {
                    const pins = JSON.parse(msg.data.payload);
                    console.log("[Monitor] Setting output pins:", pins);
                    setOutputPins(pins);
                  } catch {}
                }
              } else if (msg.event === "pin" && msg.data.pin !== undefined) {
                // Handle pin state updates from polling
                const pin = msg.data.pin;
                const level: 0 | 1 =
                  msg.data.level !== undefined
                    ? typeof msg.data.level === "number"
                      ? (msg.data.level as 0 | 1)
                      : (Number(msg.data.level) as 0 | 1)
                    : msg.data.payload === "1" || msg.data.payload === "HIGH"
                    ? 1
                    : 0;
                console.log("[Monitor] Pin update:", pin, "=>", level);
                setPinStates((prev) => {
                  const newMap = new Map(prev);
                  newMap.set(pin, {
                    pin: pin,
                    level,
                    lastUpdate: Date.now(),
                    source: msg.data.topic,
                  });
                  return newMap;
                });
              }
            }
          );
        }
      } catch (err) {
        console.error("Failed to fetch initial data", err);
      }
    };

    fetchMetadata();
  }, [isEnabled, status, backendUrl, baseTopic]);

  // Initialize all pins from metadata
  useEffect(() => {
    if (!metadata || !metadata.pinCount) return;

    console.log("[Monitor] Initializing all pins from metadata");

    setPinStates((prev) => {
      const newMap = new Map(prev);

      // Initialize all pins from 1 to pinCount if not already present
      for (let pin = 1; pin <= metadata.pinCount; pin++) {
        if (!newMap.has(pin)) {
          newMap.set(pin, {
            pin,
            level: 0,
            lastUpdate: Date.now(),
            source: "initial",
          });
        }
      }

      return newMap;
    });
  }, [metadata]);

  const getPinLabel = useCallback(
    (pin: number): string => {
      if (metadata?.powerPins?.vcc === pin) return "VCC";
      if (metadata?.powerPins?.gnd === pin) return "GND";
      if (metadata?.clockPins?.includes(pin)) return "CLK";
      if (inputPins.includes(pin)) return "INPUT";
      if (outputPins.includes(pin)) return "OUTPUT";
      return "UNUSED";
    },
    [metadata, inputPins, outputPins]
  );

  const isPinControllable = useCallback(
    (pin: number): boolean => {
      // Input pins can be controlled, power/output pins cannot
      if (metadata?.powerPins?.vcc === pin) return false;
      if (metadata?.powerPins?.gnd === pin) return false;
      if (outputPins.includes(pin)) return false;
      return inputPins.includes(pin);
    },
    [metadata, inputPins, outputPins]
  );

  const handlePinToggle = useCallback(
    async (pin: number) => {
      if (!isPinControllable(pin) || status !== "connected") return;

      const currentState = pinStates.get(pin);
      const newLevel = (currentState?.level === 1 ? 0 : 1) as 0 | 1;

      console.log(
        `[Monitor] Toggling pin ${pin} from ${currentState?.level} to ${newLevel}`
      );

      // Optimistically update UI
      setPinStates((prev) => {
        const newMap = new Map(prev);
        newMap.set(pin, {
          pin,
          level: newLevel,
          lastUpdate: Date.now(),
          source: "local",
        });
        return newMap;
      });

      // Publish to MQTT
      const success = await publishPinLevel(pin, newLevel);
      if (!success) {
        console.error(`[Monitor] Failed to publish pin ${pin} level`);
        // Revert on failure
        if (currentState) {
          setPinStates((prev) => {
            const newMap = new Map(prev);
            newMap.set(pin, currentState);
            return newMap;
          });
        }
      }
    },
    [isPinControllable, status, pinStates, publishPinLevel]
  );

  const executeScriptCommand = useCallback(
    async (pin: number, level: 0 | 1) => {
      if (status !== "connected") {
        throw new Error("Not connected to backend");
      }

      if (!isPinControllable(pin)) {
        throw new Error(`Pin ${pin} is not a controllable input pin`);
      }

      console.log(`[Monitor Script] Setting pin ${pin} to ${level}`);

      // Optimistically update UI
      setPinStates((prev) => {
        const newMap = new Map(prev);
        newMap.set(pin, {
          pin,
          level,
          lastUpdate: Date.now(),
          source: "script",
        });
        return newMap;
      });

      // Publish to MQTT
      const success = await publishPinLevel(pin, level);
      if (!success) {
        throw new Error(`Failed to publish pin ${pin} level to backend`);
      }
    },
    [status, isPinControllable, publishPinLevel]
  );

  const getPinColor = useCallback(
    (pin: number, level: 0 | 1): string => {
      if (metadata?.powerPins?.vcc === pin)
        return "bg-amber-400 shadow-amber-400/50";
      if (metadata?.powerPins?.gnd === pin)
        return "bg-gray-600 shadow-gray-600/50";
      if (level === 1) return "bg-emerald-400 shadow-emerald-400/50";
      return "bg-slate-500 shadow-slate-500/30";
    },
    [metadata]
  );

  const sortedPins = Array.from(pinStates.entries()).sort(([a], [b]) => a - b);

  const activeCount = Array.from(pinStates.values()).filter(
    (p) => p.level === 1
  ).length;

  const uptime = connectionTime
    ? Math.floor((Date.now() - connectionTime) / 1000)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-pink-950 p-6 relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-pink-500/20 rounded-full blur-3xl animate-pulse delay-500" />
      </div>

      <div className="mx-auto max-w-7xl relative z-10">
        {/* Header */}
        <header className="mb-8 text-center">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-3 drop-shadow-lg">
            Digital Lab Kit Monitor
          </h1>
          <p className="text-xl text-white/90 font-medium">
            Real-time Hardware Monitoring Dashboard
          </p>
          <p className="text-sm text-white/60 mt-2">
            View and control live data from connected hardware clients
          </p>
        </header>

        {/* Status Bar */}
        <div className="mb-6 rounded-3xl bg-white/10 backdrop-blur-2xl border border-white/20 p-6 shadow-2xl shadow-purple-500/20">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wider font-semibold">
                Connection
              </p>
              <div className="flex items-center gap-2 mt-2">
                <div
                  className={`w-3 h-3 rounded-full shadow-lg ${
                    status === "connected"
                      ? "bg-emerald-400 animate-pulse shadow-emerald-400/50"
                      : status === "connecting"
                      ? "bg-amber-400 shadow-amber-400/50"
                      : "bg-red-400 shadow-red-400/50"
                  }`}
                />
                <p className="text-white font-semibold capitalize text-lg">
                  {status}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wider font-semibold">
                Client ID
              </p>
              <p className="text-white font-mono text-sm mt-2 bg-white/5 px-3 py-1 rounded-full inline-block">
                {clientId}
              </p>
            </div>
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wider font-semibold">
                Uptime
              </p>
              <p className="text-white font-semibold mt-2 text-lg">
                {Math.floor(uptime / 60)}m {uptime % 60}s
              </p>
            </div>
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wider font-semibold">
                Polling
              </p>
              <p className="text-white font-semibold mt-2 text-lg">
                {(pollingInterval / 1000).toFixed(1)}s
              </p>
            </div>
          </div>
        </div>

        {/* IC Metadata */}
        {metadata && (
          <div className="mb-6 rounded-3xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-2xl border border-white/20 p-6 shadow-2xl shadow-purple-500/20">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent mb-5">
              Active IC: {metadata.partNumber || "Unknown"}
            </h2>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-white/60 font-medium">Description</p>
                <p className="text-white mt-1 font-semibold">
                  {metadata.description || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-white/60 font-medium">Category</p>
                <p className="text-white mt-1 capitalize font-semibold">
                  {metadata.category || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-white/60 font-medium">Pin Count</p>
                <p className="text-white mt-1 font-semibold">
                  {metadata.pinCount || "N/A"}
                </p>
              </div>
            </div>

            {/* Pin Configuration */}
            <div className="mt-5 grid md:grid-cols-3 gap-4">
              {inputPins.length > 0 && (
                <div>
                  <p className="text-white/60 text-sm mb-2 font-semibold">
                    Input Pins
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {inputPins.map((pin) => (
                      <span
                        key={pin}
                        className="px-3 py-1.5 bg-emerald-400/20 text-emerald-300 rounded-full text-xs font-mono font-bold border border-emerald-400/30 shadow-lg shadow-emerald-500/20"
                      >
                        {pin}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {outputPins.length > 0 && (
                <div>
                  <p className="text-white/60 text-sm mb-2 font-semibold">
                    Output Pins
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {outputPins.map((pin) => (
                      <span
                        key={pin}
                        className="px-3 py-1.5 bg-blue-400/20 text-blue-300 rounded-full text-xs font-mono font-bold border border-blue-400/30 shadow-lg shadow-blue-500/20"
                      >
                        {pin}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {metadata.powerPins && (
                <div>
                  <p className="text-white/60 text-sm mb-2 font-semibold">
                    Power Pins
                  </p>
                  <div className="flex gap-2">
                    {metadata.powerPins.vcc && (
                      <span className="px-3 py-1.5 bg-amber-400/20 text-amber-300 rounded-full text-xs font-mono font-bold border border-amber-400/30 shadow-lg shadow-amber-500/20">
                        VCC: {metadata.powerPins.vcc}
                      </span>
                    )}
                    {metadata.powerPins.gnd && (
                      <span className="px-3 py-1.5 bg-gray-400/20 text-gray-300 rounded-full text-xs font-mono font-bold border border-gray-400/30 shadow-lg shadow-gray-500/20">
                        GND: {metadata.powerPins.gnd}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Statistics */}
        <div className="mb-6 grid md:grid-cols-4 gap-4">
          <div className="rounded-3xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 backdrop-blur-2xl border border-white/20 p-5 shadow-2xl shadow-cyan-500/20 hover:shadow-cyan-500/30 transition-all">
            <p className="text-white/70 text-sm font-semibold">Total Pins</p>
            <p className="text-4xl font-bold bg-gradient-to-r from-cyan-300 to-blue-300 bg-clip-text text-transparent mt-2">
              {pinStates.size}
            </p>
          </div>
          <div className="rounded-3xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 backdrop-blur-2xl border border-white/20 p-5 shadow-2xl shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all">
            <p className="text-white/70 text-sm font-semibold">Controllable</p>
            <p className="text-4xl font-bold text-emerald-300 mt-2">
              {inputPins.length}
            </p>
          </div>
          <div className="rounded-3xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 backdrop-blur-2xl border border-white/20 p-5 shadow-2xl shadow-amber-500/20 hover:shadow-amber-500/30 transition-all">
            <p className="text-white/70 text-sm font-semibold">Active (HIGH)</p>
            <p className="text-4xl font-bold text-amber-300 mt-2">
              {activeCount}
            </p>
          </div>
          <div className="rounded-3xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-2xl border border-white/20 p-5 shadow-2xl shadow-purple-500/20 hover:shadow-purple-500/30 transition-all">
            <p className="text-white/70 text-sm font-semibold">Last Update</p>
            <p className="text-lg font-bold text-white mt-2">
              {lastMessage
                ? new Date(lastMessage.timestamp).toLocaleTimeString()
                : "Never"}
            </p>
          </div>
        </div>

        {/* Pin States Grid */}
        <div className="rounded-3xl bg-white/10 backdrop-blur-2xl border border-white/20 p-6 shadow-2xl shadow-cyan-500/20">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-300 to-purple-300 bg-clip-text text-transparent mb-6">
            Live Pin States
          </h2>
          {sortedPins.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-7xl mb-4">📡</div>
              <p className="text-white/80 text-xl font-semibold">
                Waiting for pin data from hardware...
              </p>
              <p className="text-white/50 text-sm mt-2">
                Make sure a client is connected to hardware and publishing data
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {sortedPins.map(([pinNumber, state]) => {
                const timeSinceUpdate = Date.now() - state.lastUpdate;
                const isRecent = timeSinceUpdate < 2000;
                const label = getPinLabel(pinNumber);
                const isControllable = isPinControllable(pinNumber);

                return (
                  <button
                    key={pinNumber}
                    onClick={() => isControllable && handlePinToggle(pinNumber)}
                    disabled={!isControllable || status !== "connected"}
                    className={`rounded-2xl bg-white/5 backdrop-blur-xl border p-4 transition-all text-left ${
                      isRecent
                        ? "border-cyan-400/50 shadow-xl shadow-cyan-400/30 bg-white/10"
                        : "border-white/20"
                    } ${
                      isControllable && status === "connected"
                        ? "hover:scale-105 hover:border-emerald-400/50 cursor-pointer"
                        : "cursor-default"
                    } ${!isControllable ? "opacity-70" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-white/70 font-bold uppercase tracking-wide">
                        Pin {pinNumber}
                      </span>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          isControllable
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                            : "bg-white/10 text-white/50"
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded-full ${getPinColor(
                          pinNumber,
                          state.level
                        )} shadow-lg ${isRecent ? "animate-pulse" : ""}`}
                      />
                      <span className="text-3xl font-bold text-white">
                        {state.level}
                      </span>
                    </div>
                    {isControllable && status === "connected" && (
                      <div className="mt-2 text-xs text-emerald-300/80 font-semibold">
                        Click to toggle
                      </div>
                    )}
                    <div className="mt-3 text-xs text-white/40 font-medium">
                      {timeSinceUpdate < 60000
                        ? `${Math.floor(timeSinceUpdate / 1000)}s ago`
                        : "old"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Settings Panel */}
        <div className="mt-6 rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/20 p-6 shadow-2xl shadow-purple-500/20">
          <h3 className="text-2xl font-bold bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent mb-6">
            Settings
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-white/70 mb-2 block font-semibold">
                Backend URL
              </label>
              <input
                type="text"
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                className="w-full rounded-2xl border border-cyan-400/30 bg-white/5 backdrop-blur-xl px-4 py-3 text-white focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all"
              />
            </div>
            <div>
              <label className="text-sm text-white/70 mb-2 block font-semibold">
                Base Topic
              </label>
              <input
                type="text"
                value={baseTopic}
                onChange={(e) => setBaseTopic(e.target.value)}
                className="w-full rounded-2xl border border-purple-400/30 bg-white/5 backdrop-blur-xl px-4 py-3 text-white focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20 transition-all"
              />
            </div>
            <div>
              <label className="text-sm text-white/70 mb-2 block font-semibold">
                Polling Interval (ms)
              </label>
              <input
                type="number"
                value={pollingInterval}
                onChange={(e) =>
                  setPollingInterval(parseInt(e.target.value) || 1000)
                }
                min="500"
                max="10000"
                step="500"
                className="w-full rounded-2xl border border-blue-400/30 bg-white/5 backdrop-blur-xl px-4 py-3 text-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setEnabled(!isEnabled)}
                className={`w-full rounded-2xl px-4 py-3 font-bold transition-all shadow-lg ${
                  isEnabled
                    ? "bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white shadow-emerald-500/30"
                    : "bg-white/10 hover:bg-white/20 text-white/70 border border-white/20"
                }`}
              >
                {isEnabled ? "Connected" : "Disconnected"}
              </button>
            </div>
          </div>
          {error && (
            <div className="mt-4 rounded-2xl bg-red-500/10 border border-red-400/50 p-4 text-red-300 text-sm font-semibold backdrop-blur-xl">
              Error: {error}
            </div>
          )}
        </div>
      </div>

      {/* Test Script Panel */}
      <TestScriptPanel
        inputPins={inputPins}
        onExecuteCommand={executeScriptCommand}
        isConnected={status === "connected"}
        collapsed={scriptPanelCollapsed}
        onToggle={() => setScriptPanelCollapsed((prev) => !prev)}
      />
    </div>
  );
}
