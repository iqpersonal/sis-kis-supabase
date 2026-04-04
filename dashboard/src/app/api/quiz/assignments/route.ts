import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { CACHE_SHORT, CACHE_NONE } from "@/lib/cache-headers";

/**
 * Quiz Assignments API
 *
 * GET  /api/quiz/assignments
 *   ?teacher=username      → assignments by teacher
 *   ?class=G10             → filter by class
 *   ?status=active         → filter by status
 *   ?year=25-26            → filter by year
 *   ?student=12345         → assignments available to student (by class)
 *
 * POST /api/quiz/assignments
 *   { action: "create", assignment: {...} }
 *   { action: "update", assignmentId, updates: {...} }
 *   { action: "cancel", assignmentId }
 */

/**
 * Map a class name like "Grade 8" or numeric class code to NWEA band code.
 * Assignments store class_code as NWEA bands: "k-2", "3-5", "6-8", "9-12".
 */
function classToNweaBand(className: string, classCode: string): string | null {
  // Try to extract grade number from class_name (e.g. "Grade 8" → 8)
  const match = className?.match(/(\d+)/);
  const grade = match ? parseInt(match[1], 10) : null;

  // Fallback: derive from numeric class_code (class 21=G1, 22=G2, ..., 33=G13/KG)
  const gradeFromCode = classCode ? parseInt(classCode, 10) - 20 : null;

  const g = grade ?? gradeFromCode;
  if (!g) return null;

  if (g <= 2) return "k-2";
  if (g <= 5) return "3-5";
  if (g <= 8) return "6-8";
  return "9-12";
}

// ── GET ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const teacher = req.nextUrl.searchParams.get("teacher");
  const classCode = req.nextUrl.searchParams.get("class");
  const status = req.nextUrl.searchParams.get("status");
  const year = req.nextUrl.searchParams.get("year");
  const student = req.nextUrl.searchParams.get("student");

  try {
    // Student lookup: find assignments for their class
    if (student) {
      // Get student profile from student_credentials
      const credDoc = await adminDb
        .collection("student_credentials")
        .doc(student)
        .get();

      if (!credDoc.exists) {
        return NextResponse.json({ assignments: [] });
      }

      const cred = credDoc.data()!;
      const studentClassCode = cred.class_code || "";   // SIS e.g. "28"
      const studentSection = cred.section_name || "";   // e.g. "Pears Boys'"
      const studentSchool = cred.school || "";          // e.g. "0021-01"
      const bandCode = classToNweaBand(cred.class_name || "", studentClassCode);

      if (!studentClassCode && !bandCode) {
        return NextResponse.json({ assignments: [] });
      }

      // Strategy: fetch active assignments that match either by SIS class_code or NWEA band
      // 1. Try exact SIS match first (new assignments)
      // 2. Fall back to NWEA band match (legacy assignments without sis_class_code)
      const [sisSnap, bandSnap] = await Promise.all([
        studentClassCode
          ? adminDb.collection("quiz_assignments")
              .where("sis_class_code", "==", studentClassCode)
              .where("status", "==", "active")
              .get()
          : Promise.resolve(null),
        bandCode
          ? adminDb.collection("quiz_assignments")
              .where("class_code", "==", bandCode)
              .where("status", "==", "active")
              .get()
          : Promise.resolve(null),
      ]);

      // Merge results, de-duplicate by doc id
      const seen = new Set<string>();
      const allDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
      for (const snap of [sisSnap, bandSnap]) {
        if (snap) {
          for (const d of snap.docs) {
            if (!seen.has(d.id)) { seen.add(d.id); allDocs.push(d); }
          }
        }
      }

      const now = new Date();

      const assignments = allDocs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((a: any) => {
          // For SIS-aware assignments, check school match
          if (a.sis_school && studentSchool && a.sis_school !== studentSchool) return false;
          // For SIS-aware assignments, check exact section code
          if (a.sis_section_code && cred.section_code && a.sis_section_code !== cred.section_code) return false;
          // For legacy assignments (no sis_class_code), check section name
          if (!a.sis_class_code && a.section && a.section !== "all" && a.section !== studentSection) return false;
          // Check date range
          if (a.start_date && new Date(a.start_date) > now) return false;
          if (a.end_date && new Date(a.end_date) < now) return false;
          return true;
        })
        .map((a: any) => ({
          ...a,
          // Strip question_ids — student shouldn't see them upfront
          question_ids: undefined,
          question_count: a.question_ids?.length || a.question_count || 0,
        }));

      return NextResponse.json({ assignments }, { headers: CACHE_SHORT });
    }

    // Teacher/admin lookup
    let query: FirebaseFirestore.Query = adminDb.collection("quiz_assignments");

    if (teacher) {
      // Support both username ("cezar.dagher") and email ("cezar.dagher@kis-riyadh.com")
      const variants = [teacher];
      if (!teacher.includes("@")) variants.push(`${teacher}@kis-riyadh.com`);
      query = query.where("created_by", "in", variants);
    }
    if (classCode) query = query.where("class_code", "==", classCode);
    if (status) query = query.where("status", "==", status);
    if (year) query = query.where("year", "==", year);

    query = query.limit(200);

    const snap = await query.get();
    const assignments = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .sort((a: any, b: any) => {
        const ta = a.created_at?._seconds || 0;
        const tb = b.created_at?._seconds || 0;
        return tb - ta;
      });

    return NextResponse.json({ assignments }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Quiz assignments GET error:", err);
    return NextResponse.json({ error: "Failed to fetch assignments" }, { status: 500 });
  }
}

// ── POST ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // ── Create assignment ──
    if (action === "create") {
      const a = body.assignment as {
        title: string;
        title_ar?: string;
        subject: string;
        class_code: string;
        class_name?: string;
        section?: string; // "all" or specific section name
        sis_class_code?: string;   // SIS numeric class code e.g. "28"
        sis_section_code?: string; // SIS section code e.g. "02"
        sis_school?: string;       // SIS school/major code e.g. "0021-01"
        question_ids: string[];
        year: string;
        start_date?: string;
        end_date?: string;
        duration_minutes?: number;
        created_by: string;
        adaptive: boolean;
      };

      if (!a.title || !a.subject || !a.class_code || !a.question_ids?.length || !a.year) {
        return NextResponse.json(
          { error: "title, subject, class_code, question_ids, and year required" },
          { status: 400 }
        );
      }

      // Verify all question_ids exist
      const questionRefs = a.question_ids.map((id) =>
        adminDb.collection("quiz_questions").doc(id)
      );
      const questionDocs = await adminDb.getAll(...questionRefs);
      const validIds = questionDocs.filter((d) => d.exists).map((d) => d.id);

      if (validIds.length === 0) {
        return NextResponse.json({ error: "No valid questions found" }, { status: 400 });
      }

      const ref = adminDb.collection("quiz_assignments").doc();
      await ref.set({
        title: a.title,
        title_ar: a.title_ar || "",
        subject: a.subject,
        class_code: a.class_code,
        class_name: a.class_name || "",
        section: a.section || "all",
        sis_class_code: a.sis_class_code || "",
        sis_section_code: a.sis_section_code || "",
        sis_school: a.sis_school || "",
        question_ids: validIds,
        question_count: validIds.length,
        year: a.year,
        start_date: a.start_date || new Date().toISOString(),
        end_date: a.end_date || "",
        duration_minutes: a.duration_minutes || 0,
        adaptive: a.adaptive ?? true,
        status: "active",
        created_by: a.created_by,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
        stats: {
          started: 0,
          completed: 0,
          avg_score: 0,
        },
      });

      return NextResponse.json({ success: true, assignmentId: ref.id }, { headers: CACHE_NONE });
    }

    // ── Update assignment ──
    if (action === "update") {
      const { assignmentId, updates } = body;
      if (!assignmentId) {
        return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
      }

      const { created_at, stats, ...safeUpdates } = updates;
      await adminDb.collection("quiz_assignments").doc(assignmentId).update({
        ...safeUpdates,
        updated_at: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true }, { headers: CACHE_NONE });
    }

    // ── Cancel assignment ──
    if (action === "cancel") {
      const { assignmentId } = body;
      if (!assignmentId) {
        return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
      }

      await adminDb.collection("quiz_assignments").doc(assignmentId).update({
        status: "cancelled",
        updated_at: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true }, { headers: CACHE_NONE });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("Quiz assignments POST error:", err);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
