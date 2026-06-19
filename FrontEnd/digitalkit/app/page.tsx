"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

// Dynamically import components with no SSR
const SerialPortInterface = dynamic(
  () => import("./components/SerialPortInterface"),
  { ssr: false }
);

const BLEInterface = dynamic(
  () => import("./components/BLEInterface"),
  { ssr: false }
);

type ConnectionType = "serial" | "ble";

export default function Home() {
  const [connectionType, setConnectionType] = useState<ConnectionType>("serial");

  return (
    <div className="min-h-screen p-4 md:p-8 bg-[var(--background)]">
      <main className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold mb-2 text-[var(--foreground)]">
            IC Testing Interface
          </h1>
          <p className="text-base md:text-lg text-neutral-300">
            Select an IC, connect your testing device, and control pin states
            through your browser
          </p>
        </div>

        {/* Connection Type Selector */}
        <div className="flex justify-center gap-4 mb-8">
          <button
            onClick={() => setConnectionType("serial")}
            className={`px-6 py-2 rounded-md transition-colors ${
              connectionType === "serial"
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            Serial Connection
          </button>
          <button
            onClick={() => setConnectionType("ble")}
            className={`px-6 py-2 rounded-md transition-colors ${
              connectionType === "ble"
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            BLE Connection
          </button>
        </div>

        {/* Connection Interface */}
        {connectionType === "serial" ? (
          <SerialPortInterface />
        ) : (
          <BLEInterface />
        )}

        {/* Browser Support Notice */}
        <div className="mt-12 text-center text-sm md:text-base text-neutral-400">
          <p>
            {connectionType === "serial" ? (
              "Serial interface requires a browser that supports the Web Serial API (Chrome, Edge, or Opera)."
            ) : (
              "BLE interface requires a browser that supports the Web Bluetooth API (Chrome, Edge, or other compatible browsers)."
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
