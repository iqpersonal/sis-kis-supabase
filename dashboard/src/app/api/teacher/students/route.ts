import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_PRIVATE } from "@/lib/cache-headers";
import { compareAlphabeticalNames } from "@/lib/name-sort";

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
    const missingProgressIds: string[] = [];

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
        if (!doc.exists) {
          missingProgressIds.push(doc.id);
          continue;
        }
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

    // Fallback: compose names from family_children + raw_Family for missing student_progress docs
    if (missingProgressIds.length > 0) {
      // 1. Query students collection by Student_Number to get Family_Number + Child_Number
      const studentMeta = new Map<string, { familyNum: string; childNum: number }>();
      for (let i = 0; i < missingProgressIds.length; i += 30) {
        const chunk = missingProgressIds.slice(i, i + 30);
        const snap = await adminDb
          .collection("students")
          .where("Student_Number", "in", chunk)
          .get();
        for (const d of snap.docs) {
          const data = d.data();
          studentMeta.set(
            String(data.Student_Number),
            { familyNum: String(data.Family_Number || ""), childNum: Number(data.Child_Number || 0) }
          );
        }
      }

      // 2. Batch-fetch family_children and raw_Family by family numbers
      const familyNums = [...new Set([...studentMeta.values()].map((m) => m.familyNum).filter(Boolean))];
      const childMap = new Map<string, { nameEn: string; nameAr: string; gender: string }>();
      const familyNameMap = new Map<string, { father: string; fatherAr: string; family: string; familyAr: string }>();

      for (let i = 0; i < familyNums.length; i += 30) {
        const chunk = familyNums.slice(i, i + 30);
        const [childSnap, famSnap] = await Promise.all([
          adminDb.collection("family_children").where("Family_Number", "in", chunk).get(),
          adminDb.collection("raw_Family").where("Family_Number", "in", chunk).get(),
        ]);
        for (const d of childSnap.docs) {
          const data = d.data();
          const key = `${data.Family_Number}__${data.Child_Number}`;
          childMap.set(key, {
            nameEn: data.E_Child_Name || "",
            nameAr: data.A_Child_Name || "",
            gender: data.Gender === true ? "M" : data.Gender === false ? "F" : "",
          });
        }
        for (const d of famSnap.docs) {
          const data = d.data();
          familyNameMap.set(String(data.Family_Number), {
            father: data.E_Father_Name || "",
            fatherAr: data.A_Father_Name || "",
            family: data.E_Family_Name || "",
            familyAr: data.A_Family_Name || "",
          });
        }
      }

      // 3. Compose full names for each missing student
      for (const sn of missingProgressIds) {
        const meta = studentMeta.get(sn);
        const childKey = meta ? `${meta.familyNum}__${meta.childNum}` : "";
        const child = childMap.get(childKey);
        const fam = meta ? familyNameMap.get(meta.familyNum) : undefined;

        const nameEn = child
          ? [child.nameEn, fam?.father, fam?.family].filter(Boolean).join(" ")
          : sn;
        const nameAr = child
          ? [child.nameAr, fam?.fatherAr, fam?.familyAr].filter(Boolean).join(" ")
          : "";

        students.push({
          studentNumber: sn,
          nameEn,
          nameAr,
          gender: child?.gender || "",
          grade: className || classCode || "",
          section: section || sectionCode || "",
        });
      }
    }

    students.sort((a, b) => compareAlphabeticalNames(a.nameEn, b.nameEn));

    return NextResponse.json({ students }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("Teacher students error:", err);
    return NextResponse.json({ error: "Failed to fetch students" }, { status: 500 });
  }
}
