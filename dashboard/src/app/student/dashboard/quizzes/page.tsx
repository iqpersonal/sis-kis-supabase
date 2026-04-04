"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useStudentAuth } from "@/context/student-auth-context";
import { useLanguage } from "@/context/language-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Play, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface Assignment {
  id: string;
  title: string;
  title_ar?: string;
  subject: string;
  class_code: string;
  class_name?: string;
  section?: string;
  status: string;
  question_count: number;
  duration_minutes?: number;
  year: string;
  created_at: string;
}

interface QuizResult {
  id: string;
  assignment_id: string;
  student_number: string;
  score: number;
  total_questions: number;
  correct_count: number;
  wrong_count: number;
  avg_time_per_question: number;
  completed_at: string;
  final_difficulty: number;
}

interface QuizQuestion {
  id: string;
  question: string;
  text?: string;
  question_ar?: string;
  options: (string | { label?: string; text: string; text_ar?: string })[];
  options_ar?: string[];
  difficulty: number;
  subject: string;
}

interface SessionState {
  sessionId: string;
  question: QuizQuestion | null;
  questionNumber: number;
  totalQuestions: number;
  selectedOption: number | null;
  feedback: { correct: boolean; correctOption: number } | null;
  finished: boolean;
  score?: number;
  rapidGuessing?: boolean;
  loading: boolean;
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function StudentQuizzesPage() {
  const { student, loading: authLoading } = useStudentAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [loading, setLoading] = useState(true);

  // Quiz-taking state
  const [session, setSession] = useState<SessionState | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);

  /* ── Fetch data ── */
  useEffect(() => {
    if (authLoading) return;
    if (!student) {
      router.push("/student/login");
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch available assignments
        const aRes = await fetch(
          `/api/quiz/assignments?student=${encodeURIComponent(student.student_number)}`
        );
        if (aRes.ok) {
          const aData = await aRes.json();
          setAssignments(aData.assignments || []);
        } else {
          console.error("[Quizzes] assignments error:", aRes.status, await aRes.text());
        }

        // Fetch completed results
        const rRes = await fetch(
          `/api/quiz/results?student=${encodeURIComponent(student.student_number)}`
        );
        if (rRes.ok) {
          const rData = await rRes.json();
          setResults(rData.results || []);
        } else {
          console.error("[Quizzes] results error:", rRes.status, await rRes.text());
        }
      } catch (err) {
        console.error("Quiz data fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [student, authLoading, router]);

  /* ── Quiz Actions ── */
  const startQuiz = useCallback(
    async (assignmentId: string) => {
      if (!student) return;
      setSession({
        sessionId: "",
        question: null,
        questionNumber: 0,
        totalQuestions: 0,
        selectedOption: null,
        feedback: null,
        finished: false,
        loading: true,
      });
      setQuizOpen(true);

      try {
        const res = await fetch("/api/quiz/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "start",
            assignmentId,
            studentNumber: student.student_number,
            studentName: student.student_name,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setSession((s) =>
            s ? { ...s, loading: false, finished: true } : null
          );
          return;
        }

        // If session was resumed or already completed
        if (data.completed) {
          setSession((s) =>
            s
              ? {
                  ...s,
                  sessionId: data.sessionId || "",
                  finished: true,
                  score: data.score,
                  loading: false,
                }
              : null
          );
          return;
        }

        // Session started, fetch first question
        const sessionId = data.sessionId;
        await fetchNextQuestion(sessionId);
      } catch (err) {
        console.error("Start quiz error:", err);
        setSession((s) => (s ? { ...s, loading: false } : null));
      }
    },
    [student]
  );

  const fetchNextQuestion = async (sessionId: string) => {
    try {
      const res = await fetch("/api/quiz/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "next", sessionId }),
      });

      const data = await res.json();

      if (data.finished) {
        setSession((s) =>
          s
            ? {
                ...s,
                sessionId,
                finished: true,
                score: data.score,
                loading: false,
                question: null,
              }
            : null
        );
        // Refresh results
        if (student) {
          const rRes = await fetch(
            `/api/quiz/results?student=${encodeURIComponent(student.student_number)}`
          );
          if (rRes.ok) {
            const rData = await rRes.json();
            setResults(rData.results || []);
          }
        }
        return;
      }

      setSession({
        sessionId,
        question: data.question || null,
        questionNumber: data.questionNumber || 0,
        totalQuestions: data.totalQuestions || 0,
        selectedOption: null,
        feedback: null,
        finished: false,
        rapidGuessing: data.rapidGuessing || false,
        loading: false,
      });
      setStartTime(Date.now());
    } catch (err) {
      console.error("Fetch question error:", err);
    }
  };

  const submitAnswer = async (optionIndex: number) => {
    if (!session || !session.question) return;

    const timeSpent = Date.now() - startTime;

    setSession((s) => (s ? { ...s, selectedOption: optionIndex, loading: true } : null));

    try {
      const res = await fetch("/api/quiz/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "answer",
          sessionId: session.sessionId,
          questionId: session.question.id,
          selectedOption: optionIndex,
          timeSpent,
        }),
      });

      const data = await res.json();

      setSession((s) =>
        s
          ? {
              ...s,
              feedback: {
                correct: data.correct,
                correctOption: data.correctOption,
              },
              loading: false,
            }
          : null
      );

      // Auto-advance after 1.5 seconds
      setTimeout(() => {
        if (session.sessionId) {
          fetchNextQuestion(session.sessionId);
        }
      }, 1500);
    } catch (err) {
      console.error("Answer submit error:", err);
      setSession((s) => (s ? { ...s, loading: false } : null));
    }
  };

  const closeQuiz = async () => {
    // If quiz is in progress (has sessionId, not finished), finish it server-side
    if (session?.sessionId && !session.finished) {
      try {
        await fetch("/api/quiz/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "finish", sessionId: session.sessionId }),
        });
        // Refresh results
        if (student) {
          const rRes = await fetch(
            `/api/quiz/results?student=${encodeURIComponent(student.student_number)}`
          );
          if (rRes.ok) {
            const rData = await rRes.json();
            setResults(rData.results || []);
          }
        }
      } catch {
        // ignore — session will be cleaned up on next start
      }
    }
    setQuizOpen(false);
    setSession(null);
  };

  /* ── Helpers ── */
  const getResultForAssignment = (assignmentId: string) =>
    results.find((r) => r.assignment_id === assignmentId);

  if (authLoading || !student) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("quizzes") || "Quizzes"}</h1>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : assignments.length === 0 && results.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No quizzes available at the moment.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Available Quizzes */}
          {assignments.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Available Quizzes</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {assignments.map((a) => {
                  const result = getResultForAssignment(a.id);
                  const completed = !!result;

                  return (
                    <Card key={a.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{a.title}</CardTitle>
                          {completed ? (
                            <Badge className="bg-green-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Done
                            </Badge>
                          ) : (
                            <Badge variant="outline">New</Badge>
                          )}
                        </div>
                        <CardDescription>{a.subject}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                          {a.question_count > 0 && (
                            <span>{a.question_count} questions</span>
                          )}
                          {a.duration_minutes && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {a.duration_minutes} min
                            </span>
                          )}
                        </div>

                        {completed && result ? (
                          <div className="rounded-md bg-muted p-3">
                            <p className="text-sm font-medium">
                              Score: {result.score?.toFixed(0) ?? 0}%
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {result.correct_count}/{result.total_questions} correct
                            </p>
                          </div>
                        ) : (
                          <Button
                            className="w-full"
                            onClick={() => startQuiz(a.id)}
                          >
                            <Play className="h-4 w-4 mr-2" />
                            Start Quiz
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed Quizzes */}
          {results.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Completed Quizzes</CardTitle>
                <CardDescription>{results.length} quizzes completed</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Date</th>
                        <th className="pb-2 font-medium text-right">Score</th>
                        <th className="pb-2 font-medium text-right">Correct</th>
                        <th className="pb-2 font-medium text-right">Avg Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results
                        .sort((a, b) =>
                          (b.completed_at || "").localeCompare(a.completed_at || "")
                        )
                        .map((r) => (
                          <tr key={r.id} className="border-b last:border-0">
                            <td className="py-2">
                              {r.completed_at
                                ? new Date(r.completed_at).toLocaleDateString()
                                : "—"}
                            </td>
                            <td className="py-2 text-right font-medium">
                              <Badge
                                variant={
                                  (r.score ?? 0) >= 60 ? "default" : "destructive"
                                }
                                className={
                                  (r.score ?? 0) >= 60
                                    ? "bg-green-600/10 text-green-700 border-green-200"
                                    : ""
                                }
                              >
                                {r.score?.toFixed(0) ?? 0}%
                              </Badge>
                            </td>
                            <td className="py-2 text-right text-muted-foreground">
                              {r.correct_count}/{r.total_questions}
                            </td>
                            <td className="py-2 text-right text-muted-foreground">
                              {r.avg_time_per_question
                                ? `${(r.avg_time_per_question / 1000).toFixed(1)}s`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Quiz-Taking Dialog ── */}
      <Dialog open={quizOpen} onOpenChange={(open) => !open && closeQuiz()}>
        <DialogContent className="max-w-2xl">
          {session?.loading && !session.question ? (
            <div className="flex flex-col items-center justify-center py-12">
              <DialogHeader>
                <DialogTitle className="sr-only">Loading Quiz</DialogTitle>
                <DialogDescription className="sr-only">Please wait while the quiz loads.</DialogDescription>
              </DialogHeader>
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Loading quiz…</p>
            </div>
          ) : session?.finished ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <DialogHeader>
                <DialogTitle className="text-2xl">Quiz Complete!</DialogTitle>
                <DialogDescription>
                  {session.score != null
                    ? `Your score: ${session.score.toFixed(0)}%`
                    : "Your results have been saved."}
                </DialogDescription>
              </DialogHeader>
              <Button className="mt-6" onClick={closeQuiz}>
                Close
              </Button>
            </div>
          ) : session?.question ? (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle>
                    Question {session.questionNumber} of {session.totalQuestions}
                  </DialogTitle>
                  <Badge variant="outline">
                    Level {session.question.difficulty}
                  </Badge>
                </div>
                <DialogDescription className="sr-only">Answer the quiz question below.</DialogDescription>
              </DialogHeader>

              {session.rapidGuessing && (
                <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Please take your time and read each question carefully.
                </div>
              )}

              <div className="space-y-4 py-4">
                <p className="text-lg font-medium">
                  {session.question.text || session.question.question}
                </p>

                <div className="space-y-2">
                  {session.question.options.map((opt, i) => {
                    const optText = typeof opt === "string" ? opt : (opt.text || opt.label || "");
                    const selected = session.selectedOption === i;
                    const fb = session.feedback;
                    let variant = "outline" as "outline" | "default" | "destructive";
                    let extraClass = "";

                    if (fb) {
                      if (i === fb.correctOption) {
                        variant = "default";
                        extraClass = "bg-green-600 hover:bg-green-600 text-white border-green-600";
                      } else if (selected && !fb.correct) {
                        variant = "destructive";
                      }
                    }

                    return (
                      <Button
                        key={i}
                        variant={variant}
                        className={`w-full justify-start text-left h-auto py-3 px-4 ${extraClass}`}
                        disabled={session.feedback !== null || session.loading}
                        onClick={() => submitAnswer(i)}
                      >
                        <span className="mr-3 font-bold text-muted-foreground">
                          {String.fromCharCode(65 + i)}.
                        </span>
                        {optText}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
