"use client";

import { ReactNode } from "react";
import { SerialPortProvider } from "./contexts/SerialPortContext";

export function Providers({ children }: { children: ReactNode }) {
  return <SerialPortProvider>{children}</SerialPortProvider>;
}