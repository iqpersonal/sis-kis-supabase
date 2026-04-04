import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
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
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const snap = await adminDb.collection("admin_users").doc(decoded.uid).get();
    if (snap.exists) return snap.data()?.role === "super_admin";
    return false;
  } catch {
    return false;
  }
}

// ── GET: List available sections with class (grade) names ──────
export async function GET(req: NextRequest) {
  const authorized = await verifyCallerIsSuperAdmin(req);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const yearParam = req.nextUrl.searchParams.get("year");
    const schoolParam = req.nextUrl.searchParams.get("school"); // "0021-01" or "0021-02"
    console.log("[assign-classes] GET params:", { yearParam, schoolParam, url: req.nextUrl.toString() });

    // Build class-code → grade-name lookup (only needed fields)
    const classSnap = await adminDb
      .collection("classes")
      .select("Class_Code", "E_Class_Desc", "E_Class_Abbreviation", "A_Class_Desc", "A_Class_Abbreviation")
      .limit(500)
      .get();
    const classMap = new Map<string, { en: string; ar: string }>();
    for (const doc of classSnap.docs) {
      const d = doc.data();
      classMap.set(d.Class_Code, {
        en: d.E_Class_Desc || d.E_Class_Abbreviation || "",
        ar: d.A_Class_Desc || d.A_Class_Abbreviation || "",
      });
    }

    // Build set of active (class_code + section_code) combos from registrations
    let regsQuery: FirebaseFirestore.Query = adminDb.collection("registrations");
    if (yearParam) {
      regsQuery = regsQuery.where("Academic_Year", "==", yearParam);
    }
    const regsSnap = await regsQuery.select("Class_Code", "Section_Code", "Major_Code", "Termination_Date").limit(5000).get();
    const activeSections = new Set<string>();
    for (const doc of regsSnap.docs) {
      const d = doc.data();
      if (d.Termination_Date) continue; // skip terminated students
      const key = `${d.Class_Code}__${d.Section_Code}__${d.Major_Code || ""}`;
      activeSections.add(key);
    }

    // Fetch sections (filter by year in Firestore, school in memory to avoid composite index)
    let sectionsQuery: FirebaseFirestore.Query = adminDb.collection("sections");
    if (yearParam) {
      sectionsQuery = sectionsQuery.where("Academic_Year", "==", yearParam);
    }
    const sectionsSnap = await sectionsQuery.limit(2000).get();
    console.log("[assign-classes] sections fetched:", sectionsSnap.size, "| yearParam:", yearParam, "schoolParam:", schoolParam);

    const classes: {
      classId: string;
      className: string;
      classNameAr: string;
      section: string;
      year: string;
      campus: string;
    }[] = [];

    for (const doc of sectionsSnap.docs) {
      const d = doc.data();
      const classCode = String(d.Class_Code || "");

      // Skip non-academic entries (Terminated, OtherC)
      if (EXCLUDED_CLASS_CODES.has(classCode)) continue;

      const majorCode = (d.Major_Code || "") as string;
      const campus = majorCode.endsWith("-01") ? "Boys" : majorCode.endsWith("-02") ? "Girls" : "";

      // Filter by school/campus if requested
      if (schoolParam) {
        if (schoolParam === "0021-01" && campus !== "Boys") continue;
        if (schoolParam === "0021-02" && campus !== "Girls") continue;
      }

      // Only include sections that have active students
      const sectionCode = String(d.Section_Code || "");
      const activeKey = `${classCode}__${sectionCode}__${majorCode}`;
      if (!activeSections.has(activeKey)) continue;

      const grade = classMap.get(d.Class_Code);
      classes.push({
        classId: doc.id,
        className: grade?.en || `Class ${classCode}`,
        classNameAr: grade?.ar || "",
        section: d.E_Section_Name || d.A_Section_Name || "",
        year: d.Academic_Year || "",
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
        const [subjectsSnap, classSubjectsSnap] = await Promise.all([
          adminDb.collection("subjects").limit(1000).get(),
          adminDb.collection("raw_Class_Subjects").limit(5000).get(),
        ]);
        const subjectCodesWithGrades = new Set<string>();
        classSubjectsSnap.docs.forEach((d) => {
          const code = d.data().Subject_Code;
          if (code) subjectCodesWithGrades.add(code);
        });
        subjects = subjectsSnap.docs
          .map((doc) => {
            const d = doc.data();
            return {
              code: d.Subject_Code || doc.id,
              nameEn: d.E_Subject_Name || "",
              nameAr: d.A_Subject_Name || "",
            };
          })
          .filter((s) => subjectCodesWithGrades.has(s.code))
          .sort((a, b) => a.nameEn.localeCompare(b.nameEn));
        setCache("filtered_subjects", subjects);
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
    const userDoc = await adminDb.collection("admin_users").doc(uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update the teacher's assigned_classes
    await adminDb.collection("admin_users").doc(uid).update({
      assigned_classes: classes,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, count: classes.length });
  } catch (err) {
    console.error("Assign classes error:", err);
    return NextResponse.json({ error: "Failed to assign classes" }, { status: 500 });
  }
}
