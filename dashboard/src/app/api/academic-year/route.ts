import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

/* ────────────────────────────────────────────────────────────────── */
/*  GET /api/academic-year                                             */
/*   ?year=25-26  → returns term_count for that year                   */
/*   (no year)    → returns all years with their term_count            */
/* ────────────────────────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const year = sp.get("year");

  try {
    const snap = await adminDb.collection("academic_years").get();
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }));

    if (year) {
      const doc = docs.find((d) => d.Academic_Year === year);
      if (!doc) {
        return NextResponse.json({ error: "Year not found" }, { status: 404 });
      }
      return NextResponse.json({
        year: doc.Academic_Year,
        term_count: doc.term_count ?? 3,
        current_year: doc.Current_Year ?? false,
      });
    }

    // Return all years
    const years = docs
      .filter((d) => d.Academic_Year)
      .map((d) => ({
        id: d.id,
        year: d.Academic_Year,
        term_count: d.term_count ?? 3,
        current_year: d.Current_Year ?? false,
        date_from: d.Date_From ?? null,
        date_to: d.Date_To ?? null,
      }))
      .sort((a, b) => String(b.year).localeCompare(String(a.year)));

    return NextResponse.json({ years });
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

    // Find the academic_years document for this year
    const snap = await adminDb
      .collection("academic_years")
      .where("Academic_Year", "==", year)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ error: "Year not found" }, { status: 404 });
    }

    const docRef = snap.docs[0].ref;
    await docRef.update({ term_count: tc });

    return NextResponse.json({ success: true, year, term_count: tc });
  } catch (err) {
    console.error("POST /api/academic-year error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
