// This component is responsible for loading IC data from JSON files
// and managing the list of available ICs.
"use client";

import { useState, useEffect, useCallback } from "react";
import { ICData } from "../types";

export interface ICDataManagerProps {
  onICsLoaded: (allICs: ICData[]) => void;
  onICSelected: (selectedIC: ICData | null) => void; // To inform parent about selection
  logMessage: (log: {
    type: "info" | "error" | "warning";
    message: string;
  }) => void;
  // If ICDataManager also handles selection UI via ICSelector, it would need more props.
  // But per instructions, it provides data and selection logic, parent renders ICSelector.
}

const ICDataManager = ({
  onICsLoaded,
  onICSelected,
  logMessage,
}: ICDataManagerProps) => {
  const [allICs, setAllICs] = useState<ICData[]>([]);
  // As per instruction: "For now, let ICDataManager manage selectedIC."
  const [selectedIC, setSelectedIC] = useState<ICData | null>(null);

  // Log helper
  const addLog = useCallback(
    (
      type: "info" | "error" | "warning",
      message: string
    ) => {
      logMessage({ type, message });
    },
    [logMessage]
  );

  // Load IC data from JSON files
  useEffect(() => {
    const loadICData = async () => {
      addLog("info", "ICDataManager: Starting IC data load...");
      try {
        const icFiles = [
          "BCDDecoderIC.json", "CounterIC.json", "ShiftRegisterIC.json",
          "arithmeticIc.json", "combinationalIC.json", "comparatorIc.json",
          "sequentialIC.json",
        ];
        const loadedICs: ICData[] = [];
        for (const file of icFiles) {
          try {
            const response = await fetch(`/files/${file}`);
            if (!response.ok) {
              throw new Error(`Failed to load ${file}: ${response.statusText} (${response.status})`);
            }
            const data = await response.json();
            if (!data || typeof data !== "object") {
              throw new Error(`Invalid data format in ${file}`);
            }
            Object.values(data).forEach((series: any) => {
              if (series && typeof series === "object") {
                Object.values(series).forEach((category: any) => {
                  if (category && typeof category === "object") {
                    Object.values(category).forEach((ic: any) => {
                      if (
                        ic && typeof ic === "object" &&
                        ic.partNumber && typeof ic.partNumber === "string" &&
                        ic.description && typeof ic.description === "string" &&
                        ic.category && typeof ic.category === "string" &&
                        ic.pinCount && typeof ic.pinCount === "number" &&
                        Array.isArray(ic.pinConfiguration) &&
                        ic.pinConfiguration.every(
                          (pin: any) =>
                            pin && typeof pin.pin === "number" &&
                            typeof pin.name === "string" &&
                            typeof pin.type === "string" &&
                            typeof pin.function === "string"
                        )
                      ) {
                        loadedICs.push(ic as ICData);
                      } else {
                        // addLog("warning", `ICDataManager: Skipping IC with invalid/missing properties from ${file}: ${ ic.partNumber || "unknown"}`);
                      }
                    });
                  }
                });
              }
            });
          } catch (fileError) {
             const errorMsg = fileError instanceof Error ? fileError.message : String(fileError);
             addLog("error", `ICDataManager: Error processing file ${file}: ${errorMsg}`);
          }
        }

        setAllICs(loadedICs);
        onICsLoaded(loadedICs); // Inform parent that ICs are loaded
        addLog("info", `ICDataManager: Successfully loaded ${loadedICs.length} ICs.`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        addLog("error", `ICDataManager: Failed to load main IC data list: ${errorMessage}.`);
        console.error("ICDataManager: Error loading IC data:", error);
        onICsLoaded([]); // Send empty list on failure
      }
    };

    loadICData();
  }, [addLog, onICsLoaded]); // addLog and onICsLoaded are dependencies

  // Method to handle IC selection, can be called by parent via ref or if ICSelector was internal
  // For this task, parent will get allICs and render ICSelector, then call a handler here.
  // So, this component needs to expose a selection handler.
  // However, the prompt states "onICSelected: Callback to inform the parent when an IC is selected"
  // This implies selection happens here.
  // Let's provide a function that the parent can call, or that ICSelector (if it were a child) would call.
  // For now, let's assume the parent will call a method on this component to set the selected IC.
  // This will be simplified if parent manages selectedIC.
  // Re-reading: "ICDataManager will fetch data, manage allICs, and expose a way to select an IC."
  // "onICSelected: Callback to inform the parent when an IC is selected, passing the selectedICData."
  // This means this component *does* the selection and informs parent.

  const selectIC = useCallback((ic: ICData | null) => {
    setSelectedIC(ic);
    onICSelected(ic); // Inform parent
    if (ic) {
      addLog("info", `ICDataManager: IC selected - ${ic.partNumber}`);
    } else {
      addLog("info", `ICDataManager: IC deselected.`);
    }
  }, [addLog, onICSelected]);

  // ICDataManager doesn't render any UI itself, it's a data provider component.
  // Parent component will use onICsLoaded to get data for ICSelector.
  // Parent component will use onICSelected to know which IC is chosen.
  // To make `selectIC` callable by the parent, we need useImperativeHandle.

  return null; // This component does not render UI directly
};

// To expose `selectIC` and `allICs` (or just trigger selection), we might need a ref.
// For now, onICsLoaded provides allICs.
// onICSelected is called when selectIC is called.
// The parent will need a way to call selectIC.
// Let's assume the parent passes an IC to be selected, or ICDataManager provides the selectIC function
// back to the parent via another callback during initialization.

// For this iteration, the parent will receive `allICs` from `onICsLoaded`.
// The parent will render `ICSelector`. When `ICSelector` picks an IC,
// the parent will call a method on `ICDataManager` (exposed via ref) to make the selection,
// which in turn calls `onICSelected`.

export interface ICDataManagerHandle {
  selectIC: (ic: ICData | null) => void;
  getAllICs: () => ICData[]; // Might be useful for parent if needed outside of onICsLoaded
}

import React, { useImperativeHandle } from "react"; // Import React for forwardRef

const ICDataManagerWithHandle = React.forwardRef<ICDataManagerHandle, ICDataManagerProps>(
  (props, ref) => {
    // Re-use the component logic, but pass ref
    const { onICsLoaded, onICSelected, logMessage } = props;
    const [allICs, setAllICs] = useState<ICData[]>([]);
    const [selectedIC, setSelectedIC] = useState<ICData | null>(null); // Managed here

    const addLog = useCallback((type: "info" | "error" | "warning", message: string) => {
        logMessage({ type, message });
      },[logMessage]);

    useEffect(() => {
      // ... (loading logic as above)
      const loadICData = async () => {
        addLog("info", "ICDataManager: Starting IC data load...");
        try {
          const icFiles = [
            "BCDDecoderIC.json", "CounterIC.json", "ShiftRegisterIC.json",
            "arithmeticIc.json", "combinationalIC.json", "comparatorIc.json",
            "sequentialIC.json",
          ];
          const loadedICs: ICData[] = [];
          for (const file of icFiles) {
            try {
              const response = await fetch(`/files/${file}`);
              if (!response.ok) {
                throw new Error(`Failed to load ${file}: ${response.statusText} (${response.status})`);
              }
              const data = await response.json();
              // ... (data processing as above) ...
              Object.values(data).forEach((series: any) => { /* ... */
                if (series && typeof series === "object") {
                  Object.values(series).forEach((category: any) => {
                    if (category && typeof category === "object") {
                      Object.values(category).forEach((ic: any) => {
                        if (
                          ic && typeof ic === "object" &&
                          ic.partNumber && typeof ic.partNumber === "string" &&
                          ic.description && typeof ic.description === "string" &&
                          ic.category && typeof ic.category === "string" &&
                          ic.pinCount && typeof ic.pinCount === "number" &&
                          Array.isArray(ic.pinConfiguration) &&
                          ic.pinConfiguration.every(
                            (pin: any) =>
                              pin && typeof pin.pin === "number" &&
                              typeof pin.name === "string" &&
                              typeof pin.type === "string" &&
                              typeof pin.function === "string"
                          )
                        ) {
                          loadedICs.push(ic as ICData);
                        } else {
                          // addLog("warning", `ICDataManager: Skipping IC with invalid/missing properties from ${file}: ${ ic.partNumber || "unknown"}`);
                        }
                      });
                    }
                  });
                }
              });
            } catch (fileError) {
               const errorMsg = fileError instanceof Error ? fileError.message : String(fileError);
               addLog("error", `ICDataManager: Error processing file ${file}: ${errorMsg}`);
            }
          }
          setAllICs(loadedICs);
          onICsLoaded(loadedICs);
          addLog("info", `ICDataManager: Successfully loaded ${loadedICs.length} ICs.`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
          addLog("error", `ICDataManager: Failed to load main IC data list: ${errorMessage}.`);
          console.error("ICDataManager: Error loading IC data:", error);
          onICsLoaded([]);
        }
      };
      loadICData();
    }, [addLog, onICsLoaded]);

    const handleSelectIC = useCallback((ic: ICData | null) => {
      setSelectedIC(ic);
      onICSelected(ic); // Inform parent
      if (ic) {
        addLog("info", `ICDataManager: IC selected - ${ic.partNumber}`);
      } else {
        addLog("info", `ICDataManager: IC deselected.`);
      }
    }, [addLog, onICSelected]);

    useImperativeHandle(ref, () => ({
      selectIC: handleSelectIC,
      getAllICs: () => allICs,
    }));

    return null; // No UI rendered by this component
  }
);

export default ICDataManagerWithHandle;
