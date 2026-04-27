import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_LONG } from "@/lib/cache-headers";

/* ────────────────────────────────────────────────────────────────── */
/*  GET /api/academic-year                                             */
/*   ?year=25-26  → returns term_count for that year                   */
/*   (no year)    → returns all years with their term_count            */
/* ────────────────────────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const sp = req.nextUrl.searchParams;
  const year = sp.get("year");

  try {
    const { data, error } = await supabase.from("academic_years").select("*");
    if (error) throw error;
    const docs = (data || []) as Array<Record<string, unknown> & { id: string }>;

    if (year) {
      const doc = docs.find((d) => (d.Academic_Year || d.academic_year || d.id) === year);
      if (!doc) {
        return NextResponse.json({ error: "Year not found" }, { status: 404 });
      }
      return NextResponse.json({
        year: doc.Academic_Year || doc.academic_year || doc.id,
        term_count: doc.term_count ?? 3,
        current_year: doc.Current_Year ?? doc.current_year ?? false,
      }, { headers: CACHE_LONG });
    }

    // Return all years
    const years = docs
      .filter((d) => d.Academic_Year || d.academic_year || d.id)
      .map((d) => ({
        id: d.id,
        year: d.Academic_Year || d.academic_year || d.id,
        term_count: d.term_count ?? 3,
        current_year: d.Current_Year ?? d.current_year ?? false,
        date_from: d.Date_From ?? d.date_from ?? d.start_date ?? null,
        date_to: d.Date_To ?? d.date_to ?? d.end_date ?? null,
      }))
      .sort((a, b) => String(b.year).localeCompare(String(a.year)));

    return NextResponse.json({ years }, { headers: CACHE_LONG });
  } catch (err) {
    console.error("GET /api/academic-year error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ────────────────────────────────────────────────────────────────── */
/*  POST /api/academic-year                                            */
/*   { year: "25-26", term_count: 2 }                                  */
/* ────────────────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  try {
    const body = await req.json();
    const { year, term_count } = body;

    if (!year || typeof year !== "string") {
      return NextResponse.json({ error: "year is required" }, { status: 400 });
    }

    const tc = Number(term_count);
    if (![2, 3].includes(tc)) {
      return NextResponse.json(
        { error: "term_count must be 2 or 3" },
        { status: 400 },
      );
    }

    // Find the academic_years row for this year
    const { data: matchRows, error: matchErr } = await supabase
      .from("academic_years")
      .select("id")
      .or(`Academic_Year.eq.${year},academic_year.eq.${year},id.eq.${year}`)
      .limit(1);
    if (matchErr) throw matchErr;

    if (!matchRows || matchRows.length === 0) {
      return NextResponse.json({ error: "Year not found" }, { status: 404 });
    }

    const targetId = String(matchRows[0].id);
    const { error: updateErr } = await supabase
      .from("academic_years")
      .update({ term_count: tc })
      .eq("id", targetId);
    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true, year, term_count: tc });
  } catch (err) {
    console.error("POST /api/academic-year error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
