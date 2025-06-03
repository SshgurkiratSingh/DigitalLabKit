"use client";

import { SerialPort, SerialPortInfoWrapper } from "../types/serial";

interface SerialPortConnectionProps {
  isConnected: boolean;
  ports: SerialPortInfoWrapper[];
  selectedPort: SerialPort | null;
  error: string | null;
  onPortSelect: (port: SerialPort | null) => void;
  onRequestPort: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export default function SerialPortConnection({
  isConnected,
  ports,
  selectedPort,
  error,
  onPortSelect,
  onRequestPort,
  onConnect,
  onDisconnect,
}: SerialPortConnectionProps) {
  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4 dark:text-white">
        Serial Port Connection
      </h2>

      {/* Connection Status */}
      <div className="mb-4 flex items-center">
        <div
          className={`w-3 h-3 rounded-full mr-2 ${
            isConnected ? "bg-green-500" : "bg-red-500"
          }`}
        ></div>
        <span className="dark:text-white">
          {isConnected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {/* Port Selection */}
      <div className="mb-4">
        <select
          className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
          value={
            selectedPort
              ? ports.findIndex((p) => p.port === selectedPort)
              : ""
          }
          onChange={(e) => {
            const index = parseInt(e.target.value);
            onPortSelect(index >= 0 ? ports[index].port : null);
          }}
          disabled={isConnected}
        >
          <option value="">Select a port</option>
          {ports.map((port, index) => (
            <option key={index} value={index}>
              {`Port ${index + 1} - ${port.info.usbVendorId || "Unknown"}`}
            </option>
          ))}
        </select>
      </div>

      {/* Action Buttons */}
      <div className="space-x-2">
        <button
          onClick={onRequestPort}
          disabled={isConnected}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          Request Port
        </button>
        <button
          onClick={isConnected ? onDisconnect : onConnect}
          disabled={!selectedPort}
          className={`px-4 py-2 rounded ${
            isConnected
              ? "bg-red-500 hover:bg-red-600"
              : "bg-green-500 hover:bg-green-600"
          } text-white disabled:opacity-50`}
        >
          {isConnected ? "Disconnect" : "Connect"}
        </button>
      </div>

      {/* Error Messages */}
      {error && (
        <div className="mt-4 p-2 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}
    </div>
  );
}