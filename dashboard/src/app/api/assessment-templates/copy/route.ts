import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/assessment-templates/copy
 * Body: { source_year, source_class_code, source_subject_code, source_semester,
 *         target_year, target_class_code, target_subject_code, target_semester }
 *
 * Copies an assessment template from one context to another.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  if (!hasPermission(auth.role, "assessments.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      source_year, source_class_code, source_subject_code, source_semester,
      target_year, target_class_code, target_subject_code, target_semester,
    } = body;

    if (!source_year || !source_class_code || !source_subject_code || !source_semester) {
      return NextResponse.json({ error: "All source fields are required" }, { status: 400 });
    }
    if (!target_year || !target_class_code || !target_subject_code || !target_semester) {
      return NextResponse.json({ error: "All target fields are required" }, { status: 400 });
    }
    if (!["S1", "S2"].includes(target_semester)) {
      return NextResponse.json({ error: "target_semester must be S1 or S2" }, { status: 400 });
    }

    const sourceId = `${source_year}_${source_class_code}_${source_subject_code}_${source_semester}`;
    const targetId = `${target_year}_${target_class_code}_${target_subject_code}_${target_semester}`;

    // Fetch source
    const sourceDoc = await adminDb.collection("assessment_templates").doc(sourceId).get();
    if (!sourceDoc.exists) {
      return NextResponse.json({ error: "Source template not found" }, { status: 404 });
    }

    // Check target doesn't already exist
    const targetDoc = await adminDb.collection("assessment_templates").doc(targetId).get();
    if (targetDoc.exists) {
      return NextResponse.json(
        { error: "Target template already exists. Delete it first or edit directly." },
        { status: 409 }
      );
    }

    const sourceData = sourceDoc.data()!;
    const now = new Date().toISOString();

    const newTemplate = {
      academic_year: target_year,
      class_code: target_class_code,
      subject_code: target_subject_code,
      semester: target_semester,
      status: "draft",
      categories: sourceData.categories, // deep copy happens via Firestore serialization
      created_by: auth.uid,
      created_at: now,
      updated_at: now,
    };

    await adminDb.collection("assessment_templates").doc(targetId).set(newTemplate);

    await logAudit({
      actor: auth.uid,
      action: "assessment_template.copy",
      details: `Copied assessment template from ${sourceId} to ${targetId}`,
      targetId: targetId,
      targetType: "assessment_template",
    });

    return NextResponse.json({ id: targetId, ...newTemplate });
  } catch (err) {
    console.error("Assessment template copy error:", err);
    return NextResponse.json({ error: "Failed to copy template" }, { status: 500 });
  }
}
