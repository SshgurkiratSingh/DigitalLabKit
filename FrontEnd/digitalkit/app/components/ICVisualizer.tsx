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
}

export default function ICVisualizer({
  ic,
  onPinStateChange,
  serialConnected,
}: ICVisualizerProps) {
  const [pinStates, setPinStates] = useState<{ [key: number]: boolean }>({});

  useEffect(() => {
    // Reset pin states when IC changes
    if (ic) {
      const initialStates: { [key: number]: boolean } = {};
      ic.pinConfiguration.forEach((pin) => {
        initialStates[pin.pin] = false;
      });
      setPinStates(initialStates);
      if (onPinStateChange) {
        onPinStateChange(initialStates);
      }
    }
  }, [ic]);

  if (!ic) {
    return null;
  }

  const togglePin = (pinNumber: number, pinType: string) => {
    if (!serialConnected || pinType !== "INPUT") return;

    setPinStates((prev) => {
      const newStates = {
        ...prev,
        [pinNumber]: !prev[pinNumber],
      };
      if (onPinStateChange) {
        onPinStateChange(newStates);
      }
      return newStates;
    });
  };

  const getPinColor = (pinType: string, state: boolean) => {
    if (pinType === "POWER") return "bg-yellow-500";
    if (pinType === "INPUT") return state ? "bg-green-500" : "bg-red-500";
    if (pinType === "OUTPUT") return state ? "bg-blue-500" : "bg-gray-500";
    return "bg-gray-400";
  };

  const leftPins = ic.pinConfiguration.slice(0, ic.pinCount / 2);
  const rightPins = ic.pinConfiguration.slice(ic.pinCount / 2).reverse();

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4 dark:text-white">
        {ic.partNumber} - {ic.description}
      </h3>
      
      <div className="flex justify-between">
        {/* Left side pins */}
        <div className="space-y-2">
          {leftPins.map((pin) => (
            <div
              key={pin.pin}
              className="flex items-center space-x-2 cursor-pointer"
              onClick={() => togglePin(pin.pin, pin.type)}
            >
              <div
                className={`w-6 h-6 rounded-full ${getPinColor(
                  pin.type,
                  pinStates[pin.pin]
                )} ${
                  pin.type === "INPUT" && serialConnected
                    ? "cursor-pointer hover:opacity-80"
                    : ""
                }`}
              >
                <span className="flex items-center justify-center text-white text-sm">
                  {pin.pin}
                </span>
              </div>
              <span className="text-sm dark:text-white">
                {pin.name} ({pin.type})
              </span>
            </div>
          ))}
        </div>

        {/* IC Body */}
        <div className="w-20 bg-gray-300 dark:bg-gray-600 mx-4"></div>

        {/* Right side pins */}
        <div className="space-y-2">
          {rightPins.map((pin) => (
            <div
              key={pin.pin}
              className="flex items-center space-x-2 cursor-pointer"
              onClick={() => togglePin(pin.pin, pin.type)}
            >
              <span className="text-sm text-right dark:text-white">
                {pin.name} ({pin.type})
              </span>
              <div
                className={`w-6 h-6 rounded-full ${getPinColor(
                  pin.type,
                  pinStates[pin.pin]
                )} ${
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

      <div className="mt-4">
        <h4 className="text-sm font-semibold mb-2 dark:text-white">Legend:</h4>
        <div className="flex space-x-4">
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-yellow-500 mr-2"></div>
            <span className="text-sm dark:text-white">Power</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-red-500 mr-2"></div>
            <span className="text-sm dark:text-white">Input (Low)</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-green-500 mr-2"></div>
            <span className="text-sm dark:text-white">Input (High)</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-gray-500 mr-2"></div>
            <span className="text-sm dark:text-white">Output (Low)</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-blue-500 mr-2"></div>
            <span className="text-sm dark:text-white">Output (High)</span>
          </div>
        </div>
      </div>
    </div>
  );
}