"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  useSerialPort,
  ICData as SerialPortICData, // Renaming to avoid conflict if ICData is also defined locally
  DebugLogEntry,
  // LogEntry as SerialPortLogEntry, // Ensure types are distinct if necessary
} from "../hooks/useSerialPort";
import { useICData } from "../hooks/useICData"; // For finding ICs by part number
import SerialPortManager from "./SerialPortManager";
import ICConfiguration from "./ICConfiguration";
import DebugLog from "./DebugLog"; // Import the refactored DebugLog component

// Re-define ICData if it's not imported from a shared types file.
// For this refactoring, assume SerialPortICData from useSerialPort is the one to use.
type ICData = SerialPortICData;

export default function SerialPortInterface() {
  const [pinStates, setPinStates] = useState<{ [key: number]: boolean }>({});
  const [configuredIC, setConfiguredIC] = useState<ICData | null>(null);
  const [showDebugLog, setShowDebugLog] = useState(true);
  const [syncInterval, setSyncInterval] = useState<NodeJS.Timeout | null>(null);

  const { allICs, getICByPartNumber, findICs } = useICData(); // To find IC by part number from device

  const processReceivedCommand = useCallback((command: string) => {
    // This function is called by useSerialPort when a complete command is received.
    // The command is already trimmed and logged as "received" by the hook.

    // Parse IC selection from the received data ("IC:...")
    if (command.startsWith("IC:")) {
      const icNumber = command.substring(3).trim();
      // Logic to find the best matching IC from allICs
      // This simplified version uses getICByPartNumber for exact match first, then findICs for broader search.
      let foundIC: ICData | undefined = getICByPartNumber(icNumber);

      if (!foundIC) {
        const similarICs = findICs(icNumber); // findICs from useICData
        if (similarICs.length > 0) {
          foundIC = similarICs[0]; // Pick the first similar one
          // Log this choice as a warning or info in debug if it's not an exact match
          // The useSerialPort hook's addDebugLog isn't directly available here,
          // but we can log to console or assume hook's received log is enough.
          console.warn(`No exact match for IC: ${icNumber}. Using similar: ${foundIC.partNumber}`);
        }
      }

      if (foundIC) {
        setConfiguredIC(foundIC);
        // Optionally send PINS? to get current state from newly identified IC
        // This depends on desired device behavior.
        // serialPortHook.sendData("PINS?\n");
      } else {
        console.error(`No IC found matching: ${icNumber}`);
        // Log to debug: `No IC found matching number: ${icNumber}`
      }
      return;
    }

    // Parse binary pin states (e.g., "01010101010101")
    if (/^[01]{14,16}$/.test(command)) {
      const pinData = command;
      const newPinStates: { [key: number]: boolean } = {};
      for (let i = 0; i < pinData.length; i++) {
        newPinStates[i + 1] = pinData[i] === "1";
      }
      setPinStates(newPinStates);
      return;
    }

    // Parse PINS: command (e.g., "PINS:01010101010101")
    if (command.startsWith("PINS:")) {
      const pinData = command.substring(5).trim();
      if (pinData.length >= 14 && pinData.length <= 16 && /^[01]+$/.test(pinData)) {
        const newPinStates: { [key: number]: boolean } = {};
        for (let i = 0; i < pinData.length; i++) {
          newPinStates[i + 1] = pinData[i] === "1";
        }
        setPinStates(newPinStates);
      } else {
        console.error(`Invalid pin data format: ${pinData}`);
        // Log error
      }
      return;
    }

    if (command === "SYNC:OK") {
      // Device acknowledged sync. Handled by useSerialPort's logging.
      return;
    }

    if (command.startsWith("ERROR:")) {
      // Device reported an error. Handled by useSerialPort's logging.
      return;
    }

    // Unhandled messages are logged by useSerialPort hook if its onDataReceived doesn't process them.
    // Or add specific logging here if needed.
    console.log("Unhandled command in SerialPortInterface:", command);

  }, [getICByPartNumber, findICs, /* serialPortHook.sendData if PINS? needed */]);


  const serialPortHook = useSerialPort({
    onDataReceived: processReceivedCommand,
  });

  // Effect for periodic SYNC command
  useEffect(() => {
    if (serialPortHook.connectionStatus === "connected" && configuredIC) {
      const interval = setInterval(() => {
        serialPortHook.sendData("SYNC\n");
      }, 1000); // Sync every second
      setSyncInterval(interval);
      return () => clearInterval(interval);
    } else {
      if (syncInterval) {
        clearInterval(syncInterval);
        setSyncInterval(null);
      }
    }
    return () => { // Cleanup for unmount
        if (syncInterval) clearInterval(syncInterval);
    }
  }, [serialPortHook.connectionStatus, configuredIC, serialPortHook.sendData, syncInterval]);


  const handleICSelectedFromConfig = (ic: ICData | null) => {
    setConfiguredIC(ic);
    if (ic && serialPortHook.connectionStatus === "connected") {
      serialPortHook.sendData(`IC:${ic.partNumber}\n`);
      // Optionally request current pin states from device for the new IC
      // serialPortHook.sendData("PINS?\n");
    }
  };

  const handlePinStateChangeFromConfig = (newPinStatesUpdate: { [key: number]: boolean }) => {
    if (serialPortHook.connectionStatus === "connected" && configuredIC) {
      // Construct the full pin state string
      let pinStateStr = "";
      const pinCount = configuredIC.pinCount || 14; // Default to 14

      // Create a temporary full state based on current and update
      const updatedPinStates = { ...pinStates, ...newPinStatesUpdate };

      for (let i = 1; i <= pinCount; i++) {
        pinStateStr += updatedPinStates[i] ? "1" : "0";
      }

      if (pinStateStr.length >= 14 && pinStateStr.length <= 16) {
        serialPortHook.sendData(`PINS:${pinStateStr}\n`);
        // The device should echo back the state or we can optimistically set it.
        // For now, we wait for device echo by PINS: or binary command.
        // Or, update local state partially:
        // setPinStates(prev => ({...prev, ...newPinStatesUpdate}));
      } else {
        serialPortHook.setDebugLogs((prev) => [
          { timestamp: new Date().toISOString(), type: "error", message: `Invalid pin state string length for send: ${pinStateStr.length}` },
          ...prev,
        ]);
      }
    }
  };

  const handleClockFrequencyChangeFromConfig = (frequency: number) => {
    if (serialPortHook.connectionStatus === "connected" && configuredIC) {
      serialPortHook.sendData(`CLOCK:${frequency}\n`);
    }
  };

  const handleRequestSync = () => {
    if (serialPortHook.connectionStatus === "connected") {
      serialPortHook.sendData("SYNC\n");
    }
  };

  // Main component layout
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4">
      {/* Left Column: Connection and IC Configuration */}
      <div className="md:col-span-1 space-y-6">
        <SerialPortManager />
        <ICConfiguration
          currentPinStates={pinStates}
          serialConnected={serialPortHook.connectionStatus === "connected"}
          initialSelectedIC={configuredIC}
          onICSelected={handleICSelectedFromConfig}
          onPinStateChange={handlePinStateChangeFromConfig}
          onClockFrequencyChange={handleClockFrequencyChangeFromConfig}
        />
      </div>

      {/* Right Column: Visualization (This might be integrated into ICConfiguration or stay separate) */}
      {/* For now, assuming ICVisualizer and ICTruthTable are within ICConfiguration */}
      {/* If ICVisualizer was meant to be top-level and take 'configuredIC', it would go here. */}
      {/* Based on previous steps, ICVisualizer is inside ICConfiguration. So this space might be for other things or removed. */}
      <div className="md:col-span-2">
        {/* This space could be for a larger IC visualizer if not fully inside ICConfiguration,
            or other related components. If ICConfiguration handles all visualization, this might be empty
            or the debug log could span more columns if preferred.
            The original layout had ICSelector, then Visualizer, then TruthTable in the right column.
            Our new ICConfiguration component now groups these.
            So, the grid might need adjustment if DebugLog is the only other element.
        */}
        {/* If DebugLog is the only thing in the "right panel" conceptually, it might not need this extra div,
            and the main grid could be 2 columns, with DebugLog spanning both on a new row.
            The original JSX had DebugLog as a third distinct section.
        */}
         {!showDebugLog && (
            <div className="p-6 bg-[var(--background)] rounded-lg shadow-lg flex justify-center items-center h-full">
                 <button
                    onClick={() => setShowDebugLog(true)}
                    className="px-4 py-2 text-sm bg-purple-700 text-purple-100 rounded-md hover:bg-purple-600"
                >
                    Show Debug Log
                </button>
            </div>
        )}
      </div>


      {/* Debug Log Section */}
      {/* The DebugLog component itself will return null if showLogProp is false */}
      <div className="md:col-span-3"> {/* Ensure this div allows DebugLog to span */}
        <DebugLog
          logs={serialPortHook.debugLogs}
          onClearLogs={() => serialPortHook.setDebugLogs([])}
          showLogProp={showDebugLog} // Prop to control visibility internally in DebugLog
          onToggleShow={() => setShowDebugLog(!showDebugLog)} // Callback to toggle visibility
          onRequestSync={handleRequestSync}
          isSerialConnected={serialPortHook.connectionStatus === "connected"}
          // title prop is optional in DebugLog, defaults to "Debug Log"
        />
      </div>
    </div>
  );
}
