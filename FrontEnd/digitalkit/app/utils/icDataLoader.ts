import { ICTruthTable, TruthTableEntry } from '../data/icTruthTables';

interface ICJsonData {
  partNumber: string;
  description: string;
  category: string;
  pinCount: number;
  pinConfiguration: Array<{
    pin: number;
    name: string;
    type: string;
    function: string;
  }>;
  functional: {
    truthTable: Array<{
      inputs: number[] | { [key: string]: any };
      output?: number;
      outputs?: { [key: string]: number };
      CLK?: string;
      CLR?: number;
      J?: number;
      K?: number;
      Q?: string | number;
      QB?: string | number;
      LE?: number;
      D?: number;
      G?: number;
      S?: string | number;
    }>;
    gateCount?: number;
    inputsPerGate?: number;
    ffType?: string;
    edgeTrigger?: string;
    timingSpecs?: {
      setupTime: string;
      holdTime: string;
      propagationDelay: string;
    };
  };
}

export async function loadICData(partNumber: string): Promise<ICTruthTable | null> {
  try {
    // Try to load from each possible JSON file
    const possibleFiles = [
      '/files/combinationalIC.json',
      '/files/sequentialIC.json',
      '/files/arithmeticIc.json',
      '/files/BCDDecoderIC.json',
      '/files/CounterIC.json',
      '/files/ShiftRegisterIC.json',
      '/files/comparatorIc.json'
    ];

    const errors: string[] = [];
    const allMatches: Array<{ic: ICJsonData, file: string, score: number}> = [];

    for (const file of possibleFiles) {
      try {
        const response = await fetch(file);
        if (!response.ok) {
          errors.push(`Failed to load ${file}: ${response.statusText}`);
          continue;
        }

        const data = await response.json();
        if (!data || typeof data !== 'object') {
          errors.push(`Invalid data format in ${file}`);
          continue;
        }

        // Search for the IC in the loaded data
        const matches = findAllICMatches(data, partNumber);
        matches.forEach(match => allMatches.push({ ...match, file }));
      } catch (error) {
        errors.push(`Error processing ${file}: ${error}`);
        continue;
      }
    }

    // If we found any matches, return the best one
    if (allMatches.length > 0) {
      allMatches.sort((a, b) => b.score - a.score);
      console.log(`Found ${allMatches.length} matches for ${partNumber}:`, 
        allMatches.map(m => `${m.ic.partNumber} (${m.file}, score: ${m.score})`));
      return convertToICTruthTable(allMatches[0].ic);
    }

    // If we have no matches but have errors, log them
    if (errors.length > 0) {
      console.error('Errors while loading IC data:', errors);
    }

    // No matches found
    console.log(`No IC found matching number: ${partNumber}. Available ICs: ${allMatches.map(m => m.ic.partNumber).join(', ')}`);
    return null;
  } catch (error) {
    console.error('Error loading IC data:', error);
    return null;
  }
}

function findAllICMatches(data: any, partNumber: string): Array<{ic: ICJsonData, matchType: string, score: number}> {
  // Extract numeric part and series prefix from the requested part number
  const requestedNumeric = partNumber.match(/\d+/)?.[0];
  if (!requestedNumeric) return [];

  // Search through all categories in the data
  const categories = data['74SeriesICs'] || {};
  const allMatches: Array<{ic: ICJsonData, matchType: string, score: number}> = [];

  // Normalize the requested part number
  const normalizedRequestedNumber = partNumber.replace(/[^0-9]/g, '');
  const requestedSeries = partNumber.toLowerCase().includes('74') ? '74' : '';

  for (const category of Object.values(categories)) {
    if (category && typeof category === 'object') {
      const entries = Object.entries(category as { [key: string]: ICJsonData });
      
      // Collect all potential matches with their scores
      for (const [icNumber, icData] of entries) {
        // Normalize the IC number for comparison
        const normalizedICNumber = icNumber.replace(/[^0-9]/g, '');
        const icSeries = icNumber.toLowerCase().includes('74') ? '74' : '';
        
        if (!normalizedICNumber) continue;

        // Calculate match score (higher is better)
        let score = 0;
        let matchType = '';

        // Exact match (highest priority)
        if (normalizedICNumber === normalizedRequestedNumber && icSeries === requestedSeries) {
          score = 1000;
          matchType = 'exact';
        }
        // Numeric exact match with series match
        else if (normalizedICNumber === normalizedRequestedNumber) {
          score = 900;
          matchType = 'numeric_exact';
        }
        // Numeric starts with requested
        else if (normalizedICNumber.startsWith(normalizedRequestedNumber)) {
          score = 800 - (normalizedICNumber.length - normalizedRequestedNumber.length);
          matchType = 'numeric_starts';
        }
        // Requested starts with numeric
        else if (normalizedRequestedNumber.startsWith(normalizedICNumber)) {
          score = 700 - (normalizedRequestedNumber.length - normalizedICNumber.length);
          matchType = 'numeric_contained';
        }
        // Numeric contains requested or vice versa
        else if (normalizedICNumber.includes(normalizedRequestedNumber) || 
                 normalizedRequestedNumber.includes(normalizedICNumber)) {
          score = 600 - Math.abs(normalizedICNumber.length - normalizedRequestedNumber.length);
          matchType = 'numeric_partial';
        }

        // Boost score if series matches
        if (score > 0 && requestedSeries && icSeries === requestedSeries) {
          score += 50;
        }

        if (score > 0) {
          allMatches.push({ ic: icData, matchType, score });
          console.log(`Match found for ${partNumber}: ${icNumber} (${matchType}, score: ${score})`);
        }
      }
    }
  }

  return allMatches;
}

// Helper function to find longest common substring
function findLongestCommonSubstring(str1: string, str2: string): string {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));
  let maxLength = 0;
  let endIndex = 0;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        if (dp[i][j] > maxLength) {
          maxLength = dp[i][j];
          endIndex = i - 1;
        }
      }
    }
  }

  return str1.slice(endIndex - maxLength + 1, endIndex + 1);
}

function convertToICTruthTable(icData: ICJsonData): ICTruthTable {
  const isSequential = ['FLIP_FLOP', 'LATCH', 'COUNTER', 'SHIFT_REGISTER'].includes(icData.category);
  const isCombinational = ['LOGIC_GATE', 'MULTIPLEXER', 'DEMULTIPLEXER'].includes(icData.category);
  
  // Get input and output pins
  const inputs = icData.pinConfiguration
    .filter(pin => pin.type === 'INPUT')
    .map(pin => pin.name);
  
  const outputs = icData.pinConfiguration
    .filter(pin => pin.type === 'OUTPUT')
    .map(pin => pin.name);

  // Find clock pin for sequential ICs
  const clockPin = isSequential ? 
    icData.pinConfiguration.find(pin => pin.name.includes('CLK'))?.pin : undefined;

  // Convert truth table entries
  const truthTable: TruthTableEntry[] = icData.functional.truthTable.map(entry => {
    const convertedEntry: TruthTableEntry = {
      inputs: {},
      outputs: {},
      description: ''
    };

    // Handle different truth table formats
    if (isCombinational) {
      // For combinational ICs, handle array inputs and single output
      if (Array.isArray(entry.inputs)) {
        // Map array inputs to named inputs based on pin configuration
        entry.inputs.forEach((value, index) => {
          const inputName = inputs[index] || `IN${index + 1}`;
          convertedEntry.inputs[inputName] = Boolean(value);
        });
        
        // Handle single output for basic gates
        if (typeof entry.output === 'number') {
          const outputName = outputs[0] || 'OUT';
          convertedEntry.outputs[outputName] = Boolean(entry.output);
        }
        // Handle multiple outputs if present
        else if (entry.outputs) {
          Object.entries(entry.outputs).forEach(([key, value]) => {
            convertedEntry.outputs[key] = Boolean(value);
          });
        }
      }
      // Handle named inputs/outputs
      else {
        Object.entries(entry).forEach(([key, value]) => {
          // Check if key is an input pin name
          if (inputs.includes(key)) {
            convertedEntry.inputs[key] = typeof value === 'boolean' ? value :
                                       typeof value === 'number' ? value === 1 :
                                       typeof value === 'string' ? value === '1' : false;
          }
          // Check if key is an output pin name
          else if (outputs.includes(key)) {
            convertedEntry.outputs[key] = typeof value === 'boolean' ? value :
                                        typeof value === 'number' ? value === 1 :
                                        typeof value === 'string' ? value === '1' : false;
          }
        });
      }
    } else {
      // For sequential ICs, handle named signals
      Object.entries(entry).forEach(([key, value]) => {
        if (key === 'CLK' || key === 'CLR' || key.startsWith('J') || key.startsWith('K') || 
            key === 'D' || key === 'LE' || key === 'S') {
          convertedEntry.inputs[key] = typeof value === 'string' ? value === '1' :
                                     typeof value === 'number' ? value === 1 :
                                     typeof value === 'boolean' ? value : false;
        } else if (key === 'Q' || key === 'QB' || key.startsWith('Y')) {
          convertedEntry.outputs[key] = typeof value === 'string' ? value === '1' :
                                      typeof value === 'number' ? value === 1 :
                                      typeof value === 'boolean' ? value : false;
        }
      });
    }

    // Add description based on IC type and values
    convertedEntry.description = generateDescription(icData.category, entry);

    return convertedEntry;
  });

  // Generate supported frequencies for sequential ICs
  const supportedFrequencies = isSequential ? 
    [1000, 2000, 4000, 8000, 16000] : undefined;

  return {
    partNumber: icData.partNumber,
    type: isSequential ? 'sequential' : 'combinational',
    clockPin,
    supportedFrequencies,
    inputs,
    outputs,
    pinConfiguration: icData.pinConfiguration,
    truthTable
  };
}

function generateDescription(category: string, entry: any): string {
  switch (category) {
    case 'LOGIC_GATE':
      return `Input${Array.isArray(entry.inputs) ? 's' : ''}: ${JSON.stringify(entry.inputs)}, Output${entry.outputs ? 's' : ''}: ${JSON.stringify(entry.output ?? entry.outputs)}`;
    case 'FLIP_FLOP':
      return `Clock: ${entry.CLK}, D/JK: ${entry.D ?? `J=${entry.J},K=${entry.K}`}, Q: ${entry.Q}`;
    case 'LATCH':
      return `LE: ${entry.LE}, D: ${entry.D}, Q: ${entry.Q}`;
    case 'COUNTER':
      return `Clock: ${entry.CLK}, Clear: ${entry.CLR}, Count: ${entry.Q}`;
    default:
      return 'Test case';
  }
}