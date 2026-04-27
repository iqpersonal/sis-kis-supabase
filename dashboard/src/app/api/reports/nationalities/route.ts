import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT } from "@/lib/cache-headers";

/**
 * GET /api/reports/nationalities
 * Params: year (required), school, class, section (optional filters)
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const year = sp.get("year");
  if (!year) return NextResponse.json({ error: "year is required" }, { status: 400 });

  const schoolFilter = sp.get("school") || "";
  const classFilter = sp.get("class") || "";
  const sectionFilter = sp.get("section") || "";

  const supabase = createServiceClient();

  try {
    // 1. Fetch registrations for the year
    let regQuery = supabase
      .from("registrations")
      .select("Student_Number, Termination_Date")
      .eq("Academic_Year", Number(year) || year);

    if (schoolFilter) regQuery = regQuery.eq("Major_Code", schoolFilter);
    if (classFilter) regQuery = regQuery.eq("Class_Code", Number(classFilter) || classFilter);
    if (sectionFilter) regQuery = regQuery.eq("Section_Code", sectionFilter);

    const { data: regs } = await regQuery.limit(10000);

    // Only active students (no Termination_Date)
    const studentNumbers = new Set<string>(
      (regs ?? [])
        .filter((r) => !(r as Record<string, unknown>)["Termination_Date"])
        .map((r) => String((r as Record<string, unknown>)["Student_Number"]))
    );

    if (studentNumbers.size === 0) {
      return NextResponse.json({ rows: [], total: 0, nationalities_count: 0 }, { headers: CACHE_SHORT });
    }

    // 2. Fetch students for Student_Number → Family_Number + Child_Number mapping
    const snArray = [...studentNumbers];
    const studentMap = new Map<string, { familyNum: string; childNum: number }>();

    for (let i = 0; i < snArray.length; i += 500) {
      const batch = snArray.slice(i, i + 500);
      const { data: stRows } = await supabase
        .from("students")
        .select("Student_Number, Family_Number, Child_Number")
        .in("Student_Number", batch);
      for (const row of stRows ?? []) {
        const r = row as Record<string, unknown>;
        studentMap.set(String(r["Student_Number"]), {
          familyNum: String(r["Family_Number"]),
          childNum: Number(r["Child_Number"]),
        });
      }
    }

    // 3. Fetch nationality from family_children
    const familyNumbers = [...new Set([...studentMap.values()].map((v) => v.familyNum))];
    const fcNatMap = new Map<string, string>();

    for (let i = 0; i < familyNumbers.length; i += 500) {
      const batch = familyNumbers.slice(i, i + 500);
      const { data: fcRows } = await supabase
        .from("family_children")
        .select("Family_Number, Child_Number, Nationality_Code_Primary")
        .in("Family_Number", batch);
      for (const row of fcRows ?? []) {
        const r = row as Record<string, unknown>;
        const key = `${r["Family_Number"]}|${r["Child_Number"]}`;
        fcNatMap.set(key, String(r["Nationality_Code_Primary"] ?? ""));
      }
    }

    // 4. Nationality code → name map
    const { data: natRows } = await supabase
      .from("nationalities")
      .select("Nationality_Code, E_Nationality_Name");
    const natNameMap = new Map<string, string>();
    for (const row of natRows ?? []) {
      const r = row as Record<string, unknown>;
      natNameMap.set(String(r["Nationality_Code"]), String(r["E_Nationality_Name"] ?? r["Nationality_Code"]));
    }

    // 5. Count nationalities
    const counts: Record<string, number> = {};
    for (const sn of studentNumbers) {
      const student = studentMap.get(sn);
      if (!student) { counts["Unknown"] = (counts["Unknown"] || 0) + 1; continue; }
      const fcKey = `${student.familyNum}|${student.childNum}`;
      const natCode = fcNatMap.get(fcKey) || "";
      const natName = natNameMap.get(natCode) || "Unknown";
      counts[natName] = (counts[natName] || 0) + 1;
    }

    // 6. Sort + percentages
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    const rows = sorted.map(([name, count]) => ({
      name,
      count,
      pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }));

    return NextResponse.json({ rows, total, nationalities_count: rows.length }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Nationalities report error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
