import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

/**
 * GET /api/students/search?year=25-26&q=ahmed&school=0021-01&class=24&section=A&status=active&limit=100&offset=0
 *
 * Server-side student search to avoid loading 10K docs client-side.
 * Queries registrations filtered by year, then joins with students collection.
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

  try {
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

    // Limit server-side reads
    const regSnap = await regQuery.limit(2000).get();

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

    // If there's a text query, we need student details for name search
    // Batch-fetch student docs for the filtered registrations
    const studentNumbers = [...new Set(filteredRegs.map((r) => String(r.Student_Number)))];

    // Fetch students in batches of 30 (Firestore 'in' limit)
    const studentMap = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < studentNumbers.length; i += 30) {
      const batch = studentNumbers.slice(i, i + 30);
      const snap = await adminDb
        .collection("students")
        .where("Student_Number", "in", batch.map((sn) => {
          const num = Number(sn);
          return isNaN(num) ? sn : num;
        }))
        .get();
      snap.docs.forEach((d) => {
        const data = d.data();
        studentMap.set(String(data.Student_Number), data);
      });
    }

    // Join and apply text search
    let results = filteredRegs.map((reg) => {
      const stu = studentMap.get(String(reg.Student_Number)) || {};
      return {
        ...reg,
        E_Full_Name: stu.E_Full_Name || stu.E_Child_Name || "",
        Gender: stu.Gender,
        Child_Birth_Date: stu.Child_Birth_Date || null,
        Nationality_Code_Primary: stu.Nationality_Code_Primary || null,
      };
    });

    if (q) {
      results = results.filter((r) => {
        const name = String(r.E_Full_Name || "").toLowerCase();
        const sn = String(r.Student_Number || "").toLowerCase();
        return name.includes(q) || sn.includes(q);
      });
    }

    // Apply limit
    const total = results.length;
    const offset = Number(searchParams.get("offset")) || 0;
    const page = results.slice(offset, offset + limitNum);

    return NextResponse.json({
      students: page,
      total,
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
