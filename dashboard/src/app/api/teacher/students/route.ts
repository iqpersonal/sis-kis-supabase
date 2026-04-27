import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_PRIVATE } from "@/lib/cache-headers";
import { compareAlphabeticalNames } from "@/lib/name-sort";

/**
 * GET /api/teacher/students?classId=SECTION_DOC_ID&year=25-26
 * GET /api/teacher/students?class=Grade+8&section=Pears+Boys&year=25-26
 */
export async function GET(req: NextRequest) {
  const classId = req.nextUrl.searchParams.get("classId");
  const className = req.nextUrl.searchParams.get("class");
  const section = req.nextUrl.searchParams.get("section");
  const year = req.nextUrl.searchParams.get("year");

  if (!classId && !className) {
    return NextResponse.json({ error: "classId or class required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  try {
    let classCode: string | null = null;
    let sectionCode: string | null = null;
    let majorCode: string | null = null;

    if (classId) {
      const { data: sec } = await supabase.from("sections").select("*").eq("id", classId).maybeSingle();
      if (sec) {
        const s = sec as Record<string, unknown>;
        classCode = String(s["Class_Code"] || "");
        sectionCode = String(s["Section_Code"] || "");
        majorCode = s["Major_Code"] ? String(s["Major_Code"]) : null;
      }
    }

    if (!classCode && className) {
      // Try E_Class_Desc
      const { data: cls } = await supabase.from("classes").select("*").eq("E_Class_Desc", className).limit(1);
      if (cls && cls.length > 0) {
        classCode = String((cls[0] as Record<string, unknown>)["Class_Code"] || "");
      } else {
        const { data: cls2 } = await supabase.from("classes").select("*").eq("E_Class_Abbreviation", className).limit(1);
        classCode = cls2 && cls2.length > 0 ? String((cls2[0] as Record<string, unknown>)["Class_Code"] || "") : className;
      }

      if (section && classCode) {
        const { data: sec } = await supabase.from("sections").select("*").eq("Class_Code", classCode).eq("E_Section_Name", section).limit(1);
        if (sec && sec.length > 0) {
          const s = sec[0] as Record<string, unknown>;
          sectionCode = String(s["Section_Code"] || "");
          majorCode = s["Major_Code"] ? String(s["Major_Code"]) : null;
        } else {
          const { data: sec2 } = await supabase.from("sections").select("*").eq("Class_Code", classCode).eq("A_Section_Name", section).limit(1);
          if (sec2 && sec2.length > 0) {
            const s = sec2[0] as Record<string, unknown>;
            sectionCode = String(s["Section_Code"] || "");
            majorCode = s["Major_Code"] ? String(s["Major_Code"]) : null;
          }
        }
      }
    }

    if (!classCode) return NextResponse.json({ students: [] });

    let regQuery = supabase.from("registrations").select("Student_Number, Termination_Date").eq("Class_Code", classCode);
    if (sectionCode) regQuery = regQuery.eq("Section_Code", sectionCode);
    if (majorCode) regQuery = regQuery.eq("Major_Code", majorCode);
    if (year) regQuery = regQuery.eq("Academic_Year", year);

    const { data: regs } = await regQuery.limit(2000);
    const studentNumbers = [...new Set(
      (regs ?? [])
        .filter((r) => !(r as Record<string, unknown>)["Termination_Date"])
        .map((r) => String((r as Record<string, unknown>)["Student_Number"] || ""))
        .filter(Boolean)
    )];

    if (studentNumbers.length === 0) return NextResponse.json({ students: [] });

    interface StudentInfo { studentNumber: string; nameEn: string; nameAr: string; gender: string; grade: string; section: string; }
    const students: StudentInfo[] = [];
    const missing: string[] = [];

    // Batch fetch from student_progress
    for (let i = 0; i < studentNumbers.length; i += 500) {
      const batch = studentNumbers.slice(i, i + 500);
      const { data: rows } = await supabase.from("student_progress").select("student_number, student_name, student_name_ar, gender").in("student_number", batch);
      const found = new Set((rows ?? []).map((r) => String((r as Record<string, unknown>)["student_number"])));
      for (const sn of batch) {
        if (!found.has(sn)) missing.push(sn);
      }
      for (const row of rows ?? []) {
        const r = row as Record<string, unknown>;
        students.push({
          studentNumber: String(r["student_number"]),
          nameEn: String(r["student_name"] || ""),
          nameAr: String(r["student_name_ar"] || ""),
          gender: String(r["gender"] || ""),
          grade: className || classCode || "",
          section: section || sectionCode || "",
        });
      }
    }

    // Fallback for missing — build from family_children + raw_family
    if (missing.length > 0) {
      const studentMetaMap = new Map<string, { familyNum: string; childNum: number }>();
      for (let i = 0; i < missing.length; i += 500) {
        const chunk = missing.slice(i, i + 500);
        const { data: rows } = await supabase.from("students").select("Student_Number, Family_Number, Child_Number").in("Student_Number", chunk);
        for (const row of rows ?? []) {
          const r = row as Record<string, unknown>;
          studentMetaMap.set(String(r["Student_Number"]), { familyNum: String(r["Family_Number"] || ""), childNum: Number(r["Child_Number"] || 0) });
        }
      }

      const famNums = [...new Set([...studentMetaMap.values()].map((v) => v.familyNum).filter(Boolean))];
      const childMap = new Map<string, { nameEn: string; nameAr: string; gender: string }>();
      const familyNameMap = new Map<string, { father: string; fatherAr: string; family: string; familyAr: string }>();

      for (let i = 0; i < famNums.length; i += 500) {
        const chunk = famNums.slice(i, i + 500);
        const [{ data: fcRows }, { data: rfRows }] = await Promise.all([
          supabase.from("family_children").select("Family_Number, Child_Number, E_Child_Name, A_Child_Name, Gender").in("Family_Number", chunk),
          supabase.from("raw_family").select("Family_Number, E_Father_Name, A_Father_Name, E_Family_Name, A_Family_Name").in("Family_Number", chunk),
        ]);
        for (const row of fcRows ?? []) {
          const r = row as Record<string, unknown>;
          const key = `${r["Family_Number"]}__${r["Child_Number"]}`;
          childMap.set(key, {
            nameEn: String(r["E_Child_Name"] || ""),
            nameAr: String(r["A_Child_Name"] || ""),
            gender: r["Gender"] === true ? "M" : r["Gender"] === false ? "F" : "",
          });
        }
        for (const row of rfRows ?? []) {
          const r = row as Record<string, unknown>;
          familyNameMap.set(String(r["Family_Number"]), {
            father: String(r["E_Father_Name"] || ""),
            fatherAr: String(r["A_Father_Name"] || ""),
            family: String(r["E_Family_Name"] || ""),
            familyAr: String(r["A_Family_Name"] || ""),
          });
        }
      }

      for (const sn of missing) {
        const meta = studentMetaMap.get(sn);
        const child = meta ? childMap.get(`${meta.familyNum}__${meta.childNum}`) : undefined;
        const fam = meta ? familyNameMap.get(meta.familyNum) : undefined;
        students.push({
          studentNumber: sn,
          nameEn: child ? [child.nameEn, fam?.father, fam?.family].filter(Boolean).join(" ") : sn,
          nameAr: child ? [child.nameAr, fam?.fatherAr, fam?.familyAr].filter(Boolean).join(" ") : "",
          gender: child?.gender || "",
          grade: className || classCode || "",
          section: section || sectionCode || "",
        });
      }
    }

    students.sort((a, b) => compareAlphabeticalNames(a.nameEn, b.nameEn));
    return NextResponse.json({ students }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Teacher students error:", err);
    return NextResponse.json({ error: "Failed to fetch students" }, { status: 500 });
  }
}
