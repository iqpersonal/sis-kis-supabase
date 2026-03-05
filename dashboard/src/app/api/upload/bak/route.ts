import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * POST /api/upload/bak
 *
 * Runs the incremental sync Python script.
 * - If bakPath is provided: restores .bak then syncs only what changed
 * - If bakPath is omitted: syncs from the existing _bak_import_temp DB
 *
 * Body: { bakPath?: string, server?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { bakPath, server = "localhost\\SQLEXPRESS" } = body as {
      bakPath?: string;
      server?: string;
    };

    // If bakPath provided, verify it exists
    if (bakPath && !fs.existsSync(bakPath)) {
      return NextResponse.json(
        { error: `File not found: ${bakPath}` },
        { status: 400 }
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
      return NextResponse.json(
        {
          error:
            "incremental_sync.py not found. Ensure it exists at scripts/incremental_sync.py",
        },
        { status: 500 }
      );
    }

    // Build command
    let cmd = `python "${scriptPath}" --server "${server}"`;
    if (bakPath) {
      cmd += ` --bak "${bakPath}"`;
    }

    // Run with generous timeout (large datasets take time)
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 1_800_000, // 30 min timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    if (stderr) {
      console.log("Sync log:", stderr);
    }

    // stdout contains JSON summary from the script
    let result: { success: boolean; total_synced: number; collections: unknown[] };
    try {
      result = JSON.parse(stdout.trim());
    } catch {
      // If JSON parsing fails, return raw output
      return NextResponse.json({
        success: true,
        message: "Sync completed",
        log: stdout,
        details: stderr,
      });
    }

    return NextResponse.json({
      success: result.success,
      message: `Incremental sync complete. ${result.total_synced.toLocaleString()} documents synced.`,
      totalSynced: result.total_synced,
      collections: result.collections,
      log: stderr,
    });
  } catch (err) {
    console.error("BAK sync error:", err);

    const message =
      err instanceof Error ? err.message : "Sync failed";

    // Check for common issues
    if (message.includes("ENOENT") && message.includes("python")) {
      return NextResponse.json(
        { error: "Python is not installed or not in PATH" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
