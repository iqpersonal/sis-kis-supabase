import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

const DEFAULT_PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const params = request.nextUrl.searchParams;
  const view = params.get("view") || "bot";

  try {
    if (view === "stats") {
      const [{ count: total }, { count: unregistered }, { count: admissions }] = await Promise.all([
        supabase.from("whatsapp_bot_log").select("id", { count: "exact", head: true }),
        supabase.from("whatsapp_bot_log").select("id", { count: "exact", head: true }).eq("action", "unregistered"),
        supabase.from("admission_enquiries").select("id", { count: "exact", head: true }),
      ]);

      const safeTotal = total || 0;
      const safeUnregistered = unregistered || 0;
      return NextResponse.json({
        total: safeTotal,
        registered: Math.max(0, safeTotal - safeUnregistered),
        unregistered: safeUnregistered,
        admissions: admissions || 0,
      });
    }

    if (view === "admission") {
      const status = params.get("status") || "";
      const query = supabase
        .from("admission_enquiries")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (status) query.eq("status", status);

      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ enquiries: data || [] });
    }

    const action = params.get("action") || "";
    const sort = params.get("sort") === "asc" ? "asc" : "desc";
    const page = Math.max(1, Number(params.get("page") || "1"));
    const pageSize = Math.max(1, Math.min(200, Number(params.get("limit") || String(DEFAULT_PAGE_SIZE))));
    const from = (page - 1) * pageSize;
    const to = from + pageSize;

    const query = supabase
      .from("whatsapp_bot_log")
      .select("*")
      .order("timestamp", { ascending: sort === "asc" })
      .range(from, to);

    if (action) query.eq("action", action);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data || [];
    return NextResponse.json({
      logs: rows.slice(0, pageSize),
      hasMore: rows.length > pageSize,
      page,
      pageSize,
    });
  } catch (err) {
    console.error("GET /api/whatsapp/logs error:", err);
    return NextResponse.json({ error: "Failed to fetch WhatsApp logs" }, { status: 500 });
  }
}
