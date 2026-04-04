import { NextRequest } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { verifySuperAdmin } from "@/lib/api-auth";

/**
 * POST /api/upload/bak
 *
 * Runs the incremental sync Python script with real-time progress streaming.
 * Sends Server-Sent Events (SSE) so the frontend can show a progress bar.
 *
 * Body: { bakPath?: string, server?: string }
 */
export async function POST(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { bakPath, server = "localhost\\SQLEXPRESS" } = body as {
      bakPath?: string;
      server?: string;
    };

    // If bakPath provided, verify it exists
    if (bakPath && !fs.existsSync(bakPath)) {
      return new Response(
        JSON.stringify({ error: `File not found: ${bakPath}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Locate the incremental sync script
    const scriptPath = path.resolve(
      process.cwd(),
      "..",
      "scripts",
      "incremental_sync.py"
    );

    if (!fs.existsSync(scriptPath)) {
      return new Response(
        JSON.stringify({
          error:
            "incremental_sync.py not found. Ensure it exists at scripts/incremental_sync.py",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build command args
    const args = [scriptPath, "--server", server];
    if (bakPath) {
      args.push("--bak", bakPath);
    }

    // Stream response using SSE
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const child = spawn("python", args, {
          cwd: path.dirname(scriptPath),
          env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        });

        let stdoutData = "";

        // stdout → collect JSON summary (final result)
        child.stdout.on("data", (chunk: Buffer) => {
          stdoutData += chunk.toString("utf-8");
        });

        // stderr → parse PROGRESS: lines and forward as SSE events
        child.stderr.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf-8");
          const lines = text.split("\n");

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("PROGRESS:")) {
              const jsonStr = trimmed.slice("PROGRESS:".length);
              try {
                const progressData = JSON.parse(jsonStr);
                const event = `data: ${JSON.stringify({ type: "progress", ...progressData })}\n\n`;
                controller.enqueue(encoder.encode(event));
              } catch {
                // Not valid JSON — skip
              }
            } else if (trimmed) {
              // Forward other stderr as log events
              const event = `data: ${JSON.stringify({ type: "log", message: trimmed })}\n\n`;
              controller.enqueue(encoder.encode(event));
            }
          }
        });

        child.on("close", (code) => {
          // Parse final summary from stdout
          let result: { success: boolean; total_synced: number; collections: unknown[] } | null = null;
          try {
            result = JSON.parse(stdoutData.trim());
          } catch {
            // ignore parse errors
          }

          if (result) {
            const doneEvent = `data: ${JSON.stringify({
              type: "done",
              success: result.success,
              totalSynced: result.total_synced,
              collections: result.collections,
              message: `Sync complete. ${result.total_synced.toLocaleString()} documents synced.`,
            })}\n\n`;
            controller.enqueue(encoder.encode(doneEvent));
          } else {
            const errEvent = `data: ${JSON.stringify({
              type: "done",
              success: code === 0,
              message: code === 0 ? "Sync completed" : `Script exited with code ${code}`,
              log: stdoutData,
            })}\n\n`;
            controller.enqueue(encoder.encode(errEvent));
          }

          controller.close();
        });

        child.on("error", (err) => {
          let errorMsg = err.message;
          if (errorMsg.includes("ENOENT") && errorMsg.includes("python")) {
            errorMsg = "Python is not installed or not in PATH";
          }
          const errEvent = `data: ${JSON.stringify({
            type: "error",
            message: errorMsg,
          })}\n\n`;
          controller.enqueue(encoder.encode(errEvent));
          controller.close();
        });
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
    console.error("BAK sync error:", err);
    const message = err instanceof Error ? err.message : "Sync failed";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
