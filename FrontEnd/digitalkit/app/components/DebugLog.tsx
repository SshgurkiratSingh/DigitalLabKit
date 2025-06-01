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
    <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold dark:text-white">Debug Log</h2>
        <div className="space-x-2">
          <select
            className="px-3 py-1 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
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
            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="h-64 overflow-y-auto border rounded dark:border-gray-700">
        <table className="min-w-full">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Time</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Type</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredLogs.map((log, index) => (
              <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </td>
                <td className="px-4 py-2">
                  <span className={`inline-block px-2 py-1 text-xs rounded ${
                    log.type === "received" ? "bg-green-100 text-green-800" :
                    log.type === "sent" ? "bg-blue-100 text-blue-800" :
                    log.type === "info" ? "bg-gray-100 text-gray-800" :
                    "bg-red-100 text-red-800"
                  }`}>
                    {log.type}
                  </span>
                </td>
                <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
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