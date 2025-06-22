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

export interface DebugLogEntry {
  timestamp: string;
  type: "received" | "sent" | "info" | "error" | "warning";
  message: string;
}

export interface PinState {
  [key: number]: boolean;
}

export interface ConnectionStatus {
  isConnected: boolean;
  error: string | null;
}