import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { CACHE_SHORT, CACHE_NONE } from "@/lib/cache-headers";

/**
 * Quiz Questions API
 *
 * GET  /api/quiz/questions
 *   ?subject=Math           → filter by subject
 *   ?difficulty=3           → filter by difficulty (1-5)
 *   ?class=G10              → filter by class
 *   ?createdBy=teacher_user → filter by author
 *   ?limit=50               → limit results
 *
 * POST /api/quiz/questions
 *   { action: "create", question: {...} }
 *   { action: "update", questionId, updates: {...} }
 *   { action: "delete", questionId }
 *   { action: "bulk_create", questions: [...] }
 */

interface QuizQuestion {
  text: string;
  text_ar?: string;
  type: "mcq";
  subject: string;
  class_code: string;
  difficulty: number; // 1-5
  options: { label: string; text: string; text_ar?: string }[];
  correct_option: string; // "A", "B", "C", "D"
  explanation?: string;
  standard?: string; // curriculum standard tag
  created_by: string;
  year: string;
}

// ── GET ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const subject = req.nextUrl.searchParams.get("subject");
  const difficulty = req.nextUrl.searchParams.get("difficulty");
  const classCode = req.nextUrl.searchParams.get("class");
  const createdBy = req.nextUrl.searchParams.get("createdBy");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "200"), 500);

  try {
    let query: FirebaseFirestore.Query = adminDb.collection("quiz_questions");

    if (subject) query = query.where("subject", "==", subject);
    if (difficulty) query = query.where("difficulty", "==", parseInt(difficulty));
    if (classCode) query = query.where("class_code", "==", classCode);
    if (createdBy) {
      // Support both username ("cezar.dagher") and email ("cezar.dagher@kis-riyadh.com")
      const variants = [createdBy];
      if (!createdBy.includes("@")) variants.push(`${createdBy}@kis-riyadh.com`);
      query = query.where("created_by", "in", variants);
    }

    query = query.limit(limit);

    const snap = await query.get();
    const questions = snap.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }))
      .sort((a: any, b: any) => {
        const ta = a.created_at?._seconds || 0;
        const tb = b.created_at?._seconds || 0;
        return tb - ta;
      });

    return NextResponse.json({ questions, total: questions.length }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Quiz questions GET error:", err);
    return NextResponse.json({ error: "Failed to fetch questions" }, { status: 500 });
  }
}

// ── POST ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // ── Create single question ──
    if (action === "create") {
      const q = body.question as QuizQuestion;
      if (!q.text || !q.subject || !q.class_code || !q.correct_option || !q.options?.length) {
        return NextResponse.json(
          { error: "text, subject, class_code, options, and correct_option required" },
          { status: 400 }
        );
      }

      if (q.difficulty < 1 || q.difficulty > 5) {
        return NextResponse.json({ error: "difficulty must be 1-5" }, { status: 400 });
      }

      const ref = adminDb.collection("quiz_questions").doc();
      await ref.set({
        ...q,
        type: "mcq",
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true, questionId: ref.id }, { headers: CACHE_NONE });
    }

    // ── Bulk create ──
    if (action === "bulk_create") {
      const questions = body.questions as QuizQuestion[];
      if (!questions?.length) {
        return NextResponse.json({ error: "questions array required" }, { status: 400 });
      }

      const batch = adminDb.batch();
      const ids: string[] = [];

      for (const q of questions) {
        if (!q.text || !q.subject || !q.class_code || !q.correct_option || !q.options?.length) continue;
        const ref = adminDb.collection("quiz_questions").doc();
        batch.set(ref, {
          ...q,
          type: "mcq",
          difficulty: Math.max(1, Math.min(5, q.difficulty || 3)),
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
        ids.push(ref.id);
      }

      await batch.commit();
      return NextResponse.json({ success: true, count: ids.length, ids }, { headers: CACHE_NONE });
    }

    // ── Update ──
    if (action === "update") {
      const { questionId, updates } = body;
      if (!questionId) {
        return NextResponse.json({ error: "questionId required" }, { status: 400 });
      }

      // Prevent tampering with system fields
      const { created_at, ...safeUpdates } = updates;
      await adminDb.collection("quiz_questions").doc(questionId).update({
        ...safeUpdates,
        updated_at: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true }, { headers: CACHE_NONE });
    }

    // ── Delete ──
    if (action === "delete") {
      const { questionId } = body;
      if (!questionId) {
        return NextResponse.json({ error: "questionId required" }, { status: 400 });
      }

      // Check if question is used in any active assignment
      const usedSnap = await adminDb
        .collection("quiz_assignments")
        .where("question_ids", "array-contains", questionId)
        .where("status", "==", "active")
        .limit(1)
        .get();

      if (!usedSnap.empty) {
        return NextResponse.json(
          { error: "Cannot delete: question is used in an active quiz assignment" },
          { status: 409 }
        );
      }

      await adminDb.collection("quiz_questions").doc(questionId).delete();
      return NextResponse.json({ success: true }, { headers: CACHE_NONE });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("Quiz questions POST error:", err);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
