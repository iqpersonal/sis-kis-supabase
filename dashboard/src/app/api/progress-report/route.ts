import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_PRIVATE } from "@/lib/cache-headers";
import { progressReportDocId, monthToTerm } from "@/lib/progress-report-rubric";

const COLLECTION = "progress_reports";

/* ────────────────────────────────────────────────────────────────── */
/*  GET /api/progress-report                                         */
/*   ?action=list&year=25-26&month=October&classCode=G12&sectionCode=Peaches  */
/*   ?action=student&studentNumber=12345&year=25-26                  */
/*   ?action=months&year=25-26                                       */
/*   ?action=class_subjects&classCode=G12&year=25-26                 */
/* ────────────────────────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action") || "list";

  try {
    /* ── List reports for a class/section/month ── */
    if (action === "list") {
      const year = sp.get("year");
      const month = sp.get("month");
      const classCode = sp.get("classCode");
      const sectionCode = sp.get("sectionCode");

      if (!year || !month || !classCode) {
        return NextResponse.json(
          { error: "year, month, classCode required" },
          { status: 400 },
        );
      }

      let query: FirebaseFirestore.Query = adminDb
        .collection(COLLECTION)
        .where("academic_year", "==", year)
        .where("month", "==", month)
        .where("class_code", "==", classCode);

      if (sectionCode) {
        query = query.where("section_code", "==", sectionCode);
      }

      const snap = await query.limit(5000).get();
      const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      return NextResponse.json({ reports }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    /* ── All reports for one student ── */
    if (action === "student") {
      const studentNumber = sp.get("studentNumber");
      const year = sp.get("year");

      if (!studentNumber) {
        return NextResponse.json({ error: "studentNumber required" }, { status: 400 });
      }

      let query: FirebaseFirestore.Query = adminDb
        .collection(COLLECTION)
        .where("student_number", "==", studentNumber);

      if (year) {
        query = query.where("academic_year", "==", year);
      }

      const snap = await query.limit(500).get();
      const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      return NextResponse.json({ reports }, { headers: CACHE_PRIVATE });
    }

    /* ── Which months have data for a given year ── */
    if (action === "months") {
      const year = sp.get("year");
      if (!year) {
        return NextResponse.json({ error: "year required" }, { status: 400 });
      }

      const snap = await adminDb
        .collection(COLLECTION)
        .where("academic_year", "==", year)
        .select("month")
        .limit(10000)
        .get();

      const months = [...new Set(snap.docs.map((d) => d.data().month as string))].sort();
      return NextResponse.json({ months }, { headers: CACHE_PRIVATE });
    }

    /* ── Subjects for a class (from student_progress) ── */
    if (action === "class_subjects") {
      const classCode = sp.get("classCode");
      const year = sp.get("year") || "25-26";

      if (!classCode) {
        return NextResponse.json({ error: "classCode required" }, { status: 400 });
      }

      // Sample a few students in the class to extract subject list
      const snap = await adminDb
        .collection("student_progress")
        .where(`years.${year}.class_name`, "==", classCode)
        .limit(5)
        .get();

      const subjectSet = new Set<string>();
      for (const doc of snap.docs) {
        const yearData = doc.data()?.years?.[year];
        if (yearData?.subjects) {
          for (const s of yearData.subjects) {
            if (s.subject) subjectSet.add(s.subject);
          }
        }
      }

      const subjects = [...subjectSet].sort();
      return NextResponse.json({ subjects }, { headers: CACHE_PRIVATE });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Progress report GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* ────────────────────────────────────────────────────────────────── */
/*  POST /api/progress-report                                        */
/*  { action: "save", reports: [...] }                                */
/*  { action: "save_single", ... }                                    */
/* ────────────────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    /* ── Batch save (teacher fills whole class) ── */
    if (action === "save") {
      const { reports } = body as {
        reports: {
          student_number: string;
          student_name: string;
          subject: string;
          class_code: string;
          section_code: string;
          academic_year: string;
          month: string;
          academic_performance: string;
          homework_effort: string;
          participation: string;
          conduct: string;
          notes?: string;
          recorded_by?: string;
        }[];
      };

      if (!reports || !Array.isArray(reports) || reports.length === 0) {
        return NextResponse.json({ error: "reports array required" }, { status: 400 });
      }

      // Firestore batch max = 500
      const batches: FirebaseFirestore.WriteBatch[] = [];
      let currentBatch = adminDb.batch();
      let count = 0;

      for (const r of reports) {
        if (!r.student_number || !r.subject || !r.academic_year || !r.month) continue;

        const docId = progressReportDocId(r.academic_year, r.month, r.student_number, r.subject);
        const ref = adminDb.collection(COLLECTION).doc(docId);

        currentBatch.set(
          ref,
          {
            student_number: r.student_number,
            student_name: r.student_name || "",
            subject: r.subject,
            class_code: r.class_code || "",
            section_code: r.section_code || "",
            academic_year: r.academic_year,
            month: r.month,
            term: monthToTerm(r.month),
            academic_performance: r.academic_performance || "",
            homework_effort: r.homework_effort || "",
            participation: r.participation || "",
            conduct: r.conduct || "",
            notes: r.notes || "",
            recorded_by: r.recorded_by || "",
            updated_at: new Date().toISOString(),
          },
          { merge: true },
        );

        count++;
        if (count % 500 === 0) {
          batches.push(currentBatch);
          currentBatch = adminDb.batch();
        }
      }

      batches.push(currentBatch);
      await Promise.all(batches.map((b) => b.commit()));

      return NextResponse.json({ success: true, count });
    }

    /* ── Save a single report entry ── */
    if (action === "save_single") {
      const {
        student_number,
        student_name,
        subject,
        class_code,
        section_code,
        academic_year,
        month,
        academic_performance,
        homework_effort,
        participation,
        conduct,
        notes,
        recorded_by,
      } = body;

      if (!student_number || !subject || !academic_year || !month) {
        return NextResponse.json(
          { error: "student_number, subject, academic_year, month required" },
          { status: 400 },
        );
      }

      const docId = progressReportDocId(academic_year, month, student_number, subject);
      await adminDb
        .collection(COLLECTION)
        .doc(docId)
        .set(
          {
            student_number,
            student_name: student_name || "",
            subject,
            class_code: class_code || "",
            section_code: section_code || "",
            academic_year,
            month,
            term: monthToTerm(month),
            academic_performance: academic_performance || "",
            homework_effort: homework_effort || "",
            participation: participation || "",
            conduct: conduct || "",
            notes: notes || "",
            recorded_by: recorded_by || "",
            updated_at: new Date().toISOString(),
          },
          { merge: true },
        );

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Progress report POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
