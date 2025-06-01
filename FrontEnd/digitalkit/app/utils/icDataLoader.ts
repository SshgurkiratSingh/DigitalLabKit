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

    for (const file of possibleFiles) {
      const response = await fetch(file);
      const data = await response.json();
      
      // Search for the IC in the loaded data
      const icData = findICInData(data, partNumber);
      if (icData) {
        return convertToICTruthTable(icData);
      }
    }

    return null;
  } catch (error) {
    console.error('Error loading IC data:', error);
    return null;
  }
}

function findICInData(data: any, partNumber: string): ICJsonData | null {
  // Search through all categories in the data
  const categories = data['74SeriesICs'] || {};
  for (const category of Object.values(categories)) {
    if (category && typeof category === 'object') {
      const entries = Object.entries(category as { [key: string]: ICJsonData });
      for (const [icNumber, icData] of entries) {
        if (icNumber === partNumber) {
          return icData;
        }
      }
    }
  }
  return null;
}

function convertToICTruthTable(icData: ICJsonData): ICTruthTable {
  const isSequential = ['FLIP_FLOP', 'LATCH', 'COUNTER', 'SHIFT_REGISTER'].includes(icData.category);
  
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
    if (Array.isArray(entry.inputs)) {
      // For simple gates with array inputs
      entry.inputs.forEach((value, index) => {
        convertedEntry.inputs[`IN${index + 1}`] = Boolean(value);
      });
      if (typeof entry.output === 'number') {
        convertedEntry.outputs['OUT'] = Boolean(entry.output);
      }
    } else {
      // For complex ICs with named signals
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