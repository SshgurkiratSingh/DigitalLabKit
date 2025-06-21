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

// Define Web Bluetooth API types
interface BluetoothDevice {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
  addEventListener(
    type: "gattserverdisconnected",
    listener: (event: Event) => void
  ): void;
  removeEventListener(
    type: "gattserverdisconnected",
    listener: (event: Event) => void
  ): void;
}

interface BluetoothRemoteGATTServer {
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string | number): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(
    characteristic: string | number
  ): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristic {
  readValue(): Promise<DataView>;
  writeValue(value: BufferSource): Promise<void>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  addEventListener(
    type: "characteristicvaluechanged",
    listener: (event: Event) => void
  ): void;
  removeEventListener(
    type: "characteristicvaluechanged",
    listener: (event: Event) => void
  ): void;
  properties: BluetoothCharacteristicProperties;
}

interface BluetoothCharacteristicProperties {
  read: boolean;
  write: boolean;
  notify: boolean;
  // Add other properties as needed
}

interface Bluetooth extends EventTarget {
  requestDevice(
    options?: RequestDeviceOptions
  ): Promise<BluetoothDevice>;
  getAvailability(): Promise<boolean>;
  addEventListener(
    type: "availabilitychanged",
    listener: (event: Event) => void
  ): void;
  removeEventListener(
    type: "availabilitychanged",
    listener: (event: Event) => void
  ): void;
}

interface RequestDeviceOptions {
  filters?: Array<{
    services?: Array<string | number>;
    name?: string;
    namePrefix?: string;
  }>;
  optionalServices?: Array<string | number>;
  acceptAllDevices?: boolean;
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
    bluetooth: Bluetooth; // Add bluetooth to Navigator
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
  const [selectedBluetoothDevice, setSelectedBluetoothDevice] =
    useState<BluetoothDevice | null>(null); // Added
  const [bluetoothCharacteristic, setBluetoothCharacteristic] =
    useState<BluetoothRemoteGATTCharacteristic | null>(null); // Added
  const [isConnected, setIsConnected] = useState(false);
  const [isBluetoothConnected, setIsBluetoothConnected] = useState(false); // Added
  const [error, setError] = useState<string | null>(null);
  const [bluetoothError, setBluetoothError] = useState<string | null>(null); // Added
  const [selectedIC, setSelectedIC] = useState<ICData | null>(null);
  const [pinStates, setPinStates] = useState<{ [key: number]: boolean }>({});
  const [debugLogs, setDebugLogs] = useState<
    Array<{
      timestamp: string;
      type: "received" | "sent" | "info" | "error" | "warning";
      message: string;
    }>
  >([]);
  const [allICs, setAllICs] = useState<ICData[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(true);
  const [syncInterval, setSyncInterval] = useState<NodeJS.Timeout | null>(null);
  const [connectionType, setConnectionType] = useState<"serial" | "bluetooth">(
    "serial"
  ); // Added
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
  // Check if Web Bluetooth API is supported
  const isBluetoothSupported = "bluetooth" in navigator;

  // Request Bluetooth device
  const requestBluetoothDevice = async () => {
    if (!isBluetoothSupported) {
      setBluetoothError("Web Bluetooth API is not supported in this browser.");
      return;
    }
    try {
      // Common service UUIDs for Serial Port Profile (SPP) or similar
      // Nordic UART Service: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
      // Standard Serial Port Service: 00001101-0000-1000-8000-00805F9B34FB
      const device = await navigator.bluetooth.requestDevice({
        // acceptAllDevices: true, // For broader discovery in testing
        filters: [
          { services: ["00001101-0000-1000-8000-00805f9b34fb"] }, // Standard Serial Port Service
          { services: [0x1800, 0x1801, 0x180A] }, // Generic Access, Generic Attribute, Device Information (often present)
          { namePrefix: "HC-05" }, // Common Bluetooth module name
          { namePrefix: "HC-06" },
          { namePrefix: "ESP32" },
        ],
        optionalServices: ["6e400001-b5a3-f393-e0a9-e50e24dcca9e"], // Nordic UART
      });
      setSelectedBluetoothDevice(device);
      setBluetoothError(null);
      setDebugLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          type: "info",
          message: `Bluetooth device selected: ${device.name || device.id}`,
        },
      ]);
    } catch (err) {
      if ((err as Error).name === "NotFoundError") {
        setBluetoothError("No Bluetooth device selected or found.");
      } else {
        setBluetoothError("Failed to request Bluetooth device.");
      }
      console.error("Bluetooth device request error:", err);
      setDebugLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          type: "error",
          message: `Bluetooth device request failed: ${err}`,
        },
      ]);
    }
  };

  // Connect to selected Bluetooth device
  const connectToBluetoothDevice = async () => {
    if (!selectedBluetoothDevice) {
      setBluetoothError("No Bluetooth device selected.");
      return;
    }

    try {
      setDebugLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          type: "info",
          message: `Attempting to connect to Bluetooth device: ${
            selectedBluetoothDevice.name || selectedBluetoothDevice.id
          }`,
        },
      ]);

      const server = await selectedBluetoothDevice.gatt?.connect();
      if (!server) {
        throw new Error("GATT server not available.");
      }

      setDebugLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          type: "info",
          message: "Connected to GATT server.",
        },
      ]);

       // Define well-known UUIDs
       const NORDIC_UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
       const NORDIC_UART_RX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // Client writes to this
       const NORDIC_UART_TX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // Client receives notifications from this

       const SPP_SERVICE_UUID = "00001101-0000-1000-8000-00805f9b34fb";
       // For SPP, characteristics are not standardized.

       let service;
       let writeCharacteristic: BluetoothRemoteGATTCharacteristic;
       let notifyCharacteristic: BluetoothRemoteGATTCharacteristic; // Separate state for notify char

       try {
         // Try Nordic UART first
         service = await server.getPrimaryService(NORDIC_UART_SERVICE_UUID);
         writeCharacteristic = await service.getCharacteristic(NORDIC_UART_RX_CHAR_UUID);
         notifyCharacteristic = await service.getCharacteristic(NORDIC_UART_TX_CHAR_UUID);
         setDebugLogs((prev) => [...prev, { timestamp: new Date().toISOString(), type: "info", message: "Using Nordic UART Service." }]);
       } catch (e) {
         setDebugLogs((prev) => [...prev, { timestamp: new Date().toISOString(), type: "warning", message: `Nordic UART not found (${e}), trying SPP...` }]);
         try {
           // Try SPP
           service = await server.getPrimaryService(SPP_SERVICE_UUID);
           const characteristics = await service.getCharacteristics();
           const foundWriteChar = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);
           const foundNotifyChar = characteristics.find(c => c.properties.notify);

           if (!foundWriteChar || !foundNotifyChar) {
             // Attempt to use the same characteristic if one supports both, common in some SPP implementations
             const singleCharForBoth = characteristics.find(c => (c.properties.write || c.properties.writeWithoutResponse) && c.properties.notify);
             if (singleCharForBoth) {
                writeCharacteristic = singleCharForBoth;
                notifyCharacteristic = singleCharForBoth;
                setDebugLogs((prev) => [...prev, { timestamp: new Date().toISOString(), type: "info", message: `Using SPP Service with single characteristic for Write/Notify: ${singleCharForBoth.uuid}` }]);
             } else {
                throw new Error("SPP service found, but required write/notify characteristics not identified clearly.");
             }
           } else {
            writeCharacteristic = foundWriteChar;
            notifyCharacteristic = foundNotifyChar;
            setDebugLogs((prev) => [...prev, { timestamp: new Date().toISOString(), type: "info", message: `Using SPP Service. Write: ${writeCharacteristic.uuid}, Notify: ${notifyCharacteristic.uuid}` }]);
           }
         } catch (e2) {
           setDebugLogs((prev) => [...prev, { timestamp: new Date().toISOString(), type: "error", message: `SPP attempt failed: ${e2}` }]);
           throw new Error("Could not find a suitable Bluetooth serial service (Nordic UART or SPP).");
         }
       }

       setBluetoothCharacteristic(writeCharacteristic); // Store the characteristic used for writing

       // Listen for gattserverdisconnected event
       selectedBluetoothDevice.addEventListener('gattserverdisconnected', onBluetoothDeviceDisconnected);

       setIsBluetoothConnected(true);
       setBluetoothError(null);
       commandBufferRef.current = ""; // Reset command buffer
       lastCommandTimeRef.current = 0;

       setDebugLogs((prev) => [
         ...prev,
         {
           timestamp: new Date().toISOString(),
           type: "info",
           message: `Bluetooth connected. Write Char: ${writeCharacteristic.uuid}, Notify Char: ${notifyCharacteristic.uuid}.`,
         },
       ]);

       // Start notifications on the NOTIFY characteristic
       if (notifyCharacteristic.properties.notify) {
         await notifyCharacteristic.startNotifications();
         notifyCharacteristic.addEventListener(
           "characteristicvaluechanged",
           handleBluetoothDataReceived
         );
         setDebugLogs((prev) => [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            type: "info",
            message: "Started Bluetooth characteristic notifications.",
          },
        ]);
      } else {
        // Fallback to polling if notify is not supported (less ideal)
        // Or indicate that the characteristic is not suitable for receiving data this way
        setDebugLogs((prev) => [
            ...prev,
            {
              timestamp: new Date().toISOString(),
              type: "warning",
              message: "Bluetooth characteristic does not support notifications. Real-time data reception may not work.",
            },
          ]);
      }
    } catch (err) {
      setBluetoothError(`Failed to connect to Bluetooth device: ${err}`);
      console.error("Bluetooth connection error:", err);
      setIsBluetoothConnected(false);
      setDebugLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          type: "error",
          message: `Bluetooth connection failed: ${err}`,
        },
      ]);
    }
  };

  // Disconnect from Bluetooth device
  const disconnectFromBluetoothDevice = async () => {
    if (!selectedBluetoothDevice || !selectedBluetoothDevice.gatt) {
      setBluetoothError("No Bluetooth device or GATT server to disconnect from.");
      return;
    }

    try {
      selectedBluetoothDevice.gatt.disconnect();
      // The onBluetoothDeviceDisconnected handler will do most of the cleanup
    } catch (err) {
      setBluetoothError("Failed to disconnect from Bluetooth device.");
      console.error("Bluetooth disconnection error:", err);
      setDebugLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          type: "error",
          message: `Bluetooth disconnection error: ${err}`,
        },
      ]);
    }
  };

  // Handle Bluetooth device disconnection event
  const onBluetoothDeviceDisconnected = () => {
    setIsBluetoothConnected(false);
    setBluetoothCharacteristic(null);
    setSelectedBluetoothDevice(null); // Optionally clear the selected device
    setBluetoothError(null); // Clear previous errors

    // Remove the event listener to prevent memory leaks
    if (selectedBluetoothDevice) {
      selectedBluetoothDevice.removeEventListener('gattserverdisconnected', onBluetoothDeviceDisconnected);
    }
    // Also remove characteristic listener if it was added
    if (bluetoothCharacteristic) {
      (async () => {
        try {
          // Check if stopNotifications is needed and supported
          if (bluetoothCharacteristic.properties.notify) {
           await bluetoothCharacteristic.stopNotifications();
            setDebugLogs((prev) => [
                ...prev,
                {
                  timestamp: new Date().toISOString(),
                  type: "info",
                  message: "Stopped Bluetooth characteristic notifications.",
                },
              ]);
          }
          bluetoothCharacteristic.removeEventListener(
            "characteristicvaluechanged",
            handleBluetoothDataReceived
          );
        } catch (err) {
          console.warn("Error stopping notifications or removing listener:", err);
          // Log this as a warning in debug if necessary
        setDebugLogs((prev) => [
            ...prev,
            {
              timestamp: new Date().toISOString(),
              type: "warning",
              message: `Error during BT cleanup: ${err}`,
            },
          ]);
      }
    })(); // Invoke the IIFE
    }

    setDebugLogs((prev) => [
      ...prev,
      {
        timestamp: new Date().toISOString(),
        type: "info",
        message: "Bluetooth device disconnected.",
      },
    ]);
  };


  // Request and list available serial ports
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

  // Handle data received from Bluetooth characteristic
  const handleBluetoothDataReceived = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (target.value) {
      // DataView to Uint8Array
      const data = new Uint8Array(target.value.buffer);
      // Pass to the existing data handler, prefixing to distinguish if needed
      handleReceivedData(data, "BT");
    }
  };

  // Handle received data from the serial port or bluetooth
  const handleReceivedData = (data: Uint8Array, sourceType: "SERIAL" | "BT" = "SERIAL") => {
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

      // Process complete lines
      completeLines.forEach((line) => {
        const trimmedLine = line.trim();
        if (trimmedLine) {
          processCommand(trimmedLine);
        }
      });

      // Update buffer with remaining incomplete data
      commandBufferRef.current = remainingBuffer;

      // Update last command time since we processed data
      lastCommandTimeRef.current = Date.now();
    }
  };

  // Process a complete command
  const processCommand = (command: string) => {
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
        const icNumber = command.substring(3).trim();
        // Extract numeric part and series prefix from received IC number
        const numericPart = icNumber.match(/\d+/)?.[0];
        const seriesPrefix =
          icNumber.match(/^[a-zA-Z]+/)?.[0]?.toLowerCase() || "";
        console.log(
          "Processing IC command:",
          icNumber,
          numericPart,
          seriesPrefix
        );
        if (numericPart) {
          // First try exact match (case insensitive)
          const exactMatch = allICs.find(
            (ic) => ic.partNumber.toLowerCase() === icNumber.toLowerCase()
          );

          // Log all available ICs for debugging
          setDebugLogs((prev) => [
            ...prev,
            {
              timestamp: new Date().toISOString(),
              type: "info",
              message: `Searching for IC: ${icNumber}. Available ICs: ${allICs
                .map((ic) => ic.partNumber)
                .join(", ")}`,
            },
          ]);

          if (exactMatch) {
            setDebugLogs((prev) => [
              ...prev,
              {
                timestamp: new Date().toISOString(),
                type: "info",
                message: `Found exact match for IC: ${exactMatch.partNumber}`,
              },
            ]);
            setSelectedIC(exactMatch);
            onICSelect?.(exactMatch);
            sendData("PINS?\n");
            return;
          }

          // Try numeric part match with series consideration
          const numericMatches = allICs.filter((ic) => {
            const icDigits = ic.partNumber.match(/\d+/)?.[0];
            const icPrefix =
              ic.partNumber.match(/^[a-zA-Z]+/)?.[0]?.toLowerCase() || "";

            // If a series prefix was provided, it must match
            if (seriesPrefix && icPrefix && seriesPrefix !== icPrefix) {
              return false;
            }

            // Allow for partial numeric matches (e.g., "74" matches "7400")
            return (
              icDigits?.startsWith(numericPart) ||
              numericPart.startsWith(icDigits || "")
            );
          });

          if (numericMatches.length >= 1) {
            // Sort matches by closest numeric match
            numericMatches.sort((a, b) => {
              const aDigits = a.partNumber.match(/\d+/)?.[0] || "";
              const bDigits = b.partNumber.match(/\d+/)?.[0] || "";

              // Prioritize exact numeric matches
              if (aDigits === numericPart && bDigits !== numericPart) return -1;
              if (bDigits === numericPart && aDigits !== numericPart) return 1;

              // Then prioritize prefix matches
              const aPrefix =
                a.partNumber.match(/^[a-zA-Z]+/)?.[0]?.toLowerCase() || "";
              const bPrefix =
                b.partNumber.match(/^[a-zA-Z]+/)?.[0]?.toLowerCase() || "";
              if (seriesPrefix) {
                if (aPrefix === seriesPrefix && bPrefix !== seriesPrefix)
                  return -1;
                if (bPrefix === seriesPrefix && aPrefix !== seriesPrefix)
                  return 1;
              }

              // Finally sort by numeric similarity
              const aDiff = Math.abs(parseInt(aDigits) - parseInt(numericPart));
              const bDiff = Math.abs(parseInt(bDigits) - parseInt(numericPart));
              return aDiff - bDiff;
            });

            const matchingIC = numericMatches[0];
            const matchType =
              matchingIC.partNumber.match(/\d+/)?.[0] === numericPart
                ? "exact"
                : "partial";
            const seriesMatch = matchingIC.partNumber
              .toLowerCase()
              .startsWith(seriesPrefix);

            setDebugLogs((prev) => [
              ...prev,
              {
                timestamp: new Date().toISOString(),
                type: matchType === "exact" ? "info" : "warning",
                message: `Selected IC ${matchingIC.partNumber} based on ${
                  seriesMatch ? "series and " : ""
                }${matchType} numeric match: ${numericPart}${
                  numericMatches.length > 1
                    ? `. Other possible matches: ${numericMatches
                        .slice(1)
                        .map((ic) => ic.partNumber)
                        .join(", ")}`
                    : ""
                }`,
              },
            ]);
            setSelectedIC(matchingIC);
            onICSelect?.(matchingIC);
            sendData("PINS?\n");
            return;
          }

          // If no matches found, try more lenient matching
          const similarICs = allICs.filter((ic) => {
            const icDigits = ic.partNumber.match(/\d+/)?.[0];
            const icPrefix =
              ic.partNumber.match(/^[a-zA-Z]+/)?.[0]?.toLowerCase() || "";

            // Allow for any numeric overlap
            return (
              icDigits?.includes(numericPart) ||
              numericPart.includes(icDigits || "")
            );
          });

          if (similarICs.length > 0) {
            // Sort by closest match to numeric part
            similarICs.sort((a, b) => {
              const aDigits = a.partNumber.match(/\d+/)?.[0] || "";
              const bDigits = b.partNumber.match(/\d+/)?.[0] || "";
              const aDiff = Math.abs(parseInt(aDigits) - parseInt(numericPart));
              const bDiff = Math.abs(parseInt(bDigits) - parseInt(numericPart));
              return aDiff - bDiff;
            });

            const similarIC = similarICs[0];
            setDebugLogs((prev) => [
              ...prev,
              {
                timestamp: new Date().toISOString(),
                type: "warning",
                message: `No direct match found. Using similar IC ${
                  similarIC.partNumber
                } for number: ${numericPart}. Available similar ICs: ${similarICs
                  .map((ic) => ic.partNumber)
                  .join(", ")}`,
              },
            ]);
            setSelectedIC(similarIC);
            onICSelect?.(similarIC);
            sendData("PINS?\n");
          } else {
            setDebugLogs((prev) => [
              ...prev,
              {
                timestamp: new Date().toISOString(),
                type: "error",
                message: `No IC found matching number: ${icNumber}. Available ICs: ${allICs
                  .map((ic) => ic.partNumber)
                  .join(", ")}. Please check the IC number and try again.`,
              },
            ]);
          }
        } else {
          setDebugLogs((prev) => [
            ...prev,
            {
              timestamp: new Date().toISOString(),
              type: "error",
              message: `Invalid IC number format (no numeric part found): ${icNumber}. Expected format: e.g., "7400" or "74LS00". Available ICs: ${allICs
                .map((ic) => ic.partNumber)
                .join(", ")}`,
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

  // Send data to the serial port or Bluetooth characteristic
  const sendData = async (data: string) => {
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data);

    if (isBluetoothConnected && bluetoothCharacteristic && bluetoothCharacteristic.properties.write) {
      try {
        await bluetoothCharacteristic.writeValue(encodedData);
        setDebugLogs((prev) => [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            type: "sent",
            message: `BT: ${data.trim()}`,
          },
        ]);
      } catch (error) {
        console.error("Error writing to Bluetooth characteristic:", error);
        setBluetoothError(`Failed to send data over Bluetooth: ${error}`);
        setDebugLogs((prev) => [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            type: "error",
            message: `BT send error: ${error}`,
          },
        ]);
      }
    } else if (isConnected && writerRef.current) {
      try {
        await writerRef.current.write(encodedData);

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
    if ((isConnected || isBluetoothConnected) && selectedIC) {
      // Send clock frequency command to the device
      sendData(`CLOCK:${frequency}\n`);
    }
  };

  // Handle IC selection
  const handleICSelect = (ic: ICData | null) => {
    setSelectedIC(ic);
    if (ic && (isConnected || isBluetoothConnected)) {
      // Send IC selection to the device
      sendData(`IC:${ic.partNumber}\n`);
    }
  };

  // Handle pin state changes
  const handlePinStateChange = (newPinStates: { [key: number]: boolean }) => {
    if (!(isConnected || isBluetoothConnected) || !selectedIC) return;

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
    sendData(`PINS:${pinStateStr}\n`);

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

  // Load IC data from JSON files
  useEffect(() => {
    const loadICData = async () => {
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

        const allICData: ICData[] = [];

        for (const file of icFiles) {
          const response = await fetch(`/files/${file}`);
          if (!response.ok) {
            throw new Error(`Failed to load ${file}: ${response.statusText}`);
          }
          const data = await response.json();
          if (!data || typeof data !== "object") {
            throw new Error(`Invalid data format in ${file}`);
          }

          // Extract ICs from nested structure with improved type checking
          Object.values(data).forEach((series: any) => {
            if (!series || typeof series !== "object") {
              console.warn("Invalid series data found, skipping...");
              return;
            }
            Object.values(series).forEach((category: any) => {
              if (!category || typeof category !== "object") {
                console.warn("Invalid category data found, skipping...");
                return;
              }
              Object.values(category).forEach((ic: any) => {
                if (!ic || typeof ic !== "object") {
                  console.warn("Invalid IC data found, skipping...");
                  return;
                }
                // Validate required IC properties
                if (
                  ic.partNumber &&
                  typeof ic.partNumber === "string" &&
                  ic.description &&
                  typeof ic.description === "string" &&
                  ic.category &&
                  typeof ic.category === "string" &&
                  ic.pinCount &&
                  typeof ic.pinCount === "number" &&
                  Array.isArray(ic.pinConfiguration) &&
                  ic.pinConfiguration.every(
                    (pin: any) =>
                      pin &&
                      typeof pin.pin === "number" &&
                      typeof pin.name === "string" &&
                      typeof pin.type === "string" &&
                      typeof pin.function === "string"
                  )
                ) {
                  allICData.push(ic as ICData);
                } else {
                  console.warn(
                    `Skipping IC with invalid or missing properties: ${
                      ic.partNumber || "unknown"
                    }`
                  );
                }
              });
            });
          });
        }

        setAllICs(allICData);
        setDebugLogs((prev) => [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            type: "info",
            message: `Successfully loaded ${allICData.length} ICs from ${
              icFiles.length
            } files. IC types: ${Array.from(
              new Set(allICData.map((ic) => ic.category))
            ).join(", ")}`,
          },
        ]);
      } catch (error) {
        console.error("Error loading IC data:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        setDebugLogs((prev) => [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            type: "error",
            message: `Failed to load IC data: ${errorMessage}. Please check that all IC JSON files are present in /public/files/ and properly formatted.`,
          },
        ]);
      }
    };

    loadICData();
  }, []); // Run once when component mounts

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
      <div className="p-4 bg-red-900 text-red-100 rounded-md">
        Web Serial API is not supported in this browser. Please use Chrome or
        Edge.
      </div>
    );
  }
  if (!isBluetoothSupported) {
    // Optionally return a similar message or handle it differently
    // For now, we'll allow the component to render and show errors inline
    console.warn("Web Bluetooth API is not supported in this browser.");
  }

  return (
    <div className=" gap-6">
      {/* Serial Port Connection */}
      <div className="p-6 bg-[var(--background)] rounded-lg shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-[var(--foreground)]">
          Device Connection
        </h2>

        {/* Connection Type Selector (Tabs or Radio Buttons) - Example with simple text for now */}
        <div className="mb-4">
          <span className="text-[var(--foreground)] mr-4">Connect via:</span>
          <button
            onClick={() => setConnectionType("serial")}
            className={`px-3 py-1 border rounded mr-2 ${
              connectionType === "serial"
                ? "bg-blue-500 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
            disabled={isConnected || isBluetoothConnected}
          >
            Serial
          </button>
          {isBluetoothSupported && (
            <button
              onClick={() => setConnectionType("bluetooth")}
              className={`px-3 py-1 border rounded ${
                connectionType === "bluetooth"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
              disabled={isConnected || isBluetoothConnected}
            >
              Bluetooth
            </button>
          )}
        </div>

        {connectionType === "serial" && isSerialSupported && (
          <>
            {/* Serial Connection Status */}
            <div className="mb-4 flex items-center">
              <div
                className={`w-3 h-3 rounded-full mr-2 ${
                  isConnected ? "bg-green-500" : "bg-red-500"
                }`}
              ></div>
              <span className="text-[var(--foreground)]">
                Serial: {isConnected ? "Connected" : "Disconnected"}
              </span>
            </div>

            {/* Port Selection */}
            <div className="mb-4">
              <select
                className="w-full p-2 border rounded bg-neutral-800 text-[var(--foreground)] border-neutral-600"
                value={
                  selectedPort
                    ? ports.findIndex((p) => p.port === selectedPort)
                    : ""
                }
                onChange={(e) => {
                  const index = parseInt(e.target.value);
                  setSelectedPort(index >= 0 ? ports[index].port : null);
                }}
                disabled={isConnected || isBluetoothConnected}
              >
                <option value="">Select a serial port</option>
                {ports.map((port, index) => (
                  <option key={index} value={index}>
                    {`Port ${index + 1} - ${
                      port.info.usbVendorId || "Unknown"
                    }`}
                  </option>
                ))}
              </select>
            </div>

            {/* Action Buttons */}
            <div className="space-x-2">
              <button
                onClick={requestPort}
                disabled={isConnected || isBluetoothConnected}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
              >
                Request Serial Port
              </button>
              <button
                onClick={isConnected ? disconnectFromPort : connectToPort}
                disabled={!selectedPort || isBluetoothConnected}
                className={`px-4 py-2 rounded-md ${
                  isConnected
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-green-500 hover:bg-green-600"
                } text-white disabled:opacity-50`}
              >
                {isConnected ? "Disconnect Serial" : "Connect Serial"}
              </button>
            </div>

            {/* Error Messages */}
            {error && (
              <div className="mt-4 p-2 bg-red-900 text-red-100 rounded-md">
                {error}
              </div>
            )}
          </>
        )}

        {connectionType === "bluetooth" && isBluetoothSupported && (
          <>
            <div className="mb-4 flex items-center">
              <div
                className={`w-3 h-3 rounded-full mr-2 ${
                  isBluetoothConnected ? "bg-green-500" : "bg-red-500"
                }`}
              ></div>
              <span className="text-[var(--foreground)]">
                Bluetooth:{" "}
                {isBluetoothConnected
                  ? `Connected to ${
                      selectedBluetoothDevice?.name ||
                      selectedBluetoothDevice?.id ||
                      "device"
                    }`
                  : "Disconnected"}
              </span>
            </div>
            <div className="space-x-2">
              <button
                onClick={requestBluetoothDevice}
                disabled={isBluetoothConnected || isConnected}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
              >
                Request Bluetooth Device
              </button>
              <button
                onClick={
                  isBluetoothConnected
                    ? disconnectFromBluetoothDevice
                    : connectToBluetoothDevice
                }
                disabled={!selectedBluetoothDevice || isConnected}
                className={`px-4 py-2 rounded-md ${
                  isBluetoothConnected
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-green-500 hover:bg-green-600"
                } text-white disabled:opacity-50`}
              >
                {isBluetoothConnected
                  ? "Disconnect Bluetooth"
                  : "Connect Bluetooth"}
              </button>
            </div>
            {selectedBluetoothDevice && !isBluetoothConnected && (
                <p className="text-sm text-neutral-400 mt-2">Selected device: {selectedBluetoothDevice.name || selectedBluetoothDevice.id}</p>
            )}
            {bluetoothError && (
              <div className="mt-4 p-2 bg-red-900 text-red-100 rounded-md">
                {bluetoothError}
              </div>
            )}
          </>
        )}
         {!isSerialSupported && connectionType === "serial" && (
          <div className="p-4 bg-yellow-700 text-yellow-100 rounded-md">
            Web Serial API is not supported in this browser. Please use Chrome or Edge.
          </div>
        )}
        {!isBluetoothSupported && connectionType === "bluetooth" && (
          <div className="p-4 bg-yellow-700 text-yellow-100 rounded-md">
            Web Bluetooth API is not supported in this browser. Please use compatible Chrome/Edge.
          </div>
        )}
      </div>

      {/* IC Selection and Visualization */}
      <div className="p-6 bg-[var(--background)] rounded-lg shadow-lg mt-6">
        <h2 className="text-xl font-semibold mb-4 text-[var(--foreground)]">
          IC Configuration
        </h2>
        <ICSelector onICSelect={handleICSelect} />
        {selectedIC && (
          <>
            <div className="mt-6 flex justify-center w-full">
              <ICVisualizer
                ic={selectedIC}
                onPinStateChange={handlePinStateChange}
                serialConnected={isConnected || isBluetoothConnected} // Updated
                currentPinStates={pinStates}
              />
            </div>
            <ICTruthTableVerifier
              selectedIC={selectedIC.partNumber}
              currentPinStates={pinStates}
              onPinStateChange={handlePinStateChange}
              onClockFrequencyChange={handleClockFrequencyChange}
              isConnected={isConnected || isBluetoothConnected} // Updated
            />
          </>
        )}
      </div>

      {/* Debug Log - Spanning both columns on medium screens and above */}
      {showDebugLog && (
      <div className="md:col-span-2 p-6 bg-[var(--background)] rounded-lg shadow-lg border-2 border-blue-500">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-[var(--foreground)] flex items-center">
            <span className="mr-2">🔍</span>
            Debug Log
          </h2>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowDebugLog(!showDebugLog)}
              className="px-4 py-2 text-sm bg-purple-700 text-purple-100 rounded-md hover:bg-purple-600"
            >
              {showDebugLog ? "Hide Debug Log" : "Show Debug Log"}
            </button>
            <button
              onClick={() => setDebugLogs([])}
              className="px-4 py-2 text-sm bg-red-700 text-red-100 rounded-md hover:bg-red-600 dark:bg-red-900 dark:text-red-100 dark:hover:bg-red-800"
            >
              Clear Log
            </button>
            <button
              onClick={() => {
                if (isConnected || isBluetoothConnected) {
                  sendData("SYNC\n");
                }
              }}
              disabled={!(isConnected || isBluetoothConnected)}
              className="px-4 py-2 text-sm bg-blue-700 text-blue-100 rounded-md hover:bg-blue-600 dark:bg-blue-900 dark:text-blue-100 dark:hover:bg-blue-800 disabled:opacity-50"
            >
              Request Sync (Current: {connectionType})
            </button>
            <button
              onClick={() => {
                setDebugLogs((prev) => [
                  ...prev,
                  {
                    timestamp: new Date().toISOString(),
                    type: "info",
      message: `Raw data received (${sourceType}): "${text}" (buffer now: "${commandBufferRef.current}")`,
    },
  ]);
              }}
              className="px-4 py-2 text-sm bg-yellow-700 text-yellow-100 rounded-md hover:bg-yellow-600 dark:bg-yellow-900 dark:text-yellow-100 dark:hover:bg-yellow-800"
            >
              Show Buffer
            </button>
          </div>
        </div>

        <div className="h-96 overflow-y-auto border rounded border-neutral-700 bg-neutral-800">
          <div className="sticky top-0 bg-neutral-700 border-b border-neutral-600">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-neutral-400">
              <div className="col-span-2">Time</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-8">Message</div>
            </div>
          </div>

          <div className="divide-y divide-neutral-700">
            {debugLogs
              .slice()
              .reverse()
              .map((log, index) => (
                <div
                  key={index}
                  className="grid grid-cols-12 gap-2 px-4 py-2 text-sm hover:bg-neutral-700"
                >
                  <div className="col-span-2 text-neutral-400">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </div>
                  <div className="col-span-2">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                        log.type === "received"
                          ? "bg-green-700 text-green-100 dark:bg-green-900 dark:text-green-100"
                          : log.type === "sent"
                          ? "bg-blue-700 text-blue-100 dark:bg-blue-900 dark:text-blue-100"
                          : log.type === "info"
                          ? "bg-neutral-600 text-neutral-100 dark:bg-gray-900 dark:text-gray-100"
                          : "bg-red-700 text-red-100 dark:bg-red-900 dark:text-red-100"
                      }`}
                    >
                      {log.type}
                    </span>
                  </div>
                  <div className="col-span-8 font-mono text-[var(--foreground)] break-all">
                    {log.message}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {debugLogs.length === 0 && (
          <div className="text-center p-4 text-neutral-400">
            No debug messages yet
          </div>
        )}
      </div>
      )}
    </div>
  );
}
