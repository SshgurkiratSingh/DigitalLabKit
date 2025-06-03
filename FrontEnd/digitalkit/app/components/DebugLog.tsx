"use client";

import React, { useState } from "react";

export interface LogEntry {
  timestamp: string;
  type: "received" | "sent" | "info" | "error" | "warning";
  message: string;
}

interface DebugLogProps {
  logs: LogEntry[];
  onClearLogs: () => void;
  // Props for integrating controls previously in SerialPortInterface's DebugLogView
  showLogProp: boolean; // Renamed to avoid conflict if internal state was named showDebugLog
  onToggleShow: () => void;
  onRequestSync: () => void;
  isSerialConnected: boolean;
  title?: string;
}

export default function DebugLog({
  logs,
  onClearLogs,
  showLogProp,
  onToggleShow,
  onRequestSync,
  isSerialConnected,
  title = "Debug Log", // Default title from SerialPortInterface context
}: DebugLogProps) {
  const [filter, setFilter] = useState<"all" | LogEntry["type"]>("all");

  const filteredLogs = logs.filter(log => filter === "all" || log.type === filter);

  const getLogTypeClass = (type: LogEntry["type"]): string => {
    switch (type) {
      case "received":
        return "bg-green-700 text-green-100 dark:bg-green-900 dark:text-green-100";
      case "sent":
        return "bg-blue-700 text-blue-100 dark:bg-blue-900 dark:text-blue-100";
      case "info":
        return "bg-neutral-600 text-neutral-100 dark:bg-gray-900 dark:text-gray-100";
      case "error":
        return "bg-red-700 text-red-100 dark:bg-red-900 dark:text-red-100";
      case "warning":
        return "bg-yellow-600 text-yellow-100 dark:bg-yellow-800 dark:text-yellow-100";
      default:
        return "bg-gray-500 text-white";
    }
  };

  // If the parent dictates not to show the log, render nothing.
  // The parent will handle the button to toggle visibility.
  if (!showLogProp) {
    return null;
  }

  return (
    // This is the main container structure from SerialPortInterface's DebugLogView
    <div className="p-6 bg-[var(--background)] rounded-lg shadow-lg border-2 border-blue-500">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-[var(--foreground)] flex items-center">
          <span className="mr-2">🔍</span>
          {title}
        </h2>
        <div className="flex space-x-2">
          <button
            onClick={onToggleShow}
            className="px-4 py-2 text-sm bg-purple-700 text-purple-100 rounded-md hover:bg-purple-600"
          >
            {showLogProp ? "Hide Log" : "Show Log"} {/* Text dynamically based on prop */}
          </button>
          <button
            onClick={onClearLogs} // Changed from handleClearLogs to use prop directly
            className="px-4 py-2 text-sm bg-red-700 text-red-100 rounded-md hover:bg-red-600 dark:bg-red-900 dark:text-red-100 dark:hover:bg-red-800"
          >
            Clear Log
          </button>
          <button
            onClick={onRequestSync}
            disabled={!isSerialConnected}
            className="px-4 py-2 text-sm bg-blue-700 text-blue-100 rounded-md hover:bg-blue-600 dark:bg-blue-900 dark:text-blue-100 dark:hover:bg-blue-800 disabled:opacity-50"
          >
            Request Sync
          </button>
        </div>
      </div>

      <div className="mb-4"> {/* Container for the filter dropdown */}
        <select
          className="px-3 py-1 border rounded bg-neutral-800 text-[var(--foreground)] border-neutral-600 focus:ring-blue-500 focus:border-blue-500"
          value={filter}
          onChange={(e) => setFilter(e.target.value as LogEntry["type"] | "all")}
          aria-label="Filter logs by type"
        >
          <option value="all">All Types</option>
          <option value="received">Received</option>
          <option value="sent">Sent</option>
          <option value="info">Info</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
        </select>
      </div>

      {/* Using the grid-based layout for log entries from SerialPortInterface's DebugLogView */}
      <div className="h-96 overflow-y-auto border rounded border-neutral-700 bg-neutral-800">
        <div className="sticky top-0 bg-neutral-700 border-b border-neutral-600 z-10">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-neutral-400">
            <div className="col-span-3 md:col-span-2">Time</div>
            <div className="col-span-2 md:col-span-2">Type</div>
            <div className="col-span-7 md:col-span-8">Message</div>
          </div>
        </div>
        <div className="divide-y divide-neutral-700">
          {filteredLogs.map((log, index) => (
            <div
              key={index}
              className="grid grid-cols-12 gap-2 px-4 py-2 text-sm hover:bg-neutral-700"
            >
              <div className="col-span-3 md:col-span-2 text-neutral-400">
                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
              </div>
              <div className="col-span-2 md:col-span-2">
                <span
                  className={`inline-block px-2 py-0.5 text-xs rounded-full ${getLogTypeClass(log.type)}`}
                >
                  {log.type}
                </span>
              </div>
              <div className="col-span-7 md:col-span-8 font-mono text-[var(--foreground)] break-words whitespace-pre-wrap">
                {log.message}
              </div>
            </div>
          ))}
        </div>
      </div>
      {logs.length > 0 && filteredLogs.length === 0 && (
        <div className="text-center p-4 text-neutral-400 text-sm">
          No logs match the current filter.
        </div>
      )}
      {logs.length === 0 && (
         <div className="text-center p-4 text-neutral-400 text-sm">
            No debug messages yet.
        </div>
      )}
    </div>
  );
}
