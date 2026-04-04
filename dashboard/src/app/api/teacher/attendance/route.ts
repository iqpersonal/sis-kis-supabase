import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_PRIVATE } from "@/lib/cache-headers";
import { verifyAuthOrPortalSession } from "@/lib/api-auth";

/**
 * GET  /api/teacher/attendance?class=G10&section=A&date=2025-01-15
 * POST /api/teacher/attendance  { records: [{ studentNumber, status }], class, section, date }
 */

export async function GET(req: NextRequest) {
  const className = req.nextUrl.searchParams.get("class");
  const section = req.nextUrl.searchParams.get("section");
  const date = req.nextUrl.searchParams.get("date");

  if (!className || !date) {
    return NextResponse.json({ error: "class and date required" }, { status: 400 });
  }

  try {
    let query: FirebaseFirestore.Query = adminDb.collection("daily_attendance");
    query = query.where("date", "==", date);

    const snap = await query.limit(5000).get();

    interface AttendanceRecord {
      studentNumber: string;
      status: string;
      date: string;
    }

    const records: AttendanceRecord[] = [];

    for (const doc of snap.docs) {
      const d = doc.data();
      const docGrade = d.grade || d.GRADE || d.class || "";
      const docSection = d.section || d.SECTION || "";

      if (docGrade !== className) continue;
      if (section && docSection !== section) continue;

      records.push({
        studentNumber: d.student_number || d.STUDENT_NUMBER || doc.id,
        status: d.status || "present",
        date: d.date || date,
      });
    }

    return NextResponse.json({ records }, { headers: CACHE_PRIVATE });
  } catch (err) {
    console.error("Teacher attendance GET error:", err);
    return NextResponse.json({ error: "Failed to fetch attendance" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuthOrPortalSession(req, "__teacher_session");
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { records, class: className, section, date, teacherUsername } = body as {
      records: { studentNumber: string; status: string }[];
      class: string;
      section: string;
      date: string;
      teacherUsername: string;
    };

    if (!records || !className || !date) {
      return NextResponse.json({ error: "records, class, and date required" }, { status: 400 });
    }

    const batch = adminDb.batch();
    let count = 0;

    for (const r of records) {
      const docId = `${date}_${r.studentNumber}`;
      const ref = adminDb.collection("daily_attendance").doc(docId);
      batch.set(
        ref,
        {
          student_number: r.studentNumber,
          status: r.status,
          date,
          grade: className,
          section: section || "",
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
    console.error("Teacher attendance POST error:", err);
    return NextResponse.json({ error: "Failed to save attendance" }, { status: 500 });
  }
}
