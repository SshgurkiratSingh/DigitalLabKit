import { ICTruthTable, TruthTableEntry } from '../data/icTruthTables';

type TruthTablePrimitive = number | string | boolean;
type TruthTableInputs = number[] | Record<string, TruthTablePrimitive>;
type TruthTableOutputs = Record<string, TruthTablePrimitive>;

interface TruthTableJsonEntry
  extends Record<string, TruthTableInputs | TruthTableOutputs | TruthTablePrimitive | undefined> {
  inputs: TruthTableInputs;
  output?: number;
  outputs?: TruthTableOutputs;
  CLK?: TruthTablePrimitive;
  CLR?: TruthTablePrimitive;
  J?: TruthTablePrimitive;
  K?: TruthTablePrimitive;
  Q?: TruthTablePrimitive;
  QB?: TruthTablePrimitive;
  LE?: TruthTablePrimitive;
  D?: TruthTablePrimitive;
  G?: TruthTablePrimitive;
  S?: TruthTablePrimitive;
}

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
    truthTable: TruthTableJsonEntry[];
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isTruthTablePrimitive = (value: unknown): value is TruthTablePrimitive =>
  typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string';

const isTruthTableJsonEntry = (value: unknown): value is TruthTableJsonEntry => {
  if (!isRecord(value)) {
    return false;
  }

  const inputs = value.inputs;
  if (
    !(
      Array.isArray(inputs) && inputs.every((item) => typeof item === 'number')
    ) &&
    !(isRecord(inputs) && Object.values(inputs).every(isTruthTablePrimitive))
  ) {
    return false;
  }

  if (
    value.outputs !== undefined &&
    !(isRecord(value.outputs) && Object.values(value.outputs).every(isTruthTablePrimitive))
  ) {
    return false;
  }

  return true;
};

const isPinConfiguration = (value: unknown): value is ICJsonData['pinConfiguration'][number] =>
  isRecord(value) &&
  typeof value.pin === 'number' &&
  typeof value.name === 'string' &&
  typeof value.type === 'string' &&
  typeof value.function === 'string';

const isICJsonData = (value: unknown): value is ICJsonData => {
  if (!isRecord(value)) {
    return false;
  }

  const { partNumber, description, category, pinCount, pinConfiguration, functional } = value;

  if (
    typeof partNumber !== 'string' ||
    typeof description !== 'string' ||
    typeof category !== 'string' ||
    typeof pinCount !== 'number' ||
    !Array.isArray(pinConfiguration) ||
    !pinConfiguration.every(isPinConfiguration) ||
    !isRecord(functional) ||
    !Array.isArray(functional.truthTable) ||
    !functional.truthTable.every(isTruthTableJsonEntry)
  ) {
    return false;
  }

  return true;
};

const primitiveToBoolean = (value: TruthTablePrimitive): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return value === '1';
};

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

        const data = (await response.json()) as unknown;
        if (!isRecord(data)) {
          errors.push(`Invalid data format in ${file}`);
          continue;
        }

        // Search for the IC in the loaded data
        const matches = findAllICMatches(data, partNumber);
        matches.forEach(match => allMatches.push({ ...match, file }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Error processing ${file}: ${message}`);
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
    console.log(`No IC found matching number: ${partNumber}.`);
    return null;
  } catch (error) {
    console.error('Error loading IC data:', error);
    return null;
  }
}

function findAllICMatches(
  data: Record<string, unknown>,
  partNumber: string
): Array<{ic: ICJsonData, matchType: string, score: number}> {
  // Extract numeric part and series prefix from the requested part number
  const requestedNumeric = partNumber.match(/\d+/)?.[0];
  if (!requestedNumeric) return [];

  // Search through all categories in the data
  const categoriesRaw = data['74SeriesICs'];
  if (!isRecord(categoriesRaw)) {
    return [];
  }

  const allMatches: Array<{ic: ICJsonData, matchType: string, score: number}> = [];

  // Normalize the requested part number
  const normalizedRequestedNumber = partNumber.replace(/[^0-9]/g, '');
  const requestedSeries = partNumber.toLowerCase().includes('74') ? '74' : '';

  for (const category of Object.values(categoriesRaw)) {
    if (isRecord(category)) {
      const entries = Object.entries(category);

      // Collect all potential matches with their scores
      for (const [icNumber, icData] of entries) {
        if (!isICJsonData(icData)) {
          continue;
        }
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
            convertedEntry.outputs[key] = primitiveToBoolean(value);
          });
        }
      }
      // Handle named inputs/outputs
      else {
        const entryRecord = entry as Record<string, TruthTableInputs | TruthTableOutputs | TruthTablePrimitive>;
        Object.entries(entryRecord).forEach(([key, value]) => {
          if (!isTruthTablePrimitive(value)) {
            return;
          }
          // Check if key is an input pin name
          if (inputs.includes(key)) {
            convertedEntry.inputs[key] = primitiveToBoolean(value);
          }
          // Check if key is an output pin name
          else if (outputs.includes(key)) {
            convertedEntry.outputs[key] = primitiveToBoolean(value);
          }
        });
      }
    } else {
      // For sequential ICs, handle named signals
      const entryRecord = entry as Record<string, TruthTableInputs | TruthTableOutputs | TruthTablePrimitive>;
      Object.entries(entryRecord).forEach(([key, value]) => {
        if (!isTruthTablePrimitive(value)) {
          return;
        }
        if (
          key === 'CLK' ||
          key === 'CLR' ||
          key.startsWith('J') ||
          key.startsWith('K') ||
          key === 'D' ||
          key === 'LE' ||
          key === 'S'
        ) {
          convertedEntry.inputs[key] = primitiveToBoolean(value);
        } else if (key === 'Q' || key === 'QB' || key.startsWith('Y')) {
          convertedEntry.outputs[key] = primitiveToBoolean(value);
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

function generateDescription(category: string, entry: TruthTableJsonEntry): string {
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