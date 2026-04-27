import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { getCached, setCache } from "@/lib/cache";
import { CACHE_MEDIUM } from "@/lib/cache-headers";

/**
 * GET  /api/admin/users/assign-classes?year=25-26&school=0021-01  → list sections (filtered by year and/or school)
 * PUT  /api/admin/users/assign-classes             → assign sections to a teacher
 *   Body: { uid: string, classes: { classId, className, section, year, campus }[] }
 */

// Non-academic class codes to exclude from assignment lists
const EXCLUDED_CLASS_CODES = new Set(["34", "51"]); // 34=Terminated, 51=OtherC

async function verifyCallerIsSuperAdmin(req: NextRequest) {
  const supabase = createServiceClient();
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) return false;

    const { data: profile } = await supabase
      .from("admin_users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile) return profile.role === "super_admin";
    return false;
  } catch {
    return false;
  }
}

// ── GET: List available sections with class (grade) names ──────
export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const authorized = await verifyCallerIsSuperAdmin(req);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const yearParam = req.nextUrl.searchParams.get("year");
    const schoolParam = req.nextUrl.searchParams.get("school"); // "0021-01" or "0021-02"
    console.log("[assign-classes] GET params:", { yearParam, schoolParam, url: req.nextUrl.toString() });

    // Build class-code → grade-name lookup (only needed fields)
    const { data: classRows } = await supabase
      .from("classes")
      .select("Class_Code, class_code, E_Class_Desc, e_class_desc, E_Class_Abbreviation, e_class_abbreviation, A_Class_Desc, a_class_desc, A_Class_Abbreviation, a_class_abbreviation")
      .limit(500);
    const classMap = new Map<string, { en: string; ar: string }>();
    for (const d of classRows || []) {
      const row = d as Record<string, unknown>;
      const code = String(row.Class_Code || row.class_code || "");
      if (!code) continue;
      classMap.set(code, {
        en: String(row.E_Class_Desc || row.e_class_desc || row.E_Class_Abbreviation || row.e_class_abbreviation || ""),
        ar: String(row.A_Class_Desc || row.a_class_desc || row.A_Class_Abbreviation || row.a_class_abbreviation || ""),
      });
    }

    // Build set of active (class_code + section_code) combos from registrations
    let regsQuery = supabase
      .from("registrations")
      .select("Class_Code, class_code, Section_Code, section_code, Major_Code, major_code, Termination_Date, termination_date, Academic_Year, academic_year")
      .limit(5000);
    if (yearParam) {
      regsQuery = regsQuery.or(`Academic_Year.eq.${yearParam},academic_year.eq.${yearParam}`);
    }
    const { data: regsRows } = await regsQuery;

    const activeSections = new Set<string>();
    for (const d of regsRows || []) {
      const row = d as Record<string, unknown>;
      if (row.Termination_Date || row.termination_date) continue; // skip terminated students
      const key = `${String(row.Class_Code || row.class_code || "")}__${String(row.Section_Code || row.section_code || "")}__${String(row.Major_Code || row.major_code || "")}`;
      activeSections.add(key);
    }

    // Fetch sections (filter by year in Firestore, school in memory to avoid composite index)
    let sectionsQuery = supabase
      .from("sections")
      .select("id, Class_Code, class_code, Section_Code, section_code, Major_Code, major_code, E_Section_Name, e_section_name, A_Section_Name, a_section_name, Academic_Year, academic_year")
      .limit(2000);
    if (yearParam) {
      sectionsQuery = sectionsQuery.or(`Academic_Year.eq.${yearParam},academic_year.eq.${yearParam}`);
    }
    const { data: sectionRows } = await sectionsQuery;
    console.log("[assign-classes] sections fetched:", (sectionRows || []).length, "| yearParam:", yearParam, "schoolParam:", schoolParam);

    const classes: {
      classId: string;
      className: string;
      classNameAr: string;
      section: string;
      year: string;
      campus: string;
    }[] = [];

    for (const row of sectionRows || []) {
      const d = row as Record<string, unknown>;
      const classCode = String(d.Class_Code || d.class_code || "");

      // Skip non-academic entries (Terminated, OtherC)
      if (EXCLUDED_CLASS_CODES.has(classCode)) continue;

      const majorCode = String(d.Major_Code || d.major_code || "");
      const campus = majorCode.endsWith("-01") ? "Boys" : majorCode.endsWith("-02") ? "Girls" : "";

      // Filter by school/campus if requested
      if (schoolParam) {
        if (schoolParam === "0021-01" && campus !== "Boys") continue;
        if (schoolParam === "0021-02" && campus !== "Girls") continue;
      }

      // Only include sections that have active students
      const sectionCode = String(d.Section_Code || d.section_code || "");
      const activeKey = `${classCode}__${sectionCode}__${majorCode}`;
      if (!activeSections.has(activeKey)) continue;

      const grade = classMap.get(classCode);
      classes.push({
        classId: String(d.id || ""),
        className: grade?.en || `Class ${classCode}`,
        classNameAr: grade?.ar || "",
        section: String(d.E_Section_Name || d.e_section_name || d.A_Section_Name || d.a_section_name || ""),
        year: String(d.Academic_Year || d.academic_year || ""),
        campus,
      });
    }

    // Only fetch subjects when explicitly requested (separate concern)
    const withSubjects = req.nextUrl.searchParams.get("subjects") === "1";
    let subjects: { code: string; nameEn: string; nameAr: string }[] = [];
    if (withSubjects) {
      const cached = getCached<{ code: string; nameEn: string; nameAr: string }[]>("filtered_subjects");
      if (cached) {
        subjects = cached;
      } else {
        try {
          const [{ data: subjectsRows }, { data: classSubjectsRows }] = await Promise.all([
            supabase.from("subjects").select("id, Subject_Code, subject_code, E_Subject_Name, e_subject_name, A_Subject_Name, a_subject_name").limit(1000),
            supabase.from("raw_Class_Subjects").select("Subject_Code, subject_code").limit(5000),
          ]);

          const subjectCodesWithGrades = new Set<string>();
          (classSubjectsRows || []).forEach((row) => {
            const d = row as Record<string, unknown>;
            const code = String(d.Subject_Code || d.subject_code || "");
            if (code) subjectCodesWithGrades.add(code);
          });

          subjects = (subjectsRows || [])
            .map((row) => {
              const d = row as Record<string, unknown>;
              return {
                code: String(d.Subject_Code || d.subject_code || d.id || ""),
                nameEn: String(d.E_Subject_Name || d.e_subject_name || ""),
                nameAr: String(d.A_Subject_Name || d.a_subject_name || ""),
              };
            })
            .filter((s) => !!s.code && subjectCodesWithGrades.has(s.code))
            .sort((a, b) => a.nameEn.localeCompare(b.nameEn));
          setCache("filtered_subjects", subjects);
        } catch {
          // Subjects tables may not be migrated yet; keep endpoint functional.
          subjects = [];
        }
      }
    }

    // Sort classes by grade number, then section name
    classes.sort((a, b) => {
      const numA = parseInt(a.className.replace(/\D/g, "")) || 0;
      const numB = parseInt(b.className.replace(/\D/g, "")) || 0;
      if (numA !== numB) return numA - numB;
      return a.section.localeCompare(b.section);
    });

    console.log("[assign-classes] returning", classes.length, "classes,", subjects.length, "subjects");
    return NextResponse.json({ classes, subjects }, { headers: CACHE_MEDIUM });
  } catch (err) {
    console.error("List classes error:", err);
    return NextResponse.json({ error: "Failed to fetch classes" }, { status: 500 });
  }
}

// ── PUT: Assign sections to a teacher ──────────────────────────
export async function PUT(req: NextRequest) {
  const supabase = createServiceClient();
  const authorized = await verifyCallerIsSuperAdmin(req);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { uid, classes } = body as {
      uid: string;
      classes: {
        classId: string;
        className: string;
        section: string;
        year: string;
        campus: string;
        subject?: string;
      }[];
    };

    if (!uid) {
      return NextResponse.json({ error: "uid required" }, { status: 400 });
    }

    if (!Array.isArray(classes)) {
      return NextResponse.json({ error: "classes array required" }, { status: 400 });
    }

    // Verify the user exists and is a teacher
    const { data: userDoc } = await supabase
      .from("admin_users")
      .select("id")
      .eq("id", uid)
      .maybeSingle();
    if (!userDoc) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update the teacher's assigned_classes
    const { error } = await supabase
      .from("admin_users")
      .update({
        assigned_classes: classes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", uid);

    if (error) {
      return NextResponse.json({ error: `Failed to update assignments: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, count: classes.length });
  } catch (err) {
    console.error("Assign classes error:", err);
    return NextResponse.json({ error: "Failed to assign classes" }, { status: 500 });
  }
}
