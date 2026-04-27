import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT } from "@/lib/cache-headers";

/**
 * GET /api/student-profile?studentNumber=xxx
 */
export async function GET(req: NextRequest) {
  const studentNumber = req.nextUrl.searchParams.get("studentNumber");

  if (!studentNumber) {
    return NextResponse.json({ error: "studentNumber query parameter is required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const sn = studentNumber.trim();

  try {
    const { data, error } = await supabase
      .from("student_progress")
      .select("*")
      .eq("student_number", sn)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const profile = {
      student_number: data.student_number || sn,
      student_name: data.student_name || "",
      student_name_ar: data.student_name_ar || "",
      gender: data.gender || "",
      dob: data.dob || "",
      birth_place_en: data.birth_place_en || "",
      birth_place_ar: data.birth_place_ar || "",
      nationality_en: data.nationality_en || "",
      nationality_ar: data.nationality_ar || "",
      family_number: data.family_number || "",
      passport_id: data.passport_id || "",
      iqama_number: data.iqama_number || "",
      enrollment_date: data.enrollment_date || "",
      prev_school_en: data.prev_school_en || "",
      prev_school_ar: data.prev_school_ar || "",
      prev_school_year: data.prev_school_year || "",
      years: data.years || {},
      financials: data.financials || null,
      raw_student: data.raw_student || {},
      raw_family_child: data.raw_family_child || {},
      raw_family: data.raw_family || {},
      updated_at: data.updated_at || "",
    };

    return NextResponse.json({ data: profile }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Failed to fetch student profile:", err);
    return NextResponse.json({ error: "Failed to fetch student profile" }, { status: 500 });
  }
}
