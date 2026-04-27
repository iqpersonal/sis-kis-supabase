import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { verifyAuth } from "@/lib/api-auth";
import { compareAlphabeticalNames } from "@/lib/name-sort";

export const dynamic = "force-dynamic";

/**
 * GET /api/students/search?year=25-26&q=ahmed&school=0021-01&class=24&section=A&status=active&limit=100&offset=0
 *
 * Server-side student search to avoid loading 10K docs client-side.
 * Queries registrations filtered by year, then joins with student_progress docs.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  const supabase = createServiceClient();

  const { searchParams } = req.nextUrl;
  const year = searchParams.get("year") || "25-26";
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const school = searchParams.get("school") || "";
  const classCode = searchParams.get("class") || "";
  const sectionCode = searchParams.get("section") || "";
  const status = searchParams.get("status") || "all"; // all | active | withdrawn
  const limitNum = Math.min(Number(searchParams.get("limit")) || 200, 500);
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

  try {
    // For teachers: resolve supervised sections to (Class_Code, Section_Code) pairs
    type AllowedSection = { classCode: string; sectionCode: string };
    let allowedSections: AllowedSection[] | null = null;
    if (auth.role === "teacher") {
      const { data: teacherUser } = await supabase
        .from("admin_users")
        .select("supervised_classes")
        .eq("id", auth.uid)
        .single();

      const supervisedIds: string[] = Array.isArray(teacherUser?.supervised_classes)
        ? (teacherUser.supervised_classes as string[])
        : [];
      if (supervisedIds.length === 0) {
        return NextResponse.json({ students: [], total: 0, offset, limit: limitNum });
      }

      const { data: sections } = await supabase
        .from("sections")
        .select("Class_Code, Section_Code, class_code, section_code")
        .in("id", supervisedIds);

      allowedSections = (sections || []).map((s: Record<string, unknown>) => ({
        classCode: String(s.Class_Code || s.class_code || ""),
        sectionCode: String(s.Section_Code || s.section_code || ""),
      }));

      if (allowedSections.length === 0) {
        return NextResponse.json({ students: [], total: 0, offset, limit: limitNum });
      }
    }

    // Build registration query with server-side filters
    let regQuery = supabase
      .from("registrations")
      .select("id, student_number, major_code, class_code, section_code, termination_date, academic_year")
      .eq("academic_year", year);

    if (school) regQuery = regQuery.eq("major_code", school);
    if (classCode) regQuery = regQuery.eq("class_code", classCode);
    if (sectionCode) regQuery = regQuery.eq("section_code", sectionCode);

    const { data: registrations, error: regError } = await regQuery;
    if (regError) throw regError;

    const regDocs = (registrations || []).map((data) => ({
      id: data.id,
      Student_Number: (data as Record<string, unknown>).student_number,
      Major_Code: (data as Record<string, unknown>).major_code,
      Class_Code: (data as Record<string, unknown>).class_code,
      Section_Code: (data as Record<string, unknown>).section_code,
      Termination_Date: (data as Record<string, unknown>).termination_date || null,
    }));

    // Apply status filter
    let filteredRegs = regDocs;
    if (status === "active") {
      filteredRegs = regDocs.filter((r) => !r.Termination_Date);
    } else if (status === "withdrawn") {
      filteredRegs = regDocs.filter((r) => !!r.Termination_Date);
    }

    // For teachers: restrict to supervised sections only
    if (allowedSections) {
      filteredRegs = filteredRegs.filter((r) =>
        allowedSections!.some(
          (s) => s.classCode === r.Class_Code && s.sectionCode === r.Section_Code
        )
      );
    }

    const total = filteredRegs.length;

    // For list views without a text query, paginate registrations before the join.
    const regsToJoin = q
      ? filteredRegs
      : filteredRegs.slice(offset, offset + limitNum);

    // Batch-fetch student profile docs for the current slice (or all filtered regs for text search)
    const studentNumbers = [...new Set(regsToJoin.map((r) => String(r.Student_Number || "")))].filter(Boolean);

    // Read student_progress rows by student_number.
    const studentMap = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < studentNumbers.length; i += 100) {
      const batch = studentNumbers.slice(i, i + 100);
      const { data: progressRows, error: progressError } = await supabase
        .from("student_progress")
        .select("*")
        .in("student_number", batch);
      if (progressError) throw progressError;

      (progressRows || []).forEach((row) => {
        const key = String((row as Record<string, unknown>).student_number || "");
        if (key) studentMap.set(key, (row as Record<string, unknown>) || {});
      });
    }

    // Join and apply text search
    let results = regsToJoin.map((reg) => {
      const stu = studentMap.get(String(reg.Student_Number)) || {};
      const gender = stu.gender || stu.GENDER || null;
      const nationalityName =
        stu.nationality_en || stu.nationality_ar || stu.Nationality || "";
      return {
        ...reg,
        E_Student_Name: stu.student_name || stu.full_name_en || stu.STUDENT_NAME_EN || "",
        A_Student_Name: stu.student_name_ar || stu.full_name_ar || stu.STUDENT_NAME_AR || "",
        Gender: gender,
        Birth_Date: stu.dob || stu.Birth_Date || stu.Child_Birth_Date || null,
        Nationality_Code:
          stu.nationality_code || stu.Nationality_Code || stu.Nationality_Code_Primary || null,
        Nationality_Name: nationalityName,
      };
    });

    if (q) {
      results = results.filter((r) => {
        const name = String(r.E_Student_Name || "").toLowerCase();
        const sn = String(r.Student_Number || "").toLowerCase();
        return name.includes(q) || sn.includes(q);
      });
    }

    results.sort((a, b) => compareAlphabeticalNames(a.E_Student_Name, b.E_Student_Name));

    const pagedResults = q
      ? results.slice(offset, offset + limitNum)
      : results;

    return NextResponse.json({
      students: pagedResults,
      total: q ? results.length : total,
      offset,
      limit: limitNum,
    });
  } catch (err) {
    console.error("Student search error:", err);
    return NextResponse.json(
      { error: "Failed to search students" },
      { status: 500 }
    );
  }
}
