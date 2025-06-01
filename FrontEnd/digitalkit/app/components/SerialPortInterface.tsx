"use client";

import { useState, useEffect, useRef } from "react";
import ICSelector from "./ICSelector";
import ICVisualizer from "./ICVisualizer";

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

interface ICData {
  partNumber: string;
  description: string;
  category: string;
  pinCount: number;
  pinConfiguration: Array<{
    pin: number;
    name: string;
    type: string;
    function: string;
  }>;
}

export default function SerialPortInterface() {
  const [ports, setPorts] = useState<SerialPortInfoWrapper[]>([]);
  const [selectedPort, setSelectedPort] = useState<SerialPort | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIC, setSelectedIC] = useState<ICData | null>(null);
  const [pinStates, setPinStates] = useState<{ [key: number]: boolean }>({});
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

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
      
      // Set up the writer
      if (selectedPort.writable) {
        const writer = selectedPort.writable.getWriter();
        writerRef.current = writer;
      }

      // Set up the reader and start reading
      if (selectedPort.readable) {
        const reader = selectedPort.readable.getReader();
        readerRef.current = reader;
        startReading();
      }

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
      // Release the reader and writer
      if (readerRef.current) {
        await readerRef.current.cancel();
        await readerRef.current.releaseLock();
        readerRef.current = null;
      }
      if (writerRef.current) {
        await writerRef.current.close();
        await writerRef.current.releaseLock();
        writerRef.current = null;
      }

      await selectedPort.close();
      setIsConnected(false);
      setError(null);
    } catch (err) {
      setError("Failed to disconnect from port");
      console.error(err);
    }
  };

  // Start reading from the serial port
  const startReading = async () => {
    while (true) {
      try {
        if (!readerRef.current) break;

        const { value, done } = await readerRef.current.read();
        if (done) break;

        // Process the received data
        handleReceivedData(value);
      } catch (error) {
        console.error("Error reading from serial port:", error);
        break;
      }
    }
  };

  // Handle received data from the serial port
  const handleReceivedData = (data: Uint8Array) => {
    // Convert the received data to a string
    const text = new TextDecoder().decode(data);
    
    // Parse the pin states from the received data
    // Expected format: "PINS:0101010101010101" for 16 pins
    if (text.startsWith("PINS:")) {
      const pinData = text.substring(5).trim();
      const newPinStates: { [key: number]: boolean } = {};
      
      for (let i = 0; i < pinData.length; i++) {
        newPinStates[i + 1] = pinData[i] === "1";
      }
      
      setPinStates(newPinStates);
    }
  };

  // Send data to the serial port
  const sendData = async (data: string) => {
    if (!writerRef.current) return;

    try {
      const encoder = new TextEncoder();
      await writerRef.current.write(encoder.encode(data));
    } catch (error) {
      console.error("Error writing to serial port:", error);
    }
  };

  // Handle IC selection
  const handleICSelect = (ic: ICData | null) => {
    setSelectedIC(ic);
    if (ic && isConnected) {
      // Send IC selection to the device
      sendData(`IC:${ic.partNumber}\n`);
    }
  };

  // Handle pin state changes
  const handlePinStateChange = (newPinStates: { [key: number]: boolean }) => {
    if (!isConnected || !selectedIC) return;

    // Create a command string with the pin states
    const pinStateStr = Object.entries(newPinStates)
      .filter(([pin, _]) => {
        const pinConfig = selectedIC.pinConfiguration.find(
          (p) => p.pin === parseInt(pin)
        );
        return pinConfig && pinConfig.type === "INPUT";
      })
      .map(([pin, state]) => `${pin}:${state ? "1" : "0"}`)
      .join(",");

    // Send the pin states to the device
    sendData(`PINS:${pinStateStr}\n`);
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
    <div className="space-y-6">
      {/* Serial Port Connection */}
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

      {/* IC Selection and Visualization */}
      <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md">
        <h2 className="text-xl font-bold mb-4 dark:text-white">
          IC Configuration
        </h2>
        <ICSelector onICSelect={handleICSelect} />
        {selectedIC && (
          <div className="mt-6">
            <ICVisualizer
              ic={selectedIC}
              onPinStateChange={handlePinStateChange}
              serialConnected={isConnected}
            />
          </div>
        )}
      </div>
    </div>
  );
}