import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_PRIVATE } from "@/lib/cache-headers";

/**
 * GET /api/teacher/students?classId=SECTION_DOC_ID&year=25-26
 *   — preferred: looks up the section doc to get Class_Code + Section_Code
 * GET /api/teacher/students?class=Grade+8&section=Pears+Boys'&year=25-26
 *   — legacy: reverse-looks up codes from human-readable names
 */
export async function GET(req: NextRequest) {
  const classId = req.nextUrl.searchParams.get("classId");
  const className = req.nextUrl.searchParams.get("class");
  const section = req.nextUrl.searchParams.get("section");
  const year = req.nextUrl.searchParams.get("year");

  if (!classId && !className) {
    return NextResponse.json({ error: "classId or class required" }, { status: 400 });
  }

  try {
    let classCode: string | null = null;
    let sectionCode: string | null = null;
    let majorCode: string | null = null;

    // ── Strategy 1: Use classId (section doc ID) to get codes directly ──
    if (classId) {
      const secDoc = await adminDb.collection("sections").doc(classId).get();
      if (secDoc.exists) {
        const sd = secDoc.data()!;
        classCode = String(sd.Class_Code || "");
        sectionCode = String(sd.Section_Code || "");
        majorCode = sd.Major_Code ? String(sd.Major_Code) : null;
      }
    }

    // ── Strategy 2: Reverse-lookup from human-readable names ──
    if (!classCode && className) {
      // Find Class_Code from classes collection
      const classSnap = await adminDb
        .collection("classes")
        .where("E_Class_Desc", "==", className)
        .limit(1)
        .get();
      if (!classSnap.empty) {
        classCode = classSnap.docs[0].data().Class_Code;
      } else {
        // Try abbreviation
        const abbSnap = await adminDb
          .collection("classes")
          .where("E_Class_Abbreviation", "==", className)
          .limit(1)
          .get();
        if (!abbSnap.empty) {
          classCode = abbSnap.docs[0].data().Class_Code;
        } else {
          // Maybe className IS the code already
          classCode = className;
        }
      }

      // Find Section_Code from sections collection
      if (section && classCode) {
        const secSnap = await adminDb
          .collection("sections")
          .where("Class_Code", "==", classCode)
          .where("E_Section_Name", "==", section)
          .limit(1)
          .get();
        if (!secSnap.empty) {
          const secData = secSnap.docs[0].data();
          sectionCode = secData.Section_Code;
          majorCode = secData.Major_Code ? String(secData.Major_Code) : null;
        } else {
          // Try A_Section_Name
          const secArSnap = await adminDb
            .collection("sections")
            .where("Class_Code", "==", classCode)
            .where("A_Section_Name", "==", section)
            .limit(1)
            .get();
          if (!secArSnap.empty) {
            const secArData = secArSnap.docs[0].data();
            sectionCode = secArData.Section_Code;
            majorCode = secArData.Major_Code ? String(secArData.Major_Code) : null;
          }
        }
      }
    }

    if (!classCode) {
      return NextResponse.json({ students: [] });
    }

    // Query registrations with correct PascalCase field names
    let query: FirebaseFirestore.Query = adminDb.collection("registrations");
    query = query.where("Class_Code", "==", classCode);
    if (sectionCode) query = query.where("Section_Code", "==", sectionCode);
    if (majorCode) query = query.where("Major_Code", "==", majorCode);
    if (year) query = query.where("Academic_Year", "==", year);

    const regSnap = await query.get();

    // Filter out terminated students
    const studentNumbers = regSnap.docs
      .filter((d) => !d.data().Termination_Date)
      .map((d) => d.data().Student_Number || d.data().student_number);
    const unique = [...new Set(studentNumbers.filter(Boolean))];

    // Fetch student details from student_progress collection
    interface StudentInfo {
      studentNumber: string;
      nameEn: string;
      nameAr: string;
      gender: string;
      grade: string;
      section: string;
    }

    const students: StudentInfo[] = [];

    // Batch reads (Firestore getAll max 100)
    const batches = [];
    for (let i = 0; i < unique.length; i += 100) {
      batches.push(unique.slice(i, i + 100));
    }

    for (const batch of batches) {
      const refs = batch.map((sn) => adminDb.collection("student_progress").doc(String(sn)));
      if (refs.length === 0) continue;
      const docs = await adminDb.getAll(...refs);

      for (const doc of docs) {
        if (!doc.exists) continue;
        const s = doc.data()!;
        students.push({
          studentNumber: doc.id,
          nameEn: s.student_name || s.full_name_en || s.STUDENT_NAME_EN || "",
          nameAr: s.student_name_ar || s.full_name_ar || s.STUDENT_NAME_AR || "",
          gender: s.gender || s.GENDER || "",
          grade: className || classCode || "",
          section: section || sectionCode || "",
        } as StudentInfo);
      }
    }

    students.sort((a, b) => a.nameEn.localeCompare(b.nameEn));

    return NextResponse.json({ students }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("Teacher students error:", err);
    return NextResponse.json({ error: "Failed to fetch students" }, { status: 500 });
  }
}
