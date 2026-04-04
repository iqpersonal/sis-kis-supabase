import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_SHORT } from "@/lib/cache-headers";

/* ── Server-side search index cache (avoids re-reading 5000 docs) ── */
let indexCache: {
  entries: { student_number: string; name: string; family: string }[];
  ts: number;
} | null = null;
const INDEX_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * GET /api/student-progress?studentNumber=xxx
 * Fetch student progress data using firebase-admin (bypasses security rules).
 * Used by the parent dashboard (no Firebase Auth) and admin dashboard.
 */
export async function GET(req: NextRequest) {
  const studentNumber = req.nextUrl.searchParams.get("studentNumber");

  if (!studentNumber) {
    return NextResponse.json(
      { error: "studentNumber query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const docRef = adminDb
      .collection("student_progress")
      .doc(studentNumber.trim());
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: snap.data() }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Failed to fetch student progress:", err);
    return NextResponse.json(
      { error: "Failed to fetch student progress" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/student-progress
 * Search students by name or family number, or browse by class/section.
 * Body: { query: string, limit?: number }
 *   OR  { mode: "browse", classCode: string, sectionCode?: string, year?: string, school?: string, limit?: number }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      query?: string;
      mode?: string;
      classCode?: string;
      sectionCode?: string;
      year?: string;
      school?: string;
      limit?: number;
    };

    // ── Browse mode: list students by class/section ──
    if (body.mode === "browse" && body.classCode) {
      const { classCode, sectionCode, year, school, limit: browseLimit = 200 } = body;

      // Use pre-built browse index (one small doc per year)
      const targetYear = year || "";
      if (!targetYear) {
        return NextResponse.json({ results: [] });
      }

      const indexDoc = await adminDb
        .collection("parent_config")
        .doc(`browse_${targetYear}`)
        .get();

      if (!indexDoc.exists) {
        // Fallback: no index for this year
        return NextResponse.json({ results: [] });
      }

      const buckets = (indexDoc.data()?.buckets ?? {}) as Record<
        string,
        { sn: string; name: string; gender: string; fam: string; avg: number; class: string; section: string }[]
      >;

      // Collect matching students from relevant buckets
      // Bucket key format: classCode__sectionCode__school
      const results: unknown[] = [];
      for (const [bucketKey, students] of Object.entries(buckets)) {
        const [bClass, bSection, bSchool] = bucketKey.split("__");
        if (bClass !== classCode) continue;
        if (sectionCode && sectionCode !== "all" && bSection !== sectionCode) continue;
        if (school && school !== "all" && bSchool !== school) continue;

        for (const s of students) {
          if (results.length >= browseLimit) break;
          results.push({
            student_number: s.sn,
            student_name: s.name,
            gender: s.gender,
            family_number: s.fam,
            years: [targetYear],
            latest_class: s.class ?? "",
            latest_section: s.section ?? "",
            latest_avg: s.avg ?? 0,
            year_used: targetYear,
          });
        }
      }

      // Sort by name
      (results as { student_name: string }[]).sort((a, b) =>
        (a.student_name || "").localeCompare(b.student_name || "")
      );

      return NextResponse.json({ results });
    }

    // ── Search mode ──
    const { query: searchQuery = "", limit: maxResults = 20 } = body;

    if (!searchQuery || searchQuery.trim().length < 2) {
      return NextResponse.json(
        { error: "Search query must be at least 2 characters" },
        { status: 400 }
      );
    }

    const q = searchQuery.trim();

    // If it looks like a student number (contains digits and dashes)
    if (/^\d{4}-\d+$/.test(q) || /^0021-/.test(q)) {
      const snap = await adminDb
        .collection("student_progress")
        .doc(q)
        .get();
      if (snap.exists) {
        const d = snap.data()!;
        return NextResponse.json({
          results: [
            {
              student_number: d.student_number,
              student_name: d.student_name,
              gender: d.gender,
              family_number: d.family_number,
              years: Object.keys(d.years || {}).sort(),
              latest_class:
                d.years?.[
                  Object.keys(d.years || {})
                    .sort()
                    .pop() ?? ""
                ]?.class_name ?? "",
              latest_avg:
                d.years?.[
                  Object.keys(d.years || {})
                    .sort()
                    .pop() ?? ""
                ]?.overall_avg ?? 0,
            },
          ],
        });
      }
      return NextResponse.json({ results: [] });
    }

    // Search by name or family number — use the student index
    const indexDoc = await adminDb
      .collection("parent_config")
      .doc("student_index")
      .get();

    if (!indexDoc.exists) {
      // Fallback: use cached scan or read student_progress collection
      let entries: { student_number: string; name: string; family: string }[];

      if (indexCache && Date.now() - indexCache.ts < INDEX_CACHE_TTL) {
        entries = indexCache.entries;
      } else {
        const snapshot = await adminDb
          .collection("student_progress")
          .limit(5000)
          .get();
        entries = snapshot.docs.map((doc) => {
          const d = doc.data();
          return {
            student_number: d.student_number || "",
            name: d.student_name || "",
            family: d.family_number || "",
          };
        });
        indexCache = { entries, ts: Date.now() };
      }

      const lowerQ = q.toLowerCase();
      const matchedNumbers: string[] = [];

      for (const e of entries) {
        if (matchedNumbers.length >= maxResults) break;
        if (
          e.name.toLowerCase().includes(lowerQ) ||
          e.family.toLowerCase().includes(lowerQ) ||
          e.student_number.toLowerCase().includes(lowerQ)
        ) {
          matchedNumbers.push(e.student_number);
        }
      }

      // Fetch full docs only for matches
      const results = await Promise.all(
        matchedNumbers.map(async (sn) => {
          const snap = await adminDb
            .collection("student_progress")
            .doc(sn)
            .get();
          if (!snap.exists) return null;
          const d = snap.data()!;
          const sortedYears = Object.keys(d.years || {}).sort();
          const latestYr = sortedYears[sortedYears.length - 1] ?? "";
          return {
            student_number: d.student_number,
            student_name: d.student_name,
            gender: d.gender,
            family_number: d.family_number,
            years: sortedYears,
            latest_class: d.years?.[latestYr]?.class_name ?? "",
            latest_avg: d.years?.[latestYr]?.overall_avg ?? 0,
          };
        })
      );

      return NextResponse.json({ results: results.filter(Boolean) });
    }

    // Use pre-built index
    const index = indexDoc.data()?.entries as Record<
      string,
      { student_number: string; name: string; family: string }
    >;
    const lowerQ = q.toLowerCase();
    const matches = Object.values(index)
      .filter(
        (e) =>
          e.name.toLowerCase().includes(lowerQ) ||
          e.family.includes(lowerQ) ||
          e.student_number.includes(lowerQ)
      )
      .slice(0, maxResults);

    // Fetch full docs for matches
    const results = await Promise.all(
      matches.map(async (m) => {
        const snap = await adminDb
          .collection("student_progress")
          .doc(m.student_number)
          .get();
        if (!snap.exists) return null;
        const d = snap.data()!;
        const sortedYears = Object.keys(d.years || {}).sort();
        const latestYr = sortedYears[sortedYears.length - 1] ?? "";
        return {
          student_number: d.student_number,
          student_name: d.student_name,
          gender: d.gender,
          family_number: d.family_number,
          years: sortedYears,
          latest_class: d.years?.[latestYr]?.class_name ?? "",
          latest_avg: d.years?.[latestYr]?.overall_avg ?? 0,
        };
      })
    );

    return NextResponse.json({
      results: results.filter(Boolean),
    });
  } catch (err) {
    console.error("Student search error:", err);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
