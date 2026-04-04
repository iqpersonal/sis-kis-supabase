"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTeacherAuth } from "@/context/teacher-auth-context";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, ArrowLeft, Printer, Trophy, Target, TrendingUp, TrendingDown,
  AlertTriangle, Clock, CheckCircle2, XCircle, Brain, BookOpen,
  BarChart3, Lightbulb,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

interface Report {
  student: { name: string; number: string };
  quiz: {
    title: string; subject: string; gradeBand: string;
    year: string; date: string; adaptive: boolean;
  };
  overview: {
    score: number; total: number; totalQuestions: number;
    percentage: number;
    achievement: { level: string; label: string; color: string; description: string };
    estimatedAbility: number; estimatedAbilityLabel: string;
  };
  strandPerformance: StrandPerf[];
  standardPerformance: StandardPerf[];
  difficultyBands: DiffBand[];
  adaptivePath: { question: number; difficulty: number; correct: boolean }[];
  timeAnalysis: {
    totalTimeMs: number; avgTimeMs: number;
    fastestQuestion: { number: number; timeMs: number };
    slowestQuestion: { number: number; timeMs: number };
    rapidGuessCount: number; rapidGuessPercentage: number;
  };
  strengths: string[];
  growthAreas: string[];
  recommendations: string[];
  questions: Question[];
}

interface StrandPerf {
  strand: string; strandName: string;
  correct: number; total: number; percentage: number;
  achievement: { level: string; label: string; color: string; description: string };
  standards: StandardPerf[];
}

interface StandardPerf {
  standard: string; strand: string; strandName: string;
  correct: number; total: number; questions: number[];
}

interface DiffBand {
  level: number; label: string;
  correct: number; total: number; percentage: number;
}

interface Question {
  number: number; questionId: string; text: string;
  options: { label: string; text: string }[];
  selectedOption: number; correctOption: number | null;
  isCorrect: boolean; difficulty: number;
  standard: string; explanation: string; timeSpent: number;
}

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

const GRADE_BANDS: Record<string, string> = {
  "pre-k": "Pre-K", "k-2": "K–2", "3-5": "3–5", "6-8": "6–8", "9-12": "9–12",
};

function fmtTime(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function ProgressBar({ value, color, height = "h-3" }: { value: number; color: string; height?: string }) {
  return (
    <div className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full ${height} overflow-hidden`}>
      <div
        className={`${height} rounded-full transition-all duration-500`}
        style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════ */

export default function QuizReportPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <QuizReportInner />
    </Suspense>
  );
}

function QuizReportInner() {
  const { teacher } = useTeacherAuth();
  const params = useSearchParams();
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);

  const assignmentId = params.get("assignment") || "";
  const studentNumber = params.get("student") || "";

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");


  useEffect(() => {
    if (!assignmentId || !studentNumber) return;
    setLoading(true);
    fetch(`/api/quiz/results/report?assignment=${encodeURIComponent(assignmentId)}&student=${encodeURIComponent(studentNumber)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); }
        else { setReport(data); }
      })
      .catch(() => setError("Failed to load report"))
      .finally(() => setLoading(false));
  }, [assignmentId, studentNumber]);

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="text-center py-24 text-muted-foreground">
        <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p className="font-medium">{error || "Report not available"}</p>
        <Button variant="ghost" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Results
        </Button>
      </div>
    );
  }

  const r = report;
  const ov = r.overview;
  const ta = r.timeAnalysis;


  return (
    <div className="space-y-6 max-w-5xl mx-auto print:max-w-none" ref={printRef}>

      {/* ─── Header ─── */}
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-1" /> Print Report
        </Button>
      </div>

      {/* ─── Title Banner ─── */}
      <Card className="border-none shadow-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-indigo-200 text-sm mb-1">
            <BarChart3 className="h-4 w-4" />
            Student Performance Report
          </div>
          <h1 className="text-2xl font-bold">{r.student.name}</h1>
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-indigo-100">
            <span>Quiz: {r.quiz.title}</span>
            <span>Subject: {r.quiz.subject}</span>
            <span>Grade Band: {GRADE_BANDS[r.quiz.gradeBand] || r.quiz.gradeBand}</span>
            <span>Year: {r.quiz.year}</span>
            {r.quiz.date && (
              <span>Date: {new Date(r.quiz.date).toLocaleDateString()}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ═══ SECTION 1: Performance Overview ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Score Gauge */}
        <Card className="md:col-span-1">
          <CardContent className="p-6 flex flex-col items-center justify-center">
            <div className="relative w-36 h-36">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="50" fill="none" stroke="#e5e7eb" strokeWidth="12" className="dark:stroke-gray-700" />
                <circle
                  cx="60" cy="60" r="50" fill="none"
                  stroke={ov.achievement.color}
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${(ov.percentage / 100) * 314} 314`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold">{ov.percentage}%</span>
                <span className="text-xs text-muted-foreground">{ov.score}/{ov.total}</span>
              </div>
            </div>
            <Badge
              className="mt-3 text-white text-sm px-3 py-1"
              style={{ backgroundColor: ov.achievement.color }}
            >
              {ov.achievement.label}
            </Badge>
            <p className="text-xs text-muted-foreground mt-1 text-center">
              {ov.achievement.description}
            </p>
          </CardContent>
        </Card>

        {/* Key Metrics */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="h-5 w-5 text-indigo-600" />
              Key Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Estimated Ability</p>
              <p className="text-xl font-bold">{ov.estimatedAbilityLabel}</p>
              <div className="flex gap-1 mt-1">
                {[1, 2, 3, 4, 5].map((d) => (
                  <div
                    key={d}
                    className={`h-2 flex-1 rounded-full ${
                      d <= ov.estimatedAbility
                        ? "bg-indigo-500"
                        : "bg-gray-200 dark:bg-gray-700"
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Time</p>
              <p className="text-xl font-bold">{fmtTime(ta.totalTimeMs)}</p>
              <p className="text-xs text-muted-foreground">Avg {fmtTime(ta.avgTimeMs)} per question</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Questions Answered</p>
              <p className="text-xl font-bold">{ov.total} <span className="text-sm font-normal text-muted-foreground">of {ov.totalQuestions}</span></p>
              <ProgressBar value={(ov.total / ov.totalQuestions) * 100} color="#6366f1" height="h-1.5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Rapid Guesses</p>
              <p className="text-xl font-bold">
                {ta.rapidGuessCount}
                {ta.rapidGuessCount > 0 && (
                  <span className="text-sm font-normal text-amber-600 ml-1">({ta.rapidGuessPercentage}%)</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">Answers under 3 seconds</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══ SECTION 2: Goal / Strand Performance ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-indigo-600" />
            Goal Performance
          </CardTitle>
          <CardDescription>Performance by learning strand — similar to NWEA Goal Area scores</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {r.strandPerformance.map((s) => (
            <div key={s.strand} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.strandName}</span>
                  <Badge variant="outline" className="text-xs">{s.strand}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{s.correct}/{s.total}</span>
                  <Badge
                    className="text-white text-xs"
                    style={{ backgroundColor: s.achievement.color }}
                  >
                    {s.percentage}% — {s.achievement.label}
                  </Badge>
                </div>
              </div>
              <ProgressBar value={s.percentage} color={s.achievement.color} />
              {/* Sub-standards */}
              <div className="flex flex-wrap gap-2 ml-4">
                {s.standards.map((st) => {
                  const pct = st.total > 0 ? Math.round((st.correct / st.total) * 100) : 0;
                  return (
                    <span
                      key={st.standard}
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        pct >= 75
                          ? "border-green-300 bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-300"
                          : pct >= 50
                            ? "border-yellow-300 bg-yellow-50 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                            : "border-red-300 bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-300"
                      }`}
                    >
                      {st.standard}: {st.correct}/{st.total}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ═══ SECTION 3: Difficulty Band Performance ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5 text-indigo-600" />
            Performance by Difficulty Level
          </CardTitle>
          <CardDescription>How the student performed at each complexity tier</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {r.difficultyBands.map((b) => {
              const color = b.percentage >= 75 ? "#16a34a" : b.percentage >= 50 ? "#ca8a04" : "#dc2626";
              return (
                <div key={b.level} className="flex items-center gap-4">
                  <div className="w-48 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">L{b.level}</span>
                      <span className="text-xs text-muted-foreground">{b.label}</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <ProgressBar value={b.percentage} color={color} />
                  </div>
                  <div className="w-20 text-right text-sm shrink-0">
                    <span className="font-semibold">{b.correct}/{b.total}</span>
                    <span className="text-muted-foreground ml-1">({b.percentage}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ═══ SECTION 4: Adaptive Path ═══ */}
      {r.quiz.adaptive && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-600" />
              Adaptive Difficulty Path
            </CardTitle>
            <CardDescription>
              How question difficulty adjusted based on student responses
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Y-axis + bars */}
            <div className="flex gap-2">
              {/* Y-axis labels */}
              <div className="flex flex-col justify-between text-[10px] text-muted-foreground h-36 py-1 w-6 shrink-0">
                {[5, 4, 3, 2, 1].map((d) => (
                  <span key={d} className="text-right">L{d}</span>
                ))}
              </div>
              {/* Bars */}
              <div className="flex-1">
                <div className="flex items-end gap-1 h-36 border-b border-l border-gray-200 dark:border-gray-700 pl-1 pb-1">
                  {r.adaptivePath.map((p) => (
                    <div
                      key={p.question}
                      className={`flex-1 rounded-t min-w-1 transition-all ${
                        p.correct
                          ? "bg-green-500 dark:bg-green-500"
                          : "bg-red-500 dark:bg-red-500"
                      }`}
                      title={`Q${p.question}: Level ${p.difficulty} — ${p.correct ? "Correct" : "Wrong"}`}
                      style={{ height: `${(p.difficulty / 5) * 100}%` }}
                    />
                  ))}
                </div>
                {/* X-axis labels */}
                <div className="flex gap-1 pl-1 mt-1">
                  {r.adaptivePath.map((p) => (
                    <span key={p.question} className="flex-1 text-center text-[10px] text-muted-foreground">
                      {p.question}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-2 px-1">
              <span>Question →</span>
              <div className="flex gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Correct
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Incorrect
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ SECTION 5: Time Analysis ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-indigo-600" />
            Time Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-32 border-b border-l border-gray-200 dark:border-gray-700 pl-1 pb-1">
            {r.questions.map((q) => {
              const maxTime = Math.max(...r.questions.map((x) => x.timeSpent), 1);
              const heightPct = Math.max(4, Math.min(100, (q.timeSpent / maxTime) * 100));
              const isRapid = q.timeSpent < 3000;
              return (
                <div
                  key={q.number}
                  className={`flex-1 rounded-t min-w-1 ${
                    isRapid
                      ? "bg-amber-400 dark:bg-amber-500"
                      : q.isCorrect
                        ? "bg-blue-500 dark:bg-blue-500"
                        : "bg-blue-300 dark:bg-blue-700"
                  }`}
                  title={`Q${q.number}: ${fmtTime(q.timeSpent)} — ${q.isCorrect ? "✓" : "✗"}`}
                  style={{ height: `${heightPct}%` }}
                />
              );
            })}
          </div>
          {/* X-axis labels */}
          <div className="flex gap-1 pl-1 mt-1">
            {r.questions.map((q) => (
              <span key={q.number} className="flex-1 text-center text-[10px] text-muted-foreground">
                {q.number}
              </span>
            ))}
          </div>
          <div className="flex gap-4 text-[10px] text-muted-foreground mt-2">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Normal (correct)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-200 inline-block" /> Normal (wrong)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Rapid (&lt;3s)
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Fastest</p>
              <p className="font-semibold">Q{ta.fastestQuestion.number} — {fmtTime(ta.fastestQuestion.timeMs)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Average</p>
              <p className="font-semibold">{fmtTime(ta.avgTimeMs)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Slowest</p>
              <p className="font-semibold">Q{ta.slowestQuestion.number} — {fmtTime(ta.slowestQuestion.timeMs)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ SECTION 6: Strengths & Growth Areas ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-green-700 dark:text-green-400">
              <Trophy className="h-5 w-5" />
              Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            {r.strengths.length === 0 ? (
              <p className="text-sm text-muted-foreground">More data needed to identify strengths</p>
            ) : (
              <ul className="space-y-2">
                {r.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <TrendingDown className="h-5 w-5" />
              Areas for Growth
            </CardTitle>
          </CardHeader>
          <CardContent>
            {r.growthAreas.length === 0 ? (
              <p className="text-sm text-muted-foreground">No significant growth areas identified</p>
            ) : (
              <ul className="space-y-2">
                {r.growthAreas.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ SECTION 7: Instructional Recommendations ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-indigo-600" />
            Instructional Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {r.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="flex items-center justify-center shrink-0 w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-bold">
                  {i + 1}
                </span>
                {rec}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* ─── Footer ─── */}
      <Separator />
      <div className="text-center text-xs text-muted-foreground pb-6 print:pb-0">
        <p>Generated on {new Date().toLocaleDateString()} • KIS Adaptive Quiz Analysis Engine</p>
        <p className="mt-0.5">Student ID: {r.student.number} • {r.quiz.subject} • {GRADE_BANDS[r.quiz.gradeBand] || r.quiz.gradeBand} • {r.quiz.year}</p>
      </div>
    </div>
  );
}
