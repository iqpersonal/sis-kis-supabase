import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const yearParam = req.nextUrl.searchParams.get("year");
    const schoolParam = req.nextUrl.searchParams.get("school"); // 0021-01 (boys) | 0021-02 (girls)

    let allowedClassCodes: Set<string> | null = null;
    if (yearParam || schoolParam) {
      let sectionsQuery: FirebaseFirestore.Query = adminDb.collection("sections");
      if (yearParam) sectionsQuery = sectionsQuery.where("Academic_Year", "==", yearParam);
      const sectionsSnap = await sectionsQuery
        .select("Class_Code", "Major_Code")
        .limit(4000)
        .get();

      allowedClassCodes = new Set<string>();
      for (const doc of sectionsSnap.docs) {
        const d = doc.data();
        const classCode = String(d.Class_Code || "");
        if (!classCode) continue;

        if (schoolParam) {
          const majorCode = String(d.Major_Code || "");
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

    const snap = await adminDb
      .collection("classes")
      .select(
        "Class_Code",
        "E_Class_Name",
        "A_Class_Name",
        "E_Class_Desc",
        "A_Class_Desc",
      )
      .limit(500)
      .get();

    const classes = snap.docs
      .map((doc) => {
        const d = doc.data();
        return {
          Class_Code: String(d.Class_Code || ""),
          E_Class_Name: d.E_Class_Name || d.E_Class_Desc || "",
          A_Class_Name: d.A_Class_Name || d.A_Class_Desc || "",
          E_Class_Desc: d.E_Class_Desc || "",
          A_Class_Desc: d.A_Class_Desc || "",
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

    return NextResponse.json({ classes });
  } catch (err) {
    console.error("GET /api/classes error:", err);
    return NextResponse.json({ error: "Failed to fetch classes" }, { status: 500 });
  }
}
