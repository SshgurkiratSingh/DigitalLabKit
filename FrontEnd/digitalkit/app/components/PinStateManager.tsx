// This component is responsible for processing pin state changes
// and generating the appropriate command string.
"use client";

import React, { useImperativeHandle, useCallback } from "react";
import { ICData } from "../types";

export interface PinStateManagerProps {
  selectedIC: ICData | null; // To get pinCount
  currentPinStates: { [key: number]: boolean }; // Current complete pin states from parent
  onPinStateCommandGenerated: (command: string) => void;
  logMessage: (log: {
    type: "info" | "error" | "warning";
    message: string;
  }) => void;
}

export interface PinStateManagerHandle {
  processPinChanges: (newPinChanges: { [key: number]: boolean }) => void;
}

const PinStateManager = React.forwardRef<
  PinStateManagerHandle,
  PinStateManagerProps
>(
  (
    { selectedIC, currentPinStates, onPinStateCommandGenerated, logMessage },
    ref
  ) => {
    const addLog = useCallback(
      (
        type: "info" | "error" | "warning",
        message: string
      ) => {
        logMessage({ type, message });
      },
      [logMessage]
    );

    const processPinChanges = useCallback(
      (newPinChanges: { [key: number]: boolean }) => {
        if (!selectedIC) {
          addLog(
            "warning",
            "PinStateManager: Cannot process pin changes, no IC selected."
          );
          return;
        }

        let pinStateStr = "";
        const pinCount = selectedIC.pinCount || 14; // Default to 14 if not specified

        if (pinCount < 14 || pinCount > 16) {
          addLog(
            "error",
            `PinStateManager: Invalid pin count for selected IC ${selectedIC.partNumber}: ${pinCount}. Must be between 14 and 16.`
          );
          return;
        }

        // Build the binary string based on currentPinStates (from parent) and newPinChanges
        for (let i = 1; i <= pinCount; i++) {
          // If the pin state is being changed explicitly, use the new state
          // Otherwise, use the current state from parent's pinStates
          const state =
            i in newPinChanges
              ? newPinChanges[i]
              : currentPinStates[i] || false;
          pinStateStr += state ? "1" : "0";
        }

        if (pinStateStr.length !== pinCount) {
           addLog(
            "error",
            `PinStateManager: Generated pin state string length (${pinStateStr.length}) does not match IC pin count (${pinCount}).`
          );
          return;
        }

        const command = `PINS:${pinStateStr}\n`;
        addLog(
          "info",
          `PinStateManager: Generated command: ${command.trim()} for IC ${selectedIC.partNumber}`
        );
        onPinStateCommandGenerated(command);
      },
      [selectedIC, currentPinStates, onPinStateCommandGenerated, addLog]
    );

    useImperativeHandle(ref, () => ({
      processPinChanges,
    }));

    return null; // This component does not render UI
  }
);

export default PinStateManager;
