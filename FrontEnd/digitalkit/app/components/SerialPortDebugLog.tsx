"use client";

import { DebugLogEntry } from "../types/serial";

interface SerialPortDebugLogProps {
  logs: DebugLogEntry[];
  onClearLogs: () => void;
  onRequestSync: () => void;
  onShowBuffer: () => void;
  isConnected: boolean;
}

export default function SerialPortDebugLog({
  logs,
  onClearLogs,
  onRequestSync,
  onShowBuffer,
  isConnected,
}: SerialPortDebugLogProps) {
  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md border-2 border-blue-500">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold dark:text-white flex items-center">
          <span className="mr-2">🔍</span>
          Debug Log
        </h2>
        <div className="flex space-x-2">
          <button
            onClick={onClearLogs}
            className="px-3 py-1 text-sm bg-red-100 text-red-800 rounded hover:bg-red-200 dark:bg-red-900 dark:text-red-100 dark:hover:bg-red-800"
          >
            Clear Log
          </button>
          <button
            onClick={onRequestSync}
            disabled={!isConnected}
            className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-100 dark:hover:bg-blue-800 disabled:opacity-50"
          >
            Request Sync
          </button>
          <button
            onClick={onShowBuffer}
            className="px-3 py-1 text-sm bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200 dark:bg-yellow-900 dark:text-yellow-100 dark:hover:bg-yellow-800"
          >
            Show Buffer
          </button>
        </div>
      </div>

      <div className="h-64 overflow-y-auto border rounded dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="sticky top-0 bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
            <div className="col-span-2">Time</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-8">Message</div>
          </div>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {logs
            .slice()
            .reverse()
            .map((log, index) => (
              <div
                key={index}
                className="grid grid-cols-12 gap-2 px-4 py-2 text-sm hover:bg-white dark:hover:bg-gray-800"
              >
                <div className="col-span-2 text-gray-500 dark:text-gray-400">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </div>
                <div className="col-span-2">
                  <span
                    className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                      log.type === "received"
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                        : log.type === "sent"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"
                        : log.type === "info"
                        ? "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100"
                        : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100"
                    }`}
                  >
                    {log.type}
                  </span>
                </div>
                <div className="col-span-8 font-mono text-gray-900 dark:text-gray-100 break-all">
                  {log.message}
                </div>
              </div>
            ))}
        </div>
      </div>

      {logs.length === 0 && (
        <div className="text-center p-4 text-gray-500 dark:text-gray-400">
          No debug messages yet
        </div>
      )}
    </div>
  );
}