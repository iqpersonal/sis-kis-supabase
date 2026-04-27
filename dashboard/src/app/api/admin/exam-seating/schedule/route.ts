import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

/* ── Auth helper: Super Admin + Admin + Principal ────────────── */
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

const COLLECTION = "exam_schedules";

/* ── GET: List schedules (optionally filter by year/examType) ── */
export async function GET(req: NextRequest) {
  if (!(await verifyAccess(req)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const supabase = createServiceClient();
    const year = req.nextUrl.searchParams.get("year");
    const examType = req.nextUrl.searchParams.get("examType");

    let query = supabase.from(COLLECTION).select("*").limit(2000);
    if (year) query = query.eq("academicYear", year);
    if (examType) query = query.eq("examType", examType);

    const { data, error } = await query;
    if (error) throw error;

    const schedules = (data || [])
      .map((row: Record<string, unknown>) => ({ id: row.id, ...row }))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return NextResponse.json({ schedules });
  } catch (err) {
    console.error("[exam-schedule] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch schedules" }, { status: 500 });
  }
}

/* ── POST: Create a new schedule ─────────────────────────────── */
export async function POST(req: NextRequest) {
  if (!(await verifyAccess(req)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const supabase = createServiceClient();
    const body = await req.json();
    const { academicYear, examType, gradeGroup, days } = body as {
      academicYear: string;
      examType: string;
      gradeGroup: string;
      days: { date: string; subjectCode: string; subjectName: string }[];
    };

    if (!academicYear || !examType || !gradeGroup || !Array.isArray(days)) {
      return NextResponse.json(
        { error: "academicYear, examType, gradeGroup, days required" },
        { status: 400 }
      );
    }

    // Validate examType
    if (!["T1", "T2"].includes(examType)) {
      return NextResponse.json({ error: "examType must be T1 or T2" }, { status: 400 });
    }

    // Validate gradeGroup
    if (!["junior", "high", "all"].includes(gradeGroup)) {
      return NextResponse.json({ error: "gradeGroup must be junior, high, or all" }, { status: 400 });
    }

    // Validate days
    for (const day of days) {
      if (!day.date || !day.subjectName) {
        return NextResponse.json({ error: "Each day needs date and subjectName" }, { status: 400 });
      }
    }

    const id = crypto.randomUUID();
    const { error } = await supabase.from(COLLECTION).insert({
      id,
      academicYear,
      examType,
      gradeGroup,
      days,
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    if (error) throw error;

    return NextResponse.json({ id, ok: true });
  } catch (err) {
    console.error("[exam-schedule] POST error:", err);
    return NextResponse.json({ error: "Failed to create schedule" }, { status: 500 });
  }
}

/* ── PUT: Update a schedule ──────────────────────────────────── */
export async function PUT(req: NextRequest) {
  if (!(await verifyAccess(req)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const supabase = createServiceClient();
    const body = await req.json();
    const { id, ...updates } = body as {
      id: string;
      academicYear?: string;
      examType?: string;
      gradeGroup?: string;
      days?: { date: string; subjectCode: string; subjectName: string }[];
      status?: string;
    };

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (updates.academicYear) update.academicYear = updates.academicYear;
    if (updates.examType) update.examType = updates.examType;
    if (updates.gradeGroup) update.gradeGroup = updates.gradeGroup;
    if (updates.days) update.days = updates.days;
    if (updates.status) update.status = updates.status;

    const { error } = await supabase.from(COLLECTION).update(update).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[exam-schedule] PUT error:", err);
    return NextResponse.json({ error: "Failed to update schedule" }, { status: 500 });
  }
}

/* ── DELETE: Remove a schedule ───────────────────────────────── */
export async function DELETE(req: NextRequest) {
  if (!(await verifyAccess(req)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const supabase = createServiceClient();
    const { id } = (await req.json()) as { id: string };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await supabase.from(COLLECTION).delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[exam-schedule] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete schedule" }, { status: 500 });
  }
}
