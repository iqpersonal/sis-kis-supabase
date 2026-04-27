import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT } from "@/lib/cache-headers";

export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("system_config")
      .select("data")
      .eq("id", "sync_status")
      .maybeSingle();
    return NextResponse.json({ data: data?.data ?? null }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Failed to fetch sync status:", err);
    return NextResponse.json({ error: "Failed to fetch sync status" }, { status: 500 });
  }
}
