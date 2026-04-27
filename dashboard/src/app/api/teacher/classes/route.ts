import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { getCached, setCache } from "@/lib/cache";
import { CACHE_PRIVATE } from "@/lib/cache-headers";

/**
 * GET /api/teacher/classes?username=... OR ?uid=...
 * Returns classes assigned to the teacher via the assigned_classes field.
 * Falls back to name-matching if no explicit assignments exist.
 */
export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const username = req.nextUrl.searchParams.get("username");
  const uid = req.nextUrl.searchParams.get("uid");

  if (!username && !uid) {
    return NextResponse.json({ error: "username or uid required" }, { status: 400 });
  }

  try {
    let teacherData: Record<string, unknown>;

    if (uid) {
      const { data, error } = await supabase
        .from("admin_users")
        .select("*")
        .eq("id", uid)
        .single();

      if (error || !data) {
        return NextResponse.json({ classes: [] });
      }
      teacherData = data as Record<string, unknown>;
    } else {
      const { data, error } = await supabase
        .from("admin_users")
        .select("*")
        .eq("username", username)
        .eq("role", "teacher")
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return NextResponse.json({ classes: [] });
      }
      teacherData = data as Record<string, unknown>;
    }

    interface ClassInfo {
      id: string;
      className: string;
      section: string;
      subject: string;
      teacher: string;
      year: string;
      studentCount: number;
    }

    // ── Primary: use explicit assigned_classes ──
    const assigned = teacherData.assigned_classes as
      | { classId: string; className: string; section: string; year: string; campus?: string }[]
      | undefined;

    if (assigned && assigned.length > 0) {
      // Fetch student counts for each assigned class in parallel
      const classes: ClassInfo[] = await Promise.all(
        assigned.map(async (a: any) => {
          let studentCount = 0;
          try {
            // Look up section row to get Class_Code / Section_Code
            if (a.classId) {
              const { data: sd } = await supabase
                .from("sections")
                .select("Class_Code, Section_Code, class_code, section_code, Major_Code, major_code")
                .eq("id", a.classId)
                .maybeSingle();

              if (sd) {
                const classCode = String(sd.Class_Code || "");
                const sectionCode = String(sd.Section_Code || "");
                let query = supabase
                  .from("registrations")
                  .select("termination_date, class_code, section_code, major_code, academic_year")
                  .eq("class_code", classCode)
                  .eq("section_code", sectionCode);

                const majorCode = String(sd.Major_Code || sd.major_code || "");
                if (majorCode) query = query.eq("major_code", majorCode);
                if (a.year) query = query.eq("academic_year", a.year);

                const { data: regs } = await query;
                studentCount = (regs || []).filter((r: Record<string, unknown>) => !r.termination_date).length;
              }
            }
          } catch (e) {
            console.error(`Error counting students for ${a.classId}:`, e);
          }
          return {
            id: a.classId,
            classId: a.classId,
            className: a.className,
            section: a.section,
            subject: a.subject || "",
            teacher: teacherData.displayName || "",
            year: a.year,
            studentCount,
          };
        })
      );
      return NextResponse.json({ classes }, { headers: CACHE_PRIVATE });
    }

    // ── Fallback: resolve sections from Firestore ──
    // Build class-code → grade-name lookup (cached)
    let classMap = getCached<Map<string, string>>("class_code_map");
    if (!classMap) {
      const { data: classRows } = await supabase
        .from("classes")
        .select("Class_Code, class_code, E_Class_Desc, e_class_desc, E_Class_Abbreviation, e_class_abbreviation");

      classMap = new Map<string, string>();
      for (const d of classRows || []) {
        const item = d as Record<string, unknown>;
        const code = String(item.Class_Code || item.class_code || "");
        const label = String(item.E_Class_Desc || item.e_class_desc || item.E_Class_Abbreviation || item.e_class_abbreviation || "");
        if (code) classMap.set(code, label);
      }
      setCache("class_code_map", classMap);
    }

    const classes: ClassInfo[] = [];

    // No name matching possible without teacher field in sections
    // Return empty — teacher must be assigned via admin
    return NextResponse.json({ classes }, { headers: CACHE_PRIVATE });
  } catch (err) {
    console.error("Teacher classes error:", err);
    return NextResponse.json({ error: "Failed to fetch classes" }, { status: 500 });
  }
}
