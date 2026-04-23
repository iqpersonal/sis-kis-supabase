import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getCached, setCache, invalidateCache } from "@/lib/cache";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { compareAlphabeticalNames } from "@/lib/name-sort";

/**
 * Book Sales — Student Search API (uses pre-built Firestore indexes for speed)
 *
 * GET /api/book-sales/search
 *   ?q=ahmed          → search by name (min 2 chars)
 *   ?family=1234      → search by family number (returns all siblings)
 *   ?student=0021-00123 → search by student number
 *   ?major=Boys       → filter by major (Boys/Girls)
 *   ?class=Grade 10   → filter by class
 *   ?section=02       → filter by section code
 *   ?browse=1         → browse mode (no text query needed, uses major/class/section)
 *   ?year=25-26       → academic year (required)
 *   ?meta=1           → return cascading filter tree: major → class → section
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

// ── Fast: single-doc browse index (parent_config/browse_{year}) ──
async function getBrowseIndex(year: string): Promise<Record<string, BrowseEntry[]> | null> {
  if (!year) return null;
  const cacheKey = `book_browse_idx_${year}`;
  let buckets = getCached<Record<string, BrowseEntry[]>>(cacheKey);
  if (buckets) return buckets;

  const doc = await adminDb.collection("parent_config").doc(`browse_${year}`).get();
  if (!doc.exists) return null;

  buckets = (doc.data()?.buckets ?? {}) as Record<string, BrowseEntry[]>;
  setCache(cacheKey, buckets, 30 * 60 * 1000);
  return buckets;
}

// ── Fast: single-doc student index (parent_config/student_index) ──
async function getStudentIndex(): Promise<Record<string, { student_number: string; name: string; family: string }>> {
  const cacheKey = "book_student_idx";
  let index = getCached<Record<string, { student_number: string; name: string; family: string }>>(cacheKey);
  if (index) return index;

  const doc = await adminDb.collection("parent_config").doc("student_index").get();
  if (doc.exists) {
    index = (doc.data()?.entries ?? {}) as Record<string, { student_number: string; name: string; family: string }>;
    setCache(cacheKey, index, 30 * 60 * 1000);
    return index;
  }

  // Fallback: lightweight scan (only names + numbers)
  const snap = await adminDb.collection("student_progress")
    .select("student_number", "student_name", "family_number")
    .limit(5000).get();
  index = {};
  for (const d of snap.docs) {
    const dt = d.data();
    const sn = dt.student_number || d.id;
    index[sn] = { student_number: sn, name: dt.student_name || "", family: dt.family_number || "" };
  }
  setCache(cacheKey, index, 30 * 60 * 1000);
  return index;
}

// ── Build lookup: student_number → { grade, section, school } from browse buckets ──
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

// ── Extract grade/section/school from a full student_progress doc ──
function extractFromDoc(
  data: FirebaseFirestore.DocumentData,
  year: string
): { grade: string; section: string; school: string } {
  let grade = "", section = "", school = "";
  if (data?.years) {
    let targetYear = year;
    if (!targetYear || !data.years[targetYear]) {
      const sorted = Object.keys(data.years).sort().reverse();
      targetYear = sorted[0] || "";
    }
    if (targetYear && data.years[targetYear]) {
      const yr = data.years[targetYear];
      grade = yr.class_name || yr.class_code || "";
      section = yr.section_name || yr.section_code || "";
      school = yr.school || "";
    }
  }
  if (!grade) { grade = data?.latest_class || data?.class_name || ""; section = data?.latest_section || ""; }
  school = SCHOOL_MAP[school] || school;
  return { grade, section, school };
}

// ── Cached class-code → class-name map from Firestore "classes" collection ──
async function getClassNameMap(): Promise<Record<string, string>> {
  const cacheKey = "book_class_names";
  let map = getCached<Record<string, string>>(cacheKey);
  if (map) return map;
  map = {};
  const snap = await adminDb.collection("classes").select("Class_Code", "E_Class_Desc").limit(200).get();
  for (const d of snap.docs) {
    const dt = d.data();
    const code = String(dt.Class_Code || "");
    if (code) map[code] = dt.E_Class_Desc || code;
  }
  setCache(cacheKey, map, 60 * 60 * 1000);
  return map;
}

// ── Cached section lookup: (year, classCode, sectionCode, majorCode) → section name ──
async function getSectionNameMap(): Promise<Record<string, string>> {
  const cacheKey = "book_section_names";
  let map = getCached<Record<string, string>>(cacheKey);
  if (map) return map;
  map = {};
  const snap = await adminDb.collection("sections").limit(5000).get();
  for (const d of snap.docs) {
    const dt = d.data();
    const key = `${dt.Academic_Year}__${dt.Class_Code}__${dt.Section_Code}__${dt.Major_Code}`;
    map[key] = dt.E_Section_Name || dt.Section_Code || d.id;
  }
  setCache(cacheKey, map, 60 * 60 * 1000);
  return map;
}

/**
 * Fetch family members from the raw students + registrations collections.
 * Catches new admissions that don't yet have grades (no student_progress doc).
 */
async function getFamilyFromRawCollections(
  familyNum: string,
  year: string,
  existingSNs: Set<string>,
): Promise<StudentEntry[]> {
  // Find all students in this family from the 'students' collection
  const studentsSnap = await adminDb.collection("students")
    .where("Family_Number", "==", familyNum)
    .select("Student_Number", "E_Full_Name", "Family_Number", "Gender")
    .get();

  // Only process students NOT already found in student_progress
  const newStudents = studentsSnap.docs.filter(
    (d) => !existingSNs.has(d.data().Student_Number || d.id)
  );
  if (newStudents.length === 0) return [];

  // Fetch class name map + section name map for display
  const [classNames, sectionNames] = await Promise.all([getClassNameMap(), getSectionNameMap()]);

  const results: StudentEntry[] = [];
  for (const sd of newStudents) {
    const sData = sd.data();
    const sn = sData.Student_Number || sd.id;

    // Find registration for the target year
    const regSnap = await adminDb.collection("registrations")
      .where("Student_Number", "==", sn)
      .where("Academic_Year", "==", year)
      .limit(1)
      .get();

    let grade = "", section = "", school = "";
    if (!regSnap.empty) {
      const reg = regSnap.docs[0].data();
      const classCode = String(reg.Class_Code || "");
      grade = classNames[classCode] || classCode;
      const majorCode = String(reg.Major_Code || "");
      school = SCHOOL_MAP[majorCode] || majorCode;
      const secCode = String(reg.Section_Code || "");
      // Try specific section name lookup
      const secKey = `${year}__${classCode}__${secCode}__${majorCode}`;
      section = sectionNames[secKey] || secCode;
    }

    results.push({
      student_number: sn,
      student_name: sData.E_Full_Name || "",
      family_number: familyNum,
      gender: sData.Gender === true || sData.Gender === "M" ? "M" : "F",
      grade,
      section,
      school,
    });
  }
  return results;
}

// ── GET ────────────────────────────────────────────────────────
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

    // ── Meta mode: return cascading filter tree (major → class → section) ──
    if (meta) {
      const buckets = await getBrowseIndex(year);
      if (!buckets) return NextResponse.json({ majors: [], tree: {} });

      // tree: { "Boys": { "Grade 1": ["Roses", "Tulips"], "Grade 2": ["Daisies"] }, "Girls": { ... } }
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

      // Convert sets to sorted arrays
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

      return NextResponse.json({
        majors: Object.keys(serialized).sort(),
        tree: serialized,
      }, { headers: CACHE_SHORT });
    }

    // ── Validation ──
    if (!q && !family && !student && !browse) {
      return NextResponse.json({ error: "Provide q, family, student, or browse=1" }, { status: 400 });
    }
    if (q && q.length < 2) {
      return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 });
    }

    // ── Direct student lookup → auto-expand to full family ──
    if (student) {
      const snap = await adminDb.collection("student_progress").doc(student).get();

      // If student not in student_progress, try raw 'students' collection
      if (!snap.exists) {
        const rawSnap = await adminDb.collection("students").doc(student).get();
        if (!rawSnap.exists) return NextResponse.json({ results: [], total: 0 });
        const rawData = rawSnap.data()!;
        const familyNum = rawData.Family_Number || "";
        if (familyNum && year) {
          // Fetch all family members from raw collections
          const results = await getFamilyFromRawCollections(familyNum, year, new Set());
          if (results.length > 0) return NextResponse.json({ results, total: results.length }, { headers: CACHE_SHORT });
        }
        return NextResponse.json({ results: [], total: 0 });
      }

      const d = snap.data()!;
      const familyNum = d.family_number || "";

      // If the student has a family number, fetch ALL siblings
      if (familyNum) {
        const famSnap = await adminDb.collection("student_progress")
          .where("family_number", "==", familyNum)
          .select("student_number", "student_name", "family_number", "gender", "years", "latest_class", "latest_section")
          .get();
        const results: StudentEntry[] = famSnap.docs.map((fd) => {
          const dt = fd.data();
          const info = extractFromDoc(dt, year);
          return {
            student_number: dt.student_number || fd.id,
            student_name: dt.student_name || "",
            family_number: dt.family_number || "",
            gender: dt.gender || "",
            ...info,
          };
        });

        // Also check raw collections for siblings without grades (new admissions)
        const existingSNs = new Set(results.map((r) => r.student_number));
        const extraResults = await getFamilyFromRawCollections(familyNum, year, existingSNs);
        results.push(...extraResults);

        return NextResponse.json({ results, total: results.length }, { headers: CACHE_SHORT });
      }

      // No family number — return just this student
      const info = extractFromDoc(d, year);
      return NextResponse.json({
        results: [{
          student_number: d.student_number || student,
          student_name: d.student_name || "",
          family_number: "",
          gender: d.gender || "",
          ...info,
        }],
        total: 1,
      }, { headers: CACHE_SHORT });
    }

    // ── Family lookup (direct Firestore query) ──
    if (family) {
      const snap = await adminDb.collection("student_progress")
        .where("family_number", "==", family)
        .select("student_number", "student_name", "family_number", "gender", "years", "latest_class", "latest_section")
        .get();
      const results: StudentEntry[] = snap.docs.map((d) => {
        const dt = d.data();
        const info = extractFromDoc(dt, year);
        return {
          student_number: dt.student_number || d.id,
          student_name: dt.student_name || "",
          family_number: dt.family_number || "",
          gender: dt.gender || "",
          ...info,
        };
      });

      // Also check raw collections for siblings without grades (new admissions)
      const existingSNs = new Set(results.map((r) => r.student_number));
      const extraResults = await getFamilyFromRawCollections(family, year, existingSNs);
      results.push(...extraResults);

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

        // Filter at bucket level first for efficiency
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
            grade: className, section: sectionName, school: majorLabel,
          });
        }
      }
      const total = results.length;
      results.sort((a, b) => compareAlphabeticalNames(a.student_name, b.student_name));
      return NextResponse.json({ results: results.slice(0, 50), total }, { headers: CACHE_SHORT });
    }

    // ── Text search (uses lightweight student_index — single doc read) ──
    const studentIndex = await getStudentIndex();
    const lowerQ = q.toLowerCase();
    const matches = Object.values(studentIndex)
      .filter((e) =>
        e.name.toLowerCase().includes(lowerQ) ||
        e.student_number.includes(q) ||
        e.family.includes(q)
      )
      .slice(0, 30);

    if (matches.length === 0) return NextResponse.json({ results: [], total: 0 });

    // Enrich with grade/section/school from browse index
    const buckets = await getBrowseIndex(year);
    const lookup = buckets ? buildStudentLookup(buckets) : new Map<string, { grade: string; section: string; school: string }>();

    let results: StudentEntry[] = matches.map((m) => {
      const info = lookup.get(m.student_number) || { grade: "", section: "", school: "" };
      return {
        student_number: m.student_number,
        student_name: m.name,
        family_number: m.family,
        gender: "",
        grade: info.grade, section: info.section, school: info.school,
      };
    });

    // Apply filters on text search results
    if (majorFilter) results = results.filter((s) => s.school === majorFilter);
    if (classFilter) results = results.filter((s) => s.grade === classFilter);
    if (sectionFilter) results = results.filter((s) => s.section === sectionFilter);

    return NextResponse.json({ results, total: results.length }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Book Sales Search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/book-sales/search
 * Invalidate the in-memory search caches so the next request fetches fresh data.
 * Called after a database sync completes.
 */
export async function POST() {
  invalidateCache("book_browse_idx");
  invalidateCache("book_student_idx");
  return NextResponse.json({ ok: true });
}
