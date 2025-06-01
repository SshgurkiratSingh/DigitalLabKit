export interface TruthTableEntry {
  inputs: { [key: string]: boolean };
  outputs: { [key: string]: boolean | string };  // Allow string values for special states
  description?: string;
}

export interface PinConfiguration {
  pin: number;
  name: string;
  type: string;
  function: string;
}

export interface ICTruthTable {
  partNumber: string;
  type: 'combinational' | 'sequential';
  clockPin?: number;  // For sequential ICs
  supportedFrequencies?: number[];  // Supported clock frequencies in Hz
  inputs: string[];  // Input pin names
  outputs: string[]; // Output pin names
  pinConfiguration: PinConfiguration[];  // Added pin configuration
  truthTable: TruthTableEntry[];
}

// Example truth tables
export const truthTables: { [key: string]: ICTruthTable } = {
  // 7400: Quad 2-Input NAND Gate
  '7400': {
    partNumber: '7400',
    type: 'combinational',
    inputs: ['A1', 'B1', 'A2', 'B2', 'A3', 'B3', 'A4', 'B4'],
    outputs: ['Y1', 'Y2', 'Y3', 'Y4'],
    pinConfiguration: [
      { pin: 1, name: 'A1', type: 'INPUT', function: 'Gate 1 Input A' },
      { pin: 2, name: 'B1', type: 'INPUT', function: 'Gate 1 Input B' },
      { pin: 3, name: 'Y1', type: 'OUTPUT', function: 'Gate 1 Output' },
      { pin: 4, name: 'A2', type: 'INPUT', function: 'Gate 2 Input A' },
      { pin: 5, name: 'B2', type: 'INPUT', function: 'Gate 2 Input B' },
      { pin: 6, name: 'Y2', type: 'OUTPUT', function: 'Gate 2 Output' },
      { pin: 7, name: 'GND', type: 'POWER', function: 'Ground' },
      { pin: 8, name: 'Y3', type: 'OUTPUT', function: 'Gate 3 Output' },
      { pin: 9, name: 'A3', type: 'INPUT', function: 'Gate 3 Input A' },
      { pin: 10, name: 'B3', type: 'INPUT', function: 'Gate 3 Input B' },
      { pin: 11, name: 'Y4', type: 'OUTPUT', function: 'Gate 4 Output' },
      { pin: 12, name: 'A4', type: 'INPUT', function: 'Gate 4 Input A' },
      { pin: 13, name: 'B4', type: 'INPUT', function: 'Gate 4 Input B' },
      { pin: 14, name: 'VCC', type: 'POWER', function: 'Positive Supply' }
    ],
    truthTable: [
      {
        inputs: { A1: false, B1: false },
        outputs: { Y1: true },
        description: 'NAND gate 1: 0 NAND 0 = 1'
      },
      {
        inputs: { A1: false, B1: true },
        outputs: { Y1: true },
        description: 'NAND gate 1: 0 NAND 1 = 1'
      },
      {
        inputs: { A1: true, B1: false },
        outputs: { Y1: true },
        description: 'NAND gate 1: 1 NAND 0 = 1'
      },
      {
        inputs: { A1: true, B1: true },
        outputs: { Y1: false },
        description: 'NAND gate 1: 1 NAND 1 = 0'
      }
    ]
  },
  // 7474: Dual D-Type Positive-Edge-Triggered Flip-Flops
  '7474': {
    partNumber: '7474',
    type: 'sequential',
    clockPin: 3, // CLK pin number
    supportedFrequencies: [1000, 2000, 4000, 8000], // 1KHz to 8KHz
    inputs: ['D1', 'CLK1', 'SET1', 'RST1', 'D2', 'CLK2', 'SET2', 'RST2'],
    outputs: ['Q1', 'Q1_BAR', 'Q2', 'Q2_BAR'],
    pinConfiguration: [
      { pin: 1, name: 'CLR1', type: 'INPUT', function: 'Clear 1 (active low)' },
      { pin: 2, name: 'D1', type: 'INPUT', function: 'Data Input 1' },
      { pin: 3, name: 'CLK1', type: 'INPUT', function: 'Clock 1' },
      { pin: 4, name: 'PRE1', type: 'INPUT', function: 'Preset 1 (active low)' },
      { pin: 5, name: 'Q1', type: 'OUTPUT', function: 'Output 1' },
      { pin: 6, name: 'Q1_BAR', type: 'OUTPUT', function: 'Output 1 Complement' },
      { pin: 7, name: 'GND', type: 'POWER', function: 'Ground' },
      { pin: 8, name: 'Q2_BAR', type: 'OUTPUT', function: 'Output 2 Complement' },
      { pin: 9, name: 'Q2', type: 'OUTPUT', function: 'Output 2' },
      { pin: 10, name: 'PRE2', type: 'INPUT', function: 'Preset 2 (active low)' },
      { pin: 11, name: 'CLK2', type: 'INPUT', function: 'Clock 2' },
      { pin: 12, name: 'D2', type: 'INPUT', function: 'Data Input 2' },
      { pin: 13, name: 'CLR2', type: 'INPUT', function: 'Clear 2 (active low)' },
      { pin: 14, name: 'VCC', type: 'POWER', function: 'Positive Supply' }
    ],
    truthTable: [
      {
        inputs: { D1: false, CLK1: true, SET1: true, RST1: true },
        outputs: { Q1: false, Q1_BAR: true },
        description: 'FF1: D=0, Rising edge, Normal operation'
      },
      {
        inputs: { D1: true, CLK1: true, SET1: true, RST1: true },
        outputs: { Q1: true, Q1_BAR: false },
        description: 'FF1: D=1, Rising edge, Normal operation'
      },
      {
        inputs: { SET1: false, RST1: true },
        outputs: { Q1: true, Q1_BAR: false },
        description: 'FF1: Asynchronous SET'
      },
      {
        inputs: { SET1: true, RST1: false },
        outputs: { Q1: false, Q1_BAR: true },
        description: 'FF1: Asynchronous RESET'
      }
    ]
  }
};