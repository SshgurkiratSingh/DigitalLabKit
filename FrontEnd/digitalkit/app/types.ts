// Define Web Serial API types
export interface SerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

export interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

export interface Serial extends EventTarget {
  getPorts(): Promise<SerialPort[]>;
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
  addEventListener(
    type: "connect" | "disconnect",
    listener: (event: Event) => void
  ): void;
  removeEventListener(
    type: "connect" | "disconnect",
    listener: (event: Event) => void
  ): void;
}

export interface SerialPortRequestOptions {
  filters?: Array<{
    usbVendorId?: number;
    usbProductId?: number;
  }>;
}

export interface SerialPortInfoWrapper {
  port: SerialPort;
  info: SerialPortInfo;
}

export interface ICData {
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
}

export interface MainInterfaceProps { // Renamed from SerialPortInterfaceProps
  onICSelect?: (ic: ICData | null) => void;
}

// LogEntry interface moved from DebugLog.tsx
export interface LogEntry {
  timestamp: string;
  // Extended to include 'warning' as it was used in SerialPortInterface's DebugLogEntry
  type: "received" | "sent" | "info" | "error" | "warning";
  message: string;
}
