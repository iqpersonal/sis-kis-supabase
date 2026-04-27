import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

/* ── Auth ─────────────────────────────────────────────────────── */
async function verifyAccess(req: NextRequest) {
  const supabase = createServiceClient();
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(authHeader.slice(7));
    if (error || !user) return false;

    const { data: profile } = await supabase
      .from("admin_users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile) return false;
    const role = profile.role;
    return ["super_admin", "school_admin", "academic_director"].includes(role);
  } catch {
    return false;
  }
}

/* ── GET: Retrieve seating plans ─────────────────────────────── */
export async function GET(req: NextRequest) {
  if (!(await verifyAccess(req)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const supabase = createServiceClient();
    const scheduleId = req.nextUrl.searchParams.get("scheduleId");
    const campus = req.nextUrl.searchParams.get("campus");

    if (!scheduleId) {
      return NextResponse.json({ error: "scheduleId required" }, { status: 400 });
    }

    let query = supabase
      .from("exam_seating_plans")
      .select("*")
      .eq("scheduleId", scheduleId)
      .limit(2000);

    if (campus) query = query.eq("campus", campus);

    const { data, error } = await query;
    if (error) throw error;

    const plans = (data || [])
      .map((row: Record<string, unknown>) => ({ id: row.id, ...row }))
      .sort((a, b) => String(a.examDate || "").localeCompare(String(b.examDate || "")));

    return NextResponse.json({ plans });
  } catch (err) {
    console.error("[exam-seating-plan] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch plans" }, { status: 500 });
  }
}

/* ── DELETE: Remove plans for a schedule+campus ──────────────── */
export async function DELETE(req: NextRequest) {
  if (!(await verifyAccess(req)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const supabase = createServiceClient();
    const { scheduleId, campus } = (await req.json()) as {
      scheduleId: string;
      campus?: string;
    };

    if (!scheduleId) {
      return NextResponse.json({ error: "scheduleId required" }, { status: 400 });
    }

    let findQuery = supabase
      .from("exam_seating_plans")
      .select("id")
      .eq("scheduleId", scheduleId)
      .limit(5000);

    if (campus) findQuery = findQuery.eq("campus", campus);

    const { data: rows, error: findErr } = await findQuery;
    if (findErr) throw findErr;

    const ids = (rows || []).map((r: Record<string, unknown>) => String(r.id || "")).filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ ok: true, deleted: 0 });

    const { error: delErr } = await supabase.from("exam_seating_plans").delete().in("id", ids);
    if (delErr) throw delErr;

    return NextResponse.json({ ok: true, deleted: ids.length });
  } catch (err) {
    console.error("[exam-seating-plan] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete plans" }, { status: 500 });
  }
}
