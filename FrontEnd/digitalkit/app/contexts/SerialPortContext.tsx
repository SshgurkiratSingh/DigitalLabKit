"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  ReactNode,
} from "react";
import {
  SerialPort,
  SerialPortInfoWrapper,
  ICData,
  DebugLogEntry,
  PinStates,
} from "../types/serial";

interface SerialPortContextType {
  ports: SerialPortInfoWrapper[];
  selectedPort: SerialPort | null;
  isConnected: boolean;
  error: string | null;
  selectedIC: ICData | null;
  pinStates: PinStates;
  debugLogs: DebugLogEntry[];
  commandBuffer: string;
  setSelectedPort: (port: SerialPort | null) => void;
  requestPort: () => Promise<void>;
  connectToPort: () => Promise<void>;
  disconnectFromPort: () => Promise<void>;
  handleICSelect: (ic: ICData | null) => void;
  handlePinStateChange: (newPinStates: { [key: number]: boolean }) => void;
  handleClockFrequencyChange: (frequency: number) => void;
  sendData: (data: string) => Promise<void>;
  clearDebugLogs: () => void;
  addDebugLog: (type: DebugLogEntry["type"], message: string) => void;
}

const SerialPortContext = createContext<SerialPortContextType | undefined>(
  undefined
);

export function SerialPortProvider({ children }: { children: ReactNode }) {
  const [ports, setPorts] = useState<SerialPortInfoWrapper[]>([]);
  const [selectedPort, setSelectedPort] = useState<SerialPort | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIC, setSelectedIC] = useState<ICData | null>(null);
  const [pinStates, setPinStates] = useState<PinStates>({});
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [syncInterval, setSyncInterval] = useState<NodeJS.Timeout | null>(null);

  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const commandBufferRef = useRef<string>("");
  const lastCommandTimeRef = useRef<number>(0);
  const COMMAND_TIMEOUT = 500;

  // Check if Web Serial API is supported
  const isSerialSupported = typeof navigator !== "undefined" && "serial" in navigator;

  // List available ports
  const listPorts = async () => {
    if (!isSerialSupported) return;

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
    if (!isSerialSupported) return;

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

      if (selectedPort.writable) {
        writerRef.current = selectedPort.writable.getWriter();
      }

      if (selectedPort.readable) {
        readerRef.current = selectedPort.readable.getReader();
        startReading();
      }

      const interval = setInterval(() => {
        if (isConnected && selectedIC) {
          sendData("SYNC\n");
        }
      }, 1000);
      setSyncInterval(interval);

      setIsConnected(true);
      setError(null);
      commandBufferRef.current = "";
      lastCommandTimeRef.current = 0;

      addDebugLog("info", "Connected to serial port");
    } catch (err) {
      setError("Failed to connect to port");
      console.error(err);
      addDebugLog("error", `Connection failed: ${err}`);
    }
  };

  // Disconnect from port
  const disconnectFromPort = async () => {
    if (!selectedPort) return;

    try {
      if (syncInterval) {
        clearInterval(syncInterval);
        setSyncInterval(null);
      }

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
      commandBufferRef.current = "";
      lastCommandTimeRef.current = 0;

      addDebugLog("info", "Disconnected from serial port");
    } catch (err) {
      setError("Failed to disconnect from port");
      console.error(err);
      addDebugLog("error", `Disconnection failed: ${err}`);
    }
  };

  // Start reading from the serial port
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

        retryCount = 0;
        handleReceivedData(value);
      } catch (error) {
        console.error("Error reading from serial port:", error);
        addDebugLog("error", `Serial read error: ${error}`);

        if (retryCount < maxRetries) {
          retryCount++;
          addDebugLog(
            "info",
            `Attempting to reconnect (${retryCount}/${maxRetries})...`
          );

          try {
            await reconnect();
            continue;
          } catch (reconnectError) {
            console.error("Reconnection failed:", reconnectError);
            addDebugLog("error", `Reconnection failed: ${reconnectError}`);
          }
        }

        setIsConnected(false);
        setError("Connection lost. Please reconnect manually.");
        break;
      }
    }
  };

  // Reconnect to the port
  const reconnect = async () => {
    if (!selectedPort) return;

    if (readerRef.current) {
      await readerRef.current.cancel();
      await readerRef.current.releaseLock();
    }
    if (writerRef.current) {
      await writerRef.current.close();
      await writerRef.current.releaseLock();
    }
    await selectedPort.close();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await selectedPort.open({ baudRate: 115200 });
    if (selectedPort.readable) {
      readerRef.current = selectedPort.readable.getReader();
    }
    if (selectedPort.writable) {
      writerRef.current = selectedPort.writable.getWriter();
    }
    addDebugLog("info", "Reconnected successfully");
  };

  // Handle received data
  const handleReceivedData = (data: Uint8Array) => {
    const text = new TextDecoder().decode(data);
    const currentTime = Date.now();

    if (
      currentTime - lastCommandTimeRef.current > COMMAND_TIMEOUT &&
      commandBufferRef.current.length > 0
    ) {
      addDebugLog(
        "info",
        `Command buffer timeout, clearing: "${commandBufferRef.current}"`
      );
      commandBufferRef.current = "";
    }

    commandBufferRef.current += text;
    lastCommandTimeRef.current = currentTime;

    addDebugLog(
      "info",
      `Raw data received: "${text}" (buffer now: "${commandBufferRef.current}")`
    );

    processCommandBuffer();
  };

  // Process command buffer
  const processCommandBuffer = () => {
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
  };

  // Process a complete command
  const processCommand = (command: string) => {
    addDebugLog("received", command);

    // Handle IC selection
    if (command.startsWith("IC:")) {
      // ... IC selection logic ...
    }
    // Handle pin states
    else if (/^[01]{14,16}$/.test(command)) {
      const pinData = command;
      const newPinStates: PinStates = {};

      for (let i = 0; i < pinData.length; i++) {
        newPinStates[i + 1] = pinData[i] === "1";
      }

      setPinStates(newPinStates);
      addDebugLog("info", `Pin states updated from binary data: ${pinData}`);
    }
    // Handle sync response
    else if (command === "SYNC:OK") {
      addDebugLog("info", "Device synchronized");
    }
    // Handle error messages
    else if (command.startsWith("ERROR:")) {
      addDebugLog("error", command.substring(6).trim());
    }
    // Handle unrecognized commands
    else {
      addDebugLog("info", `Unhandled message: ${command}`);
    }
  };

  // Send data to the serial port
  const sendData = async (data: string) => {
    if (!writerRef.current) return;

    try {
      const encoder = new TextEncoder();
      await writerRef.current.write(encoder.encode(data));
      addDebugLog("sent", data.trim());
    } catch (error) {
      console.error("Error writing to serial port:", error);
      addDebugLog("error", `Failed to send data: ${error}`);
    }
  };

  // Add debug log entry
  const addDebugLog = (type: DebugLogEntry["type"], message: string) => {
    setDebugLogs((prev) => [
      ...prev,
      {
        timestamp: new Date().toISOString(),
        type,
        message,
      },
    ]);
  };

  // Clear debug logs
  const clearDebugLogs = () => setDebugLogs([]);

  // Handle IC selection
  const handleICSelect = (ic: ICData | null) => {
    setSelectedIC(ic);
    if (ic && isConnected) {
      sendData(`IC:${ic.partNumber}\n`);
    }
  };

  // Handle pin state changes
  const handlePinStateChange = (newPinStates: { [key: number]: boolean }) => {
    if (!isConnected || !selectedIC) return;

    let pinStateStr = "";
    const pinCount = selectedIC.pinCount || 14;

    if (pinCount < 14 || pinCount > 16) {
      addDebugLog(
        "error",
        `Invalid pin count: ${pinCount}. Must be between 14 and 16.`
      );
      return;
    }

    for (let i = 1; i <= pinCount; i++) {
      const state = i in newPinStates ? newPinStates[i] : pinStates[i] || false;
      pinStateStr += state ? "1" : "0";
    }

    if (pinStateStr.length < 14 || pinStateStr.length > 16) {
      addDebugLog(
        "error",
        `Invalid pin state string length: ${pinStateStr.length}. Must be between 14 and 16 bits.`
      );
      return;
    }

    sendData(`${pinStateStr}\n`);
    setPinStates((prev) => ({
      ...prev,
      ...newPinStates,
    }));

    addDebugLog(
      "sent",
      `Pin states changed for ${selectedIC.partNumber}: ${pinStateStr} (${pinCount} pins)`
    );
  };

  // Handle clock frequency changes
  const handleClockFrequencyChange = (frequency: number) => {
    if (isConnected && selectedIC) {
      sendData(`CLOCK:${frequency}\n`);
    }
  };

  // Monitor port connection changes
  useEffect(() => {
    if (!isSerialSupported) return;

    const handleConnect = () => listPorts();
    const handleDisconnect = () => {
      listPorts();
      if (selectedPort && !ports.find((p) => p.port === selectedPort)) {
        setSelectedPort(null);
        setIsConnected(false);
      }
    };

    navigator.serial.addEventListener("connect", handleConnect);
    navigator.serial.addEventListener("disconnect", handleDisconnect);

    listPorts();

    return () => {
      navigator.serial.removeEventListener("connect", handleConnect);
      navigator.serial.removeEventListener("disconnect", handleDisconnect);
    };
  }, [isSerialSupported, ports, selectedPort]);

  const value = {
    ports,
    selectedPort,
    isConnected,
    error,
    selectedIC,
    pinStates,
    debugLogs,
    commandBuffer: commandBufferRef.current,
    setSelectedPort,
    requestPort,
    connectToPort,
    disconnectFromPort,
    handleICSelect,
    handlePinStateChange,
    handleClockFrequencyChange,
    sendData,
    clearDebugLogs,
    addDebugLog,
  };

  return (
    <SerialPortContext.Provider value={value}>
      {children}
    </SerialPortContext.Provider>
  );
}

export function useSerialPort() {
  const context = useContext(SerialPortContext);
  if (context === undefined) {
    throw new Error("useSerialPort must be used within a SerialPortProvider");
  }
  return context;
}