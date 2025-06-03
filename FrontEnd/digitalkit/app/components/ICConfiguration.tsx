"use client";

import { ICData, PinStates } from "../types/serial";
import ICSelector from "./ICSelector";
import ICVisualizer from "./ICVisualizer";
import ICTruthTableVerifier from "./ICTruthTableVerifier";

interface ICConfigurationProps {
  selectedIC: ICData | null;
  pinStates: PinStates;
  isConnected: boolean;
  onICSelect: (ic: ICData | null) => void;
  onPinStateChange: (newPinStates: { [key: number]: boolean }) => void;
  onClockFrequencyChange: (frequency: number) => void;
}

export default function ICConfiguration({
  selectedIC,
  pinStates,
  isConnected,
  onICSelect,
  onPinStateChange,
  onClockFrequencyChange,
}: ICConfigurationProps) {
  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4 dark:text-white">
        IC Configuration
      </h2>
      <ICSelector onICSelect={onICSelect} />
      {selectedIC && (
        <>
          <div className="mt-6">
            <ICVisualizer
              ic={selectedIC}
              onPinStateChange={onPinStateChange}
              serialConnected={isConnected}
              currentPinStates={pinStates}
            />
          </div>
          <ICTruthTableVerifier
            selectedIC={selectedIC.partNumber}
            currentPinStates={pinStates}
            onPinStateChange={onPinStateChange}
            onClockFrequencyChange={onClockFrequencyChange}
            isConnected={isConnected}
          />
        </>
      )}
    </div>
  );
}