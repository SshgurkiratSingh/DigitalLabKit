"use client";
import dynamic from "next/dynamic";

// Dynamically import the MainInterface component with no SSR
const MainInterface = dynamic(
  () => import("./components/MainInterface"), // Updated path
  { ssr: false }
);

export default function Home() {
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

        <MainInterface />

        <div className="mt-12 text-center text-sm md:text-base text-neutral-400">
          <p>
            This interface requires a browser that supports the Web Serial API
            (Chrome, Edge, or Opera).
          </p>
        </div>
      </main>
    </div>
  );
}
