"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Upload,
  FileUp,
  Database,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";

type UploadMode = "file" | "bak";
type Status = "idle" | "uploading" | "success" | "error";

interface CollectionResult {
  collection: string;
  action: string;
  sql?: number;
  firestore?: number;
  synced?: number;
  deleted?: number;
  years_synced?: string[];
  error?: string;
}

export default function UploadPage() {
  const [mode, setMode] = useState<UploadMode>("bak");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upload Data</h1>
        <p className="text-muted-foreground">
          Import school data from SQL Server backup or files
        </p>
      </div>

      {/* Mode selector */}
      <div className="flex gap-3">
        <Button
          variant={mode === "bak" ? "default" : "outline"}
          onClick={() => setMode("bak")}
        >
          <Database className="mr-2 h-4 w-4" />
          SQL Server .bak
        </Button>
        <Button
          variant={mode === "file" ? "default" : "outline"}
          onClick={() => setMode("file")}
        >
          <FileUp className="mr-2 h-4 w-4" />
          JSON / CSV File
        </Button>
      </div>

      {mode === "bak" ? <BakUploadCard /> : <FileUploadCard />}

      {/* Danger zone */}
      <ClearDataCard />
    </div>
  );
}

// ── JSON / CSV Upload ─────────────────────────────────────────────────────

function FileUploadCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const handleUpload = async () => {
    if (!file) return;
    setStatus("uploading");
    setMessage("");

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setStatus("success");
      setMessage(data.message);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Upload failed");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileUp className="h-5 w-5" />
          Upload JSON or CSV
        </CardTitle>
        <CardDescription>
          Upload a <code>.json</code> or <code>.csv</code> file. Each row/object
          becomes a document in the Firestore &quot;reports&quot; collection.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Input
            ref={fileRef}
            type="file"
            accept=".json,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="max-w-sm"
          />
          <Button onClick={handleUpload} disabled={!file || status === "uploading"}>
            {status === "uploading" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Upload
          </Button>
        </div>

        {file && (
          <p className="text-sm text-muted-foreground">
            Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
          </p>
        )}

        <StatusMessage status={status} message={message} />
      </CardContent>
    </Card>
  );
}

// ── .bak File Upload (Incremental Sync) ──────────────────────────────────

function BakUploadCard() {
  const [bakPath, setBakPath] = useState("");
  const [server, setServer] = useState("localhost\\SQLEXPRESS");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [collections, setCollections] = useState<CollectionResult[]>([]);
  const [totalSynced, setTotalSynced] = useState(0);

  const handleSync = async (useBak: boolean) => {
    if (useBak && !bakPath.trim()) return;
    setStatus("uploading");
    setMessage("");
    setCollections([]);
    setTotalSynced(0);

    try {
      const body: Record<string, string> = { server: server.trim() };
      if (useBak) {
        body.bakPath = bakPath.trim();
      }

      const res = await fetch("/api/upload/bak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Sync failed");
      }

      setStatus("success");
      setMessage(data.message);
      setCollections(data.collections || []);
      setTotalSynced(data.totalSynced || 0);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Sync failed");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          SQL Server Backup Sync
        </CardTitle>
        <CardDescription>
          Incrementally sync data from a SQL Server backup. Only changed data is
          updated — unchanged collections are skipped automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">.bak File Path (optional)</label>
          <Input
            placeholder="C:\backups\khaled-sisnet.bak"
            value={bakPath}
            onChange={(e) => setBakPath(e.target.value)}
            className="max-w-lg"
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to sync from the already-restored database
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">SQL Server Instance</label>
          <Input
            placeholder="localhost\SQLEXPRESS"
            value={server}
            onChange={(e) => setServer(e.target.value)}
            className="max-w-lg"
          />
        </div>

        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
          <strong>Incremental sync:</strong> Compares SQL Server data with
          Firestore per academic year. Only years with different row counts are
          re-synced. Unchanged data is skipped — fast and cost-efficient.
        </div>

        <div className="flex gap-3">
          <Button
            onClick={() => handleSync(true)}
            disabled={!bakPath.trim() || status === "uploading"}
          >
            {status === "uploading" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Database className="mr-2 h-4 w-4" />
            )}
            {status === "uploading" ? "Syncing…" : "Restore & Sync"}
          </Button>

          <Button
            variant="outline"
            onClick={() => handleSync(false)}
            disabled={status === "uploading"}
          >
            {status === "uploading" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync from Existing DB
          </Button>
        </div>

        <StatusMessage status={status} message={message} />

        {/* Collection-level results */}
        {collections.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">
              Sync Results ({totalSynced.toLocaleString()} documents synced)
            </h4>
            <div className="max-h-80 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Collection</th>
                    <th className="px-3 py-2 text-left font-medium">Action</th>
                    <th className="px-3 py-2 text-right font-medium">SQL</th>
                    <th className="px-3 py-2 text-right font-medium">Synced</th>
                    <th className="px-3 py-2 text-left font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {collections.map((c, i) => (
                    <tr key={i} className={c.action === "skip" ? "text-muted-foreground" : ""}>
                      <td className="px-3 py-1.5 font-mono text-xs">{c.collection}</td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            c.action === "skip"
                              ? "bg-muted text-muted-foreground"
                              : c.action === "error"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                          }`}
                        >
                          {c.action}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {(c.sql ?? c.firestore ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {(c.synced ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">
                        {c.years_synced
                          ? `Years: ${c.years_synced.join(", ")}`
                          : c.error
                            ? c.error
                            : c.action === "skip"
                              ? "No changes"
                              : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Clear Collection ──────────────────────────────────────────────────────

function ClearDataCard() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);

  const handleClear = async () => {
    setStatus("uploading");
    setMessage("");
    setConfirming(false);

    try {
      const res = await fetch("/api/upload/clear", { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to clear");
      }

      setStatus("success");
      setMessage(data.message);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Failed to clear");
    }
  };

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Trash2 className="h-5 w-5" />
          Clear All Data
        </CardTitle>
        <CardDescription>
          Remove all documents from the &quot;reports&quot; collection. Use this
          before re-importing to avoid duplicates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!confirming ? (
          <Button
            variant="destructive"
            onClick={() => setConfirming(true)}
            disabled={status === "uploading"}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear Collection
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-destructive">
              Are you sure?
            </span>
            <Button variant="destructive" size="sm" onClick={handleClear}>
              Yes, delete all
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        )}

        <StatusMessage status={status} message={message} />
      </CardContent>
    </Card>
  );
}

// ── Status Message ────────────────────────────────────────────────────────

function StatusMessage({ status, message }: { status: Status; message: string }) {
  if (status === "idle" || !message) return null;

  return (
    <div
      className={`flex items-start gap-2 rounded-md p-3 text-sm ${
        status === "success"
          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          : status === "error"
            ? "bg-destructive/10 text-destructive"
            : "bg-muted text-muted-foreground"
      }`}
    >
      {status === "success" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
      {status === "error" && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      {status === "uploading" && (
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
      )}
      <span>{message}</span>
    </div>
  );
}
