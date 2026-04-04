import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { CACHE_NONE } from "@/lib/cache-headers";

/**
 * Quiz Session API — Adaptive quiz-taking engine
 *
 * POST /api/quiz/session
 *   { action: "start",  assignmentId, studentNumber, studentName }
 *   { action: "next",   sessionId }
 *   { action: "answer", sessionId, questionId, selectedOption, timeSpent }
 *   { action: "pause",  sessionId }
 *   { action: "resume", sessionId }
 *   { action: "finish", sessionId }
 *   { action: "status", sessionId }
 *
 * Adaptive Algorithm (5-level difficulty ladder):
 * - Start at difficulty 3 (medium)
 * - Correct answer → next question difficulty +1 (max 5)
 * - Wrong answer   → next question difficulty -1 (min 1)
 * - Server never sends correct_option to client
 *
 * Rapid Guessing Detection:
 * - Tracks consecutive fast answers (< 3 seconds)
 * - Returns `rapidGuessing: true` when 3+ consecutive fast answers detected
 */

const RAPID_GUESS_THRESHOLD_MS = 3000; // 3 seconds
const RAPID_GUESS_STREAK = 3;
const SESSION_TIMEOUT_MINUTES = 60; // auto-expire after 1 hour

// ── POST ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // ── Start a new quiz session ──
    if (action === "start") {
      const { assignmentId, studentNumber, studentName } = body;
      if (!assignmentId || !studentNumber) {
        return NextResponse.json(
          { error: "assignmentId and studentNumber required" },
          { status: 400 }
        );
      }

      // Fetch the assignment
      const assignDoc = await adminDb.collection("quiz_assignments").doc(assignmentId).get();
      if (!assignDoc.exists) {
        return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
      }

      const assignment = assignDoc.data()!;
      if (assignment.status !== "active") {
        return NextResponse.json({ error: "Assignment is not active" }, { status: 400 });
      }

      // Check if student already has an active session for this assignment
      const existingSnap = await adminDb
        .collection("quiz_sessions")
        .where("assignment_id", "==", assignmentId)
        .where("student_number", "==", String(studentNumber))
        .where("status", "in", ["active", "paused"])
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        // Resume existing session
        const existing = existingSnap.docs[0];
        return NextResponse.json({
          sessionId: existing.id,
          resumed: true,
          ...getSessionSummary(existing.data()),
        }, { headers: CACHE_NONE });
      }

      // Check if already completed
      const completedSnap = await adminDb
        .collection("quiz_sessions")
        .where("assignment_id", "==", assignmentId)
        .where("student_number", "==", String(studentNumber))
        .where("status", "==", "completed")
        .limit(1)
        .get();

      if (!completedSnap.empty) {
        return NextResponse.json(
          { error: "Quiz already completed", alreadyCompleted: true },
          { status: 409 }
        );
      }

      // Fetch all questions for this assignment
      const questionIds = assignment.question_ids as string[];
      const questionRefs = questionIds.map((id) =>
        adminDb.collection("quiz_questions").doc(id)
      );
      const questionDocs = await adminDb.getAll(...questionRefs);

      const questions: any[] = [];
      for (const qDoc of questionDocs) {
        if (!qDoc.exists) continue;
        questions.push({ id: qDoc.id, ...qDoc.data() });
      }

      if (questions.length === 0) {
        return NextResponse.json({ error: "No questions available" }, { status: 400 });
      }

      // Build the question pool indexed by difficulty
      const pool: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
      for (const q of questions) {
        const d = Math.max(1, Math.min(5, q.difficulty || 3));
        pool[d].push(q.id);
      }

      // Create session
      const sessionRef = adminDb.collection("quiz_sessions").doc();
      const sessionData = {
        assignment_id: assignmentId,
        student_number: String(studentNumber),
        student_name: studentName || "",
        subject: assignment.subject,
        class_code: assignment.class_code,
        year: assignment.year,
        adaptive: assignment.adaptive ?? true,
        status: "active",
        current_difficulty: 3,
        current_question_index: 0,
        total_questions: questions.length,
        question_pool: pool,
        answered: [] as any[],
        answered_ids: [] as string[],
        score: 0,
        correct_count: 0,
        wrong_count: 0,
        rapid_guess_count: 0,
        consecutive_fast: 0,
        started_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
        duration_limit: assignment.duration_minutes || 0,
      };

      await sessionRef.set(sessionData);

      // Update assignment stats
      await assignDoc.ref.update({
        "stats.started": FieldValue.increment(1),
      });

      return NextResponse.json({
        sessionId: sessionRef.id,
        totalQuestions: questions.length,
        subject: assignment.subject,
        title: assignment.title,
        adaptive: assignment.adaptive ?? true,
        durationLimit: assignment.duration_minutes || 0,
      }, { headers: CACHE_NONE });
    }

    // ── Get next question ──
    if (action === "next") {
      const { sessionId } = body;
      if (!sessionId) {
        return NextResponse.json({ error: "sessionId required" }, { status: 400 });
      }

      const sessionDoc = await adminDb.collection("quiz_sessions").doc(sessionId).get();
      if (!sessionDoc.exists) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }

      const session = sessionDoc.data()!;
      if (session.status !== "active") {
        return NextResponse.json({ error: "Session is not active", status: session.status }, { status: 400 });
      }

      // Check if all questions answered
      const answeredIds = session.answered_ids || [];
      if (answeredIds.length >= session.total_questions) {
        const result = await finishSession(sessionDoc.ref, session);
        return NextResponse.json({ finished: true, ...result }, { headers: CACHE_NONE });
      }

      // Select next question based on adaptive difficulty
      const targetDifficulty = session.current_difficulty || 3;
      const pool = session.question_pool || {};
      let nextQuestionId: string | null = null;

      if (session.adaptive) {
        // Try target difficulty first, then expand ±1, ±2, etc.
        for (let spread = 0; spread <= 4; spread++) {
          for (const delta of [0, 1, -1, 2, -2]) {
            const d = targetDifficulty + (spread === 0 ? 0 : delta);
            if (d < 1 || d > 5) continue;
            const candidates = (pool[d] || []).filter((id: string) => !answeredIds.includes(id));
            if (candidates.length > 0) {
              // Random selection from candidates for variety
              nextQuestionId = candidates[Math.floor(Math.random() * candidates.length)];
              break;
            }
          }
          if (nextQuestionId) break;
        }
      } else {
        // Non-adaptive: sequential order through all pool questions
        const allIds = Object.values(pool).flat() as string[];
        nextQuestionId = allIds.find((id: string) => !answeredIds.includes(id)) || null;
      }

      if (!nextQuestionId) {
        const result = await finishSession(sessionDoc.ref, session);
        return NextResponse.json({ finished: true, ...result }, { headers: CACHE_NONE });
      }

      // Fetch the question (WITHOUT correct_option)
      const questionDoc = await adminDb.collection("quiz_questions").doc(nextQuestionId).get();
      if (!questionDoc.exists) {
        return NextResponse.json({ error: "Question not found" }, { status: 500 });
      }

      const qData = questionDoc.data()!;

      return NextResponse.json({
        question: {
          id: questionDoc.id,
          text: qData.text,
          text_ar: qData.text_ar || "",
          type: qData.type,
          difficulty: qData.difficulty,
          options: (qData.options || []).map((o: any) => ({
            label: o.label,
            text: o.text,
            text_ar: o.text_ar || "",
          })),
          // correct_option is NEVER sent to client
        },
        questionNumber: answeredIds.length + 1,
        totalQuestions: session.total_questions,
        currentDifficulty: targetDifficulty,
      }, { headers: CACHE_NONE });
    }

    // ── Submit an answer ──
    if (action === "answer") {
      const { sessionId, questionId, selectedOption, timeSpent } = body;
      if (!sessionId || !questionId || selectedOption == null) {
        return NextResponse.json(
          { error: "sessionId, questionId, and selectedOption required" },
          { status: 400 }
        );
      }

      const sessionDoc = await adminDb.collection("quiz_sessions").doc(sessionId).get();
      if (!sessionDoc.exists) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }

      const session = sessionDoc.data()!;
      if (session.status !== "active") {
        return NextResponse.json({ error: "Session is not active" }, { status: 400 });
      }

      // Prevent duplicate answers
      if ((session.answered_ids || []).includes(questionId)) {
        return NextResponse.json({ error: "Question already answered" }, { status: 409 });
      }

      // Fetch the question (server-side) to check the correct answer
      const questionDoc = await adminDb.collection("quiz_questions").doc(questionId).get();
      if (!questionDoc.exists) {
        return NextResponse.json({ error: "Question not found" }, { status: 404 });
      }

      const qData = questionDoc.data()!;
      // Normalize correct_option: letter "A"→0, "B"→1 etc. or numeric index
      let correctIdx = qData.correct_option;
      if (typeof correctIdx === "string" && /^[A-Da-d]$/.test(correctIdx)) {
        correctIdx = correctIdx.toUpperCase().charCodeAt(0) - 65;
      }
      const isCorrect = selectedOption === correctIdx;
      const timeTaken = Math.max(0, timeSpent || 0);

      // Rapid guessing detection
      const isFast = timeTaken < RAPID_GUESS_THRESHOLD_MS;
      let consecutiveFast = isFast ? (session.consecutive_fast || 0) + 1 : 0;
      const rapidGuessing = consecutiveFast >= RAPID_GUESS_STREAK;

      // Adaptive difficulty adjustment
      let newDifficulty = session.current_difficulty || 3;
      if (session.adaptive) {
        if (isCorrect) {
          newDifficulty = Math.min(5, newDifficulty + 1);
        } else {
          newDifficulty = Math.max(1, newDifficulty - 1);
        }
      }

      // Build answer record
      const answerRecord = {
        questionId,
        selectedOption,
        isCorrect,
        timeSpent: timeTaken,
        difficulty: qData.difficulty,
        timestamp: new Date().toISOString(),
      };

      // Update session
      const answeredIds = [...(session.answered_ids || []), questionId];
      const answered = [...(session.answered || []), answerRecord];
      const correctCount = (session.correct_count || 0) + (isCorrect ? 1 : 0);
      const wrongCount = (session.wrong_count || 0) + (isCorrect ? 0 : 1);

      const updateData: any = {
        current_difficulty: newDifficulty,
        current_question_index: answeredIds.length,
        answered_ids: answeredIds,
        answered,
        correct_count: correctCount,
        wrong_count: wrongCount,
        score: Math.round((correctCount / answeredIds.length) * 100),
        consecutive_fast: consecutiveFast,
        rapid_guess_count: (session.rapid_guess_count || 0) + (isFast ? 1 : 0),
        updated_at: FieldValue.serverTimestamp(),
      };

      await sessionDoc.ref.update(updateData);

      const isFinished = answeredIds.length >= session.total_questions;

      return NextResponse.json({
        isCorrect,
        explanation: qData.explanation || "",
        correctOption: correctIdx, // reveal after answering (as numeric index)
        score: Math.round((correctCount / answeredIds.length) * 100),
        answeredCount: answeredIds.length,
        totalQuestions: session.total_questions,
        newDifficulty,
        rapidGuessing,
        finished: isFinished,
      }, { headers: CACHE_NONE });
    }

    // ── Pause session ──
    if (action === "pause") {
      const { sessionId } = body;
      if (!sessionId) {
        return NextResponse.json({ error: "sessionId required" }, { status: 400 });
      }

      await adminDb.collection("quiz_sessions").doc(sessionId).update({
        status: "paused",
        paused_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true }, { headers: CACHE_NONE });
    }

    // ── Resume session ──
    if (action === "resume") {
      const { sessionId } = body;
      if (!sessionId) {
        return NextResponse.json({ error: "sessionId required" }, { status: 400 });
      }

      await adminDb.collection("quiz_sessions").doc(sessionId).update({
        status: "active",
        updated_at: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true }, { headers: CACHE_NONE });
    }

    // ── Finish session (manual or auto) ──
    if (action === "finish") {
      const { sessionId } = body;
      if (!sessionId) {
        return NextResponse.json({ error: "sessionId required" }, { status: 400 });
      }

      const sessionDoc = await adminDb.collection("quiz_sessions").doc(sessionId).get();
      if (!sessionDoc.exists) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }

      const session = sessionDoc.data()!;
      if (session.status === "completed") {
        return NextResponse.json({ error: "Session already completed" }, { status: 400 });
      }

      const result = await finishSession(sessionDoc.ref, session);
      return NextResponse.json(result, { headers: CACHE_NONE });
    }

    // ── Get session status ──
    if (action === "status") {
      const { sessionId } = body;
      if (!sessionId) {
        return NextResponse.json({ error: "sessionId required" }, { status: 400 });
      }

      const sessionDoc = await adminDb.collection("quiz_sessions").doc(sessionId).get();
      if (!sessionDoc.exists) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }

      return NextResponse.json(getSessionSummary(sessionDoc.data()!), { headers: CACHE_NONE });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("Quiz session POST error:", err);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}

// ── Helpers ─────────────────────────────────────────────────────
function getSessionSummary(session: any) {
  return {
    status: session.status,
    answeredCount: (session.answered_ids || []).length,
    totalQuestions: session.total_questions,
    score: session.score || 0,
    currentDifficulty: session.current_difficulty || 3,
    correctCount: session.correct_count || 0,
    wrongCount: session.wrong_count || 0,
    adaptive: session.adaptive,
    subject: session.subject,
  };
}

/** Finalize a quiz session: compute score, save result, update assignment stats */
async function finishSession(sessionRef: FirebaseFirestore.DocumentReference, session: any) {
  const answered = session.answered || [];
  const correctCount = session.correct_count || 0;
  const totalAnswered = answered.length;
  const score = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;

  // Per-difficulty performance
  const difficultyBreakdown: Record<number, { correct: number; total: number }> = {};
  for (const a of answered) {
    const d = a.difficulty || 3;
    if (!difficultyBreakdown[d]) difficultyBreakdown[d] = { correct: 0, total: 0 };
    difficultyBreakdown[d].total++;
    if (a.isCorrect) difficultyBreakdown[d].correct++;
  }

  // Average time per question
  const totalTime = answered.reduce((sum: number, a: any) => sum + (a.timeSpent || 0), 0);
  const avgTime = totalAnswered > 0 ? Math.round(totalTime / totalAnswered) : 0;

  // Mastery level
  let mastery: string;
  if (score >= 90) mastery = "excellent";
  else if (score >= 75) mastery = "proficient";
  else if (score >= 60) mastery = "developing";
  else mastery = "needs_improvement";

  // Estimated ability (highest difficulty answered correctly)
  let estimatedAbility = 1;
  for (let d = 5; d >= 1; d--) {
    const breakdown = difficultyBreakdown[d];
    if (breakdown && breakdown.correct > 0) {
      estimatedAbility = d;
      break;
    }
  }

  // Update session
  await sessionRef.update({
    status: "completed",
    score,
    mastery,
    estimated_ability: estimatedAbility,
    difficulty_breakdown: difficultyBreakdown,
    avg_time_per_question: avgTime,
    total_time: totalTime,
    completed_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  // Update assignment stats
  const assignRef = adminDb.collection("quiz_assignments").doc(session.assignment_id);
  const assignDoc = await assignRef.get();
  if (assignDoc.exists) {
    const stats = assignDoc.data()!.stats || {};
    const completedCount = (stats.completed || 0) + 1;
    const oldTotal = (stats.avg_score || 0) * (stats.completed || 0);
    const newAvg = Math.round((oldTotal + score) / completedCount);

    await assignRef.update({
      "stats.completed": completedCount,
      "stats.avg_score": newAvg,
      updated_at: FieldValue.serverTimestamp(),
    });
  }

  // Save result to quiz_results for easy querying
  await adminDb.collection("quiz_results").doc(`${session.assignment_id}_${session.student_number}`).set({
    assignment_id: session.assignment_id,
    student_number: session.student_number,
    student_name: session.student_name,
    subject: session.subject,
    class_code: session.class_code,
    year: session.year,
    score,
    mastery,
    estimated_ability: estimatedAbility,
    correct_count: correctCount,
    total_questions: totalAnswered,
    difficulty_breakdown: difficultyBreakdown,
    avg_time_per_question: avgTime,
    total_time: totalTime,
    rapid_guess_count: session.rapid_guess_count || 0,
    completed_at: FieldValue.serverTimestamp(),
  });

  return {
    score,
    mastery,
    estimatedAbility,
    correctCount,
    totalQuestions: totalAnswered,
    difficultyBreakdown,
    avgTimePerQuestion: avgTime,
    totalTime,
    rapidGuessCount: session.rapid_guess_count || 0,
  };
}
