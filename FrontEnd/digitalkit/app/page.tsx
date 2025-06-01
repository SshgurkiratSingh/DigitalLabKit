"use client";
import dynamic from "next/dynamic";

// Dynamically import the SerialPortInterface component with no SSR
const SerialPortInterface = dynamic(
  () => import("./components/SerialPortInterface"),
  { ssr: false }
);

export default function Home() {
  return (
    <div className="min-h-screen p-8 bg-gray-50 dark:bg-gray-900">
      <main className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 dark:text-white">
            IC Testing Interface
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Select an IC, connect your testing device, and control pin states through your browser
          </p>
        </div>

        <SerialPortInterface />

        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            This interface requires a browser that supports the Web Serial API
            (Chrome, Edge, or Opera).
          </p>
          <p className="mt-2">
            Protocol Specification:
          </p>
          <ul className="list-disc list-inside mt-1">
            <li>IC Selection: Send "IC:&lt;part_number&gt;" (e.g., "IC:7447")</li>
            <li>Pin States: Send "PINS:&lt;pin_number&gt;:&lt;state&gt;,..." (e.g., "PINS:1:1,2:0")</li>
            <li>Receive Pin States: "PINS:&lt;16_bit_string&gt;" (e.g., "PINS:0101010101010101")</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
