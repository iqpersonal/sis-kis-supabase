import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_MEDIUM } from "@/lib/cache-headers";
import { verifyAdmin } from "@/lib/api-auth";

const DOC_PATH = "parent_config/transcript_settings";

/**
 * GET /api/transcript-settings
 * Returns the transcript configuration (principal names, logos, etc.)
 */
export async function GET() {
  try {
    const snap = await adminDb.doc(DOC_PATH).get();
    if (!snap.exists) {
      return NextResponse.json({ data: null }, { headers: CACHE_MEDIUM });
    }
    return NextResponse.json({ data: snap.data() }, { headers: CACHE_MEDIUM });
  } catch (err) {
    console.error("Failed to fetch transcript settings:", err);
    return NextResponse.json(
      { error: "Failed to fetch transcript settings" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/transcript-settings
 * Save/update transcript configuration.
 * Body: { schools: { "0021-01": { ... }, "0021-02": { ... } }, school_logo: "...", cognia_logo: "..." }
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();

    // Only allow known fields to prevent arbitrary data injection
    const allowed = ["schools", "school_logo", "cognia_logo"];
    const sanitized: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) sanitized[key] = body[key];
    }

    await adminDb.doc(DOC_PATH).set(
      {
        ...sanitized,
        updated_at: new Date().toISOString(),
      },
      { merge: true }
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to save transcript settings:", err);
    return NextResponse.json(
      { error: "Failed to save transcript settings" },
      { status: 500 }
    );
  }
}
