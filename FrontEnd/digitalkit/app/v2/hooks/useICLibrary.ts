"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export interface ICPin {
  pin: number;
  name: string;
  type: string;
  function: string;
}

export interface ICFunctionalBlock {
  truthTable?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface ICDefinition {
  partNumber: string;
  description: string;
  category: string;
  pinCount: number;
  pinConfiguration: ICPin[];
  functional?: ICFunctionalBlock;
  [key: string]: unknown;
}

interface ICFileShape {
  [key: string]: ICFileShape | ICDefinition;
}

const SOURCE_FILES = [
  "combinationalIC",
  "sequentialIC",
  "arithmeticIc",
  "BCDDecoderIC",
  "CounterIC",
  "ShiftRegisterIC",
  "comparatorIc",
];

const isICDefinition = (value: unknown): value is ICDefinition => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.partNumber === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.pinCount === "number" &&
    Array.isArray(candidate.pinConfiguration)
  );
};

function collectICs(node: ICFileShape | ICDefinition, bucket: ICDefinition[]) {
  if (!node || typeof node !== "object") return;

  if (isICDefinition(node)) {
    bucket.push(node);
    return;
  }

  Object.values(node).forEach((value) => collectICs(value as ICFileShape, bucket));
}

export function useICLibrary() {
  const [ics, setIcs] = useState<ICDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);

    const aggregated: ICDefinition[] = [];
    const errors: string[] = [];

    await Promise.all(
      SOURCE_FILES.map(async (file) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(`/files/${file}.json`, {
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (!response.ok) {
            errors.push(`Failed to load ${file}.json (${response.status})`);
            return;
          }

          const payload = (await response.json()) as ICFileShape;
          if (!payload || typeof payload !== "object") {
            errors.push(`Invalid payload for ${file}.json`);
            return;
          }

          const root = (payload as Record<string, unknown>)["74SeriesICs"];
          if (!root) {
            errors.push(`Missing 74SeriesICs in ${file}.json`);
            return;
          }

          collectICs(root as ICFileShape, aggregated);
        } catch (err) {
          const reason = err instanceof Error ? err.message : "Unknown";
          errors.push(`Error loading ${file}.json: ${reason}`);
        }
      })
    );

    const unique = new Map<string, ICDefinition>();
    aggregated.forEach((ic) => {
      if (!unique.has(ic.partNumber)) {
        unique.set(ic.partNumber, ic);
      }
    });

    const sorted = Array.from(unique.values()).sort((a, b) => {
      const aNum = parseInt(a.partNumber.match(/\d+/)?.[0] || "0", 10);
      const bNum = parseInt(b.partNumber.match(/\d+/)?.[0] || "0", 10);
      if (aNum !== bNum) return aNum - bNum;
      return a.partNumber.localeCompare(b.partNumber);
    });

    setIcs(sorted);
    setLoading(false);
    if (errors.length) {
      setError(errors.join("\n"));
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const categorized = useMemo(() => {
    return ics.reduce<Record<string, ICDefinition[]>>((acc, ic) => {
      const key = ic.category || "misc";
      if (!acc[key]) acc[key] = [];
      acc[key].push(ic);
      return acc;
    }, {});
  }, [ics]);

  return {
    ics,
    categorized,
    loading,
    error,
    refresh: loadFiles,
  };
}
