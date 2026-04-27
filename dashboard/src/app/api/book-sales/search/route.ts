import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { getCached, setCache, invalidateCache } from "@/lib/cache";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { compareAlphabeticalNames } from "@/lib/name-sort";

/**
 * Book Sales - Student Search API
 *
 * GET /api/book-sales/search
 *   ?q=ahmed          - search by name (min 2 chars)
 *   ?family=1234      - search by family number
 *   ?student=0021-00123 - search by student number
 *   ?major=Boys       - filter by major
 *   ?class=Grade 10   - filter by class
 *   ?section=02       - filter by section code
 *   ?browse=1         - browse mode
 *   ?year=25-26       - academic year (required)
 *   ?meta=1           - return cascading filter tree
 */

interface BrowseEntry {
  sn: string;
  name: string;
  gender: string;
  fam: string;
  avg: number;
  class: string;
  section: string;
}

interface StudentEntry {
  student_number: string;
  student_name: string;
  family_number: string;
  gender: string;
  grade: string;
  section: string;
  school: string;
}

const SCHOOL_MAP: Record<string, string> = { "0021-01": "Boys", "0021-02": "Girls" };

// ── Browse index from parent_config table (id = browse_{year}) ──
async function getBrowseIndex(year: string): Promise<Record<string, BrowseEntry[]> | null> {
  if (!year) return null;
  const cacheKey = `book_browse_idx_${year}`;
  let buckets = getCached<Record<string, BrowseEntry[]>>(cacheKey);
  if (buckets) return buckets;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("parent_config")
    .select("buckets")
    .eq("id", `browse_${year}`)
    .maybeSingle();
  if (!data?.buckets) return null;

  buckets = data.buckets as Record<string, BrowseEntry[]>;
  setCache(cacheKey, buckets, 30 * 60 * 1000);
  return buckets;
}

// ── Build lookup: student_number -> { grade, section, school } ──
function buildStudentLookup(buckets: Record<string, BrowseEntry[]>): Map<string, { grade: string; section: string; school: string }> {
  const lookup = new Map<string, { grade: string; section: string; school: string }>();
  for (const [key, entries] of Object.entries(buckets)) {
    const parts = key.split("__");
    const schoolCode = parts[2] || "";
    const school = SCHOOL_MAP[schoolCode] || schoolCode || "";
    for (const e of entries) {
      lookup.set(e.sn, { grade: e.class || "", section: e.section || parts[1] || "", school });
    }
  }
  return lookup;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim() || "";
    const family = sp.get("family")?.trim() || "";
    const student = sp.get("student")?.trim() || "";
    const classFilter = sp.get("class")?.trim() || "";
    const sectionFilter = sp.get("section")?.trim() || "";
    const majorFilter = sp.get("major")?.trim() || "";
    const browse = sp.get("browse") === "1";
    const meta = sp.get("meta") === "1";
    const year = sp.get("year") || "";

    const supabase = createServiceClient();

    // ── Class name map (cached) ──
    async function getClassNameMap(): Promise<Record<string, string>> {
      const ck = "book_class_names";
      let map = getCached<Record<string, string>>(ck);
      if (map) return map;
      map = {};
      const { data } = await supabase.from("classes").select("class_code, e_class_desc").limit(200);
      for (const row of data || []) {
        if (row.class_code) map[String(row.class_code)] = (row.e_class_desc as string) || row.class_code;
      }
      setCache(ck, map, 60 * 60 * 1000);
      return map;
    }

    // ── Meta mode: cascading filter tree ──
    if (meta) {
      const buckets = await getBrowseIndex(year);
      if (!buckets) return NextResponse.json({ majors: [], tree: {} });

      const tree: Record<string, Record<string, Set<string>>> = {};
      for (const [key, entries] of Object.entries(buckets)) {
        if (entries.length === 0) continue;
        const parts = key.split("__");
        const className = entries[0]?.class || parts[0] || "";
        const sectionName = entries[0]?.section || parts[1] || "";
        const schoolCode = parts[2] || "";
        const majorLabel = SCHOOL_MAP[schoolCode] || schoolCode;
        if (!majorLabel || !className) continue;
        if (!tree[majorLabel]) tree[majorLabel] = {};
        if (!tree[majorLabel][className]) tree[majorLabel][className] = new Set();
        if (sectionName) tree[majorLabel][className].add(sectionName);
      }

      const gradeOrder = (g: string) => {
        if (g.startsWith("KG")) return parseInt(g.replace(/\D/g, "")) || 0;
        const m = g.match(/\d+/);
        return m ? 100 + parseInt(m[0]) : 999;
      };

      const serialized: Record<string, Record<string, string[]>> = {};
      for (const [major, classes] of Object.entries(tree)) {
        serialized[major] = {};
        const sortedClasses = Object.keys(classes).sort((a, b) => gradeOrder(a) - gradeOrder(b));
        for (const cls of sortedClasses) {
          serialized[major][cls] = Array.from(classes[cls]).sort();
        }
      }

      return NextResponse.json({ majors: Object.keys(serialized).sort(), tree: serialized }, { headers: CACHE_SHORT });
    }

    // ── Validation ──
    if (!q && !family && !student && !browse) {
      return NextResponse.json({ error: "Provide q, family, student, or browse=1" }, { status: 400 });
    }
    if (q && q.length < 2) {
      return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 });
    }

    // ── Helper: map a registration row + student row to StudentEntry ──
    function toEntry(
      reg: Record<string, unknown>,
      student: { full_name?: string; gender?: string } | null,
      classNameMap: Record<string, string>
    ): StudentEntry {
      const majorCode = String(reg.major_code || "");
      const classCode = String(reg.class_code || "");
      const sectionCode = String(reg.section_code || "");
      return {
        student_number: String(reg.student_number || ""),
        student_name: student?.full_name || "",
        family_number: String(reg.family_number || ""),
        gender: student?.gender || "",
        grade: classNameMap[classCode] || classCode,
        section: sectionCode,
        school: SCHOOL_MAP[majorCode] || majorCode,
      };
    }

    // ── Direct student lookup ──
    if (student) {
      const [classNameMap, { data: regRows }, { data: studentRow }] = await Promise.all([
        getClassNameMap(),
        supabase
          .from("registrations")
          .select("student_number, family_number, major_code, class_code, section_code")
          .eq("student_number", student)
          .eq("academic_year", year)
          .limit(1),
        supabase.from("students").select("full_name, gender").eq("student_number", student).maybeSingle(),
      ]);

      const reg = regRows?.[0] as Record<string, unknown> | undefined;
      const familyNum = String(reg?.family_number || "");

      if (familyNum) {
        const { data: famRegs } = await supabase
          .from("registrations")
          .select("student_number, family_number, major_code, class_code, section_code, students(full_name, gender)")
          .eq("family_number", familyNum)
          .eq("academic_year", year)
          .limit(30);

        const results: StudentEntry[] = (famRegs || []).map((r) => {
          const s = (r as Record<string, unknown>).students as { full_name?: string; gender?: string } | null;
          return toEntry(r as Record<string, unknown>, s, classNameMap);
        });
        return NextResponse.json({ results, total: results.length }, { headers: CACHE_SHORT });
      }

      const entry = toEntry(reg || { student_number: student }, studentRow, classNameMap);
      return NextResponse.json({ results: [entry], total: 1 }, { headers: CACHE_SHORT });
    }

    // ── Family lookup ──
    if (family) {
      const [classNameMap, { data: famRegs }] = await Promise.all([
        getClassNameMap(),
        supabase
          .from("registrations")
          .select("student_number, family_number, major_code, class_code, section_code, students(full_name, gender)")
          .eq("family_number", family)
          .eq("academic_year", year)
          .limit(30),
      ]);

      const results: StudentEntry[] = (famRegs || []).map((r) => {
        const s = (r as Record<string, unknown>).students as { full_name?: string; gender?: string } | null;
        return toEntry(r as Record<string, unknown>, s, classNameMap);
      });
      return NextResponse.json({ results, total: results.length }, { headers: CACHE_SHORT });
    }

    // ── Browse mode (filter by major/class/section from browse index) ──
    if (browse) {
      const buckets = await getBrowseIndex(year);
      if (!buckets) return NextResponse.json({ results: [], total: 0 });

      const results: StudentEntry[] = [];
      for (const [key, entries] of Object.entries(buckets)) {
        const parts = key.split("__");
        const schoolCode = parts[2] || "";
        const majorLabel = SCHOOL_MAP[schoolCode] || schoolCode || "";
        if (majorFilter && majorLabel !== majorFilter) continue;

        for (const e of entries) {
          const className = e.class || "";
          const sectionName = e.section || parts[1] || "";
          if (classFilter && className !== classFilter) continue;
          if (sectionFilter && sectionName !== sectionFilter) continue;
          results.push({
            student_number: e.sn,
            student_name: e.name,
            family_number: e.fam,
            gender: e.gender || "",
            grade: className,
            section: sectionName,
            school: majorLabel,
          });
        }
      }

      const total = results.length;
      results.sort((a, b) => compareAlphabeticalNames(a.student_name, b.student_name));
      return NextResponse.json({ results: results.slice(0, 50), total }, { headers: CACHE_SHORT });
    }

    // ── Text search via browse index ──
    const buckets = await getBrowseIndex(year);
    if (!buckets) return NextResponse.json({ results: [], total: 0 });

    const lowerQ = q.toLowerCase();
    let results: StudentEntry[] = [];

    for (const [key, entries] of Object.entries(buckets)) {
      const parts = key.split("__");
      const schoolCode = parts[2] || "";
      const school = SCHOOL_MAP[schoolCode] || schoolCode || "";
      for (const e of entries) {
        if (
          e.name.toLowerCase().includes(lowerQ) ||
          e.sn.includes(q) ||
          e.fam.includes(q)
        ) {
          results.push({
            student_number: e.sn,
            student_name: e.name,
            family_number: e.fam,
            gender: e.gender || "",
            grade: e.class || "",
            section: e.section || parts[1] || "",
            school,
          });
        }
      }
    }

    if (majorFilter) results = results.filter((s) => s.school === majorFilter);
    if (classFilter) results = results.filter((s) => s.grade === classFilter);
    if (sectionFilter) results = results.filter((s) => s.section === sectionFilter);

    results.sort((a, b) => compareAlphabeticalNames(a.student_name, b.student_name));
    return NextResponse.json({ results: results.slice(0, 30), total: results.length }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Book Sales Search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST() {
  invalidateCache("book_browse_idx");
  return NextResponse.json({ ok: true });
}
