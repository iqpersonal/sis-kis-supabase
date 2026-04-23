import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/api-auth";

/**
 * GET /api/whatsapp/sheet-import?url=<encoded-csv-url>
 *
 * Server-side proxy that fetches a public Google Sheet CSV, scans all columns
 * for phone-number-like values, and returns them as a deduplicated array.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  const csvUrl = req.nextUrl.searchParams.get("url");
  if (!csvUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Only allow Google Sheets / Docs domains for safety
  if (!csvUrl.startsWith("https://docs.google.com/")) {
    return NextResponse.json(
      { error: "Only Google Sheets URLs are supported" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(csvUrl, {
      headers: { "User-Agent": "SiS-Dashboard/1.0" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch sheet: HTTP ${res.status}` },
        { status: 502 }
      );
    }

    const csv = await res.text();
    const phones = extractPhones(csv);

    return NextResponse.json({ phones, total: phones.length });
  } catch (err) {
    console.error("Sheet import error:", err);
    return NextResponse.json(
      { error: "Failed to fetch the Google Sheet. Make sure it is shared publicly." },
      { status: 500 }
    );
  }
}

/**
 * Scan every cell in the CSV for values that look like phone numbers.
 * Accepts formats like: 0501234567, 966501234567, +966 50 123 4567, 050-123-4567
 */
function extractPhones(csv: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  const rows = csv.split("\n");
  for (const row of rows) {
    // Simple CSV split (handles quoted fields)
    const cells = splitCsvRow(row);
    for (const cell of cells) {
      const cleaned = cell.replace(/[\s\-().+]/g, "");
      // Must be 9-15 digits
      if (/^\d{9,15}$/.test(cleaned)) {
        // Normalize: if starts with 0, try to infer Saudi number
        let normalized = cleaned;
        if (cleaned.startsWith("05") && cleaned.length === 10) {
          normalized = "966" + cleaned.slice(1); // 0501234567 → 966501234567
        } else if (cleaned.startsWith("5") && cleaned.length === 9) {
          normalized = "966" + cleaned; // 501234567 → 966501234567
        }
        if (normalized.length >= 9 && !seen.has(normalized)) {
          seen.add(normalized);
          results.push(normalized);
        }
      }
    }
  }

  return results;
}

function splitCsvRow(row: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of row) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}
