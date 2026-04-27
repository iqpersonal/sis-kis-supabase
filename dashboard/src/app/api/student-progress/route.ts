import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT } from "@/lib/cache-headers";

/* server-side in-memory index cache */
let indexCache: {
  entries: { student_number: string; name: string; family: string; class?: string; section?: string }[];
  ts: number;
} | null = null;
const INDEX_CACHE_TTL = 30 * 60 * 1000;

async function getStudentProgressByNumber(supabase: ReturnType<typeof createServiceClient>, sn: string) {
  const { data } = await supabase
    .from("student_progress")
    .select("*")
    .eq("student_number", sn.trim())
    .maybeSingle();
  return data ?? null;
}

export async function GET(req: NextRequest) {
  const studentNumber = req.nextUrl.searchParams.get("studentNumber");
  if (!studentNumber) {
    return NextResponse.json({ error: "studentNumber query parameter is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  try {
    const data = await getStudentProgressByNumber(supabase, studentNumber);
    if (!data) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    return NextResponse.json({ data }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Failed to fetch student progress:", err);
    return NextResponse.json({ error: "Failed to fetch student progress" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

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

    // Browse mode
    if (body.mode === "browse" && body.classCode) {
      const { classCode, sectionCode, year, school, limit: browseLimit = 200 } = body;
      const targetYear = year || "";
      if (!targetYear) return NextResponse.json({ results: [] });

      const { data: configRow } = await supabase
        .from("parent_config")
        .select("buckets")
        .eq("id", `browse_${targetYear}`)
        .maybeSingle();

      if (!configRow) return NextResponse.json({ results: [] });

      const buckets = (configRow.buckets ?? {}) as Record<
        string,
        { sn: string; name: string; gender: string; fam: string; avg: number; class: string; section: string }[]
      >;

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

      (results as { student_name: string }[]).sort((a, b) =>
        (a.student_name || "").localeCompare(b.student_name || "")
      );

      return NextResponse.json({ results });
    }

    // Browse options mode
    if (body.mode === "browse_options" && body.year) {
      const { data: configRow } = await supabase
        .from("parent_config")
        .select("buckets")
        .eq("id", `browse_${body.year}`)
        .maybeSingle();

      if (!configRow) return NextResponse.json({ classes: [] });

      const buckets = (configRow.buckets ?? {}) as Record<string, unknown[]>;
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

    // Search mode
    const { query: searchQuery = "", limit: maxResults = 20 } = body;
    if (!searchQuery || searchQuery.trim().length < 2) {
      return NextResponse.json({ error: "Search query must be at least 2 characters" }, { status: 400 });
    }

    const q = searchQuery.trim();

    if (/^\d+$/.test(q) || /^\d{4}-\d+$/.test(q) || /^0021-/.test(q)) {
      const d = await getStudentProgressByNumber(supabase, q);
      if (d) {
        const sortedYrs = Object.keys(d.years || {}).sort();
        const latestYr = sortedYrs[sortedYrs.length - 1] ?? "";
        return NextResponse.json({
          results: [{
            student_number: d.student_number,
            student_name: d.student_name,
            gender: d.gender,
            family_number: d.family_number,
            years: sortedYrs,
            latest_class: d.years?.[latestYr]?.class_name ?? "",
            latest_avg: d.years?.[latestYr]?.overall_avg ?? 0,
          }],
        });
      }
      return NextResponse.json({ results: [] });
    }

    // Try student_index from parent_config
    const { data: indexConfig } = await supabase
      .from("parent_config")
      .select("buckets")
      .eq("id", "student_index")
      .maybeSingle();

    if (indexConfig?.buckets) {
      const index = indexConfig.buckets as Record<
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

      return NextResponse.json({
        results: matches.map((m) => ({
          student_number: m.student_number,
          student_name: m.name,
          family_number: m.family,
        })),
      });
    }

    // Fallback: in-memory cache scan
    let entries: { student_number: string; name: string; family: string; class?: string; section?: string }[];

    if (indexCache && Date.now() - indexCache.ts < INDEX_CACHE_TTL) {
      entries = indexCache.entries;
    } else {
      const { data: rows } = await supabase
        .from("student_progress")
        .select("student_number, student_name, family_number, years")
        .limit(5000);
      entries = (rows ?? []).map((d) => {
        const r = d as Record<string, unknown>;
        const years = (r.years as Record<string, { class_name?: string; section?: string }>) || {};
        const sortedYrs = Object.keys(years).sort();
        const latestYr = sortedYrs[sortedYrs.length - 1] ?? "";
        return {
          student_number: String(r.student_number || ""),
          name: String(r.student_name || ""),
          family: String(r.family_number || ""),
          class: years[latestYr]?.class_name || "",
          section: years[latestYr]?.section || "",
        };
      });
      indexCache = { entries, ts: Date.now() };
    }

    const lowerQ = q.toLowerCase();
    const matched = entries.filter(
      (e) =>
        e.name.toLowerCase().includes(lowerQ) ||
        e.family.toLowerCase().includes(lowerQ) ||
        e.student_number.toLowerCase().includes(lowerQ)
    ).slice(0, maxResults);

    return NextResponse.json({
      results: matched.map((e) => ({
        student_number: e.student_number,
        student_name: e.name,
        family_number: e.family,
        grade: e.class || "",
        section: e.section || "",
      })),
    });
  } catch (err) {
    console.error("Student search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
