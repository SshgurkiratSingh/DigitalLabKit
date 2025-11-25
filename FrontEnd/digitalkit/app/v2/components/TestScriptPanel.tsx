"use client";

import { useState, useCallback, useRef } from "react";

interface TestScriptPanelProps {
  inputPins: number[];
  onExecuteCommand: (pin: number, level: 0 | 1) => Promise<void>;
  isConnected: boolean;
  collapsed: boolean;
  onToggle: () => void;
}

interface ScriptLog {
  id: number;
  timestamp: number;
  type: "info" | "error" | "success" | "warning";
  message: string;
}

export default function TestScriptPanel({
  inputPins,
  onExecuteCommand,
  isConnected,
  collapsed,
  onToggle,
}: TestScriptPanelProps) {
  const [scriptCode, setScriptCode] =
    useState(`// Test Script - Verilog-like syntax
// Commands:
//   pin = value;      // Set pin (1 or 0)
//   #delay;           // Delay in milliseconds
//   repeat(n) { }     // Repeat block n times
//
// Example:
pin2 = 1;
pin3 = 0;
#500;
pin2 = 0;
pin3 = 1;
#1000;`);
  const [isRunning, setRunning] = useState(false);
  const [logs, setLogs] = useState<ScriptLog[]>([]);
  const [currentLine, setCurrentLine] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const logIdRef = useRef(0);

  const addLog = useCallback((type: ScriptLog["type"], message: string) => {
    const log: ScriptLog = {
      id: logIdRef.current++,
      timestamp: Date.now(),
      type,
      message,
    };
    setLogs((prev) => [...prev, log]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
    logIdRef.current = 0;
  }, []);

  const parseScript = useCallback((code: string) => {
    const lines = code.split("\n");
    const commands: Array<{
      type: "set" | "delay" | "repeat_start" | "repeat_end";
      pin?: number;
      value?: 0 | 1;
      delay?: number;
      count?: number;
      lineNumber: number;
    }> = [];

    let lineNumber = 0;
    const repeatStack: Array<{ startIndex: number; count: number }> = [];

    for (const rawLine of lines) {
      lineNumber++;
      const line = rawLine.trim();

      // Skip empty lines and comments
      if (!line || line.startsWith("//")) continue;

      // Handle delay: #500;
      if (line.startsWith("#")) {
        const delayMatch = line.match(/^#(\d+);?/);
        if (delayMatch) {
          commands.push({
            type: "delay",
            delay: parseInt(delayMatch[1], 10),
            lineNumber,
          });
          continue;
        }
      }

      // Handle repeat start: repeat(5) {
      const repeatMatch = line.match(/^repeat\s*\(\s*(\d+)\s*\)\s*\{/);
      if (repeatMatch) {
        const count = parseInt(repeatMatch[1], 10);
        repeatStack.push({ startIndex: commands.length, count });
        commands.push({
          type: "repeat_start",
          count,
          lineNumber,
        });
        continue;
      }

      // Handle repeat end: }
      if (line === "}") {
        if (repeatStack.length === 0) {
          throw new Error(`Line ${lineNumber}: Unmatched closing brace`);
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _repeatInfo = repeatStack.pop()!;
        commands.push({
          type: "repeat_end",
          lineNumber,
        });
        continue;
      }

      // Handle pin assignment: pin2 = 1;
      const pinMatch = line.match(/^pin(\d+)\s*=\s*([01]);?/);
      if (pinMatch) {
        const pin = parseInt(pinMatch[1], 10);
        const value = parseInt(pinMatch[2], 10) as 0 | 1;
        commands.push({
          type: "set",
          pin,
          value,
          lineNumber,
        });
        continue;
      }

      // Unknown command
      throw new Error(`Line ${lineNumber}: Unknown command "${line}"`);
    }

    if (repeatStack.length > 0) {
      throw new Error("Unclosed repeat block");
    }

    return commands;
  }, []);

  const executeScript = useCallback(async () => {
    if (!isConnected) {
      addLog("error", "Not connected to hardware");
      return;
    }

    if (isRunning) {
      addLog("warning", "Script is already running");
      return;
    }

    clearLogs();
    setRunning(true);
    abortControllerRef.current = new AbortController();

    try {
      const commands = parseScript(scriptCode);
      addLog("info", `Parsed ${commands.length} commands`);
      addLog("success", "Starting execution...");

      let commandIndex = 0;
      const repeatStack: Array<{
        startIndex: number;
        count: number;
        current: number;
      }> = [];

      while (commandIndex < commands.length) {
        if (abortControllerRef.current?.signal.aborted) {
          addLog("warning", "Execution aborted by user");
          break;
        }

        const cmd = commands[commandIndex];
        setCurrentLine(cmd.lineNumber);

        switch (cmd.type) {
          case "set":
            if (!inputPins.includes(cmd.pin!)) {
              addLog("error", `Pin ${cmd.pin} is not an input pin`);
              throw new Error(`Pin ${cmd.pin} is not an input pin`);
            }
            addLog("info", `Set pin ${cmd.pin} = ${cmd.value}`);
            await onExecuteCommand(cmd.pin!, cmd.value!);
            break;

          case "delay":
            addLog("info", `Delay ${cmd.delay}ms`);
            await new Promise((resolve) => setTimeout(resolve, cmd.delay!));
            break;

          case "repeat_start":
            repeatStack.push({
              startIndex: commandIndex,
              count: cmd.count!,
              current: 0,
            });
            addLog("info", `Repeat block start (${cmd.count} iterations)`);
            break;

          case "repeat_end":
            if (repeatStack.length === 0) {
              throw new Error("Unexpected repeat end");
            }
            const repeatInfo = repeatStack[repeatStack.length - 1];
            repeatInfo.current++;
            if (repeatInfo.current < repeatInfo.count) {
              // Jump back to start of repeat block
              commandIndex = repeatInfo.startIndex;
              addLog(
                "info",
                `Repeat iteration ${repeatInfo.current + 1}/${repeatInfo.count}`
              );
            } else {
              // Exit repeat block
              repeatStack.pop();
              addLog("info", "Repeat block complete");
            }
            break;
        }

        commandIndex++;
      }

      addLog("success", "Script execution completed");
    } catch (err) {
      addLog("error", err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
      setCurrentLine(null);
      abortControllerRef.current = null;
    }
  }, [
    isConnected,
    isRunning,
    scriptCode,
    parseScript,
    onExecuteCommand,
    inputPins,
    addLog,
    clearLogs,
  ]);

  const stopExecution = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const exampleScripts = {
    basic: `// Basic Pin Toggle
pin2 = 1;
#1500;
pin2 = 0;
#1500;
pin3 = 1;
#1500;
pin3 = 0;`,
    counter: `// Binary Counter on pins 2,3,5
repeat(4) {
  pin2 = 0; pin3 = 0; pin5 = 0;
  #1500;
  pin2 = 1; pin3 = 0; pin5 = 0;
  #1500;
  pin2 = 0; pin3 = 1; pin5 = 0;
  #1500;
  pin2 = 1; pin3 = 1; pin5 = 0;
  #1500;
}`,
    pulse: `// Pulse Train
repeat(5) {
  pin2 = 1;
  #1500;
  pin2 = 0;
  #1500;
}`,
  };

  const loadExample = useCallback(
    (example: keyof typeof exampleScripts) => {
      setScriptCode(exampleScripts[example]);
      clearLogs();
    },
    [clearLogs, exampleScripts]
  );

  if (collapsed) {
    return (
      <div className="fixed bottom-4 left-4 z-40">
        <button
          onClick={onToggle}
          className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-3 text-white shadow-2xl shadow-indigo-500/50 hover:shadow-indigo-500/70 transition-all hover:scale-105 font-semibold"
        >
          📜 Test Script
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-40 w-[600px] max-h-[80vh] flex flex-col rounded-3xl border border-white/20 bg-gradient-to-br from-slate-900/95 via-indigo-900/95 to-purple-900/95 backdrop-blur-2xl shadow-2xl shadow-purple-500/30">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📜</span>
          <div>
            <h3 className="text-lg font-bold text-white">Test Script Runner</h3>
            <p className="text-xs text-white/60">Verilog-like syntax</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-emerald-400 animate-pulse" : "bg-red-400"
            }`}
          />
          <button
            onClick={onToggle}
            className="rounded-lg px-3 py-1 text-sm text-white/70 hover:bg-white/10 transition-colors"
          >
            Minimize
          </button>
        </div>
      </div>

      {/* Examples */}
      <div className="border-b border-white/10 px-5 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/50 font-semibold uppercase tracking-wide">
            Examples:
          </span>
          <button
            onClick={() => loadExample("basic")}
            className="rounded-lg bg-blue-500/20 px-2 py-1 text-xs text-blue-300 hover:bg-blue-500/30 transition-colors"
          >
            Basic
          </button>
          <button
            onClick={() => loadExample("counter")}
            className="rounded-lg bg-purple-500/20 px-2 py-1 text-xs text-purple-300 hover:bg-purple-500/30 transition-colors"
          >
            Counter
          </button>
          <button
            onClick={() => loadExample("pulse")}
            className="rounded-lg bg-pink-500/20 px-2 py-1 text-xs text-pink-300 hover:bg-pink-500/30 transition-colors"
          >
            Pulse
          </button>
        </div>
      </div>

      {/* Code Editor */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="relative">
            <textarea
              value={scriptCode}
              onChange={(e) => setScriptCode(e.target.value)}
              disabled={isRunning}
              className="w-full h-64 rounded-xl border border-white/20 bg-black/40 px-4 py-3 text-sm text-white font-mono focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 resize-none disabled:opacity-50"
              spellCheck={false}
              placeholder="Enter your test script..."
            />
            {currentLine !== null && (
              <div className="absolute top-2 right-2 rounded-lg bg-emerald-500/20 border border-emerald-400/50 px-3 py-1 text-xs font-mono text-emerald-300">
                Line {currentLine}
              </div>
            )}
          </div>
        </div>

        {/* Logs */}
        <div className="h-40 border-t border-white/10 overflow-y-auto bg-black/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-white/50 font-semibold uppercase tracking-wide">
              Execution Log
            </span>
            <button
              onClick={clearLogs}
              className="text-xs text-white/50 hover:text-white/70 transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="space-y-1 font-mono text-xs">
            {logs.length === 0 ? (
              <p className="text-white/30">No logs yet</p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className={`flex items-start gap-2 ${
                    log.type === "error"
                      ? "text-red-400"
                      : log.type === "success"
                      ? "text-emerald-400"
                      : log.type === "warning"
                      ? "text-amber-400"
                      : "text-white/70"
                  }`}
                >
                  <span className="text-white/40">
                    [{new Date(log.timestamp).toLocaleTimeString()}]
                  </span>
                  <span className="flex-1">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="border-t border-white/10 px-5 py-3 flex items-center justify-between">
        <div className="text-xs text-white/50">
          Available pins: {inputPins.length > 0 ? inputPins.join(", ") : "None"}
        </div>
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button
              onClick={stopExecution}
              className="rounded-xl bg-red-500 hover:bg-red-600 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition-all"
            >
              ⏹ Stop
            </button>
          ) : (
            <button
              onClick={executeScript}
              disabled={!isConnected}
              className="rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ▶ Run Script
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
