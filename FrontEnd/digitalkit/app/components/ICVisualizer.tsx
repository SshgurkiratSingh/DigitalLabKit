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
  currentPinStates?: { [key: number]: boolean }; // Add this prop
}

export default function ICVisualizer({
  ic,
  onPinStateChange,
  serialConnected,
  currentPinStates = {},
}: ICVisualizerProps) {
  // Add local state to track pin states
  const [localPinStates, setLocalPinStates] = useState<{ [key: number]: boolean }>({});

  // Update local pin states when IC changes or when currentPinStates changes
  useEffect(() => {
    if (ic) {
      const newStates = { ...localPinStates };
      ic.pinConfiguration.forEach(pin => {
        // Use currentPinStates if available, otherwise keep existing state or default to false
        newStates[pin.pin] = currentPinStates[pin.pin] ?? localPinStates[pin.pin] ?? false;
      });
      setLocalPinStates(newStates);
    }
  }, [ic, currentPinStates]);

  if (!ic) {
    return null;
  }

  const togglePin = (pinNumber: number, pinType: string) => {
    if (!serialConnected || pinType !== "INPUT") return;

    if (onPinStateChange) {
      const newStates = {
        ...localPinStates,
        [pinNumber]: !localPinStates[pinNumber],
      };
      setLocalPinStates(newStates); // Update local state immediately
      onPinStateChange(newStates); // Notify parent
    }
  };

  const getPinStyle = (pinType: string, pinNumber: number) => {
    const state = localPinStates[pinNumber] ?? false;
    let bgColor = "";
    let textColor = "text-white"; // Default text color

    if (pinType === "POWER") {
      bgColor = "bg-neon-blue";
    } else if (pinType === "INPUT") {
      if (state) {
        bgColor = "bg-neon-green";
        textColor = "text-dark-bg"; // Neon green needs dark text for contrast
      } else {
        bgColor = "bg-neon-pink";
      }
    } else if (pinType === "OUTPUT") {
      if (state) {
        bgColor = "bg-neon-green"; // Using neon-green for Output High as well
        textColor = "text-dark-bg";
      } else {
        bgColor = "bg-medium-text bg-opacity-50";
      }
    } else {
      bgColor = "bg-medium-text bg-opacity-30";
    }
    return { bgColor, textColor };
  };

  const leftPins = ic.pinConfiguration.slice(0, ic.pinCount / 2);
  const rightPins = ic.pinConfiguration.slice(ic.pinCount / 2).reverse();

  return (
    <div className="p-4 bg-dark-card rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4 text-neon-pink">
        {ic.partNumber} - {ic.description}
      </h3>
      
      <div className="flex justify-between">
        {/* Left side pins */}
        <div className="space-y-2">
          {leftPins.map((pin) => {
            const { bgColor, textColor } = getPinStyle(pin.type, pin.pin);
            return (
              <div
                key={pin.pin}
                className="flex items-center space-x-2 cursor-pointer"
                onClick={() => togglePin(pin.pin, pin.type)}
              >
                <div
                  className={`w-6 h-6 rounded-full ${bgColor} ${
                    pin.type === "INPUT" && serialConnected
                      ? "cursor-pointer hover:opacity-80"
                      : ""
                  }`}
                >
                  <span className={`flex items-center justify-center ${textColor} text-sm`}>
                    {pin.pin}
                  </span>
                </div>
                <span className="text-sm text-light-text">
                  {pin.name} ({pin.type})
                </span>
              </div>
            );
          })}
        </div>

        {/* IC Body */}
        <div className="w-20 bg-dark-bg mx-4"></div>

        {/* Right side pins */}
        <div className="space-y-2">
          {rightPins.map((pin) => {
            const { bgColor, textColor } = getPinStyle(pin.type, pin.pin);
            return (
              <div
                key={pin.pin}
                className="flex items-center space-x-2 cursor-pointer"
                onClick={() => togglePin(pin.pin, pin.type)}
              >
                <span className="text-sm text-right text-light-text">
                  {pin.name} ({pin.type})
                </span>
                <div
                  className={`w-6 h-6 rounded-full ${bgColor} ${
                    pin.type === "INPUT" && serialConnected
                      ? "cursor-pointer hover:opacity-80"
                      : ""
                  }`}
                >
                  <span className={`flex items-center justify-center ${textColor} text-sm`}>
                    {pin.pin}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        <h4 className="text-sm font-semibold mb-2 text-light-text">Legend:</h4>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-neon-blue mr-2"></div>
            <span className="text-sm text-light-text">Power</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-neon-pink mr-2"></div>
            <span className="text-sm text-light-text">Input (Low)</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-neon-green mr-2"></div>
            <span className="text-sm text-light-text">Input (High)</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-medium-text bg-opacity-50 mr-2"></div>
            <span className="text-sm text-light-text">Output (Low)</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-neon-green mr-2"></div> {/* Output High also neon-green */}
            <span className="text-sm text-light-text">Output (High)</span>
          </div>
        </div>
      </div>
    </div>
  );
}