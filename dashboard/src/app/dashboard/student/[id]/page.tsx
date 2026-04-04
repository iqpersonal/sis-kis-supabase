"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  User,
  ArrowLeft,
  Printer,
  GraduationCap,
  BookOpen,
  TrendingUp,
  TrendingDown,
  Award,
  AlertTriangle,
  Calendar,
  MapPin,
  FileText,
  CreditCard,
  Globe,
  Users,
  School,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SubjectGrade {
  subject: string;
  grade: number;
  credit_hours?: number;
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
  transcript_subjects?: SubjectGrade[];
}

interface FinancialTerm {
  term: number;
  label: string;
  totalCharges: number;
  totalPaid: number;
  totalDiscount: number;
  outstandingBalance: number;
}

interface StudentProfile {
  student_number: string;
  student_name: string;
  student_name_ar: string;
  gender: string;
  dob: string;
  birth_place_en: string;
  birth_place_ar: string;
  nationality_en: string;
  nationality_ar: string;
  family_number: string;
  passport_id: string;
  iqama_number: string;
  enrollment_date: string;
  prev_school_en: string;
  prev_school_ar: string;
  prev_school_year: string;
  years: Record<string, YearData>;
  financials?: {
    installments: FinancialTerm[];
    totalCharges: number;
    totalPaid: number;
    totalBalance: number;
  } | null;
  raw_student: Record<string, unknown>;
  raw_family_child: Record<string, unknown>;
  raw_family: Record<string, unknown>;
  updated_at: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function gradeColor(grade: number): string {
  if (grade >= 90) return "text-emerald-600";
  if (grade >= 80) return "text-blue-600";
  if (grade >= 70) return "text-amber-600";
  if (grade >= 60) return "text-orange-600";
  return "text-red-600";
}

function gradeBadge(grade: number): string {
  if (grade >= 90) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (grade >= 80) return "bg-blue-100 text-blue-700 border-blue-200";
  if (grade >= 70) return "bg-amber-100 text-amber-700 border-amber-200";
  if (grade >= 60) return "bg-orange-100 text-orange-700 border-orange-200";
  return "bg-red-100 text-red-700 border-red-200";
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

function gradeLetterFromAvg(avg: number): string {
  if (avg >= 97) return "A+";
  if (avg >= 93) return "A";
  if (avg >= 90) return "A-";
  if (avg >= 87) return "B+";
  if (avg >= 83) return "B";
  if (avg >= 80) return "B-";
  if (avg >= 77) return "C+";
  if (avg >= 73) return "C";
  if (avg >= 70) return "C-";
  if (avg >= 67) return "D+";
  if (avg >= 63) return "D";
  if (avg >= 60) return "D-";
  return "F";
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: studentId } = use(params);
  const router = useRouter();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedYear, setExpandedYear] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;

    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/student-profile?studentNumber=${encodeURIComponent(studentId)}`
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Error ${res.status}`);
        }
        const { data } = await res.json();
        setProfile(data);

        // Auto-expand latest year
        const years = Object.keys(data.years || {}).sort();
        if (years.length > 0) {
          setExpandedYear(years[years.length - 1]);
        }
      } catch (err: unknown) {
        console.error("Profile fetch error:", err);
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [studentId]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading student profile…</span>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-12 w-12 text-red-400" />
        <p className="text-lg font-medium text-red-600">{error || "Student not found"}</p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  const sortedYears = Object.keys(profile.years).sort();
  const latestYear = sortedYears[sortedYears.length - 1];
  const latestYearData = latestYear ? profile.years[latestYear] : null;

  // Calculate overall stats
  const allAvgs = sortedYears.map((y) => profile.years[y].overall_avg);
  const overallGPA = allAvgs.length
    ? Math.round((allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length) * 10) / 10
    : 0;

  // Trend: is student improving?
  const trend =
    allAvgs.length >= 2
      ? allAvgs[allAvgs.length - 1] - allAvgs[allAvgs.length - 2]
      : 0;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Student Profile</h1>
          <p className="text-sm text-muted-foreground">
            Comprehensive view of student information and academic history
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            window.open(
              `/transcript?student=${encodeURIComponent(profile.student_number)}`,
              "_blank"
            )
          }
        >
          <Printer className="mr-2 h-4 w-4" />
          Print Transcript
        </Button>
      </div>

      {/* ── Identity Card ── */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 to-slate-700 px-6 py-6 text-white">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/15 text-2xl font-bold shrink-0">
              {profile.student_name
                ? profile.student_name.charAt(0).toUpperCase()
                : "?"}
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold truncate">{profile.student_name || "—"}</h2>
              {profile.student_name_ar && (
                <p className="text-white/70 text-base mt-0.5" dir="rtl">
                  {profile.student_name_ar}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge className="bg-white/20 hover:bg-white/30 border-0 text-white">
                  {profile.student_number}
                </Badge>
                <Badge className="bg-white/20 hover:bg-white/30 border-0 text-white">
                  {profile.gender || "—"}
                </Badge>
                {latestYearData && (
                  <>
                    <Badge className="bg-white/20 hover:bg-white/30 border-0 text-white">
                      {latestYearData.class_name}
                    </Badge>
                    {latestYearData.section_name && (
                      <Badge className="bg-white/10 hover:bg-white/20 border-0 text-white/80">
                        {latestYearData.section_name}
                      </Badge>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="hidden md:flex gap-4 shrink-0">
              <div className="text-center px-4">
                <p className="text-[11px] uppercase tracking-wider text-white/50">GPA Average</p>
                <p className="text-3xl font-bold mt-1">{overallGPA}</p>
                <p className="text-xs text-white/60">{gradeLetterFromAvg(overallGPA)}</p>
              </div>
              <div className="text-center px-4 border-l border-white/20">
                <p className="text-[11px] uppercase tracking-wider text-white/50">Trend</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  {trend >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-red-400" />
                  )}
                  <span
                    className={`text-xl font-bold ${
                      trend >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {trend >= 0 ? "+" : ""}
                    {trend.toFixed(1)}
                  </span>
                </div>
                <p className="text-xs text-white/60">vs previous year</p>
              </div>
              <div className="text-center px-4 border-l border-white/20">
                <p className="text-[11px] uppercase tracking-wider text-white/50">Years</p>
                <p className="text-3xl font-bold mt-1">{sortedYears.length}</p>
                <p className="text-xs text-white/60">academic</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Info Grid ── */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Personal Information */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4 text-blue-500" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Full Name (EN)" value={profile.student_name} />
            <InfoRow label="Full Name (AR)" value={profile.student_name_ar} dir="rtl" />
            <InfoRow label="Gender" value={profile.gender} />
            <InfoRow
              label="Date of Birth"
              value={formatDate(profile.dob)}
              icon={<Calendar className="h-3.5 w-3.5 text-muted-foreground" />}
            />
            <InfoRow
              label="Birth Place"
              value={profile.birth_place_en || profile.birth_place_ar || "—"}
              icon={<MapPin className="h-3.5 w-3.5 text-muted-foreground" />}
            />
            <InfoRow
              label="Nationality"
              value={profile.nationality_en}
              extra={profile.nationality_ar}
              icon={<Globe className="h-3.5 w-3.5 text-muted-foreground" />}
            />
            <InfoRow
              label="Family Number"
              value={profile.family_number}
              icon={<Users className="h-3.5 w-3.5 text-muted-foreground" />}
            />
          </CardContent>
        </Card>

        {/* Documents & IDs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-purple-500" />
              Documents & IDs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow
              label="Student Number"
              value={profile.student_number}
              mono
            />
            <InfoRow
              label="Passport Number"
              value={profile.passport_id || "Not recorded"}
              icon={
                profile.passport_id ? (
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                )
              }
            />
            <InfoRow
              label="Iqama Number"
              value={profile.iqama_number || "Not recorded"}
              icon={
                profile.iqama_number ? (
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                )
              }
              mono
            />
            <Separator className="my-2" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CreditCard className="h-3.5 w-3.5" />
              <span>Document expiry tracking available in Documents page</span>
            </div>
          </CardContent>
        </Card>

        {/* Enrollment */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <School className="h-4 w-4 text-indigo-500" />
              Enrollment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow
              label="Enrollment Date"
              value={formatDate(profile.enrollment_date)}
              icon={<Calendar className="h-3.5 w-3.5 text-muted-foreground" />}
            />
            <InfoRow
              label="Current Class"
              value={latestYearData?.class_name || "—"}
            />
            <InfoRow
              label="Section"
              value={latestYearData?.section_name || "—"}
            />
            {latestYearData?.rank && (
              <InfoRow
                label="Class Rank"
                value={`${latestYearData.rank} of ${latestYearData.class_size || "?"}`}
                icon={<Award className="h-3.5 w-3.5 text-amber-500" />}
              />
            )}
            <Separator className="my-2" />
            {profile.prev_school_en && (
              <InfoRow
                label="Previous School"
                value={profile.prev_school_en}
                icon={<School className="h-3.5 w-3.5 text-muted-foreground" />}
              />
            )}
            {profile.prev_school_year && (
              <InfoRow label="Transfer Year" value={profile.prev_school_year} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Academic History ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-blue-500" />
            Academic History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedYears.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No academic records found.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Year summary cards */}
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {sortedYears.map((year) => {
                  const yd = profile.years[year];
                  // Convert "22-23" → "2022–2023"
                  const parts = year.split("-");
                  let label = year;
                  if (parts.length === 2) {
                    const a = Number(parts[0]);
                    const b = Number(parts[1]);
                    if (!isNaN(a) && !isNaN(b)) {
                      const y1 = a >= 50 ? 1900 + a : 2000 + a;
                      const y2 = b >= 50 ? 1900 + b : 2000 + b;
                      label = `${y1}–${y2}`;
                    }
                  }
                  const isExpanded = expandedYear === year;
                  return (
                    <button
                      key={year}
                      onClick={() =>
                        setExpandedYear(isExpanded ? null : year)
                      }
                      className={`w-full text-left rounded-xl border-2 p-4 transition-all hover:shadow-md ${
                        isExpanded
                          ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
                          : "border-muted hover:border-blue-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {label}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-blue-500" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex items-end gap-2">
                        <span className={`text-2xl font-bold ${gradeColor(yd.overall_avg)}`}>
                          {yd.overall_avg}
                        </span>
                        <span className="text-xs text-muted-foreground mb-1">
                          {gradeLetterFromAvg(yd.overall_avg)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant="secondary" className="text-[10px]">
                          {yd.class_name}
                        </Badge>
                        {yd.rank && (
                          <span className="text-[10px] text-muted-foreground">
                            Rank {yd.rank}/{yd.class_size}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Expanded year detail */}
              {expandedYear && profile.years[expandedYear] && (
                <YearDetail year={expandedYear} data={profile.years[expandedYear]} />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Financial Summary (if available) ── */}
      {profile.financials && profile.financials.installments && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-green-500" />
              Financial Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Summary tiles */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="rounded-lg border bg-muted/40 p-4 text-center">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Total Charges
                </p>
                <p className="text-xl font-bold mt-1">
                  {(profile.financials.totalCharges ?? 0).toLocaleString()} SAR
                </p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-4 text-center">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Total Paid
                </p>
                <p className="text-xl font-bold text-emerald-600 mt-1">
                  {(profile.financials.totalPaid ?? 0).toLocaleString()} SAR
                </p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-4 text-center">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Outstanding
                </p>
                <p
                  className={`text-xl font-bold mt-1 ${
                    (profile.financials.totalBalance ?? 0) > 0
                      ? "text-red-600"
                      : "text-emerald-600"
                  }`}
                >
                  {(profile.financials.totalBalance ?? 0).toLocaleString()} SAR
                </p>
              </div>
            </div>

            {/* Term breakdown */}
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs">Term</TableHead>
                    <TableHead className="text-right text-xs">Charges</TableHead>
                    <TableHead className="text-right text-xs">Paid</TableHead>
                    <TableHead className="text-right text-xs">Discount</TableHead>
                    <TableHead className="text-right text-xs">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profile.financials.installments.map((t) => (
                    <TableRow key={t.term}>
                      <TableCell className="text-sm font-medium">{t.label}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {t.totalCharges.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {t.totalPaid.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {t.totalDiscount.toLocaleString()}
                      </TableCell>
                      <TableCell
                        className={`text-right text-sm font-bold tabular-nums ${
                          t.outstandingBalance > 0 ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {t.outstandingBalance.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Metadata ── */}
      <div className="text-xs text-muted-foreground text-right pb-4">
        Last updated: {profile.updated_at ? formatDate(profile.updated_at) : "—"}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Year Detail Subcomponent                                           */
/* ------------------------------------------------------------------ */

function YearDetail({ year, data }: { year: string; data: YearData }) {
  // Convert year code to label
  const parts = year.split("-");
  let label = year;
  if (parts.length === 2) {
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if (!isNaN(a) && !isNaN(b)) {
      const y1 = a >= 50 ? 1900 + a : 2000 + a;
      const y2 = b >= 50 ? 1900 + b : 2000 + b;
      label = `${y1}–${y2}`;
    }
  }

  const subjects = data.subjects || [];
  const sortedSubjects = [...subjects].sort((a, b) => b.grade - a.grade);

  // Term data
  const termOrder = [
    "t1_assess",
    "t1_final",
    "sem1",
    "t2_assess",
    "t2_final",
    "sem2",
    "t3_assess",
    "t3_final",
    "sem3",
    "annual",
  ];
  const availableTerms = data.terms
    ? termOrder.filter((t) => data.terms![t])
    : [];

  return (
    <div className="rounded-xl border-2 border-blue-200 bg-blue-50/30 dark:bg-blue-950/10 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-blue-500" />
          {label} — {data.class_name}
        </h3>
        <div className="flex items-center gap-3">
          {data.rank && (
            <Badge variant="secondary" className="gap-1">
              <Award className="h-3 w-3" />
              Rank {data.rank}/{data.class_size}
            </Badge>
          )}
          <Badge className={`border ${gradeBadge(data.overall_avg)}`}>
            Avg: {data.overall_avg}
          </Badge>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Overall Average" value={`${data.overall_avg}`} sub={gradeLetterFromAvg(data.overall_avg)} />
        <KpiTile
          label="Pass / Fail"
          value={`${data.pass_count} / ${data.fail_count}`}
          sub={`${Math.round((data.pass_count / Math.max(data.pass_count + data.fail_count, 1)) * 100)}% pass rate`}
        />
        <KpiTile
          label="Strongest"
          value={data.strongest?.subject || "—"}
          sub={`${data.strongest?.grade ?? 0}`}
          color="text-emerald-600"
        />
        <KpiTile
          label="Weakest"
          value={data.weakest?.subject || "—"}
          sub={`${data.weakest?.grade ?? 0}`}
          color="text-red-600"
        />
      </div>

      {/* Term progress (if available) */}
      {availableTerms.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
            Term Progress
          </h4>
          <div className="flex gap-2 flex-wrap">
            {availableTerms.map((termKey) => {
              const term = data.terms![termKey];
              return (
                <div
                  key={termKey}
                  className="flex-1 min-w-[100px] rounded-lg border bg-white dark:bg-card p-3 text-center"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 truncate">
                    {term.label}
                  </p>
                  <p className={`text-xl font-bold ${gradeColor(term.avg)}`}>
                    {term.avg}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Subject grades table */}
      <div className="rounded-lg border overflow-hidden bg-white dark:bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs">#</TableHead>
              <TableHead className="text-xs">Subject</TableHead>
              <TableHead className="text-right text-xs w-24">Grade</TableHead>
              <TableHead className="text-right text-xs w-24">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedSubjects.map((s, i) => (
              <TableRow key={s.subject}>
                <TableCell className="text-xs text-muted-foreground w-8">
                  {i + 1}
                </TableCell>
                <TableCell className="text-sm font-medium">{s.subject}</TableCell>
                <TableCell className="text-right">
                  <Badge className={`border font-bold text-xs tabular-nums ${gradeBadge(s.grade)}`}>
                    {s.grade}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {s.grade >= 50 ? (
                    <Badge variant="secondary" className="text-[10px] bg-emerald-50 text-emerald-600 border-emerald-200">
                      Pass
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] bg-red-50 text-red-600 border-red-200">
                      Fail
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reusable subcomponents                                             */
/* ------------------------------------------------------------------ */

function InfoRow({
  label,
  value,
  extra,
  icon,
  mono,
  dir,
}: {
  label: string;
  value: string;
  extra?: string;
  icon?: React.ReactNode;
  mono?: boolean;
  dir?: "rtl" | "ltr";
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <div className="text-right min-w-0">
        <span
          className={`text-sm font-medium truncate block ${mono ? "font-mono" : ""}`}
          dir={dir}
        >
          {value || "—"}
        </span>
        {extra && (
          <span className="text-xs text-muted-foreground block" dir="rtl">
            {extra}
          </span>
        )}
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border bg-white dark:bg-card p-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </p>
      <p className={`text-lg font-bold truncate ${color || ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
