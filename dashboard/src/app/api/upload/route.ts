import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { parse } from "csv-parse/sync";
import { verifySuperAdmin } from "@/lib/api-auth";

const TABLE = "reports";
const BATCH_SIZE = 500;

export async function POST(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const filename = file.name.toLowerCase();
    const text = await file.text();
    let records: Record<string, unknown>[];

    if (filename.endsWith(".json")) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) records = parsed;
      else if (typeof parsed === "object") { const k = Object.keys(parsed)[0]; records = Array.isArray(parsed[k]) ? parsed[k] : [parsed]; }
      else return NextResponse.json({ error: "JSON must be an array or object" }, { status: 400 });
    } else if (filename.endsWith(".csv")) {
      records = parse(text, { columns: true, skip_empty_lines: true, trim: true, cast: true }) as Record<string, unknown>[];
    } else {
      return NextResponse.json({ error: "Unsupported file type. Use .json or .csv" }, { status: 400 });
    }

    if (!records.length) return NextResponse.json({ error: "File contains no records" }, { status: 400 });

    const supabase = createServiceClient();
    let uploaded = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const chunk = records.slice(i, i + BATCH_SIZE);
      const rows = chunk.map((record) => {
        const docId = record.id ?? record.Id;
        return { id: docId ? String(docId) : crypto.randomUUID(), data: record };
      });
      await supabase.from(TABLE).upsert(rows);
      uploaded += chunk.length;
    }

    return NextResponse.json({ success: true, message: `Uploaded ${uploaded} record(s) to "${TABLE}"`, count: uploaded });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 500 });
  }
}
