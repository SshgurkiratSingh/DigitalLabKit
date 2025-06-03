"use client";

import { useState } from "react";
import { LogEntry } from "../types"; // Import LogEntry

export interface DebugLogProps {
  logs: LogEntry[];
  onClearLogs: () => void;
  showDebugLog: boolean;
  onToggleShowDebugLog: () => void;
  onCommand: (command: string) => void; // For "Request Sync", "Show Buffer"
}

export default function DebugLog({
  logs,
  onClearLogs,
  showDebugLog,
  onToggleShowDebugLog,
  onCommand,
}: DebugLogProps) {
  const [filter, setFilter] = useState<"all" | LogEntry["type"]>("all");

  // Filter logs based on selected type
  const filteredLogs = logs.filter(log => filter === "all" || log.type === filter);

  if (!showDebugLog) {
    // This button is an example; parent might have its own "Show" button
    // Or this component can be conditionally rendered by the parent entirely.
    // For now, let's assume the parent controls rendering or uses onToggleShowDebugLog
    // with its own button. If this component needs to render a show button when hidden,
    // it can be done like this:
    // return (
    //   <button
    //     onClick={onToggleShowDebugLog}
    //     className="px-4 py-2 text-sm bg-purple-700 text-purple-100 rounded-md hover:bg-purple-600"
    //   >
    //     Show Debug Log
    //   </button>
    // );
    return null; // Or simply render nothing if parent handles the "show" button
  }

  return (
    <div className="md:col-span-2 p-6 bg-[var(--background)] rounded-lg shadow-lg border-2 border-blue-500 mt-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-[var(--foreground)] flex items-center">
          <span className="mr-2">🔍</span>
          Debug Log
        </h2>
        <div className="flex space-x-2">
          {/* Filter Dropdown */}
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
            <option value="warning">Warning</option>
          </select>

          {/* Action Buttons */}
          <button
            onClick={onToggleShowDebugLog}
            className="px-4 py-2 text-sm bg-purple-700 text-purple-100 rounded-md hover:bg-purple-600"
          >
            Hide Debug Log
          </button>
          <button
            onClick={onClearLogs} // Use prop
            className="px-4 py-2 text-sm bg-red-700 text-red-100 rounded-md hover:bg-red-600 dark:bg-red-900 dark:text-red-100 dark:hover:bg-red-800"
          >
            Clear Log
          </button>
          <button
            onClick={() => onCommand("SYNC")} // Use prop
            // disabled={!isDeviceConnected} // isDeviceConnected would need to be passed as a prop
            className="px-4 py-2 text-sm bg-blue-700 text-blue-100 rounded-md hover:bg-blue-600 dark:bg-blue-900 dark:text-blue-100 dark:hover:bg-blue-800" // Consider disabled state based on props
          >
            Request Sync
          </button>
          <button
            onClick={() => onCommand("SHOW_BUFFER")} // Use prop
            className="px-4 py-2 text-sm bg-yellow-700 text-yellow-100 rounded-md hover:bg-yellow-600 dark:bg-yellow-900 dark:text-yellow-100 dark:hover:bg-yellow-800"
          >
            Show Buffer
          </button>
        </div>
      </div>

      <div className="h-96 overflow-y-auto border rounded border-neutral-700 bg-neutral-800">
        <table className="min-w-full w-full table-fixed">
          <thead className="bg-neutral-800 sticky top-0">
            <tr>
              <th className="w-1/4 px-4 py-2 text-left text-xs font-medium text-neutral-400">Time</th>
              <th className="w-1/6 px-4 py-2 text-left text-xs font-medium text-neutral-400">Type</th>
              <th className="w-auto px-4 py-2 text-left text-xs font-medium text-neutral-400">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-700">
            {filteredLogs.map((log, index) => (
              <tr key={index} className="hover:bg-neutral-700">
                <td className="px-4 py-2 text-sm text-neutral-400 break-all">
                  {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
                </td>
                <td className="px-4 py-2 break-all">
                  <span className={`inline-block px-2 py-1 text-xs rounded ${
                    log.type === "received" ? "bg-green-700 text-green-100" :
                    log.type === "sent" ? "bg-blue-700 text-blue-100" :
                    log.type === "info" ? "bg-neutral-600 text-neutral-100" :
                    log.type === "warning" ? "bg-yellow-600 text-yellow-100" : // Added warning style
                    "bg-red-700 text-red-100"
                  }`}>
                    {log.type}
                  </span>
                </td>
                <td className="px-4 py-2 text-sm text-[var(--foreground)] break-all">
                  {log.message}
                </td>
              </tr>
            ))}
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center p-4 text-neutral-400">
                  No debug messages yet or matching current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}