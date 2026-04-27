import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { verifyAdmin } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = searchParams.get("year");
    const school = searchParams.get("school");
    const statusFilter = searchParams.get("status");

    const supabase = createServiceClient();
    let q = supabase.from("student_transfers").select("*").order("created_at", { ascending: false }).limit(500);
    if (statusFilter && statusFilter !== "all") q = q.eq("status", statusFilter);

    const { data: rows } = await q;
    let records = (rows ?? []) as Record<string, unknown>[];

    if (year) records = records.filter((r) => String(r["effective_date"] || "").substring(0, 4) === year.substring(0, 4));
    if (school && school !== "all") records = records.filter((r) => r["school"] === school);

    const summary = { total: records.length, transfers: records.filter((r) => r["type"] === "transfer").length, withdrawals: records.filter((r) => r["type"] === "withdrawal").length, pending: records.filter((r) => r["status"] === "pending").length, approved: records.filter((r) => r["status"] === "approved").length, completed: records.filter((r) => r["status"] === "completed").length, cancelled: records.filter((r) => r["status"] === "cancelled").length };
    return NextResponse.json({ records, summary }, { headers: CACHE_SHORT });
  } catch (error) {
    console.error("Error fetching transfers:", error);
    return NextResponse.json({ records: [], summary: { total: 0, transfers: 0, withdrawals: 0, pending: 0, approved: 0, completed: 0, cancelled: 0 } });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const supabase = createServiceClient();
    const body = await req.json();
    const { studentNumber, type, reason, destinationSchool, effectiveDate, notes } = body;
    if (!studentNumber || !type) return NextResponse.json({ error: "studentNumber and type are required" }, { status: 400 });

    const { data: prog } = await supabase.from("student_progress").select("student_name, class_name, school").eq("student_number", String(studentNumber)).maybeSingle();
    const p = (prog ?? {}) as Record<string, unknown>;

    const now = new Date().toISOString();
    const record = { student_number: String(studentNumber), student_name: String(p["student_name"] || ""), class_name: String(p["class_name"] || ""), school: String(p["school"] || ""), type, status: "pending", reason: reason || "", destination_school: destinationSchool || "", effective_date: effectiveDate || now.substring(0, 10), notes: notes || "", created_by: auth.uid, created_at: now, updated_at: now };
    const { data: newRow } = await supabase.from("student_transfers").insert(record).select("id").single();

    const { logAudit } = await import("@/lib/audit");
    logAudit({ actor: auth.uid, action: "transfer.create", details: `${type} for ${record.student_name || studentNumber}`, targetId: String(studentNumber), targetType: "student" });

    return NextResponse.json({ success: true, id: (newRow as Record<string, unknown> | null)?.["id"], record: { ...(newRow as Record<string, unknown> | null), ...record } });
  } catch (error) {
    console.error("Error creating transfer:", error);
    return NextResponse.json({ error: "Failed to create transfer record" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const supabase = createServiceClient();
    const { id, status, notes } = await req.json();
    if (!id || !status) return NextResponse.json({ error: "id and status are required" }, { status: 400 });
    const validStatuses = ["pending", "approved", "completed", "cancelled"];
    if (!validStatuses.includes(status)) return NextResponse.json({ error: `Status must be one of: ${validStatuses.join(", ")}` }, { status: 400 });

    const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (notes !== undefined) update.notes = notes;
    await supabase.from("student_transfers").update(update).eq("id", id);

    const { logAudit } = await import("@/lib/audit");
    logAudit({ actor: auth.uid, action: `transfer.${status}`, details: `Transfer ${id} status → ${status}`, targetId: id, targetType: "transfer" });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating transfer:", error);
    return NextResponse.json({ error: "Failed to update transfer record" }, { status: 500 });
  }
}
