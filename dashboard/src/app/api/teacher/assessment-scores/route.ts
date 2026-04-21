import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuthOrPortalSession } from "@/lib/api-auth";
import { CACHE_NONE } from "@/lib/cache-headers";

const TEMPLATES = "assessment_templates";
const SCORES = "assessment_scores";

function scoreDocId(
  year: string,
  semester: string,
  studentNumber: string,
  subjectCode: string,
  subAssessmentId: string
) {
  return `${year}_${semester}_${studentNumber}_${subjectCode}_${subAssessmentId}`;
}

/**
 * GET /api/teacher/assessment-scores
 *   ?classId=SECTION_DOC_ID
 *   &subjectCode=MTH
 *   &semester=S1
 *   &year=25-26
 *
 * Returns:
 *   { template, scores: Record<studentNumber, Record<subAssessmentId, { score, max_score }>> }
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
    return NextResponse.json(
      { error: "classId, subjectCode, semester, and year are required" },
      { status: 400 }
    );
  }

  try {
    // 1. Resolve section doc → class_code + section_code
    const secDoc = await adminDb.collection("sections").doc(classId).get();
    if (!secDoc.exists) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }
    const secData = secDoc.data()!;
    const classCode = String(secData.Class_Code || "");
    const sectionCode = String(secData.Section_Code || "");

    // 2. Fetch the template
    const templateId = `${year}_${classCode}_${subjectCode}_${semester}`;
    const templateDoc = await adminDb.collection(TEMPLATES).doc(templateId).get();
    if (!templateDoc.exists) {
      return NextResponse.json(
        { template: null, scores: {}, message: "No assessment template configured for this class/subject/semester" },
        { headers: CACHE_NONE }
      );
    }
    const template = { id: templateDoc.id, ...templateDoc.data() };

    // 3. Fetch all scores for this class/section/subject/semester
    const scoresSnap = await adminDb
      .collection(SCORES)
      .where("academic_year", "==", year)
      .where("semester", "==", semester)
      .where("class_code", "==", classCode)
      .where("section_code", "==", sectionCode)
      .where("subject_code", "==", subjectCode)
      .get();

    // Group by student_number → sub_assessment_id
    const scores: Record<string, Record<string, { score: number; max_score: number }>> = {};
    for (const doc of scoresSnap.docs) {
      const d = doc.data();
      const sn = d.student_number;
      if (!scores[sn]) scores[sn] = {};
      scores[sn][d.sub_assessment_id] = {
        score: d.score,
        max_score: d.max_score,
      };
    }

    return NextResponse.json({ template, scores }, { headers: CACHE_NONE });
  } catch (err) {
    console.error("Assessment scores GET error:", err);
    return NextResponse.json({ error: "Failed to fetch scores" }, { status: 500 });
  }
}

/**
 * POST /api/teacher/assessment-scores
 * Body: {
 *   classId: string,        // section doc ID
 *   subjectCode: string,
 *   semester: "S1" | "S2",
 *   year: string,
 *   scores: Array<{
 *     student_number: string,
 *     sub_assessment_id: string,
 *     category_id: string,
 *     score: number,
 *     max_score: number
 *   }>,
 *   recorded_by: string     // teacher email/username
 * }
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuthOrPortalSession(req, "teacher");
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { classId, subjectCode, semester, year, scores, recorded_by } = body;

    if (!classId || !subjectCode || !semester || !year || !scores) {
      return NextResponse.json(
        { error: "classId, subjectCode, semester, year, and scores are required" },
        { status: 400 }
      );
    }

    // 1. Resolve section doc → class_code + section_code
    const secDoc = await adminDb.collection("sections").doc(classId).get();
    if (!secDoc.exists) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }
    const secData = secDoc.data()!;
    const classCode = String(secData.Class_Code || "");
    const sectionCode = String(secData.Section_Code || "");

    // 2. Verify template exists
    const templateId = `${year}_${classCode}_${subjectCode}_${semester}`;
    const templateDoc = await adminDb.collection(TEMPLATES).doc(templateId).get();
    if (!templateDoc.exists) {
      return NextResponse.json({ error: "No assessment template found" }, { status: 404 });
    }

    // Build a lookup of valid sub-assessment IDs → max_score for validation
    const templateData = templateDoc.data()!;
    const validSubs = new Map<string, number>();
    for (const cat of templateData.categories || []) {
      for (const sa of cat.sub_assessments || []) {
        validSubs.set(sa.id, sa.max_score);
      }
    }

    // 3. Validate and batch write scores
    const now = new Date().toISOString();
    const BATCH_LIMIT = 450; // Firestore batch max is 500, leave headroom

    const validScores: Array<{
      student_number: string;
      sub_assessment_id: string;
      category_id: string;
      score: number;
      max_score: number;
    }> = [];

    for (const s of scores) {
      if (!s.student_number || !s.sub_assessment_id) continue;

      const templateMax = validSubs.get(s.sub_assessment_id);
      if (templateMax === undefined) {
        return NextResponse.json(
          { error: `Invalid sub-assessment ID: ${s.sub_assessment_id}` },
          { status: 400 }
        );
      }

      const score = Number(s.score);
      if (isNaN(score) || score < 0) {
        return NextResponse.json(
          { error: `Invalid score for student ${s.student_number}: ${s.score}` },
          { status: 400 }
        );
      }
      if (score > templateMax) {
        return NextResponse.json(
          { error: `Score ${score} exceeds max ${templateMax} for ${s.sub_assessment_id}` },
          { status: 400 }
        );
      }

      validScores.push({
        student_number: s.student_number,
        sub_assessment_id: s.sub_assessment_id,
        category_id: s.category_id,
        score,
        max_score: templateMax, // snapshot from template
      });
    }

    // Write in batches
    for (let i = 0; i < validScores.length; i += BATCH_LIMIT) {
      const chunk = validScores.slice(i, i + BATCH_LIMIT);
      const batch = adminDb.batch();

      for (const s of chunk) {
        const docId = scoreDocId(year, semester, s.student_number, subjectCode, s.sub_assessment_id);
        const ref = adminDb.collection(SCORES).doc(docId);
        batch.set(
          ref,
          {
            academic_year: year,
            semester,
            student_number: s.student_number,
            subject_code: subjectCode,
            class_code: classCode,
            section_code: sectionCode,
            category_id: s.category_id,
            sub_assessment_id: s.sub_assessment_id,
            score: s.score,
            max_score: s.max_score,
            recorded_by: recorded_by || "",
            recorded_at: now,
            updated_at: now,
          },
          { merge: true }
        );
      }

      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      count: validScores.length,
    });
  } catch (err) {
    console.error("Assessment scores POST error:", err);
    return NextResponse.json({ error: "Failed to save scores" }, { status: 500 });
  }
}
