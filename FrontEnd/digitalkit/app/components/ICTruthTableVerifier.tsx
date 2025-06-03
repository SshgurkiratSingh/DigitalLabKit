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
  const [verificationPhase, setVerificationPhase] = useState<'input' | 'output' | null>(null);

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
    const pinStatesLog: string[] = [];
    const currentGate = Math.floor(currentEntry / 4) + 1; // Assuming 4 test cases per gate

    // For sequential ICs, check if clock is properly configured
    if (icData.type === 'sequential' && selectedFrequency === 0) {
      failures.push('Clock frequency must be selected for sequential ICs');
      setVerificationResults({
        passed: false,
        failures
      });
      return;
    }

    // Log all current pin states
    Object.entries(currentPinStates).forEach(([pinNumber, state]) => {
      const pinConfig = icData.pinConfiguration?.find(p => p.pin === parseInt(pinNumber));
      if (pinConfig) {
        pinStatesLog.push(`Current State: Pin ${pinConfig.name} (${pinNumber}): ${state ? 'HIGH' : 'LOW'}`);
      }
    });

    // Add gate information to the log
    if (icData.functional?.gateCount) {
      pinStatesLog.unshift(`Testing Gate ${currentGate} of ${icData.functional.gateCount}`);
    }

    // Phase 1: Input Verification
    if (verificationPhase === null || verificationPhase === 'input') {
      // Display expected input states and wait for user to set them
      const expectedInputsLog: string[] = [];
      const currentGateInputs = Object.entries(entry.inputs).filter(([pin]) => {
        const pinConfig = icData.pinConfiguration?.find(p => p.name === pin);
        // Filter inputs for current gate based on pin naming convention (e.g., 1A, 1B for gate 1)
        return pinConfig && pin.startsWith(currentGate.toString());
      });

      currentGateInputs.forEach(([pin, expectedState]) => {
        const pinConfig = icData.pinConfiguration?.find(p => p.name === pin);
        if (pinConfig) {
          expectedInputsLog.push(`Expected Input: Pin ${pin} (${pinConfig.pin}) should be ${expectedState ? 'HIGH' : 'LOW'}`);
        }
      });

      // Check if all required input pins have states set
      const requiredInputs = new Set(Object.keys(entry.inputs));
      const missingInputs: string[] = [];
      let hasAllRequiredStates = true;
      
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

      if (!hasAllRequiredStates) {
        setVerificationResults({
          passed: false,
          failures: [
            'Please set the following input states:',
            ...expectedInputsLog,
            '',
            'Current Pin States:',
            ...pinStatesLog,
            '',
            `Missing required input states for pins: ${missingInputs.join(', ')}`,
            'Set all inputs according to the expected values and verify again.'
          ]
        });
        setVerificationPhase('input');
        return;
      }

      // Check if all inputs are set correctly
      let allInputsCorrect = true;
      const inputErrors: string[] = [];
      Object.entries(entry.inputs).forEach(([pin, expectedState]) => {
        const pinConfig = icData.pinConfiguration?.find(p => p.name === pin);
        if (pinConfig) {
          const pinNumber = pinConfig.pin;
          const actualState = currentPinStates[pinNumber];
          if (actualState !== expectedState) {
            allInputsCorrect = false;
            inputErrors.push(`Input pin ${pin} (${pinNumber}): Expected ${expectedState ? 'HIGH' : 'LOW'}, got ${actualState ? 'HIGH' : 'LOW'}`);
          }
        }
      });

      if (!allInputsCorrect) {
        setVerificationResults({
          passed: false,
          failures: [
            'Input states do not match expected values:',
            ...expectedInputsLog,
            '',
            'Current Pin States:',
            ...pinStatesLog,
            '',
            'Errors:',
            ...inputErrors,
            '',
            'Please correct the input states and verify again.'
          ]
        });
        setVerificationPhase('input');
        return;
      }

      // If all inputs are correct, move to output phase
      setVerificationPhase('output');
      setVerificationResults({
        passed: false,
        failures: [
          'Input states verified correctly!',
          '',
          'Waiting for device output...',
          '',
          'Expected Output States:',
          ...Object.entries(entry.outputs).map(([pin, expectedState]) => {
            const pinConfig = icData.pinConfiguration?.find(p => p.name === pin);
            return pinConfig ? 
              `Pin ${pin} (${pinConfig.pin}) should be ${expectedState ? 'HIGH' : 'LOW'}` : '';
          }).filter(s => s)
        ]
      });
      return;
    }

    // Phase 2: Output Verification
    if (verificationPhase === 'output') {
      // Check if we have output states from device
      const currentGateOutputs = icData.pinConfiguration.filter(p => 
        p.type === 'OUTPUT' && p.name.startsWith(currentGate.toString())
      );
      const hasOutputStates = currentGateOutputs.some(p => typeof currentPinStates[p.pin] === 'boolean');

      if (!hasOutputStates) {
        setVerificationResults({
          passed: false,
          failures: [
            `Testing Gate ${currentGate} of ${icData.functional?.gateCount}`,
            'Input states are correct.',
            '',
            'Waiting for device to provide output states...',
            '',
            'Expected Output States for Current Gate:',
            ...Object.entries(entry.outputs)
              .filter(([pin]) => pin.startsWith(currentGate.toString()))
              .map(([pin, expectedState]) => {
                const pinConfig = icData.pinConfiguration?.find(p => p.name === pin);
                return pinConfig ? 
                  `Pin ${pin} (${pinConfig.pin}) should be ${expectedState ? 'HIGH' : 'LOW'}` : '';
              }).filter(s => s)
          ]
        });
        return;
      }

      // Verify output pins match truth table
      const outputVerificationResults: string[] = [];
      let allOutputsCorrect = true;
      let currentGateOutputsCorrect = true;

      Object.entries(entry.outputs).forEach(([pin, expectedState]) => {
        const pinConfig = icData.pinConfiguration?.find(p => p.name === pin);
        if (pinConfig) {
          const pinNumber = pinConfig.pin;
          const actualState = currentPinStates[pinNumber];
          const isCurrentGatePin = pin.startsWith(currentGate.toString());
          
          if (typeof actualState === 'boolean' && typeof expectedState === 'boolean') {
            if (actualState !== expectedState) {
              outputVerificationResults.push(
                `Output pin ${pin} (${pinNumber}): Expected ${expectedState ? 'HIGH' : 'LOW'}, got ${actualState ? 'HIGH' : 'LOW'}`
              );
              allOutputsCorrect = false;
              if (isCurrentGatePin) {
                currentGateOutputsCorrect = false;
              }
            }
          } else if (isCurrentGatePin) {
            outputVerificationResults.push(`Output pin ${pin} (${pinNumber}): No valid state received from device`);
            allOutputsCorrect = false;
            currentGateOutputsCorrect = false;
          }
        }
      });

      setVerificationResults({
        passed: allOutputsCorrect,
        failures: [
          `Testing Gate ${currentGate} of ${icData.functional?.gateCount}`,
          '',
          'Input States:',
          ...Object.entries(entry.inputs)
            .filter(([pin]) => pin.startsWith(currentGate.toString()))
            .map(([pin, state]) => {
              const pinConfig = icData.pinConfiguration?.find(p => p.name === pin);
              return pinConfig ? 
                `Pin ${pin} (${pinConfig.pin}): ${state ? 'HIGH' : 'LOW'}` : '';
            }).filter(s => s),
          '',
          'Output Verification Results:',
          ...(currentGateOutputsCorrect 
            ? [`Gate ${currentGate} outputs match expected truth table values!`] 
            : outputVerificationResults.filter(msg => msg.includes(`${currentGate}`)))
        ]
      });

      // Reset phase for next verification if all outputs are correct
      if (currentGateOutputsCorrect) {
        setVerificationPhase(null);
      }
    }
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

    // Reset verification phase when applying new inputs
    setVerificationPhase('input');
    
    onPinStateChange(newPinStates);
  };

  // Move to next truth table entry
  const nextEntry = () => {
    if (!icData) return;
    const nextIndex = (currentEntry + 1) % icData.truthTable.length;
    setCurrentEntry(nextIndex);
    setVerificationPhase(null); // Reset phase before applying new entry
    applyTruthTableEntry(icData.truthTable[nextIndex]);
  };

  // Auto-verification effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (autoVerify && isConnected && icData) {
      interval = setInterval(() => {
        const entry = icData.truthTable[currentEntry];
        const currentGate = Math.floor(currentEntry / 4) + 1;
        
        // Phase 1: Set inputs and wait for verification
        if (verificationPhase === null || verificationPhase === 'input') {
          // Apply inputs for current gate
          applyTruthTableEntry(entry);
          verifyCurrentState(); // This will handle input phase
        }
        // Phase 2: Only proceed when inputs are verified
        else if (verificationPhase === 'output') {
          verifyCurrentState(); // This will handle output phase
          if (verificationResults?.passed) {
            // Move to next test case after successful verification
            setTimeout(() => {
              // Check if we've completed all test cases for the current gate
              const nextEntry = currentEntry + 1;
              const nextGate = Math.floor(nextEntry / 4) + 1;
              
              if (nextGate > (icData.functional?.gateCount || 1)) {
                // All gates tested, stop auto-verify
                setAutoVerify(false);
                setVerificationResults({
                  passed: true,
                  failures: ['All gates have been successfully verified!']
                });
              } else {
                // Move to next test case
                nextEntry();
                setVerificationPhase(null);
              }
            }, 1500);
          }
        }
      }, 3000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [autoVerify, isConnected, currentEntry, icData, verificationPhase]);

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