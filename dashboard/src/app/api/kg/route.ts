import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { compareAlphabeticalNames } from "@/lib/name-sort";

export const dynamic = "force-dynamic";

const KG_CLASS_CODES = ["10", "11", "12", "13"];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action") || "list";
  const supabase = createServiceClient();

  try {
    if (action === "list") {
      const year = sp.get("year"), term = sp.get("term");
      const classCode = sp.get("classCode"), sectionCode = sp.get("sectionCode");
      if (!year || !term) return NextResponse.json({ error: "year and term are required" }, { status: 400 });
      let q = supabase.from("kg_assessments").select("*").eq("academic_year", year).eq("term", term);
      if (classCode) q = q.eq("class_code", classCode);
      if (sectionCode) q = q.eq("section_code", sectionCode);
      const { data } = await q.limit(500);
      return NextResponse.json({ assessments: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "student") {
      const studentNumber = sp.get("studentNumber"), year = sp.get("year");
      if (!studentNumber) return NextResponse.json({ error: "studentNumber required" }, { status: 400 });
      let q = supabase.from("kg_assessments").select("*").eq("student_number", studentNumber);
      if (year) q = q.eq("academic_year", year);
      const { data } = await q.limit(100);
      return NextResponse.json({ assessments: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "domains") {
      const year = sp.get("year") || "25-26";
      const { data } = await supabase.from("kg_skill_domains").select("domains").eq("id", year).maybeSingle();
      return NextResponse.json({ domains: (data as Record<string,unknown>|null)?.domains || [] }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "students") {
      const year = sp.get("year"), classCode = sp.get("classCode"), sectionCode = sp.get("sectionCode");
      if (!year) return NextResponse.json({ error: "year required" }, { status: 400 });

      let regQ = supabase.from("registrations").select("*").eq("Academic_Year", year);
      if (classCode) regQ = regQ.eq("Class_Code", classCode);
      else regQ = regQ.in("Class_Code", KG_CLASS_CODES);
      const { data: regs } = await regQ.limit(2000);
      const filteredRegs = sectionCode ? (regs ?? []).filter((r) => String((r as Record<string,unknown>)["Section_Code"]) === sectionCode) : (regs ?? []);

      const studentNumbers = [...new Set(filteredRegs.map((r) => String((r as Record<string,unknown>)["Student_Number"] || (r as Record<string,unknown>).student_number)))];
      if (studentNumbers.length === 0) return NextResponse.json({ students: [] });

      const kgClassCodes = [...new Set(filteredRegs.map((r) => String((r as Record<string,unknown>)["Class_Code"] || (r as Record<string,unknown>).class_code)))];

      const [{ data: classDocs }, { data: sectionDocs }] = await Promise.all([
        supabase.from("classes").select('"Class_Code", "E_Class_Desc"').in('"Class_Code"', kgClassCodes),
        supabase.from("sections").select('"Class_Code", "Section_Code", "E_Section_Name", academic_year').eq("academic_year", year).in('"Class_Code"', kgClassCodes),
      ]);

      const classNameMap = new Map((classDocs ?? []).map((d) => { const row=d as Record<string,unknown>; return [String(row["Class_Code"]), String(row["E_Class_Desc"] || row["Class_Code"])]; }));
      const sectionNameMap = new Map((sectionDocs ?? []).map((d) => { const row=d as Record<string,unknown>; return [`${row["Class_Code"]}-${row["Section_Code"]}`, String(row["E_Section_Name"] || row["Section_Code"])]; }));

      const studentDocs: Record<string,unknown>[] = [];
      for (let i = 0; i < studentNumbers.length; i += 200) {
        const chunk = studentNumbers.slice(i, i + 200);
        const { data: stuRows } = await supabase.from("students").select("student_number, Family_Number, Child_Number").in("student_number", chunk);
        studentDocs.push(...(stuRows ?? []).map(r => r as Record<string,unknown>));
      }
      const studentDocMap = new Map(studentDocs.map((s) => [String(s.student_number), s]));

      const familyNumbers = [...new Set(studentDocs.map((s) => String(s["Family_Number"] || "")).filter(Boolean))];
      const fcDocs: Record<string,unknown>[] = [];
      const famDocs = new Map<string, Record<string,unknown>>();
      const sponsorNameMap = new Map<string, string>();

      await Promise.all([
        (async () => {
          for (let i = 0; i < familyNumbers.length; i += 200) {
            const chunk = familyNumbers.slice(i, i + 200);
            const { data } = await supabase.from("family_children").select('"Family_Number", "Child_Number", "E_Child_Name", "A_Child_Name", "Gender"').in('"Family_Number"', chunk);
            fcDocs.push(...(data ?? []).map(r => r as Record<string,unknown>));
          }
        })(),
        (async () => {
          for (let i = 0; i < familyNumbers.length; i += 200) {
            const chunk = familyNumbers.slice(i, i + 200);
            const { data } = await supabase.from("families").select("id, children, family_name").in("id", chunk);
            (data ?? []).forEach((d) => { const row=d as Record<string,unknown>; famDocs.set(String(row.id), row); });
          }
        })(),
        (async () => {
          for (let i = 0; i < studentNumbers.length; i += 200) {
            const chunk = studentNumbers.slice(i, i + 200);
            const { data } = await supabase.from("sponsors").select("student_number, relationship, full_name, Sponsor_Type, E_Sponsor_Name").in("student_number", chunk);
            for (const d of data ?? []) {
              const row = d as Record<string,unknown>;
              const sn = String(row.student_number);
              const sponsorType = String(row["Sponsor_Type"] || row.relationship || "");
              if (sponsorType !== "F" && sponsorType !== "father") continue;
              if (!sponsorNameMap.has(sn)) {
                const name = String(row["E_Sponsor_Name"] || row.full_name || "").trim();
                const parts = name.split(/\s+/);
                if (parts.length >= 2) sponsorNameMap.set(sn, parts.slice(1).join(" "));
              }
            }
          }
        })(),
      ]);

      const childNameMap = new Map(fcDocs.map((fc) => [`${fc["Family_Number"]}-${fc["Child_Number"]}`, fc]));
      const famChildNameMap = new Map<string,string>();
      for (const [, fam] of famDocs) {
        const children = fam.children as { student_number?: string; child_name?: string }[] | undefined;
        if (children) for (const c of children) if (c.student_number && c.child_name) famChildNameMap.set(c.student_number, c.child_name);
      }

      const seen = new Set<string>();
      const result = filteredRegs.filter((r) => {
        const sn = String((r as Record<string,unknown>)["Student_Number"] || (r as Record<string,unknown>).student_number);
        if (seen.has(sn)) return false;
        seen.add(sn);
        return true;
      }).map((r) => {
        const row = r as Record<string,unknown>;
        const sn = String(row["Student_Number"] || row.student_number);
        const stu = studentDocMap.get(sn) || {};
        const fn = String(stu["Family_Number"] || "");
        const cn = String(stu["Child_Number"] || "");
        const fc = childNameMap.get(`${fn}-${cn}`) || {};
        const fam = famDocs.get(fn) || {};
        const famFullName = famChildNameMap.get(sn) || "";
        const firstName = String(fc["E_Child_Name"] || "").trim();
        const lastName = String(fam.family_name || "").trim();
        const builtName = lastName ? `${firstName} ${lastName}`.trim() : "";
        const sponsorLastName = sponsorNameMap.get(sn) || "";
        const sponsorBuiltName = firstName && sponsorLastName ? `${firstName} ${sponsorLastName}` : "";
        const firstNameAr = String(fc["A_Child_Name"] || "").trim();
        const cc = String(row["Class_Code"] || row.class_code);
        const sc = String(row["Section_Code"] || row.section_code || "");
        return { student_number: sn, student_name: famFullName || builtName || sponsorBuiltName || firstName || sn, student_name_ar: firstNameAr, class_code: cc, class_name: classNameMap.get(cc) || cc, section_code: sc, section_name: sectionNameMap.get(`${cc}-${sc}`) || sc, gender: fc["Gender"] === true ? "Male" : fc["Gender"] === false ? "Female" : "" };
      });

      return NextResponse.json({ students: result.sort((a, b) => compareAlphabeticalNames(a.student_name, b.student_name)) });
    }

    if (action === "classes") {
      const year = sp.get("year");
      if (!year) return NextResponse.json({ error: "year required" }, { status: 400 });

      const [{ data: classDocs }, { data: sectionDocs }, { data: regDocs }] = await Promise.all([
        supabase.from("classes").select('"Class_Code", "E_Class_Desc"').in('"Class_Code"', KG_CLASS_CODES),
        supabase.from("sections").select('"Class_Code", "Section_Code", "E_Section_Name"').eq("academic_year", year).in('"Class_Code"', KG_CLASS_CODES),
        supabase.from("registrations").select('"Class_Code", "Section_Code"').eq("Academic_Year", year).in('"Class_Code"', KG_CLASS_CODES).limit(5000),
      ]);

      const activeSections = new Set<string>();
      for (const d of regDocs ?? []) { const row=d as Record<string,unknown>; activeSections.add(`${row["Class_Code"]}-${row["Section_Code"]}`); }

      const classNameMap = new Map((classDocs ?? []).map((d) => { const row=d as Record<string,unknown>; return [String(row["Class_Code"]), String(row["E_Class_Desc"] || row["Class_Code"])]; }));
      const classMap = new Map<string, { classCode: string; className: string; sections: Map<string,string> }>();
      for (const [cc, cn] of classNameMap) classMap.set(cc, { classCode: cc, className: cn, sections: new Map() });

      for (const d of sectionDocs ?? []) {
        const row=d as Record<string,unknown>;
        const cc = String(row["Class_Code"]), sc = String(row["Section_Code"] || ""), sn = String(row["E_Section_Name"] || sc);
        if (!activeSections.has(`${cc}-${sc}`)) continue;
        if (!classMap.has(cc)) classMap.set(cc, { classCode: cc, className: classNameMap.get(cc) || cc, sections: new Map() });
        if (sc) classMap.get(cc)!.sections.set(sc, sn);
      }

      const classes = [...classMap.values()].filter((c) => c.sections.size > 0).sort((a, b) => Number(a.classCode) - Number(b.classCode)).map((c) => ({ classCode: c.classCode, className: c.className, sections: [...c.sections.entries()].map(([code, name]) => ({ sectionCode: code, sectionName: name })).sort((a, b) => a.sectionName.localeCompare(b.sectionName)) }));

      return NextResponse.json({ classes }, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("KG GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "save") {
      const { assessments } = body as { assessments: { id: string; student_number: string; student_name: string; class_code: string; class_name: string; section_code: string; section_name: string; academic_year: string; term: string; ratings: Record<string,string>; domain_notes: Record<string,string>; teacher_comment: string; recorded_by: string }[] };
      if (!assessments || !Array.isArray(assessments) || assessments.length === 0) return NextResponse.json({ error: "assessments array required" }, { status: 400 });
      const now = new Date().toISOString();
      const rows = assessments.map((a) => { const docId = a.id || `${a.academic_year}_${a.term}_${a.student_number}`.replace(/[/\s]+/g, "_"); return { ...a, id: docId, updated_at: now }; });
      for (let i = 0; i < rows.length; i += 500) await supabase.from("kg_assessments").upsert(rows.slice(i, i + 500));
      return NextResponse.json({ ok: true, saved: assessments.length });
    }

    if (action === "save_domains") {
      const { year, domains } = body as { year: string; domains: unknown[] };
      if (!year || !domains) return NextResponse.json({ error: "year and domains required" }, { status: 400 });
      await supabase.from("kg_skill_domains").upsert({ id: year, domains, updated_at: new Date().toISOString() });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("KG POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
