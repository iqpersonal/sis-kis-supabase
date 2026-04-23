import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getCached, setCache } from "@/lib/cache";
import { CACHE_PRIVATE } from "@/lib/cache-headers";

/**
 * GET /api/teacher/classes?username=... OR ?uid=...
 * Returns classes assigned to the teacher via the assigned_classes field.
 * Falls back to name-matching if no explicit assignments exist.
 */
export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username");
  const uid = req.nextUrl.searchParams.get("uid");

  if (!username && !uid) {
    return NextResponse.json({ error: "username or uid required" }, { status: 400 });
  }

  try {
    let teacherData: FirebaseFirestore.DocumentData;

    if (uid) {
      // Direct lookup by doc ID (Firebase UID)
      const teacherDoc = await adminDb.collection("admin_users").doc(uid).get();
      if (!teacherDoc.exists) {
        return NextResponse.json({ classes: [] });
      }
      teacherData = teacherDoc.data()!;
    } else {
      // Find teacher doc by username
      const teacherSnap = await adminDb
        .collection("admin_users")
        .where("username", "==", username)
        .where("role", "==", "teacher")
        .limit(1)
        .get();

      if (teacherSnap.empty) {
        return NextResponse.json({ classes: [] });
      }
      teacherData = teacherSnap.docs[0].data();
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
            // Look up section doc to get Class_Code / Section_Code
            if (a.classId) {
              const secDoc = await adminDb.collection("sections").doc(a.classId).get();
              if (secDoc.exists) {
                const sd = secDoc.data()!;
                const classCode = String(sd.Class_Code || "");
                const sectionCode = String(sd.Section_Code || "");
                let query: FirebaseFirestore.Query = adminDb
                  .collection("registrations")
                  .where("Class_Code", "==", classCode)
                  .where("Section_Code", "==", sectionCode);
                if (sd.Major_Code) {
                  query = query.where("Major_Code", "==", String(sd.Major_Code));
                }
                if (a.year) {
                  query = query.where("Academic_Year", "==", a.year);
                }
                const regSnap = await query.get();
                studentCount = regSnap.docs.filter(
                  (d) => !d.data().Termination_Date
                ).length;
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
      const classesSnap = await adminDb.collection("classes").get();
      classMap = new Map<string, string>();
      for (const doc of classesSnap.docs) {
        const d = doc.data();
        classMap.set(d.Class_Code, d.E_Class_Desc || d.E_Class_Abbreviation || "");
      }
      setCache("class_code_map", classMap);
    }

    // Get latest academic year sections
    const sectionsSnap = await adminDb.collection("sections").get();
    const classes: ClassInfo[] = [];

    // No name matching possible without teacher field in sections
    // Return empty — teacher must be assigned via admin
    return NextResponse.json({ classes }, { headers: CACHE_PRIVATE });
  } catch (err) {
    console.error("Teacher classes error:", err);
    return NextResponse.json({ error: "Failed to fetch classes" }, { status: 500 });
  }
}
