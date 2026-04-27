import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { verifyAuth } from "@/lib/api-auth";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { CACHE_SHORT } from "@/lib/cache-headers";
import type { AssessmentTemplate, AssessmentCategory } from "@/types/assessment";

function makeDocId(year: string, classCode: string, subjectCode: string, semester: string) {
  return `${year}_${classCode}_${subjectCode}_${semester}`;
}

function validateCategories(categories: AssessmentCategory[]): string | null {
  if (!categories || categories.length === 0) return "At least one category is required";
  const totalWeight = categories.reduce((sum, c) => sum + (c.weight || 0), 0);
  if (Math.abs(totalWeight - 100) > 0.01) return `Category weights must sum to 100% (currently ${totalWeight}%)`;
  for (const cat of categories) {
    if (!cat.name_en?.trim()) return "Every category must have an English name";
    if (cat.weight <= 0) return `Category "${cat.name_en}" must have a positive weight`;
    if (!cat.sub_assessments || cat.sub_assessments.length === 0) return `Category "${cat.name_en}" must have at least one sub-assessment`;
    for (const sa of cat.sub_assessments) {
      if (!sa.name_en?.trim()) return `All sub-assessments in "${cat.name_en}" must have an English name`;
      if (!sa.max_score || sa.max_score <= 0) return `Sub-assessment "${sa.name_en}" must have a positive max score`;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  if (!hasPermission(auth.role, "assessments.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const year = searchParams.get("year");
  const classCode = searchParams.get("classCode");
  const subjectCode = searchParams.get("subjectCode");
  const semester = searchParams.get("semester");

  if (!year) return NextResponse.json({ error: "year parameter is required" }, { status: 400 });

  const supabase = createServiceClient();
  try {
    if (year && classCode && subjectCode && semester) {
      const docId = makeDocId(year, classCode, subjectCode, semester);
      const { data } = await supabase.from("assessment_templates").select("*").eq("id", docId).maybeSingle();
      if (!data) return NextResponse.json({ template: null }, { headers: CACHE_SHORT });
      return NextResponse.json({ template: data as AssessmentTemplate }, { headers: CACHE_SHORT });
    }

    let q = supabase.from("assessment_templates").select("*").eq("academic_year", year);
    if (classCode) q = q.eq("class_code", classCode);
    const { data: templates } = await q;
    return NextResponse.json({ templates: (templates ?? []) as AssessmentTemplate[] }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Assessment templates GET error:", err);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  if (!hasPermission(auth.role, "assessments.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createServiceClient();
  try {
    const body = await req.json();
    const { academic_year, class_code, subject_code, semester, categories } = body;

    if (!academic_year || !class_code || !subject_code || !semester) return NextResponse.json({ error: "academic_year, class_code, subject_code, and semester are required" }, { status: 400 });
    if (!["S1", "S2"].includes(semester)) return NextResponse.json({ error: "semester must be S1 or S2" }, { status: 400 });

    const validationError = validateCategories(categories);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const docId = makeDocId(academic_year, class_code, subject_code, semester);
    const now = new Date().toISOString();

    const { data: existing } = await supabase.from("assessment_templates").select("*").eq("id", docId).maybeSingle();
    const isUpdate = !!existing;
    const existingData = existing as Record<string, unknown> | null;

    const template = {
      id: docId, academic_year, class_code, subject_code, semester,
      status: body.status || (isUpdate ? existingData!.status : "draft"),
      categories,
      created_by: isUpdate ? existingData!.created_by : auth.uid,
      created_at: isUpdate ? existingData!.created_at : now,
      updated_at: now,
    };

    await supabase.from("assessment_templates").upsert(template);

    await logAudit({ actor: auth.uid, action: isUpdate ? "assessment_template.update" : "assessment_template.create", details: `${isUpdate ? "Updated" : "Created"} assessment template for ${class_code}/${subject_code} ${semester} ${academic_year}`, targetId: docId, targetType: "assessment_template" });

    return NextResponse.json(template);
  } catch (err) {
    console.error("Assessment templates POST error:", err);
    return NextResponse.json({ error: "Failed to save template" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  if (!hasPermission(auth.role, "assessments.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const docId = req.nextUrl.searchParams.get("id");
  if (!docId) return NextResponse.json({ error: "id parameter is required" }, { status: 400 });

  const supabase = createServiceClient();
  try {
    const parts = docId.split("_");
    const { count } = await supabase.from("assessment_scores").select("id", { count: "exact", head: true }).eq("academic_year", parts[0]).eq("subject_code", parts[2]);
    if ((count ?? 0) > 0) return NextResponse.json({ error: "Cannot delete template that has student scores. Remove scores first." }, { status: 409 });

    await supabase.from("assessment_templates").delete().eq("id", docId);

    await logAudit({ actor: auth.uid, action: "assessment_template.delete", details: `Deleted assessment template ${docId}`, targetId: docId, targetType: "assessment_template" });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Assessment templates DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
