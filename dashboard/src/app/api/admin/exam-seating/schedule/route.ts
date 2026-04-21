import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

/* ── Auth helper: Super Admin + Admin + Principal ────────────── */
async function verifyAccess(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const snap = await adminDb.collection("admin_users").doc(decoded.uid).get();
    if (!snap.exists) return false;
    const role = snap.data()?.role;
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
    const year = req.nextUrl.searchParams.get("year");
    const examType = req.nextUrl.searchParams.get("examType");

    let query: FirebaseFirestore.Query = adminDb.collection(COLLECTION);
    if (year) query = query.where("academicYear", "==", year);
    if (examType) query = query.where("examType", "==", examType);

    const snap = await query.orderBy("createdAt", "desc").get();
    const schedules = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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

    const doc = await adminDb.collection(COLLECTION).add({
      academicYear,
      examType,
      gradeGroup,
      days,
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ id: doc.id, ok: true });
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

    await adminDb.collection(COLLECTION).doc(id).update(update);
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
    const { id } = (await req.json()) as { id: string };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await adminDb.collection(COLLECTION).doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[exam-schedule] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete schedule" }, { status: 500 });
  }
}
