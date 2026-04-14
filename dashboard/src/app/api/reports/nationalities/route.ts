import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_SHORT } from "@/lib/cache-headers";

/**
 * GET /api/reports/nationalities
 *
 * Params:
 *   year      (required)  — academic year code e.g. "25-26"
 *   school    (optional)  — Major_Code filter e.g. "0021-01"
 *   class     (optional)  — Class_Code filter e.g. "24"
 *   section   (optional)  — Section_Code filter
 *
 * Returns:
 *   { rows: [{ name, count, pct }], total, nationalities_count }
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const year = sp.get("year");
  if (!year) {
    return NextResponse.json({ error: "year is required" }, { status: 400 });
  }

  const schoolFilter = sp.get("school") || "";
  const classFilter = sp.get("class") || "";
  const sectionFilter = sp.get("section") || "";

  try {
    /* ── 1. Fetch registrations for the year ── */
    let regQuery: FirebaseFirestore.Query = adminDb.collection("registrations");

    // Firestore requires numeric year if stored as number
    const yearNum = Number(year);
    regQuery = regQuery.where("Academic_Year", "==", isNaN(yearNum) ? year : yearNum);

    if (schoolFilter) {
      regQuery = regQuery.where("Major_Code", "==", schoolFilter);
    }
    if (classFilter) {
      const classNum = Number(classFilter);
      regQuery = regQuery.where("Class_Code", "==", isNaN(classNum) ? classFilter : classNum);
    }
    if (sectionFilter) {
      regQuery = regQuery.where("Section_Code", "==", sectionFilter);
    }

    const regSnap = await regQuery.select("Student_Number", "Termination_Date").get();

    // Only active students (no Termination_Date)
    const studentNumbers = new Set<string>();
    for (const doc of regSnap.docs) {
      const d = doc.data();
      if (!d.Termination_Date) {
        studentNumbers.add(String(d.Student_Number));
      }
    }

    if (studentNumbers.size === 0) {
      return NextResponse.json({ rows: [], total: 0, nationalities_count: 0 }, { headers: CACHE_SHORT });
    }

    /* ── 2. Build Student_Number → (Family_Number, Child_Number) from students ── */
    // Batch fetch students (Firestore "in" limit = 30)
    const snArray = [...studentNumbers];
    const studentMap = new Map<string, { familyNum: string; childNum: number }>();

    for (let i = 0; i < snArray.length; i += 30) {
      const batch = snArray.slice(i, i + 30);
      const snap = await adminDb
        .collection("students")
        .where("Student_Number", "in", batch)
        .select("Student_Number", "Family_Number", "Child_Number")
        .get();
      for (const doc of snap.docs) {
        const d = doc.data();
        studentMap.set(String(d.Student_Number), {
          familyNum: String(d.Family_Number),
          childNum: Number(d.Child_Number),
        });
      }
    }

    /* ── 3. Build (Family_Number+Child_Number) → Nationality from family_children ── */
    // Collect unique family numbers, batch fetch
    const familyNumbers = [...new Set([...studentMap.values()].map((v) => v.familyNum))];
    const fcNatMap = new Map<string, string>(); // "familyNum|childNum" → nat code

    for (let i = 0; i < familyNumbers.length; i += 30) {
      const batch = familyNumbers.slice(i, i + 30);
      const snap = await adminDb
        .collection("family_children")
        .where("Family_Number", "in", batch)
        .select("Family_Number", "Child_Number", "Nationality_Code_Primary")
        .get();
      for (const doc of snap.docs) {
        const d = doc.data();
        const key = `${d.Family_Number}|${d.Child_Number}`;
        fcNatMap.set(key, String(d.Nationality_Code_Primary ?? ""));
      }
    }

    /* ── 4. Build nationality code → name map ── */
    const natSnap = await adminDb.collection("nationalities").select("Nationality_Code", "E_Nationality_Name").get();
    const natNameMap = new Map<string, string>();
    for (const doc of natSnap.docs) {
      const d = doc.data();
      natNameMap.set(String(d.Nationality_Code), String(d.E_Nationality_Name ?? d.Nationality_Code));
    }

    /* ── 5. Count nationalities ── */
    const counts: Record<string, number> = {};
    for (const sn of studentNumbers) {
      const student = studentMap.get(sn);
      if (!student) {
        counts["Unknown"] = (counts["Unknown"] || 0) + 1;
        continue;
      }
      const fcKey = `${student.familyNum}|${student.childNum}`;
      const natCode = fcNatMap.get(fcKey) || "";
      const natName = natNameMap.get(natCode) || "Unknown";
      counts[natName] = (counts[natName] || 0) + 1;
    }

    /* ── 6. Sort and compute percentages ── */
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    const rows = sorted.map(([name, count]) => ({
      name,
      count,
      pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }));

    return NextResponse.json(
      { rows, total, nationalities_count: rows.length },
      { headers: CACHE_SHORT }
    );
  } catch (err) {
    console.error("Nationalities report error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
