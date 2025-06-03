"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ICSelector from "./ICSelector";
import ICVisualizer from "./ICVisualizer";
import ICTruthTableVerifier from "./ICTruthTableVerifier";
import SerialConnectionManager, {
  SerialConnectionManagerHandle,
} from "./SerialConnectionManager";
import ICDataManager, { ICDataManagerHandle } from "./ICDataManager";
import PinStateManager, { PinStateManagerHandle } from "./PinStateManager";
import DebugLog, { DebugLogProps } from "./DebugLog"; // Import DebugLog and its props
import {
  Serial,
  ICData,
  MainInterfaceProps, // Renamed from SerialPortInterfaceProps
  LogEntry
} from "../types";

// Extend Navigator interface
declare global {
  interface Navigator {
    serial: Serial;
  }
}

// DebugLogEntry interface is removed as LogEntry is imported from types.ts

export default function MainInterface({
  onICSelect,
}: MainInterfaceProps = {}) {
  const [selectedIC, setSelectedIC] = useState<ICData | null>(null);
  const [pinStates, setPinStates] = useState<{ [key: number]: boolean }>({});
  const [debugLogs, setDebugLogs] = useState<LogEntry[]>([]); // Use LogEntry type
  const [allICs, setAllICs] = useState<ICData[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(true);
  const [isDeviceConnected, setIsDeviceConnected] = useState(false);

  const serialConnectionManagerRef = useRef<SerialConnectionManagerHandle>(null);
  const icDataManagerRef = useRef<ICDataManagerHandle>(null);
  const pinStateManagerRef = useRef<PinStateManagerHandle>(null);

  const handleAddLogEntry = useCallback(
    // Ensure the parameter type matches what other components will send.
    // Other components send Omit<LogEntry, "timestamp">.
    // DebugLog itself will receive the full LogEntry[] via props.
    (logInput: Omit<LogEntry, "timestamp">) => {
      setDebugLogs((prev) => [
        ...prev,
        { ...logInput, timestamp: new Date().toISOString() },
      ]);
    },
    []
  );

  const handleICsLoaded = useCallback((loadedICs: ICData[]) => {
    setAllICs(loadedICs);
  }, []);

  const handleICSelectionConfirmed = useCallback(
    (newlySelectedIC: ICData | null) => {
      setSelectedIC(newlySelectedIC);
      onICSelect?.(newlySelectedIC);
      if (newlySelectedIC && isDeviceConnected) {
        serialConnectionManagerRef.current?.sendData(
          `IC:${newlySelectedIC.partNumber}\n`
        );
        handleAddLogEntry({type: "info", message: `Sent IC:${newlySelectedIC.partNumber} to device.`});
      } else if (!newlySelectedIC) {
        handleAddLogEntry({type: "info", message: "IC deselected."});
      }
    },
    [onICSelect, isDeviceConnected, handleAddLogEntry]
  );

  const handleICSelectFromDropdown = useCallback(
    (icFromSelector: ICData | null) => {
      icDataManagerRef.current?.selectIC(icFromSelector);
    },
    []
  );

  const handleDataFromConnectionManager = useCallback(
    (type: string, payload: any) => {
      switch (type) {
        case "connection_status":
          setIsDeviceConnected(payload.isConnected);
          if (payload.isConnected && selectedIC) {
            serialConnectionManagerRef.current?.sendData(
              `IC:${selectedIC.partNumber}\n`
            );
          }
          break;
        case "ic_command_received": {
          const { icNumber } = payload;
          const numericPart = icNumber.match(/\d+/)?.[0];
          const seriesPrefix =
            icNumber.match(/^[a-zA-Z]+/)?.[0]?.toLowerCase() || "";
          handleAddLogEntry({type: "info", message: `Attempting to identify IC from device: ${icNumber}`});
          if (numericPart && allICs.length > 0) {
            const exactMatch = allICs.find(
              (ic) => ic.partNumber.toLowerCase() === icNumber.toLowerCase()
            );
            if (exactMatch) {
              handleAddLogEntry({type: "info", message: `Device reported IC: ${exactMatch.partNumber} (Exact Match). Selecting it.`});
              icDataManagerRef.current?.selectIC(exactMatch);
              serialConnectionManagerRef.current?.sendData("PINS?\n");
              return;
            }
            const numericMatches = allICs.filter((ic) => {
              const icDigits = ic.partNumber.match(/\d+/)?.[0];
              const icPrefix =
                ic.partNumber.match(/^[a-zA-Z]+/)?.[0]?.toLowerCase() || "";
              if (seriesPrefix && icPrefix && seriesPrefix !== icPrefix) return false;
              return (
                icDigits?.startsWith(numericPart) ||
                numericPart.startsWith(icDigits || "")
              );
            });
            if (numericMatches.length >= 1) {
              numericMatches.sort((a, b) => a.partNumber.localeCompare(b.partNumber));
              const bestMatch = numericMatches[0];
              handleAddLogEntry({type: "info", message: `Device reported IC: ${bestMatch.partNumber} (Numeric Match). Selecting it.`});
              icDataManagerRef.current?.selectIC(bestMatch);
              serialConnectionManagerRef.current?.sendData("PINS?\n");
              return;
            }
            handleAddLogEntry({type: "error", message: `Could not identify IC from device report: ${icNumber}. No match in local data.`});
          } else if (allICs.length === 0) {
            handleAddLogEntry({type: "error", message: `IC data not loaded. Cannot process IC command from device: ${icNumber}`});
          } else {
            handleAddLogEntry({type: "error", message: `Invalid IC number from device: ${icNumber}`});
          }
          break;
        }
        case "pin_states_binary":
        case "pin_states_pins_cmd":
          setPinStates(payload);
          break;
      }
    },
    [selectedIC, handleAddLogEntry, allICs]
  );

  const handleGeneratedPinCommand = useCallback((command: string) => {
    if (isDeviceConnected) {
      serialConnectionManagerRef.current?.sendData(command);
    } else {
      handleAddLogEntry({type: "warning", message: "Device not connected. Pin command not sent."});
    }
  }, [isDeviceConnected, handleAddLogEntry]);

  const handlePinStateChange = useCallback(
    (newPinChanges: { [key: number]: boolean }) => {
      if (!isDeviceConnected || !selectedIC) {
        handleAddLogEntry({type: "warning", message: "Cannot change pin states: Device not connected or no IC selected."});
        return;
      }
      setPinStates(prev => ({...prev, ...newPinChanges }));
      pinStateManagerRef.current?.processPinChanges(newPinChanges);
      const changedPinNumbers = Object.keys(newPinChanges).join(', ');
      handleAddLogEntry({type: "info", message: `User initiated pin state change for pins: ${changedPinNumbers}.`});
    },
    [isDeviceConnected, selectedIC, handleAddLogEntry]
  );

  const handleClockFrequencyChange = useCallback(
    (frequency: number) => {
      if (isDeviceConnected && selectedIC) {
        serialConnectionManagerRef.current?.sendData(`CLOCK:${frequency}\n`);
      } else {
        handleAddLogEntry({type: "warning", message: "Cannot send CLOCK command: Device not connected or no IC selected."});
      }
    },
    [isDeviceConnected, selectedIC, handleAddLogEntry]
  );

  // Handler for commands from DebugLog component
  const handleDebugCommand = useCallback((command: string) => {
    if (!isDeviceConnected && command !== 'SHOW_BUFFER') { // Allow SHOW_BUFFER even if not connected
        handleAddLogEntry({type: "warning", message: `Cannot execute command '${command}': Device not connected.`});
        // For SHOW_BUFFER, we might still want SCM to log its buffer, even if not connected, so don't return early.
    }

    switch (command) {
      case "SYNC":
        if (isDeviceConnected) {
            serialConnectionManagerRef.current?.sendData("SYNC\n");
        } else {
             handleAddLogEntry({type: "warning", message: `Cannot send SYNC: Device not connected.`});
        }
        break;
      case "SHOW_BUFFER":
        serialConnectionManagerRef.current?.showBuffer(); // This method logs via SCM's logMessage
        break;
      default:
        handleAddLogEntry({type: "warning", message: `Unknown command from DebugLog: ${command}`});
    }
  }, [isDeviceConnected, handleAddLogEntry]);


  return (
    <div className="gap-6">
      <ICDataManager
        ref={icDataManagerRef}
        onICsLoaded={handleICsLoaded}
        onICSelected={handleICSelectionConfirmed}
        logMessage={handleAddLogEntry}
      />
      <SerialConnectionManager
        ref={serialConnectionManagerRef}
        onDataReceived={handleDataFromConnectionManager}
        logMessage={handleAddLogEntry}
        selectedICForSync={selectedIC}
        allICsForDetection={allICs}
      />
      <PinStateManager
        ref={pinStateManagerRef}
        selectedIC={selectedIC}
        currentPinStates={pinStates}
        onPinStateCommandGenerated={handleGeneratedPinCommand}
        logMessage={handleAddLogEntry}
      />

      <div className="p-6 bg-[var(--background)] rounded-lg shadow-lg mt-6">
        <h2 className="text-xl font-semibold mb-4 text-[var(--foreground)]">
          IC Configuration
        </h2>
        <ICSelector
          onICSelect={handleICSelectFromDropdown}
          initialICs={allICs}
        />
        {selectedIC && (
          <>
            <div className="mt-6 flex justify-center w-full">
              <ICVisualizer
                ic={selectedIC}
                onPinStateChange={handlePinStateChange}
                serialConnected={isDeviceConnected}
                currentPinStates={pinStates}
              />
            </div>
            <ICTruthTableVerifier
              selectedICPartNumber={selectedIC.partNumber}
              currentPinStates={pinStates}
              onPinStateChange={handlePinStateChange}
              onClockFrequencyChange={handleClockFrequencyChange}
              isConnected={isDeviceConnected}
            />
          </>
        )}
      </div>

      {/* Replace old debug log JSX with DebugLog component instance */}
      <DebugLog
        logs={debugLogs}
        onClearLogs={() => setDebugLogs([])}
        showDebugLog={showDebugLog}
        onToggleShowDebugLog={() => setShowDebugLog(prev => !prev)}
        onCommand={handleDebugCommand}
        // isDeviceConnected={isDeviceConnected} // Pass if DebugLog needs to disable buttons based on connection
      />
    </div>
  );
}
