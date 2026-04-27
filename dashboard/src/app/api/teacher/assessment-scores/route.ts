import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { verifyAuthOrPortalSession } from "@/lib/api-auth";
import { CACHE_NONE } from "@/lib/cache-headers";

const TEMPLATES = "assessment_templates";
const SCORES = "assessment_scores";

/**
 * GET /api/teacher/assessment-scores
 *   ?classId=SECTION_DOC_ID&subjectCode=MTH&semester=S1&year=25-26
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAuthOrPortalSession(req, "teacher");
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;
  const classId = searchParams.get("classId");
  const subjectCode = searchParams.get("subjectCode");
  const semester = searchParams.get("semester");
  const year = searchParams.get("year");

  if (!classId || !subjectCode || !semester || !year) {
    return NextResponse.json({ error: "classId, subjectCode, semester, and year are required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  try {
    const { data: sec } = await supabase.from("sections").select("*").eq("id", classId).maybeSingle();
    if (!sec) return NextResponse.json({ error: "Section not found" }, { status: 404 });

    const s = sec as Record<string, unknown>;
    const classCode = String(s["Class_Code"] || "");
    const sectionCode = String(s["Section_Code"] || "");

    const templateId = `${year}_${classCode}_${subjectCode}_${semester}`;
    const { data: templateRow } = await supabase.from(TEMPLATES).select("*").eq("id", templateId).maybeSingle();

    if (!templateRow) {
      return NextResponse.json(
        { template: null, scores: {}, message: "No assessment template configured for this class/subject/semester" },
        { headers: CACHE_NONE }
      );
    }

    const { data: scoreRows } = await supabase
      .from(SCORES)
      .select("*")
      .eq("academic_year", year)
      .eq("semester", semester)
      .eq("class_code", classCode)
      .eq("section_code", sectionCode)
      .eq("subject_code", subjectCode);

    const scores: Record<string, Record<string, { score: number; max_score: number }>> = {};
    for (const row of scoreRows ?? []) {
      const d = row as Record<string, unknown>;
      const sn = String(d["student_number"]);
      if (!scores[sn]) scores[sn] = {};
      scores[sn][String(d["sub_assessment_id"])] = {
        score: Number(d["score"]),
        max_score: Number(d["max_score"]),
      };
    }

    return NextResponse.json({ template: { id: templateId, ...templateRow }, scores }, { headers: CACHE_NONE });
  } catch (err) {
    console.error("Assessment scores GET error:", err);
    return NextResponse.json({ error: "Failed to fetch scores" }, { status: 500 });
  }
}

/**
 * POST /api/teacher/assessment-scores
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuthOrPortalSession(req, "teacher");
  if (!auth.ok) return auth.response;

  const supabase = createServiceClient();

  try {
    const body = await req.json();
    const { classId, subjectCode, semester, year, scores, recorded_by } = body;

    if (!classId || !subjectCode || !semester || !year || !scores) {
      return NextResponse.json({ error: "classId, subjectCode, semester, year, and scores are required" }, { status: 400 });
    }

    const { data: sec } = await supabase.from("sections").select("*").eq("id", classId).maybeSingle();
    if (!sec) return NextResponse.json({ error: "Section not found" }, { status: 404 });

    const s = sec as Record<string, unknown>;
    const classCode = String(s["Class_Code"] || "");
    const sectionCode = String(s["Section_Code"] || "");

    const templateId = `${year}_${classCode}_${subjectCode}_${semester}`;
    const { data: templateRow } = await supabase.from(TEMPLATES).select("*").eq("id", templateId).maybeSingle();
    if (!templateRow) return NextResponse.json({ error: "No assessment template found" }, { status: 404 });

    const templateData = templateRow as Record<string, unknown>;
    const validSubs = new Map<string, number>();
    for (const cat of (templateData["categories"] as { sub_assessments: { id: string; max_score: number }[] }[]) || []) {
      for (const sa of cat.sub_assessments || []) {
        validSubs.set(sa.id, sa.max_score);
      }
    }

    const now = new Date().toISOString();
    const validRows: Record<string, unknown>[] = [];

    for (const s2 of scores) {
      if (!s2.student_number || !s2.sub_assessment_id) continue;
      const templateMax = validSubs.get(s2.sub_assessment_id);
      if (templateMax === undefined) {
        return NextResponse.json({ error: `Invalid sub-assessment ID: ${s2.sub_assessment_id}` }, { status: 400 });
      }
      const score = Number(s2.score);
      if (isNaN(score) || score < 0) {
        return NextResponse.json({ error: `Invalid score for student ${s2.student_number}` }, { status: 400 });
      }
      if (score > templateMax) {
        return NextResponse.json({ error: `Score ${score} exceeds max ${templateMax}` }, { status: 400 });
      }
      validRows.push({
        id: `${year}_${semester}_${s2.student_number}_${subjectCode}_${s2.sub_assessment_id}`,
        academic_year: year,
        semester,
        student_number: s2.student_number,
        subject_code: subjectCode,
        class_code: classCode,
        section_code: sectionCode,
        category_id: s2.category_id,
        sub_assessment_id: s2.sub_assessment_id,
        score,
        max_score: templateMax,
        recorded_by: recorded_by || "",
        recorded_at: now,
        updated_at: now,
      });
    }

    const CHUNK = 450;
    for (let i = 0; i < validRows.length; i += CHUNK) {
      await supabase.from(SCORES).upsert(validRows.slice(i, i + CHUNK));
    }

    return NextResponse.json({ success: true, count: validRows.length });
  } catch (err) {
    console.error("Assessment scores POST error:", err);
    return NextResponse.json({ error: "Failed to save scores" }, { status: 500 });
  }
}
