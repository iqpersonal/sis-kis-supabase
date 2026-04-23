import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
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
      const userSnap = await adminDb.collection("admin_users").doc(auth.uid).get();
      const supervisedIds: string[] = Array.isArray(userSnap.data()?.supervised_classes)
        ? (userSnap.data()!.supervised_classes as string[])
        : [];
      if (supervisedIds.length === 0) {
        return NextResponse.json({ students: [], total: 0, offset, limit: limitNum });
      }
      const secRefs = supervisedIds.map((id) => adminDb.collection("sections").doc(id));
      const secDocs = await adminDb.getAll(...secRefs);
      allowedSections = secDocs
        .filter((d) => d.exists)
        .map((d) => ({
          classCode: String(d.data()!.Class_Code || ""),
          sectionCode: String(d.data()!.Section_Code || ""),
        }));
      if (allowedSections.length === 0) {
        return NextResponse.json({ students: [], total: 0, offset, limit: limitNum });
      }
    }

    // Build registration query with server-side filters
    let regQuery: FirebaseFirestore.Query = adminDb
      .collection("registrations")
      .where("Academic_Year", "==", year);

    if (school) {
      regQuery = regQuery.where("Major_Code", "==", school);
    }
    if (classCode) {
      regQuery = regQuery.where("Class_Code", "==", classCode);
    }
    if (sectionCode) {
      regQuery = regQuery.where("Section_Code", "==", sectionCode);
    }

    const regSnap = await regQuery.get();

    // Collect unique student numbers
    const regDocs = regSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        Student_Number: data.Student_Number,
        Major_Code: data.Major_Code,
        Class_Code: data.Class_Code,
        Section_Code: data.Section_Code,
        Termination_Date: data.Termination_Date || null,
      };
    });

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

    // Read student_progress docs directly by student number; doc IDs match Student_Number.
    const studentMap = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < studentNumbers.length; i += 100) {
      const batch = studentNumbers.slice(i, i + 100);
      const refs = batch.map((studentNumber) =>
        adminDb.collection("student_progress").doc(studentNumber)
      );
      const docs = await adminDb.getAll(...refs);
      docs.forEach((d) => {
        if (d.exists) {
          studentMap.set(d.id, d.data() || {});
        }
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
