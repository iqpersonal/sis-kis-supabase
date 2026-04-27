import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_LONG } from "@/lib/cache-headers";

export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  try {
    const yearParam = req.nextUrl.searchParams.get("year");
    const schoolParam = req.nextUrl.searchParams.get("school"); // 0021-01 (boys) | 0021-02 (girls)

    let allowedClassCodes: Set<string> | null = null;
    if (yearParam || schoolParam) {
      let sectionsQuery = supabase
        .from("sections")
        .select("Class_Code, class_code, Major_Code, major_code, Academic_Year, academic_year")
        .limit(4000);
      if (yearParam) {
        sectionsQuery = sectionsQuery.or(`Academic_Year.eq.${yearParam},academic_year.eq.${yearParam}`);
      }
      const { data: sectionsRows } = await sectionsQuery;

      allowedClassCodes = new Set<string>();
      for (const d of sectionsRows || []) {
        const row = d as Record<string, unknown>;
        const classCode = String(row.Class_Code || row.class_code || "");
        if (!classCode) continue;

        if (schoolParam) {
          const majorCode = String(row.Major_Code || row.major_code || "");
          const campus = majorCode.endsWith("-01")
            ? "0021-01"
            : majorCode.endsWith("-02")
              ? "0021-02"
              : "";
          if (campus !== schoolParam) continue;
        }

        allowedClassCodes.add(classCode);
      }
    }

    const { data: classRows, error } = await supabase
      .from("classes")
      .select(
        "Class_Code, class_code, E_Class_Name, e_class_name, A_Class_Name, a_class_name, E_Class_Desc, e_class_desc, A_Class_Desc, a_class_desc"
      )
      .limit(500);
    if (error) throw error;

    const classes = (classRows || [])
      .map((d: Record<string, unknown>) => {
        return {
          Class_Code: String(d.Class_Code || d.class_code || ""),
          E_Class_Name: String(d.E_Class_Name || d.e_class_name || d.E_Class_Desc || d.e_class_desc || ""),
          A_Class_Name: String(d.A_Class_Name || d.a_class_name || d.A_Class_Desc || d.a_class_desc || ""),
          E_Class_Desc: String(d.E_Class_Desc || d.e_class_desc || ""),
          A_Class_Desc: String(d.A_Class_Desc || d.a_class_desc || ""),
        };
      })
      .filter((c) => c.Class_Code)
      .filter((c) => (allowedClassCodes ? allowedClassCodes.has(c.Class_Code) : true))
      .sort((a, b) => {
        const aNum = Number.parseInt(a.Class_Code, 10);
        const bNum = Number.parseInt(b.Class_Code, 10);
        if (Number.isNaN(aNum) || Number.isNaN(bNum)) {
          return a.Class_Code.localeCompare(b.Class_Code);
        }
        return aNum - bNum;
      });

    return NextResponse.json({ classes }, { headers: CACHE_LONG });
  } catch (err) {
    console.error("GET /api/classes error:", err);
    return NextResponse.json({ error: "Failed to fetch classes" }, { status: 500 });
  }
}
