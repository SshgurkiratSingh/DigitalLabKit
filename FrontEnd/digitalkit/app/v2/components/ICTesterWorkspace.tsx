"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useICLibrary, ICDefinition } from "../hooks/useICLibrary";
import {
  DebugLogEntry,
  RoleCode,
  StatusFrameSnapshot,
  useSerialProtocol,
} from "../hooks/useSerialProtocol";
import { PinAssignment, buildAssignments } from "../utils/pinMapping";

const MAX_PINS = 16;
const ROLE_LABELS: Record<RoleCode, string> = {
  0: "Sense (IC output)",
  1: "Drive (IC input)",
  2: "Ground",
  3: "VCC",
  4: "Unused",
  5: "Clock",
};

const ROLE_COLORS: Record<RoleCode, string> = {
  0: "bg-slate-600",
  1: "bg-emerald-600",
  2: "bg-neutral-800",
  3: "bg-amber-600",
  4: "bg-gray-500",
  5: "bg-indigo-600",
};

interface TruthRow {
  id: number;
  inputs: Array<{ name: string; level: 0 | 1 }>;
  outputs: Array<{ name: string; level: 0 | 1 }>;
  description?: string;
}

const normalizeLevel = (value: unknown): 0 | 1 => {
  if (typeof value === "number") return value ? 1 : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string")
    return value === "1" || value.toUpperCase() === "HIGH" ? 1 : 0;
  return 0;
};

const formatTimestamp = (entry: DebugLogEntry) =>
  new Date(entry.timestamp).toLocaleTimeString();

type PinStateMap = Partial<Record<number, 0 | 1>>;

type PinNameMap = Record<string, number>;

type VirtualLookup = Record<number, PinAssignment>;

const buildVirtualLookup = (assignments: PinAssignment[]): VirtualLookup => {
  return assignments.reduce<VirtualLookup>((acc, assignment) => {
    acc[assignment.virtualIndex] = assignment;
    return acc;
  }, {} as VirtualLookup);
};

const useTruthTable = (ic: ICDefinition | null): TruthRow[] => {
  return useMemo(() => {
    if (!ic?.functional?.truthTable) return [];
    const inputPins = ic.pinConfiguration.filter((pin) => pin.type === "INPUT");
    const outputPins = ic.pinConfiguration.filter(
      (pin) => pin.type === "OUTPUT"
    );

    return ic.functional.truthTable.map((rawEntry, idx) => {
      const entry = rawEntry as Record<string, unknown>;
      const rawInputs = entry.inputs as unknown;
      const rawOutputs = entry.outputs as Record<string, unknown> | undefined;
      const inputs: Array<{ name: string; level: 0 | 1 }> = [];
      const outputs: Array<{ name: string; level: 0 | 1 }> = [];

      if (Array.isArray(rawInputs)) {
        inputPins.forEach((pin, pinIdx) => {
          if (pinIdx < rawInputs.length) {
            inputs.push({
              name: pin.name,
              level: normalizeLevel(rawInputs[pinIdx]),
            });
          }
        });
      } else if (rawInputs && typeof rawInputs === "object") {
        inputPins.forEach((pin) => {
          if (pin.name in (rawInputs as Record<string, unknown>)) {
            inputs.push({
              name: pin.name,
              level: normalizeLevel(
                (rawInputs as Record<string, unknown>)[pin.name]
              ),
            });
          }
        });
      }

      if (typeof entry.output === "number") {
        const fallback = outputPins[0];
        if (fallback)
          outputs.push({
            name: fallback.name,
            level: normalizeLevel(entry.output),
          });
      }

      if (rawOutputs && typeof rawOutputs === "object") {
        outputPins.forEach((pin) => {
          if (pin.name in rawOutputs) {
            outputs.push({
              name: pin.name,
              level: normalizeLevel(rawOutputs[pin.name]),
            });
          }
        });
      }

      return {
        id: idx,
        inputs,
        outputs,
        description: entry.description as string | undefined,
      };
    });
  }, [ic]);
};

const PinLegend = () => (
  <div className="flex flex-wrap gap-3 text-xs">
    {Object.keys(ROLE_LABELS).map((key) => {
      const role = Number(key) as RoleCode;
      return (
        <div key={role} className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${ROLE_COLORS[role]}`} />
          <span className="text-gray-300">{ROLE_LABELS[role]}</span>
        </div>
      );
    })}
  </div>
);

const resolveDatasheetUrl = (ic: ICDefinition): string | null => {
  const anyIC = ic as Record<string, unknown>;
  const direct = (anyIC["datasheet"] || anyIC["DS"]) as string | undefined;
  if (direct) {
    if (direct.startsWith("http")) return direct;
    const normalized = direct.startsWith("/") ? direct : `/datasheet/${direct}`;
    return normalized;
  }
  return `/datasheet/${ic.partNumber}.pdf`;
};

const useICPictures = (ic: ICDefinition | null) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!ic) {
      setSrc(null);
      return;
    }
    const candidates = [
      `/ic_img/${ic.partNumber}.png`,
      `/ic_img/${ic.partNumber}.jpg`,
      `/ic_img/${ic.partNumber}.jpeg`,
      `/ic_img/${ic.partNumber}.webp`,
    ];
    let cancelled = false;
    const tryLoad = async () => {
      for (const path of candidates) {
        try {
          const response = await fetch(path, { method: "HEAD" });
          if (!cancelled && response.ok) {
            setSrc(path);
            return;
          }
        } catch {
          // ignore
        }
      }
      if (!cancelled) setSrc(null);
    };
    tryLoad();
    return () => {
      cancelled = true;
    };
  }, [ic]);
  return src;
};

const PinButton = ({
  assignment,
  level,
  disabled,
  onClick,
}: {
  assignment: PinAssignment;
  level: 0 | 1;
  disabled: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col items-center justify-center rounded-md border border-gray-600 px-2 py-3 text-xs transition
        ${ROLE_COLORS[assignment.role]} ${
        disabled ? "opacity-60 cursor-not-allowed" : "hover:border-white"
      }`}
    >
      <span className="text-sm font-semibold">Pin {assignment.icPin}</span>
      <span className="text-white font-bold">{assignment.name}</span>
      <span className="text-gray-200">{ROLE_LABELS[assignment.role]}</span>
      <span className="mt-1 text-xs font-mono">{level ? "HIGH" : "LOW"}</span>
    </button>
  );
};

const LogPanel = ({ logs }: { logs: DebugLogEntry[] }) => (
  <div className="h-72 overflow-y-auto rounded-md border border-gray-700 bg-black/40 p-3 text-xs font-mono">
    {logs.length === 0 ? (
      <p className="text-gray-500">No logs yet</p>
    ) : (
      logs
        .slice()
        .reverse()
        .map((entry) => (
          <div key={entry.id} className="mb-1">
            <span className="text-teal-300">[{formatTimestamp(entry)}]</span>
            <span className="ml-2 uppercase text-gray-400">{entry.type}</span>
            <span className="ml-2 text-white">{entry.message}</span>
          </div>
        ))
    )}
  </div>
);

const TruthTable = ({
  rows,
  getPinLevel,
  onApply,
}: {
  rows: TruthRow[];
  getPinLevel: (pinName: string) => 0 | 1 | undefined;
  onApply: (row: TruthRow) => void;
}) => {
  if (!rows.length) {
    return (
      <p className="text-sm text-gray-400">
        No truth table data available for this IC.
      </p>
    );
  }

  const inputHeaders = rows[0]?.inputs.map((input) => input.name) ?? [];
  const outputHeaders = rows[0]?.outputs.map((output) => output.name) ?? [];

  const isRowPass = (row: TruthRow) => {
    return row.outputs.every((output) => {
      const liveLevel = getPinLevel(output.name);
      return liveLevel !== undefined && liveLevel === output.level;
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-700 text-sm">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left text-gray-400">#</th>
            {inputHeaders.map((header) => (
              <th key={header} className="px-2 py-1 text-center text-blue-300">
                {header}
              </th>
            ))}
            {outputHeaders.map((header) => (
              <th key={header} className="px-2 py-1 text-center text-amber-300">
                {header}
              </th>
            ))}
            <th className="px-2 py-1 text-right text-gray-400">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {rows.map((row) => (
            <tr
              key={row.id}
              className={
                isRowPass(row) ? "bg-emerald-900/20" : "bg-transparent"
              }
            >
              <td className="px-2 py-1 text-xs text-gray-500">{row.id + 1}</td>
              {row.inputs.map((input) => (
                <td
                  key={`${row.id}-${input.name}`}
                  className="px-2 py-1 text-center font-mono text-blue-200"
                >
                  {input.level}
                </td>
              ))}
              {row.outputs.map((output) => (
                <td
                  key={`${row.id}-${output.name}`}
                  className="px-2 py-1 text-center font-mono text-amber-200"
                >
                  {output.level}
                </td>
              ))}
              <td className="px-2 py-1 text-right">
                <button
                  type="button"
                  onClick={() => onApply(row)}
                  className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500"
                >
                  Drive inputs
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const DatasheetModal = ({
  url,
  zoom,
  onZoomChange,
  onClose,
}: {
  url: string;
  zoom: number;
  onZoomChange: (value: number) => void;
  onClose: () => void;
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
    <div className="relative flex h-[90vh] w-full max-w-5xl flex-col rounded-xl bg-gray-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2 text-sm text-gray-200">
        <div>
          <p className="font-semibold">Datasheet Viewer</p>
          <p className="text-xs text-gray-400">{url}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-400">
            Zoom
            <input
              type="range"
              min={0.75}
              max={2}
              step={0.05}
              value={zoom}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onZoomChange(Number(event.target.value))
              }
            />
            <span className="w-10 text-right text-gray-200">
              {Math.round(zoom * 100)}%
            </span>
          </label>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-600 px-3 py-1 text-xs text-gray-200 hover:bg-gray-800"
          >
            Close
          </button>
        </div>
      </div>
      <div className="relative flex-1 overflow-auto bg-black">
        <div
          className="h-full"
          style={{
            width: `${zoom * 100}%`,
            minWidth: "100%",
          }}
        >
          <iframe src={url} className="h-full w-full" title="Datasheet" />
        </div>
      </div>
    </div>
  </div>
);

const ImageModal = ({
  src,
  partNumber,
  zoom,
  onZoomChange,
  onClose,
}: {
  src: string;
  partNumber: string;
  zoom: number;
  onZoomChange: (value: number) => void;
  onClose: () => void;
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
    <div className="relative flex h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-gray-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-900 px-4 py-2 text-sm text-gray-200">
        <p className="font-semibold">{partNumber} Package Preview</p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-400">
            Zoom
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.05}
              value={zoom}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onZoomChange(Number(event.target.value))
              }
            />
            <span className="w-10 text-right text-gray-200">
              {Math.round(zoom * 100)}%
            </span>
          </label>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-600 px-3 py-1 text-xs text-gray-200 hover:bg-gray-800"
          >
            Close
          </button>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center bg-black">
        <img
          src={src}
          alt={`${partNumber} package`}
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "center center",
          }}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    </div>
  </div>
);

const ICTesterWorkspace = () => {
  const { ics, loading, error } = useICLibrary();
  const {
    isSupported,
    ports,
    selectedPort,
    selectPort,
    requestPort,
    refreshPorts,
    connect,
    disconnect,
    isConnecting,
    isConnected,
    logs,
    statusFrame,
    lastAck,
    lastSyncDump,
    sendSetLevel,
    sendSetRole,
    sendClkConfig,
    sendClkEnable,
    sendReset,
    requestStatus,
  } = useSerialProtocol();

  const [selectedIC, setSelectedIC] = useState<ICDefinition | null>(null);
  const [pinStates, setPinStates] = useState<PinStateMap>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [clockHz, setClockHz] = useState(1000);
  const [clockEnabled, setClockEnabled] = useState(false);
  const [roleAssigning, setRoleAssigning] = useState(false);
  const [isDatasheetModalOpen, setDatasheetModalOpen] = useState(false);
  const [datasheetZoom, setDatasheetZoom] = useState(1);
  const [isImageModalOpen, setImageModalOpen] = useState(false);
  const [imageModalZoom, setImageModalZoom] = useState(1);

  const assignments = useMemo(() => buildAssignments(selectedIC), [selectedIC]);
  const virtualLookup = useMemo(
    () => buildVirtualLookup(assignments),
    [assignments]
  );

  const virtualRoles = useMemo<RoleCode[]>(() => {
    const roles: RoleCode[] = Array(MAX_PINS).fill(4) as RoleCode[];
    assignments.forEach((assignment) => {
      roles[assignment.virtualIndex] = assignment.role;
    });
    return roles;
  }, [assignments]);

  useEffect(() => {
    if (!statusFrame || !selectedIC) return;
    setPinStates((prev) => {
      const next = { ...prev };
      statusFrame.pins.forEach((pin) => {
        const assignment = virtualLookup[pin.virtualIndex];
        if (assignment) {
          next[assignment.icPin] = pin.level;
        }
      });
      return next;
    });
  }, [statusFrame, virtualLookup, selectedIC]);

  useEffect(() => {
    setDatasheetModalOpen(false);
    setImageModalOpen(false);
    setDatasheetZoom(1);
    setImageModalZoom(1);
  }, [selectedIC]);

  useEffect(() => {
    if (!isConnected || !selectedIC) return;
    let disposed = false;
    const configureRoles = async () => {
      setRoleAssigning(true);
      try {
        await sendReset();
        for (let idx = 0; idx < MAX_PINS; idx += 1) {
          await sendSetRole(idx, virtualRoles[idx] ?? 4);
        }
        await requestStatus();
      } catch (err) {
        console.error("Role assignment failed", err);
      } finally {
        if (!disposed) {
          setRoleAssigning(false);
        }
      }
    };
    configureRoles();
    return () => {
      disposed = true;
    };
  }, [
    isConnected,
    selectedIC,
    virtualRoles,
    sendReset,
    sendSetRole,
    requestStatus,
  ]);

  const filteredICs = useMemo(() => {
    if (!searchTerm) return ics;
    return ics.filter(
      (ic) =>
        ic.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ic.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [ics, searchTerm]);

  const handlePinToggle = async (assignment: PinAssignment) => {
    if (!isConnected) return;
    if (![1, 5].includes(assignment.role)) return;
    const nextLevel = (pinStates[assignment.icPin] ?? 0 ? 0 : 1) as 0 | 1;
    setPinStates((prev) => ({ ...prev, [assignment.icPin]: nextLevel }));
    try {
      await sendSetLevel(assignment.virtualIndex, nextLevel);
    } catch (err) {
      console.error("Failed to set level", err);
    }
  };

  const handleClockUpdate = async () => {
    if (!isConnected) return;
    const safeHz = Math.max(1, Math.min(clockHz, 100000));
    const periodMs = Math.max(1, Math.round(1000 / safeHz));
    const onMs = Math.max(1, Math.round(periodMs / 2));
    const offMs = Math.max(1, periodMs - onMs);
    await sendClkConfig(onMs, offMs);
    await sendClkEnable(clockEnabled);
  };

  const truthRows = useTruthTable(selectedIC);

  const pinNameToNumber: PinNameMap = useMemo(() => {
    const map: PinNameMap = {};
    selectedIC?.pinConfiguration.forEach((pin) => {
      map[pin.name] = pin.pin;
    });
    return map;
  }, [selectedIC]);

  const applyTruthRow = async (row: TruthRow) => {
    if (!isConnected || !selectedIC) return;
    for (const input of row.inputs) {
      const pinNumber = pinNameToNumber[input.name];
      if (!pinNumber) continue;
      const assignment = assignments.find((item) => item.icPin === pinNumber);
      if (!assignment || ![1, 5].includes(assignment.role)) continue;
      await sendSetLevel(assignment.virtualIndex, input.level);
      setPinStates((prev) => ({ ...prev, [pinNumber]: input.level }));
    }
  };

  const statusSummary = (frame: StatusFrameSnapshot | null) => {
    if (!frame) return "No status";
    const highPins = frame.pins.filter((pin) => pin.level === 1).length;
    return `${highPins} pins HIGH • Timer ${frame.timeLow}`;
  };

  const datasheetUrl = selectedIC ? resolveDatasheetUrl(selectedIC) : null;
  const icImageSrc = useICPictures(selectedIC);

  const openDatasheet = () => {
    if (datasheetUrl) window.open(datasheetUrl, "_blank");
  };

  if (!isSupported) {
    return (
      <div className="rounded-md border border-red-500 bg-red-900/30 p-6 text-red-100">
        Your browser does not support the Web Serial API. Please use Chrome,
        Edge, or another compatible browser.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <section className="rounded-lg border border-gray-700 bg-gray-900/50 p-5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Serial Node Connection
              </h2>
              <p className="text-sm text-gray-400">
                Configure and monitor your IC node.
              </p>
              <p className="text-xs text-gray-500">
                {statusSummary(statusFrame)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refreshPorts}
                className="rounded border border-gray-600 px-3 py-1 text-sm text-gray-200 hover:bg-gray-800"
              >
                Refresh Ports
              </button>
              <button
                type="button"
                onClick={requestPort}
                className="rounded border border-blue-600 px-3 py-1 text-sm text-blue-100 hover:bg-blue-600/40"
              >
                Request Access
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-[2fr_1fr]">
            <div>
              <label className="text-sm text-gray-300">Available Ports</label>
              <select
                className="mt-1 w-full rounded border border-gray-600 bg-gray-800 p-2 text-sm text-white"
                value={
                  selectedPort
                    ? `${selectedPort.info.usbVendorId ?? "na"}-${
                        selectedPort.info.usbProductId ?? "na"
                      }`
                    : ""
                }
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) {
                    selectPort(null);
                    return;
                  }
                  const match = ports.find(
                    (entry) =>
                      `${entry.info.usbVendorId ?? "na"}-${
                        entry.info.usbProductId ?? "na"
                      }` === value
                  );
                  selectPort(match ?? null);
                }}
              >
                <option value="">Select port</option>
                {ports.map((entry) => {
                  const optionValue = `${entry.info.usbVendorId ?? "na"}-${
                    entry.info.usbProductId ?? "na"
                  }`;
                  return (
                    <option key={optionValue} value={optionValue}>
                      VID {entry.info.usbVendorId ?? "?"} / PID{" "}
                      {entry.info.usbProductId ?? "?"}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={isConnected ? disconnect : connect}
                disabled={!selectedPort && !isConnected}
                className={`flex-1 rounded px-3 py-2 text-sm font-semibold text-white ${
                  isConnected
                    ? "bg-red-600 hover:bg-red-500"
                    : "bg-emerald-600 hover:bg-emerald-500"
                } ${
                  !selectedPort && !isConnected
                    ? "opacity-60 cursor-not-allowed"
                    : ""
                }`}
              >
                {isConnected
                  ? "Disconnect"
                  : isConnecting
                  ? "Connecting…"
                  : "Connect"}
              </button>
              <button
                type="button"
                onClick={requestStatus}
                disabled={!isConnected}
                className="rounded border border-gray-600 px-3 py-2 text-sm text-gray-100 hover:bg-gray-800 disabled:opacity-40"
              >
                Force Status
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm text-gray-300">Clock (Hz)</label>
              <div className="mt-1 flex gap-3">
                <input
                  type="number"
                  className="w-32 rounded border border-gray-600 bg-gray-800 p-2 text-sm text-white"
                  value={clockHz}
                  min={1}
                  max={100000}
                  onChange={(event) => setClockHz(Number(event.target.value))}
                />
                <label className="flex items-center gap-2 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={clockEnabled}
                    onChange={(event) => setClockEnabled(event.target.checked)}
                  />
                  Enable clock
                </label>
                <button
                  type="button"
                  onClick={handleClockUpdate}
                  disabled={!isConnected}
                  className="rounded bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-500 disabled:opacity-40"
                >
                  Apply
                </button>
              </div>
            </div>
            <div className="text-sm text-gray-400">
              <p>
                Last ACK:{" "}
                {lastAck
                  ? `CMD 0x${lastAck.refCmd.toString(
                      16
                    )} => 0x${lastAck.status.toString(16)}`
                  : "None"}
              </p>
              <p>Sync dump bytes: {lastSyncDump?.length ?? 0}</p>
              <p>
                Role assignment:{" "}
                {roleAssigning
                  ? "In progress"
                  : selectedIC
                  ? "Complete"
                  : "Select an IC"}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-gray-700 bg-gray-900/50 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">IC Library</h2>
              <p className="text-sm text-gray-400">
                Search across bundled 74xx definitions.
              </p>
            </div>
            <input
              type="text"
              placeholder="Search by part number or description"
              className="rounded border border-gray-600 bg-gray-800 p-2 text-sm text-white"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          {loading && (
            <p className="mt-4 text-sm text-gray-300">Loading ICs…</p>
          )}
          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
          {!loading && !error && (
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredICs.slice(0, 90).map((ic) => (
                <button
                  type="button"
                  key={ic.partNumber}
                  onClick={() => setSelectedIC(ic)}
                  className={`rounded border px-3 py-3 text-left text-sm transition ${
                    selectedIC?.partNumber === ic.partNumber
                      ? "border-blue-400 bg-blue-900/30"
                      : "border-gray-700 bg-gray-800 hover:border-gray-500"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-white">
                      {ic.partNumber}
                    </span>
                    <span className="text-xs text-gray-400">
                      {ic.pinCount} pins
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400 line-clamp-2">
                    {ic.description}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-gray-500">
                    {ic.category}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        {selectedIC && (
          <section className="rounded-lg border border-gray-700 bg-gray-900/50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {selectedIC.partNumber}
                </h2>
                <p className="text-sm text-gray-400">
                  {selectedIC.description}
                </p>
                <p className="text-xs text-gray-500">
                  {selectedIC.pinCount}-pin • {selectedIC.category}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 text-right md:flex-row md:items-center md:text-left">
                {datasheetUrl && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={openDatasheet}
                      className="rounded border border-amber-500 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/10"
                    >
                      Open Datasheet
                    </button>
                    <button
                      type="button"
                      onClick={() => setDatasheetModalOpen(true)}
                      className="rounded border border-blue-500 px-3 py-1 text-xs font-semibold text-blue-200 hover:bg-blue-500/10"
                    >
                      Preview
                    </button>
                  </div>
                )}
                <PinLegend />
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
              <div className="space-y-3 rounded border border-gray-800 bg-black/30 p-3 text-center">
                <div className="aspect-[3/2] overflow-hidden rounded bg-gray-900 flex items-center justify-center">
                  {icImageSrc ? (
                    <img
                      src={icImageSrc}
                      alt={`${selectedIC.partNumber} package`}
                      style={{
                        transform: `scale(${imageModalZoom})`,
                        transformOrigin: "center center",
                      }}
                      className="max-h-full max-w-full object-contain transition-transform"
                    />
                  ) : (
                    <span className="text-xs text-gray-500">
                      No package image available
                    </span>
                  )}
                </div>
                {icImageSrc && (
                  <div className="space-y-2 text-left text-xs text-gray-400">
                    <label className="flex items-center gap-2">
                      Zoom
                      <input
                        type="range"
                        min={0.5}
                        max={2.5}
                        step={0.05}
                        value={imageModalZoom}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          setImageModalZoom(Number(event.target.value))
                        }
                      />
                      <span className="w-10 text-right text-gray-200">
                        {Math.round(imageModalZoom * 100)}%
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setImageModalOpen(true)}
                      className="w-full rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800"
                    >
                      Open Image Viewer
                    </button>
                  </div>
                )}
                {datasheetUrl && (
                  <p className="text-[11px] text-gray-500">
                    Datasheet source:{" "}
                    {datasheetUrl.startsWith("http") ? "External" : "Local"}
                  </p>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {assignments.map((assignment) => (
                  <PinButton
                    key={assignment.icPin}
                    assignment={assignment}
                    level={(pinStates[assignment.icPin] ?? 0) as 0 | 1}
                    disabled={!isConnected || ![1, 5].includes(assignment.role)}
                    onClick={() => handlePinToggle(assignment)}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {selectedIC && (
          <section className="rounded-lg border border-gray-700 bg-gray-900/50 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Truth Table</h2>
              <span className="text-sm text-gray-400">
                Entries: {truthRows.length}
              </span>
            </div>
            <div className="mt-4">
              <TruthTable
                rows={truthRows}
                getPinLevel={(pinName) => {
                  const pinNumber = pinNameToNumber[pinName];
                  if (!pinNumber) return undefined;
                  return pinStates[pinNumber];
                }}
                onApply={applyTruthRow}
              />
            </div>
          </section>
        )}

        <section className="rounded-lg border border-gray-700 bg-gray-900/50 p-5">
          <h2 className="text-xl font-semibold text-white">Debug Log</h2>
          <p className="text-sm text-gray-400">Live protocol feed</p>
          <div className="mt-4">
            <LogPanel logs={logs} />
          </div>
        </section>
      </div>
      {isDatasheetModalOpen && datasheetUrl && (
        <DatasheetModal
          url={datasheetUrl}
          zoom={datasheetZoom}
          onZoomChange={setDatasheetZoom}
          onClose={() => setDatasheetModalOpen(false)}
        />
      )}
      {isImageModalOpen && icImageSrc && selectedIC && (
        <ImageModal
          src={icImageSrc}
          partNumber={selectedIC.partNumber}
          zoom={imageModalZoom}
          onZoomChange={setImageModalZoom}
          onClose={() => setImageModalOpen(false)}
        />
      )}
    </>
  );
};

export default ICTesterWorkspace;
