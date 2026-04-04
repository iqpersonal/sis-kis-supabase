"use client";

import { useEffect, useState } from "react";
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
import { Loader2, TrendingUp, TrendingDown, BookOpen, CalendarCheck, HelpCircle } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface SubjectGrade {
  subject: string;
  grade: number;
}

interface YearData {
  class_name: string;
  section_name: string;
  school: string;
  overall_avg: number;
  pass_count: number;
  fail_count: number;
  strongest: { subject: string; grade: number } | null;
  weakest: { subject: string; grade: number } | null;
  subjects: SubjectGrade[];
  rank?: number | null;
  class_size?: number | null;
}

interface AttendanceSummary {
  total_absence_days: number;
  total_tardy_days: number;
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function StudentDashboardPage() {
  const { student, loading: authLoading } = useStudentAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [yearData, setYearData] = useState<YearData | null>(null);
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [quizCount, setQuizCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [feeBlocked, setFeeBlocked] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!student) {
      router.push("/student/login");
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch student progress
        const progressRes = await fetch(
          `/api/student-progress?studentNumber=${encodeURIComponent(student.student_number)}`
        );
        if (progressRes.ok) {
          const progressData = await progressRes.json();
          const progress = progressData.data;
          const currentYear = student.academic_year || "25-26";

          // Check outstanding fees
          const fin = progress?.financials || {};
          const sortedFinYears = Object.keys(fin).sort();
          let blocked = false;
          for (let i = 0; i < sortedFinYears.length; i++) {
            const y = sortedFinYears[i];
            const nextY = sortedFinYears[i + 1];
            if (y === currentYear) {
              if (nextY) {
                if ((fin[nextY]?.opening_balance ?? 0) > 0) blocked = true;
              } else {
                if ((fin[y]?.balance ?? 0) > 0) blocked = true;
              }
            }
          }
          setFeeBlocked(blocked);

          // Get current year data
          const yd = progress?.years?.[currentYear];
          if (yd) {
            setYearData(yd);
          }
        }

        // Fetch attendance
        const attRes = await fetch(
          `/api/parent/attendance?studentNumber=${encodeURIComponent(student.student_number)}`
        );
        if (attRes.ok) {
          const attData = await attRes.json();
          setAttendance(attData.summary || null);
        }

        // Fetch quiz assignments for this student
        const quizRes = await fetch(
          `/api/quiz/assignments?student=${encodeURIComponent(student.student_number)}`
        );
        if (quizRes.ok) {
          const quizData = await quizRes.json();
          setQuizCount(Array.isArray(quizData.assignments) ? quizData.assignments.length : 0);
        }
      } catch (err) {
        console.error("Dashboard data error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [student, authLoading, router]);

  if (authLoading || !student) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold">
          {t("welcome") || "Welcome"}, {student.student_name.split(" ")[0]}!
        </h1>
        <p className="text-muted-foreground">
          {student.class_name} — {student.section_name} | {student.academic_year}
        </p>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : feeBlocked ? (
        <>
          <Card>
            <CardContent className="py-16 text-center">
              <div className="text-5xl mb-4">🔒</div>
              <p className="text-xl font-bold text-red-600 mb-2">Academic Data Restricted</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Your academic records are restricted due to outstanding fees.
                Please contact the school administration to clear your balance.
              </p>
            </CardContent>
          </Card>

          {/* Attendance & Quizzes still visible */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Attendance */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("attendance") || "Attendance"}
                </CardTitle>
                <CalendarCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {attendance ? attendance.total_absence_days : "—"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("absenceDays") || "absence days"}
                  {attendance && attendance.total_tardy_days > 0 &&
                    ` · ${attendance.total_tardy_days} tardy`}
                </p>
              </CardContent>
            </Card>

            {/* Quizzes */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("quizzes") || "Quizzes"}
                </CardTitle>
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{quizCount}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  available quizzes
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Overall Average */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("overallAverage") || "Overall Average"}
                </CardTitle>
                <BookOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {yearData ? `${yearData.overall_avg.toFixed(1)}%` : "—"}
                </div>
                {yearData && yearData.rank && yearData.class_size && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Rank {yearData.rank} of {yearData.class_size}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Subjects Pass/Fail */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("subjects") || "Subjects"}
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {yearData ? yearData.subjects.length : "—"}
                </div>
                {yearData && (
                  <div className="flex gap-2 mt-1">
                    <Badge variant="default" className="bg-green-600 text-xs">
                      {yearData.pass_count} passed
                    </Badge>
                    {yearData.fail_count > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {yearData.fail_count} failed
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Attendance */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("attendance") || "Attendance"}
                </CardTitle>
                <CalendarCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {attendance ? attendance.total_absence_days : "—"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("absenceDays") || "absence days"}
                  {attendance && attendance.total_tardy_days > 0 &&
                    ` · ${attendance.total_tardy_days} tardy`}
                </p>
              </CardContent>
            </Card>

            {/* Quizzes */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("quizzes") || "Quizzes"}
                </CardTitle>
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{quizCount}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  available quizzes
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Strongest / Weakest */}
          {yearData && (
            <div className="grid gap-4 sm:grid-cols-2">
              {yearData.strongest && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      {t("strongestSubject") || "Strongest Subject"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-semibold">{yearData.strongest.subject}</p>
                    <p className="text-2xl font-bold text-green-600">
                      {yearData.strongest.grade.toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
              )}
              {yearData.weakest && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      <TrendingDown className="h-4 w-4 text-amber-600" />
                      {t("weakestSubject") || "Weakest Subject"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-semibold">{yearData.weakest.subject}</p>
                    <p className="text-2xl font-bold text-amber-600">
                      {yearData.weakest.grade.toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Subject Grades Table */}
          {yearData && yearData.subjects.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("subjectGrades") || "Subject Grades"}</CardTitle>
                <CardDescription>
                  {student.academic_year} — {yearData.class_name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">{t("subject") || "Subject"}</th>
                        <th className="pb-2 font-medium text-right">{t("grade") || "Grade"}</th>
                        <th className="pb-2 font-medium text-right">{t("status") || "Status"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearData.subjects
                        .sort((a, b) => b.grade - a.grade)
                        .map((s) => (
                          <tr key={s.subject} className="border-b last:border-0">
                            <td className="py-2">{s.subject}</td>
                            <td className="py-2 text-right font-medium">
                              {s.grade.toFixed(1)}
                            </td>
                            <td className="py-2 text-right">
                              <Badge
                                variant={s.grade >= 60 ? "default" : "destructive"}
                                className={
                                  s.grade >= 60
                                    ? "bg-green-600/10 text-green-700 border-green-200"
                                    : ""
                                }
                              >
                                {s.grade >= 60 ? "Pass" : "Fail"}
                              </Badge>
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
    </div>
  );
}
