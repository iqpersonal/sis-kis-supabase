import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_PRIVATE } from "@/lib/cache-headers";
import { progressReportDocId, monthToTerm } from "@/lib/progress-report-rubric";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action") || "list";
  const supabase = createServiceClient();

  try {
    if (action === "list") {
      const year = sp.get("year"), month = sp.get("month"), classCode = sp.get("classCode"), sectionCode = sp.get("sectionCode");
      if (!year || !month || !classCode) return NextResponse.json({ error: "year, month, classCode required" }, { status: 400 });
      let q = supabase.from("progress_reports").select("*").eq("academic_year", year).eq("month", month).eq("class_code", classCode);
      if (sectionCode) q = q.eq("section_code", sectionCode);
      const { data } = await q.limit(5000);
      return NextResponse.json({ reports: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "student") {
      const studentNumber = sp.get("studentNumber"), year = sp.get("year");
      if (!studentNumber) return NextResponse.json({ error: "studentNumber required" }, { status: 400 });
      let q = supabase.from("progress_reports").select("*").eq("student_number", studentNumber);
      if (year) q = q.eq("academic_year", year);
      const { data } = await q.limit(500);
      return NextResponse.json({ reports: data ?? [] }, { headers: CACHE_PRIVATE });
    }

    if (action === "months") {
      const year = sp.get("year");
      if (!year) return NextResponse.json({ error: "year required" }, { status: 400 });
      const { data } = await supabase.from("progress_reports").select("month").eq("academic_year", year).limit(10000);
      const months = [...new Set((data ?? []).map((d) => (d as Record<string,unknown>).month as string))].sort();
      return NextResponse.json({ months }, { headers: CACHE_PRIVATE });
    }

    if (action === "class_subjects") {
      const classCode = sp.get("classCode"), year = sp.get("year") || "25-26";
      if (!classCode) return NextResponse.json({ error: "classCode required" }, { status: 400 });
      const { data } = await supabase.from("student_progress").select("years").limit(5);
      const subjectSet = new Set<string>();
      for (const d of data ?? []) {
        const row = d as Record<string,unknown>;
        const yearData = (row.years as Record<string,Record<string,unknown>>)?.[year];
        if (yearData?.subjects) for (const s of yearData.subjects as { subject?: string }[]) if (s.subject) subjectSet.add(s.subject);
      }
      return NextResponse.json({ subjects: [...subjectSet].sort() }, { headers: CACHE_PRIVATE });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Progress report GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "save") {
      const { reports } = body as { reports: { student_number: string; student_name: string; subject: string; class_code: string; section_code: string; academic_year: string; month: string; academic_performance: string; homework_effort: string; participation: string; conduct: string; notes?: string; recorded_by?: string }[] };
      if (!reports || !Array.isArray(reports) || reports.length === 0) return NextResponse.json({ error: "reports array required" }, { status: 400 });
      const now = new Date().toISOString();
      let count = 0;
      const rows = reports.filter((r) => r.student_number && r.subject && r.academic_year && r.month).map((r) => ({ id: progressReportDocId(r.academic_year, r.month, r.student_number, r.subject), student_number: r.student_number, student_name: r.student_name||"", subject: r.subject, class_code: r.class_code||"", section_code: r.section_code||"", academic_year: r.academic_year, month: r.month, term: monthToTerm(r.month), academic_performance: r.academic_performance||"", homework_effort: r.homework_effort||"", participation: r.participation||"", conduct: r.conduct||"", notes: r.notes||"", recorded_by: r.recorded_by||"", updated_at: now }));
      for (let i = 0; i < rows.length; i += 500) { await supabase.from("progress_reports").upsert(rows.slice(i, i + 500)); count += rows.slice(i, i + 500).length; }
      return NextResponse.json({ success: true, count });
    }

    if (action === "save_single") {
      const { student_number, student_name, subject, class_code, section_code, academic_year, month, academic_performance, homework_effort, participation, conduct, notes, recorded_by } = body;
      if (!student_number || !subject || !academic_year || !month) return NextResponse.json({ error: "student_number, subject, academic_year, month required" }, { status: 400 });
      const docId = progressReportDocId(academic_year, month, student_number, subject);
      await supabase.from("progress_reports").upsert({ id: docId, student_number, student_name: student_name||"", subject, class_code: class_code||"", section_code: section_code||"", academic_year, month, term: monthToTerm(month), academic_performance: academic_performance||"", homework_effort: homework_effort||"", participation: participation||"", conduct: conduct||"", notes: notes||"", recorded_by: recorded_by||"", updated_at: new Date().toISOString() });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Progress report POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
