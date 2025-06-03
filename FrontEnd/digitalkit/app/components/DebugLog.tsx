"use client";

import { useState, useEffect } from "react";

interface LogEntry {
  timestamp: string;
  type: "received" | "sent" | "info" | "error";
  message: string;
}

export default function DebugLog() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<"all" | "received" | "sent" | "info" | "error">("all");

  // Add a new log entry
  const addLog = (type: LogEntry["type"], message: string) => {
    const timestamp = new Date().toISOString();
    setLogs(prev => [...prev, { timestamp, type, message }]);
  };

  // Clear all logs
  const clearLogs = () => {
    setLogs([]);
  };

  // Filter logs based on selected type
  const filteredLogs = logs.filter(log => filter === "all" || log.type === filter);

  return (
    <div className="p-6 bg-[var(--background)] rounded-xl shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-[var(--foreground)]">Debug Log</h2>
        <div className="space-x-2">
          <select
            className="px-3 py-1 border rounded bg-neutral-800 text-[var(--foreground)] border-neutral-600"
            value={filter}
            onChange={(e) => setFilter(e.target.value as LogEntry["type"] | "all")}
          >
            <option value="all">All</option>
            <option value="received">Received</option>
            <option value="sent">Sent</option>
            <option value="info">Info</option>
            <option value="error">Error</option>
          </select>
          <button
            onClick={clearLogs}
            className="px-3 py-1 bg-red-700 text-red-100 rounded hover:bg-red-600"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="h-64 overflow-y-auto border rounded border-neutral-700">
        <table className="min-w-full">
          <thead className="bg-neutral-800">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">Time</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">Type</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-neutral-400">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-700">
            {filteredLogs.map((log, index) => (
              <tr key={index} className="hover:bg-neutral-700">
                <td className="px-4 py-2 text-sm text-neutral-400">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </td>
                <td className="px-4 py-2">
                  <span className={`inline-block px-2 py-1 text-xs rounded ${
                    log.type === "received" ? "bg-green-700 text-green-100" :
                    log.type === "sent" ? "bg-blue-700 text-blue-100" :
                    log.type === "info" ? "bg-neutral-600 text-neutral-100" :
                    "bg-red-700 text-red-100"
                  }`}>
                    {log.type}
                  </span>
                </td>
                <td className="px-4 py-2 text-sm text-[var(--foreground)]">
                  {log.message}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}