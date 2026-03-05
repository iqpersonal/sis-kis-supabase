import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { parse } from "csv-parse/sync";

const COLLECTION = "reports";
const BATCH_SIZE = 500;

/**
 * POST /api/upload
 *
 * Accepts a JSON or CSV file via multipart form-data and uploads
 * the records into the Firestore "reports" collection.
 *
 * For .bak files, the companion endpoint /api/upload/bak handles
 * running the Python extraction first.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const filename = file.name.toLowerCase();
    const text = await file.text();

    let records: Record<string, unknown>[];

    // ── Parse based on file type ──────────────────────────────────
    if (filename.endsWith(".json")) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        records = parsed;
      } else if (typeof parsed === "object") {
        // { tableName: [...] } → take the first table
        const firstKey = Object.keys(parsed)[0];
        records = Array.isArray(parsed[firstKey])
          ? parsed[firstKey]
          : [parsed];
      } else {
        return NextResponse.json(
          { error: "JSON must be an array or object" },
          { status: 400 }
        );
      }
    } else if (filename.endsWith(".csv")) {
      records = parse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: true,
      }) as Record<string, unknown>[];
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Use .json or .csv" },
        { status: 400 }
      );
    }

    if (!records.length) {
      return NextResponse.json(
        { error: "File contains no records" },
        { status: 400 }
      );
    }

    // ── Upload to Firestore in batches ────────────────────────────
    let uploaded = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = adminDb.batch();
      const chunk = records.slice(i, i + BATCH_SIZE);

      for (const record of chunk) {
        const docId =
          (record as Record<string, unknown>).id ??
          (record as Record<string, unknown>).Id;
        const ref = docId
          ? adminDb.collection(COLLECTION).doc(String(docId))
          : adminDb.collection(COLLECTION).doc();
        batch.set(ref, record);
      }

      await batch.commit();
      uploaded += chunk.length;
    }

    return NextResponse.json({
      success: true,
      message: `Uploaded ${uploaded} record(s) to "${COLLECTION}"`,
      count: uploaded,
    });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Upload failed",
      },
      { status: 500 }
    );
  }
}
