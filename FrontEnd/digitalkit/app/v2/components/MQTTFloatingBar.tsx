"use client";

import { useMemo } from "react";
import type { MQTTMessageSummary, MQTTStatus } from "../hooks/useMQTTBridge";

interface MQTTFloatingBarProps {
  collapsed: boolean;
  onToggle: () => void;
  status: MQTTStatus;
  isEnabled: boolean;
  setEnabled: (value: boolean) => void;
  brokerUrl: string;
  setBrokerUrl: (value: string) => void;
  baseTopic: string;
  setBaseTopic: (value: string) => void;
  clientId: string;
  lastMessage: MQTTMessageSummary | null;
  error: string | null;
}

const statusAccent: Record<MQTTStatus | "disabled", string> = {
  connected: "text-emerald-300",
  connecting: "text-amber-300",
  idle: "text-slate-200",
  error: "text-rose-300",
  disabled: "text-slate-500",
};

const statusLabel: Record<MQTTStatus, string> = {
  connected: "Connected",
  connecting: "Connecting",
  idle: "Idle",
  error: "Error",
};

const MQTTFloatingBar = ({
  collapsed,
  onToggle,
  status,
  isEnabled,
  setEnabled,
  brokerUrl,
  setBrokerUrl,
  baseTopic,
  setBaseTopic,
  clientId,
  lastMessage,
  error,
}: MQTTFloatingBarProps) => {
  const resolvedStatus = isEnabled ? status : "disabled";
  const statusText = isEnabled ? statusLabel[status] : "Disabled";
  const exampleTopic = useMemo(() => `${baseTopic}/pin/1`, [baseTopic]);
  const lastMessageText = lastMessage
    ? `${new Date(lastMessage.timestamp).toLocaleTimeString()} • ${
        lastMessage.topic
      }`
    : "No traffic yet";

  return (
    <aside
      className={`fixed bottom-6 right-6 z-40 w-[320px] rounded-[26px] border border-cyan-400/50 bg-gradient-to-br from-slate-900/95 via-slate-900/70 to-slate-900/40 p-4 text-white shadow-[0_0_45px_rgba(34,211,238,0.45)] backdrop-blur-xl transition-all ${
        collapsed ? "opacity-80" : "opacity-100"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.35em] text-cyan-300">
            MQTT Panel
          </p>
          <p
            className={`text-sm font-semibold ${statusAccent[resolvedStatus]}`}
          >
            {statusText}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEnabled(!isEnabled)}
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
              isEnabled
                ? "bg-emerald-500/30 text-emerald-50 hover:bg-emerald-500/50"
                : "bg-slate-700/60 text-slate-200 hover:bg-slate-700"
            }`}
          >
            {isEnabled ? "On" : "Off"}
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="rounded-full border border-cyan-500/60 px-3 py-1 text-xs text-cyan-100 hover:bg-cyan-500/10"
          >
            {collapsed ? "Expand" : "Hide"}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="mt-3 space-y-3 text-[13px] text-cyan-50">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-cyan-200">
              Broker URL
            </label>
            <input
              type="text"
              value={brokerUrl}
              onChange={(event) => setBrokerUrl(event.target.value)}
              className="mt-1 w-full rounded-2xl border border-cyan-500/40 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-300 focus:outline-none"
              placeholder="ws://localhost:9001/mqtt"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-cyan-200">
              Base Topic
            </label>
            <input
              type="text"
              value={baseTopic}
              onChange={(event) => setBaseTopic(event.target.value)}
              className="mt-1 w-full rounded-2xl border border-fuchsia-500/40 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-300 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-cyan-200/80">
              Example pin topic:{" "}
              <span className="font-mono">{exampleTopic}</span>
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-cyan-100">
            <p>
              Client ID:{" "}
              <span className="font-mono text-cyan-200">{clientId}</span>
            </p>
            <p>Last message: {lastMessageText}</p>
            {error && <p className="text-rose-300">Error: {error}</p>}
          </div>
        </div>
      )}
    </aside>
  );
};

export default MQTTFloatingBar;
