"use client";

import { useState, useEffect, useRef } from "react";
import ICSelector from "./ICSelector";
import ICVisualizer from "./ICVisualizer";
import ICTruthTableVerifier from "./ICTruthTableVerifier";

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

interface SerialPortInterfaceProps {
  onICSelect?: (ic: ICData | null) => void;
}

export default function SerialPortInterface({
  onICSelect,
}: SerialPortInterfaceProps = {}) {
  const [ports, setPorts] = useState<SerialPortInfoWrapper[]>([]);
  const [selectedPort, setSelectedPort] = useState<SerialPort | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIC, setSelectedIC] = useState<ICData | null>(null);
  const [pinStates, setPinStates] = useState<{ [key: number]: boolean }>({});
  const [debugLogs, setDebugLogs] = useState<
    Array<{
      timestamp: string;
      type: "received" | "sent" | "info" | "error";
      message: string;
    }>
  >([]);
  const [allICs, setAllICs] = useState<ICData[]>([]);
  const [syncInterval, setSyncInterval] = useState<NodeJS.Timeout | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(
    null
  );
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(
    null
  );

  // Use refs for command buffer to avoid state timing issues
  const commandBufferRef = useRef<string>("");
  const lastCommandTimeRef = useRef<number>(0);
  const COMMAND_TIMEOUT = 500; // Increased to 500ms for more reliable command assembly

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
      await selectedPort.open({ baudRate: 115200 });

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

      // Start sync interval
      const interval = setInterval(() => {
        if (isConnected && selectedIC) {
          sendData("SYNC\n");
        }
      }, 1000); // Sync every second
      setSyncInterval(interval);

      setIsConnected(true);
      setError(null);

      // Reset command buffer on new connection
      commandBufferRef.current = "";
      lastCommandTimeRef.current = 0;

      // Add connection log
      setDebugLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          type: "info",
          message: "Connected to serial port",
        },
      ]);
    } catch (err) {
      setError("Failed to connect to port");
      console.error(err);
      setDebugLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          type: "error",
          message: `Connection failed: ${err}`,
        },
      ]);
    }
  };

  // Disconnect from port
  const disconnectFromPort = async () => {
    if (!selectedPort) return;

    try {
      // Clear sync interval
      if (syncInterval) {
        clearInterval(syncInterval);
        setSyncInterval(null);
      }

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

      // Reset command buffer
      commandBufferRef.current = "";
      lastCommandTimeRef.current = 0;

      // Add disconnection log
      setDebugLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          type: "info",
          message: "Disconnected from serial port",
        },
      ]);
    } catch (err) {
      setError("Failed to disconnect from port");
      console.error(err);
      setDebugLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          type: "error",
          message: `Disconnection failed: ${err}`,
        },
      ]);
    }
  };

  // Start reading from the serial port with auto-reconnect
  const startReading = async () => {
    const maxRetries = 3;
    let retryCount = 0;

    while (true) {
      try {
        if (!readerRef.current) {
          throw new Error("No reader available");
        }

        const { value, done } = await readerRef.current.read();
        if (done) {
          throw new Error("Reader stream closed");
        }

        // Reset retry count on successful read
        retryCount = 0;

        // Process the received data
        handleReceivedData(value);
      } catch (error) {
        console.error("Error reading from serial port:", error);
        setDebugLogs((prev) => [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            type: "error",
            message: `Serial read error: ${error}`,
          },
        ]);

        // Attempt to reconnect
        if (retryCount < maxRetries) {
          retryCount++;
          setDebugLogs((prev) => [
            ...prev,
            {
              timestamp: new Date().toISOString(),
              type: "info",
              message: `Attempting to reconnect (${retryCount}/${maxRetries})...`,
            },
          ]);

          try {
            // Close existing connections
            if (readerRef.current) {
              await readerRef.current.cancel();
              await readerRef.current.releaseLock();
            }
            if (writerRef.current) {
              await writerRef.current.close();
              await writerRef.current.releaseLock();
            }
            if (selectedPort) {
              await selectedPort.close();
            }

            // Wait before reconnecting
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Attempt to reconnect
            if (selectedPort) {
              await selectedPort.open({ baudRate: 115200 });
              if (selectedPort.readable) {
                readerRef.current = selectedPort.readable.getReader();
              }
              if (selectedPort.writable) {
                writerRef.current = selectedPort.writable.getWriter();
              }
              setDebugLogs((prev) => [
                ...prev,
                {
                  timestamp: new Date().toISOString(),
                  type: "info",
                  message: "Reconnected successfully",
                },
              ]);
              continue;
            }
          } catch (reconnectError) {
            console.error("Reconnection failed:", reconnectError);
            setDebugLogs((prev) => [
              ...prev,
              {
                timestamp: new Date().toISOString(),
                type: "error",
                message: `Reconnection failed: ${reconnectError}`,
              },
            ]);
          }
        }

        // If all retries failed, disconnect
        setIsConnected(false);
        setError("Connection lost. Please reconnect manually.");
        break;
      }
    }
  };

  // Handle received data from the serial port
  const handleReceivedData = (data: Uint8Array) => {
    // Convert the received data to a string
    const text = new TextDecoder().decode(data);
    const currentTime = Date.now();

    // Check if it's been too long since the last command - if so, clear buffer
    if (
      currentTime - lastCommandTimeRef.current > COMMAND_TIMEOUT &&
      commandBufferRef.current.length > 0
    ) {
      setDebugLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          type: "info",
          message: `Command buffer timeout, clearing: "${commandBufferRef.current}"`,
        },
      ]);
      commandBufferRef.current = "";
    }

    // Add new data to command buffer
    commandBufferRef.current += text;
    lastCommandTimeRef.current = currentTime;

    // Debug log for raw data
    setDebugLogs((prev) => [
      ...prev,
      {
        timestamp: new Date().toISOString(),
        type: "info",
        message: `Raw data received: "${text}" (buffer now: "${commandBufferRef.current}")`,
      },
    ]);

    // Process complete commands from the buffer
    processCommandBuffer();
  };

  // Process complete commands from the buffer
  const processCommandBuffer = () => {
    const buffer = commandBufferRef.current;
    const lines = buffer.split("\n");

    // If we have at least one complete line (ends with newline)
    if (lines.length > 1) {
      const completeLines = lines.slice(0, -1); // All but the last (incomplete) line
      const remainingBuffer = lines[lines.length - 1]; // The incomplete line

      // Only process the LAST complete line (final command)
      if (completeLines.length > 0) {
        const finalCommand = completeLines[completeLines.length - 1].trim();
        if (finalCommand) {
          processCommand(finalCommand);
        }

        // Log any skipped commands for debugging
        if (completeLines.length > 1) {
          const skippedCommands = completeLines.slice(0, -1);
          setDebugLogs((prev) => [
            ...prev,
            {
              timestamp: new Date().toISOString(),
              type: "info",
              message: `Skipped ${
                skippedCommands.length
              } intermediate commands: [${skippedCommands.join(", ")}]`,
            },
          ]);
        }
      }

      // Update buffer with remaining incomplete data
      commandBufferRef.current = remainingBuffer;

      // Update last command time since we processed data
      lastCommandTimeRef.current = Date.now();
    }
  };
  // Process a complete command
  const processCommand = (command: string) => {
    console.log("Processing command:", command);
    // Add to debug log
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: "received" as const,
      message: command,
    };
    setDebugLogs((prev) => [...prev, logEntry]);

    try {
      // Parse IC selection from the received data
      if (command.startsWith("IC:")) {
        console.log("Processing IC command:", command);
        const icNumber = command.substring(3).trim();
        // Extract initial numeric part from received IC number
        const numericPart = icNumber.match(/^\d+/)?.[0];
        if (numericPart) {
          // Find IC by matching the initial numeric part
          const matchingIC = allICs.find((ic) =>
            ic.partNumber.startsWith(numericPart)
          );
          if (matchingIC) {
            setDebugLogs((prev) => [
              ...prev,
              {
                timestamp: new Date().toISOString(),
                type: "info",
                message: `Selected IC ${matchingIC.partNumber} based on received number ${numericPart}`,
              },
            ]);

            // Update IC selection
            setSelectedIC(matchingIC);
            onICSelect?.(matchingIC);

            // Request initial pin states
            sendData("PINS?\n");
          } else {
            setDebugLogs((prev) => [
              ...prev,
              {
                timestamp: new Date().toISOString(),
                type: "error",
                message: `No IC found matching number: ${numericPart}`,
              },
            ]);
          }
        } else {
          setDebugLogs((prev) => [
            ...prev,
            {
              timestamp: new Date().toISOString(),
              type: "error",
              message: `Invalid IC number format: ${icNumber}`,
            },
          ]);
        }
        return;
      }

      // Parse binary pin states from the received data
      if (/^[01]{14,16}$/.test(command)) {
        const pinData = command;
        const newPinStates: { [key: number]: boolean } = {};

        // Parse each bit into pin states
        for (let i = 0; i < pinData.length; i++) {
          newPinStates[i + 1] = pinData[i] === "1";
        }

        // Update pin states in a single setState call
        setPinStates(newPinStates);

        // Log pin state update
        setDebugLogs((prev) => [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            type: "info",
            message: `Pin states updated from binary data: ${pinData}`,
          },
        ]);
        return;
      }

      // Parse the pin states from the PINS: command format (backward compatibility)
      if (command.startsWith("PINS:")) {
        console.log("Processing PINS command:", command);
        const pinData = command.substring(5).trim();

        // Validate pin data length (14-16 bits) and format
        if (
          pinData.length >= 14 &&
          pinData.length <= 16 &&
          /^[01]+$/.test(pinData)
        ) {
          const newPinStates: { [key: number]: boolean } = {};

          // Parse each bit into pin states
          for (let i = 0; i < pinData.length; i++) {
            newPinStates[i + 1] = pinData[i] === "1";
          }

          // Update pin states in a single setState call
          setPinStates(newPinStates);

          // Log pin state update
          setDebugLogs((prev) => [
            ...prev,
            {
              timestamp: new Date().toISOString(),
              type: "info",
              message: `Pin states updated from PINS command: ${pinData}`,
            },
          ]);
        } else {
          setDebugLogs((prev) => [
            ...prev,
            {
              timestamp: new Date().toISOString(),
              type: "error",
              message: `Invalid pin data format: ${pinData}`,
            },
          ]);
        }
        return;
      }

      // Handle sync response
      if (command === "SYNC:OK") {
        setDebugLogs((prev) => [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            type: "info",
            message: "Device synchronized",
          },
        ]);
        return;
      }

      // Handle error messages
      if (command.startsWith("ERROR:")) {
        setDebugLogs((prev) => [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            type: "error",
            message: command.substring(6).trim(),
          },
        ]);
        return;
      }

      // Log any unhandled messages
      setDebugLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          type: "info",
          message: `Unhandled message: ${command}`,
        },
      ]);
    } catch (error) {
      setDebugLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          type: "error",
          message: `Error processing message: ${error}`,
        },
      ]);
    }
  };

  // Send data to the serial port
  const sendData = async (data: string) => {
    if (!writerRef.current) return;

    try {
      const encoder = new TextEncoder();
      await writerRef.current.write(encoder.encode(data));

      // Add to debug log
      setDebugLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          type: "sent",
          message: data.trim(),
        },
      ]);
    } catch (error) {
      console.error("Error writing to serial port:", error);
      setDebugLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          type: "error",
          message: `Failed to send data: ${error}`,
        },
      ]);
    }
  };

  // Handle clock frequency changes
  const handleClockFrequencyChange = (frequency: number) => {
    if (isConnected && selectedIC) {
      // Send clock frequency command to the device
      sendData(`CLOCK:${frequency}\n`);
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

    // Create a binary string representing all pin states
    let pinStateStr = "";
    const pinCount = selectedIC.pinCount || 14; // Default to 14 if not specified

    // Validate pin count
    if (pinCount < 14 || pinCount > 16) {
      setDebugLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          type: "error",
          message: `Invalid pin count: ${pinCount}. Must be between 14 and 16.`,
        },
      ]);
      return;
    }

    // Build the binary string based on current pin states and new changes
    for (let i = 1; i <= pinCount; i++) {
      // If the pin state is being changed, use the new state
      // Otherwise, use the current state from pinStates
      const state = i in newPinStates ? newPinStates[i] : pinStates[i] || false;
      pinStateStr += state ? "1" : "0";
    }

    // Validate binary string length
    if (pinStateStr.length < 14 || pinStateStr.length > 16) {
      setDebugLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          type: "error",
          message: `Invalid pin state string length: ${pinStateStr.length}. Must be between 14 and 16 bits.`,
        },
      ]);
      return;
    }

    // Send the binary pin states directly to the device
    sendData(`${pinStateStr}\n`);

    // Update local pin states
    setPinStates((prev) => ({
      ...prev,
      ...newPinStates,
    }));

    // Log the change with detailed information
    setDebugLogs((prev) => [
      ...prev,
      {
        timestamp: new Date().toISOString(),
        type: "sent",
        message: `Pin states changed for ${selectedIC.partNumber}: ${pinStateStr} (${pinCount} pins)`,
      },
    ]);
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
              selectedPort
                ? ports.findIndex((p) => p.port === selectedPort)
                : ""
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
          <div className="mt-4 p-2 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}
      </div>

      {/* IC Selection and Visualization */}
      <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md">
        <h2 className="text-xl font-bold mb-4 dark:text-white">
          IC Configuration
        </h2>
        <ICSelector onICSelect={handleICSelect} />
        {selectedIC && (
          <>
            <div className="mt-6">
              <ICVisualizer
                ic={selectedIC}
                onPinStateChange={handlePinStateChange}
                serialConnected={isConnected}
              />
            </div>
            <ICTruthTableVerifier
              selectedIC={selectedIC.partNumber}
              currentPinStates={pinStates}
              onPinStateChange={handlePinStateChange}
              onClockFrequencyChange={handleClockFrequencyChange}
              isConnected={isConnected}
            />
          </>
        )}
      </div>

      {/* Debug Log */}
      <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold dark:text-white">Debug Log</h2>
          <div className="flex space-x-2">
            <button
              onClick={() => setDebugLogs([])}
              className="px-3 py-1 text-sm bg-red-100 text-red-800 rounded hover:bg-red-200 dark:bg-red-900 dark:text-red-100 dark:hover:bg-red-800"
            >
              Clear Log
            </button>
            <button
              onClick={() => {
                if (isConnected) {
                  sendData("SYNC\n");
                }
              }}
              disabled={!isConnected}
              className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-100 dark:hover:bg-blue-800 disabled:opacity-50"
            >
              Request Sync
            </button>
            <button
              onClick={() => {
                setDebugLogs((prev) => [
                  ...prev,
                  {
                    timestamp: new Date().toISOString(),
                    type: "info",
                    message: `Current buffer content: "${commandBufferRef.current}"`,
                  },
                ]);
              }}
              className="px-3 py-1 text-sm bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200 dark:bg-yellow-900 dark:text-yellow-100 dark:hover:bg-yellow-800"
            >
              Show Buffer
            </button>
          </div>
        </div>

        <div className="h-96 overflow-y-auto border rounded dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="sticky top-0 bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              <div className="col-span-2">Time</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-8">Message</div>
            </div>
          </div>

          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {debugLogs
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

        {debugLogs.length === 0 && (
          <div className="text-center p-4 text-gray-500 dark:text-gray-400">
            No debug messages yet
          </div>
        )}
      </div>
    </div>
  );
}
