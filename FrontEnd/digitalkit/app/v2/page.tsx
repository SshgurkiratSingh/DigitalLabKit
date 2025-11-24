"use client";

import dynamic from "next/dynamic";

const ICTesterWorkspace = dynamic(
  () => import("./components/ICTesterWorkspace"),
  { ssr: false }
);

export default function V2Page() {
  return (
    <div className="min-h-screen bg-slate-950 p-4 text-white">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-300">
            Digital Lab Kit
          </p>
          <h1 className="mt-2 text-3xl font-semibold">IC Tester Workspace</h1>
          <p className="mt-2 text-base text-gray-300">
            Connect an Arduino IC node, load IC definitions, and drive test
            vectors straight from your browser.
          </p>
        </header>
        <ICTesterWorkspace />
      </div>
    </div>
  );
}
