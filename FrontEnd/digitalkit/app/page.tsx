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
      <main className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 dark:text-white">
            Web Serial Interface
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Connect and communicate with serial devices through your browser
          </p>
        </div>

        <SerialPortInterface />

        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            This interface requires a browser that supports the Web Serial API
            (Chrome, Edge, or Opera).
          </p>
        </div>
      </main>
    </div>
  );
}
