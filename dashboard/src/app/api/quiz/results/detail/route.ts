import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_SHORT } from "@/lib/cache-headers";

/**
 * GET /api/quiz/results/detail?assignment=ID&student=NUMBER
 *
 * Returns the question-by-question breakdown for a specific student's quiz session.
 * Each item includes the question text, options, what the student chose, and the correct answer.
 */
export async function GET(req: NextRequest) {
  const assignmentId = req.nextUrl.searchParams.get("assignment");
  const studentNumber = req.nextUrl.searchParams.get("student");

  if (!assignmentId || !studentNumber) {
    return NextResponse.json(
      { error: "assignment and student parameters required" },
      { status: 400 }
    );
  }

  try {
    // Find the session for this assignment + student
    const sessSnap = await adminDb
      .collection("quiz_sessions")
      .where("assignment_id", "==", assignmentId)
      .where("student_number", "==", studentNumber)
      .limit(1)
      .get();

    if (sessSnap.empty) {
      return NextResponse.json(
        { error: "No session found for this student and assignment" },
        { status: 404 }
      );
    }

    const session = sessSnap.docs[0].data();
    const answered: any[] = session.answered || [];

    if (answered.length === 0) {
      return NextResponse.json({ questions: [] }, { headers: CACHE_SHORT });
    }

    // Fetch all question documents in parallel (batch by 30 for Firestore "in" limit)
    const questionIds = answered.map((a: any) => a.questionId);
    const questionMap: Record<string, any> = {};

    for (let i = 0; i < questionIds.length; i += 30) {
      const chunk = questionIds.slice(i, i + 30);
      const qSnap = await adminDb
        .collection("quiz_questions")
        .where("__name__", "in", chunk)
        .get();
      qSnap.docs.forEach((d) => {
        questionMap[d.id] = d.data();
      });
    }

    // Normalize correct_option (could be letter "A" or index 0)
    function toIndex(val: any): number | null {
      if (val == null) return null;
      if (typeof val === "number") return val;
      if (typeof val === "string" && /^[A-Da-d]$/.test(val)) {
        return val.toUpperCase().charCodeAt(0) - 65; // A→0, B→1, C→2, D→3
      }
      const n = Number(val);
      return isNaN(n) ? null : n;
    }

    // Build the response array
    const questions = answered.map((a: any, idx: number) => {
      const q = questionMap[a.questionId];
      if (!q) {
        return {
          number: idx + 1,
          questionId: a.questionId,
          text: "(Question deleted)",
          options: [],
          selectedOption: a.selectedOption,
          correctOption: null,
          isCorrect: a.isCorrect,
          difficulty: a.difficulty,
          timeSpent: a.timeSpent,
        };
      }

      const correctIdx = toIndex(q.correct_option);
      // Recompute isCorrect — stored value may be wrong due to earlier letter-vs-index bug
      const isCorrect = correctIdx != null && a.selectedOption === correctIdx;

      return {
        number: idx + 1,
        questionId: a.questionId,
        text: q.text || "",
        text_ar: q.text_ar || "",
        options: (q.options || []).map((o: any) => ({
          label: o.label,
          text: o.text,
          text_ar: o.text_ar || "",
        })),
        selectedOption: a.selectedOption,
        correctOption: correctIdx,
        isCorrect,
        difficulty: a.difficulty,
        timeSpent: a.timeSpent,
      };
    });

    return NextResponse.json({ questions }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Quiz results detail error:", err);
    return NextResponse.json(
      { error: "Failed to fetch result details" },
      { status: 500 }
    );
  }
}
