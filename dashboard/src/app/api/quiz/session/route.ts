import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_NONE } from "@/lib/cache-headers";

const RAPID_GUESS_THRESHOLD_MS = 3000;
const RAPID_GUESS_STREAK = 3;

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "start") {
      const { assignmentId, studentNumber, studentName } = body;
      if (!assignmentId || !studentNumber) {
        return NextResponse.json({ error: "assignmentId and studentNumber required" }, { status: 400 });
      }

      const { data: assignRow } = await supabase.from("quiz_assignments").select("*").eq("id", assignmentId).maybeSingle();
      if (!assignRow) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });

      const assignment = assignRow as Record<string, unknown>;
      if (assignment.status !== "active") return NextResponse.json({ error: "Assignment is not active" }, { status: 400 });

      // Check for existing active/paused session
      const { data: existingSessions } = await supabase
        .from("quiz_sessions")
        .select("*")
        .eq("assignment_id", assignmentId)
        .eq("student_number", String(studentNumber))
        .in("status", ["active", "paused"])
        .limit(1);

      if (existingSessions && existingSessions.length > 0) {
        const existing = existingSessions[0] as Record<string, unknown>;
        return NextResponse.json({ sessionId: existing.id, resumed: true, ...getSessionSummary(existing) }, { headers: CACHE_NONE });
      }

      // Check if already completed
      const { data: completedSessions } = await supabase
        .from("quiz_sessions")
        .select("id")
        .eq("assignment_id", assignmentId)
        .eq("student_number", String(studentNumber))
        .eq("status", "completed")
        .limit(1);

      if (completedSessions && completedSessions.length > 0) {
        return NextResponse.json({ error: "Quiz already completed", alreadyCompleted: true }, { status: 409 });
      }

      // Fetch all questions
      const questionIds = (assignment.question_ids as string[]) || [];
      const { data: qRows } = await supabase.from("quiz_questions").select("*").in("id", questionIds);
      const questions = (qRows ?? []) as Record<string, unknown>[];

      if (questions.length === 0) return NextResponse.json({ error: "No questions available" }, { status: 400 });

      const pool: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
      for (const q of questions) {
        const d = Math.max(1, Math.min(5, (q.difficulty as number) || 3));
        pool[d].push(q.id as string);
      }

      const now = new Date().toISOString();
      const { data: sessionRow } = await supabase.from("quiz_sessions").insert({
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
        answered: [],
        answered_ids: [],
        score: 0,
        correct_count: 0,
        wrong_count: 0,
        rapid_guess_count: 0,
        consecutive_fast: 0,
        duration_limit: (assignment.duration_minutes as number) || 0,
        started_at: now,
        updated_at: now,
      }).select("id").single();

      // Update assignment stats.started
      const stats = (assignment.stats as Record<string, number>) || {};
      await supabase.from("quiz_assignments").update({
        stats: { ...stats, started: (stats.started || 0) + 1 },
        updated_at: now,
      }).eq("id", assignmentId);

      return NextResponse.json({
        sessionId: (sessionRow as Record<string, unknown>).id,
        totalQuestions: questions.length,
        subject: assignment.subject,
        title: assignment.title,
        adaptive: assignment.adaptive ?? true,
        durationLimit: assignment.duration_minutes || 0,
      }, { headers: CACHE_NONE });
    }

    if (action === "next") {
      const { sessionId } = body;
      if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

      const { data: sessionRow } = await supabase.from("quiz_sessions").select("*").eq("id", sessionId).maybeSingle();
      if (!sessionRow) return NextResponse.json({ error: "Session not found" }, { status: 404 });

      const session = sessionRow as Record<string, unknown>;
      if (session.status !== "active") return NextResponse.json({ error: "Session is not active", status: session.status }, { status: 400 });

      const answeredIds = (session.answered_ids as string[]) || [];
      if (answeredIds.length >= (session.total_questions as number)) {
        const result = await finishSession(supabase, sessionId, session);
        return NextResponse.json({ finished: true, ...result }, { headers: CACHE_NONE });
      }

      const targetDifficulty = (session.current_difficulty as number) || 3;
      const pool = (session.question_pool as Record<number, string[]>) || {};
      let nextQuestionId: string | null = null;

      if (session.adaptive) {
        for (let spread = 0; spread <= 4; spread++) {
          for (const delta of [0, 1, -1, 2, -2]) {
            const d = targetDifficulty + (spread === 0 ? 0 : delta);
            if (d < 1 || d > 5) continue;
            const candidates = (pool[d] || []).filter((id: string) => !answeredIds.includes(id));
            if (candidates.length > 0) {
              nextQuestionId = candidates[Math.floor(Math.random() * candidates.length)];
              break;
            }
          }
          if (nextQuestionId) break;
        }
      } else {
        const allIds = Object.values(pool).flat() as string[];
        nextQuestionId = allIds.find((id: string) => !answeredIds.includes(id)) || null;
      }

      if (!nextQuestionId) {
        const result = await finishSession(supabase, sessionId, session);
        return NextResponse.json({ finished: true, ...result }, { headers: CACHE_NONE });
      }

      const { data: qRow } = await supabase.from("quiz_questions").select("id,text,text_ar,type,difficulty,options").eq("id", nextQuestionId).maybeSingle();
      if (!qRow) return NextResponse.json({ error: "Question not found" }, { status: 500 });

      const q = qRow as Record<string, unknown>;
      return NextResponse.json({
        question: {
          id: q.id,
          text: q.text,
          text_ar: q.text_ar || "",
          type: q.type,
          difficulty: q.difficulty,
          options: ((q.options as {label:string;text:string;text_ar?:string}[]) || []).map((o) => ({
            label: o.label, text: o.text, text_ar: o.text_ar || "",
          })),
        },
        questionNumber: answeredIds.length + 1,
        totalQuestions: session.total_questions,
        currentDifficulty: targetDifficulty,
      }, { headers: CACHE_NONE });
    }

    if (action === "answer") {
      const { sessionId, questionId, selectedOption, timeSpent } = body;
      if (!sessionId || !questionId || selectedOption == null) {
        return NextResponse.json({ error: "sessionId, questionId, and selectedOption required" }, { status: 400 });
      }

      const { data: sessionRow } = await supabase.from("quiz_sessions").select("*").eq("id", sessionId).maybeSingle();
      if (!sessionRow) return NextResponse.json({ error: "Session not found" }, { status: 404 });

      const session = sessionRow as Record<string, unknown>;
      if (session.status !== "active") return NextResponse.json({ error: "Session is not active" }, { status: 400 });

      const answeredIds = (session.answered_ids as string[]) || [];
      if (answeredIds.includes(questionId)) return NextResponse.json({ error: "Question already answered" }, { status: 409 });

      const { data: qRow } = await supabase.from("quiz_questions").select("correct_option,difficulty,explanation").eq("id", questionId).maybeSingle();
      if (!qRow) return NextResponse.json({ error: "Question not found" }, { status: 404 });

      const q = qRow as Record<string, unknown>;
      let correctIdx: number | null = q.correct_option as number | null;
      if (typeof correctIdx === "string" && /^[A-Da-d]$/.test(correctIdx)) {
        correctIdx = (correctIdx as string).toUpperCase().charCodeAt(0) - 65;
      }
      const isCorrect = selectedOption === correctIdx;
      const timeTaken = Math.max(0, timeSpent || 0);

      const isFast = timeTaken < RAPID_GUESS_THRESHOLD_MS;
      const consecutiveFast = isFast ? ((session.consecutive_fast as number) || 0) + 1 : 0;
      const rapidGuessing = consecutiveFast >= RAPID_GUESS_STREAK;

      let newDifficulty = (session.current_difficulty as number) || 3;
      if (session.adaptive) {
        if (isCorrect) newDifficulty = Math.min(5, newDifficulty + 1);
        else newDifficulty = Math.max(1, newDifficulty - 1);
      }

      const answerRecord = { questionId, selectedOption, isCorrect, timeSpent: timeTaken, difficulty: q.difficulty, timestamp: new Date().toISOString() };
      const newAnsweredIds = [...answeredIds, questionId];
      const answered = [...((session.answered as Record<string, unknown>[]) || []), answerRecord];
      const correctCount = ((session.correct_count as number) || 0) + (isCorrect ? 1 : 0);
      const wrongCount = ((session.wrong_count as number) || 0) + (isCorrect ? 0 : 1);

      await supabase.from("quiz_sessions").update({
        current_difficulty: newDifficulty,
        current_question_index: newAnsweredIds.length,
        answered_ids: newAnsweredIds,
        answered,
        correct_count: correctCount,
        wrong_count: wrongCount,
        score: Math.round((correctCount / newAnsweredIds.length) * 100),
        consecutive_fast: consecutiveFast,
        rapid_guess_count: ((session.rapid_guess_count as number) || 0) + (isFast ? 1 : 0),
        updated_at: new Date().toISOString(),
      }).eq("id", sessionId);

      const isFinished = newAnsweredIds.length >= (session.total_questions as number);

      return NextResponse.json({
        isCorrect,
        explanation: q.explanation || "",
        correctOption: correctIdx,
        score: Math.round((correctCount / newAnsweredIds.length) * 100),
        answeredCount: newAnsweredIds.length,
        totalQuestions: session.total_questions,
        newDifficulty,
        rapidGuessing,
        finished: isFinished,
      }, { headers: CACHE_NONE });
    }

    if (action === "pause") {
      const { sessionId } = body;
      if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
      await supabase.from("quiz_sessions").update({ status: "paused", paused_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", sessionId);
      return NextResponse.json({ success: true }, { headers: CACHE_NONE });
    }

    if (action === "resume") {
      const { sessionId } = body;
      if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
      await supabase.from("quiz_sessions").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", sessionId);
      return NextResponse.json({ success: true }, { headers: CACHE_NONE });
    }

    if (action === "finish") {
      const { sessionId } = body;
      if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
      const { data: sessionRow } = await supabase.from("quiz_sessions").select("*").eq("id", sessionId).maybeSingle();
      if (!sessionRow) return NextResponse.json({ error: "Session not found" }, { status: 404 });
      const session = sessionRow as Record<string, unknown>;
      if (session.status === "completed") return NextResponse.json({ error: "Session already completed" }, { status: 400 });
      const result = await finishSession(supabase, sessionId, session);
      return NextResponse.json(result, { headers: CACHE_NONE });
    }

    if (action === "status") {
      const { sessionId } = body;
      if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
      const { data: sessionRow } = await supabase.from("quiz_sessions").select("*").eq("id", sessionId).maybeSingle();
      if (!sessionRow) return NextResponse.json({ error: "Session not found" }, { status: 404 });
      return NextResponse.json(getSessionSummary(sessionRow as Record<string, unknown>), { headers: CACHE_NONE });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("Quiz session POST error:", err);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}

function getSessionSummary(session: Record<string, unknown>) {
  return {
    status: session.status,
    answeredCount: ((session.answered_ids as string[]) || []).length,
    totalQuestions: session.total_questions,
    score: session.score || 0,
    currentDifficulty: session.current_difficulty || 3,
    correctCount: session.correct_count || 0,
    wrongCount: session.wrong_count || 0,
    adaptive: session.adaptive,
    subject: session.subject,
  };
}

async function finishSession(supabase: ReturnType<typeof import("@/lib/supabase-server").createServiceClient>, sessionId: string, session: Record<string, unknown>) {
  const answered = (session.answered as Record<string, unknown>[]) || [];
  const correctCount = (session.correct_count as number) || 0;
  const totalAnswered = answered.length;
  const score = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;

  const difficultyBreakdown: Record<number, { correct: number; total: number }> = {};
  for (const a of answered) {
    const d = (a.difficulty as number) || 3;
    if (!difficultyBreakdown[d]) difficultyBreakdown[d] = { correct: 0, total: 0 };
    difficultyBreakdown[d].total++;
    if (a.isCorrect) difficultyBreakdown[d].correct++;
  }

  const totalTime = answered.reduce((sum: number, a) => sum + ((a.timeSpent as number) || 0), 0);
  const avgTime = totalAnswered > 0 ? Math.round(totalTime / totalAnswered) : 0;

  let mastery: string;
  if (score >= 90) mastery = "excellent";
  else if (score >= 75) mastery = "proficient";
  else if (score >= 60) mastery = "developing";
  else mastery = "needs_improvement";

  let estimatedAbility = 1;
  for (let d = 5; d >= 1; d--) {
    const band = difficultyBreakdown[d];
    if (band && band.correct > 0) { estimatedAbility = d; break; }
  }

  const now = new Date().toISOString();
  await supabase.from("quiz_sessions").update({
    status: "completed", score, mastery, estimated_ability: estimatedAbility,
    difficulty_breakdown: difficultyBreakdown, avg_time_per_question: avgTime,
    total_time: totalTime, completed_at: now, updated_at: now,
  }).eq("id", sessionId);

  // Update assignment stats
  const { data: assignRow } = await supabase.from("quiz_assignments").select("stats").eq("id", session.assignment_id as string).maybeSingle();
  if (assignRow) {
    const stats = ((assignRow as Record<string, unknown>).stats as Record<string, number>) || {};
    const completedCount = (stats.completed || 0) + 1;
    const newAvg = Math.round(((stats.avg_score || 0) * (stats.completed || 0) + score) / completedCount);
    await supabase.from("quiz_assignments").update({
      stats: { ...stats, completed: completedCount, avg_score: newAvg },
      updated_at: now,
    }).eq("id", session.assignment_id as string);
  }

  // Upsert result
  await supabase.from("quiz_results").upsert({
    id: `${session.assignment_id}_${session.student_number}`,
    assignment_id: session.assignment_id,
    student_number: session.student_number,
    student_name: session.student_name,
    subject: session.subject,
    class_code: session.class_code,
    year: session.year,
    score, mastery, estimated_ability: estimatedAbility,
    correct_count: correctCount,
    total_questions: totalAnswered,
    difficulty_breakdown: difficultyBreakdown,
    avg_time_per_question: avgTime,
    total_time: totalTime,
    rapid_guess_count: (session.rapid_guess_count as number) || 0,
    completed_at: now,
  });

  return {
    score, mastery, estimatedAbility, correctCount, totalQuestions: totalAnswered,
    difficultyBreakdown, avgTimePerQuestion: avgTime, totalTime,
    rapidGuessCount: (session.rapid_guess_count as number) || 0,
  };
}