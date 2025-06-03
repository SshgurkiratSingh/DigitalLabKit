"use client";

import React, { useState, useEffect } from "react";
import { useICData, ICData } from "../hooks/useICData"; // Adjust path as needed
import ICSelector from "./ICSelector";
import ICVisualizer from "./ICVisualizer";
import ICTruthTableVerifier from "./ICTruthTableVerifier";

interface ICConfigurationProps {
  // Data and connection status from parent (e.g., SerialPortInterface)
  currentPinStates: { [key: number]: boolean };
  serialConnected: boolean;
  initialSelectedIC?: ICData | null; // Allow parent to set an initial IC

  // Callbacks to parent
  onICSelected: (ic: ICData | null) => void; // Notify parent of IC selection
  onPinStateChange: (newPinStates: { [key: number]: boolean }) => void;
  onClockFrequencyChange: (frequency: number) => void;
}

export default function ICConfiguration({
  currentPinStates,
  serialConnected,
  initialSelectedIC = null,
  onICSelected,
  onPinStateChange,
  onClockFrequencyChange,
}: ICConfigurationProps) {
  const {
    allICs,
    isLoading: isICDataLoading,
    error: icDataError,
    // getICByPartNumber, // Might be used internally or passed to children if needed
    // findICs,
  } = useICData();

  const [selectedIC, setSelectedIC] = useState<ICData | null>(initialSelectedIC);

  // Effect to reflect prop changes for initialSelectedIC
  useEffect(() => {
    setSelectedIC(initialSelectedIC);
  }, [initialSelectedIC]);

  const handleICSelectFromSelector = (ic: ICData | null) => {
    setSelectedIC(ic);
    onICSelected(ic); // Notify parent component
  };

  if (isICDataLoading) {
    return (
      <div className="p-6 bg-[var(--background)] rounded-lg shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-[var(--foreground)]">
          IC Configuration
        </h2>
        <p className="text-[var(--muted-foreground)]">Loading IC data...</p>
      </div>
    );
  }

  if (icDataError) {
    return (
      <div className="p-6 bg-[var(--background)] rounded-lg shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-[var(--foreground)]">
          IC Configuration
        </h2>
        <div className="mt-4 p-3 bg-red-900/30 text-red-100 border border-red-700 rounded-md text-sm">
          <strong>Error loading IC data:</strong> {icDataError}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-[var(--background)] rounded-lg shadow-lg">
      <h2 className="text-xl font-semibold mb-4 text-[var(--foreground)]">
        IC Configuration
      </h2>

      <ICSelector
        allICs={allICs}
        onICSelect={handleICSelectFromSelector}
        initialSelectedICPartNumber={selectedIC?.partNumber}
      />

      {selectedIC && (
        <>
          <div className="mt-6 flex justify-center w-full">
            <ICVisualizer
              ic={selectedIC}
              onPinStateChange={onPinStateChange} // Pass through
              serialConnected={serialConnected}
              currentPinStates={currentPinStates}
            />
          </div>
          <ICTruthTableVerifier
            selectedIC={selectedIC} // Pass the full ICData object
            currentPinStates={currentPinStates}
            onPinStateChange={onPinStateChange} // Pass through
            onClockFrequencyChange={onClockFrequencyChange} // Pass through
            isConnected={serialConnected}
          />
        </>
      )}
      {!selectedIC && !isICDataLoading && (
         <div className="mt-6 text-center text-[var(--muted-foreground)]">
            <p>Select an IC to view its details and truth table.</p>
        </div>
      )}
    </div>
  );
}
