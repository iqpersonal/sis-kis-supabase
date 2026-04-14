import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_PRIVATE } from "@/lib/cache-headers";
import { verifyAuthOrPortalSession } from "@/lib/api-auth";

/**
 * GET  /api/teacher/grades?class=G10&section=A&subject=Math&year=24-25
 * POST /api/teacher/grades  { grades: [{ studentNumber, grade }], class, section, subject, year, term }
 */

export async function GET(req: NextRequest) {
  const className = req.nextUrl.searchParams.get("class");
  const section = req.nextUrl.searchParams.get("section");
  const subject = req.nextUrl.searchParams.get("subject");
  const year = req.nextUrl.searchParams.get("year");

  if (!className) {
    return NextResponse.json({ error: "class required" }, { status: 400 });
  }

  try {
    let query: FirebaseFirestore.Query = adminDb
      .collection("exam_results")
      .where("GRADE", "==", className);

    if (section) {
      query = query.where("SECTION", "==", section);
    }
    if (year) {
      query = query.where("SCHOOL_YEAR", "==", year);
    }

    const snap = await query.limit(10000).get();

    interface GradeRecord {
      studentNumber: string;
      subject: string;
      grade: number | string;
      term: string;
      year: string;
    }

    const grades: GradeRecord[] = [];

    for (const doc of snap.docs) {
      const d = doc.data();
      const docGrade = d.GRADE || d.grade || d.class_name || "";
      const docSection = d.SECTION || d.section || "";
      const docSubject = d.SUBJECT || d.subject_name || d.subject || "";
      const docYear = d.SCHOOL_YEAR || d.year || "";

      if (docGrade !== className) continue;
      if (section && docSection !== section) continue;
      if (subject && docSubject !== subject) continue;
      if (year && docYear !== year) continue;

      grades.push({
        studentNumber: d.STUDENT_NUMBER || d.student_number || doc.id,
        subject: docSubject,
        grade: d.TOTAL || d.total || d.score || "",
        term: d.TERM || d.term || "",
        year: docYear,
      });
    }

    return NextResponse.json({ grades }, { headers: CACHE_PRIVATE });
  } catch (err) {
    console.error("Teacher grades GET error:", err);
    return NextResponse.json({ error: "Failed to fetch grades" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuthOrPortalSession(req, "teacher");
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { grades, class: className, section, subject, year, term, teacherUsername } = body as {
      grades: { studentNumber: string; grade: number }[];
      class: string;
      section: string;
      subject: string;
      year: string;
      term: string;
      teacherUsername: string;
    };

    if (!grades || !className || !subject || !year || !term) {
      return NextResponse.json(
        { error: "grades, class, subject, year, and term required" },
        { status: 400 }
      );
    }

    const batch = adminDb.batch();
    let count = 0;

    for (const g of grades) {
      const docId = `${year}_${term}_${g.studentNumber}_${subject}`;
      const ref = adminDb.collection("exam_results").doc(docId);
      batch.set(
        ref,
        {
          STUDENT_NUMBER: g.studentNumber,
          SUBJECT: subject,
          TOTAL: g.grade,
          TERM: term,
          SCHOOL_YEAR: year,
          GRADE: className,
          SECTION: section || "",
          recorded_by: teacherUsername || "",
          updated_at: new Date().toISOString(),
        },
        { merge: true }
      );
      count++;
    }

    await batch.commit();

    return NextResponse.json({ success: true, count });
  } catch (err) {
    console.error("Teacher grades POST error:", err);
    return NextResponse.json({ error: "Failed to save grades" }, { status: 500 });
  }
}
