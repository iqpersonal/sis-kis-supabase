import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { verifyAuth } from "@/lib/api-auth";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  if (!hasPermission(auth.role, "assessments.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const { source_year, source_class_code, source_subject_code, source_semester, target_year, target_class_code, target_subject_code, target_semester } = body;

    if (!source_year || !source_class_code || !source_subject_code || !source_semester) return NextResponse.json({ error: "All source fields are required" }, { status: 400 });
    if (!target_year || !target_class_code || !target_subject_code || !target_semester) return NextResponse.json({ error: "All target fields are required" }, { status: 400 });
    if (!["S1", "S2"].includes(target_semester)) return NextResponse.json({ error: "target_semester must be S1 or S2" }, { status: 400 });

    const sourceId = `${source_year}_${source_class_code}_${source_subject_code}_${source_semester}`;
    const targetId = `${target_year}_${target_class_code}_${target_subject_code}_${target_semester}`;

    const supabase = createServiceClient();
    const { data: sourceDoc } = await supabase.from("assessment_templates").select("*").eq("id", sourceId).maybeSingle();
    if (!sourceDoc) return NextResponse.json({ error: "Source template not found" }, { status: 404 });

    const { data: targetDoc } = await supabase.from("assessment_templates").select("id").eq("id", targetId).maybeSingle();
    if (targetDoc) return NextResponse.json({ error: "Target template already exists. Delete it first or edit directly." }, { status: 409 });

    const src = sourceDoc as Record<string, unknown>;
    const now = new Date().toISOString();
    const newTemplate = { id: targetId, academic_year: target_year, class_code: target_class_code, subject_code: target_subject_code, semester: target_semester, categories: src["categories"], created_by: auth.uid, created_at: now, updated_at: now };
    await supabase.from("assessment_templates").insert(newTemplate);

    await logAudit({ actor: auth.uid, action: "assessment_template.copy", details: `Copied assessment template from ${sourceId} to ${targetId}`, targetId, targetType: "assessment_template" });

    return NextResponse.json({ id: targetId, ...newTemplate });
  } catch (err) {
    console.error("Assessment template copy error:", err);
    return NextResponse.json({ error: "Failed to copy template" }, { status: 500 });
  }
}
