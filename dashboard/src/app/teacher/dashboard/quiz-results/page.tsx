"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTeacherAuth } from "@/context/teacher-auth-context";
import { useLanguage } from "@/context/language-context";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  BarChart3, Loader2, Trophy, Target, TrendingUp, AlertTriangle, Clock,
  CheckCircle2, XCircle, Eye, FileText,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────── */

interface Assignment {
  id: string;
  title: string;
  subject: string;
  class_code: string;
  section?: string;
  question_ids: string[];
  status: string;
  stats?: { started: number; completed: number; avg_score: number };
}

interface Result {
  id: string;
  student_id: string;
  student_name?: string;
  assignment_id: string;
  score: number;
  total: number;
  percentage: number;
  mastery: string;
  estimated_ability: number;
  time_spent_seconds: number;
  rapid_guesses: number;
  difficulty_breakdown: Record<string, { correct: number; total: number }>;
  completed_at?: any;
}

interface DetailQuestion {
  number: number;
  questionId: string;
  text: string;
  text_ar?: string;
  options: { label: string; text: string; text_ar?: string }[];
  selectedOption: number;
  correctOption: number | null;
  isCorrect: boolean;
  difficulty: number;
  timeSpent: number;
}

/* ─── Helpers ────────────────────────────────────────────────── */

const MASTERY_COLORS: Record<string, string> = {
  excellent: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  proficient: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  developing: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  needs_improvement: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

const MASTERY_ICONS: Record<string, React.ElementType> = {
  excellent: Trophy,
  proficient: Target,
  developing: TrendingUp,
  needs_improvement: AlertTriangle,
};

/* NWEA-style grade bands */
const GRADE_BANDS: Record<string, string> = {
  "pre-k": "Pre-K",
  "k-2": "K–2",
  "3-5": "3–5",
  "6-8": "6–8",
  "9-12": "9–12",
};

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

/* ─── Page ───────────────────────────────────────────────────── */

export default function QuizResultsPage() {
  const { teacher } = useTeacherAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);

  /* ─── Detail dialog state ────────────────────────────────── */
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailQuestions, setDetailQuestions] = useState<DetailQuestion[]>([]);
  const [detailStudent, setDetailStudent] = useState<Result | null>(null);

  const openDetail = async (result: Result) => {
    setDetailStudent(result);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailQuestions([]);
    try {
      const res = await fetch(
        `/api/quiz/results/detail?assignment=${encodeURIComponent(result.assignment_id)}&student=${encodeURIComponent(result.student_id)}`
      );
      if (res.ok) {
        const data = await res.json();
        setDetailQuestions(data.questions || []);
      }
    } catch (err) {
      console.error("Failed to fetch detail:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  /* ─── Fetch assignments ──────────────────────────────────── */

  const fetchAssignments = useCallback(async () => {
    if (!teacher) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/quiz/assignments?teacher=${teacher.username}&year=25-26`);
      const data = await res.json();
      setAssignments(data.assignments || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [teacher]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  /* ─── Fetch results ──────────────────────────────────────── */

  const fetchResults = useCallback(async (assignmentId: string) => {
    setLoadingResults(true);
    try {
      let url: string;
      if (assignmentId === "all") {
        const aIds = assignments.map((a) => a.id);
        if (aIds.length === 0) { setResults([]); return; }
        url = `/api/quiz/results?assignments=${aIds.join(",")}`;
      } else {
        url = `/api/quiz/results?assignment=${assignmentId}`;
      }
      const res = await fetch(url);
      if (!res.ok) {
        console.error("Quiz results fetch error:", res.status);
        setResults([]);
        return;
      }
      const data = await res.json();
      setResults(data.results || []);
    } catch (err) {
      console.error("Failed to fetch results:", err);
      setResults([]);
    } finally {
      setLoadingResults(false);
    }
  }, [assignments]);

  useEffect(() => {
    if (assignments.length > 0) {
      fetchResults(selectedAssignment);
    }
  }, [selectedAssignment, assignments, fetchResults]);

  /* ─── KPI ─────────────────────────────────────────────────── */

  const totalResults = results.length;
  const avgScore = totalResults > 0
    ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / totalResults)
    : 0;
  const masteryDist = results.reduce((acc, r) => {
    acc[r.mastery] = (acc[r.mastery] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const avgTime = totalResults > 0
    ? Math.round(results.reduce((s, r) => s + (r.time_spent_seconds || 0), 0) / totalResults)
    : 0;

  /* ─── Render ──────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-indigo-600" />
            Quiz Results
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            View student performance and mastery levels
          </p>
        </div>
        <Select value={selectedAssignment} onValueChange={setSelectedAssignment}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Select quiz…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Quizzes</SelectItem>
            {assignments.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.title} — {GRADE_BANDS[a.class_code] || a.class_code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Students Completed</CardDescription>
            <CardTitle className="text-3xl">{totalResults}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average Score</CardDescription>
            <CardTitle className="text-3xl">{avgScore}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average Time</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-1">
              <Clock className="h-5 w-5 text-muted-foreground" />
              {formatTime(avgTime)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Mastery Distribution</CardDescription>
            <CardContent className="p-0 pt-1 flex flex-wrap gap-1">
              {Object.entries(masteryDist).map(([k, v]) => (
                <Badge key={k} className={MASTERY_COLORS[k] || ""}>
                  {k.replace("_", " ")}: {v}
                </Badge>
              ))}
              {Object.keys(masteryDist).length === 0 && (
                <span className="text-sm text-muted-foreground">No data</span>
              )}
            </CardContent>
          </CardHeader>
        </Card>
      </div>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Student Results</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingResults ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No results yet</p>
              <p className="text-sm">Results will appear as students complete quizzes</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Mastery</TableHead>
                  <TableHead>Ability</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Rapid Guesses</TableHead>
                  <TableHead>Difficulty Breakdown</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results
                  .sort((a, b) => b.percentage - a.percentage)
                  .map((r) => {
                    const MIcon = MASTERY_ICONS[r.mastery] || Target;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          <button
                            className="text-left text-blue-600 hover:underline flex items-center gap-1"
                            onClick={() => openDetail(r)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            {r.student_name || r.student_id}
                          </button>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold">{r.score}/{r.total}</span>
                          <span className="text-muted-foreground ml-1">({r.percentage}%)</span>
                        </TableCell>
                        <TableCell>
                          <Badge className={MASTERY_COLORS[r.mastery] || ""}>
                            <MIcon className="h-3 w-3 mr-1" />
                            {r.mastery?.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{r.estimated_ability?.toFixed(1)}</Badge>
                        </TableCell>
                        <TableCell>{formatTime(r.time_spent_seconds || 0)}</TableCell>
                        <TableCell>
                          {r.rapid_guesses > 0 ? (
                            <Badge variant="destructive">{r.rapid_guesses}</Badge>
                          ) : (
                            <span className="text-green-600">0</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {r.difficulty_breakdown && Object.entries(r.difficulty_breakdown).map(([d, v]) => (
                              <span key={d} className="text-xs bg-muted rounded px-1.5 py-0.5">
                                L{d}: {v.correct}/{v.total}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <button
                            className="text-xs text-indigo-600 hover:underline flex items-center gap-1 whitespace-nowrap"
                            onClick={() => router.push(
                              `/teacher/dashboard/quiz-report?assignment=${encodeURIComponent(r.assignment_id)}&student=${encodeURIComponent(r.student_id)}`
                            )}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Full Report
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ─── Detail Dialog ──────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
              {detailStudent?.student_name || detailStudent?.student_id}
            </DialogTitle>
            <DialogDescription>
              Score: {detailStudent?.score}/{detailStudent?.total} ({detailStudent?.percentage}%)
              {" · "}Mastery: {detailStudent?.mastery?.replace("_", " ")}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : detailQuestions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No question data available</p>
          ) : (
            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              {detailQuestions.map((q) => (
                <div
                  key={q.questionId}
                  className={`rounded-lg border p-4 ${
                    q.isCorrect
                      ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
                      : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
                  }`}
                >
                  {/* Question header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <p className="font-medium">
                      <span className="text-muted-foreground mr-2">Q{q.number}.</span>
                      {q.text}
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs">L{q.difficulty}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {(q.timeSpent / 1000).toFixed(1)}s
                      </span>
                      {q.isCorrect ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                    </div>
                  </div>

                  {/* Options */}
                  <div className="space-y-1.5">
                    {q.options.map((opt, i) => {
                      const isSelected = i === q.selectedOption;
                      const isCorrectOpt = i === q.correctOption;
                      let cls = "rounded-md px-3 py-2 text-sm border ";

                      if (isCorrectOpt) {
                        cls += "border-green-400 bg-green-100 dark:bg-green-900 font-medium ";
                      } else if (isSelected && !q.isCorrect) {
                        cls += "border-red-400 bg-red-100 dark:bg-red-900 line-through opacity-75 ";
                      } else {
                        cls += "border-transparent bg-white/60 dark:bg-gray-800/60 ";
                      }

                      return (
                        <div key={i} className={cls}>
                          <span className="font-semibold text-muted-foreground mr-2">
                            {String.fromCharCode(65 + i)}.
                          </span>
                          {opt.text || opt.label}
                          {isCorrectOpt && (
                            <span className="ml-2 text-green-700 dark:text-green-400 text-xs font-medium">
                              ✓ Correct
                            </span>
                          )}
                          {isSelected && !isCorrectOpt && (
                            <span className="ml-2 text-red-700 dark:text-red-400 text-xs font-medium">
                              ✗ Student&apos;s answer
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Summary footer */}
              <div className="text-center text-sm text-muted-foreground pt-2 border-t">
                {detailQuestions.filter((q) => q.isCorrect).length} correct out of{" "}
                {detailQuestions.length} questions
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
