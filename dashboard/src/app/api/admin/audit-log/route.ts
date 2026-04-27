import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { verifyAdmin } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;
  if (auth.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200);
  const actionFilter = url.searchParams.get("action") || "";
  const startAfter = url.searchParams.get("startAfter") || "";

  const supabase = createServiceClient();
  let q = supabase.from("audit_log").select("id, actor, action, details, target_id, target_type, timestamp").order("timestamp", { ascending: false }).limit(limit);

  if (actionFilter) q = q.eq("action", actionFilter);
  if (startAfter) q = q.lt("id", startAfter);

  const { data } = await q;
  return NextResponse.json({ entries: data ?? [], count: (data ?? []).length }, { headers: CACHE_SHORT });
}
