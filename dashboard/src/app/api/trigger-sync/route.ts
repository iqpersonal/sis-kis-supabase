import { NextRequest } from "next/server";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { verifySuperAdmin } from "@/lib/api-auth";

const PYTHON =
  "c:\\Users\\Admin\\Desktop\\Project\\SiS\\.venv\\Scripts\\python.exe";

interface Step {
  label: string;
  script: string;
  args?: string[];
}

const STEPS: Step[] = [
  { label: "Syncing SQL tables to Firestore", script: "live_sync_to_firestore.py", args: ["--mode", "quick"] },
  { label: "Generating summaries", script: "generate_summaries.py" },
  { label: "Building browse index", script: "build_browse_index.py" },
];

function buildSteps(mode: string, year?: string, preset?: string): Step[] {
  const syncArgs: string[] = [];

  if (preset) {
    syncArgs.push("--preset", preset);
    if (year) syncArgs.push("--year", year);
    // Preset sync: only the sync script, skip summaries/browse index
    return [
      { label: `Syncing ${preset} data${year ? ` (${year})` : ""}`, script: "live_sync_to_firestore.py", args: syncArgs },
    ];
  }

  if (year) {
    syncArgs.push("--year", year);
  } else {
    syncArgs.push("--mode", mode);
  }

  const summaryArgs: string[] = year ? [year] : [];

  return [
    { label: `Syncing SQL tables to Firestore${year ? ` (year ${year})` : ` (${mode})`}`, script: "live_sync_to_firestore.py", args: syncArgs },
    { label: `Generating summaries${year ? ` (${year})` : ""}`, script: "generate_summaries.py", args: summaryArgs },
    { label: "Building browse index", script: "build_browse_index.py" },
  ];
}

function runScript(
  pythonExe: string,
  scriptPath: string,
  cwd: string,
  onData: (line: string) => void,
  extraArgs: string[] = []
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(pythonExe, ["-u", scriptPath, ...extraArgs], {
      cwd,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
    });

    const handleOutput = (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) onData(trimmed);
      }
    };

    child.stdout?.on("data", handleOutput);
    child.stderr?.on("data", handleOutput);
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", reject);
  });
}

/**
 * POST /api/trigger-sync
 *
 * Triggers the full daily sync pipeline (live SQL → Firestore + summaries + browse index).
 * Runs each Python script sequentially, streaming real-time output via SSE.
 * Only works on localhost where Python + SQL Server are accessible.
 */
export async function POST(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    // Parse optional body: { mode?: "quick"|"full", year?: "25-26", preset?: "booksale" }
    let mode = "quick";
    let year: string | undefined;
    let preset: string | undefined;
    try {
      const body = await req.json();
      if (body.mode === "quick" || body.mode === "full") mode = body.mode;
      if (body.year && /^\d{2}-\d{2}$/.test(body.year)) year = body.year;
      if (body.preset && /^[a-z]+$/.test(body.preset)) preset = body.preset;
    } catch {
      // no body or invalid JSON — use defaults
    }

    const steps = buildSteps(mode, year, preset);
    const scriptsDir = path.resolve(process.cwd(), "..", "scripts");

    // Verify scripts exist
    for (const step of steps) {
      const p = path.join(scriptsDir, step.script);
      if (!fs.existsSync(p)) {
        return new Response(
          JSON.stringify({ error: `${step.script} not found at ${p}` }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Verify Python exists
    if (!fs.existsSync(PYTHON)) {
      return new Response(
        JSON.stringify({ error: `Python not found at ${PYTHON}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const send = (data: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            // stream may have been closed by client
          }
        };

        // Update Firestore sync status
        const updateStatus = (step: string, status: string, message = "") => {
          const statusScript = path.join(scriptsDir, "write_sync_status.py");
          if (fs.existsSync(statusScript)) {
            const args = ["-u", statusScript, "--step", step, "--status", status];
            if (message) args.push("--message", message);
            spawn(PYTHON, args, { cwd: scriptsDir, detached: true, stdio: "ignore" });
          }
        };

        (async () => {
          const totalSteps = steps.length;
          let allSuccess = true;

          updateStatus("daily_sync", "running");

          for (let i = 0; i < totalSteps; i++) {
            const step = steps[i];
            const stepNum = i + 1;
            const scriptPath = path.join(scriptsDir, step.script);

            send({
              type: "progress",
              step: stepNum,
              totalSteps,
              label: step.label,
              percent: Math.round((i / totalSteps) * 100),
              message: `[${stepNum}/${totalSteps}] ${step.label}...`,
            });

            const statusKey = i === 0 ? "data_sync" : i === 1 ? "summaries" : null;
            if (statusKey) updateStatus(statusKey, "running");

            try {
              const code = await runScript(PYTHON, scriptPath, scriptsDir, (line) => {
                send({ type: "log", message: `[${stepNum}/${totalSteps}] ${line}` });
              }, step.args || []);

              if (code !== 0) {
                allSuccess = false;
                send({ type: "log", message: `[${stepNum}/${totalSteps}] ⚠ ${step.script} exited with code ${code}` });
                if (statusKey) updateStatus(statusKey, "error", `Exit code ${code}`);
              } else {
                send({ type: "log", message: `[${stepNum}/${totalSteps}] ✓ ${step.label} completed` });
                if (statusKey) updateStatus(statusKey, "success");
              }
            } catch (err) {
              allSuccess = false;
              const msg = err instanceof Error ? err.message : "Unknown error";
              send({ type: "log", message: `[${stepNum}/${totalSteps}] ✗ Error: ${msg}` });
              if (statusKey) updateStatus(statusKey, "error", msg);
            }
          }

          updateStatus("daily_sync", allSuccess ? "success" : "error");

          send({
            type: "done",
            success: allSuccess,
            percent: 100,
            message: allSuccess
              ? "All sync steps completed successfully!"
              : "Sync finished with errors — check the log above.",
          });
          controller.close();
        })();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Trigger sync error:", err);
    const message = err instanceof Error ? err.message : "Sync trigger failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
