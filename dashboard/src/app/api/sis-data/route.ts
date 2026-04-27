import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_LONG, CACHE_SHORT } from "@/lib/cache-headers";

/**
 * Unified SiS data API (replaces all Firestore reads in use-sis-data.ts).
 *
 * Actions:
 *   collection-stats  — row counts for all core SiS tables
 *   collection        — fetch all rows (with optional year filter and limit)
 *   reg-counts        — registration counts per academic year
 *   summary           — pre-aggregated summaries document for a year
 *   quiz-summary      — pre-aggregated quiz summaries for a year
 *   delinquency       — delinquency_students document for a year+school
 */

// Allowlist of tables that may be accessed through this endpoint
const ALLOWED_TABLES = new Set([
  "students",
  "sponsors",
  "registrations",
  "student_charges",
  "student_invoices",
  "student_installments",
  "student_discounts",
  "student_absence",
  "student_exam_results",
  "student_tardy",
  "sections",
  "section_averages",
  "classes",
  "subjects",
  "employees",
  "academic_years",
]);

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get("action");

  const supabase = createServiceClient();

  // ── collection-stats ───────────────────────────────────────────────────────
  if (action === "collection-stats") {
    try {
      const TABLES = [
        { name: "Students",          table: "students" },
        { name: "Sponsors",          table: "sponsors" },
        { name: "Registrations",     table: "registrations" },
        { name: "Charges",           table: "student_charges" },
        { name: "Invoices",          table: "student_invoices" },
        { name: "Installments",      table: "student_installments" },
        { name: "Discounts",         table: "student_discounts" },
        { name: "Absence",           table: "student_absence" },
        { name: "Exam Results",      table: "student_exam_results" },
        { name: "Tardy",             table: "student_tardy" },
        { name: "Sections",          table: "sections" },
        { name: "Section Averages",  table: "section_averages" },
        { name: "Classes",           table: "classes" },
        { name: "Subjects",          table: "subjects" },
        { name: "Employees",         table: "employees" },
        { name: "Academic Years",    table: "academic_years" },
      ];

      const results = await Promise.all(
        TABLES.map(async ({ name, table }) => {
          const { count } = await supabase
            .from(table)
            .select("*", { count: "exact", head: true });
          return { name, collection: table, count: count ?? 0 };
        })
      );

      return NextResponse.json({ stats: results }, { headers: CACHE_SHORT });
    } catch (err) {
      console.error("collection-stats error:", err);
      return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }
  }

  // ── collection ─────────────────────────────────────────────────────────────
  if (action === "collection") {
    const table = searchParams.get("table") ?? "";
    const maxDocs = Math.min(Number(searchParams.get("limit") ?? "500"), 5000);
    const year = searchParams.get("year");
    const yearField = searchParams.get("yearField") ?? "Academic_Year";
    const page = Number(searchParams.get("page") ?? "0");
    const orderField = searchParams.get("orderField");
    const countOnly = searchParams.get("count") === "1";

    if (!ALLOWED_TABLES.has(table)) {
      return NextResponse.json({ error: "Table not allowed" }, { status: 400 });
    }

    try {
      // Count mode (for total pages)
      if (countOnly) {
        let q = supabase.from(table).select("*", { count: "exact", head: true });
        if (year) {
          const yearNum = Number(year);
          q = q.eq(yearField, isNaN(yearNum) ? year : yearNum);
        }
        const { count } = await q;
        return NextResponse.json({ count: count ?? 0 });
      }

      let q = supabase.from(table).select("*");
      if (year) {
        const yearNum = Number(year);
        q = q.eq(yearField, isNaN(yearNum) ? year : yearNum) as typeof q;
      }
      if (orderField) {
        q = q.order(orderField) as typeof q;
      }
      // Offset-based pagination
      const from = page * maxDocs;
      q = q.range(from, from + maxDocs - 1) as typeof q;

      const { data } = await q;
      return NextResponse.json({ data: data ?? [] }, { headers: year ? CACHE_SHORT : CACHE_LONG });
    } catch (err) {
      console.error(`collection(${table}) error:`, err);
      return NextResponse.json({ error: "Failed to fetch collection" }, { status: 500 });
    }
  }

  // ── reg-counts ─────────────────────────────────────────────────────────────
  if (action === "reg-counts") {
    const yearsParam = searchParams.get("years") ?? "";
    const years = yearsParam.split(",").filter(Boolean);
    if (!years.length) {
      return NextResponse.json({ counts: [] });
    }

    try {
      const results = await Promise.all(
        years.map(async (year) => {
          const yearNum = Number(year);
          const { count } = await supabase
            .from("registrations")
            .select("*", { count: "exact", head: true })
            .eq("Academic_Year", isNaN(yearNum) ? year : yearNum);
          return { year, count: count ?? 0 };
        })
      );
      results.sort((a, b) => a.year.localeCompare(b.year));
      return NextResponse.json({ counts: results }, { headers: CACHE_SHORT });
    } catch (err) {
      console.error("reg-counts error:", err);
      return NextResponse.json({ error: "Failed to fetch reg counts" }, { status: 500 });
    }
  }

  // ── summary ────────────────────────────────────────────────────────────────
  if (action === "summary") {
    const year = searchParams.get("year");
    if (!year) return NextResponse.json({ data: null });
    try {
      const { data } = await supabase
        .from("summaries")
        .select("*")
        .eq("id", year)
        .maybeSingle();
      return NextResponse.json({ data: data ?? null }, { headers: CACHE_SHORT });
    } catch (err) {
      console.error("summary error:", err);
      return NextResponse.json({ error: "Failed to fetch summary" }, { status: 500 });
    }
  }

  // ── quiz-summary ───────────────────────────────────────────────────────────
  if (action === "quiz-summary") {
    const year = searchParams.get("year");
    if (!year) return NextResponse.json({ data: null });
    try {
      const { data } = await supabase
        .from("quiz_summaries")
        .select("*")
        .eq("id", year)
        .maybeSingle();
      return NextResponse.json({ data: data ?? null }, { headers: CACHE_SHORT });
    } catch (err) {
      console.error("quiz-summary error:", err);
      return NextResponse.json({ error: "Failed to fetch quiz summary" }, { status: 500 });
    }
  }

  // ── delinquency ────────────────────────────────────────────────────────────
  if (action === "delinquency") {
    const year = searchParams.get("year");
    const school = searchParams.get("school") ?? "all";
    if (!year) return NextResponse.json({ data: null });
    const id = `${year}_${school}`;
    try {
      const { data } = await supabase
        .from("delinquency_students")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      return NextResponse.json({
        data: data ?? { fully_paid_students: [], zero_paid_students: [] },
      });
    } catch (err) {
      console.error("delinquency error:", err);
      return NextResponse.json({ error: "Failed to fetch delinquency data" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
