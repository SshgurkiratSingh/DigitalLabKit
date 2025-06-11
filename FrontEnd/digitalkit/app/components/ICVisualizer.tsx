"use client";

import { useState, useEffect } from "react";

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
}: {
  partNumber: string;
  onClick?: () => void;
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

  return (
    <img
      src={imgSrc}
      alt={`${partNumber} IC`}
      className="h-full max-h-[200px] object-contain cursor-zoom-in"
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

export default function ICVisualizer({
  ic,
  onPinStateChange,
  serialConnected,
  currentPinStates = {},
}: ICVisualizerProps) {
  const [localPinStates, setLocalPinStates] = useState<{ [key: number]: boolean }>({});
  const [modalImgSrc, setModalImgSrc] = useState<string | null>(null);

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

  if (!ic) return null;

  const togglePin = (pinNumber: number, pinType: string) => {
    if (!serialConnected || pinType !== "INPUT") return;

    const newStates = {
      ...localPinStates,
      [pinNumber]: !localPinStates[pinNumber],
    };
    setLocalPinStates(newStates);
    onPinStateChange?.(newStates);
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
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
    } catch {}
    url = `${base}.PDF`;
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
    } catch {}
    alert("Datasheet not found for this IC.");
  };

  return (
    <div className="p-4 bg-[var(--background)] rounded-lg shadow w-full">
      <h3 className="text-lg font-semibold mb-4 text-[var(--foreground)]">
        {ic.partNumber} - {ic.description}
      </h3>

      <div className="flex justify-between items-center">
        {/* Left Pins */}
        <div className="space-y-2">
          {leftPins.map(pin => (
            <div
              key={pin.pin}
              className="flex items-center space-x-2 cursor-pointer"
              onClick={() => togglePin(pin.pin, pin.type)}
            >
              <div
                className={`w-6 h-6 rounded-full ${getPinColor(pin.type, pin.pin)} ${
                  pin.type === "INPUT" && serialConnected
                    ? "cursor-pointer hover:opacity-80"
                    : ""
                }`}
              >
                <span className="flex items-center justify-center text-white text-sm">
                  {pin.pin}
                </span>
              </div>
              <span className="text-sm text-[var(--foreground)]">
                {pin.name} ({pin.type})
              </span>
            </div>
          ))}
        </div>

        {/* IC Image in Center */}
        <div className="mx-4 flex items-center justify-center">
          <ICImage partNumber={ic.partNumber} onClick={handleImageClick} />
        </div>

        {/* Right Pins */}
        <div className="space-y-2">
          {rightPins.map(pin => (
            <div
              key={pin.pin}
              className="flex items-center space-x-2 cursor-pointer"
              onClick={() => togglePin(pin.pin, pin.type)}
            >
              <span className="text-sm text-right text-[var(--foreground)]">
                {pin.name} ({pin.type})
              </span>
              <div
                className={`w-6 h-6 rounded-full ${getPinColor(pin.type, pin.pin)} ${
                  pin.type === "INPUT" && serialConnected
                    ? "cursor-pointer hover:opacity-80"
                    : ""
                }`}
              >
                <span className="flex items-center justify-center text-white text-sm">
                  {pin.pin}
                </span>
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
    </div>
  );
}
