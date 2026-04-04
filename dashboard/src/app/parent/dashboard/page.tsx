"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useParentAuth, type ParentChild } from "@/context/parent-auth-context";
import { useLanguage } from "@/context/language-context";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LogOut,
  GraduationCap,
  TrendingUp,
  TrendingDown,
  Award,
  AlertTriangle,
  Users,
  BookOpen,
  ChevronRight,
  Wallet,
  CheckCircle2,
  CircleDollarSign,
  Receipt,
  CalendarX,
  Clock,
  Lock,
  ClipboardList,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from "recharts";

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
  class_code: string;
  class_name: string;
  section_code: string;
  section_name: string;
  school: string;
  exam_label: string;
  overall_avg: number;
  subjects: SubjectGrade[];
  rank: number | null;
  class_size: number | null;
  pass_count: number;
  fail_count: number;
  strongest: { subject: string; grade: number };
  weakest: { subject: string; grade: number };
  terms?: Record<string, TermData>;
  term_count?: number;
}

interface Installment {
  label: string;
  charged: number;
  paid: number;
  discount: number;
  balance: number;
}

interface YearFinancials {
  total_charged: number;
  total_paid: number;
  total_discount: number;
  balance: number;
  opening_balance?: number;
  installments: Installment[];
}

interface StudentProgress {
  student_number: string;
  student_name: string;
  gender: string;
  family_number: string;
  years: Record<string, YearData>;
  financials?: Record<string, YearFinancials>;
  updated_at: string;
}

type TabKey = "academics" | "financials" | "attendance" | "progress_report";

/* ------------------------------------------------------------------ */
/*  Color helpers                                                     */
/* ------------------------------------------------------------------ */

const COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
];

function gradeColor(grade: number): string {
  if (grade >= 90) return "#10b981";
  if (grade >= 80) return "#3b82f6";
  if (grade >= 70) return "#f59e0b";
  if (grade >= 60) return "#f97316";
  return "#ef4444";
}

function gradeBg(grade: number): string {
  if (grade >= 90) return "bg-emerald-50 border-emerald-200 text-emerald-700";
  if (grade >= 80) return "bg-blue-50 border-blue-200 text-blue-700";
  if (grade >= 70) return "bg-amber-50 border-amber-200 text-amber-700";
  if (grade >= 60) return "bg-orange-50 border-orange-200 text-orange-700";
  return "bg-red-50 border-red-200 text-red-700";
}

function formatSAR(n: number): string {
  return n.toLocaleString("en-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  });
}

/* ------------------------------------------------------------------ */
/*  Dashboard                                                        */
/* ------------------------------------------------------------------ */

export default function ParentDashboardPage() {
  const { family, loading: authLoading, signOut } = useParentAuth();
  const { t, isRTL: rtl } = useLanguage();
  const router = useRouter();

  const [selectedChild, setSelectedChild] = useState<ParentChild | null>(null);
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("academics");

  // Attendance data
  interface AttendanceData {
    summary: { total_absence_days: number; total_tardy_days: number };
    monthly_breakdown: { month: string; absences: number; tardies: number }[];
    yearly_breakdown: { year: string; absences: number; tardies: number }[];
    absences: { date: string; days: number; reason_desc: string; year: string }[];
    tardies: { date: string; reason_desc: string; year: string }[];
  }
  const [attendanceData, setAttendanceData] = useState<AttendanceData | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // Parent notifications
  interface ParentNotification {
    id: string;
    type: string;
    severity: "critical" | "warning" | "info";
    title: string;
    message: string;
    student_number: string;
    student_name: string;
  }
  const [parentNotifications, setParentNotifications] = useState<ParentNotification[]>([]);

  // Progress report data
  interface ProgressReportEntry {
    subject: string;
    month: string;
    term: string;
    academic_performance: string;
    homework_effort: string;
    participation: string;
    conduct: string;
    notes?: string;
  }
  const [progressReports, setProgressReports] = useState<ProgressReportEntry[]>([]);
  const [progressLoading2, setProgressLoading2] = useState(false);
  const [prSelectedMonth, setPrSelectedMonth] = useState<string>("all");
  const PR_MONTHS = ["September","October","November","December","January","February","March","April","May"];

  /* fetch progress reports for selected child */
  const fetchProgressReports = useCallback(async (studentNumber: string) => {
    setProgressLoading2(true);
    try {
      const res = await fetch(`/api/progress-report?action=student&studentNumber=${studentNumber}&year=25-26`);
      if (res.ok) {
        const data = await res.json();
        setProgressReports(data.reports || []);
      }
    } catch { /* ignore */ }
    setProgressLoading2(false);
  }, []);

  /* auth redirect */
  useEffect(() => {
    if (!authLoading && !family) router.push("/parent/login");
  }, [authLoading, family, router]);

  /* auto-select first child */
  useEffect(() => {
    if (family?.children?.length && !selectedChild)
      setSelectedChild(family.children[0]);
  }, [family, selectedChild]);

  /* fetch progress via API */
  const fetchProgress = useCallback(async (studentNumber: string) => {
    setProgressLoading(true);
    try {
      const res = await fetch(
        `/api/student-progress?studentNumber=${encodeURIComponent(studentNumber)}`
      );
      if (res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const json = await res.json();
          setProgress(json.data as StudentProgress);
        } else {
          setProgress(null);
        }
      } else {
        setProgress(null);
      }
    } catch {
      setProgress(null);
    } finally {
      setProgressLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedChild) fetchProgress(selectedChild.student_number);
  }, [selectedChild, fetchProgress]);

  /* fetch attendance */
  const fetchAttendance = useCallback(async (studentNumber: string) => {
    setAttendanceLoading(true);
    try {
      const res = await fetch(
        `/api/parent/attendance?studentNumber=${encodeURIComponent(studentNumber)}`
      );
      if (res.ok) {
        const json = await res.json();
        setAttendanceData(json);
      } else {
        setAttendanceData(null);
      }
    } catch {
      setAttendanceData(null);
    } finally {
      setAttendanceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedChild && activeTab === "attendance") {
      fetchAttendance(selectedChild.student_number);
    }
  }, [selectedChild, activeTab, fetchAttendance]);

  /* fetch parent notifications */
  useEffect(() => {
    if (!family?.children?.length) return;
    const studentNumbers = family.children.map((c) => c.student_number).join(",");
    fetch(`/api/parent/notifications?studentNumbers=${studentNumbers}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.notifications) setParentNotifications(data.notifications);
      })
      .catch(() => {});
  }, [family]);

  /* ── merge ALL year keys from academics AND financials ── */
  const allYearKeys = useMemo(() => {
    if (!progress) return [];
    const keys = new Set<string>();
    if (progress.years) Object.keys(progress.years).forEach((k) => keys.add(k));
    if (progress.financials)
      Object.keys(progress.financials).forEach((k) => keys.add(k));
    return [...keys].sort();
  }, [progress]);

  /* chart data */
  const trendData = useMemo(() => {
    if (!progress?.years) return [];
    return Object.entries(progress.years)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, d]) => ({
        year: `20${year}`,
        avg: d.overall_avg,
        class: d.class_name,
        rank: d.rank,
        classSize: d.class_size,
      }));
  }, [progress]);

  const currentYear = useMemo(() => {
    if (!progress?.years) return null;
    const sorted = Object.keys(progress.years).sort();
    return progress.years[sorted[sorted.length - 1]];
  }, [progress]);

  const currentYearKey = useMemo(() => {
    if (!progress?.years) return null;
    const sorted = Object.keys(progress.years).sort();
    return sorted[sorted.length - 1];
  }, [progress]);

  const subjectBarData = useMemo(() => {
    if (!currentYear?.subjects) return [];
    return [...currentYear.subjects]
      .sort((a, b) => b.grade - a.grade)
      .map((s) => ({
        subject:
          s.subject.length > 15 ? s.subject.substring(0, 15) + "…" : s.subject,
        fullSubject: s.subject,
        grade: s.grade,
        fill: gradeColor(s.grade),
      }));
  }, [currentYear]);

  const subjectTrend = useMemo(() => {
    if (!progress?.years) return [];
    const years = Object.keys(progress.years).sort();
    if (years.length < 2) return [];
    const prev = progress.years[years[years.length - 2]];
    const curr = progress.years[years[years.length - 1]];
    const prevMap = new Map(prev.subjects.map((s) => [s.subject, s.grade]));
    const currMap = new Map(curr.subjects.map((s) => [s.subject, s.grade]));
    const all = new Set([...prevMap.keys(), ...currMap.keys()]);
    return Array.from(all).map((subject) => ({
      subject:
        subject.length > 12 ? subject.substring(0, 12) + "…" : subject,
      fullSubject: subject,
      [`20${years[years.length - 2]}`]: prevMap.get(subject) ?? 0,
      [`20${years[years.length - 1]}`]: currMap.get(subject) ?? 0,
    }));
  }, [progress]);

  /* ── active financial year (latest) ── */
  const activeFinancialYearKey = useMemo(() => {
    if (!progress?.financials) return null;
    const sorted = Object.keys(progress.financials).sort();
    return sorted[sorted.length - 1];
  }, [progress]);

  const activeFinancials = useMemo(() => {
    if (!progress?.financials || !activeFinancialYearKey) return null;
    return progress.financials[activeFinancialYearKey];
  }, [progress, activeFinancialYearKey]);

  /* ── Set of year keys with outstanding fee balance ── */
  const unpaidYears = useMemo(() => {
    const s = new Set<string>();
    if (!progress?.financials) return s;
    const fin = progress.financials;
    const sortedYears = Object.keys(fin).sort();
    for (let i = 0; i < sortedYears.length; i++) {
      const yr = sortedYears[i];
      const nextYr = sortedYears[i + 1];
      if (nextYr) {
        // Year has debt if next year carries an opening balance > 0
        if ((fin[nextYr]?.opening_balance ?? 0) > 0) s.add(yr);
      } else {
        // Latest year: check current balance
        if (fin[yr].balance > 0) s.add(yr);
      }
    }
    return s;
  }, [progress]);

  const currentYearUnpaid = !!(currentYearKey && unpaidYears.has(currentYearKey));

  const handleSignOut = () => {
    signOut();
    router.push("/");
  };

  if (authLoading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  if (!family) return null;

  const hasFinancials =
    progress?.financials && Object.keys(progress.financials).length > 0;

  return (
    <div className="min-h-screen bg-muted/40">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">{t("parentPortal")}</h1>
              <p className="text-xs text-muted-foreground">
                {t("welcome")}, {family.father_name || family.family_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher variant="icon" />
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className={`h-4 w-4 ${rtl ? "ml-2" : "mr-2"}`} />
              {t("signOut")}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* ── Child Selector ── */}
        {family.children.length > 1 && (
          <div className="mb-6">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4" />
              {t("selectChild")}
            </h2>
            <div className="flex flex-wrap gap-3">
              {family.children.map((child) => (
                <button
                  key={child.student_number}
                  onClick={() => {
                    setSelectedChild(child);
                    setActiveTab("academics");
                  }}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all ${
                    selectedChild?.student_number === child.student_number
                      ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200"
                      : "border-border bg-white hover:border-emerald-300 hover:bg-emerald-50/50"
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${
                      child.gender === "Male" ? "bg-blue-500" : "bg-pink-500"
                    }`}
                  >
                    {child.child_name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium">{child.child_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {child.current_class}
                      {child.current_section
                        ? ` — ${child.current_section}`
                        : ""}
                    </p>
                  </div>
                  {selectedChild?.student_number === child.student_number && (
                    <ChevronRight className="ml-2 h-4 w-4 text-emerald-600" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Loading / Empty ── */}
        {progressLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-pulse text-muted-foreground">
              Loading student data…
            </div>
          </div>
        )}

        {!progressLoading && !progress && selectedChild && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <BookOpen className="mb-4 h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground">
                No records found for {selectedChild.child_name}.
              </p>
            </CardContent>
          </Card>
        )}

        {!progressLoading && progress && currentYear && (
          <>
            {/* ── Notification Alerts ── */}
            {parentNotifications.length > 0 && (
              <div className="mb-6 space-y-2">
                {parentNotifications.map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 rounded-lg border-l-4 p-4 ${
                      n.severity === "critical"
                        ? "border-l-red-500 bg-red-50"
                        : n.severity === "warning"
                        ? "border-l-amber-500 bg-amber-50"
                        : "border-l-blue-500 bg-blue-50"
                    }`}
                  >
                    <AlertTriangle
                      className={`mt-0.5 h-5 w-5 flex-shrink-0 ${
                        n.severity === "critical"
                          ? "text-red-500"
                          : n.severity === "warning"
                          ? "text-amber-500"
                          : "text-blue-500"
                      }`}
                    />
                    <div>
                      <p className="text-sm font-semibold">{n.title}</p>
                      <p className="text-sm text-muted-foreground">{n.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Student Info Banner ── */}
            <div className="mb-6 rounded-xl border bg-gradient-to-r from-emerald-50 to-blue-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">
                    {progress.student_name || selectedChild?.child_name}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {currentYear.class_name}
                    {currentYear.section_name
                      ? ` — ${currentYear.section_name}`
                      : ""}
                    {" · "}
                    {currentYear.school === "0021-01"
                      ? "Boys' School"
                      : currentYear.school === "0021-02"
                      ? "Girls' School"
                      : ""}
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-600">
                      {currentYear.overall_avg}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Overall Avg (
                      {currentYear.exam_label || `20${currentYearKey}`})
                    </p>
                  </div>
                  {currentYear.rank && (
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-600">
                        #{currentYear.rank}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        of {currentYear.class_size} students
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Tab Switcher ── */}
            <div className="mb-6 flex rounded-lg border bg-white p-1">
              <button
                onClick={() => setActiveTab("academics")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all ${
                  activeTab === "academics"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <GraduationCap className="h-4 w-4" />
                {t("academics")}
              </button>
              <button
                onClick={() => setActiveTab("attendance")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all ${
                  activeTab === "attendance"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <CalendarX className="h-4 w-4" />
                {t("childAttendance")}
              </button>
              {hasFinancials && (
                <button
                  onClick={() => setActiveTab("financials")}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all ${
                    activeTab === "financials"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <Wallet className="h-4 w-4" />
                  {t("financials")}
                  {activeFinancials && activeFinancials.balance > 0 && (
                    <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                      {t("balanceDue")}
                    </span>
                  )}
                </button>
              )}
              <button
                onClick={() => {
                  setActiveTab("progress_report");
                  if (selectedChild) fetchProgressReports(selectedChild.student_number);
                }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all ${
                  activeTab === "progress_report"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <ClipboardList className="h-4 w-4" />
                Progress Report
              </button>
            </div>

            {/* ═══════════════════════════════════════════════════ */}
            {/*  ACADEMICS TAB                                     */}
            {/* ═══════════════════════════════════════════════════ */}
            {activeTab === "academics" && (
              <>
                {/* Fee Restriction Banner */}
                {currentYearUnpaid && (
                  <Card className="mb-6 border-red-200 bg-red-50">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="mb-4 rounded-full bg-red-100 p-4">
                        <Lock className="h-8 w-8 text-red-500" />
                      </div>
                      <h3 className="mb-2 text-lg font-bold text-red-700">
                        Academic Records Restricted
                      </h3>
                      <p className="max-w-md text-sm text-red-600">
                        Grades, report cards, and academic analysis for the
                        current academic year are not available until outstanding
                        fees are cleared. Please visit the Financials tab to
                        review your balance.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4 border-red-300 text-red-700 hover:bg-red-100"
                        onClick={() => setActiveTab("financials")}
                      >
                        <Wallet className="mr-2 h-4 w-4" />
                        View Fees
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {!currentYearUnpaid && (
                <>
                {/* ── KPI Cards ── */}
                <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-emerald-100 p-2">
                          <Award className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">
                            {currentYear.strongest.grade}%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Best: {currentYear.strongest.subject}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-amber-100 p-2">
                          <AlertTriangle className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">
                            {currentYear.weakest.grade}%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Needs work: {currentYear.weakest.subject}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-blue-100 p-2">
                          <BookOpen className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">
                            {currentYear.subjects.length}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Subjects
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-purple-100 p-2">
                          <TrendingUp className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">
                            {allYearKeys.length}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Years Tracked
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* ── Year-over-Year Trend ── */}
                {trendData.length > 1 && (
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <TrendingUp className="h-4 w-4" />
                        Academic Progress Over Time
                      </CardTitle>
                      <CardDescription>
                        Overall average across academic years
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={trendData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="year" fontSize={12} />
                          <YAxis domain={[0, 100]} fontSize={12} />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const d = payload[0].payload;
                              return (
                                <div className="rounded-lg border bg-white p-3 shadow-lg">
                                  <p className="font-semibold">{d.year}</p>
                                  <p className="text-sm text-emerald-600">
                                    Average: {d.avg}%
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {d.class}
                                  </p>
                                  {d.rank && (
                                    <p className="text-sm text-blue-600">
                                      Rank: #{d.rank} of {d.classSize}
                                    </p>
                                  )}
                                </div>
                              );
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="avg"
                            stroke="#10b981"
                            strokeWidth={3}
                            dot={{ fill: "#10b981", r: 6 }}
                            activeDot={{ r: 8 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* ── Subject Grades (Current Year) ── */}
                <div className="mb-6 grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Subject Grades —{" "}
                        {currentYearKey ? `20${currentYearKey}` : ""}
                      </CardTitle>
                      <CardDescription>
                        {currentYear.exam_label || "Latest assessment"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer
                        width="100%"
                        height={Math.max(300, subjectBarData.length * 35)}
                      >
                        <BarChart
                          data={subjectBarData}
                          layout="vertical"
                          margin={{ left: 10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            type="number"
                            domain={[0, 100]}
                            fontSize={12}
                          />
                          <YAxis
                            type="category"
                            dataKey="subject"
                            width={120}
                            fontSize={11}
                            tick={{ fill: "#6b7280" }}
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const d = payload[0].payload;
                              return (
                                <div className="rounded-lg border bg-white p-3 shadow-lg">
                                  <p className="font-semibold">
                                    {d.fullSubject}
                                  </p>
                                  <p
                                    style={{ color: d.fill }}
                                    className="text-sm font-bold"
                                  >
                                    {d.grade}%
                                  </p>
                                </div>
                              );
                            }}
                          />
                          <Bar dataKey="grade" radius={[0, 4, 4, 0]}>
                            {subjectBarData.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {subjectTrend.length > 0 ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">
                          Year-over-Year Subject Comparison
                        </CardTitle>
                        <CardDescription>
                          Comparing last two academic years
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={400}>
                          <RadarChart data={subjectTrend} outerRadius="70%">
                            <PolarGrid />
                            <PolarAngleAxis dataKey="subject" fontSize={10} />
                            <PolarRadiusAxis domain={[0, 100]} tick={false} />
                            {Object.keys(subjectTrend[0] || {})
                              .filter(
                                (k) => k !== "subject" && k !== "fullSubject"
                              )
                              .map((yearKey, i) => (
                                <Radar
                                  key={yearKey}
                                  name={yearKey}
                                  dataKey={yearKey}
                                  stroke={i === 0 ? "#94a3b8" : "#10b981"}
                                  fill={i === 0 ? "#94a3b8" : "#10b981"}
                                  fillOpacity={i === 0 ? 0.1 : 0.2}
                                  strokeWidth={2}
                                />
                              ))}
                            <Legend />
                            <Tooltip />
                          </RadarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">
                          Subject Details
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {currentYear.subjects
                            .slice()
                            .sort((a, b) => b.grade - a.grade)
                            .map((s) => (
                              <div
                                key={s.subject}
                                className="flex items-center justify-between rounded-md border px-3 py-2"
                              >
                                <span className="text-sm">{s.subject}</span>
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-xs font-bold ${gradeBg(
                                    s.grade
                                  )}`}
                                >
                                  {s.grade}%
                                </span>
                              </div>
                            ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* ── Full Academic History Table ── */}
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="text-base">
                      Academic History
                    </CardTitle>
                    <CardDescription>
                      Complete year-by-year overview ({allYearKeys.length}{" "}
                      years)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="px-3 py-2 font-medium text-muted-foreground">
                              Year
                            </th>
                            <th className="px-3 py-2 font-medium text-muted-foreground">
                              Class
                            </th>
                            <th className="px-3 py-2 font-medium text-muted-foreground">
                              Section
                            </th>
                            <th className="px-3 py-2 font-medium text-muted-foreground text-center">
                              Average
                            </th>
                            <th className="px-3 py-2 font-medium text-muted-foreground text-center">
                              Rank
                            </th>
                            <th className="px-3 py-2 font-medium text-muted-foreground text-center">
                              Passed
                            </th>
                            <th className="px-3 py-2 font-medium text-muted-foreground text-center">
                              Failed
                            </th>
                            <th className="px-3 py-2 font-medium text-muted-foreground">
                              Strongest
                            </th>
                            <th className="px-3 py-2 font-medium text-muted-foreground">
                              Weakest
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {allYearKeys.map((yr) => {
                            const data = progress.years?.[yr];
                            const prevYear = allYearKeys
                              .filter(
                                (y) => y < yr && progress.years?.[y]
                              )
                              .pop();
                            const prevAvg =
                              prevYear && progress.years?.[prevYear]
                                ? progress.years[prevYear].overall_avg
                                : null;
                            const diff =
                              data && prevAvg !== null
                                ? data.overall_avg - prevAvg
                                : null;

                            if (!data) {
                              return (
                                <tr
                                  key={yr}
                                  className="border-b hover:bg-muted/50 text-muted-foreground"
                                >
                                  <td className="px-3 py-2 font-medium">
                                    20{yr}
                                  </td>
                                  <td
                                    className="px-3 py-2 text-xs italic"
                                    colSpan={8}
                                  >
                                    No academic records — financial data only
                                  </td>
                                </tr>
                              );
                            }

                            if (unpaidYears.has(yr)) {
                              return (
                                <tr
                                  key={yr}
                                  className="border-b hover:bg-muted/50 text-muted-foreground"
                                >
                                  <td className="px-3 py-2 font-medium">
                                    20{yr}
                                  </td>
                                  <td className="px-3 py-2">{data.class_name}</td>
                                  <td
                                    className="px-3 py-2 text-xs italic text-red-500"
                                    colSpan={7}
                                  >
                                    <Lock className="mr-1 inline h-3 w-3" />
                                    Grades hidden — outstanding fees for this year
                                  </td>
                                </tr>
                              );
                            }

                            return (
                              <tr
                                key={yr}
                                className="border-b hover:bg-muted/50"
                              >
                                <td className="px-3 py-2 font-medium">
                                  20{yr}
                                </td>
                                <td className="px-3 py-2">
                                  {data.class_name}
                                </td>
                                <td className="px-3 py-2">
                                  {data.section_name}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${gradeBg(
                                      data.overall_avg
                                    )}`}
                                  >
                                    {data.overall_avg}%
                                    {diff !== null && diff !== 0 && (
                                      <span
                                        className={
                                          diff > 0
                                            ? "text-emerald-500"
                                            : "text-red-500"
                                        }
                                      >
                                        {diff > 0 ? (
                                          <TrendingUp className="inline h-3 w-3" />
                                        ) : (
                                          <TrendingDown className="inline h-3 w-3" />
                                        )}
                                      </span>
                                    )}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {data.rank ? (
                                    <span className="font-medium text-blue-600">
                                      #{data.rank}
                                      <span className="text-muted-foreground">
                                        /{data.class_size}
                                      </span>
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center font-medium text-emerald-600">
                                  {data.pass_count}
                                </td>
                                <td className="px-3 py-2 text-center font-medium text-red-600">
                                  {data.fail_count || "—"}
                                </td>
                                <td className="px-3 py-2">
                                  <span className="text-emerald-600">
                                    {data.strongest.subject}
                                  </span>
                                  <span className="ml-1 text-xs text-muted-foreground">
                                    ({data.strongest.grade}%)
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  <span className="text-amber-600">
                                    {data.weakest.subject}
                                  </span>
                                  <span className="ml-1 text-xs text-muted-foreground">
                                    ({data.weakest.grade}%)
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* ── Term-by-Term Breakdown / Detailed Subject Table ── */}
                {currentYear.terms && Object.keys(currentYear.terms).length > 0 ? (() => {
                  const termCount = currentYear.term_count ?? 2;
                  const termColumns = termCount === 3
                    ? ["t1_assess", "t1_final", "sem1", "t2_assess", "t2_final", "sem2", "t3_assess", "t3_final", "sem3", "annual"] as const
                    : ["t1_assess", "t1_final", "sem1", "t2_assess", "t2_final", "sem2", "annual"] as const;
                  const activeCols = termColumns.filter(k => currentYear.terms![k]);
                  const allSubjects = new Set<string>();
                  for (const tk of activeCols) {
                    const t = currentYear.terms![tk];
                    if (t) t.subjects.forEach(s => allSubjects.add(s.subject));
                  }
                  const subjectList = Array.from(allSubjects).sort();
                  const lookup: Record<string, Record<string, number>> = {};
                  for (const tk of activeCols) {
                    const t = currentYear.terms![tk];
                    if (t) {
                      lookup[tk] = {};
                      t.subjects.forEach(s => { lookup[tk][s.subject] = s.grade; });
                    }
                  }
                  const termLabels: Record<string, string> = {
                    t1_assess: "T1 Assess", t1_final: "T1 Final", sem1: "Sem 1",
                    t2_assess: "T2 Assess", t2_final: "T2 Final", sem2: "Sem 2",
                    t3_assess: "T3 Assess", t3_final: "T3 Final", sem3: "Sem 3",
                    annual: "Annual",
                  };
                  return (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">
                          Term-by-Term Breakdown —{" "}
                          {currentYearKey ? `20${currentYearKey}` : ""}
                        </CardTitle>
                        <CardDescription>
                          {termCount === 3 ? "3-term year" : "2-term year"} · {subjectList.length} subjects
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-left">
                                <th className="px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-white z-10 min-w-[140px]">
                                  Subject
                                </th>
                                {activeCols.map(tk => (
                                  <th key={tk} className={`px-3 py-2 font-medium text-center min-w-[70px] ${
                                    tk === "annual" ? "text-blue-700 bg-blue-50/50" :
                                    tk.startsWith("sem") ? "text-purple-700 bg-purple-50/50" :
                                    "text-muted-foreground"
                                  }`}>
                                    {termLabels[tk] || tk}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {subjectList.map(subj => (
                                <tr key={subj} className="border-b hover:bg-muted/50">
                                  <td className="px-3 py-2 font-medium sticky left-0 bg-white z-10">
                                    {subj}
                                  </td>
                                  {activeCols.map(tk => {
                                    const g = lookup[tk]?.[subj];
                                    return (
                                      <td key={tk} className={`px-3 py-2 text-center ${
                                        tk === "annual" ? "bg-blue-50/30" :
                                        tk.startsWith("sem") ? "bg-purple-50/30" : ""
                                      }`}>
                                        {g != null ? (
                                          <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${gradeBg(g)}`}>
                                            {g}%
                                          </span>
                                        ) : (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                              <tr className="border-t-2 bg-muted/30 font-semibold">
                                <td className="px-3 py-2 sticky left-0 bg-muted/30 z-10">Average</td>
                                {activeCols.map(tk => {
                                  const t = currentYear.terms![tk];
                                  return (
                                    <td key={tk} className={`px-3 py-2 text-center ${
                                      tk === "annual" ? "bg-blue-50/50" :
                                      tk.startsWith("sem") ? "bg-purple-50/50" : ""
                                    }`}>
                                      {t ? (
                                        <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${gradeBg(t.avg)}`}>
                                          {t.avg}%
                                        </span>
                                      ) : "—"}
                                    </td>
                                  );
                                })}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })() : (
                  /* Fallback: original subject table when no term data */
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Subject Details —{" "}
                        {currentYearKey ? `20${currentYearKey}` : ""}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left">
                              <th className="px-3 py-2 font-medium text-muted-foreground">Subject</th>
                              <th className="px-3 py-2 font-medium text-muted-foreground text-center">Grade</th>
                              <th className="px-3 py-2 font-medium text-muted-foreground text-center">Class Rank</th>
                              <th className="px-3 py-2 font-medium text-muted-foreground text-center">Section Rank</th>
                              <th className="px-3 py-2 font-medium text-muted-foreground">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {currentYear.subjects.slice().sort((a, b) => b.grade - a.grade).map((s) => (
                              <tr key={s.subject} className="border-b hover:bg-muted/50">
                                <td className="px-3 py-2 font-medium">{s.subject}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${gradeBg(s.grade)}`}>
                                    {s.grade}%
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center text-blue-600">{s.class_rank ?? "—"}</td>
                                <td className="px-3 py-2 text-center text-blue-600">{s.section_rank ?? "—"}</td>
                                <td className="px-3 py-2">
                                  {s.grade >= 90 ? <span className="font-medium text-emerald-600">Excellent</span>
                                  : s.grade >= 80 ? <span className="font-medium text-blue-600">Very Good</span>
                                  : s.grade >= 70 ? <span className="font-medium text-amber-600">Good</span>
                                  : s.grade >= 60 ? <span className="font-medium text-orange-600">Satisfactory</span>
                                  : s.grade >= 50 ? <span className="font-medium text-amber-700">Pass</span>
                                  : <span className="font-medium text-red-600">Fail</span>}
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
              </>
            )}

            {/* ═══════════════════════════════════════════════════ */}
            {/*  ATTENDANCE TAB                                    */}
            {/* ═══════════════════════════════════════════════════ */}
            {activeTab === "attendance" && (
              <>
                {attendanceLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="animate-pulse text-muted-foreground">{t("loading")}</div>
                  </div>
                ) : !attendanceData ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16">
                      <CalendarX className="mb-4 h-12 w-12 text-muted-foreground/40" />
                      <p className="text-muted-foreground">{t("noAttendanceRecords")}</p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {/* ── Summary KPIs ── */}
                    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-red-100 p-2">
                              <CalendarX className="h-5 w-5 text-red-600" />
                            </div>
                            <div>
                              <p className="text-2xl font-bold text-red-600">
                                {attendanceData.summary.total_absence_days}
                              </p>
                              <p className="text-xs text-muted-foreground">{t("totalAbsences")}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-amber-100 p-2">
                              <Clock className="h-5 w-5 text-amber-600" />
                            </div>
                            <div>
                              <p className="text-2xl font-bold text-amber-600">
                                {attendanceData.summary.total_tardy_days}
                              </p>
                              <p className="text-xs text-muted-foreground">{t("totalTardies")}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-emerald-100 p-2">
                              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            </div>
                            <div>
                              <p className="text-2xl font-bold text-emerald-600">
                                {attendanceData.yearly_breakdown.length}
                              </p>
                              <p className="text-xs text-muted-foreground">{t("yearsTracked")}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* ── Yearly Breakdown ── */}
                    {attendanceData.yearly_breakdown.length > 0 && (
                      <Card className="mb-6">
                        <CardHeader>
                          <CardTitle className="text-base">{t("attendanceOverview")}</CardTitle>
                          <CardDescription>{t("completeYearOverview")}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b text-left">
                                  <th className="px-3 py-2 font-medium text-muted-foreground">{t("academicYear")}</th>
                                  <th className="px-3 py-2 font-medium text-muted-foreground text-center">{t("absenceDays")}</th>
                                  <th className="px-3 py-2 font-medium text-muted-foreground text-center">{t("tardyDays")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {attendanceData.yearly_breakdown.map((yr) => (
                                  <tr key={yr.year} className="border-b hover:bg-muted/50">
                                    <td className="px-3 py-2 font-medium">20{yr.year}</td>
                                    <td className="px-3 py-2 text-center">
                                      <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${
                                        yr.absences >= 10 ? "bg-red-50 border-red-200 text-red-700"
                                        : yr.absences >= 5 ? "bg-amber-50 border-amber-200 text-amber-700"
                                        : "bg-emerald-50 border-emerald-200 text-emerald-700"
                                      }`}>
                                        {yr.absences}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${
                                        yr.tardies >= 10 ? "bg-amber-50 border-amber-200 text-amber-700"
                                        : "bg-blue-50 border-blue-200 text-blue-700"
                                      }`}>
                                        {yr.tardies}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* ── Monthly Breakdown ── */}
                    {attendanceData.monthly_breakdown.length > 0 && (
                      <Card className="mb-6">
                        <CardHeader>
                          <CardTitle className="text-base">{t("monthlyBreakdown")}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b text-left">
                                  <th className="px-3 py-2 font-medium text-muted-foreground">{t("month")}</th>
                                  <th className="px-3 py-2 font-medium text-muted-foreground text-center">{t("absences")}</th>
                                  <th className="px-3 py-2 font-medium text-muted-foreground text-center">{t("tardies")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {attendanceData.monthly_breakdown.slice(0, 12).map((m) => (
                                  <tr key={m.month} className="border-b hover:bg-muted/50">
                                    <td className="px-3 py-2 font-medium">{m.month}</td>
                                    <td className="px-3 py-2 text-center">
                                      {m.absences > 0 ? (
                                        <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-bold text-red-700">
                                          {m.absences}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground">0</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      {m.tardies > 0 ? (
                                        <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-bold text-amber-700">
                                          {m.tardies}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground">0</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* ── Recent Absences ── */}
                    <div className="grid gap-6 lg:grid-cols-2">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base">
                            <CalendarX className="h-4 w-4 text-red-500" />
                            {t("recentAbsences")}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {attendanceData.absences.length === 0 ? (
                            <p className="py-4 text-center text-sm text-muted-foreground">{t("noAbsenceRecords")}</p>
                          ) : (
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {attendanceData.absences.slice(0, 20).map((a, i) => (
                                <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2">
                                  <div>
                                    <p className="text-sm font-medium">{a.date}</p>
                                    {a.reason_desc && (
                                      <p className="text-xs text-muted-foreground">{a.reason_desc}</p>
                                    )}
                                  </div>
                                  <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-bold text-red-700">
                                    {a.days} {a.days === 1 ? "day" : "days"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Clock className="h-4 w-4 text-amber-500" />
                            {t("recentTardies")}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {attendanceData.tardies.length === 0 ? (
                            <p className="py-4 text-center text-sm text-muted-foreground">{t("noTardyRecords")}</p>
                          ) : (
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {attendanceData.tardies.slice(0, 20).map((td, i) => (
                                <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2">
                                  <div>
                                    <p className="text-sm font-medium">{td.date}</p>
                                    {td.reason_desc && (
                                      <p className="text-xs text-muted-foreground">{td.reason_desc}</p>
                                    )}
                                  </div>
                                  <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-bold text-amber-700">
                                    {t("late")}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </>
                )}
              </>
            )}

            {/* ═══════════════════════════════════════════════════ */}
            {/*  FINANCIALS TAB                                    */}
            {/* ═══════════════════════════════════════════════════ */}
            {activeTab === "financials" && hasFinancials && activeFinancials && activeFinancialYearKey && (
              <>
                {/* ── Active Year Header ── */}
                <div className="mb-4 flex items-center gap-2">
                  <h3 className="text-lg font-semibold">Academic Year 20{activeFinancialYearKey}</h3>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>
                </div>

                {/* ── Financial Summary Cards ── */}
                <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-blue-100 p-2">
                          <Receipt className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-xl font-bold text-blue-700">
                            {formatSAR(activeFinancials.total_charged)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Total Fees
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-emerald-100 p-2">
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-xl font-bold text-emerald-700">
                            {formatSAR(activeFinancials.total_paid)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Paid
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  {activeFinancials.total_discount > 0 && (
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-purple-100 p-2">
                            <CircleDollarSign className="h-5 w-5 text-purple-600" />
                          </div>
                          <div>
                            <p className="text-xl font-bold text-purple-700">
                              {formatSAR(activeFinancials.total_discount)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Discount
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`rounded-lg p-2 ${
                            activeFinancials.balance <= 0
                              ? "bg-emerald-100"
                              : "bg-amber-100"
                          }`}
                        >
                          <Wallet
                            className={`h-5 w-5 ${
                              activeFinancials.balance <= 0
                                ? "text-emerald-600"
                                : "text-amber-600"
                            }`}
                          />
                        </div>
                        <div>
                          <p
                            className={`text-xl font-bold ${
                              activeFinancials.balance <= 0
                                ? "text-emerald-700"
                                : "text-amber-700"
                            }`}
                          >
                            {formatSAR(activeFinancials.balance)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Outstanding Balance
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* ── Active Year Financial Breakdown ── */}
                {(() => {
                  const fin = activeFinancials;
                  const yr = activeFinancialYearKey;
                  const paidPct =
                    fin.total_charged > 0
                      ? Math.round(
                          ((fin.total_paid + fin.total_discount) /
                            fin.total_charged) *
                            100
                        )
                      : 100;
                  const isCleared = fin.balance <= 0;

                  return (
                    <Card className="mb-4">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">
                            Payment Details
                          </CardTitle>
                          {isCleared ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              Fully Paid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                              <CircleDollarSign className="h-3 w-3" />
                              Balance Due
                            </span>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Progress bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Payment Progress</span>
                            <span>{paidPct}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                            <div
                              className={`h-full rounded-full transition-all ${
                                paidPct >= 100
                                  ? "bg-emerald-500"
                                  : paidPct >= 50
                                  ? "bg-blue-500"
                                  : "bg-amber-500"
                              }`}
                              style={{
                                width: `${Math.min(paidPct, 100)}%`,
                              }}
                            />
                          </div>
                        </div>

                        {/* Installment breakdown table */}
                        {fin.installments.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b text-left">
                                  <th className="px-3 py-2 font-medium text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Receipt className="h-3 w-3" />
                                      Installment
                                    </span>
                                  </th>
                                  <th className="px-3 py-2 font-medium text-muted-foreground text-right">
                                    Charged
                                  </th>
                                  <th className="px-3 py-2 font-medium text-muted-foreground text-right">
                                    Paid
                                  </th>
                                  {fin.installments.some(
                                    (i) => i.discount > 0
                                  ) && (
                                    <th className="px-3 py-2 font-medium text-muted-foreground text-right">
                                      Discount
                                    </th>
                                  )}
                                  <th className="px-3 py-2 font-medium text-muted-foreground text-right">
                                    Balance
                                  </th>
                                  <th className="px-3 py-2 font-medium text-muted-foreground text-center">
                                    Status
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {fin.installments.map((inst) => {
                                  const instCleared = inst.balance <= 0;
                                  return (
                                    <tr
                                      key={inst.label}
                                      className="border-b hover:bg-muted/50"
                                    >
                                      <td className="px-3 py-2 font-medium">
                                        {inst.label}
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        {formatSAR(inst.charged)}
                                      </td>
                                      <td className="px-3 py-2 text-right text-emerald-600">
                                        {formatSAR(inst.paid)}
                                      </td>
                                      {fin.installments.some(
                                        (i) => i.discount > 0
                                      ) && (
                                        <td className="px-3 py-2 text-right text-purple-600">
                                          {inst.discount > 0
                                            ? formatSAR(inst.discount)
                                            : "—"}
                                        </td>
                                      )}
                                      <td
                                        className={`px-3 py-2 text-right font-medium ${
                                          instCleared
                                            ? "text-emerald-600"
                                            : "text-amber-600"
                                        }`}
                                      >
                                        {formatSAR(inst.balance)}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        {instCleared ? (
                                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Paid
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                                            Pending
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })()}
              </>
            )}

            {/* ═══════════════════════════════════════════════════ */}
            {/*  PROGRESS REPORT TAB                               */}
            {/* ═══════════════════════════════════════════════════ */}
            {activeTab === "progress_report" && (
              <>
                {progressLoading2 ? (
                  <Card>
                    <CardContent className="flex items-center justify-center py-12">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
                    </CardContent>
                  </Card>
                ) : progressReports.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <ClipboardList className="mx-auto mb-3 h-10 w-10 opacity-40" />
                      <p className="font-medium">No progress reports available yet.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {/* Month filter */}
                    <div className="mb-4 flex items-center gap-3">
                      <label className="text-sm font-medium">Month:</label>
                      <select
                        className="rounded-md border px-3 py-1.5 text-sm"
                        value={prSelectedMonth}
                        onChange={(e) => setPrSelectedMonth(e.target.value)}
                      >
                        <option value="all">All Months</option>
                        {PR_MONTHS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>

                    {/* Group by month */}
                    {(() => {
                      const filtered = prSelectedMonth === "all"
                        ? progressReports
                        : progressReports.filter((r) => r.month === prSelectedMonth);
                      const byMonth = filtered.reduce<Record<string, ProgressReportEntry[]>>((acc, r) => {
                        (acc[r.month] = acc[r.month] || []).push(r);
                        return acc;
                      }, {});
                      const monthOrder = PR_MONTHS.filter((m) => byMonth[m]);

                      return monthOrder.map((month) => (
                        <Card key={month} className="mb-4">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base">{month}</CardTitle>
                            <CardDescription>{byMonth[month][0]?.term}</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b text-left">
                                    <th className="pb-2 pr-4 font-medium">Subject</th>
                                    <th className="pb-2 pr-4 font-medium">Academic Performance</th>
                                    <th className="pb-2 pr-4 font-medium">Homework</th>
                                    <th className="pb-2 pr-4 font-medium">Participation</th>
                                    <th className="pb-2 pr-4 font-medium">Conduct</th>
                                    <th className="pb-2 font-medium">Notes</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {byMonth[month].map((r) => (
                                    <tr key={r.subject} className="border-b last:border-0">
                                      <td className="py-2 pr-4 font-medium">{r.subject}</td>
                                      <td className="py-2 pr-4">
                                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                                          r.academic_performance.includes("Outstanding") ? "bg-green-50 text-green-700" :
                                          r.academic_performance.includes("Strong") ? "bg-blue-50 text-blue-700" :
                                          r.academic_performance.includes("Consistent") ? "bg-yellow-50 text-yellow-700" :
                                          r.academic_performance.includes("Improvement") ? "bg-orange-50 text-orange-600" :
                                          r.academic_performance.includes("Major") ? "bg-red-50 text-red-600" :
                                          r.academic_performance.includes("Danger") ? "bg-red-100 text-red-800" : ""
                                        }`}>
                                          {r.academic_performance}
                                        </span>
                                      </td>
                                      <td className="py-2 pr-4">
                                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                                          r.homework_effort.includes("Consistently") ? "bg-green-50 text-green-700" :
                                          r.homework_effort.includes("Partially") ? "bg-yellow-50 text-yellow-700" :
                                          "bg-red-50 text-red-700"
                                        }`}>
                                          {r.homework_effort}
                                        </span>
                                      </td>
                                      <td className="py-2 pr-4">
                                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                                          r.participation.includes("Highly") ? "bg-green-50 text-green-700" :
                                          r.participation.includes("Partially") ? "bg-yellow-50 text-yellow-700" :
                                          "bg-red-50 text-red-700"
                                        }`}>
                                          {r.participation}
                                        </span>
                                      </td>
                                      <td className="py-2 pr-4">
                                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                                          r.conduct.includes("Respectful") ? "bg-green-50 text-green-700" :
                                          r.conduct.includes("Disruptive") ? "bg-yellow-50 text-yellow-700" :
                                          "bg-red-50 text-red-700"
                                        }`}>
                                          {r.conduct}
                                        </span>
                                      </td>
                                      <td className="py-2 text-muted-foreground">{r.notes || "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </CardContent>
                        </Card>
                      ));
                    })()}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
