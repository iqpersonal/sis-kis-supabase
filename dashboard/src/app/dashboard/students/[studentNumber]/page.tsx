"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronLeft,
  Loader2,
  User,
  GraduationCap,
  CalendarOff,
  Wallet,
  FileText,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Minus,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useLanguage } from "@/context/language-context";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SubjectGrade {
  subject: string;
  subject_ar?: string;
  grade: number | string;
}

interface YearData {
  class_code?: string;
  class_name?: string;
  section_code?: string;
  section_name?: string;
  school?: string;
  overall_avg?: number;
  subjects?: SubjectGrade[];
  terms?: Record<string, { subjects?: SubjectGrade[]; avg?: number }>;
}

interface FinancialYear {
  total_charged: number;
  total_paid: number;
  total_discount: number;
  balance: number;
  installments?: { label: string; charged: number; paid: number; discount: number; balance: number }[];
}

interface StudentProfile {
  student_number: string;
  student_name: string;
  student_name_ar: string;
  gender: string;
  dob: string;
  birth_place_en: string;
  nationality_en: string;
  nationality_ar: string;
  family_number: string;
  passport_id: string;
  iqama_number: string;
  enrollment_date: string;
  prev_school_en: string;
  years: Record<string, YearData>;
  financials: Record<string, FinancialYear> | null;
  raw_student?: Record<string, unknown>;
}

interface AttendanceRecord {
  date: string;
  status: string;
  days?: number;
  year?: string;
  source?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getDocStatus(id: string | undefined, expiry: string | undefined): {
  label: string;
  color: string;
  icon: typeof CheckCircle;
} {
  if (!id) return { label: "Missing", color: "text-red-500", icon: XCircle };
  if (!expiry) return { label: "No Expiry", color: "text-yellow-500", icon: Minus };
  const exp = new Date(expiry);
  const now = new Date();
  const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
  if (daysLeft < 0) return { label: `Expired (${Math.abs(daysLeft)}d ago)`, color: "text-red-500", icon: XCircle };
  if (daysLeft <= 90) return { label: `Expiring (${daysLeft}d)`, color: "text-yellow-500", icon: AlertTriangle };
  return { label: "Valid", color: "text-green-500", icon: CheckCircle };
}

const PIE_COLORS = ["hsl(142, 76%, 36%)", "hsl(48, 96%, 53%)", "hsl(0, 84%, 60%)"];

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function StudentProfilePage() {
  const params = useParams();
  const router = useRouter();
  const studentNumber = params.studentNumber as string;
  const { t, locale, isRTL } = useLanguage();
  const { can } = useAuth();

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [attendance, setAttendance] = useState<{
    records: AttendanceRecord[];
    legacy_absences: AttendanceRecord[];
    legacy_tardies: AttendanceRecord[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "academics" | "attendance" | "financial" | "documents">("overview");

  // Fetch profile + attendance in parallel
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, attendanceRes] = await Promise.all([
        fetch(`/api/student-profile?studentNumber=${encodeURIComponent(studentNumber)}`),
        fetch(`/api/attendance?studentNumber=${encodeURIComponent(studentNumber)}`),
      ]);
      if (profileRes.ok) {
        const pData = await profileRes.json();
        setProfile(pData.data);
      }
      if (attendanceRes.ok) {
        const aData = await attendanceRes.json();
        setAttendance(aData);
      }
    } catch (err) {
      console.error("Failed to fetch student data:", err);
    }
    setLoading(false);
  }, [studentNumber]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <p className="text-lg text-muted-foreground">{t("noResults")}</p>
        <Button variant="outline" onClick={() => router.back()}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          {t("back")}
        </Button>
      </div>
    );
  }

  // Prepare data
  const name = locale === "ar" ? (profile.student_name_ar || profile.student_name) : profile.student_name;
  const yearKeys = Object.keys(profile.years || {}).sort();
  const latestYear = yearKeys[yearKeys.length - 1];
  const latestYearData = profile.years?.[latestYear];

  // GPA timeline
  const gpaTimeline = yearKeys
    .map((yr) => ({
      year: yr,
      avg: typeof profile.years[yr]?.overall_avg === "number" ? profile.years[yr].overall_avg : null,
    }))
    .filter((d) => d.avg !== null);

  // Current subjects for radar chart
  const currentSubjects = (latestYearData?.subjects || [])
    .filter((s) => typeof s.grade === "number" && s.grade > 0)
    .slice(0, 12);

  // Attendance summary
  const totalAbsences =
    (attendance?.legacy_absences?.length || 0) +
    (attendance?.records?.filter((r) => r.status === "absent")?.length || 0);
  const totalTardies =
    (attendance?.legacy_tardies?.length || 0) +
    (attendance?.records?.filter((r) => r.status === "late")?.length || 0);

  // Financial for latest year
  const latestFinancials = profile.financials?.[latestYear];
  const financialsByYear = yearKeys
    .filter((yr) => profile.financials?.[yr])
    .map((yr) => {
      const f = profile.financials![yr];
      return { year: yr, charged: f.total_charged, paid: f.total_paid, balance: f.balance };
    });

  // Document statuses
  const rawStudent = (profile.raw_student || {}) as Record<string, string | undefined>;
  const passportStatus = getDocStatus(profile.passport_id, rawStudent.Passport_Expiry_Date as string | undefined);
  const iqamaStatus = getDocStatus(profile.iqama_number, rawStudent.Iqama_Expiry as string | undefined);

  // Attendance heatmap data (last 12 months)
  const attendanceByMonth: Record<string, { absences: number; tardies: number }> = {};
  const allAbsences = [
    ...(attendance?.legacy_absences || []),
    ...(attendance?.records?.filter((r) => r.status === "absent") || []),
  ];
  const allTardies = [
    ...(attendance?.legacy_tardies || []),
    ...(attendance?.records?.filter((r) => r.status === "late") || []),
  ];
  allAbsences.forEach((r) => {
    if (!r.date) return;
    const m = r.date.substring(0, 7); // YYYY-MM
    if (!attendanceByMonth[m]) attendanceByMonth[m] = { absences: 0, tardies: 0 };
    attendanceByMonth[m].absences += r.days || 1;
  });
  allTardies.forEach((r) => {
    if (!r.date) return;
    const m = r.date.substring(0, 7);
    if (!attendanceByMonth[m]) attendanceByMonth[m] = { absences: 0, tardies: 0 };
    attendanceByMonth[m].tardies += 1;
  });
  const monthlyAttendance = Object.entries(attendanceByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, data]) => ({ month, ...data }));

  const isMale = /^m(ale)?$/i.test(profile.gender);

  const tabs = [
    { id: "overview" as const, label: t("profileOverview"), icon: User },
    { id: "academics" as const, label: t("profileAcademics"), icon: GraduationCap },
    { id: "attendance" as const, label: t("navAttendance"), icon: CalendarOff },
    ...(can("fees.view") ? [{ id: "financial" as const, label: t("profileFinancial"), icon: Wallet }] : []),
    { id: "documents" as const, label: t("profileDocuments"), icon: FileText },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ChevronLeft className={cn("h-5 w-5", isRTL && "rotate-180")} />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{name}</h1>
          <p className="text-sm text-muted-foreground">
            #{profile.student_number} · {latestYearData?.class_name || ""} {latestYearData?.section_name || ""} · {profile.nationality_en}
          </p>
        </div>
        <Badge variant={isMale ? "default" : "secondary"} className="text-sm">
          {isMale ? t("male") : t("female")}
        </Badge>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              activeTab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === "overview" && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* KPI Cards */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t("profileCurrentAvg")}</p>
                  <p className="text-3xl font-bold">
                    {latestYearData?.overall_avg != null
                      ? Number(latestYearData.overall_avg).toFixed(1)
                      : "—"}
                  </p>
                </div>
                <GraduationCap className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t("totalAbsences")}</p>
                  <p className="text-3xl font-bold">{totalAbsences}</p>
                </div>
                <CalendarOff className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t("totalTardies")}</p>
                  <p className="text-3xl font-bold">{totalTardies}</p>
                </div>
                <Clock className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          {can("fees.view") && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t("profileBalance")}</p>
                  <p className="text-3xl font-bold">
                    {latestFinancials
                      ? `${latestFinancials.balance.toLocaleString()}`
                      : "—"}
                  </p>
                </div>
                <Wallet className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>
          )}

          {/* Personal Info Card */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{t("profilePersonalInfo")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t("profileNameEn")}</dt>
                  <dd className="font-medium">{profile.student_name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("profileNameAr")}</dt>
                  <dd className="font-medium">{profile.student_name_ar || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("profileDob")}</dt>
                  <dd className="font-medium">{profile.dob || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("profileNationality")}</dt>
                  <dd className="font-medium">
                    {locale === "ar" ? (profile.nationality_ar || profile.nationality_en) : profile.nationality_en || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("profileEnrollment")}</dt>
                  <dd className="font-medium">{profile.enrollment_date || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("profileFamily")}</dt>
                  <dd className="font-medium">{profile.family_number || "—"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* GPA Timeline Chart */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{t("profileGpaTrend")}</CardTitle>
            </CardHeader>
            <CardContent>
              {gpaTimeline.length > 0 ? (
                <ResponsiveContainer width="100%" minWidth={0} height={200}>
                  <LineChart data={gpaTimeline}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="year" className="text-xs" />
                    <YAxis domain={[0, 100]} className="text-xs" />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="avg"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("noResults")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Academics Tab ── */}
      {activeTab === "academics" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Subject Radar Chart */}
          {currentSubjects.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("profileSubjectRadar")} ({latestYear})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" minWidth={0} height={300}>
                  <RadarChart data={currentSubjects.map((s) => ({
                    subject: locale === "ar" && s.subject_ar ? s.subject_ar : s.subject,
                    grade: Number(s.grade),
                    fullMark: 100,
                  }))}>
                    <PolarGrid className="stroke-border" />
                    <PolarAngleAxis dataKey="subject" className="text-xs" tick={{ fontSize: 10 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                    <Radar
                      dataKey="grade"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.2}
                    />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Current Year Grades Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("profileGrades")} ({latestYear})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(latestYearData?.subjects || []).length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("subject")}</TableHead>
                      <TableHead className="text-center">{t("grade")}</TableHead>
                      <TableHead className="text-center">{t("status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(latestYearData?.subjects || []).map((s, i) => {
                      const g = typeof s.grade === "number" ? s.grade : parseFloat(String(s.grade));
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-medium">
                            {locale === "ar" && s.subject_ar ? s.subject_ar : s.subject}
                          </TableCell>
                          <TableCell className="text-center">{isNaN(g) ? s.grade : g.toFixed(1)}</TableCell>
                          <TableCell className="text-center">
                            {!isNaN(g) && (
                              <Badge variant={g >= 60 ? "default" : "destructive"}>
                                {g >= 60 ? (
                                  <><TrendingUp className="mr-1 h-3 w-3" />{t("pass")}</>
                                ) : (
                                  <><TrendingDown className="mr-1 h-3 w-3" />{t("fail")}</>
                                )}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("noResults")}</p>
              )}
            </CardContent>
          </Card>

          {/* Year-by-Year Academic History */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{t("profileAcademicHistory")}</CardTitle>
            </CardHeader>
            <CardContent>
              {yearKeys.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("academicYear")}</TableHead>
                      <TableHead>{t("class")}</TableHead>
                      <TableHead>{t("section")}</TableHead>
                      <TableHead className="text-center">{t("average")}</TableHead>
                      <TableHead className="text-center">{t("subjects")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {yearKeys.map((yr) => {
                      const yd = profile.years[yr];
                      return (
                        <TableRow key={yr}>
                          <TableCell className="font-medium">{yr}</TableCell>
                          <TableCell>{yd.class_name || yd.class_code || "—"}</TableCell>
                          <TableCell>{yd.section_name || yd.section_code || "—"}</TableCell>
                          <TableCell className="text-center">
                            {yd.overall_avg != null ? Number(yd.overall_avg).toFixed(1) : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            {yd.subjects?.length || 0}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("noResults")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Attendance Tab ── */}
      {activeTab === "attendance" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Summary Cards */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t("totalAbsences")}</p>
                  <p className="text-3xl font-bold text-red-500">{totalAbsences}</p>
                </div>
                <CalendarOff className="h-8 w-8 text-red-300" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t("totalTardies")}</p>
                  <p className="text-3xl font-bold text-yellow-500">{totalTardies}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-300" />
              </div>
            </CardContent>
          </Card>

          {/* Monthly Attendance Bar Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{t("monthlyBreakdown")}</CardTitle>
            </CardHeader>
            <CardContent>
              {monthlyAttendance.length > 0 ? (
                <ResponsiveContainer width="100%" minWidth={0} height={250}>
                  <BarChart data={monthlyAttendance}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="absences" name={t("totalAbsences")} fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="tardies" name={t("totalTardies")} fill="hsl(48, 96%, 53%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("noAbsenceRecords")}</p>
              )}
            </CardContent>
          </Card>

          {/* Recent Absences List */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{t("recentAbsences")}</CardTitle>
            </CardHeader>
            <CardContent>
              {allAbsences.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("date")}</TableHead>
                      <TableHead>{t("academicYear")}</TableHead>
                      <TableHead className="text-center">{t("days")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allAbsences
                      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                      .slice(0, 20)
                      .map((r, i) => (
                        <TableRow key={i}>
                          <TableCell>{r.date || "—"}</TableCell>
                          <TableCell>{r.year || "—"}</TableCell>
                          <TableCell className="text-center">{r.days || 1}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("noAbsenceRecords")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Financial Tab ── */}
      {activeTab === "financial" && can("fees.view") && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Current Year Financial Summary */}
          {latestFinancials && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t("profileFinancialSummary")} ({latestYear})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t("profileCharged")}</dt>
                      <dd className="font-medium">{latestFinancials.total_charged.toLocaleString()} SAR</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t("profilePaid")}</dt>
                      <dd className="font-medium text-green-600">{latestFinancials.total_paid.toLocaleString()} SAR</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t("profileDiscount")}</dt>
                      <dd className="font-medium text-blue-600">{latestFinancials.total_discount.toLocaleString()} SAR</dd>
                    </div>
                    <hr className="border-border" />
                    <div className="flex justify-between">
                      <dt className="font-medium">{t("profileBalance")}</dt>
                      <dd className={cn("font-bold", latestFinancials.balance > 0 ? "text-red-600" : "text-green-600")}>
                        {latestFinancials.balance.toLocaleString()} SAR
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              {/* Payment Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("profilePaymentBreakdown")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" minWidth={0} height={200}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: t("profilePaid"), value: latestFinancials.total_paid },
                          { name: t("profileDiscount"), value: latestFinancials.total_discount },
                          { name: t("profileBalance"), value: Math.max(0, latestFinancials.balance) },
                        ].filter((d) => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value.toLocaleString()}`}
                      >
                        {[0, 1, 2].map((i) => (
                          <Cell key={i} fill={PIE_COLORS[i]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}

          {/* Multi-Year Financial Chart */}
          {financialsByYear.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">{t("profileFinancialHistory")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" minWidth={0} height={250}>
                  <BarChart data={financialsByYear}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="year" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="charged" name={t("profileCharged")} fill="hsl(220, 70%, 50%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="paid" name={t("profilePaid")} fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="balance" name={t("profileBalance")} fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Installments Table */}
          {latestFinancials?.installments && latestFinancials.installments.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">{t("profileInstallments")} ({latestYear})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("profileInstallment")}</TableHead>
                      <TableHead className="text-center">{t("profileCharged")}</TableHead>
                      <TableHead className="text-center">{t("profilePaid")}</TableHead>
                      <TableHead className="text-center">{t("profileDiscount")}</TableHead>
                      <TableHead className="text-center">{t("profileBalance")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {latestFinancials.installments.map((inst, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{inst.label}</TableCell>
                        <TableCell className="text-center">{inst.charged.toLocaleString()}</TableCell>
                        <TableCell className="text-center text-green-600">{inst.paid.toLocaleString()}</TableCell>
                        <TableCell className="text-center text-blue-600">{inst.discount.toLocaleString()}</TableCell>
                        <TableCell className={cn("text-center font-medium", inst.balance > 0 ? "text-red-600" : "text-green-600")}>
                          {inst.balance.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {!latestFinancials && (
            <Card className="lg:col-span-2">
              <CardContent className="py-12 text-center text-muted-foreground">
                {t("noResults")}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Documents Tab ── */}
      {activeTab === "documents" && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Passport */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                {t("profilePassport")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("profileDocNumber")}</dt>
                  <dd className="font-medium font-mono">{profile.passport_id || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("profileDocExpiry")}</dt>
                  <dd className="font-medium">{(rawStudent.Passport_Expiry_Date as string) || "—"}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{t("status")}</dt>
                  <dd className={cn("flex items-center gap-1 font-medium", passportStatus.color)}>
                    <passportStatus.icon className="h-4 w-4" />
                    {passportStatus.label}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Iqama */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                {t("profileIqama")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("profileDocNumber")}</dt>
                  <dd className="font-medium font-mono">{profile.iqama_number || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("profileDocExpiry")}</dt>
                  <dd className="font-medium">{(rawStudent.Iqama_Expiry as string) || "—"}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{t("status")}</dt>
                  <dd className={cn("flex items-center gap-1 font-medium", iqamaStatus.color)}>
                    <iqamaStatus.icon className="h-4 w-4" />
                    {iqamaStatus.label}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
