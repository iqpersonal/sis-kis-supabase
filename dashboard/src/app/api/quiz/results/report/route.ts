import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT } from "@/lib/cache-headers";

function toIndex(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number") return val;
  if (typeof val === "string" && /^[A-Da-d]$/.test(val)) {
    return val.toUpperCase().charCodeAt(0) - 65;
  }
  const n = Number(val);
  return isNaN(n) ? null : n;
}

const STRAND_MAP: Record<string, string> = {
  RL: "Reading: Literature", RI: "Reading: Informational Text", RF: "Reading: Foundational Skills",
  W: "Writing", SL: "Speaking & Listening", L: "Language",
  OA: "Operations & Algebraic Thinking", NBT: "Number & Operations in Base Ten",
  NF: "Number & Operations — Fractions", MD: "Measurement & Data", G: "Geometry",
  RP: "Ratios & Proportional Relationships", NS: "The Number System",
  EE: "Expressions & Equations", SP: "Statistics & Probability", F: "Functions",
};

function getStrand(standard: string): { code: string; name: string } {
  if (!standard) return { code: "Other", name: "Other" };
  const match = standard.match(/^([A-Z]+)/);
  const code = match ? match[1] : "Other";
  return { code, name: STRAND_MAP[code] || code };
}

function getAchievementLevel(pct: number) {
  if (pct >= 90) return { level: "high", label: "High", color: "#16a34a", description: "Exceeds grade-level expectations" };
  if (pct >= 75) return { level: "high_avg", label: "High Average", color: "#65a30d", description: "Meets grade-level expectations" };
  if (pct >= 60) return { level: "avg", label: "Average", color: "#ca8a04", description: "Approaching grade-level expectations" };
  if (pct >= 40) return { level: "low_avg", label: "Low Average", color: "#ea580c", description: "Below grade-level expectations" };
  return { level: "low", label: "Low", color: "#dc2626", description: "Well below grade-level expectations" };
}

function getDifficultyLabel(d: number): string {
  switch (d) {
    case 1: return "Below Grade Level";
    case 2: return "Approaching Grade Level";
    case 3: return "At Grade Level";
    case 4: return "Above Grade Level";
    case 5: return "Advanced";
    default: return `Level ${d}`;
  }
}

export async function GET(req: NextRequest) {
  const assignmentId = req.nextUrl.searchParams.get("assignment");
  const studentNumber = req.nextUrl.searchParams.get("student");

  if (!assignmentId || !studentNumber) {
    return NextResponse.json({ error: "assignment and student parameters required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  try {
    // 1. Fetch session
    const { data: sessionRows } = await supabase
      .from("quiz_sessions")
      .select("*")
      .eq("assignment_id", assignmentId)
      .eq("student_number", studentNumber)
      .limit(1);

    if (!sessionRows || sessionRows.length === 0) {
      return NextResponse.json({ error: "No session found" }, { status: 404 });
    }

    const session = sessionRows[0] as Record<string, unknown>;
    const answered: Record<string, unknown>[] = (session.answered as Record<string, unknown>[]) || [];

    if (answered.length === 0) return NextResponse.json({ error: "No answers recorded" }, { status: 404 });

    // 2. Fetch assignment
    const { data: assignRow } = await supabase.from("quiz_assignments").select("title,subject,class_code").eq("id", assignmentId).maybeSingle();
    const assignment = (assignRow ?? {}) as Record<string, unknown>;

    // 3. Fetch all question documents in chunks
    const questionIds = answered.map((a) => a.questionId as string);
    const questionMap: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < questionIds.length; i += 100) {
      const chunk = questionIds.slice(i, i + 100);
      const { data: qRows } = await supabase.from("quiz_questions").select("*").in("id", chunk);
      (qRows ?? []).forEach((q) => { questionMap[(q as Record<string, unknown>).id as string] = q as Record<string, unknown>; });
    }

    // 4. Recompute per-question correctness
    const questions = answered.map((a, idx) => {
      const q = questionMap[a.questionId as string];
      const correctIdx = q ? toIndex(q.correct_option) : null;
      const isCorrect = correctIdx != null && a.selectedOption === correctIdx;
      return {
        number: idx + 1, questionId: a.questionId,
        text: q?.text as string || "(Deleted)", text_ar: q?.text_ar as string || "",
        options: ((q?.options as {label:string;text:string;text_ar?:string}[]) || []).map((o) => ({ label: o.label, text: o.text, text_ar: o.text_ar || "" })),
        selectedOption: a.selectedOption, correctOption: correctIdx, isCorrect,
        difficulty: (a.difficulty as number) || (q?.difficulty as number) || 3,
        standard: q?.standard as string || "", explanation: q?.explanation as string || "",
        timeSpent: (a.timeSpent as number) || 0, timestamp: a.timestamp as string || "",
      };
    });

    const totalCorrect = questions.filter((q) => q.isCorrect).length;
    const totalAnswered = questions.length;
    const totalQuestions = (session.total_questions as number) || totalAnswered;
    const percentageScore = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
    const achievement = getAchievementLevel(percentageScore);

    // 5. Difficulty bands
    const difficultyBands: Record<number, { correct: number; total: number; label: string }> = {};
    for (const q of questions) {
      const d = q.difficulty;
      if (!difficultyBands[d]) difficultyBands[d] = { correct: 0, total: 0, label: getDifficultyLabel(d) };
      difficultyBands[d].total++;
      if (q.isCorrect) difficultyBands[d].correct++;
    }

    // 6. Standard/strand performance
    const standardPerf: Record<string, { standard: string; strand: string; strandName: string; correct: number; total: number; questions: number[] }> = {};
    for (const q of questions) {
      const std = q.standard || "Other";
      if (!standardPerf[std]) {
        const s = getStrand(std);
        standardPerf[std] = { standard: std, strand: s.code, strandName: s.name, correct: 0, total: 0, questions: [] };
      }
      standardPerf[std].total++;
      standardPerf[std].questions.push(q.number);
      if (q.isCorrect) standardPerf[std].correct++;
    }

    type StrandEntry = { strand: string; strandName: string; correct: number; total: number; percentage: number; standards: (typeof standardPerf)[string][]; achievement: ReturnType<typeof getAchievementLevel> };
    const strandPerf: Record<string, StrandEntry> = {};
    for (const sp of Object.values(standardPerf)) {
      if (!strandPerf[sp.strand]) {
        strandPerf[sp.strand] = { strand: sp.strand, strandName: sp.strandName, correct: 0, total: 0, percentage: 0, standards: [], achievement: getAchievementLevel(0) };
      }
      strandPerf[sp.strand].correct += sp.correct;
      strandPerf[sp.strand].total += sp.total;
      strandPerf[sp.strand].standards.push(sp);
    }
    for (const s of Object.values(strandPerf)) {
      s.percentage = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
      s.achievement = getAchievementLevel(s.percentage);
    }

    const adaptivePath = questions.map((q) => ({ question: q.number, difficulty: q.difficulty, correct: q.isCorrect }));

    let estimatedAbility = 1;
    for (let d = 5; d >= 1; d--) {
      const band = difficultyBands[d];
      if (band && band.total >= 1 && (band.correct / band.total) >= 0.5) { estimatedAbility = d; break; }
    }

    const times = questions.map((q) => q.timeSpent);
    const totalTime = times.reduce((s, t) => s + t, 0);
    const avgTime = totalAnswered > 0 ? Math.round(totalTime / totalAnswered) : 0;
    const fastestQ = questions.reduce((a, b) => (a.timeSpent < b.timeSpent ? a : b));
    const slowestQ = questions.reduce((a, b) => (a.timeSpent > b.timeSpent ? a : b));
    const rapidGuessCount = times.filter((t) => t < 3000).length;

    const strengths: string[] = [];
    const growthAreas: string[] = [];
    for (const s of Object.values(strandPerf)) {
      if (s.percentage >= 75 && s.total >= 2) strengths.push(s.strandName);
      else if (s.percentage < 60 && s.total >= 2) growthAreas.push(s.strandName);
    }
    for (const [d, band] of Object.entries(difficultyBands)) {
      const pct = band.total > 0 ? Math.round((band.correct / band.total) * 100) : 0;
      if (pct === 100 && band.total >= 2) strengths.push(`Mastered ${band.label} questions`);
      if (pct <= 25 && band.total >= 2) growthAreas.push(`Needs practice with ${band.label} questions`);
    }

    const recommendations: string[] = [];
    if (estimatedAbility <= 2) {
      recommendations.push("Focus on foundational concepts and vocabulary building");
      recommendations.push("Use scaffolded reading materials at a comfortable level");
    } else if (estimatedAbility === 3) {
      recommendations.push("Continue with grade-level materials while building complexity");
      recommendations.push("Introduce analytical thinking exercises");
    } else {
      recommendations.push("Challenge with above-grade-level texts and critical analysis");
      recommendations.push("Encourage independent research and extended responses");
    }
    if (rapidGuessCount >= 3) recommendations.push("Work on reading stamina — several answers were submitted very quickly");
    if (avgTime > 20000) recommendations.push("Practice timed reading exercises to build fluency and confidence");
    for (const area of growthAreas) {
      if (area.includes("Literature")) recommendations.push("Assign fiction passages with comprehension questions");
      else if (area.includes("Informational")) recommendations.push("Practice with non-fiction articles and text structures");
      else if (area.includes("Language")) recommendations.push("Focus on vocabulary in context and grammar exercises");
      else if (area.includes("Writing")) recommendations.push("Practice thesis development and evidence-based arguments");
    }

    const report = {
      student: { name: session.student_name, number: session.student_number },
      quiz: {
        title: assignment.title || "Quiz", subject: session.subject || assignment.subject || "",
        gradeBand: session.class_code || assignment.class_code || "", year: session.year || "",
        date: session.completed_at ? new Date(session.completed_at as string).toISOString()
          : session.started_at ? new Date(session.started_at as string).toISOString() : "",
        adaptive: session.adaptive || false,
      },
      overview: { score: totalCorrect, total: totalAnswered, totalQuestions, percentage: percentageScore, achievement, estimatedAbility, estimatedAbilityLabel: getDifficultyLabel(estimatedAbility) },
      strandPerformance: Object.values(strandPerf).sort((a, b) => b.total - a.total),
      standardPerformance: Object.values(standardPerf).sort((a, b) => b.total - a.total),
      difficultyBands: Object.entries(difficultyBands).sort(([a], [b]) => Number(a) - Number(b)).map(([d, v]) => ({
        level: Number(d), label: v.label, correct: v.correct, total: v.total,
        percentage: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
      })),
      adaptivePath,
      timeAnalysis: {
        totalTimeMs: totalTime, avgTimeMs: avgTime,
        fastestQuestion: { number: fastestQ.number, timeMs: fastestQ.timeSpent },
        slowestQuestion: { number: slowestQ.number, timeMs: slowestQ.timeSpent },
        rapidGuessCount, rapidGuessPercentage: totalAnswered > 0 ? Math.round((rapidGuessCount / totalAnswered) * 100) : 0,
      },
      strengths, growthAreas, recommendations, questions,
    };

    return NextResponse.json(report, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Quiz report error:", err);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}