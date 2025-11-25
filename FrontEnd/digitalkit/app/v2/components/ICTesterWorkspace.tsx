"use client";

import Image from "next/image";
import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useICLibrary, ICDefinition } from "../hooks/useICLibrary";
import {
  DebugLogEntry,
  RoleCode,
  StatusFrameSnapshot,
  useSerialProtocol,
} from "../hooks/useSerialProtocol";
import { useMQTTBridge } from "../hooks/useMQTTBridge";
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
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (["1", "HIGH", "ON", "TRUE"].includes(normalized)) return 1;
    if (["0", "LOW", "OFF", "FALSE"].includes(normalized)) return 0;
    const parsed = Number(normalized);
    if (!Number.isNaN(parsed)) return parsed ? 1 : 0;
  }
  return 0;
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
  const levelGlow = level
    ? "border-emerald-400/80 shadow-[0_0_26px_rgba(16,185,129,0.45)]"
    : "border-slate-700 shadow-[0_0_18px_rgba(148,163,184,0.2)]";
  const levelGradient = level
    ? "bg-gradient-to-b from-emerald-500/25 via-emerald-600/10 to-gray-900"
    : "bg-gradient-to-b from-slate-900 via-gray-950 to-black";
  const levelBadge = level
    ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/40"
    : "bg-slate-800 text-slate-200 border border-slate-600/80";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col items-center justify-center rounded-2xl border px-4 py-5 text-xs transition duration-200 ${levelGlow} ${levelGradient} ${
        disabled ? "opacity-55 cursor-not-allowed" : "hover:-translate-y-0.5"
      }`}
    >
      <span className="text-[11px] uppercase tracking-[0.35em] text-gray-400">
        Pin {assignment.icPin}
      </span>
      <span className="mt-1 text-base font-semibold text-white">
        {assignment.name}
      </span>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
        <span
          className={`rounded-full px-2 py-0.5 text-white ${
            ROLE_COLORS[assignment.role]
          }`}
        >
          {ROLE_LABELS[assignment.role]}
        </span>
        <span className={`rounded-full px-2 py-0.5 ${levelBadge}`}>
          {level ? "HIGH" : "LOW"}
        </span>
      </div>
      <div
        className={`mt-3 h-1.5 w-full rounded-full bg-gray-800/70 transition-colors ${
          level
            ? "bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600"
            : "bg-gradient-to-r from-slate-700 via-slate-800 to-gray-900"
        }`}
      />
    </button>
  );
};

const formatTimestamp = (entry: DebugLogEntry) =>
  new Date(entry.timestamp).toLocaleTimeString();

type PinStateMap = Partial<Record<number, 0 | 1>>;

type PinNameMap = Record<string, number>;

type VirtualLookup = Record<number, PinAssignment>;

type PinStateOrigin = "serial" | "local" | "truth" | "mqtt";

const DEFAULT_BASE_TOPIC = "digitalkit/pins";
const MQTT_ECHO_WINDOW_MS = 800;
const MQTT_INPUT_BUFFER_MS = 300;

const sanitizeTopicBase = (value: string) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return DEFAULT_BASE_TOPIC;
  return trimmed.replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
};

const buildPinTopic = (base: string, pin: number) => {
  const root = sanitizeTopicBase(base);
  return `${root}/pin/${pin}`;
};

const buildMetadataTopic = (base: string) => {
  const root = sanitizeTopicBase(base);
  return `${root}/icName`;
};

const buildInputPinsTopic = (base: string) => {
  const root = sanitizeTopicBase(base);
  return `${root}/inputs`;
};

const buildOutputPinsTopic = (base: string) => {
  const root = sanitizeTopicBase(base);
  return `${root}/outputs`;
};

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

const PinFullscreenOverlay = ({
  ic,
  assignments,
  pinStates,
  isConnected,
  onTogglePin,
  onClose,
}: {
  ic: ICDefinition;
  assignments: PinAssignment[];
  pinStates: PinStateMap;
  isConnected: boolean;
  onTogglePin: (assignment: PinAssignment) => void | Promise<void>;
  onClose: () => void;
}) => {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-gray-950 via-black to-gray-950 text-white">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-gray-500">
            Fullscreen Pinboard
          </p>
          <p className="text-2xl font-semibold text-white">{ic.partNumber}</p>
          <p className="text-sm text-gray-400">
            {ic.pinCount}-pin • {ic.category}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-300">
          <span
            className={isConnected ? "text-emerald-300" : "text-orange-300"}
          >
            {isConnected ? "Serial link active" : "Serial link idle"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-600 px-3 py-1 text-sm font-semibold text-gray-200 hover:bg-gray-800"
          >
            Exit
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {assignments.map((assignment) => {
            const level = (pinStates[assignment.icPin] ?? 0) as 0 | 1;
            const canDrive = isConnected && [1, 5].includes(assignment.role);
            const levelGlow = level
              ? "border-emerald-400/80 shadow-[0_0_45px_rgba(16,185,129,0.45)]"
              : "border-slate-800 shadow-[0_0_28px_rgba(15,23,42,0.6)]";
            const levelGradient = level
              ? "bg-gradient-to-br from-emerald-500/20 via-emerald-600/10 to-gray-900"
              : "bg-gradient-to-br from-slate-900 via-black to-gray-950";
            const levelBadge = level
              ? "bg-emerald-500/15 text-emerald-200 border border-emerald-400/50"
              : "bg-slate-800/70 text-slate-200 border border-slate-600";
            const driveBadge = canDrive
              ? "border-emerald-400/50 text-emerald-200"
              : "border-amber-400/50 text-amber-200";
            return (
              <button
                key={assignment.icPin}
                type="button"
                onClick={() => onTogglePin(assignment)}
                disabled={!canDrive}
                className={`group relative flex h-full flex-col gap-3 rounded-3xl border px-5 py-6 text-left transition ${levelGlow} ${levelGradient} ${
                  canDrive
                    ? "hover:-translate-y-1 hover:border-white/70"
                    : "cursor-not-allowed opacity-60"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.35em] text-gray-400">
                  <span>Pin {assignment.icPin}</span>
                  <span className="text-gray-500">
                    V{assignment.virtualIndex.toString().padStart(2, "0")}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-2xl font-semibold text-white">
                    {assignment.name}
                  </p>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${levelBadge}`}
                  >
                    {level ? "HIGH" : "LOW"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
                  <span
                    className={`rounded-full px-2 py-0.5 text-white ${
                      ROLE_COLORS[assignment.role]
                    }`}
                  >
                    {ROLE_LABELS[assignment.role]}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 ${driveBadge}`}
                  >
                    {canDrive ? "Drive capable" : "Sense only"}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400">
                  {level ? "Signal asserted via board" : "Signal idle"}
                </p>
                <div
                  className={`mt-1 h-1.5 w-full rounded-full bg-white/10 transition-all ${
                    level
                      ? "bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600"
                      : "bg-gradient-to-r from-slate-700 via-slate-800 to-gray-900"
                  }`}
                />
              </button>
            );
          })}
        </div>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-gray-200">
          <p className="text-sm font-semibold text-white">Legend</p>
          <div className="mt-3">
            <PinLegend />
          </div>
          <p className="mt-3 text-[11px] text-gray-400">
            Only pins configured as Drive or Clock can be toggled while
            connected. Press Esc or the Exit button to leave fullscreen mode.
          </p>
        </div>
      </div>
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
        <div className="relative h-full w-full">
          <Image
            src={src}
            alt={`${partNumber} package`}
            fill
            sizes="(max-width: 1024px) 90vw, 600px"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "center center",
            }}
            className="object-contain"
          />
        </div>
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
  const [isPinFullscreen, setPinFullscreen] = useState(false);
  const [baseTopic, setBaseTopic] = useState(DEFAULT_BASE_TOPIC);
  const mqttDecoder = useMemo(() => new TextDecoder(), []);

  const {
    brokerUrl,
    setBrokerUrl,
    isEnabled: mqttEnabled,
    setEnabled: setMqttEnabled,
    status: mqttStatus,
    error: mqttError,
    lastMessage: mqttLastMessage,
    clientId,
    publish: publishMQTT,
    replaceSubscriptions,
  } = useMQTTBridge();

  const pinOriginsRef = useRef<Record<number, PinStateOrigin>>({});
  const prevPinStatesRef = useRef<PinStateMap>({});
  const lastPublishedRef = useRef<
    Record<string, { payload: string; timestamp: number }>
  >({});
  const lastMetadataPayloadRef = useRef<string | null>(null);
  const lastRolePayloadRef = useRef<{
    inputs: string | null;
    outputs: string | null;
  }>({
    inputs: null,
    outputs: null,
  });
  const mqttInputGateRef = useRef<Record<number, number>>({});

  const assignments = useMemo(() => buildAssignments(selectedIC), [selectedIC]);
  const virtualLookup = useMemo(
    () => buildVirtualLookup(assignments),
    [assignments]
  );
  const assignmentByPin = useMemo(() => {
    const map: Record<number, PinAssignment> = {};
    assignments.forEach((assignment) => {
      map[assignment.icPin] = assignment;
    });
    return map;
  }, [assignments]);

  const mqttTopicMap = useMemo(() => {
    if (!selectedIC) {
      return { topics: [], pinToTopic: {}, topicToPin: {} };
    }
    const pinToTopic: Record<number, string> = {};
    const topicToPin: Record<string, number> = {};
    const topics: string[] = [];
    assignments.forEach((assignment) => {
      const topic = buildPinTopic(baseTopic, assignment.icPin);
      pinToTopic[assignment.icPin] = topic;
      topicToPin[topic] = assignment.icPin;
      topics.push(topic);
    });
    return { topics, pinToTopic, topicToPin };
  }, [assignments, baseTopic, selectedIC]);
  const metadataTopic = useMemo(
    () => buildMetadataTopic(baseTopic),
    [baseTopic]
  );
  const inputPinsTopic = useMemo(
    () => buildInputPinsTopic(baseTopic),
    [baseTopic]
  );
  const outputPinsTopic = useMemo(
    () => buildOutputPinsTopic(baseTopic),
    [baseTopic]
  );

  const virtualRoles = useMemo<RoleCode[]>(() => {
    const roles: RoleCode[] = Array(MAX_PINS).fill(4) as RoleCode[];
    assignments.forEach((assignment) => {
      roles[assignment.virtualIndex] = assignment.role;
    });
    return roles;
  }, [assignments]);

  const icInputPins = useMemo(() => {
    return assignments
      .filter((assignment) => [1, 5].includes(assignment.role))
      .map((assignment) => assignment.icPin);
  }, [assignments]);

  const icOutputPins = useMemo(() => {
    return assignments
      .filter((assignment) => assignment.role === 0)
      .map((assignment) => assignment.icPin);
  }, [assignments]);

  const setPinLevel = useCallback(
    (pinNumber: number, level: 0 | 1, origin: PinStateOrigin) => {
      setPinStates((prev) => {
        if (prev[pinNumber] === level) return prev;
        pinOriginsRef.current[pinNumber] = origin;
        return { ...prev, [pinNumber]: level };
      });
    },
    []
  );

  useEffect(() => {
    if (!statusFrame || !selectedIC) return;
    statusFrame.pins.forEach((pin) => {
      const assignment = virtualLookup[pin.virtualIndex];
      if (assignment) {
        setPinLevel(assignment.icPin, pin.level as 0 | 1, "serial");
      }
    });
  }, [selectedIC, setPinLevel, statusFrame, virtualLookup]);

  useEffect(() => {
    setDatasheetModalOpen(false);
    setImageModalOpen(false);
    setDatasheetZoom(1);
    setImageModalZoom(1);
  }, [selectedIC]);

  useEffect(() => {
    setPinStates({});
    pinOriginsRef.current = {};
    prevPinStatesRef.current = {};
    lastPublishedRef.current = {};
    mqttInputGateRef.current = {};
    lastRolePayloadRef.current = { inputs: null, outputs: null };
    setPinFullscreen(false);
  }, [selectedIC]);

  useEffect(() => {
    lastPublishedRef.current = {};
    lastMetadataPayloadRef.current = null;
    mqttInputGateRef.current = {};
    lastRolePayloadRef.current = { inputs: null, outputs: null };
  }, [baseTopic]);

  useEffect(() => {
    if (!mqttEnabled) {
      lastMetadataPayloadRef.current = null;
      mqttInputGateRef.current = {};
      lastRolePayloadRef.current = { inputs: null, outputs: null };
    }
  }, [mqttEnabled]);

  const shouldDropMqttUpdate = useCallback((pinNumber: number) => {
    const now = Date.now();
    const gate = mqttInputGateRef.current[pinNumber] ?? 0;
    if (now < gate) {
      return true;
    }
    mqttInputGateRef.current[pinNumber] = now + MQTT_INPUT_BUFFER_MS;
    return false;
  }, []);

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
    setPinLevel(assignment.icPin, nextLevel, "local");
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
      setPinLevel(pinNumber, input.level as 0 | 1, "truth");
    }
  };

  const publishPinLevel = useCallback(
    (pinNumber: number, level: 0 | 1) => {
      if (!mqttEnabled) return;
      const topic = mqttTopicMap.pinToTopic[pinNumber];
      if (!topic) return;
      const payload = `${level}`;
      lastPublishedRef.current[topic] = {
        payload,
        timestamp: Date.now(),
      };
      publishMQTT(topic, payload);
    },
    [mqttEnabled, mqttTopicMap, publishMQTT]
  );

  useEffect(() => {
    const prev = prevPinStatesRef.current;
    const changed: Array<{ pin: number; level: 0 | 1 }> = [];
    const pins = new Set([...Object.keys(prev), ...Object.keys(pinStates)]);
    pins.forEach((key) => {
      const pin = Number(key);
      const nextLevel = pinStates[pin];
      const prevLevel = prev[pin];
      if (typeof nextLevel === "undefined" || prevLevel === nextLevel) {
        return;
      }
      changed.push({ pin, level: nextLevel as 0 | 1 });
    });
    prevPinStatesRef.current = pinStates;
    if (!changed.length) return;
    changed.forEach(({ pin, level }) => {
      const origin = pinOriginsRef.current[pin];
      delete pinOriginsRef.current[pin];
      if (origin === "mqtt") return;
      publishPinLevel(pin, level);
    });
  }, [pinStates, publishPinLevel]);

  useEffect(() => {
    if (!mqttEnabled || !selectedIC) return;
    const payload = JSON.stringify({
      partNumber: selectedIC.partNumber,
      description: selectedIC.description,
      pinCount: selectedIC.pinCount,
      category: selectedIC.category,
    });
    if (lastMetadataPayloadRef.current === payload) return;
    lastMetadataPayloadRef.current = payload;
    publishMQTT(metadataTopic, payload);
  }, [metadataTopic, mqttEnabled, publishMQTT, selectedIC]);

  useEffect(() => {
    if (!mqttEnabled || !selectedIC) return;
    const inputsPayload = JSON.stringify(icInputPins);
    if (lastRolePayloadRef.current.inputs !== inputsPayload) {
      lastRolePayloadRef.current.inputs = inputsPayload;
      publishMQTT(inputPinsTopic, inputsPayload);
    }
    const outputsPayload = JSON.stringify(icOutputPins);
    if (lastRolePayloadRef.current.outputs !== outputsPayload) {
      lastRolePayloadRef.current.outputs = outputsPayload;
      publishMQTT(outputPinsTopic, outputsPayload);
    }
  }, [
    icInputPins,
    icOutputPins,
    inputPinsTopic,
    mqttEnabled,
    outputPinsTopic,
    publishMQTT,
    selectedIC,
  ]);

  const handleMqttPayload = useCallback(
    async (topic: string, rawPayload: Uint8Array) => {
      if (!mqttEnabled) return;
      const pinNumber = mqttTopicMap.topicToPin[topic];
      if (!pinNumber) return;
      const text = mqttDecoder.decode(rawPayload).trim();
      let derived: 0 | 1 | null = null;
      if (text.startsWith("{")) {
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>;
          if (
            "level" in parsed &&
            parsed.level !== undefined &&
            parsed.level !== null
          ) {
            derived = normalizeLevel(parsed.level);
          }
        } catch {
          // ignore malformed JSON payloads
        }
      }
      if (derived === null && text.length) {
        const lowered = text.toLowerCase();
        if (lowered === "1" || lowered === "high") derived = 1;
        else if (lowered === "0" || lowered === "low") derived = 0;
      }
      if (derived === null) return;

      const echo = lastPublishedRef.current[topic];
      if (
        echo &&
        echo.payload === `${derived}` &&
        Date.now() - echo.timestamp < MQTT_ECHO_WINDOW_MS
      ) {
        return;
      }

      if (shouldDropMqttUpdate(pinNumber)) {
        return;
      }

      setPinLevel(pinNumber, derived, "mqtt");
      if (isConnected) {
        const assignment = assignmentByPin[pinNumber];
        if (assignment && [1, 5].includes(assignment.role)) {
          try {
            await sendSetLevel(assignment.virtualIndex, derived);
          } catch (err) {
            console.error("Failed to drive pin from MQTT", err);
          }
        }
      }
    },
    [
      assignmentByPin,
      isConnected,
      mqttDecoder,
      mqttEnabled,
      mqttTopicMap,
      shouldDropMqttUpdate,
      sendSetLevel,
      setPinLevel,
    ]
  );

  useEffect(() => {
    if (!mqttEnabled || !selectedIC || mqttTopicMap.topics.length === 0) {
      replaceSubscriptions([], null);
      return;
    }
    replaceSubscriptions(mqttTopicMap.topics, handleMqttPayload);
  }, [
    handleMqttPayload,
    mqttEnabled,
    mqttTopicMap,
    replaceSubscriptions,
    selectedIC,
  ]);

  const statusSummary = (frame: StatusFrameSnapshot | null) => {
    if (!frame) return "No status";
    const highPins = frame.pins.filter((pin) => pin.level === 1).length;
    return `${highPins} pins HIGH • Timer ${frame.timeLow}`;
  };

  const datasheetUrl = selectedIC ? resolveDatasheetUrl(selectedIC) : null;
  const icImageSrc = useICPictures(selectedIC);
  const mqttStatusLabel = mqttEnabled ? mqttStatus : "disabled";
  const mqttLastMessageText = mqttLastMessage
    ? `${new Date(mqttLastMessage.timestamp).toLocaleTimeString()} • ${
        mqttLastMessage.topic
      }`
    : "None";
  const mqttExampleTopic = useMemo(() => {
    if (mqttTopicMap.topics.length) {
      return mqttTopicMap.topics[0];
    }
    const fallbackPin = selectedIC?.pinConfiguration?.[0]?.pin ?? 1;
    return buildPinTopic(baseTopic, fallbackPin);
  }, [baseTopic, mqttTopicMap, selectedIC]);

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
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">MQTT Bridge</h2>
              <p className="text-sm text-gray-400">
                Mirror pin levels directly to your MQTT broker and accept remote
                overrides in real time.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={mqttEnabled}
                onChange={(event) => setMqttEnabled(event.target.checked)}
                disabled={!selectedIC}
              />
              Enable bridge
              {!selectedIC && (
                <span className="text-xs text-gray-500">
                  Select an IC first
                </span>
              )}
            </label>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-300">
                  MQTT WebSocket URL
                </label>
                <input
                  type="text"
                  className="mt-1 w-full rounded border border-gray-600 bg-gray-800 p-2 text-sm text-white"
                  value={brokerUrl}
                  onChange={(event) => setBrokerUrl(event.target.value)}
                  placeholder="ws://localhost:9001/mqtt"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Enter the secure WebSocket endpoint exposed by your Mosquitto
                  (or compatible) broker.
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-300">Base Topic</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded border border-gray-600 bg-gray-800 p-2 text-sm text-white"
                  value={baseTopic}
                  onChange={(event) => setBaseTopic(event.target.value)}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Example pin topic:{" "}
                  <span className="font-mono text-gray-300">
                    {mqttExampleTopic}
                  </span>
                </p>
                <p className="text-xs text-gray-500">
                  Metadata topic:{" "}
                  <span className="font-mono text-gray-300">
                    {metadataTopic}
                  </span>
                </p>
              </div>
            </div>
            <div className="space-y-1 text-sm text-gray-300">
              <p>
                Status:{" "}
                <span className="font-semibold text-white">
                  {mqttStatusLabel}
                </span>
              </p>
              <p>
                Client:{" "}
                <span className="font-mono text-gray-400">{clientId}</span>
              </p>
              <p>Subscriptions: {mqttTopicMap.topics.length}</p>
              <p>Last message: {mqttLastMessageText}</p>
              {mqttError && (
                <p className="text-xs text-red-400">Error: {mqttError}</p>
              )}
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
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {datasheetUrl && (
                    <>
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
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setPinFullscreen(true)}
                    className="rounded border border-fuchsia-500 px-3 py-1 text-xs font-semibold text-fuchsia-200 hover:bg-fuchsia-500/10"
                  >
                    Pin Fullscreen
                  </button>
                </div>
                <PinLegend />
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
              <div className="space-y-3 rounded border border-gray-800 bg-black/30 p-3 text-center">
                <div className="flex aspect-[3/2] items-center justify-center overflow-hidden rounded bg-gray-900">
                  {icImageSrc ? (
                    <div className="relative h-full w-full">
                      <Image
                        src={icImageSrc}
                        alt={`${selectedIC.partNumber} package`}
                        fill
                        sizes="220px"
                        style={{
                          transform: `scale(${imageModalZoom})`,
                          transformOrigin: "center center",
                        }}
                        className="object-contain transition-transform"
                      />
                    </div>
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
      {isPinFullscreen && selectedIC && (
        <PinFullscreenOverlay
          ic={selectedIC}
          assignments={assignments}
          pinStates={pinStates}
          isConnected={isConnected}
          onTogglePin={handlePinToggle}
          onClose={() => setPinFullscreen(false)}
        />
      )}
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
