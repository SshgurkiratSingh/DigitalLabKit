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

    // For combinational ICs, handle verification with serial device response
    if (icData.type !== 'sequential') {
      const pinStatesLog: string[] = [];
      const failures: string[] = [];
      let allPinsValid = true;
      let hasAllRequiredStates = true;
      let waitingForDevice = false;

      // First verify that all required input pins have states set
      const requiredInputs = new Set(Object.keys(entry.inputs));
      const missingInputs: string[] = [];
      
      requiredInputs.forEach(inputName => {
        const pinConfig = icData.pinConfiguration?.find(p => p.name === inputName);
        if (pinConfig) {
          const pinNumber = pinConfig.pin;
          if (typeof currentPinStates[pinNumber] !== 'boolean') {
            missingInputs.push(inputName);
            hasAllRequiredStates = false;
          }
        }
      });

      // Log all current pin states
      Object.entries(currentPinStates).forEach(([pinNumber, state]) => {
        const pinConfig = icData.pinConfiguration?.find(p => p.pin === parseInt(pinNumber));
        if (pinConfig) {
          pinStatesLog.push(`Pin ${pinConfig.name} (${pinNumber}): ${state ? 'HIGH' : 'LOW'}`);
        }
      });

      // Check if we're waiting for device response
      const outputPins = icData.pinConfiguration.filter(p => p.type === 'OUTPUT');
      const hasOutputStates = outputPins.some(p => typeof currentPinStates[p.pin] === 'boolean');
      waitingForDevice = !hasOutputStates;

      // If we're missing input states, wait for them
      if (!hasAllRequiredStates) {
        setVerificationResults({
          passed: false,
          failures: [
            'Pin States:',
            ...pinStatesLog,
            '',
            'Verification Results:',
            `Missing required input states for pins: ${missingInputs.join(', ')}`,
            'Waiting for all input states to be set...'
          ]
        });
        return;
      }

      // If we have all inputs but no outputs, we're waiting for device response
      if (waitingForDevice) {
        setVerificationResults({
          passed: false,
          failures: [
            'Pin States:',
            ...pinStatesLog,
            '',
            'Verification Results:',
            'All input pins set correctly',
            'Waiting for device response...'
          ]
        });
        return;
      }

      // Then verify output pins if we have received data from the device
      if (Object.keys(currentPinStates).length > 0) {
        // First verify that input states match what we expect
        Object.entries(entry.inputs).forEach(([pin, expectedState]) => {
          const pinConfig = icData.pinConfiguration?.find(p => p.name === pin);
          if (!pinConfig) return;

          const pinNumber = pinConfig.pin;
          const actualState = currentPinStates[pinNumber];

          if (typeof actualState === 'boolean' && typeof expectedState === 'boolean') {
            if (actualState !== expectedState) {
              failures.push(`Input pin ${pin} (${pinNumber}) not in expected state: Expected ${expectedState ? 'HIGH' : 'LOW'}, got ${actualState ? 'HIGH' : 'LOW'}`);
              allPinsValid = false;
            }
          }
        });

        // Then verify output pins with tolerance for device response delay
        Object.entries(entry.outputs).forEach(([pin, expectedState]) => {
          const pinConfig = icData.pinConfiguration?.find(p => p.name === pin);
          if (!pinConfig) return;

          const pinNumber = pinConfig.pin;
          const actualState = currentPinStates[pinNumber];

          // Only verify if we have a valid state for this pin
          if (typeof actualState === 'boolean' && typeof expectedState === 'boolean') {
            if (actualState !== expectedState) {
              failures.push(`Output pin ${pin} (${pinNumber}): Expected ${expectedState ? 'HIGH' : 'LOW'}, got ${actualState ? 'HIGH' : 'LOW'}`);
              allPinsValid = false;
            }
          } else {
            failures.push(`Output pin ${pin} (${pinNumber}): No valid state received from device`);
            allPinsValid = false;
          }
        });
      }

      setVerificationResults({
        passed: allPinsValid,
        failures: [
          'Pin States:',
          ...pinStatesLog,
          ...(failures.length > 0 ? ['', 'Verification Results:', ...failures] : [])
        ]
      });
      return;
    }

    // For sequential ICs, proceed with normal verification
    Object.entries(entry.outputs).forEach(([pin, expectedState]) => {
      const pinConfig = icData.pinConfiguration?.find(p => p.name === pin);
      if (!pinConfig) return;

      const pinNumber = pinConfig.pin;
      const actualState = currentPinStates[pinNumber];
      
      // Skip verification if clock is transitioning
      if (pin.includes('CLK')) return;
      
      // For flip-flops/latches with previous state dependency
      if (typeof expectedState === 'string' && (expectedState === 'Qprev' || expectedState === 'QBprev')) {
        // Skip verification as it depends on previous state
        return;
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
      if (icData.type === 'sequential') {
        // For sequential ICs, use clock-based verification
        const verificationInterval = Math.floor(1000 / selectedFrequency) * 2; // Double the clock period

        interval = setInterval(() => {
          if (icData.clockPin) {
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
          }
        }, verificationInterval);
      } else {
        // For combinational ICs, apply inputs and wait for serial device response
        interval = setInterval(() => {
          // Apply the current truth table entry inputs
          const entry = icData.truthTable[currentEntry];
          applyTruthTableEntry(entry);
          
          // Wait for device response with progressive checks
          let attempts = 0;
          const maxAttempts = 5;
          const checkInterval = setInterval(() => {
            attempts++;
            
            // Check if we have output states
            const outputPins = icData.pinConfiguration.filter(p => p.type === 'OUTPUT');
            const hasOutputStates = outputPins.some(p => typeof currentPinStates[p.pin] === 'boolean');
            
            if (hasOutputStates) {
              // We have output states, verify and move on
              clearInterval(checkInterval);
              verifyCurrentState();
              setTimeout(() => nextEntry(), 200); // Small delay before next test case
            } else if (attempts >= maxAttempts) {
              // No response after max attempts, log error and move on
              console.log(`No response from device after ${attempts} attempts for IC ${selectedIC}`);
              clearInterval(checkInterval);
              setVerificationResults({
                passed: false,
                failures: ['No response from device after multiple attempts']
              });
              setTimeout(() => nextEntry(), 200);
            }
          }, 300); // Check every 300ms
          
        }, 2000); // Test a new case every 2s to ensure enough time for serial response and verification
      }
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