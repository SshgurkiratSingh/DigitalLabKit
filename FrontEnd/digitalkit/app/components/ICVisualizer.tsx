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

// Helper component for dynamic image selection
function ICImage({ partNumber }: { partNumber: string }) {
  const [imgSrc, setImgSrc] = useState(`/ic_img/${partNumber}.png`);
  const [triedJpg, setTriedJpg] = useState(false);

  useEffect(() => {
    // Whenever partNumber changes, reset the image source and triedJpg flag
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
      className="h-full max-h-[200px] object-contain"
      onError={handleError}
    />
  );
}

export default function ICVisualizer({
  ic,
  onPinStateChange,
  serialConnected,
  currentPinStates = {},
}: ICVisualizerProps) {
  const [localPinStates, setLocalPinStates] = useState<{ [key: number]: boolean }>({});

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
          <ICImage partNumber={ic.partNumber} />
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
        <div className="flex space-x-4 flex-wrap">
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
          </div>
        </div>
      </div>
    </div>
  );
}
