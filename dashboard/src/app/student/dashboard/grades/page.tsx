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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface SubjectGrade {
  subject: string;
  grade: number;
  class_rank?: number | null;
  section_rank?: number | null;
}

interface TermData {
  label: string;
  subjects: { subject: string; grade: number }[];
  avg: number;
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
  terms?: Record<string, TermData>;
  term_count?: number;
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function StudentGradesPage() {
  const { student, loading: authLoading } = useStudentAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [years, setYears] = useState<Record<string, YearData>>({});
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [unpaidYears, setUnpaidYears] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (authLoading) return;
    if (!student) {
      router.push("/student/login");
      return;
    }

    const fetchGrades = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/student-progress?studentNumber=${encodeURIComponent(student.student_number)}`
        );
        if (res.ok) {
          const data = await res.json();
          const yrs = data.data?.years || {};
          setYears(yrs);

          // Build unpaid years set from financials
          const fin = data.data?.financials || {};
          const sortedFinYears = Object.keys(fin).sort();
          const blocked = new Set<string>();
          for (let i = 0; i < sortedFinYears.length; i++) {
            const y = sortedFinYears[i];
            const nextY = sortedFinYears[i + 1];
            if (nextY) {
              if ((fin[nextY]?.opening_balance ?? 0) > 0) blocked.add(y);
            } else {
              if ((fin[y]?.balance ?? 0) > 0) blocked.add(y);
            }
          }
          setUnpaidYears(blocked);

          // Default to current year or latest
          const currentYear = student.academic_year || "25-26";
          if (yrs[currentYear]) {
            setSelectedYear(currentYear);
          } else {
            const sorted = Object.keys(yrs).sort().reverse();
            if (sorted.length > 0) setSelectedYear(sorted[0]);
          }
        }
      } catch (err) {
        console.error("Grades fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchGrades();
  }, [student, authLoading, router]);

  if (authLoading || !student) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const yearData = years[selectedYear] || null;
  const yearKeys = Object.keys(years).sort().reverse();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("myGrades") || "My Grades"}</h1>
        {yearKeys.length > 1 && (
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearKeys.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : unpaidYears.has(selectedYear) ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-5xl mb-4">🔒</div>
            <p className="text-xl font-bold text-red-600 mb-2">Grades Restricted</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Academic records for {selectedYear} are restricted due to outstanding fees.
              Please contact the school administration to clear your balance.
            </p>
          </CardContent>
        </Card>
      ) : !yearData ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No grade data available for {selectedYear || "this year"}.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("overallAverage") || "Overall Average"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{yearData.overall_avg.toFixed(1)}%</p>
                {yearData.rank && yearData.class_size && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Rank {yearData.rank} / {yearData.class_size}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Class
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">{yearData.class_name}</p>
                <p className="text-sm text-muted-foreground">{yearData.section_name}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Pass / Fail
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3 items-baseline">
                  <span className="text-3xl font-bold text-green-600">{yearData.pass_count}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-3xl font-bold text-red-500">{yearData.fail_count}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Term Breakdown */}
          {yearData.terms && Object.keys(yearData.terms).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("termBreakdown") || "Term Breakdown"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(yearData.terms)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, term]) => (
                      <div key={key} className="rounded-lg border p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="font-medium">{term.label}</p>
                          <Badge variant="outline">{term.avg.toFixed(1)}%</Badge>
                        </div>
                        <div className="space-y-1">
                          {term.subjects
                            .sort((a, b) => b.grade - a.grade)
                            .map((s) => (
                              <div
                                key={s.subject}
                                className="flex justify-between text-sm"
                              >
                                <span className="truncate mr-2">{s.subject}</span>
                                <span
                                  className={
                                    s.grade >= 60
                                      ? "font-medium"
                                      : "font-medium text-red-500"
                                  }
                                >
                                  {s.grade.toFixed(1)}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Full Subject Table */}
          <Card>
            <CardHeader>
              <CardTitle>{t("subjectGrades") || "Subject Grades"}</CardTitle>
              <CardDescription>
                {selectedYear} Annual — {yearData.class_name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium">{t("subject") || "Subject"}</th>
                      <th className="pb-2 font-medium text-right">{t("grade") || "Grade"}</th>
                      <th className="pb-2 font-medium text-right">Class Rank</th>
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
                          <td className="py-2 text-right text-muted-foreground">
                            {s.class_rank ?? "—"}
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

          {/* Year-over-Year History */}
          {yearKeys.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("academicHistory") || "Academic History"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Year</th>
                        <th className="pb-2 font-medium">Class</th>
                        <th className="pb-2 font-medium text-right">Average</th>
                        <th className="pb-2 font-medium text-right">Subjects</th>
                        <th className="pb-2 font-medium text-right">Rank</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearKeys.map((y) => {
                        const yd = years[y];
                        return (
                          <tr
                            key={y}
                            className={`border-b last:border-0 cursor-pointer hover:bg-muted/50 ${
                              y === selectedYear ? "bg-primary/5" : ""
                            }`}
                            onClick={() => setSelectedYear(y)}
                          >
                            <td className="py-2 font-medium">{y}</td>
                            <td className="py-2">{yd.class_name}</td>
                            <td className="py-2 text-right font-medium">
                              {yd.overall_avg.toFixed(1)}%
                            </td>
                            <td className="py-2 text-right">
                              {yd.subjects?.length || 0}
                            </td>
                            <td className="py-2 text-right text-muted-foreground">
                              {yd.rank && yd.class_size
                                ? `${yd.rank}/${yd.class_size}`
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
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
