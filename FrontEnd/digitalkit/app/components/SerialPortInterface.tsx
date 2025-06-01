"use client";

import { useState, useEffect } from "react";

// Define Web Serial API types
interface SerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface Serial extends EventTarget {
  getPorts(): Promise<SerialPort[]>;
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
  addEventListener(
    type: "connect" | "disconnect",
    listener: (event: Event) => void
  ): void;
  removeEventListener(
    type: "connect" | "disconnect",
    listener: (event: Event) => void
  ): void;
}

interface SerialPortRequestOptions {
  filters?: Array<{
    usbVendorId?: number;
    usbProductId?: number;
  }>;
}

// Extend Navigator interface
declare global {
  interface Navigator {
    serial: Serial;
  }
}

interface SerialPortInfoWrapper {
  port: SerialPort;
  info: SerialPortInfo;
}

export default function SerialPortInterface() {
  const [ports, setPorts] = useState<SerialPortInfoWrapper[]>([]);
  const [selectedPort, setSelectedPort] = useState<SerialPort | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if Web Serial API is supported
  const isSerialSupported = "serial" in navigator;

  // Request and list available ports
  const listPorts = async () => {
    try {
      const availablePorts = await navigator.serial.getPorts();
      const portsInfo = availablePorts.map((port) => ({
        port,
        info: port.getInfo(),
      }));
      setPorts(portsInfo);
      setError(null);
    } catch (err) {
      setError("Failed to list serial ports");
      console.error(err);
    }
  };

  // Request port access
  const requestPort = async () => {
    try {
      const port = await navigator.serial.requestPort();
      const portInfo = {
        port,
        info: port.getInfo(),
      };
      setPorts((prev) => [...prev, portInfo]);
      setSelectedPort(port);
      setError(null);
    } catch (err) {
      if ((err as Error).name === "NotFoundError") {
        setError("No serial port selected");
      } else {
        setError("Failed to request serial port access");
      }
      console.error(err);
    }
  };

  // Connect to selected port
  const connectToPort = async () => {
    if (!selectedPort) {
      setError("No port selected");
      return;
    }

    try {
      await selectedPort.open({ baudRate: 9600 });
      setIsConnected(true);
      setError(null);
    } catch (err) {
      setError("Failed to connect to port");
      console.error(err);
    }
  };

  // Disconnect from port
  const disconnectFromPort = async () => {
    if (!selectedPort) return;

    try {
      await selectedPort.close();
      setIsConnected(false);
      setError(null);
    } catch (err) {
      setError("Failed to disconnect from port");
      console.error(err);
    }
  };

  // Monitor port connection changes
  useEffect(() => {
    if (!isSerialSupported) return;

    const handleConnect = (e: Event) => {
      listPorts();
    };

    const handleDisconnect = (e: Event) => {
      listPorts();
      if (selectedPort && !ports.find((p) => p.port === selectedPort)) {
        setSelectedPort(null);
        setIsConnected(false);
      }
    };

    navigator.serial.addEventListener("connect", handleConnect);
    navigator.serial.addEventListener("disconnect", handleDisconnect);

    // Initial port list
    listPorts();

    return () => {
      navigator.serial.removeEventListener("connect", handleConnect);
      navigator.serial.removeEventListener("disconnect", handleDisconnect);
    };
  }, [isSerialSupported, ports, selectedPort]);

  if (!isSerialSupported) {
    return (
      <div className="p-4 bg-red-100 text-red-700 rounded-md">
        Web Serial API is not supported in this browser. Please use Chrome or
        Edge.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-md mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4 dark:text-white">
        Serial Port Interface
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
            selectedPort ? ports.findIndex((p) => p.port === selectedPort) : ""
          }
          onChange={(e) => {
            const index = parseInt(e.target.value);
            setSelectedPort(index >= 0 ? ports[index].port : null);
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
          onClick={requestPort}
          disabled={isConnected}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          Request Port
        </button>
        <button
          onClick={isConnected ? disconnectFromPort : connectToPort}
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
        <div className="mt-4 p-2 bg-red-100 text-red-700 rounded">{error}</div>
      )}
    </div>
  );
}
