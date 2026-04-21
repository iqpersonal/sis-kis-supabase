import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { CACHE_SHORT } from "@/lib/cache-headers";
import type { AssessmentTemplate, AssessmentCategory } from "@/types/assessment";

const COLLECTION = "assessment_templates";

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
    if (!cat.sub_assessments || cat.sub_assessments.length === 0) {
      return `Category "${cat.name_en}" must have at least one sub-assessment`;
    }
    for (const sa of cat.sub_assessments) {
      if (!sa.name_en?.trim()) return `All sub-assessments in "${cat.name_en}" must have an English name`;
      if (!sa.max_score || sa.max_score <= 0) return `Sub-assessment "${sa.name_en}" must have a positive max score`;
    }
  }
  return null;
}

/**
 * GET /api/assessment-templates?year=25-26&classCode=29&subjectCode=MTH&semester=S1
 *   — fetch a single template
 * GET /api/assessment-templates?year=25-26
 *   — list all templates for a year
 * GET /api/assessment-templates?year=25-26&classCode=29
 *   — list templates for a year + grade
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  if (!hasPermission(auth.role, "assessments.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const year = searchParams.get("year");
  const classCode = searchParams.get("classCode");
  const subjectCode = searchParams.get("subjectCode");
  const semester = searchParams.get("semester");

  if (!year) {
    return NextResponse.json({ error: "year parameter is required" }, { status: 400 });
  }

  try {
    // Single template lookup
    if (year && classCode && subjectCode && semester) {
      const docId = makeDocId(year, classCode, subjectCode, semester);
      const doc = await adminDb.collection(COLLECTION).doc(docId).get();
      if (!doc.exists) {
        return NextResponse.json({ template: null }, { headers: CACHE_SHORT });
      }
      return NextResponse.json(
        { template: { id: doc.id, ...doc.data() } as AssessmentTemplate },
        { headers: CACHE_SHORT }
      );
    }

    // List templates (filtered by year, optionally classCode)
    let query: FirebaseFirestore.Query = adminDb.collection(COLLECTION);
    query = query.where("academic_year", "==", year);
    if (classCode) query = query.where("class_code", "==", classCode);

    const snap = await query.get();
    const templates = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AssessmentTemplate);

    return NextResponse.json({ templates }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Assessment templates GET error:", err);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

/**
 * POST /api/assessment-templates
 * Body: { academic_year, class_code, subject_code, semester, categories }
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  if (!hasPermission(auth.role, "assessments.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { academic_year, class_code, subject_code, semester, categories } = body;

    if (!academic_year || !class_code || !subject_code || !semester) {
      return NextResponse.json(
        { error: "academic_year, class_code, subject_code, and semester are required" },
        { status: 400 }
      );
    }
    if (!["S1", "S2"].includes(semester)) {
      return NextResponse.json({ error: "semester must be S1 or S2" }, { status: 400 });
    }

    const validationError = validateCategories(categories);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const docId = makeDocId(academic_year, class_code, subject_code, semester);
    const now = new Date().toISOString();

    // Check if published template already has scores — prevent structural changes
    const existing = await adminDb.collection(COLLECTION).doc(docId).get();
    const isUpdate = existing.exists;

    const template: Omit<AssessmentTemplate, "id"> = {
      academic_year,
      class_code,
      subject_code,
      semester,
      status: body.status || (isUpdate ? existing.data()!.status : "draft"),
      categories,
      created_by: isUpdate ? existing.data()!.created_by : auth.uid,
      created_at: isUpdate ? existing.data()!.created_at : now,
      updated_at: now,
    };

    await adminDb.collection(COLLECTION).doc(docId).set(template);

    await logAudit({
      actor: auth.uid,
      action: isUpdate ? "assessment_template.update" : "assessment_template.create",
      details: `${isUpdate ? "Updated" : "Created"} assessment template for ${class_code}/${subject_code} ${semester} ${academic_year}`,
      targetId: docId,
      targetType: "assessment_template",
    });

    return NextResponse.json({ id: docId, ...template });
  } catch (err) {
    console.error("Assessment templates POST error:", err);
    return NextResponse.json({ error: "Failed to save template" }, { status: 500 });
  }
}

/**
 * DELETE /api/assessment-templates?id=25-26_29_MTH_S1
 */
export async function DELETE(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  if (!hasPermission(auth.role, "assessments.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const docId = req.nextUrl.searchParams.get("id");
  if (!docId) {
    return NextResponse.json({ error: "id parameter is required" }, { status: 400 });
  }

  try {
    // Check if there are any scores linked to this template
    const scoresSnap = await adminDb
      .collection("assessment_scores")
      .where("academic_year", "==", docId.split("_")[0])
      .where("subject_code", "==", docId.split("_")[2])
      .limit(1)
      .get();

    if (!scoresSnap.empty) {
      return NextResponse.json(
        { error: "Cannot delete template that has student scores. Remove scores first." },
        { status: 409 }
      );
    }

    await adminDb.collection(COLLECTION).doc(docId).delete();

    await logAudit({
      actor: auth.uid,
      action: "assessment_template.delete",
      details: `Deleted assessment template ${docId}`,
      targetId: docId,
      targetType: "assessment_template",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Assessment templates DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
