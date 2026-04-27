import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT, CACHE_NONE } from "@/lib/cache-headers";

function classToNweaBand(className: string, classCode: string): string | null {
  const match = className?.match(/(\d+)/);
  const grade = match ? parseInt(match[1], 10) : null;
  const gradeFromCode = classCode ? parseInt(classCode, 10) - 20 : null;
  const g = grade ?? gradeFromCode;
  if (!g) return null;
  if (g <= 2) return "k-2";
  if (g <= 5) return "3-5";
  if (g <= 8) return "6-8";
  return "9-12";
}

export async function GET(req: NextRequest) {
  const teacher = req.nextUrl.searchParams.get("teacher");
  const classCode = req.nextUrl.searchParams.get("class");
  const status = req.nextUrl.searchParams.get("status");
  const year = req.nextUrl.searchParams.get("year");
  const studentNumber = req.nextUrl.searchParams.get("student");
  const supabase = createServiceClient();

  try {
    if (studentNumber) {
      const { data: cred } = await supabase
        .from("student_credentials")
        .select("*")
        .eq("id", studentNumber)
        .maybeSingle();

      if (!cred) return NextResponse.json({ assignments: [] }, { headers: CACHE_SHORT });

      const c = cred as Record<string, unknown>;
      const studentClassCode = c.class_code as string || "";
      const studentSection = c.section as string || "";
      const studentSchool = c.school as string || "";
      const sectionCode = c.section_code as string || "";
      const bandCode = classToNweaBand(c.class_name as string || "", studentClassCode);

      const [sisRes, bandRes] = await Promise.all([
        supabase.from("quiz_assignments").select("*").eq("sis_class_code", studentClassCode).eq("status", "active"),
        bandCode
          ? supabase.from("quiz_assignments").select("*").eq("class_code", bandCode).eq("status", "active")
          : Promise.resolve({ data: [] }),
      ]);

      const seen = new Set<string>();
      const allDocs: Record<string, unknown>[] = [];
      for (const row of [...(sisRes.data ?? []), ...(bandRes.data ?? [])] as Record<string, unknown>[]) {
        if (!seen.has(row.id as string)) { seen.add(row.id as string); allDocs.push(row); }
      }

      const now = new Date();
      const assignments = allDocs
        .filter((a) => {
          if (a.sis_school && studentSchool && a.sis_school !== studentSchool) return false;
          if (a.sis_section_code && sectionCode && a.sis_section_code !== sectionCode) return false;
          if (!a.sis_class_code && a.section && a.section !== "all" && a.section !== studentSection) return false;
          if (a.start_date && new Date(a.start_date as string) > now) return false;
          if (a.end_date && new Date(a.end_date as string) < now) return false;
          return true;
        })
        .map((a) => ({
          ...a,
          question_ids: undefined,
          question_count: Array.isArray(a.question_ids) ? (a.question_ids as string[]).length : (a.question_count as number) || 0,
        }));

      return NextResponse.json({ assignments }, { headers: CACHE_SHORT });
    }

    let q = supabase.from("quiz_assignments").select("*").limit(200);
    if (teacher) {
      const variants = [teacher];
      if (!teacher.includes("@")) variants.push(`${teacher}@kis-riyadh.com`);
      q = q.in("created_by", variants);
    }
    if (classCode) q = q.eq("class_code", classCode);
    if (status) q = q.eq("status", status);
    if (year) q = q.eq("year", year);

    const { data } = await q;
    const assignments = ((data ?? []) as Record<string, unknown>[]).sort((a, b) =>
      new Date(b.created_at as string || 0).getTime() - new Date(a.created_at as string || 0).getTime()
    );

    return NextResponse.json({ assignments }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Quiz assignments GET error:", err);
    return NextResponse.json({ error: "Failed to fetch assignments" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const a = body.assignment as {
        title: string; title_ar?: string; subject: string; class_code: string; class_name?: string;
        section?: string; sis_class_code?: string; sis_section_code?: string; sis_school?: string;
        question_ids: string[]; year: string; start_date?: string; end_date?: string;
        duration_minutes?: number; created_by: string; adaptive: boolean;
      };

      if (!a.title || !a.subject || !a.class_code || !a.question_ids?.length || !a.year) {
        return NextResponse.json({ error: "title, subject, class_code, question_ids, and year required" }, { status: 400 });
      }

      const { data: questions } = await supabase.from("quiz_questions").select("id").in("id", a.question_ids);
      const validIds = (questions ?? []).map((q) => (q as Record<string, unknown>).id as string);
      if (validIds.length === 0) return NextResponse.json({ error: "No valid questions found" }, { status: 400 });

      const now = new Date().toISOString();
      const { data } = await supabase.from("quiz_assignments").insert({
        title: a.title, title_ar: a.title_ar || "", subject: a.subject, class_code: a.class_code,
        class_name: a.class_name || "", section: a.section || "all",
        sis_class_code: a.sis_class_code || "", sis_section_code: a.sis_section_code || "",
        sis_school: a.sis_school || "", question_ids: validIds, question_count: validIds.length,
        year: a.year, start_date: a.start_date || now, end_date: a.end_date || "",
        duration_minutes: a.duration_minutes || 0, adaptive: a.adaptive ?? true, status: "active",
        created_by: a.created_by, stats: { started: 0, completed: 0, avg_score: 0 },
        created_at: now, updated_at: now,
      }).select("id").single();

      return NextResponse.json({ success: true, assignmentId: (data as Record<string, unknown>).id }, { headers: CACHE_NONE });
    }

    if (action === "update") {
      const { assignmentId, updates } = body;
      if (!assignmentId) return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
      const { created_at, stats, ...safeUpdates } = updates;
      await supabase.from("quiz_assignments").update({ ...safeUpdates, updated_at: new Date().toISOString() }).eq("id", assignmentId);
      return NextResponse.json({ success: true }, { headers: CACHE_NONE });
    }

    if (action === "cancel") {
      const { assignmentId } = body;
      if (!assignmentId) return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
      await supabase.from("quiz_assignments").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", assignmentId);
      return NextResponse.json({ success: true }, { headers: CACHE_NONE });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("Quiz assignments POST error:", err);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}