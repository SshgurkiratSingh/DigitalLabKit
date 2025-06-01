import { useState, useEffect } from 'react';
import { ICTruthTable, TruthTableEntry } from '../data/icTruthTables';
import { loadICData } from '../utils/icDataLoader';

interface ICTruthTableVerifierProps {
  selectedIC: string | null;
  currentPinStates: { [key: number]: boolean };
  onPinStateChange: (states: { [key: number]: boolean }) => void;
  onClockFrequencyChange: (frequency: number) => void;
  isConnected: boolean;
}

export default function ICTruthTableVerifier({
  selectedIC,
  currentPinStates,
  onPinStateChange,
  onClockFrequencyChange,
  isConnected
}: ICTruthTableVerifierProps) {
  const [verificationResults, setVerificationResults] = useState<{
    passed: boolean;
    failures: string[];
  } | null>(null);
  const [selectedFrequency, setSelectedFrequency] = useState<number>(0);
  const [autoVerify, setAutoVerify] = useState(false);
  const [currentEntry, setCurrentEntry] = useState<number>(0);

  const [icData, setICData] = useState<ICTruthTable | null>(null);

  // Load IC data when selected IC changes
  useEffect(() => {
    if (selectedIC) {
      loadICData(selectedIC).then(data => {
        setICData(data);
        if (data && data.type === 'sequential' && data.supportedFrequencies?.length) {
          // Set default frequency for sequential ICs
          setSelectedFrequency(data.supportedFrequencies[0]);
          onClockFrequencyChange(data.supportedFrequencies[0]);
        }
      });
    } else {
      setICData(null);
    }
  }, [selectedIC]);

  // Handle clock frequency change
  const handleFrequencyChange = (freq: number) => {
    setSelectedFrequency(freq);
    onClockFrequencyChange(freq);
  };

  // Verify current pin states against truth table
  const verifyCurrentState = () => {
    if (!icData || !currentPinStates) return;

    const entry = icData.truthTable[currentEntry];
    const failures: string[] = [];

    // For sequential ICs, check if clock is properly configured
    if (icData.type === 'sequential' && selectedFrequency === 0) {
      failures.push('Clock frequency must be selected for sequential ICs');
      setVerificationResults({
        passed: false,
        failures
      });
      return;
    }

    // Check each output based on IC type
    Object.entries(entry.outputs).forEach(([pin, expectedState]) => {
      const pinConfig = icData.pinConfiguration?.find(p => p.name === pin);
      if (!pinConfig) return;

      const pinNumber = pinConfig.pin;
      const actualState = currentPinStates[pinNumber];
      
      // For sequential ICs, handle special cases
      if (icData.type === 'sequential') {
        // Skip verification if clock is transitioning
        if (pin.includes('CLK')) return;
        
        // For flip-flops/latches with previous state dependency
        if (typeof expectedState === 'string' && (expectedState === 'Qprev' || expectedState === 'QBprev')) {
          // Skip verification as it depends on previous state
          return;
        }
      }

      if (typeof expectedState === 'boolean' && actualState !== expectedState) {
        failures.push(
          `Pin ${pin} (${pinNumber}): Expected ${expectedState ? 'HIGH' : 'LOW'}, got ${actualState ? 'HIGH' : 'LOW'}`
        );
      }
    });

    setVerificationResults({
      passed: failures.length === 0,
      failures
    });
  };

  // Apply truth table entry to pins
  const applyTruthTableEntry = (entry: TruthTableEntry) => {
    if (!icData) return;

    const newPinStates = { ...currentPinStates };
    
    // Set input pins according to truth table entry
    Object.entries(entry.inputs).forEach(([pin, state]) => {
      const pinConfig = icData.pinConfiguration?.find(p => p.name === pin);
      if (!pinConfig) return;

      const pinNumber = pinConfig.pin;
      if (pinNumber > 0) {
        // For sequential ICs, handle clock separately
        if (icData.type === 'sequential' && pin.includes('CLK')) {
          // Clock pin is handled by the auto-verification logic
          return;
        }
        newPinStates[pinNumber] = state;
      }
    });

    // For sequential ICs, ensure clock starts low
    if (icData.type === 'sequential' && icData.clockPin) {
      newPinStates[icData.clockPin] = false;
    }

    onPinStateChange(newPinStates);
  };

  // Move to next truth table entry
  const nextEntry = () => {
    if (!icData) return;
    const nextIndex = (currentEntry + 1) % icData.truthTable.length;
    setCurrentEntry(nextIndex);
    applyTruthTableEntry(icData.truthTable[nextIndex]);
  };

  // Auto-verification effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (autoVerify && isConnected && icData) {
      const verificationInterval = icData.type === 'sequential' 
        ? Math.floor(1000 / selectedFrequency) * 2 // Double the clock period for sequential ICs
        : 1000; // 1 second for combinational ICs

      interval = setInterval(() => {
        if (icData.type === 'sequential' && icData.clockPin) {
          // For sequential ICs, toggle clock and verify on falling edge
          const newPinStates = { ...currentPinStates };
          const clockPin = icData.clockPin;
          
          // Set clock high
          newPinStates[clockPin] = true;
          onPinStateChange(newPinStates);

          // Wait for half period, then set clock low and verify
          setTimeout(() => {
            newPinStates[clockPin] = false;
            onPinStateChange(newPinStates);
            
            // Verify after a small delay to allow for propagation
            setTimeout(() => {
              verifyCurrentState();
              nextEntry();
            }, 50);
          }, verificationInterval / 2);
        } else {
          // For combinational ICs, verify immediately
          verifyCurrentState();
          nextEntry();
        }
      }, verificationInterval);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [autoVerify, isConnected, currentEntry, icData, selectedFrequency]);

  if (!selectedIC || !icData) {
    return null;
  }

  return (
    <div className="mt-6 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
      <h3 className="text-lg font-semibold mb-4 dark:text-white">Truth Table Verification</h3>
      
      {/* Clock Frequency Control (for sequential ICs) */}
      {icData.type === 'sequential' && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2 dark:text-gray-200">
            Clock Frequency
          </label>
          <select
            className="w-full p-2 border rounded dark:bg-gray-600 dark:text-white dark:border-gray-500"
            value={selectedFrequency}
            onChange={(e) => handleFrequencyChange(Number(e.target.value))}
            disabled={!isConnected}
          >
            <option value={0}>Select Frequency</option>
            {icData.supportedFrequencies?.map((freq) => (
              <option key={freq} value={freq}>
                {freq >= 1000 ? `${freq/1000}KHz` : `${freq}Hz`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Current Truth Table Entry */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2 dark:text-gray-200">
          Current Test Case ({currentEntry + 1}/{icData.truthTable.length})
        </h4>
        <div className="bg-white dark:bg-gray-800 p-3 rounded">
          <p className="text-sm dark:text-gray-300">
            {icData.truthTable[currentEntry].description || 'No description available'}
          </p>
        </div>
      </div>

      {/* Verification Controls */}
      <div className="flex space-x-2 mb-4">
        <button
          onClick={() => verifyCurrentState()}
          disabled={!isConnected}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          Verify Current State
        </button>
        <button
          onClick={nextEntry}
          disabled={!isConnected}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
        >
          Next Test Case
        </button>
        <button
          onClick={() => setAutoVerify(!autoVerify)}
          disabled={!isConnected}
          className={`px-4 py-2 rounded text-white ${
            autoVerify 
              ? 'bg-red-500 hover:bg-red-600' 
              : 'bg-green-500 hover:bg-green-600'
          } disabled:opacity-50`}
        >
          {autoVerify ? 'Stop Auto Verify' : 'Start Auto Verify'}
        </button>
      </div>

      {/* Verification Results */}
      {verificationResults && (
        <div className={`p-3 rounded ${
          verificationResults.passed 
            ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-100' 
            : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-100'
        }`}>
          <p className="font-medium">
            {verificationResults.passed ? 'Verification Passed!' : 'Verification Failed'}
          </p>
          {verificationResults.failures.length > 0 && (
            <ul className="mt-2 text-sm list-disc list-inside">
              {verificationResults.failures.map((failure, index) => (
                <li key={index}>{failure}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}