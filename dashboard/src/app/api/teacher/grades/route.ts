import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_PRIVATE } from "@/lib/cache-headers";
import { verifyAuthOrPortalSession } from "@/lib/api-auth";

/**
 * GET  /api/teacher/grades?class=G10&section=A&subject=Math&year=24-25
 * POST /api/teacher/grades  { grades, class, section, subject, year, term }
 */
export async function GET(req: NextRequest) {
  const className = req.nextUrl.searchParams.get("class");
  const section = req.nextUrl.searchParams.get("section");
  const subject = req.nextUrl.searchParams.get("subject");
  const year = req.nextUrl.searchParams.get("year");

  if (!className) {
    return NextResponse.json({ error: "class required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  try {
    let query = supabase.from("exam_results").select("*").eq("GRADE", className);
    if (section) query = query.eq("SECTION", section);
    if (year) query = query.eq("SCHOOL_YEAR", year);

    const { data: rows } = await query.limit(10000);

    interface GradeRecord { studentNumber: string; subject: string; grade: number | string; term: string; year: string; }
    const grades: GradeRecord[] = [];

    for (const row of rows ?? []) {
      const d = row as Record<string, unknown>;
      if (subject && String(d["SUBJECT"] || "") !== subject) continue;

      grades.push({
        studentNumber: String(d["STUDENT_NUMBER"] || ""),
        subject: String(d["SUBJECT"] || ""),
        grade: d["TOTAL"] ?? "",
        term: String(d["TERM"] || ""),
        year: String(d["SCHOOL_YEAR"] || ""),
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

  const supabase = createServiceClient();

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
      return NextResponse.json({ error: "grades, class, subject, year, and term required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const rows = grades.map((g) => ({
      id: `${year}_${term}_${g.studentNumber}_${subject}`,
      STUDENT_NUMBER: g.studentNumber,
      SUBJECT: subject,
      TOTAL: g.grade,
      TERM: term,
      SCHOOL_YEAR: year,
      GRADE: className,
      SECTION: section || "",
      recorded_by: teacherUsername || "",
      updated_at: now,
    }));

    const CHUNK = 500;
    let count = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      await supabase.from("exam_results").upsert(chunk);
      count += chunk.length;
    }

    return NextResponse.json({ success: true, count });
  } catch (err) {
    console.error("Teacher grades POST error:", err);
    return NextResponse.json({ error: "Failed to save grades" }, { status: 500 });
  }
}
