import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_MEDIUM } from "@/lib/cache-headers";
import { verifyAdmin } from "@/lib/api-auth";

const ROW_ID = "transcript_settings";

/**
 * GET /api/transcript-settings
 */
export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("parent_config")
      .select("buckets")
      .eq("id", ROW_ID)
      .maybeSingle();
    return NextResponse.json({ data: data?.buckets ?? null }, { headers: CACHE_MEDIUM });
  } catch (err) {
    console.error("Failed to fetch transcript settings:", err);
    return NextResponse.json({ error: "Failed to fetch transcript settings" }, { status: 500 });
  }
}

/**
 * POST /api/transcript-settings
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const allowed = ["schools", "school_logo", "cognia_logo"];
    const sanitized: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) sanitized[key] = body[key];
    }

    const supabase = createServiceClient();
    const now = new Date().toISOString();

    // Fetch existing and merge
    const { data: existing } = await supabase
      .from("parent_config")
      .select("buckets")
      .eq("id", ROW_ID)
      .maybeSingle();

    const merged = { ...(existing?.buckets ?? {}), ...sanitized, updated_at: now };

    const { error } = await supabase
      .from("parent_config")
      .upsert({ id: ROW_ID, buckets: merged, updated_at: now });

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to save transcript settings:", err);
    return NextResponse.json({ error: "Failed to save transcript settings" }, { status: 500 });
  }
}
