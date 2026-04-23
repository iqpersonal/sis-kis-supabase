import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_SHORT } from "@/lib/cache-headers";

/* ── Server-side search index cache (avoids re-reading 5000 docs) ── */
let indexCache: {
  entries: { student_number: string; name: string; family: string; class?: string; section?: string }[];
  ts: number;
} | null = null;
const INDEX_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function getStudentProgressByNumber(studentNumber: string) {
  const trimmed = studentNumber.trim();

  const directSnap = await adminDb
    .collection("student_progress")
    .doc(trimmed)
    .get();

  if (directSnap.exists) {
    return directSnap.data() ?? null;
  }

  const byFieldSnap = await adminDb
    .collection("student_progress")
    .where("student_number", "==", trimmed)
    .limit(1)
    .get();

  if (!byFieldSnap.empty) {
    return byFieldSnap.docs[0].data() ?? null;
  }

  return null;
}

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
    const data = await getStudentProgressByNumber(studentNumber);

    if (!data) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data }, { headers: CACHE_SHORT });
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

    // ── Browse options mode: return available classes and sections for a year ──
    if (body.mode === "browse_options" && body.year) {
      const indexDoc = await adminDb
        .collection("parent_config")
        .doc(`browse_${body.year}`)
        .get();

      if (!indexDoc.exists) {
        return NextResponse.json({ classes: [] });
      }

      const buckets = (indexDoc.data()?.buckets ?? {}) as Record<string, unknown[]>;
      const schoolFilter = body.school && body.school !== "all" ? body.school : null;
      const classMap: Record<string, Set<string>> = {};
      for (const key of Object.keys(buckets)) {
        const [cls, section, bSchool] = key.split("__");
        if (!cls) continue;
        if (schoolFilter && bSchool !== schoolFilter) continue;
        if (!classMap[cls]) classMap[cls] = new Set();
        if (section) classMap[cls].add(section);
      }
      const classes = Object.entries(classMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cls, sections]) => ({ cls, sections: Array.from(sections).sort() }));
      return NextResponse.json({ classes });
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

    // If it looks like a student number, try direct doc lookup first.
    if (/^\d+$/.test(q) || /^\d{4}-\d+$/.test(q) || /^0021-/.test(q)) {
      const d = await getStudentProgressByNumber(q);
      if (d) {
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
      let entries: { student_number: string; name: string; family: string; class?: string; section?: string }[];

      if (indexCache && Date.now() - indexCache.ts < INDEX_CACHE_TTL) {
        entries = indexCache.entries;
      } else {
        const snapshot = await adminDb
          .collection("student_progress")
          .limit(5000)
          .get();
        entries = snapshot.docs.map((doc) => {
          const d = doc.data();
          const sortedYrs = Object.keys(d.years || {}).sort();
          const latestYr = sortedYrs[sortedYrs.length - 1] ?? "";
          return {
            student_number: d.student_number || "",
            name: d.student_name || "",
            family: d.family_number || "",
            class: d.years?.[latestYr]?.class_name || "",
            section: d.years?.[latestYr]?.section || "",
          };
        });
        indexCache = { entries, ts: Date.now() };
      }

      const lowerQ = q.toLowerCase();
      const matched: { student_number: string; name: string; family: string; class?: string; section?: string }[] = [];

      for (const e of entries) {
        if (matched.length >= maxResults) break;
        if (
          e.name.toLowerCase().includes(lowerQ) ||
          e.family.toLowerCase().includes(lowerQ) ||
          e.student_number.toLowerCase().includes(lowerQ)
        ) {
          matched.push(e);
        }
      }

      // Return directly from cache — no extra Firestore reads needed
      const results = matched.map((e) => ({
        student_number: e.student_number,
        student_name: e.name,
        family_number: e.family,
        grade: e.class || "",
        section: e.section || "",
      }));

      return NextResponse.json({ results });
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

    // Return directly from index — no extra Firestore reads needed
    const results = matches.map((m) => ({
      student_number: m.student_number,
      student_name: m.name,
      family_number: m.family,
    }));

    return NextResponse.json({ results }); // pre-built index has no class/section data
  } catch (err) {
    console.error("Student search error:", err);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
