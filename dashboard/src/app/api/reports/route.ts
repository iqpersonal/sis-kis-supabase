import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT } from "@/lib/cache-headers";

/**
 * GET /api/reports
 * Returns store/sales reports ordered by date desc.
 */
export async function GET() {
  const supabase = createServiceClient();
  try {
    const { data } = await supabase
      .from("reports")
      .select("*")
      .order("date", { ascending: false })
      .limit(200);

    return NextResponse.json({ reports: data ?? [] }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("GET /api/reports error:", err);
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}
