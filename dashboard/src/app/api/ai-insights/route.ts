import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAdmin } from "@/lib/api-auth";

/**
 * POST /api/ai-insights
 *
 * Accepts { year, school } and returns AI-generated insights
 * based on the pre-aggregated summaries data.
 *
 * Uses Google Gemini API. Falls back to rule-based insights if no key.
 */

interface InsightCard {
  id: string;
  title: string;
  icon: string;
  content: string;
  severity: "info" | "warning" | "success" | "critical";
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const { year, school } = (await req.json()) as {
      year: string;
      school: "all" | "0021-01" | "0021-02";
    };

    if (!year) {
      return NextResponse.json({ error: "year required" }, { status: 400 });
    }

    // Fetch summary data
    const summaryDoc = await adminDb.collection("summaries").doc(year).get();
    if (!summaryDoc.exists) {
      return NextResponse.json(
        { error: "No summary data for this year" },
        { status: 404 }
      );
    }

    const summaryData = summaryDoc.data()!;
    const schoolData =
      school === "all"
        ? summaryData.all
        : summaryData[school] ?? summaryData.all;

    if (!schoolData) {
      return NextResponse.json(
        { error: "No data for this school filter" },
        { status: 404 }
      );
    }

    const ac = schoolData.academics || {};
    const att = schoolData.attendance_detail || {};
    const fin = schoolData.delinquency || {};
    const sp = schoolData.subject_performance || {};
    const tp = schoolData.term_progress || {};
    const hr = schoolData.honor_roll || {};
    const ar = schoolData.at_risk || {};

    // Build context for AI
    const dataContext = buildDataContext(year, school, schoolData, ac, att, fin, sp, tp, hr, ar);

    const apiKey = process.env.GOOGLE_AI_API_KEY;

    let aiNarrative = "";
    let insights: InsightCard[];

    if (apiKey) {
      aiNarrative = await generateAINarrative(apiKey, dataContext);
    }

    // Always generate rule-based insights (fast, deterministic)
    insights = generateRuleBasedInsights(year, schoolData, ac, att, fin, sp, tp, hr, ar);

    return NextResponse.json({
      narrative: aiNarrative || generateFallbackNarrative(year, ac, att, hr, ar),
      insights,
      stats: (() => {
        const coreSubs = (sp.subjects || []).filter((s: any) => isCoreSubject(s.name));
        const strongest = coreSubs.length > 0 ? coreSubs.reduce((a: any, b: any) => a.avg > b.avg ? a : b).name : "N/A";
        const weakest = coreSubs.length > 0 ? coreSubs.reduce((a: any, b: any) => a.avg < b.avg ? a : b).name : "N/A";
        return {
          totalStudents: schoolData.total_students || 0,
          avgGrade: ac.avg_grade || 0,
          passRate: ac.pass_rate || 0,
          atRiskRate: ar.at_risk_rate || 0,
          honorRate: hr.honor_rate || 0,
          absenceAvg: att.avg_absence_per_student || 0,
          collectionRate: fin.collection_rate || 0,
          strongestSubject: strongest,
          weakestSubject: weakest,
        };
      })(),
    });
  } catch (err) {
    console.error("AI insights error:", err);
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 500 }
    );
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Subjects excluded from AI analysis — non-core / elective subjects */
const NON_CORE_KEYWORDS = [
  "islamic", "quran", "qur'an", "social", "physical", "art", "national",
  "moral", "civic", "pe", "religion", "fiqh", "hadith", "tawheed",
  "tawhid", "tajweed", "tajwid", "تربية", "تجويد", "قرآن", "اجتماع",
  "فنية", "بدنية", "وطنية", "إسلامية", "توحيد", "فقه", "حديث",
];

function isCoreSubject(name: string): boolean {
  const lower = name.toLowerCase();
  return !NON_CORE_KEYWORDS.some((kw) => lower.includes(kw));
}

function buildDataContext(
  year: string,
  school: string,
  schoolData: any,
  ac: any,
  att: any,
  fin: any,
  sp: any,
  tp: any,
  hr: any,
  ar: any
): string {
  const classBreakdown = (ac.class_breakdown || [])
    .slice(0, 10)
    .map((c: any) => `${c.className}: avg=${c.avgGrade}, pass=${c.passRate}%, absences=${c.absenceDays}`)
    .join("\n");

  const coreSubjects = (sp.subjects || []).filter((s: any) => isCoreSubject(s.name));
  const subjectPerf = coreSubjects
    .map((s: any) => `${s.name}: avg=${s.avg}, min=${s.min}, max=${s.max}`)
    .join("\n");

  const termProgress = (tp.terms || [])
    .map((t: any) => `${t.termName}: avg=${t.avgGrade}, pass=${t.passRate}%`)
    .join("\n");

  const topAtRisk = (ar.at_risk_students || [])
    .slice(0, 5)
    .map((s: any) => `${s.studentName}: avg=${s.avg}, absences=${s.absenceDays}`)
    .join("\n");

  return `
STUDENT INFORMATION SYSTEM - ${year} Academic Year
School filter: ${school === "all" ? "All Schools" : school === "0021-01" ? "Boys" : "Girls"}

OVERVIEW:
- Total students: ${schoolData.total_students}
- Active registrations: ${schoolData.active_registrations}
- Overall average grade: ${ac.avg_grade}
- Pass rate: ${ac.pass_rate}%
- Total exams taken: ${ac.total_exams}

ATTENDANCE:
- Total absence days: ${att.total_absence_days}
- Total tardy: ${att.total_tardy}
- Students with absences: ${att.students_with_absences}
- Average absence per student: ${att.avg_absence_per_student}
- Average tardy per student: ${att.avg_tardy_per_student}

AT-RISK STUDENTS:
- Total at-risk (avg < 70): ${ar.total_at_risk}
- At-risk rate: ${ar.at_risk_rate}%
- Top at-risk students:
${topAtRisk}

HONOR ROLL:
- Honor students: ${hr.total_honor}
- Honor rate: ${hr.honor_rate}%

FINANCIAL:
- Total charged: ${fin.total_charged}
- Total paid: ${fin.total_paid}
- Outstanding balance: ${fin.total_outstanding}
- Collection rate: ${fin.collection_rate}%
- Students fully paid: ${fin.students_fully_paid}
- Students with balance: ${fin.students_with_balance}

SUBJECT PERFORMANCE (Core Subjects Only):
- Strongest: ${coreSubjects.length > 0 ? coreSubjects.reduce((a: any, b: any) => a.avg > b.avg ? a : b).name : 'N/A'}
- Weakest: ${coreSubjects.length > 0 ? coreSubjects.reduce((a: any, b: any) => a.avg < b.avg ? a : b).name : 'N/A'}
${subjectPerf}

TERM PROGRESS:
${termProgress}

CLASS BREAKDOWN (top 10):
${classBreakdown}
`.trim();
}

async function generateAINarrative(apiKey: string, dataContext: string): Promise<string> {
  const prompt = `You are an expert educational data analyst for a K-12 school. Analyze the following student performance data and provide a comprehensive executive summary with actionable insights.

Structure your response in these sections:
1. **Overall Performance Summary** (2-3 sentences)
2. **Key Strengths** (2-3 bullet points)
3. **Areas of Concern** (2-3 bullet points)
4. **Recommendations** (3-4 actionable bullet points)

Be specific with numbers. Use professional educational terminology. Keep the total response under 300 words.

DATA:
${dataContext}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!res.ok) {
    console.error("Gemini API error:", res.status);
    return "";
  }

  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

function generateFallbackNarrative(year: string, ac: any, att: any, hr: any, ar: any): string {
  const passDesc = ac.pass_rate >= 90 ? "excellent" : ac.pass_rate >= 75 ? "good" : ac.pass_rate >= 60 ? "moderate" : "concerning";
  const riskDesc = ar.at_risk_rate > 20 ? "high" : ar.at_risk_rate > 10 ? "moderate" : "low";

  return `**Overall Performance Summary**\n\nFor the ${year} academic year, the school achieved a ${passDesc} pass rate of ${ac.pass_rate}% with an overall average grade of ${ac.avg_grade}. The at-risk rate is ${riskDesc} at ${ar.at_risk_rate}%, with ${ar.total_at_risk} students scoring below 70. The honor roll includes ${hr.total_honor} students (${hr.honor_rate}%). Average absence per student stands at ${att.avg_absence_per_student} days.`;
}

function generateRuleBasedInsights(
  year: string,
  schoolData: any,
  ac: any,
  att: any,
  fin: any,
  sp: any,
  tp: any,
  hr: any,
  ar: any
): InsightCard[] {
  const insights: InsightCard[] = [];

  // 1. Pass rate insight
  if (ac.pass_rate >= 90) {
    insights.push({
      id: "pass-rate",
      title: "Excellent Pass Rate",
      icon: "trophy",
      content: `${ac.pass_rate}% of students passed this year — well above the 90% benchmark. ${ac.total_exams} exams were evaluated.`,
      severity: "success",
    });
  } else if (ac.pass_rate >= 75) {
    insights.push({
      id: "pass-rate",
      title: "Good Pass Rate",
      icon: "trending-up",
      content: `${ac.pass_rate}% pass rate is solid but there's room to push above 90%. Focus on the ${ar.total_at_risk} at-risk students.`,
      severity: "info",
    });
  } else {
    insights.push({
      id: "pass-rate",
      title: "Pass Rate Needs Attention",
      icon: "alert",
      content: `${ac.pass_rate}% pass rate is below the 75% target. ${ar.total_at_risk} students are at risk. Immediate intervention programs recommended.`,
      severity: "critical",
    });
  }

  // 2. At-risk analysis
  if (ar.total_at_risk > 0) {
    const dualRisk = (ar.at_risk_students || []).filter((s: any) => s.absenceDays >= 5);
    insights.push({
      id: "at-risk",
      title: `${ar.total_at_risk} Students At Risk`,
      icon: "alert-triangle",
      content: `${ar.at_risk_rate}% of examined students score below 70. ${dualRisk.length} of them also have 5+ absence days — these dual-risk students need priority intervention.`,
      severity: ar.at_risk_rate > 15 ? "critical" : "warning",
    });
  }

  // 3. Attendance pattern
  if (att.avg_absence_per_student > 0) {
    const severity = att.avg_absence_per_student > 10 ? "critical" : att.avg_absence_per_student > 5 ? "warning" : "info";
    insights.push({
      id: "attendance",
      title: "Attendance Analysis",
      icon: "calendar",
      content: `Students average ${att.avg_absence_per_student} absence days and ${att.avg_tardy_per_student} tardy incidents. ${att.students_with_absences} students have at least one absence.`,
      severity,
    });
  }

  // 4. Subject gap analysis (core subjects only)
  const coreSubjects = (sp.subjects || []).filter((s: any) => isCoreSubject(s.name));
  if (coreSubjects.length >= 2) {
    const strongest = coreSubjects.reduce((a: any, b: any) => a.avg > b.avg ? a : b);
    const weakest = coreSubjects.reduce((a: any, b: any) => a.avg < b.avg ? a : b);
    const gap = (strongest.avg - weakest.avg).toFixed(1);
    insights.push({
      id: "subject-gap",
      title: "Core Subject Performance Gap",
      icon: "book",
      content: `${strongest.name} leads at ${strongest.avg} avg vs ${weakest.name} at ${weakest.avg} avg — a ${gap}-point gap. Consider additional support for ${weakest.name}.`,
      severity: Number(gap) > 15 ? "warning" : "info",
    });
  }

  // 5. Term-over-term trend
  const terms = tp.terms || [];
  if (terms.length >= 2) {
    const first = terms[0];
    const last = terms[terms.length - 1];
    const diff = (last.avgGrade - first.avgGrade).toFixed(1);
    const improving = last.avgGrade > first.avgGrade;
    insights.push({
      id: "term-trend",
      title: improving ? "Improving Term Trend" : "Declining Term Trend",
      icon: improving ? "trending-up" : "trending-down",
      content: `Average grade moved from ${first.avgGrade} (${first.termName}) to ${last.avgGrade} (${last.termName}) — ${improving ? "+" : ""}${diff} points. ${improving ? "Keep up the momentum." : "Review teaching strategies and student support."}`,
      severity: improving ? "success" : "warning",
    });
  }

  // 6. Financial health
  if (fin.collection_rate > 0) {
    insights.push({
      id: "financial",
      title: "Financial Collection",
      icon: "dollar",
      content: `Collection rate is ${fin.collection_rate}%. ${fin.students_fully_paid} students fully paid, ${fin.students_with_balance} have outstanding balances (${fin.students_zero_paid} have paid nothing).`,
      severity: fin.collection_rate >= 85 ? "success" : fin.collection_rate >= 70 ? "info" : "warning",
    });
  }

  // 7. Honor roll
  if (hr.total_honor > 0) {
    insights.push({
      id: "honor-roll",
      title: "Honor Roll Achievement",
      icon: "award",
      content: `${hr.total_honor} students made the honor roll (${hr.honor_rate}%). This represents the top-performing students across all classes.`,
      severity: "success",
    });
  }

  // 8. Class disparity
  const classBreakdown = ac.class_breakdown || [];
  if (classBreakdown.length >= 2) {
    const sorted = [...classBreakdown].sort((a: any, b: any) => b.avgGrade - a.avgGrade);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const gap = (best.avgGrade - worst.avgGrade).toFixed(1);
    if (Number(gap) > 10) {
      insights.push({
        id: "class-disparity",
        title: "Class Performance Disparity",
        icon: "bar-chart",
        content: `${best.className} (avg ${best.avgGrade}) outperforms ${worst.className} (avg ${worst.avgGrade}) by ${gap} points. Consider resource reallocation or peer mentoring programs.`,
        severity: "warning",
      });
    }
  }

  return insights;
}
