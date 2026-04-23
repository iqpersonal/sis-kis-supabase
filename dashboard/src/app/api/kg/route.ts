import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { compareAlphabeticalNames } from "@/lib/name-sort";

const COLLECTION = "kg_assessments";
const DOMAINS_COLLECTION = "kg_skill_domains";
const KG_CLASS_CODES = ["10", "11", "12", "13"]; // Nursery, KG1, KG2, KG3

/* ────────────────────────────────────────────────────────────────── */
/*  GET /api/kg                                                       */
/*   ?action=list&year=25-26&term=term1&classCode=KG+1&sectionCode=Daisies */
/*   ?action=student&studentNumber=12345&year=25-26                   */
/*   ?action=domains&year=25-26                                       */
/*   ?action=students&year=25-26&classCode=10                         */
/* ────────────────────────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action") || "list";

  try {
    /* ── List assessments for a class / section / term ── */
    if (action === "list") {
      const year = sp.get("year");
      const term = sp.get("term");
      const classCode = sp.get("classCode");
      const sectionCode = sp.get("sectionCode");

      if (!year || !term) {
        return NextResponse.json(
          { error: "year and term are required" },
          { status: 400 },
        );
      }

      let query: FirebaseFirestore.Query = adminDb
        .collection(COLLECTION)
        .where("academic_year", "==", year)
        .where("term", "==", term);

      if (classCode) {
        query = query.where("class_code", "==", classCode);
      }
      if (sectionCode) {
        query = query.where("section_code", "==", sectionCode);
      }

      const snap = await query.limit(500).get();
      const assessments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      return NextResponse.json({ assessments }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    /* ── All assessments for one student ── */
    if (action === "student") {
      const studentNumber = sp.get("studentNumber");
      const year = sp.get("year");

      if (!studentNumber) {
        return NextResponse.json(
          { error: "studentNumber required" },
          { status: 400 },
        );
      }

      let query: FirebaseFirestore.Query = adminDb
        .collection(COLLECTION)
        .where("student_number", "==", studentNumber);

      if (year) {
        query = query.where("academic_year", "==", year);
      }

      const snap = await query.limit(100).get();
      const assessments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      return NextResponse.json({ assessments }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    /* ── Get custom skill domains (admin-configured) ── */
    if (action === "domains") {
      const year = sp.get("year") || "25-26";
      const docRef = adminDb.collection(DOMAINS_COLLECTION).doc(year);
      const snap = await docRef.get();

      if (snap.exists) {
        return NextResponse.json({ domains: snap.data()?.domains || [] }, {
          headers: { "Cache-Control": "no-store" },
        });
      }

      // Return empty — page will fall back to defaults
      return NextResponse.json({ domains: [] }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    /* ── Get KG students for a given year + class ── */
    if (action === "students") {
      const year = sp.get("year");
      const classCode = sp.get("classCode");
      const sectionCode = sp.get("sectionCode");

      if (!year) {
        return NextResponse.json(
          { error: "year required" },
          { status: 400 },
        );
      }

      // All Firestore fields are strings
      let query: FirebaseFirestore.Query = adminDb
        .collection("registrations")
        .where("Academic_Year", "==", year);

      if (classCode) {
        query = query.where("Class_Code", "==", classCode);
      } else {
        query = query.where("Class_Code", "in", KG_CLASS_CODES);
      }

      const snap = await query.limit(2000).get();
      const regs = snap.docs.map((d) => d.data());

      // Filter by section if provided
      const filteredRegs = sectionCode
        ? regs.filter((r) => String(r.Section_Code) === sectionCode)
        : regs;

      // Get student details
      const studentNumbers = [...new Set(filteredRegs.map((r) => String(r.Student_Number)))];

      if (studentNumbers.length === 0) {
        return NextResponse.json({ students: [] });
      }

      // Fetch class names + section names for enrichment
      const kgClassCodes = [...new Set(filteredRegs.map((r) => String(r.Class_Code)))];
      const [classSnap, sectionSnap] = await Promise.all([
        adminDb.collection("classes").where("Class_Code", "in", kgClassCodes).get(),
        adminDb.collection("sections")
          .where("Academic_Year", "==", year)
          .where("Class_Code", "in", kgClassCodes)
          .get(),
      ]);
      const classNameMap = new Map(classSnap.docs.map((d) => [String(d.data().Class_Code), String(d.data().E_Class_Desc || d.data().Class_Code)]));
      const sectionNameMap = new Map(sectionSnap.docs.map((d) => {
        const sd = d.data();
        return [`${sd.Class_Code}-${sd.Section_Code}`, String(sd.E_Section_Name || sd.Section_Code)];
      }));

      // Batch fetch student records (for Family_Number + Child_Number)
      const studentDocs: Record<string, unknown>[] = [];
      for (let i = 0; i < studentNumbers.length; i += 30) {
        const chunk = studentNumbers.slice(i, i + 30);
        const stuSnap = await adminDb
          .collection("students")
          .where("Student_Number", "in", chunk)
          .get();
        studentDocs.push(...stuSnap.docs.map((d) => d.data()));
      }
      const studentDocMap = new Map(
        studentDocs.map((s) => [String(s.Student_Number), s]),
      );

      // Collect unique family numbers to fetch names
      const familyNumbers = [...new Set(studentDocs.map((s) => String(s.Family_Number)).filter(Boolean))];

      // Fetch family_children, families, and sponsors in parallel
      const fcDocs: Record<string, unknown>[] = [];
      const famDocs = new Map<string, Record<string, unknown>>();
      const sponsorNameMap = new Map<string, string>(); // student_number → last name from sponsor
      await Promise.all([
        (async () => {
          for (let i = 0; i < familyNumbers.length; i += 30) {
            const chunk = familyNumbers.slice(i, i + 30);
            const snap = await adminDb
              .collection("family_children")
              .where("Family_Number", "in", chunk)
              .get();
            fcDocs.push(...snap.docs.map((d) => d.data()));
          }
        })(),
        (async () => {
          for (let i = 0; i < familyNumbers.length; i += 30) {
            const chunk = familyNumbers.slice(i, i + 30);
            const snap = await adminDb
              .collection("families")
              .where("__name__", "in", chunk)
              .get();
            snap.docs.forEach((d) => famDocs.set(d.id, d.data() as Record<string, unknown>));
          }
        })(),
        // Fetch sponsors (father) to get family name as fallback
        (async () => {
          for (let i = 0; i < studentNumbers.length; i += 30) {
            const chunk = studentNumbers.slice(i, i + 30);
            const snap = await adminDb
              .collection("sponsors")
              .where("Student_Number", "in", chunk)
              .get();
            for (const doc of snap.docs) {
              const d = doc.data();
              const sn = String(d.Student_Number);
              // Prefer father (F) sponsor for family name
              if (String(d.Sponsor_Type) !== "F") continue;
              if (!sponsorNameMap.has(sn)) {
                const parts = String(d.E_Sponsor_Name || "").trim().split(/\s+/);
                if (parts.length >= 2) {
                  sponsorNameMap.set(sn, parts.slice(1).join(" "));
                }
              }
            }
          }
        })(),
      ]);

      // Map: "familyNumber-childNumber" → { E_Child_Name, A_Child_Name, Gender }
      const childNameMap = new Map(
        fcDocs.map((fc) => [
          `${fc.Family_Number}-${fc.Child_Number}`,
          fc,
        ]),
      );

      // Build a lookup from families.children[] by student_number → child_name
      const famChildNameMap = new Map<string, string>();
      for (const [, fam] of famDocs) {
        const children = fam.children as { student_number?: string; child_name?: string }[] | undefined;
        if (children) {
          for (const c of children) {
            if (c.student_number && c.child_name) {
              famChildNameMap.set(c.student_number, c.child_name);
            }
          }
        }
      }

      // Merge registration + student + name info
      const result = filteredRegs.map((r) => {
        const sn = String(r.Student_Number);
        const stu: Record<string, unknown> = studentDocMap.get(sn) || {};
        const fn = String(stu.Family_Number || "");
        const cn = String(stu.Child_Number || "");
        const fc: Record<string, unknown> = childNameMap.get(`${fn}-${cn}`) || {};
        const fam = famDocs.get(fn) || {};

        // Prefer full name sources: families.children > family_children+family > sponsor+child > first-name-only
        const famFullName = famChildNameMap.get(sn) || "";
        const firstName = String(fc.E_Child_Name || "").trim();
        const lastName = String(fam.family_name || "").trim();
        const builtName = lastName ? `${firstName} ${lastName}`.trim() : "";
        const sponsorLastName = sponsorNameMap.get(sn) || "";
        const sponsorBuiltName = firstName && sponsorLastName ? `${firstName} ${sponsorLastName}` : "";

        const firstNameAr = String(fc.A_Child_Name || "").trim();
        const cc = String(r.Class_Code);
        const sc = String(r.Section_Code || "");
        return {
          student_number: sn,
          student_name: famFullName || builtName || sponsorBuiltName || firstName || sn,
          student_name_ar: firstNameAr,
          class_code: cc,
          class_name: classNameMap.get(cc) || cc,
          section_code: sc,
          section_name: sectionNameMap.get(`${cc}-${sc}`) || sc,
          gender: fc.Gender === true ? "Male" : fc.Gender === false ? "Female" : "",
        };
      });

      // Deduplicate by student_number
      const seen = new Set<string>();
      const unique = result.filter((r) => {
        if (seen.has(r.student_number)) return false;
        seen.add(r.student_number);
        return true;
      });

      return NextResponse.json({
        students: unique.sort((a, b) => compareAlphabeticalNames(a.student_name, b.student_name)),
      });
    }

    /* ── KG class list (sections) for a year ── */
    if (action === "classes") {
      const year = sp.get("year");
      if (!year) {
        return NextResponse.json({ error: "year required" }, { status: 400 });
      }

      // Fetch class metadata, sections, and registrations to filter active sections
      const [classSnap, sectionSnap, regSnap] = await Promise.all([
        adminDb.collection("classes")
          .where("Class_Code", "in", KG_CLASS_CODES)
          .get(),
        adminDb.collection("sections")
          .where("Academic_Year", "==", year)
          .where("Class_Code", "in", KG_CLASS_CODES)
          .get(),
        adminDb.collection("registrations")
          .where("Academic_Year", "==", year)
          .where("Class_Code", "in", KG_CLASS_CODES)
          .get(),
      ]);

      // Build set of "classCode-sectionCode" pairs that have students
      const activeSections = new Set<string>();
      for (const doc of regSnap.docs) {
        const d = doc.data();
        activeSections.add(`${d.Class_Code}-${d.Section_Code}`);
      }

      const classNameMap = new Map(
        classSnap.docs.map((d) => {
          const cd = d.data();
          return [String(cd.Class_Code), String(cd.E_Class_Desc || cd.Class_Code)];
        }),
      );

      const classMap = new Map<string, { classCode: string; className: string; sections: Map<string, string> }>();

      // Seed classes from class metadata
      for (const [cc, cn] of classNameMap) {
        classMap.set(cc, { classCode: cc, className: cn, sections: new Map() });
      }

      // Add only sections that have registered students
      for (const doc of sectionSnap.docs) {
        const d = doc.data();
        const cc = String(d.Class_Code);
        const sc = String(d.Section_Code || "");
        const sn = String(d.E_Section_Name || sc);

        if (!activeSections.has(`${cc}-${sc}`)) continue;

        if (!classMap.has(cc)) {
          classMap.set(cc, { classCode: cc, className: classNameMap.get(cc) || cc, sections: new Map() });
        }
        if (sc) {
          classMap.get(cc)!.sections.set(sc, sn);
        }
      }

      // Only include classes that have at least one active section
      const classes = [...classMap.values()]
        .filter((c) => c.sections.size > 0)
        .sort((a, b) => Number(a.classCode) - Number(b.classCode))
        .map((c) => ({
          classCode: c.classCode,
          className: c.className,
          sections: [...c.sections.entries()]
            .map(([code, name]) => ({ sectionCode: code, sectionName: name }))
            .sort((a, b) => a.sectionName.localeCompare(b.sectionName)),
        }));

      return NextResponse.json({ classes }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("KG GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* ────────────────────────────────────────────────────────────────── */
/*  POST /api/kg                                                      */
/*  { action: "save", assessments: [...] }                            */
/*  { action: "save_domains", year: "25-26", domains: [...] }        */
/* ────────────────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    /* ── Batch save assessments ── */
    if (action === "save") {
      const { assessments } = body as {
        assessments: {
          id: string;
          student_number: string;
          student_name: string;
          class_code: string;
          class_name: string;
          section_code: string;
          section_name: string;
          academic_year: string;
          term: string;
          ratings: Record<string, string>;
          domain_notes: Record<string, string>;
          teacher_comment: string;
          recorded_by: string;
        }[];
      };

      if (!assessments || !Array.isArray(assessments) || assessments.length === 0) {
        return NextResponse.json(
          { error: "assessments array required" },
          { status: 400 },
        );
      }

      const batch = adminDb.batch();
      const now = new Date().toISOString();

      for (const a of assessments) {
        const docId = a.id || `${a.academic_year}_${a.term}_${a.student_number}`.replace(/[\/\s]+/g, "_");
        const docRef = adminDb.collection(COLLECTION).doc(docId);
        batch.set(
          docRef,
          {
            ...a,
            id: docId,
            updated_at: now,
          },
          { merge: true },
        );
      }

      await batch.commit();

      return NextResponse.json({
        ok: true,
        saved: assessments.length,
      });
    }

    /* ── Save custom skill domains ── */
    if (action === "save_domains") {
      const { year, domains } = body as {
        year: string;
        domains: unknown[];
      };

      if (!year || !domains) {
        return NextResponse.json(
          { error: "year and domains required" },
          { status: 400 },
        );
      }

      await adminDb.collection(DOMAINS_COLLECTION).doc(year).set(
        { domains, updated_at: new Date().toISOString() },
        { merge: true },
      );

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("KG POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
