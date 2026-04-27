import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_PRIVATE } from "@/lib/cache-headers";
import { verifyAuthOrPortalSession } from "@/lib/api-auth";

/**
 * GET  /api/teacher/attendance?class=G10&section=A&date=2025-01-15
 * POST /api/teacher/attendance  { records, class, section, date, teacherUsername }
 */
export async function GET(req: NextRequest) {
  const className = req.nextUrl.searchParams.get("class");
  const section = req.nextUrl.searchParams.get("section");
  const date = req.nextUrl.searchParams.get("date");

  if (!className || !date) {
    return NextResponse.json({ error: "class and date required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  try {
    let query = supabase.from("daily_attendance").select("*").eq("date", date).eq("grade", className);
    if (section) query = query.eq("section", section);

    const { data: rows } = await query.limit(5000);

    const records = (rows ?? []).map((row) => {
      const d = row as Record<string, unknown>;
      return {
        studentNumber: String(d["student_number"] || ""),
        status: String(d["status"] || "present"),
        date: String(d["date"] || date),
      };
    });

    return NextResponse.json({ records }, { headers: CACHE_PRIVATE });
  } catch (err) {
    console.error("Teacher attendance GET error:", err);
    return NextResponse.json({ error: "Failed to fetch attendance" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuthOrPortalSession(req, "teacher");
  if (!auth.ok) return auth.response;

  const supabase = createServiceClient();

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

    const now = new Date().toISOString();
    const rows = records.map((r) => ({
      id: `${date}_${r.studentNumber}`,
      student_number: r.studentNumber,
      status: r.status,
      date,
      grade: className,
      section: section || "",
      recorded_by: teacherUsername || "",
      updated_at: now,
    }));

    const CHUNK = 500;
    let count = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await supabase.from("daily_attendance").upsert(rows.slice(i, i + CHUNK));
      count += CHUNK;
    }

    return NextResponse.json({ success: true, count });
  } catch (err) {
    console.error("Teacher attendance POST error:", err);
    return NextResponse.json({ error: "Failed to save attendance" }, { status: 500 });
  }
}
