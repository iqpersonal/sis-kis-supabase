import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_SHORT } from "@/lib/cache-headers";

/**
 * GET /api/quiz/results/report?assignment=ID&student=NUMBER
 *
 * Comprehensive NWEA-style analysis report for a student's quiz session.
 * Returns: overview, standard-level performance, difficulty progression,
 * per-question detail, time analysis, strengths/growth areas.
 */

// ── Helpers ──────────────────────────────────────────────────

function toIndex(val: any): number | null {
  if (val == null) return null;
  if (typeof val === "number") return val;
  if (typeof val === "string" && /^[A-Da-d]$/.test(val)) {
    return val.toUpperCase().charCodeAt(0) - 65;
  }
  const n = Number(val);
  return isNaN(n) ? null : n;
}

/** Map Common-Core-style standard codes to human-readable strand names */
const STRAND_MAP: Record<string, string> = {
  RL: "Reading: Literature",
  RI: "Reading: Informational Text",
  RF: "Reading: Foundational Skills",
  W: "Writing",
  SL: "Speaking & Listening",
  L: "Language",
  // Math
  OA: "Operations & Algebraic Thinking",
  NBT: "Number & Operations in Base Ten",
  NF: "Number & Operations — Fractions",
  MD: "Measurement & Data",
  G: "Geometry",
  RP: "Ratios & Proportional Relationships",
  NS: "The Number System",
  EE: "Expressions & Equations",
  SP: "Statistics & Probability",
  F: "Functions",
};

function getStrand(standard: string): { code: string; name: string } {
  if (!standard) return { code: "Other", name: "Other" };
  // e.g. "RL.6.4" → strand "RL"
  const match = standard.match(/^([A-Z]+)/);
  const code = match ? match[1] : "Other";
  return { code, name: STRAND_MAP[code] || code };
}

function getAchievementLevel(pct: number): {
  level: string;
  label: string;
  color: string;
  description: string;
} {
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

// ── Route handler ────────────────────────────────────────────

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
    // ── 1. Fetch session ──
    const sessSnap = await adminDb
      .collection("quiz_sessions")
      .where("assignment_id", "==", assignmentId)
      .where("student_number", "==", studentNumber)
      .limit(1)
      .get();

    if (sessSnap.empty) {
      return NextResponse.json({ error: "No session found" }, { status: 404 });
    }

    const session = sessSnap.docs[0].data();
    const answered: any[] = session.answered || [];

    if (answered.length === 0) {
      return NextResponse.json({ error: "No answers recorded" }, { status: 404 });
    }

    // ── 2. Fetch assignment ──
    const assignDoc = await adminDb.collection("quiz_assignments").doc(assignmentId).get();
    const assignment = assignDoc.exists ? assignDoc.data()! : {};

    // ── 3. Fetch all question documents ──
    const questionIds = answered.map((a: any) => a.questionId);
    const questionMap: Record<string, any> = {};
    for (let i = 0; i < questionIds.length; i += 30) {
      const chunk = questionIds.slice(i, i + 30);
      const qSnap = await adminDb
        .collection("quiz_questions")
        .where("__name__", "in", chunk)
        .get();
      qSnap.docs.forEach((d) => { questionMap[d.id] = d.data(); });
    }

    // ── 4. Recompute per-question correctness ──
    const questions = answered.map((a: any, idx: number) => {
      const q = questionMap[a.questionId];
      const correctIdx = q ? toIndex(q.correct_option) : null;
      const isCorrect = correctIdx != null && a.selectedOption === correctIdx;
      return {
        number: idx + 1,
        questionId: a.questionId,
        text: q?.text || "(Deleted)",
        text_ar: q?.text_ar || "",
        options: (q?.options || []).map((o: any) => ({
          label: o.label,
          text: o.text,
          text_ar: o.text_ar || "",
        })),
        selectedOption: a.selectedOption,
        correctOption: correctIdx,
        isCorrect,
        difficulty: a.difficulty || q?.difficulty || 3,
        standard: q?.standard || "",
        explanation: q?.explanation || "",
        timeSpent: a.timeSpent || 0,
        timestamp: a.timestamp || "",
      };
    });

    const totalCorrect = questions.filter((q) => q.isCorrect).length;
    const totalAnswered = questions.length;
    const totalQuestions = session.total_questions || totalAnswered;
    const percentageScore = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

    // ── 5. Achievement level ──
    const achievement = getAchievementLevel(percentageScore);

    // ── 6. Difficulty band performance ──
    const difficultyBands: Record<number, { correct: number; total: number; label: string }> = {};
    for (const q of questions) {
      const d = q.difficulty;
      if (!difficultyBands[d]) {
        difficultyBands[d] = { correct: 0, total: 0, label: getDifficultyLabel(d) };
      }
      difficultyBands[d].total++;
      if (q.isCorrect) difficultyBands[d].correct++;
    }

    // ── 7. Standard/strand performance (like NWEA goal areas) ──
    const standardPerf: Record<string, {
      standard: string;
      strand: string;
      strandName: string;
      correct: number;
      total: number;
      questions: number[];
    }> = {};

    for (const q of questions) {
      const std = q.standard || "Other";
      if (!standardPerf[std]) {
        const s = getStrand(std);
        standardPerf[std] = {
          standard: std,
          strand: s.code,
          strandName: s.name,
          correct: 0,
          total: 0,
          questions: [],
        };
      }
      standardPerf[std].total++;
      standardPerf[std].questions.push(q.number);
      if (q.isCorrect) standardPerf[std].correct++;
    }

    // Group by strand
    const strandPerf: Record<string, {
      strand: string;
      strandName: string;
      correct: number;
      total: number;
      percentage: number;
      standards: typeof standardPerf[string][];
      achievement: ReturnType<typeof getAchievementLevel>;
    }> = {};

    for (const sp of Object.values(standardPerf)) {
      if (!strandPerf[sp.strand]) {
        strandPerf[sp.strand] = {
          strand: sp.strand,
          strandName: sp.strandName,
          correct: 0,
          total: 0,
          percentage: 0,
          standards: [],
          achievement: getAchievementLevel(0),
        };
      }
      strandPerf[sp.strand].correct += sp.correct;
      strandPerf[sp.strand].total += sp.total;
      strandPerf[sp.strand].standards.push(sp);
    }
    for (const s of Object.values(strandPerf)) {
      s.percentage = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
      s.achievement = getAchievementLevel(s.percentage);
    }

    // ── 8. Adaptive difficulty path (how difficulty changed over time) ──
    const adaptivePath = questions.map((q) => ({
      question: q.number,
      difficulty: q.difficulty,
      correct: q.isCorrect,
    }));

    // ── 9. Estimated ability (highest difficulty with > 50% correct) ──
    let estimatedAbility = 1;
    for (let d = 5; d >= 1; d--) {
      const band = difficultyBands[d];
      if (band && band.total >= 1 && (band.correct / band.total) >= 0.5) {
        estimatedAbility = d;
        break;
      }
    }

    // ── 10. Time analysis ──
    const times = questions.map((q) => q.timeSpent);
    const totalTime = times.reduce((s, t) => s + t, 0);
    const avgTime = totalAnswered > 0 ? Math.round(totalTime / totalAnswered) : 0;
    const fastestQ = questions.reduce((a, b) => (a.timeSpent < b.timeSpent ? a : b));
    const slowestQ = questions.reduce((a, b) => (a.timeSpent > b.timeSpent ? a : b));
    const rapidGuessCount = times.filter((t) => t < 3000).length;

    // ── 11. Strengths & growth areas ──
    const strengths: string[] = [];
    const growthAreas: string[] = [];

    for (const s of Object.values(strandPerf)) {
      if (s.percentage >= 75 && s.total >= 2) {
        strengths.push(s.strandName);
      } else if (s.percentage < 60 && s.total >= 2) {
        growthAreas.push(s.strandName);
      }
    }

    // Difficulty-based insights
    for (const [d, band] of Object.entries(difficultyBands)) {
      const pct = band.total > 0 ? Math.round((band.correct / band.total) * 100) : 0;
      if (pct === 100 && band.total >= 2) {
        strengths.push(`Mastered ${band.label} questions`);
      }
      if (pct <= 25 && band.total >= 2) {
        growthAreas.push(`Needs practice with ${band.label} questions`);
      }
    }

    // ── 12. Instructional recommendations ──
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

    if (rapidGuessCount >= 3) {
      recommendations.push("Work on reading stamina — several answers were submitted very quickly");
    }

    if (avgTime > 20000) {
      recommendations.push("Practice timed reading exercises to build fluency and confidence");
    }

    for (const area of growthAreas) {
      if (area.includes("Literature")) {
        recommendations.push("Assign fiction passages with comprehension questions");
      } else if (area.includes("Informational")) {
        recommendations.push("Practice with non-fiction articles and text structures");
      } else if (area.includes("Language")) {
        recommendations.push("Focus on vocabulary in context and grammar exercises");
      } else if (area.includes("Writing")) {
        recommendations.push("Practice thesis development and evidence-based arguments");
      }
    }

    // ── Build response ──
    const report = {
      // Student & quiz info
      student: {
        name: session.student_name,
        number: session.student_number,
      },
      quiz: {
        title: assignment.title || "Quiz",
        subject: session.subject || assignment.subject || "",
        gradeBand: session.class_code || assignment.class_code || "",
        year: session.year || "",
        date: session.completed_at?._seconds
          ? new Date(session.completed_at._seconds * 1000).toISOString()
          : session.started_at?._seconds
            ? new Date(session.started_at._seconds * 1000).toISOString()
            : "",
        adaptive: session.adaptive || false,
      },

      // Overall performance
      overview: {
        score: totalCorrect,
        total: totalAnswered,
        totalQuestions,
        percentage: percentageScore,
        achievement,
        estimatedAbility,
        estimatedAbilityLabel: getDifficultyLabel(estimatedAbility),
      },

      // Performance by strand (like NWEA goal areas)
      strandPerformance: Object.values(strandPerf)
        .sort((a, b) => b.total - a.total),

      // Performance by standard
      standardPerformance: Object.values(standardPerf)
        .sort((a, b) => b.total - a.total),

      // Difficulty band performance
      difficultyBands: Object.entries(difficultyBands)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([d, v]) => ({
          level: Number(d),
          label: v.label,
          correct: v.correct,
          total: v.total,
          percentage: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
        })),

      // Adaptive path
      adaptivePath,

      // Time analysis
      timeAnalysis: {
        totalTimeMs: totalTime,
        avgTimeMs: avgTime,
        fastestQuestion: { number: fastestQ.number, timeMs: fastestQ.timeSpent },
        slowestQuestion: { number: slowestQ.number, timeMs: slowestQ.timeSpent },
        rapidGuessCount,
        rapidGuessPercentage: totalAnswered > 0
          ? Math.round((rapidGuessCount / totalAnswered) * 100) : 0,
      },

      // Strengths & growth
      strengths,
      growthAreas,
      recommendations,

      // Full question-by-question detail
      questions,
    };

    return NextResponse.json(report, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Quiz report error:", err);
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 }
    );
  }
}
