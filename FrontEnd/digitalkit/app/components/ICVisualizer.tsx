"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface Pin {
  pin: number;
  name: string;
  type: string;
  function: string;
}

interface ICData {
  partNumber: string;
  description: string;
  category: string;
  pinCount: number;
  pinConfiguration: Pin[];
}

interface ICVisualizerProps {
  ic: ICData | null;
  onPinStateChange?: (pinStates: { [key: number]: boolean }) => void;
  serialConnected: boolean;
  currentPinStates?: { [key: number]: boolean };
}

// Helper component for dynamic image selection and modal logic
function ICImage({
  partNumber,
  onClick,
  fullScreen = false,
  scale = 1,
}: {
  partNumber: string;
  onClick?: () => void;
  fullScreen?: boolean;
  scale?: number;
}) {
  const [imgSrc, setImgSrc] = useState(`/ic_img/${partNumber}.png`);
  const [triedJpg, setTriedJpg] = useState(false);

  useEffect(() => {
    setImgSrc(`/ic_img/${partNumber}.png`);
    setTriedJpg(false);
  }, [partNumber]);

  const handleError = () => {
    if (!triedJpg) {
      setImgSrc(`/ic_img/${partNumber}.jpg`);
      setTriedJpg(true);
    } else {
      setImgSrc("/ic_img/placeholder.png");
    }
  };

  if (fullScreen) {
    return (
      <div
        className="relative"
        style={{
          width: "min(90vw, 600px)",
          height: "min(80vh, 400px)",
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <img
          src={imgSrc}
          alt={`${partNumber} IC`}
          onClick={onClick}
          onError={handleError}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            maxWidth: "100%",
            maxHeight: "100%",
            transform: `translate(-50%, -50%) scale(${scale})`,
            transformOrigin: "center center",
            transition: "transform 0.2s",
            objectFit: "contain",
            display: "block",
          }}
          tabIndex={0}
          aria-label="Enlarge IC image"
        />
      </div>
    );
  }

  const className = fullScreen
    ? "h-full max-h-[80vh] max-w-[90vw] object-contain"
    : "h-full max-h-[200px] object-contain cursor-zoom-in";

  return (
    <img
      src={imgSrc}
      alt={`${partNumber} IC`}
      className={className}
      onClick={onClick}
      onError={handleError}
      style={{ transition: "box-shadow 0.2s" }}
      tabIndex={0}
      aria-label="Enlarge IC image"
    />
  );
}

// Modal component for enlarged image
function ImageModal({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80"
      onClick={onClose}
      tabIndex={-1}
      aria-modal="true"
      role="dialog"
    >
      <img
        src={src}
        alt={alt}
        className="max-h-[80vh] max-w-[90vw] rounded shadow-lg border-4 border-white"
        onClick={e => e.stopPropagation()}
        style={{ background: "#fff" }}
      />
      <button
        className="absolute top-4 right-6 text-white text-3xl font-bold"
        onClick={onClose}
        aria-label="Close enlarged image"
        tabIndex={0}
      >
        &times;
      </button>
    </div>
  );
}

// Modal component for PDF display
function PdfModal({
  pdfPath,
  onClose,
}: {
  pdfPath: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black bg-opacity-80"
      onClick={onClose}
      tabIndex={-1}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="bg-black p-2 rounded-lg shadow-lg"
        style={{ width: "90vw", height: "90vh" }}
        onClick={e => e.stopPropagation()}
      >
        <iframe
          src={pdfPath}
          width="100%"
          height="100%"
          title="PDF Viewer"
          style={{ border: "none" }}
        />
      </div>
      <button
        className="absolute top-4 right-6 text-white text-3xl font-bold"
        onClick={onClose}
        aria-label="Close PDF viewer"
        tabIndex={0}
      >
        &times;
      </button>
    </div>
  );
}

export default function ICVisualizer({
  ic,
  onPinStateChange,
  serialConnected,
  currentPinStates = {},
}: ICVisualizerProps) {
  const [localPinStates, setLocalPinStates] = useState<{ [key: number]: boolean }>({});
  const [modalImgSrc, setModalImgSrc] = useState<string | null>(null);
  const [showPdfModal, setShowPdfModal] = useState<boolean>(false);
  const [currentPdfPath, setCurrentPdfPath] = useState<string | null>(null);
  const [isFullScreenView, setIsFullScreenView] = useState<boolean>(false);
  const [pressedPinsLog, setPressedPinsLog] = useState<string[]>([]);
  const [imageScale, setImageScale] = useState(1);

  // --- Chart state ---
  const [pinStateHistory, setPinStateHistory] = useState<any[]>([]);

  // Helper to reset all pins to false
  const resetAllPins = () => {
    if (!ic) return;
    const newStates: { [key: number]: boolean } = {};
    ic.pinConfiguration.forEach(pin => {
      newStates[pin.pin] = false;
    });
    setLocalPinStates(newStates);
    onPinStateChange?.(newStates);
    setPinStateHistory([]);
  };

  // Reset pins and image scale when exiting fullscreen or when IC changes
  useEffect(() => {
    if (!isFullScreenView) {
      resetAllPins();
      setPressedPinsLog([]);
      setImageScale(1);
    }
  }, [isFullScreenView]); // eslint-disable-line

  useEffect(() => {
    resetAllPins();
    setPressedPinsLog([]);
    setImageScale(1);
  }, [ic]); // eslint-disable-line

  // Sync with currentPinStates if provided
  useEffect(() => {
    if (ic) {
      const newStates = { ...localPinStates };
      ic.pinConfiguration.forEach(pin => {
        newStates[pin.pin] = currentPinStates[pin.pin] ?? localPinStates[pin.pin] ?? false;
      });
      setLocalPinStates(newStates);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ic, currentPinStates]);

  // Effect for handling Escape key in full-screen mode
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFullScreenView(false);
      }
    };

    if (isFullScreenView) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullScreenView]);

  if (!ic) return null;

  // Always log pin presses (show all presses, not just last 3)
  const togglePin = (pinNumber: number, pinType: string) => {
    if (!serialConnected || pinType !== "INPUT") return;

    const pin = ic.pinConfiguration.find(p => p.pin === pinNumber);
    if (pin) {
      setPressedPinsLog(prev => [
        `Pin ${pin.pin} (${pin.name}, ${pin.type}) pressed`,
        ...prev,
      ]);
    }

    const newStates = {
      ...localPinStates,
      [pinNumber]: !localPinStates[pinNumber],
    };
    setLocalPinStates(newStates);
    onPinStateChange?.(newStates);

    // --- Chart logic: record state of all INPUT pins ---
    const inputPins = ic.pinConfiguration.filter(p => p.type === "INPUT");
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const entry: any = { time: timeString };
    inputPins.forEach(p => {
      entry[`Pin ${p.pin}`] = newStates[p.pin] ? 1 : 0;
    });
    setPinStateHistory(prev => [entry, ...prev].slice(0, 40)); // Keep last 40 events
  };

  const getPinColor = (pinType: string, pinNumber: number) => {
    if (pinType === "POWER") return "bg-yellow-500";
    const state = localPinStates[pinNumber] ?? false;
    if (pinType === "INPUT") return state ? "bg-green-500" : "bg-red-500";
    if (pinType === "OUTPUT") return state ? "bg-blue-500" : "bg-gray-500";
    return "bg-gray-400";
  };

  const leftPins = ic.pinConfiguration.slice(0, ic.pinCount / 2);
  const rightPins = ic.pinConfiguration.slice(ic.pinCount / 2).reverse();

  // For modal: try png, then jpg, then placeholder
  const getModalImgSrc = () => {
    return [
      `/ic_img/${ic.partNumber}.png`,
      `/ic_img/${ic.partNumber}.jpg`,
      `/ic_img/placeholder.png`,
    ];
  };

  const handleImageClick = () => {
    const candidates = getModalImgSrc();
    let found = false;
    for (let i = 0; i < candidates.length; i++) {
      const img = new window.Image();
      img.src = candidates[i];
      img.onload = () => {
        if (!found) {
          setModalImgSrc(candidates[i]);
          found = true;
        }
      };
    }
    setTimeout(() => {
      if (!found) setModalImgSrc(`/ic_img/placeholder.png`);
    }, 500);
  };

  const handleModalClose = () => setModalImgSrc(null);

  // Datasheet handler for both .pdf and .PDF
  const openDatasheet = async () => {
    if (!ic) return;
    const base = `/datasheet/${ic.partNumber}`;
    let url = `${base}.pdf`;
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) {
        setCurrentPdfPath(url);
        setShowPdfModal(true);
        return;
      }
    } catch {}
    url = `${base}.PDF`;
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) {
        setCurrentPdfPath(url);
        setShowPdfModal(true);
        return;
      }
    } catch {}
    alert("Datasheet not found for this IC.");
  };

  // --- SMALLER PIN SIZING LOGIC ---
  const pinCircleClass = isFullScreenView
    ? "w-8 h-8 md:w-10 md:h-10"
    : "w-4 h-4 md:w-5 md:h-5";
  const pinTextClass = isFullScreenView
    ? "text-base md:text-lg"
    : "text-[10px] md:text-xs";
  const pinLabelClass = isFullScreenView
    ? "text-sm md:text-base"
    : "text-xs";
  const pinSpaceY = isFullScreenView
    ? "space-y-2 md:space-y-3"
    : "space-y-1";
  const pinSpaceX = isFullScreenView
    ? "space-x-2 md:space-x-3"
    : "space-x-1";

  // --- FULL SCREEN VIEW ---
  if (isFullScreenView) {
    // Prepare chart lines for all input pins
    const inputPins = ic.pinConfiguration.filter(p => p.type === "INPUT");
    const chartLines = inputPins.map((p, idx) => (
      <Line
        key={p.pin}
        type="stepAfter"
        dataKey={`Pin ${p.pin}`}
        stroke={["#82ca9d", "#ff7300", "#8884d8", "#0088FE", "#FFBB28"][idx % 5]}
        dot={false}
        isAnimationActive={false}
        name={`Pin ${p.pin}`}
        strokeWidth={2}
      />
    ));

    return (
      <div className="fixed top-0 left-0 right-0 bottom-0 w-screen h-screen bg-black z-50 flex flex-col">
        {/* Image size slider for user control */}
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 flex items-center bg-white bg-opacity-80 rounded px-4 py-2 z-60">
          <label htmlFor="ic-image-scale" className="mr-2 text-sm font-medium text-black">
            IC Image Size
          </label>
          <input
            id="ic-image-scale"
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={imageScale}
            onChange={e => setImageScale(Number(e.target.value))}
            className="w-40 mx-2"
          />
          <span className="text-black text-xs">{Math.round(imageScale * 100)}%</span>
        </div>

        <button
          onClick={() => setIsFullScreenView(false)}
          className="absolute top-5 right-5 px-4 py-2 bg-red-600 text-white font-bold rounded hover:bg-red-700 z-60 text-sm md:text-base"
        >
          Exit Full Screen
        </button>

        {/* Main content area */}
        <div className="flex-1 flex justify-around items-center w-full max-w-6xl mx-auto px-4 pt-16">
          {/* Left Pins */}
          <div className={pinSpaceY}>
            {leftPins.map(pin => (
              <div
                key={pin.pin}
                className={`flex items-center ${pinSpaceX} cursor-pointer`}
                onClick={() => togglePin(pin.pin, pin.type)}
              >
                <div
                  className={`${pinCircleClass} rounded-full ${getPinColor(pin.type, pin.pin)} ${
                    pin.type === "INPUT" && serialConnected
                      ? "cursor-pointer hover:opacity-80"
                      : ""
                  } flex items-center justify-center`}
                >
                  <span className={`text-white font-bold ${pinTextClass}`}>
                    {pin.pin}
                  </span>
                </div>
                <span className={`${pinLabelClass} text-slate-200`}>
                  {pin.name} ({pin.type})
                </span>
              </div>
            ))}
          </div>

          {/* IC Image in Center */}
          <div className="mx-4 flex items-center justify-center h-auto max-h-[60vh] max-w-[90vw] my-4">
            <ICImage partNumber={ic.partNumber} fullScreen scale={imageScale} />
          </div>

          {/* Right Pins */}
          <div className={pinSpaceY}>
            {rightPins.map(pin => (
              <div
                key={pin.pin}
                className={`flex items-center ${pinSpaceX} cursor-pointer`}
                onClick={() => togglePin(pin.pin, pin.type)}
              >
                <span className={`${pinLabelClass} text-right text-slate-200`}>
                  {pin.name} ({pin.type})
                </span>
                <div
                  className={`${pinCircleClass} rounded-full ${getPinColor(pin.type, pin.pin)} ${
                    pin.type === "INPUT" && serialConnected
                      ? "cursor-pointer hover:opacity-80"
                      : ""
                  } flex items-center justify-center`}
                >
                  <span className={`text-white font-bold ${pinTextClass}`}>
                    {pin.pin}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pin Press Log Table AND Chart side by side */}
        <div className="mt-6 flex flex-row justify-center space-x-6 w-full max-w-6xl mx-auto">
          {/* Pin Press Log Table */}
          <div className="bg-black bg-opacity-90 rounded-lg p-6 max-h-80 overflow-y-auto w-1/2">
            <h4 className="text-base font-semibold mb-3 text-white text-center">Pin Press Log:</h4>
            <table className="w-full text-sm text-white">
              <thead>
                <tr className="border-b border-gray-600">
                  <th className="py-3 px-4 text-left">#</th>
                  <th className="py-3 px-4 text-left">Event</th>
                </tr>
              </thead>
              <tbody>
                {pressedPinsLog.map((msg, idx) => (
                  <tr key={idx} className="border-b border-gray-700">
                    <td className="py-2 px-4">{pressedPinsLog.length - idx}</td>
                    <td className="py-2 px-4">{msg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Input Pins State Graph */}
          <div className="bg-black bg-opacity-90 rounded-lg p-6 w-1/2 flex flex-col items-center">
            <h4 className="text-base font-semibold mb-3 text-white text-center">Input Pins Logic State</h4>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart
                data={[...pinStateHistory].reverse()} // oldest left, newest right
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fill: "#fff", fontSize: 12 }} />
                <YAxis domain={[0, 1]} ticks={[0, 1]} tick={{ fill: "#fff" }} />
                <Tooltip />
                <Legend />
                {chartLines}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  // --- DEFAULT VIEW (Pin Press Log below IC image) ---
  return (
    <div className="p-4 bg-[var(--background)] rounded-lg shadow w-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">
          {ic.partNumber} - {ic.description}
        </h3>
        <button
          onClick={() => setIsFullScreenView(!isFullScreenView)}
          className="px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700 ml-2"
        >
          Toggle Full Screen
        </button>
      </div>
      <div className="flex justify-between items-center">
        {/* Left Pins */}
        <div className="space-y-1">
          {leftPins.map(pin => (
            <div
              key={pin.pin}
              className="flex items-center space-x-1 cursor-pointer"
              onClick={() => togglePin(pin.pin, pin.type)}
            >
              <div
                className={`w-4 h-4 rounded-full ${getPinColor(pin.type, pin.pin)} ${
                  pin.type === "INPUT" && serialConnected
                    ? "cursor-pointer hover:opacity-80"
                    : ""
                } flex items-center justify-center`}
              >
                <span className="text-white text-[10px]">{pin.pin}</span>
              </div>
              <span className="text-xs text-[var(--foreground)]">
                {pin.name} ({pin.type})
              </span>
            </div>
          ))}
        </div>
        {/* IC Image in Center */}
        <div className="mx-4 flex flex-col items-center justify-center h-auto max-h-[120px] md:max-h-[150px] my-4 w-full max-w-xs">
          <ICImage partNumber={ic.partNumber} onClick={handleImageClick} />
        </div>
        {/* Right Pins */}
        <div className="space-y-1">
          {rightPins.map(pin => (
            <div
              key={pin.pin}
              className="flex items-center space-x-1 cursor-pointer"
              onClick={() => togglePin(pin.pin, pin.type)}
            >
              <span className="text-xs text-right text-[var(--foreground)]">
                {pin.name} ({pin.type})
              </span>
              <div
                className={`w-4 h-4 rounded-full ${getPinColor(pin.type, pin.pin)} ${
                  pin.type === "INPUT" && serialConnected
                    ? "cursor-pointer hover:opacity-80"
                    : ""
                } flex items-center justify-center`}
              >
                <span className="text-white text-[10px]">{pin.pin}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4">
        <h4 className="text-sm font-semibold mb-2 text-[var(--foreground)]">Legend:</h4>
        <div className="flex space-x-4 flex-wrap items-center">
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-yellow-500 mr-2"></div>
            <span className="text-sm text-[var(--foreground)]">Power</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-red-500 mr-2"></div>
            <span className="text-sm text-[var(--foreground)]">Input (Low)</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-green-500 mr-2"></div>
            <span className="text-sm text-[var(--foreground)]">Input (High)</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-gray-500 mr-2"></div>
            <span className="text-sm text-[var(--foreground)]">Output (Low)</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-blue-500 mr-2"></div>
            <span className="text-sm text-[var(--foreground)]">Output (High)</span>
            {/* DataSheet button next to Output legend */}
            <button
              className="ml-2 px-2 py-1 bg-blue-600 text-white text-l rounded hover:bg-blue-700"
              onClick={openDatasheet}
              tabIndex={0}
            >
              DataSheet
            </button>
          </div>
        </div>
      </div>

      {/* Modal for enlarged image */}
      {modalImgSrc && (
        <ImageModal
          src={modalImgSrc}
          alt={`${ic.partNumber} IC enlarged`}
          onClose={handleModalClose}
        />
      )}

      {/* Modal for PDF display */}
      {showPdfModal && currentPdfPath && (
        <PdfModal
          pdfPath={currentPdfPath}
          onClose={() => {
            setShowPdfModal(false);
            setCurrentPdfPath(null);
          }}
        />
      )}
    </div>
  );
}
