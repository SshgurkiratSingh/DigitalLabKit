"use client";

import { useSerialPort } from "../contexts/SerialPortContext";
import SerialPortDebugLog from "./SerialPortDebugLog";
import SerialPortConnection from "./SerialPortConnection";
import ICConfiguration from "./ICConfiguration";
import { ICData } from "../types/serial";

interface SerialPortInterfaceProps {
  onICSelect?: (ic: ICData | null) => void;
}

export default function SerialPortInterface({
  onICSelect,
}: SerialPortInterfaceProps = {}) {
  const {
    ports,
    selectedPort,
    isConnected,
    error,
    selectedIC,
    pinStates,
    debugLogs,
    commandBuffer,
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
  } = useSerialPort();

  // Check if Web Serial API is supported
  const isSerialSupported = typeof navigator !== "undefined" && "serial" in navigator;

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
      <SerialPortDebugLog
        logs={debugLogs}
        onClearLogs={clearDebugLogs}
        onRequestSync={() => isConnected && sendData("SYNC\n")}
        onShowBuffer={() => {
          addDebugLog("info", `Current buffer content: "${commandBuffer}"`);
        }}
        isConnected={isConnected}
      />

      <SerialPortConnection
        isConnected={isConnected}
        ports={ports}
        selectedPort={selectedPort}
        error={error}
        onPortSelect={setSelectedPort}
        onRequestPort={requestPort}
        onConnect={connectToPort}
        onDisconnect={disconnectFromPort}
      />

      <ICConfiguration
        selectedIC={selectedIC}
        pinStates={pinStates}
        isConnected={isConnected}
        onICSelect={(ic) => {
          handleICSelect(ic);
          onICSelect?.(ic);
        }}
        onPinStateChange={handlePinStateChange}
        onClockFrequencyChange={handleClockFrequencyChange}
      />
    </div>
  );
}