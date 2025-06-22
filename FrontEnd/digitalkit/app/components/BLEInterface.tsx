"use client";

import { useState, useEffect, useRef } from "react";
import { ICData } from "../types/ICTypes";

interface BLEInterfaceProps {
  onICSelect?: (ic: ICData | null) => void;
}

interface BLEDevice extends BluetoothDevice {
  gatt?: BluetoothRemoteGATTServer;
}

const SERVICE_UUID = "00000000-0000-1000-8000-00805f9b34fb";
const IC_CHAR_UUID = "00000001-0000-1000-8000-00805f9b34fb";
const PINS_CHAR_UUID = "00000002-0000-1000-8000-00805f9b34fb";
const CLOCK_CHAR_UUID = "00000003-0000-1000-8000-00805f9b34fb";
const STATUS_CHAR_UUID = "00000004-0000-1000-8000-00805f9b34fb";

export default function BLEInterface({ onICSelect }: BLEInterfaceProps = {}) {
  const [device, setDevice] = useState<BLEDevice | null>(null);
  const [server, setServer] = useState<BluetoothRemoteGATTServer | null>(null);
  const [service, setService] = useState<BluetoothRemoteGATTService | null>(null);
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

  const characteristicsRef = useRef<{
    ic?: BluetoothRemoteGATTCharacteristic;
    pins?: BluetoothRemoteGATTCharacteristic;
    clock?: BluetoothRemoteGATTCharacteristic;
    status?: BluetoothRemoteGATTCharacteristic;
  }>({});

  // Check if Web Bluetooth API is supported
  const isBLESupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  // Request BLE device
  const requestDevice = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
      });
      setDevice(device);
      setError(null);

      // Handle device disconnection
      device.addEventListener('gattserverdisconnected', handleDisconnection);

      return device;
    } catch (err) {
      setError("Failed to request BLE device");
      console.error(err);
      return null;
    }
  };

  // Handle device disconnection
  const handleDisconnection = () => {
    setIsConnected(false);
    setServer(null);
    setService(null);
    characteristicsRef.current = {};
    setDebugLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      type: "info",
      message: "Device disconnected"
    }]);
  };

  // Connect to device
  const connectToDevice = async () => {
    try {
      if (!device) {
        const newDevice = await requestDevice();
        if (!newDevice) return;
      }

      const gattServer = await device?.gatt?.connect();
      if (!gattServer) throw new Error("Failed to connect to GATT server");
      
      setServer(gattServer);
      const bleService = await gattServer.getPrimaryService(SERVICE_UUID);
      setService(bleService);

      // Get all characteristics
      const [icChar, pinsChar, clockChar, statusChar] = await Promise.all([
        bleService.getCharacteristic(IC_CHAR_UUID),
        bleService.getCharacteristic(PINS_CHAR_UUID),
        bleService.getCharacteristic(CLOCK_CHAR_UUID),
        bleService.getCharacteristic(STATUS_CHAR_UUID),
      ]);

      characteristicsRef.current = {
        ic: icChar,
        pins: pinsChar,
        clock: clockChar,
        status: statusChar,
      };

      // Set up notifications for pin states and status
      await pinsChar.startNotifications();
      await statusChar.startNotifications();

      pinsChar.addEventListener('characteristicvaluechanged', handlePinStateChange);
      statusChar.addEventListener('characteristicvaluechanged', handleStatusChange);

      setIsConnected(true);
      setError(null);

      setDebugLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        type: "info",
        message: "Connected to BLE device"
      }]);
    } catch (err) {
      setError("Failed to connect to device");
      console.error(err);
      setDebugLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        type: "error",
        message: `Connection failed: ${err}`
      }]);
    }
  };

  // Disconnect from device
  const disconnectFromDevice = async () => {
    try {
      if (device?.gatt?.connected) {
        await device.gatt.disconnect();
      }
      setIsConnected(false);
      setError(null);
    } catch (err) {
      setError("Failed to disconnect from device");
      console.error(err);
    }
  };

  // Handle pin state changes from device
  const handlePinStateChange = (event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    if (!value) return;

    const pinData = new TextDecoder().decode(value);
    if (/^[01]{14,16}$/.test(pinData)) {
      const newPinStates: { [key: number]: boolean } = {};
      for (let i = 0; i < pinData.length; i++) {
        newPinStates[i + 1] = pinData[i] === "1";
      }
      setPinStates(newPinStates);

      setDebugLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        type: "received",
        message: `Pin states updated: ${pinData}`
      }]);
    }
  };

  // Handle status messages from device
  const handleStatusChange = (event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    if (!value) return;

    const status = new TextDecoder().decode(value);
    setDebugLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      type: status.startsWith("ERROR:") ? "error" : "info",
      message: status
    }]);
  };

  // Send IC selection to device
  const handleICSelect = async (ic: ICData | null) => {
    if (!isConnected || !characteristicsRef.current.ic) return;

    try {
      setSelectedIC(ic);
      if (ic) {
        const encoder = new TextEncoder();
        await characteristicsRef.current.ic.writeValue(encoder.encode(ic.partNumber));
        onICSelect?.(ic);

        setDebugLogs(prev => [...prev, {
          timestamp: new Date().toISOString(),
          type: "sent",
          message: `Selected IC: ${ic.partNumber}`
        }]);
      }
    } catch (err) {
      console.error("Error selecting IC:", err);
      setDebugLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        type: "error",
        message: `Failed to select IC: ${err}`
      }]);
    }
  };

  // Send pin state changes to device
  const handlePinStateUpdate = async (newPinStates: { [key: number]: boolean }) => {
    if (!isConnected || !characteristicsRef.current.pins || !selectedIC) return;

    try {
      const pinCount = selectedIC.pinCount || 14;
      let pinStateStr = "";

      for (let i = 1; i <= pinCount; i++) {
        const state = i in newPinStates ? newPinStates[i] : pinStates[i] || false;
        pinStateStr += state ? "1" : "0";
      }

      const encoder = new TextEncoder();
      await characteristicsRef.current.pins.writeValue(encoder.encode(pinStateStr));

      setPinStates(prev => ({ ...prev, ...newPinStates }));

      setDebugLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        type: "sent",
        message: `Pin states changed: ${pinStateStr}`
      }]);
    } catch (err) {
      console.error("Error updating pin states:", err);
      setDebugLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        type: "error",
        message: `Failed to update pin states: ${err}`
      }]);
    }
  };

  // Set clock frequency
  const handleClockFrequencyChange = async (frequency: number) => {
    if (!isConnected || !characteristicsRef.current.clock) return;

    try {
      const encoder = new TextEncoder();
      await characteristicsRef.current.clock.writeValue(
        new Uint32Array([frequency]).buffer
      );

      setDebugLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        type: "sent",
        message: `Clock frequency set to ${frequency}Hz`
      }]);
    } catch (err) {
      console.error("Error setting clock frequency:", err);
      setDebugLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        type: "error",
        message: `Failed to set clock frequency: ${err}`
      }]);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (device?.gatt?.connected) {
        device.gatt.disconnect();
      }
    };
  }, [device]);

  if (!isBLESupported) {
    return (
      <div className="p-4 bg-red-900 text-red-100 rounded-md">
        Web Bluetooth API is not supported in this browser. Please use Chrome, Edge, or other compatible browsers.
      </div>
    );
  }

  return (
    <div className="gap-6">
      {/* BLE Connection */}
      <div className="p-6 bg-[var(--background)] rounded-lg shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-[var(--foreground)]">
          BLE Connection
        </h2>

        {/* Connection Status */}
        <div className="flex items-center gap-4 mb-6">
          <div
            className={`w-3 h-3 rounded-full ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className="text-[var(--foreground)]">
            {isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>

        {/* Connection Controls */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={isConnected ? disconnectFromDevice : connectToDevice}
            className={`px-4 py-2 rounded-md ${
              isConnected
                ? "bg-red-600 hover:bg-red-700"
                : "bg-blue-600 hover:bg-blue-700"
            } text-white transition-colors`}
          >
            {isConnected ? "Disconnect" : "Connect"}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-900 text-red-100 rounded-md mb-6">
            {error}
          </div>
        )}

        {/* Debug Logs */}
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-2 text-[var(--foreground)]">
            Debug Logs
          </h3>
          <div className="bg-gray-900 rounded-md p-4 max-h-60 overflow-y-auto">
            {debugLogs.map((log, index) => (
              <div
                key={index}
                className={`mb-1 font-mono text-sm ${
                  log.type === "error"
                    ? "text-red-400"
                    : log.type === "warning"
                    ? "text-yellow-400"
                    : log.type === "received"
                    ? "text-green-400"
                    : log.type === "sent"
                    ? "text-blue-400"
                    : "text-gray-400"
                }`}
              >
                [{log.timestamp.split("T")[1].split(".")[0]}] {log.message}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}