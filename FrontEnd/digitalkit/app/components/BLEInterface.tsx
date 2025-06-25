"use client";

import { useState, useEffect, useRef } from "react";
import { ICData } from "../types/ICTypes";
import ICSelector from "./ICSelector";
import ICVisualizer from "./ICVisualizer";
import ICTruthTableVerifier from "./ICTruthTableVerifier";

interface BLEInterfaceProps {
  onICSelect?: (ic: ICData | null) => void; // Prop for parent component
}

interface BLEDevice extends BluetoothDevice {
  gatt?: BluetoothRemoteGATTServer;
}

const SERVICE_UUID = "00000000-0000-1000-8000-00805f9b34fb";
const IC_CHAR_UUID = "00000001-0000-1000-8000-00805f9b34fb";
const PINS_CHAR_UUID = "00000002-0000-1000-8000-00805f9b34fb";
const CLOCK_CHAR_UUID = "00000003-0000-1000-8000-00805f9b34fb";
const STATUS_CHAR_UUID = "00000004-0000-1000-8000-00805f9b34fb";

export default function BLEInterface({ onICSelect: parentOnICSelect }: BLEInterfaceProps = {}) {
  const [device, setDevice] = useState<BLEDevice | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIC, setSelectedIC] = useState<ICData | null>(null);
  const [pinStates, setPinStates] = useState<{ [key: number]: boolean }>({});
  const [debugLogs, setDebugLogs] = useState<
    Array<{
      timestamp: string;
      type: "received" | "sent" | "info" | "error" | "warning";
      message: string;
    }>
  >([]);
  const [showDebugLog, setShowDebugLog] = useState(true); // For debug log visibility
  const [allICs, setAllICs] = useState<ICData[]>([]); // Store all loaded ICs

  const characteristicsRef = useRef<{
    ic?: BluetoothRemoteGATTCharacteristic;
    pins?: BluetoothRemoteGATTCharacteristic;
    clock?: BluetoothRemoteGATTCharacteristic;
    status?: BluetoothRemoteGATTCharacteristic;
  }>({});

  const isBLESupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  const addLogEntry = (type: "received" | "sent" | "info" | "error" | "warning", message: string) => {
    setDebugLogs(prev => [...prev, { timestamp: new Date().toISOString(), type, message }]);
  };

  // Request BLE device
  const requestDevice = async () => {
    if (!isBLESupported) {
      addLogEntry("error", "Web Bluetooth API is not supported in this browser.");
      setError("Web Bluetooth API is not supported.");
      return null;
    }
    try {
      addLogEntry("info", "Requesting BLE device...");
      const bleDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
      });
      setDevice(bleDevice);
      setError(null);
      addLogEntry("info", `Device selected: ${bleDevice.name || bleDevice.id}`);
      bleDevice.addEventListener('gattserverdisconnected', handleDisconnectionEvent);
      return bleDevice;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to request BLE device: ${msg}`);
      addLogEntry("error", `Failed to request BLE device: ${msg}`);
      return null;
    }
  };

  // Handle device disconnection event
  const handleDisconnectionEvent = () => {
    addLogEntry("info", `Device ${device?.name || device?.id} disconnected.`);
    setIsConnected(false);
    characteristicsRef.current = {};
    // Optionally clear selectedIC and pinStates
    // setSelectedIC(null);
    // setPinStates({});
  };

  // Connect to device
  const connectToDevice = async () => {
    let currentDevice = device;
    if (!currentDevice) {
      currentDevice = await requestDevice();
      if (!currentDevice) return;
    }

    if (currentDevice.gatt?.connected) {
      addLogEntry("info", `Already connected to ${currentDevice.name || currentDevice.id}.`);
      setIsConnected(true);
      return;
    }

    addLogEntry("info", `Connecting to ${currentDevice.name || currentDevice.id}...`);
    try {
      const gattServer = await currentDevice.gatt?.connect();
      if (!gattServer) throw new Error("Failed to connect to GATT server.");
      addLogEntry("info", "Connected to GATT server.");

      const bleService = await gattServer.getPrimaryService(SERVICE_UUID);
      if (!bleService) throw new Error(`Service ${SERVICE_UUID} not found.`);
      addLogEntry("info", "Primary service obtained.");

      const [icChar, pinsChar, clockChar, statusChar] = await Promise.all([
        bleService.getCharacteristic(IC_CHAR_UUID),
        bleService.getCharacteristic(PINS_CHAR_UUID),
        bleService.getCharacteristic(CLOCK_CHAR_UUID),
        bleService.getCharacteristic(STATUS_CHAR_UUID),
      ]);
      characteristicsRef.current = { ic: icChar, pins: pinsChar, clock: clockChar, status: statusChar };
      addLogEntry("info", "Characteristics obtained.");

      if (pinsChar.properties.notify) {
        await pinsChar.startNotifications();
        pinsChar.addEventListener('characteristicvaluechanged', handleIncomingPinStateChange);
        addLogEntry("info", "Notifications started for Pin States.");
      }
      if (statusChar.properties.notify) {
        await statusChar.startNotifications();
        statusChar.addEventListener('characteristicvaluechanged', handleIncomingStatusChange);
        addLogEntry("info", "Notifications started for Status.");
      }

      setIsConnected(true);
      setError(null);
      addLogEntry("info", `Successfully connected to ${currentDevice.name || currentDevice.id}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to connect: ${msg}`);
      addLogEntry("error", `Connection failed: ${msg}`);
      if (currentDevice.gatt?.connected) currentDevice.gatt.disconnect();
      setIsConnected(false);
      characteristicsRef.current = {};
    }
  };

  // Disconnect from device
  const disconnectFromDevice = async () => {
    if (!device?.gatt?.connected) {
      addLogEntry("info", "Device is not connected.");
      setIsConnected(false);
      return;
    }
    addLogEntry("info", `Disconnecting from ${device.name || device.id}...`);
    try {
      if (characteristicsRef.current.pins?.properties.notify) {
        await characteristicsRef.current.pins.stopNotifications();
        characteristicsRef.current.pins.removeEventListener('characteristicvaluechanged', handleIncomingPinStateChange);
      }
      if (characteristicsRef.current.status?.properties.notify) {
        await characteristicsRef.current.status.stopNotifications();
        characteristicsRef.current.status.removeEventListener('characteristicvaluechanged', handleIncomingStatusChange);
      }
      await device.gatt.disconnect();
      // gattserverdisconnected event will call handleDisconnectionEvent
      addLogEntry("info", "Disconnected successfully.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to disconnect: ${msg}`);
      addLogEntry("error", `Disconnection failed: ${msg}`);
      // Force states if event doesn't fire
      setIsConnected(false);
      characteristicsRef.current = {};
    }
  };

  // Handle pin state changes from device (notifications)
  const handleIncomingPinStateChange = (event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    if (!value) return;

    const pinData = new TextDecoder().decode(value);
    addLogEntry("received", `Pin States from BLE: ${pinData}`);
    if (/^[01]{14,16}$/.test(pinData)) {
      const newPinStates: { [key: number]: boolean } = {};
      for (let i = 0; i < pinData.length; i++) {
        newPinStates[i + 1] = pinData[i] === "1";
      }
      setPinStates(newPinStates); // Update UI with received states
      addLogEntry("info", `Pin states updated from device notification: ${pinData}`);
    } else {
      addLogEntry("warning", `Received invalid pin data format from device: ${pinData}`);
    }
  };

  // Handle status messages from device (notifications)
  const handleIncomingStatusChange = (event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    if (!value) return;
    const statusMsg = new TextDecoder().decode(value);
    addLogEntry(statusMsg.startsWith("ERROR:") ? "error" : "info", `Status from BLE: ${statusMsg}`);
    if (statusMsg.startsWith("ERROR:")) {
      setError(`Device Error: ${statusMsg.substring(6)}`);
    }
  };

  // Called by ICSelector component
  const handleLocalICSelect = async (ic: ICData | null) => {
    setSelectedIC(ic);
    if (parentOnICSelect) parentOnICSelect(ic); // Notify parent page if prop is used

    if (!isConnected || !characteristicsRef.current.ic) {
      addLogEntry("warning", `IC selected locally: ${ic?.partNumber}. Not sending to device (not connected or IC char unavailable).`);
      return;
    }
    if (ic) {
      try {
        addLogEntry("sent", `Sending IC selection to BLE: ${ic.partNumber}`);
        const encoder = new TextEncoder();
        // Using writeValueWithResponse for commands expecting a status update or ack
        await characteristicsRef.current.ic.writeValueWithResponse(encoder.encode(ic.partNumber));
        addLogEntry("info", `Successfully wrote IC: ${ic.partNumber} to device.`);
        // Optionally, after IC selection, request current pin states from device
        // This depends on device firmware behavior (e.g., if it resets pins or sends current state)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to send IC selection ${ic.partNumber}: ${msg}`);
        addLogEntry("error", `Failed to send IC selection ${ic.partNumber}: ${msg}`);
      }
    } else {
      addLogEntry("info", "IC deselected locally.");
      // Consider if anything needs to be sent to device on deselect (e.g. a "clear" command)
    }
  };

  // Called by ICVisualizer or ICTruthTableVerifier to update pin states on the device
  const handleOutgoingPinStateUpdate = async (newPinStatesToSet: { [key: number]: boolean }) => {
    // Optimistically update local UI. If device rejects/fails, it should ideally notify back.
    // Or, wait for device confirmation before updating setPinStates for stricter sync.
    setPinStates(prev => ({ ...prev, ...newPinStatesToSet }));

    if (!isConnected || !characteristicsRef.current.pins || !selectedIC) {
      addLogEntry("warning", "Cannot update pins on device: Not connected, pins char unavailable, or no IC selected.");
      return;
    }

    try {
      const pinCount = selectedIC.pinCount || 14; // Default, ensure ICData has this
      let pinStateStr = "";
      const currentFullPinStates = { ...pinStates, ...newPinStatesToSet }; // Merge for complete string

      for (let i = 1; i <= pinCount; i++) {
        pinStateStr += (currentFullPinStates[i] || false) ? "1" : "0";
      }

      if (pinStateStr.length !== pinCount) {
        addLogEntry("error", `Pin string length mismatch: Expected ${pinCount}, got ${pinStateStr.length}. Aborting send.`);
        // Revert optimistic update if this error occurs
        setPinStates(prev => {
            const reverted = {...prev};
            // Simple revert for this example, might need more complex logic
            Object.keys(newPinStatesToSet).forEach(pinKey => {
                // This is a naive revert, assumes previous state was in `pinStates`
                // A better approach might be to store the state before optimistic update
            });
            return reverted; // This part needs careful implementation for true revert
        });
        return;
      }

      addLogEntry("sent", `Sending Pin States to BLE: ${pinStateStr}`);
      const encoder = new TextEncoder();
      await characteristicsRef.current.pins.writeValueWithResponse(encoder.encode(pinStateStr));
      addLogEntry("info", `Successfully wrote pin states: ${pinStateStr} to device.`);
      // Device should notify back with PINS_CHAR_UUID change if write is accepted and applied
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to send pin states: ${msg}`);
      addLogEntry("error", `Failed to send pin states: ${msg}`);
      // Consider reverting optimistic UI update on error
    }
  };

  // Called by ICTruthTableVerifier
  const handleOutgoingClockFrequencyChange = async (frequency: number) => {
    if (!isConnected || !characteristicsRef.current.clock) {
      addLogEntry("warning", `Cannot set clock: Not connected or clock char unavailable. Freq: ${frequency}Hz`);
      return;
    }
    try {
      addLogEntry("sent", `Sending Clock Frequency to BLE: ${frequency}Hz`);
      // As per BLEReadme.md: Format: Integer (Hz). Assuming 4-byte unsigned int, little-endian.
      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setUint32(0, frequency, true); // true for little-endian
      await characteristicsRef.current.clock.writeValueWithResponse(buffer);
      addLogEntry("info", `Successfully wrote clock frequency: ${frequency}Hz to device.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to set clock frequency: ${msg}`);
      addLogEntry("error", `Failed to send clock frequency ${frequency}Hz: ${msg}`);
    }
  };

  // Load IC data from JSON files
  useEffect(() => {
    const loadICData = async () => {
      addLogEntry("info", "Loading IC data...");
      try {
        const icFiles = [
          "BCDDecoderIC.json", "CounterIC.json", "ShiftRegisterIC.json",
          "arithmeticIc.json", "combinationalIC.json", "comparatorIc.json",
          "sequentialIC.json",
        ];
        const loadedICs: ICData[] = [];
        for (const file of icFiles) {
          const response = await fetch(`/files/${file}`);
          if (!response.ok) throw new Error(`Failed to load ${file}: ${response.statusText}`);
          const data = await response.json();
          Object.values(data).forEach((series: any) => {
            if (series && typeof series === 'object') {
              Object.values(series).forEach((category: any) => {
                if (category && typeof category === 'object') {
                  Object.values(category).forEach((ic: any) => {
                    if (ic && ic.partNumber && ic.pinConfiguration) { // Basic validation
                      loadedICs.push(ic as ICData);
                    }
                  });
                }
              });
            }
          });
        }
        setAllICs(loadedICs);
        addLogEntry("info", `Successfully loaded ${loadedICs.length} ICs.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        addLogEntry("error", `Failed to load IC data: ${msg}.`);
        setError(`Failed to load IC data: ${msg}`);
      }
    };
    loadICData();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    const dev = device; // Capture current device for cleanup
    return () => {
      if (dev) {
        dev.removeEventListener('gattserverdisconnected', handleDisconnectionEvent);
        if (dev.gatt?.connected) {
          addLogEntry("info", "Component unmounting, attempting to disconnect BLE device...");
          // Try to stop notifications gracefully
          const stopNotifications = async () => {
            if (characteristicsRef.current.pins?.properties.notify) {
              try { await characteristicsRef.current.pins.stopNotifications(); } catch (e) { /* ignore */ }
            }
            if (characteristicsRef.current.status?.properties.notify) {
              try { await characteristicsRef.current.status.stopNotifications(); } catch (e) { /* ignore */ }
            }
          };
          stopNotifications().finally(() => {
            dev.gatt?.disconnect();
            addLogEntry("info", "BLE disconnect initiated on unmount.");
          });
        }
      }
    };
  }, [device]); // Re-run if device instance changes

  if (!isBLESupported) {
    return (
      <div className="p-4 bg-red-900 text-red-100 rounded-md">
        Web Bluetooth API is not supported in this browser. Please use Chrome, Edge, or other compatible browsers.
      </div>
    );
  }

  return (
    <div className="space-y-6"> {/* Use space-y for consistent vertical spacing */}
      {/* BLE Connection Section */}
      <div className="p-6 bg-[var(--background)] rounded-lg shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-[var(--foreground)]">
          BLE Connection
        </h2>
        <div className="mb-4 flex items-center">
          <div className={`w-3 h-3 rounded-full mr-2 ${isConnected ? "bg-green-500" : "bg-red-500"}`}></div>
          <span className="text-[var(--foreground)]">
            {isConnected ? `Connected to ${device?.name || device?.id || 'device'}` : "Disconnected"}
          </span>
        </div>
        <div className="space-x-2">
          <button
            onClick={connectToDevice}
            disabled={isConnected}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
          >
            Connect
          </button>
          <button
            onClick={disconnectFromDevice}
            disabled={!isConnected}
            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
        {error && (
          <div className="mt-4 p-2 bg-red-900 text-red-100 rounded-md">
            {error}
          </div>
        )}
      </div>

      {/* IC Configuration Section */}
      <div className="p-6 bg-[var(--background)] rounded-lg shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-[var(--foreground)]">
          IC Configuration
        </h2>
        <ICSelector
          onICSelect={handleLocalICSelect}
          allICs={allICs}
        />
        {selectedIC && (
          <>
            <div className="mt-6 flex justify-center w-full">
              <ICVisualizer
                ic={selectedIC}
                onPinStateChange={handleOutgoingPinStateUpdate}
                serialConnected={isConnected} // Prop name is serialConnected, but means "device connected"
                currentPinStates={pinStates}
              />
            </div>
            <ICTruthTableVerifier
              selectedIC={selectedIC.partNumber}
              currentPinStates={pinStates}
              onPinStateChange={handleOutgoingPinStateUpdate}
              onClockFrequencyChange={handleOutgoingClockFrequencyChange}
              isConnected={isConnected}
              allICs={allICs}
            />
          </>
        )}
      </div>

      {/* Debug Log Section */}
      {showDebugLog && (
      <div className="p-6 bg-[var(--background)] rounded-lg shadow-lg border-2 border-blue-500">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-[var(--foreground)] flex items-center">
            <span className="mr-2">🔍</span>
            BLE Debug Log
          </h2>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowDebugLog(!showDebugLog)}
              className="px-4 py-2 text-sm bg-purple-700 text-purple-100 rounded-md hover:bg-purple-600"
            >
              {showDebugLog ? "Hide Log" : "Show Log"}
            </button>
            <button
              onClick={() => setDebugLogs([])}
              className="px-4 py-2 text-sm bg-red-700 text-red-100 rounded-md hover:bg-red-600 dark:bg-red-900 dark:text-red-100 dark:hover:bg-red-800"
            >
              Clear Log
            </button>
          </div>
        </div>
        <div className="h-96 overflow-y-auto border rounded border-neutral-700 bg-neutral-800">
          <div className="sticky top-0 bg-neutral-700 border-b border-neutral-600">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-neutral-400">
              <div className="col-span-3 md:col-span-2">Time</div>
              <div className="col-span-2 md:col-span-2">Type</div>
              <div className="col-span-7 md:col-span-8">Message</div>
            </div>
          </div>
          <div className="divide-y divide-neutral-700">
            {debugLogs.slice().reverse().map((log, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 px-4 py-2 text-sm hover:bg-neutral-700">
                <div className="col-span-3 md:col-span-2 text-neutral-400">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </div>
                <div className="col-span-2 md:col-span-2">
                  <span
                    className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                      log.type === "received" ? "bg-green-700 text-green-100" :
                      log.type === "sent" ? "bg-blue-700 text-blue-100" :
                      log.type === "info" ? "bg-neutral-600 text-neutral-100" :
                      log.type === "error" ? "bg-red-700 text-red-100" :
                      "bg-yellow-700 text-yellow-100" // warning
                    }`}
                  >
                    {log.type}
                  </span>
                </div>
                <div className="col-span-7 md:col-span-8 font-mono text-[var(--foreground)] break-all">
                  {log.message}
                </div>
              </div>
            ))}
          </div>
        </div>
        {debugLogs.length === 0 && (
          <div className="text-center p-4 text-neutral-400">
            No BLE debug messages yet.
          </div>
        )}
      </div>
      )}
    </div>
  );
}