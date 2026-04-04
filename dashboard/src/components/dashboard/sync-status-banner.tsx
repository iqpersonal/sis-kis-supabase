"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { RefreshCw, CheckCircle2, AlertCircle, Loader2, Play, ChevronDown } from "lucide-react";

interface StepStatus {
  status: string;
  updated_at: string;
  message?: string;
}

interface SyncStatus {
  last_sync?: string;
  daily_sync?: StepStatus;
  data_sync?: StepStatus;
  summaries?: StepStatus;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function StatusIcon({ status }: { status?: string }) {
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
  if (status === "success") return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  if (status === "error") return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
  return <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />;
}

type SyncMode = "quick" | "full" | "year";

export function SyncStatusBanner() {
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [progress, setProgress] = useState<{ step: number; totalSteps: number; label: string; percent: number } | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>("quick");
  const [selectedYear, setSelectedYear] = useState("");
  const [years, setYears] = useState<string[]>([]);
  const [showOptions, setShowOptions] = useState(false);

  const fetchStatus = useCallback(() => {
    fetch("/api/sync-status")
      .then((r) => r.json())
      .then((d) => setSync(d.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    fetch("/api/academic-years")
      .then((r) => r.json())
      .then((d) => {
        if (d.years) {
          setYears(d.years);
          if (d.years.length > 0 && !selectedYear) setSelectedYear(d.years[d.years.length - 1]);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [syncLogs]);

  const handleSyncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncLogs([]);
    setShowLogs(true);
    setProgress(null);
    setShowOptions(false);

    try {
      const body: Record<string, string> = {};
      if (syncMode === "year" && selectedYear) {
        body.year = selectedYear;
      } else if (syncMode === "full") {
        body.mode = "full";
      } else {
        body.mode = "quick";
      }

      const res = await fetch("/api/trigger-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        setSyncLogs((prev) => [...prev, `Error: ${err.error || "Failed to start sync"}`]);
        setSyncing(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setSyncLogs((prev) => [...prev, "Error: No response stream"]);
        setSyncing(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "progress") {
                setProgress({ step: data.step, totalSteps: data.totalSteps, label: data.label, percent: data.percent });
              } else if (data.type === "log") {
                setSyncLogs((prev) => [...prev, data.message]);
              } else if (data.type === "done") {
                setProgress(null);
                setSyncLogs((prev) => [
                  ...prev,
                  data.success ? "✓ All sync steps completed successfully!" : `✗ ${data.message}`,
                ]);
                fetchStatus();
              } else if (data.type === "error") {
                setSyncLogs((prev) => [...prev, `Error: ${data.message}`]);
              }
            } catch {
              // skip invalid JSON
            }
          }
        }
      }
    } catch (err) {
      setSyncLogs((prev) => [
        ...prev,
        `Error: ${err instanceof Error ? err.message : "Connection failed"}`,
      ]);
    } finally {
      setSyncing(false);
    }
  };

  if (!sync) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-2 text-sm text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5" />
        <span>No sync data yet. Run the daily sync to populate.</span>
        <button
          onClick={handleSyncNow}
          disabled={syncing}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          Sync Now
        </button>
      </div>
    );
  }

  const lastSync = sync.last_sync || sync.daily_sync?.updated_at;
  const isRunning = sync.daily_sync?.status === "running" || syncing;
  const hasError = sync.data_sync?.status === "error" || sync.summaries?.status === "error";

  return (
    <div className="space-y-2">
      <div
        className={`flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border px-4 py-2 text-sm ${
          hasError
            ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
            : isRunning
              ? "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950"
              : "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
        }`}
      >
        <div className="flex items-center gap-2 font-medium">
          <RefreshCw className={`h-4 w-4 ${isRunning ? "animate-spin text-blue-500" : ""}`} />
          Last Sync
        </div>

        {lastSync && (
          <span className="text-muted-foreground" title={formatDate(lastSync)}>
            {formatDate(lastSync)} ({formatRelative(lastSync)})
          </span>
        )}

        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <StatusIcon status={sync.data_sync?.status} /> Data
          </span>
          <span className="flex items-center gap-1">
            <StatusIcon status={sync.summaries?.status} /> Summaries
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Sync options dropdown */}
          {!syncing && (
            <div className="relative">
              <button
                onClick={() => setShowOptions(!showOptions)}
                className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              >
                {syncMode === "quick" ? "Quick" : syncMode === "full" ? "Full" : `Year ${selectedYear}`}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showOptions && (
                <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border bg-background p-1 shadow-lg">
                  <button
                    onClick={() => { setSyncMode("quick"); setShowOptions(false); }}
                    className={`w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted ${syncMode === "quick" ? "bg-muted font-medium" : ""}`}
                  >
                    Quick Sync <span className="text-muted-foreground">— current year</span>
                  </button>
                  <button
                    onClick={() => { setSyncMode("full"); setShowOptions(false); }}
                    className={`w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted ${syncMode === "full" ? "bg-muted font-medium" : ""}`}
                  >
                    Full Sync <span className="text-muted-foreground">— all years</span>
                  </button>
                  <div className="my-1 border-t" />
                  <div className="px-2 py-1 text-xs text-muted-foreground">Sync specific year:</div>
                  <div className="max-h-32 overflow-y-auto">
                    {years.map((y) => (
                      <button
                        key={y}
                        onClick={() => { setSyncMode("year"); setSelectedYear(y); setShowOptions(false); }}
                        className={`w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted ${syncMode === "year" && selectedYear === y ? "bg-muted font-medium" : ""}`}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
        </div>

        {hasError && sync.data_sync?.status === "error" && sync.data_sync.message && (
          <span className="text-xs text-red-600">{sync.data_sync.message}</span>
        )}
        {hasError && sync.summaries?.status === "error" && sync.summaries.message && (
          <span className="text-xs text-red-600">{sync.summaries.message}</span>
        )}
      </div>

      {/* Sync log output */}
      {showLogs && syncLogs.length > 0 && (
        <div className="relative rounded-lg border bg-muted/50 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Sync Log</span>
            {!syncing && (
              <button
                onClick={() => { setShowLogs(false); setSyncLogs([]); }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </button>
            )}
          </div>
          {/* Progress bar */}
          {syncing && progress && (
            <div className="mb-2">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium">Step {progress.step}/{progress.totalSteps}: {progress.label}</span>
                <span className="text-muted-foreground">{progress.percent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}
          <div className="max-h-48 overflow-y-auto rounded bg-background p-2 font-mono text-xs">
            {syncLogs.map((log, i) => (
              <div
                key={i}
                className={
                  log.startsWith("Error:") || log.includes("✗")
                    ? "text-red-500"
                    : log.includes("✓") || log.includes("completed successfully")
                      ? "text-green-600"
                      : "text-muted-foreground"
                }
              >
                {log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
