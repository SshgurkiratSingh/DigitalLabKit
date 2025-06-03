import { useState, useEffect, useRef, useCallback } from "react";

// Define Web Serial API types if not globally available or imported
interface SerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  addEventListener(type: 'disconnect' | 'connect', listener: (ev: Event) => any): void;
  removeEventListener(type: 'disconnect' | 'connect', listener: (ev: Event) => any): void;
}

interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface Serial extends EventTarget {
  getPorts(): Promise<SerialPort[]>;
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort | undefined>; // Can return undefined if user cancels
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

declare global {
  interface Navigator {
    serial: Serial;
  }
}

export interface SerialPortInfoWrapper {
  port: SerialPort;
  info: SerialPortInfo;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting" // Added for clarity during the disconnect process
  | "error";

export interface DebugLogEntry {
  timestamp: string;
  type: "received" | "sent" | "info" | "error" | "warning";
  message: string;
}

export interface ICData {
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

export interface UseSerialPortOptions {
  onDataReceived?: (data: string) => void;
  onICDataLoaded?: (ics: ICData[]) => void;
  initialDebugLogs?: DebugLogEntry[];
  commandTimeout?: number;
}

const DEFAULT_COMMAND_TIMEOUT = 500; // ms

export const useSerialPort = (options?: UseSerialPortOptions) => {
  const [ports, setPorts] = useState<SerialPortInfoWrapper[]>([]);
  const [selectedPort, setSelectedPort] = useState<SerialPort | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>(options?.initialDebugLogs || []);
  const [allICs, setAllICs] = useState<ICData[]>([]);

  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const commandBufferRef = useRef<string>("");
  const lastCommandTimeRef = useRef<number>(0);
  const portCloseController = useRef<AbortController | null>(null); // For ensuring close is finalized


  const isSerialSupported =
    typeof window !== "undefined" && "serial" in navigator;

  const addDebugLog = useCallback((log: Omit<DebugLogEntry, 'timestamp'>) => {
    setDebugLogs((prevLogs) => [
      { ...log, timestamp: new Date().toISOString() },
      ...prevLogs, // Add new logs to the top
    ]);
  }, []);

  // Load IC data
  useEffect(() => {
    const loadICData = async () => {
      // ... (implementation from previous step, unchanged)
      try {
        const icFiles = [
          "BCDDecoderIC.json",
          "CounterIC.json",
          "ShiftRegisterIC.json",
          "arithmeticIc.json",
          "combinationalIC.json",
          "comparatorIc.json",
          "sequentialIC.json",
        ];
        const loadedICs: ICData[] = [];
        for (const file of icFiles) {
          const response = await fetch(`/files/${file}`);
          if (!response.ok) {
            throw new Error(`Failed to load ${file}: ${response.statusText}`);
          }
          const data = await response.json();
          if (!data || typeof data !== "object") {
            throw new Error(`Invalid data format in ${file}`);
          }
          Object.values(data).forEach((series: any) => {
            if (!series || typeof series !== "object") return;
            Object.values(series).forEach((category: any) => {
              if (!category || typeof category !== "object") return;
              Object.values(category).forEach((ic: any) => {
                if (
                  ic && ic.partNumber && ic.description && ic.category &&
                  ic.pinCount && ic.pinConfiguration
                ) {
                  loadedICs.push(ic as ICData);
                }
              });
            });
          });
        }
        setAllICs(loadedICs);
        options?.onICDataLoaded?.(loadedICs);
        addDebugLog({
          type: "info",
          message: `Successfully loaded ${loadedICs.length} ICs.`,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(`Error loading IC data: ${errorMessage}`);
        addDebugLog({
          type: "error",
          message: `Failed to load IC data: ${errorMessage}`,
        });
      }
    };
    if (typeof window !== "undefined") { // Ensure fetch runs only in browser
        loadICData();
    }
  }, [addDebugLog, options?.onICDataLoaded]);


  const listPorts = useCallback(async () => {
    if (!isSerialSupported) {
      setError("Web Serial API is not supported.");
      addDebugLog({ type: "error", message: "Web Serial API not supported." });
      return [];
    }
    try {
      const availablePorts = await navigator.serial.getPorts();
      const portsInfo = availablePorts.map((port) => ({
        port,
        info: port.getInfo(),
      }));
      setPorts(portsInfo);
      setError(null); // Clear previous errors
      if (portsInfo.length === 0) {
        addDebugLog({ type: "info", message: "No previously permitted serial ports found." });
      } else {
        addDebugLog({ type: "info", message: `Found ${portsInfo.length} permitted port(s).` });
      }
      return portsInfo;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to list serial ports: ${errorMessage}`);
      addDebugLog({ type: "error", message: `Failed to list serial ports: ${errorMessage}` });
      return [];
    }
  }, [isSerialSupported, addDebugLog]);

  const requestPort = useCallback(async () => {
    if (!isSerialSupported) {
      setError("Web Serial API is not supported.");
      addDebugLog({ type: "error", message: "Web Serial API not supported." });
      return null;
    }
    try {
      const port = await navigator.serial.requestPort();
      if (!port) { // User cancelled the request
        addDebugLog({ type: "warning", message: "User did not select a serial port." });
        setError("No serial port selected by the user.");
        return null;
      }
      const portInfo = { port, info: port.getInfo() };
      setPorts((prev) => {
        if (prev.find(p => p.port === port)) return prev;
        return [...prev, portInfo];
      });
      // setSelectedPort(port); // Let connectToPort handle setting the selected port
      setError(null);
      addDebugLog({ type: "info", message: "Serial port requested by user." });
      return port;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // "NotFoundError" is typical if user cancels or no compatible device found
      if ((err as Error).name === "NotFoundError") {
        setError("No serial port selected or found.");
        addDebugLog({ type: "warning", message: "No serial port selected or device matching filters found." });
      } else {
        setError(`Failed to request serial port: ${errorMessage}`);
        addDebugLog({ type: "error", message: `Failed to request serial port: ${errorMessage}` });
      }
      return null;
    }
  }, [isSerialSupported, addDebugLog]);

  const processCommandBuffer = useCallback(() => {
    const buffer = commandBufferRef.current;
    const lines = buffer.split("\n");

    if (lines.length > 1) { // At least one newline means one complete command
      const completeLines = lines.slice(0, -1);
      const remainingBuffer = lines[lines.length - 1];

      completeLines.forEach((line) => {
        const trimmedLine = line.trim();
        if (trimmedLine) {
          addDebugLog({ type: "received", message: trimmedLine });
          options?.onDataReceived?.(trimmedLine);
        }
      });

      commandBufferRef.current = remainingBuffer;
      if (completeLines.length > 0) {
        lastCommandTimeRef.current = Date.now();
      }
    }
  }, [addDebugLog, options?.onDataReceived]);

  const handleReceivedData = useCallback((data: Uint8Array) => {
    const text = new TextDecoder().decode(data);
    const currentTime = Date.now();
    const timeout = options?.commandTimeout ?? DEFAULT_COMMAND_TIMEOUT;

    if (
      currentTime - lastCommandTimeRef.current > timeout &&
      commandBufferRef.current.length > 0
    ) {
      addDebugLog({
        type: "warning",
        message: `Command buffer timeout (${timeout}ms), clearing: "${commandBufferRef.current}"`,
      });
      commandBufferRef.current = ""; // Clear stale buffer
    }

    commandBufferRef.current += text;
    lastCommandTimeRef.current = currentTime; // Update time with any new data

    // Do not log raw chunks here as it can be very noisy.
    // addDebugLog({ type: "info", message: `Raw data chunk: "${text}" (buffer: "${commandBufferRef.current}")` });
    processCommandBuffer();
  }, [addDebugLog, processCommandBuffer, options?.commandTimeout]);

  const disconnectFromPort = useCallback(async () => {
    if (!selectedPort || connectionStatus === "disconnected" || connectionStatus === "disconnecting") {
      addDebugLog({ type: "info", message: "Already disconnected or no port selected." });
      return;
    }

    addDebugLog({ type: "info", message: `Disconnecting from port (VendorID: ${selectedPort.getInfo().usbVendorId})...` });
    setConnectionStatus("disconnecting");
    portCloseController.current = new AbortController(); // For signalling port.close()

    // 1. Cancel reader: This stops the read loop and releases its lock.
    if (readerRef.current) {
      try {
        await readerRef.current.cancel(); // This should cause the read loop to break
        // readerRef.current.releaseLock(); // Lock is released by cancel() or when read() returns { done: true }
        addDebugLog({ type: "info", message: "Reader cancelled." });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        addDebugLog({ type: "warning", message: `Error cancelling reader (may already be released): ${msg}` });
      } finally {
        readerRef.current = null;
      }
    }

    // 2. Abort and release writer
    if (writerRef.current) {
      try {
        await writerRef.current.abort(); // Abort pending writes
        // writerRef.current.releaseLock(); // Lock is released by abort()
        addDebugLog({ type: "info", message: "Writer aborted." });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        addDebugLog({ type: "warning", message: `Error aborting writer: ${msg}` });
      } finally {
        writerRef.current = null;
      }
    }

    // 3. Close the serial port itself
    if (selectedPort.readable || selectedPort.writable) { // Check if port is open
        try {
            await selectedPort.close(); // This should release any remaining locks.
            addDebugLog({ type: "info", message: "Serial port closed successfully." });
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(`Failed to close port: ${errorMessage}`);
            addDebugLog({ type: "error", message: `Failed to close port: ${errorMessage}` });
            setConnectionStatus("error"); // If port fails to close, it's an error state.
            // setSelectedPort(null); // Keep port for potential retry or inspection
            return;
        }
    }


    setConnectionStatus("disconnected");
    setSelectedPort(null); // Clear the selected port
    setError(null); // Clear any errors
    commandBufferRef.current = "";
    addDebugLog({ type: "info", message: "Disconnected successfully and resources released." });
  }, [selectedPort, connectionStatus, addDebugLog]);


  const startReading = useCallback(async (port: SerialPort) => {
    if (!port.readable) {
        addDebugLog({ type: "error", message: "Port is not readable. Cannot start reading." });
        // This should ideally be caught in connectToPort
        return;
    }

    // Ensure previous reader is fully released before creating a new one
    if (readerRef.current) {
        addDebugLog({ type: "warning", message: "Previous reader instance found. Attempting to release."});
        try {
            await readerRef.current.cancel(); // Cancel first
        } catch {} // Ignore error if already cancelled/released
        readerRef.current = null;
    }

    readerRef.current = port.readable.getReader();
    addDebugLog({ type: "info", message: "Reader obtained. Starting read loop." });

    try {
      while (true) {
        if (!readerRef.current) { // Safety check, should not happen if logic is correct
            addDebugLog({type: "warning", message: "Reader became null during read loop."});
            break;
        }
        const { value, done } = await readerRef.current.read();
        if (done) {
          addDebugLog({ type: "info", message: "Reader stream finished (done is true)." });
          // This means the port was closed or stream ended. disconnectFromPort should handle full cleanup.
          // Ensure lock is released. It should be by now.
          // readerRef.current.releaseLock(); // Not needed, read() returning done releases the lock
          readerRef.current = null;
          break;
        }
        if (value) {
          handleReceivedData(value);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (connectionStatus !== "disconnecting" && connectionStatus !== "disconnected") {
        // Only log as error if not part of an intentional disconnect
        addDebugLog({ type: "error", message: `Error in read loop: ${errorMessage}` });
        setError(`Read error: ${errorMessage}. Port may need reconnection.`);
        setConnectionStatus("error");
        // Attempt to disconnect to clean up resources after a read error
        await disconnectFromPort();
      } else {
        addDebugLog({ type: "info", message: `Read loop ended during disconnect: ${errorMessage}`});
      }
    } finally {
        // If reader still exists and lock might be held (e.g. loop exited unexpectedly)
        if (readerRef.current) {
            try {
                // readerRef.current.releaseLock(); // releaseLock if cancel wasn't called or done wasn't true.
            } catch {} // Ignore error if already released
            readerRef.current = null;
        }
        addDebugLog({ type: "info", message: "Read loop terminated." });
    }
  }, [handleReceivedData, addDebugLog, connectionStatus, disconnectFromPort]); // Added disconnectFromPort


  const connectToPort = useCallback(async (portToConnect: SerialPort) => {
    if (!portToConnect) {
      setError("No port provided to connect.");
      addDebugLog({ type: "error", message: "Connect failed: No port provided." });
      return;
    }
    if (connectionStatus === "connected" && selectedPort === portToConnect) {
        addDebugLog({ type: "info", message: "Already connected to this port." });
        return;
    }
    if (connectionStatus === "connecting" || connectionStatus === "connected") {
        addDebugLog({ type: "warning", message: "Already connected or connecting. Disconnect first."});
        await disconnectFromPort(); // Disconnect from current before connecting to new one
    }

    setConnectionStatus("connecting");
    setSelectedPort(portToConnect); // Set the port we are trying to connect to
    setError(null); // Clear previous errors

    try {
      await portToConnect.open({ baudRate: 115200 });
      addDebugLog({ type: "info", message: `Port opened (VendorID: ${portToConnect.getInfo().usbVendorId}).` });

      // Setup writer
      if (portToConnect.writable) {
        writerRef.current = portToConnect.writable.getWriter();
        addDebugLog({ type: "info", message: "Writer obtained." });
      } else {
        throw new Error("Port is not writable.");
      }

      // Setup reader and start reading
      if (portToConnect.readable) {
        // startReading is now responsible for getting the reader
        startReading(portToConnect); // Pass portToConnect, do not await
      } else {
        throw new Error("Port is not readable.");
      }

      setConnectionStatus("connected");
      commandBufferRef.current = ""; // Reset buffer
      lastCommandTimeRef.current = 0;
      addDebugLog({ type: "info", message: "Successfully connected and listening." });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      addDebugLog({ type: "error", message: `Connection failed: ${errorMessage}` });
      setError(`Failed to connect: ${errorMessage}`);
      setConnectionStatus("error");

      // Cleanup resources on failed connection attempt
      if (readerRef.current) {
        try { await readerRef.current.cancel(); } catch {}
        readerRef.current = null;
      }
      if (writerRef.current) {
        // No close on writer, but ensure lock is released if getWriter succeeded
        try { await writerRef.current.abort(); } catch {}
        writerRef.current = null;
      }
      // Try to close the port if it was opened
      if (portToConnect.readable || portToConnect.writable) { // Check if port appears open
          try { await portToConnect.close(); } catch (closeErr) {
              addDebugLog({type: "error", message: `Failed to close port after connection error: ${closeErr}`});
          }
      }
      setSelectedPort(null); // Clear selected port on failure
    }
  }, [connectionStatus, selectedPort, startReading, addDebugLog, disconnectFromPort]);


  const sendData = useCallback(async (data: string) => {
    if (!writerRef.current || connectionStatus !== "connected") {
      const msg = "Cannot send data: Not connected or writer not available.";
      setError(msg);
      addDebugLog({ type: "error", message: msg });
      return;
    }
    try {
      const encoder = new TextEncoder();
      await writerRef.current.write(encoder.encode(data));
      const loggedData = data.endsWith('\n') ? data.slice(0,-1) : data; // Avoid double newline in logs
      addDebugLog({ type: "sent", message: loggedData });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Error writing to serial port: ${errorMessage}`);
      addDebugLog({ type: "error", message: `Failed to send data: ${errorMessage}` });
      setConnectionStatus("error"); // Connection is now suspect
      await disconnectFromPort(); // Attempt to gracefully disconnect
    }
  }, [writerRef, connectionStatus, addDebugLog, disconnectFromPort]);

  // Effect for system-level connect/disconnect events
  useEffect(() => {
    if (!isSerialSupported || typeof window === 'undefined') return;

    const handleSerialConnect = (event: Event) => {
      const newPort = event.target as SerialPort;
      addDebugLog({ type: "info", message: `Serial port connected to system (VendorID: ${newPort.getInfo().usbVendorId}).` });
      // Check if this port is already known, if not, add it.
      setPorts(prevPorts => {
          const exists = prevPorts.some(p => p.port === newPort);
          if (!exists) {
              return [...prevPorts, {port: newPort, info: newPort.getInfo()}];
          }
          return prevPorts;
      });
      // listPorts(); // Optionally, refresh the whole list
    };

    const handleSerialDisconnect = async (event: Event) => {
      const disconnectedPort = event.target as SerialPort;
      addDebugLog({
        type: "info",
        message: `Serial port disconnected from system (VendorID: ${disconnectedPort.getInfo().usbVendorId}).`,
      });

      if (selectedPort && selectedPort === disconnectedPort) {
        addDebugLog({ type: "warning", message: "The active serial port has been disconnected from the system." });
        // Critical: Call disconnectFromPort to clean up resources and update state fully.
        // This will set selectedPort to null and update status.
        await disconnectFromPort();
      }
      // Refresh the list of available ports, removing the disconnected one.
      setPorts(prevPorts => prevPorts.filter(p => p.port !== disconnectedPort));
    };

    navigator.serial.addEventListener("connect", handleSerialConnect);
    navigator.serial.addEventListener("disconnect", handleSerialDisconnect);

    // Initial port list
    listPorts();

    return () => {
      navigator.serial.removeEventListener("connect", handleSerialConnect);
      navigator.serial.removeEventListener("disconnect", handleSerialDisconnect);
      // Cleanup: disconnect if connected when hook is unmounted
      if (connectionStatus === "connected" || connectionStatus === "connecting") {
        disconnectFromPort();
      }
    };
  }, [isSerialSupported, listPorts, addDebugLog, selectedPort, connectionStatus, disconnectFromPort]);

  // Clear error state when connection status changes positively or port is deselected
  useEffect(() => {
    if (connectionStatus === "connected" || connectionStatus === "disconnected" || !selectedPort) {
        setError(null);
    }
  }, [connectionStatus, selectedPort]);

  return {
    ports,
    selectedPort,
    connectionStatus,
    error,
    debugLogs,
    allICs,
    isSerialSupported,
    listPorts,
    requestPort,
    connectToPort,
    disconnectFromPort,
    sendData,
    setDebugLogs, // Expose for manual log manipulation if needed
  };
};
