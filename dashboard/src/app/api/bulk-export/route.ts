import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_SHORT } from "@/lib/cache-headers";

/**
 * GET /api/bulk-export
 * Returns list of students for a given year using the pre-built browse index
 * (1 Firestore read instead of 5000).
 *
 * Query params:
 *  - year: academic year key (e.g. "24-25")
 *  - school: school filter (optional, "all" or specific like "0021-01")
 *  - class: class code filter (optional)
 *  - section: section code filter (optional)
 *
 * Returns: { students: [...], classes: [...], sections: [...], schools: [...] }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = searchParams.get("year");
    const school = searchParams.get("school");
    const classFilter = searchParams.get("class");
    const sectionFilter = searchParams.get("section");

    if (!year) {
      return NextResponse.json(
        { students: [], classes: [], sections: [], schools: [], total: 0 },
        { status: 400 },
      );
    }

    // Read pre-built browse index (1 Firestore read)
    const browseDoc = await adminDb
      .collection("parent_config")
      .doc(`browse_${year}`)
      .get();

    if (!browseDoc.exists) {
      return NextResponse.json({
        students: [],
        classes: [],
        sections: [],
        schools: [],
        total: 0,
      });
    }

    const buckets = (browseDoc.data()?.buckets || {}) as Record<
      string,
      {
        sn: string;
        name: string;
        gender: string;
        fam: string;
        avg: number;
        class: string;
        section: string;
      }[]
    >;

    interface StudentEntry {
      student_number: string;
      student_name: string;
      student_name_ar: string;
      class_code: string;
      class_name: string;
      section_code: string;
      section_name: string;
      school: string;
      overall_avg: number;
      has_transcript: boolean;
    }

    const students: StudentEntry[] = [];
    const classesMap = new Map<string, { code: string; name: string; count: number }>();
    const sectionsMap = new Map<string, { code: string; name: string; classCode: string; count: number }>();
    const schoolsSet = new Set<string>();

    for (const [bucketKey, entries] of Object.entries(buckets)) {
      // bucketKey = "classCode__sectionCode__school"
      const parts = bucketKey.split("__");
      const classCode = parts[0] || "";
      const sectionCode = parts[1] || "";
      const bucketSchool = parts[2] || "";

      // School filter
      if (school && school !== "all" && bucketSchool !== school) continue;
      // Class filter
      if (classFilter && classCode !== classFilter) continue;
      // Section filter
      if (sectionFilter && sectionCode !== sectionFilter) continue;

      schoolsSet.add(bucketSchool);

      const className = entries[0]?.class || classCode;
      const sectionName = entries[0]?.section || sectionCode;

      // Track unique classes
      if (!classesMap.has(classCode)) {
        classesMap.set(classCode, { code: classCode, name: className, count: 0 });
      }

      // Track unique sections
      const secKey = `${classCode}__${sectionCode}`;
      if (!sectionsMap.has(secKey)) {
        sectionsMap.set(secKey, {
          code: sectionCode,
          name: sectionName,
          classCode,
          count: 0,
        });
      }

      for (const entry of entries) {
        classesMap.get(classCode)!.count++;
        sectionsMap.get(secKey)!.count++;

        students.push({
          student_number: entry.sn,
          student_name: entry.name,
          student_name_ar: "",
          class_code: classCode,
          class_name: entry.class || className,
          section_code: sectionCode,
          section_name: entry.section || sectionName,
          school: bucketSchool,
          overall_avg: entry.avg || 0,
          has_transcript: true,
        });
      }
    }

    // Sort students by class then name
    students.sort((a, b) => {
      const cc = a.class_code.localeCompare(b.class_code);
      if (cc !== 0) return cc;
      return a.student_name.localeCompare(b.student_name);
    });

    const classes = Array.from(classesMap.values()).sort((a, b) =>
      a.code.localeCompare(b.code),
    );

    const sections = Array.from(sectionsMap.values()).sort((a, b) =>
      a.code.localeCompare(b.code),
    );

    const schools = Array.from(schoolsSet).sort();

    return NextResponse.json({
      students,
      classes,
      sections,
      schools,
      total: students.length,
    }, { headers: CACHE_SHORT });
  } catch (error) {
    console.error("Error in bulk-export:", error);
    return NextResponse.json(
      { students: [], classes: [], sections: [], schools: [], total: 0 },
      { status: 500 },
    );
  }
}
