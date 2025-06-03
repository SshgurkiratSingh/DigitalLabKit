// This component will manage the Web Serial API connection,
// including port selection, connection, sending/receiving data,
// and error handling.
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  SerialPort,
  SerialPortInfo,
  Serial,
  // SerialPortRequestOptions, // Not directly used in this component's own props/state yet
  SerialPortInfoWrapper,
  ICData,
} from "../types";
import React, { useImperativeHandle } from 'react';

// Props definition for SerialConnectionManager
export interface SerialConnectionManagerProps {
  onDataReceived: (
    type: string,
    payload: any,
    auxData?: any // For things like allICs for IC detection
  ) => void;
  logMessage: (log: {
    type: "received" | "sent" | "info" | "error" | "warning";
    message: string;
  }) => void;
  selectedICForSync: ICData | null;
  allICsForDetection: ICData[]; // Pass allICs for IC detection logic
}

export interface SerialConnectionManagerHandle {
  sendData: (data: string) => Promise<void>;
  showBuffer: () => void;
}

const SerialConnectionManager = React.forwardRef<SerialConnectionManagerHandle, SerialConnectionManagerProps>(({
  onDataReceived,
  logMessage,
  selectedICForSync,
  allICsForDetection,
}, ref) => {
  const [ports, setPorts] = useState<SerialPortInfoWrapper[]>([]);
  const [selectedPort, setSelectedPort] = useState<SerialPort | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(
    null
  );
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(
    null
  );
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const commandBufferRef = useRef<string>("");
  const lastCommandTimeRef = useRef<number>(0);
  const COMMAND_TIMEOUT = 500;

  const isSerialSupported =
    typeof window !== "undefined" && "serial" in navigator;

  // Log helper
  const addLog = useCallback(
    (
      type: "received" | "sent" | "info" | "error" | "warning",
      message: string
    ) => {
      logMessage({ type, message });
    },
    [logMessage]
  );

  // Send data to the serial port
  const sendData = useCallback(
    async (data: string) => {
      if (!writerRef.current) {
        addLog("error", "Writer not available. Cannot send data.");
        return;
      }
      try {
        const encoder = new TextEncoder();
        await writerRef.current.write(encoder.encode(data));
        addLog("sent", data.trim());
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        addLog("error", `Failed to send data: ${errorMessage}`);
        console.error("Error writing to serial port:", err);
        // Potentially disconnect or attempt to re-establish writer
      }
    },
    [addLog]
  );

  // Process a complete command
  const processCommand = useCallback(
    (command: string) => {
      addLog("received", command);

      try {
        if (command.startsWith("IC:")) {
          const icNumber = command.substring(3).trim();
          onDataReceived("ic_command_received", {
            icNumber,
            allICs: allICsForDetection // Pass allICs here (trailing comma removed)
          });
          return;
        }

        if (/^[01]{14,16}$/.test(command)) {
          const pinData = command;
          const newPinStates: { [key: number]: boolean } = {};
          for (let i = 0; i < pinData.length; i++) {
            newPinStates[i + 1] = pinData[i] === "1";
          }
          onDataReceived("pin_states_binary", newPinStates);
          addLog("info", `Pin states updated from binary: ${pinData}`);
          return;
        }

        if (command.startsWith("PINS:")) {
          const pinData = command.substring(5).trim();
          if (
            pinData.length >= 14 &&
            pinData.length <= 16 &&
            /^[01]+$/.test(pinData)
          ) {
            const newPinStates: { [key: number]: boolean } = {};
            for (let i = 0; i < pinData.length; i++) {
              newPinStates[i + 1] = pinData[i] === "1";
            }
            onDataReceived("pin_states_pins_cmd", newPinStates);
            addLog("info", `Pin states updated from PINS: ${pinData}`);
          } else {
            addLog("error", `Invalid pin data format: ${pinData}`);
            onDataReceived("error", {
              message: `Invalid pin data format: ${pinData}` // Trailing comma removed
            });
          }
          return;
        }

        if (command === "SYNC:OK") {
          addLog("info", "Device synchronized");
          onDataReceived("sync_ok", {});
          return;
        }

        if (command.startsWith("ERROR:")) {
          const errorMessage = command.substring(6).trim();
          addLog("error", errorMessage);
          onDataReceived("error", { message: errorMessage });
          return;
        }

        addLog("info", `Unhandled message: ${command}`);
        onDataReceived("unhandled_message", { message: command });
      } catch (processingError) {
        const errorMessage =
          processingError instanceof Error
            ? processingError.message
            : String(processingError);
        addLog("error", `Error processing message: ${errorMessage}`);
        onDataReceived("error", {
          message: `Error processing command "${command}": ${errorMessage}` // Trailing comma removed
        });
      }
    },
    [addLog, onDataReceived, allICsForDetection]
  );

  // Process complete commands from the buffer
  const processCommandBuffer = useCallback(() => {
    const buffer = commandBufferRef.current;
    const lines = buffer.split("\n");

    if (lines.length > 1) {
      const completeLines = lines.slice(0, -1);
      const remainingBuffer = lines[lines.length - 1];

      completeLines.forEach((line) => {
        const trimmedLine = line.trim();
        if (trimmedLine) {
          processCommand(trimmedLine);
        }
      });

      commandBufferRef.current = remainingBuffer;
      lastCommandTimeRef.current = Date.now();
    }
  }, [processCommand]);

  // Handle received data from the serial port
  const handleReceivedData = useCallback(
    (data: Uint8Array) => {
      const text = new TextDecoder().decode(data);
      const currentTime = Date.now();

      if (
        currentTime - lastCommandTimeRef.current > COMMAND_TIMEOUT &&
        commandBufferRef.current.length > 0
      ) {
        addLog(
          "info",
          `Command buffer timeout, clearing: "${commandBufferRef.current}"`
        );
        commandBufferRef.current = "";
      }

      commandBufferRef.current += text;
      lastCommandTimeRef.current = currentTime;

      addLog(
        "info",
        `Raw data received: "${text}" (buffer now: "${commandBufferRef.current}")`
      );
      processCommandBuffer();
    },
    [addLog, processCommandBuffer]
  );

  // Start reading from the serial port
  const startReading = useCallback(async () => {
    if (!readerRef.current) {
      addLog("error", "Reader not available. Cannot start reading.");
      return;
    }

    const maxRetries = 3;
    let retryCount = 0;

    while (true) {
      try {
        if (!readerRef.current) {
          // This can happen if disconnectFromPort was called while in the loop
          addLog("info", "Reader became null, stopping read loop.");
          break;
        }
        const { value, done } = await readerRef.current.read();

        if (done) {
          // This case might occur if the port is closed unexpectedly.
          addLog("warning", "Reader stream done (port closed or errored).");
          // No automatic reconnection here for 'done', needs explicit user action or policy.
          // Consider calling part of disconnect logic if appropriate
          if (isConnected) { // Check if we thought we were connected
             setIsConnected(false);
             setError("Connection lost (reader stream closed). Please reconnect.");
             addLog("error", "Reader stream closed, port disconnected.");
          }
          break;
        }
        retryCount = 0; // Reset on successful read
        handleReceivedData(value);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        addLog("error", `Serial read error: ${errorMessage}`);
        console.error("Error reading from serial port:", err);

        if (!selectedPort || !isConnected) {
            addLog("info", "Stopping read loop as port is no longer selected or connected.");
            break;
        }

        if (retryCount < maxRetries) {
          retryCount++;
          addLog(
            "info",
            `Attempting to reconnect read stream (${retryCount}/${maxRetries})...`
          );
          try {
            // Brief pause before attempting to re-establish reader
            await new Promise(resolve => setTimeout(resolve, 500));

            // Attempt to re-establish only the reader if port is still open
            // This part is tricky because the port might be in a bad state.
            // A full reconnect might be safer.
            if (selectedPort.readable) {
              readerRef.current = selectedPort.readable.getReader();
              addLog("info", "Read stream re-established.");
              continue; // Continue the read loop
            } else {
              throw new Error("Port no longer readable.");
            }
          } catch (reconnectError) {
            const reconnErrMsg = reconnectError instanceof Error ? reconnectError.message : String(reconnectError);
            addLog("error", `Failed to re-establish read stream: ${reconnErrMsg}.`);
          }
        }

        // If retries exhausted or not possible to recover reader
        addLog("error", "Failed to recover read stream. Disconnecting.");
        // Trigger full disconnect logic
        await disconnectFromPort(true); // Pass a flag if disconnect needs to know it's from read error
        break; // Exit read loop
      }
    }
  }, [addLog, handleReceivedData, selectedPort, isConnected]);


  // Connect to selected port
  const connectToPort = useCallback(async () => {
    if (!selectedPort) {
      setError("No port selected");
      addLog("error", "Connect failed: No port selected.");
      return;
    }

    try {
      addLog("info", `Attempting to connect to port...`);
      await selectedPort.open({ baudRate: 115200 });

      if (selectedPort.writable) {
        writerRef.current = selectedPort.writable.getWriter();
      } else {
        addLog("warning", "Port is not writable.");
      }

      if (selectedPort.readable) {
        readerRef.current = selectedPort.readable.getReader();
        startReading(); // Don't await, let it run in background
      } else {
        addLog("warning", "Port is not readable.");
      }

      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = setInterval(() => {
        if (isConnected && selectedICForSync) {
          // Check selectedICForSync from props
          sendData("SYNC\n");
        }
      }, 1000);

      setIsConnected(true);
      setError(null);
      commandBufferRef.current = "";
      lastCommandTimeRef.current = 0;
      addLog("info", "Successfully connected to serial port.");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to connect: ${errorMessage}`);
      addLog("error", `Connection failed: ${errorMessage}`);
      console.error(err);
      // Ensure refs are cleared on failed connection
      if (readerRef.current) {
        readerRef.current.releaseLock();
        readerRef.current = null;
      }
      if (writerRef.current) {
        writerRef.current.releaseLock();
        writerRef.current = null;
      }
    }
  }, [selectedPort, addLog, startReading, sendData, selectedICForSync, isConnected]);

  // Disconnect from port
  const disconnectFromPort = useCallback(async (fromError = false) => {
    if (!selectedPort) {
      if (!fromError) addLog("info", "No port to disconnect from.");
      return;
    }
    addLog("info", "Attempting to disconnect from port...");

    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }

    // Critical: Cancel pending reads first.
    if (readerRef.current) {
      try {
        await readerRef.current.cancel("Disconnecting"); // Pass reason
        readerRef.current.releaseLock();
      } catch (cancelErr) {
        const errMsg = cancelErr instanceof Error ? cancelErr.message : String(cancelErr);
        addLog("warning", `Error cancelling reader: ${errMsg}`);
      } finally {
        readerRef.current = null;
      }
    }

    // Then close the writer.
    if (writerRef.current) {
      try {
        // Ensure any pending writes are aborted if supported, or just close.
        // await writerRef.current.abort("Disconnecting"); // If supported
        await writerRef.current.close();
        writerRef.current.releaseLock();
      } catch (closeErr) {
        const errMsg = closeErr instanceof Error ? closeErr.message : String(closeErr);
        addLog("warning", `Error closing writer: ${errMsg}`);
      } finally {
        writerRef.current = null;
      }
    }

    // Finally, close the port.
    try {
      await selectedPort.close();
    } catch (portCloseErr) {
      const errMsg = portCloseErr instanceof Error ? portCloseErr.message : String(portCloseErr);
      addLog("error", `Error closing the serial port: ${errMsg}`);
      // Even if closing port fails, UI should reflect disconnected state.
    } finally {
      setIsConnected(false);
      commandBufferRef.current = "";
      lastCommandTimeRef.current = 0;
      if (!fromError) { // Avoid double logging if called from read error handler
        setError(null); // Clear connection error on manual disconnect
        addLog("info", "Disconnected from serial port.");
      } else {
         setError("Disconnected due to read error. Please check connection."); // Keep error if fromError
      }
      // Do not nullify selectedPort here, user might want to reconnect to the same port.
    }
  }, [selectedPort, addLog]);


  // Request and list available ports
  const listPorts = useCallback(async () => {
    if (!isSerialSupported) return;
    try {
      addLog("info", "Listing available serial ports...");
      const availablePorts = await navigator.serial.getPorts();
      const portsInfo = availablePorts.map((port) => ({
        port,
        info: port.getInfo(),
      }));
      setPorts(portsInfo);
      setError(null);
      if (portsInfo.length > 0) {
        addLog("info", `Found ${portsInfo.length} previously approved ports.`);
      } else {
        addLog("info", "No previously approved ports found.");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError("Failed to list serial ports");
      addLog("error", `Failed to list serial ports: ${errorMessage}`);
      console.error(err);
    }
  }, [isSerialSupported, addLog]);

  // Request port access
  const requestPort = useCallback(async () => {
    if (!isSerialSupported) return;
    try {
      addLog("info", "Requesting serial port access...");
      const port = await navigator.serial.requestPort();
      const portInfo = {
        port,
        info: port.getInfo(),
      };
      // Check if this port is already in the list by comparing info
      // This handles cases where user re-selects an already listed port
      if (!ports.find(p => p.info.usbVendorId === portInfo.info.usbVendorId && p.info.usbProductId === portInfo.info.usbProductId)) {
        setPorts((prev) => [...prev, portInfo]);
      }
      setSelectedPort(port); // Always set selected to the newly requested one
      setError(null);
      addLog(
        "info",
        `Port selected: VID ${portInfo.info.usbVendorId || "N/A"}, PID ${
          portInfo.info.usbProductId || "N/A"
        }`
      );
    } catch (err) {
      const errorName = (err as Error).name;
      const errorMessage = (err as Error).message;
      if (errorName === "NotFoundError") {
        setError("No serial port selected by user.");
        addLog("warning", "User did not select a serial port.");
      } else {
        setError(`Port request failed: ${errorMessage}`);
        addLog("error", `Failed to request serial port: ${errorMessage}`);
      }
      console.error(err);
    }
  }, [isSerialSupported, addLog, ports]);

  // Effect for initial port listing and connect/disconnect events
  useEffect(() => {
    if (!isSerialSupported) return;

    listPorts(); // Initial list of already permitted ports

    const handleConnect = (event: Event) => {
      const port = event.target as SerialPort;
      addLog(
        "info",
        `Serial port connected: VID ${
          port.getInfo().usbVendorId || "N/A"
        }, PID ${port.getInfo().usbProductId || "N/A"}`
      );
      listPorts(); // Refresh the list
    };

    const handleDisconnect = (event: Event) => {
      const port = event.target as SerialPort;
      addLog(
        "info",
        `Serial port disconnected: VID ${
          port.getInfo().usbVendorId || "N/A"
        }, PID ${port.getInfo().usbProductId || "N/A"}`
      );
      if (selectedPort === port) {
        addLog(
          "warning",
          "Currently selected port was disconnected. Cleaning up."
        );
        // Call disconnectFromPort to clean up state like isConnected, reader/writer refs
        disconnectFromPort(true); // Pass true if it's an unexpected disconnect
        setSelectedPort(null); // Also nullify selected port
      }
      listPorts(); // Refresh the list
    };

    navigator.serial.addEventListener("connect", handleConnect);
    navigator.serial.addEventListener("disconnect", handleDisconnect);

    return () => {
      navigator.serial.removeEventListener("connect", handleConnect);
      navigator.serial.removeEventListener("disconnect", handleDisconnect);
      // Cleanup on unmount
      if (isConnected) {
        disconnectFromPort();
      }
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [isSerialSupported, listPorts, addLog, selectedPort, disconnectFromPort, isConnected]);

  const showBuffer = useCallback(() => {
    addLog("info", `Current command buffer content: "${commandBufferRef.current}"`);
  }, [addLog]);

  // Expose sendData and showBuffer via ref
  useImperativeHandle(ref, () => ({
    sendData,
    showBuffer,
  }));


  if (!isSerialSupported) {
    return (
      <div className="p-4 bg-red-900 text-red-100 rounded-md">
        Web Serial API is not supported in this browser. Please use Chrome or
        Edge.
      </div>
    );
  }

  return (
    <div className="p-6 bg-[var(--background)] rounded-lg shadow-lg">
      <h2 className="text-xl font-semibold mb-4 text-[var(--foreground)]">
        Serial Port Connection
      </h2>
      <div className="mb-4 flex items-center">
        <div
          className={`w-3 h-3 rounded-full mr-2 ${
            isConnected ? "bg-green-500" : "bg-red-500"
          }`}
        ></div>
        <span className="text-[var(--foreground)]">
          {isConnected ? "Connected" : "Disconnected"}
        </span>
      </div>
      <div className="mb-4">
        <select
          className="w-full p-2 border rounded bg-neutral-800 text-[var(--foreground)] border-neutral-600"
          value={
            selectedPort ? ports.findIndex((p) => p.port === selectedPort) : ""
          }
          onChange={(e) => {
            const index = parseInt(e.target.value);
            if (index >= 0) {
              setSelectedPort(ports[index].port);
            } else {
              setSelectedPort(null);
            }
          }}
          disabled={isConnected}
        >
          <option value="">Select a port</option>
          {ports.map((portWrapper, index) => (
            <option key={index} value={index}>
              {`Port ${index} - VID: ${
                portWrapper.info.usbVendorId || "N/A"
              } PID: ${portWrapper.info.usbProductId || "N/A"}`}
            </option>
          ))}
        </select>
      </div>
      <div className="space-x-2">
        <button
          onClick={requestPort}
          disabled={isConnected}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
        >
          Request Port
        </button>
        <button
          onClick={isConnected ? () => disconnectFromPort() : connectToPort}
          disabled={!selectedPort}
          className={`px-4 py-2 rounded-md ${
            isConnected
              ? "bg-red-500 hover:bg-red-600"
              : "bg-green-500 hover:bg-green-600"
          } text-white disabled:opacity-50`}
        >
          {isConnected ? "Disconnect" : "Connect"}
        </button>
         <button
          onClick={listPorts}
          disabled={isConnected}
          className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50"
        >
          Refresh List
        </button>
      </div>
      {error && (
        <div className="mt-4 p-2 bg-red-900 text-red-100 rounded-md">
          {error}
        </div>
      )}
    </div>
  );
};

export default SerialConnectionManager; // React.forwardRef is already applied
