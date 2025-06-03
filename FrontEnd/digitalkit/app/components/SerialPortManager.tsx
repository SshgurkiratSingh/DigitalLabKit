"use client";

import React, { useState, useEffect } from "react";
import {
  useSerialPort,
  SerialPortInfoWrapper,
  // ICData, // Not directly used by this component for now
  // DebugLogEntry, // Not directly used by this component for now
} from "../hooks/useSerialPort"; // Adjust path as needed

interface SerialPortManagerProps {
  // Example: Callback if this component needs to notify parent about connection changes
  onConnectionStatusChange?: (status: string) => void;
  // If data processing is handled by a parent, it would pass onDataReceived to useSerialPort directly
  // or this component would need to accept it and pass it to the hook.
  // For now, focusing on connection UI.
}

export default function SerialPortManager({
  onConnectionStatusChange,
}: SerialPortManagerProps) {
  const {
    ports,
    selectedPort: connectedPort, // Renaming for clarity: this is the actually connected port
    connectionStatus,
    error,
    isSerialSupported,
    listPorts,
    requestPort,
    connectToPort,
    disconnectFromPort,
    // debugLogs, // Not displayed directly here, but hook manages them
    // sendData, // Not used by this component directly for now
  } = useSerialPort({
    // onDataReceived: (data) => console.log("Data received in manager:", data) // Example
  });

  // Local state for the port selected in the dropdown, identified by its index in the `ports` array
  const [dropdownSelectedPortIndex, setDropdownSelectedPortIndex] = useState<string>("");

  useEffect(() => {
    if (onConnectionStatusChange) {
      onConnectionStatusChange(connectionStatus);
    }
  }, [connectionStatus, onConnectionStatusChange]);

  // Effect to refresh port list on mount, if not already handled by the hook's internal useEffect
  // The hook already lists ports on mount and on connect/disconnect events.
  // useEffect(() => {
  // listPorts();
  // }, [listPorts]);


  const handleRequestPort = async () => {
    const newlyRequestedPort = await requestPort();
    if (newlyRequestedPort) {
      // Find the index of the newly requested port to pre-select it in the dropdown.
      // This requires `ports` to be updated by the hook after requestPort.
      // The hook's `requestPort` adds to `ports` and sets `selectedPort` (which we call `connectedPort`)
      // We might need a slight delay or rely on the `ports` array updating.
      const portIndex = ports.findIndex(p => p.port === newlyRequestedPort);
      if (portIndex !== -1) {
        setDropdownSelectedPortIndex(portIndex.toString());
      }
    }
  };

  const handleConnect = () => {
    if (dropdownSelectedPortIndex === "") return;
    const portToConnect = ports[parseInt(dropdownSelectedPortIndex, 10)];
    if (portToConnect) {
      connectToPort(portToConnect.port);
    } else {
      // This case should ideally not happen if dropdown is synced with `ports`
      console.error("Selected port not found in available ports list.");
    }
  };

  const handleDisconnect = () => {
    disconnectFromPort();
    setDropdownSelectedPortIndex(""); // Clear dropdown selection on disconnect
  };

  if (!isSerialSupported) {
    return (
      <div className="p-4 bg-red-900 text-red-100 rounded-md">
        Web Serial API is not supported in this browser. Please use Chrome or
        Edge.
      </div>
    );
  }

  const getPortIdentifier = (portInfo: SerialPortInfoWrapper): string => {
    // Create a more robust identifier if possible, e.g., using vendor/product IDs.
    // For now, using a combination, but index is primary for selection.
    const { usbVendorId, usbProductId } = portInfo.info;
    if (usbVendorId && usbProductId) {
      return `VendorID: ${usbVendorId}, ProductID: ${usbProductId}`;
    }
    return "Unknown Port"; // Fallback
  };

  return (
    <div className="p-6 bg-[var(--background)] rounded-lg shadow-lg">
      <h2 className="text-xl font-semibold mb-4 text-[var(--foreground)]">
        Serial Port Connection
      </h2>

      {/* Connection Status */}
      <div className="mb-4 flex items-center">
        <div
          className={`w-3 h-3 rounded-full mr-2 ${
            connectionStatus === "connected"
              ? "bg-green-500"
              : connectionStatus === "connecting" || connectionStatus === "disconnecting"
              ? "bg-yellow-500"
              : "bg-red-500"
          }`}
        ></div>
        <span className="text-[var(--foreground)]">
          Status: {connectionStatus}
          {connectionStatus === "connected" && connectedPort?.getInfo()?.usbVendorId && (
            ` (Port: ${getPortIdentifier({port: connectedPort, info: connectedPort.getInfo()})})`
          )}
        </span>
      </div>

      {/* Port Selection */}
      <div className="mb-4">
        <label htmlFor="portSelect" className="block text-sm font-medium text-[var(--muted-foreground)] mb-1">
          Available Ports:
        </label>
        <select
          id="portSelect"
          className="w-full p-2 border rounded bg-neutral-800 text-[var(--foreground)] border-neutral-600 focus:ring-blue-500 focus:border-blue-500"
          value={dropdownSelectedPortIndex}
          onChange={(e) => setDropdownSelectedPortIndex(e.target.value)}
          disabled={connectionStatus === "connected" || connectionStatus === "connecting" || connectionStatus === "disconnecting"}
        >
          <option value="">Select a port</option>
          {ports.map((portInfo, index) => (
            <option key={index} value={index.toString()}>
              {`Port ${index + 1} - ${getPortIdentifier(portInfo)}`}
            </option>
          ))}
        </select>
      </div>

      {/* Action Buttons */}
      <div className="space-x-2 flex">
        <button
          onClick={handleRequestPort}
          disabled={connectionStatus === "connected" || connectionStatus === "connecting" || connectionStatus === "disconnecting"}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Request Port
        </button>
        <button
          onClick={handleConnect}
          disabled={
            dropdownSelectedPortIndex === "" ||
            connectionStatus === "connected" ||
            connectionStatus === "connecting" ||
            connectionStatus === "disconnecting"
          }
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Connect
        </button>
        <button
          onClick={handleDisconnect}
          disabled={connectionStatus !== "connected"}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Disconnect
        </button>
      </div>

      {/* Error Messages */}
      {error && (
        <div className="mt-4 p-3 bg-red-900/30 text-red-100 border border-red-700 rounded-md text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
}
