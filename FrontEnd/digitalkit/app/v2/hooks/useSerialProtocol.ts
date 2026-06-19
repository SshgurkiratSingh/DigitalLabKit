"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STX = 0xaa;

export type RoleCode = 0 | 1 | 2 | 3 | 4 | 5;

export interface DebugLogEntry {
  id: string;
  timestamp: number;
  type: "sent" | "received" | "info" | "warning" | "error";
  message: string;
}

interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialPortWithInfo {
  port: SerialPort;
  info: SerialPortInfo;
}

interface StatusPinSnapshot {
  virtualIndex: number;
  role: RoleCode;
  level: 0 | 1;
}

export interface StatusFrameSnapshot {
  timeLow: number;
  pins: StatusPinSnapshot[];
}

interface AckFrame {
  refCmd: number;
  status: number;
}

interface SerialProtocolHook {
  isSupported: boolean;
  ports: SerialPortWithInfo[];
  selectedPort: SerialPortWithInfo | null;
  isConnecting: boolean;
  isConnected: boolean;
  logs: DebugLogEntry[];
  statusFrame: StatusFrameSnapshot | null;
  lastAck: AckFrame | null;
  lastSyncDump: Uint8Array | null;
  selectPort: (port: SerialPortWithInfo | null) => void;
  requestPort: () => Promise<void>;
  refreshPorts: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendSetRole: (virtualIndex: number, role: RoleCode) => Promise<void>;
  sendSetLevel: (virtualIndex: number, level: 0 | 1) => Promise<void>;
  sendClkConfig: (onMs: number, offMs: number) => Promise<void>;
  sendClkEnable: (enable: boolean) => Promise<void>;
  sendReset: () => Promise<void>;
  requestStatus: () => Promise<void>;
}

interface Serial {
  getPorts(): Promise<SerialPort[]>;
  requestPort(opts?: SerialPortRequestOptions): Promise<SerialPort>;
  addEventListener(type: "connect" | "disconnect", listener: (event: Event) => void): void;
  removeEventListener(type: "connect" | "disconnect", listener: (event: Event) => void): void;
}

interface SerialPortRequestOptions {
  filters?: Array<{ usbVendorId?: number; usbProductId?: number }>;
}

declare global {
  interface SerialPort {
    open(options: { baudRate: number }): Promise<void>;
    close(): Promise<void>;
    readable: ReadableStream<Uint8Array> | null;
    writable: WritableStream<Uint8Array> | null;
    getInfo(): SerialPortInfo;
  }

  interface Navigator {
    serial?: Serial;
  }
}

const CMD = {
  SET_ROLE: 0x01,
  SET_LEVEL: 0x02,
  CLK_CONFIG: 0x03,
  CLK_ENABLE: 0x04,
  RESET: 0x05,
  SYNC_REQUEST: 0x06,
  STATUS_REQUEST: 0x07,
  ACK: 0x80,
  STATUS_FRAME: 0x81,
  SYNC_DUMP: 0x82,
} as const;

const ACK_STATUS: Record<number, string> = {
  0x00: "OK",
  0x01: "BAD_PIN",
  0x02: "BAD_ROLE_OR_MATCH",
  0x03: "NOT_OUTPUT",
  0x04: "BAD_ARGS_OR_RANGE",
  0xff: "UNKNOWN_CMD",
};

const MAX_LOG_ENTRIES = 400;

const buildFrame = (cmd: number, payload: number[] = []): Uint8Array => {
  const len = payload.length;
  let sum = cmd + len;
  payload.forEach((byte) => {
    sum += byte;
  });
  const checksum = 0xff - (sum & 0xff);
  const frame = new Uint8Array(4 + len);
  frame[0] = STX;
  frame[1] = cmd;
  frame[2] = len;
  payload.forEach((byte, idx) => (frame[3 + idx] = byte));
  frame[3 + len] = checksum;
  return frame;
};

const appendLog = (
  prev: DebugLogEntry[],
  entry: Omit<DebugLogEntry, "id" | "timestamp">
) => {
  const next = [
    ...prev,
    {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...entry,
    },
  ];
  if (next.length > MAX_LOG_ENTRIES) {
    return next.slice(next.length - MAX_LOG_ENTRIES);
  }
  return next;
};

export function useSerialProtocol(): SerialProtocolHook {
  const isSupported = typeof navigator !== "undefined" && !!navigator.serial;
  const [ports, setPorts] = useState<SerialPortWithInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState<SerialPortWithInfo | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [statusFrame, setStatusFrame] = useState<StatusFrameSnapshot | null>(null);
  const [lastAck, setLastAck] = useState<AckFrame | null>(null);
  const [lastSyncDump, setLastSyncDump] = useState<Uint8Array | null>(null);

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const bufferRef = useRef<Uint8Array>(new Uint8Array());
  const disconnectingRef = useRef(false);

  const refreshPorts = useCallback(async () => {
    if (!isSupported || !navigator.serial) return;
    const found = await navigator.serial.getPorts();
    setPorts(found.map((port) => ({ port, info: port.getInfo() })));
  }, [isSupported]);

  const requestPort = useCallback(async () => {
    if (!isSupported || !navigator.serial) {
      throw new Error("Web Serial API not available");
    }
    const port = await navigator.serial.requestPort();
    const entry = { port, info: port.getInfo() };
    setPorts((prev) => {
      const exists = prev.some((p) => p.port === port);
      return exists ? prev : [...prev, entry];
    });
    setSelectedPort(entry);
  }, [isSupported]);

  const closePort = useCallback(async () => {
    disconnectingRef.current = true;
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        await readerRef.current.releaseLock();
      }
    } catch (error) {
      console.warn("Reader release failed", error);
    } finally {
      readerRef.current = null;
    }

    try {
      if (writerRef.current) {
        await writerRef.current.close();
        await writerRef.current.releaseLock();
      }
    } catch (error) {
      console.warn("Writer release failed", error);
    } finally {
      writerRef.current = null;
    }

    if (selectedPort?.port) {
      try {
        await selectedPort.port.close();
      } catch (error) {
        console.warn("Port close failed", error);
      }
    }
    disconnectingRef.current = false;
  }, [selectedPort]);

  const handleAck = useCallback((payload: Uint8Array) => {
    if (payload.length < 2) return;
    const frame: AckFrame = { refCmd: payload[0], status: payload[1] };
    setLastAck(frame);
    const desc = ACK_STATUS[frame.status] || `0x${frame.status.toString(16)}`;
    setLogs((prev) => appendLog(prev, {
      type: frame.status === 0x00 ? "info" : "warning",
      message: `ACK for 0x${frame.refCmd.toString(16)} => ${desc}`,
    }));
  }, []);

  const handleStatusFrame = useCallback((payload: Uint8Array) => {
    if (payload.length < 17) return;
    const timeLow = payload[0];
    const pins: StatusPinSnapshot[] = [];
    for (let i = 1; i <= 16; i += 1) {
      const raw = payload[i];
      const role = (raw & 0x0f) as RoleCode;
      const level = ((raw >> 4) & 0x01) as 0 | 1;
      pins.push({ virtualIndex: i - 1, role, level });
    }
    const snapshot: StatusFrameSnapshot = { timeLow, pins };
    setStatusFrame(snapshot);
    setLogs((prev) => appendLog(prev, {
      type: "received",
      message: `STATUS frame @${timeLow} (pins updated)`,
    }));
  }, []);

  const handleSyncDump = useCallback((payload: Uint8Array) => {
    setLastSyncDump(payload);
    setLogs((prev) => appendLog(prev, {
      type: "received",
      message: `SYNC dump (${payload.length} bytes)`,
    }));
  }, []);

  const processFrame = useCallback(
    (cmd: number, payload: Uint8Array) => {
      switch (cmd) {
        case CMD.ACK:
          handleAck(payload);
          break;
        case CMD.STATUS_FRAME:
          handleStatusFrame(payload);
          break;
        case CMD.SYNC_DUMP:
          handleSyncDump(payload);
          break;
        default:
          setLogs((prev) => appendLog(prev, {
            type: "warning",
            message: `Unknown frame CMD 0x${cmd.toString(16)} (${payload.length} bytes)`,
          }));
      }
    },
    [handleAck, handleStatusFrame, handleSyncDump]
  );

  const parseStream = useCallback(
    (chunk: Uint8Array) => {
      const buffer = new Uint8Array(bufferRef.current.length + chunk.length);
      buffer.set(bufferRef.current, 0);
      buffer.set(chunk, bufferRef.current.length);
      let offset = 0;
      while (offset + 4 <= buffer.length) {
        if (buffer[offset] !== STX) {
          offset += 1;
          continue;
        }
        const cmd = buffer[offset + 1];
        const len = buffer[offset + 2];
        const total = 4 + len;
        if (offset + total > buffer.length) break;
        const payload = buffer.slice(offset + 3, offset + 3 + len);
        const checksum = buffer[offset + 3 + len];
        let sum = cmd + len;
        payload.forEach((byte) => {
          sum += byte;
        });
        const expected = 0xff - (sum & 0xff);
        if (checksum === expected) {
          processFrame(cmd, payload);
        } else {
          setLogs((prev) => appendLog(prev, {
            type: "warning",
            message: `Checksum mismatch for CMD 0x${cmd.toString(16)}`,
          }));
        }
        offset += total;
      }
      bufferRef.current = buffer.slice(offset);
    },
    [processFrame]
  );

  const readLoop = useCallback(async () => {
    if (!readerRef.current) return;
    try {
      while (true) {
        const { value, done } = await readerRef.current.read();
        if (done || !value) break;
        parseStream(value);
      }
    } catch (error) {
      if (!disconnectingRef.current) {
        setLogs((prev) =>
          appendLog(prev, { type: "error", message: `Reader error: ${error}` })
        );
      }
    } finally {
      try {
        await readerRef.current?.releaseLock();
      } catch (error) {
        console.warn("Failed to release reader lock", error);
      }
      readerRef.current = null;
      if (isConnected && !disconnectingRef.current) {
        setLogs((prev) =>
          appendLog(prev, { type: "warning", message: "Reader closed unexpectedly" })
        );
        setIsConnected(false);
      }
    }
  }, [parseStream, isConnected]);

  const connect = useCallback(async () => {
    if (!selectedPort) throw new Error("No port selected");
    setIsConnecting(true);
    try {
      await selectedPort.port.open({ baudRate: 115200 });
      if (selectedPort.port.writable) {
        writerRef.current = selectedPort.port.writable.getWriter();
      }
      if (selectedPort.port.readable) {
        readerRef.current = selectedPort.port.readable.getReader();
        readLoop();
      }
      setIsConnected(true);
      setLogs((prev) =>
        appendLog(prev, { type: "info", message: "Connected to serial node" })
      );
    } catch (err) {
      setLogs((prev) =>
        appendLog(prev, {
          type: "error",
          message: `Failed to connect: ${err}`,
        })
      );
      await closePort();
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, [selectedPort, closePort, readLoop]);

  const disconnect = useCallback(async () => {
    await closePort();
    setIsConnected(false);
    setLogs((prev) => appendLog(prev, { type: "info", message: "Disconnected" }));
  }, [closePort]);

  const writeFrame = useCallback(async (cmd: number, payload: number[] = []) => {
    if (!writerRef.current) throw new Error("Writer unavailable");
    const frame = buildFrame(cmd, payload);
    await writerRef.current.write(frame);
    setLogs((prev) => appendLog(prev, { type: "sent", message: `CMD 0x${cmd.toString(16)} => ${Array.from(frame).map((b) => b.toString(16).padStart(2, "0")).join(" ")}` }));
  }, []);

  const sendSetRole = useCallback(
    async (virtualIndex: number, role: RoleCode) => {
      await writeFrame(CMD.SET_ROLE, [virtualIndex, role]);
    },
    [writeFrame]
  );

  const sendSetLevel = useCallback(
    async (virtualIndex: number, level: 0 | 1) => {
      await writeFrame(CMD.SET_LEVEL, [virtualIndex, level]);
    },
    [writeFrame]
  );

  const sendClkConfig = useCallback(
    async (onMs: number, offMs: number) => {
      const onL = onMs & 0xff;
      const onH = (onMs >> 8) & 0xff;
      const offL = offMs & 0xff;
      const offH = (offMs >> 8) & 0xff;
      await writeFrame(CMD.CLK_CONFIG, [onL, onH, offL, offH]);
    },
    [writeFrame]
  );

  const sendClkEnable = useCallback(
    async (enable: boolean) => {
      await writeFrame(CMD.CLK_ENABLE, [enable ? 1 : 0]);
    },
    [writeFrame]
  );

  const sendReset = useCallback(async () => {
    await writeFrame(CMD.RESET);
  }, [writeFrame]);

  const requestStatus = useCallback(async () => {
    await writeFrame(CMD.STATUS_REQUEST);
  }, [writeFrame]);

  useEffect(() => {
    if (!navigator.serial) return;
    const handleConnect = () => refreshPorts();
    const handleDisconnect = () => refreshPorts();
    navigator.serial.addEventListener("connect", handleConnect);
    navigator.serial.addEventListener("disconnect", handleDisconnect);
    refreshPorts();
    return () => {
      navigator.serial?.removeEventListener("connect", handleConnect);
      navigator.serial?.removeEventListener("disconnect", handleDisconnect);
    };
  }, [refreshPorts]);

  useEffect(() => {
    return () => {
      closePort();
    };
  }, [closePort]);

  const selectPort = useCallback((entry: SerialPortWithInfo | null) => {
    setSelectedPort(entry);
  }, []);

  return {
    isSupported,
    ports,
    selectedPort,
    isConnecting,
    isConnected,
    logs,
    statusFrame,
    lastAck,
    lastSyncDump,
    selectPort,
    requestPort,
    refreshPorts,
    connect,
    disconnect,
    sendSetRole,
    sendSetLevel,
    sendClkConfig,
    sendClkEnable,
    sendReset,
    requestStatus,
  };
}
