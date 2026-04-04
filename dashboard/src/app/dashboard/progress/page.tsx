"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Award,
  AlertTriangle,
  BookOpen,
  ChevronLeft,
  Loader2,
  UserSearch,
  GraduationCap,
  Users,
  Printer,
  FileText,
  User,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  useQuizSummary,
  type QuizSchoolSlice,
} from "@/hooks/use-sis-data";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";

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

interface StudentProgress {
  student_number: string;
  student_name: string;
  gender: string;
  family_number: string;
  years: Record<string, YearData>;
  updated_at: string;
}

interface SearchResult {
  student_number: string;
  student_name: string;
  gender: string;
  family_number: string;
  years: string[];
  latest_class: string;
  latest_avg: number;
}

/* ------------------------------------------------------------------ */
/*  Color helpers                                                     */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function StudentProgressPage() {
  const { selectedYear } = useAcademicYear();
  const { schoolFilter } = useSchoolFilter();
  const { can } = useAuth();
  const { quizSummary } = useQuizSummary(selectedYear);

  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  /* ── Browse-by-class state ── */
  const [browseClass, setBrowseClass] = useState<string>("all");
  const [browseSection, setBrowseSection] = useState<string>("all");
  const [browsing, setBrowsing] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);

  /* ── Transcript year-selection dialog ── */
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcriptYears, setTranscriptYears] = useState<Record<string, boolean>>({});

  /* ── Search ── */
  const handleSearch = useCallback(async () => {
    if (!searchTerm.trim() || searchTerm.trim().length < 2) return;
    setSearching(true);
    setHasSearched(true);
    setSelectedStudent(null);
    setProgress(null);

    try {
      const res = await fetch("/api/student-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchTerm.trim(), limit: 30 }),
      });
      if (!res.ok) {
        setResults([]);
        return;
      }
      const data = await res.json();
      const sorted = (data.results || []).sort((a: SearchResult, b: SearchResult) => a.student_name.localeCompare(b.student_name));
      setResults(sorted);
    } catch (err) {
      console.error("Search failed:", err);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchTerm]);

  /* ── School slice for class/section dropdowns ── */
  const schoolSlice: QuizSchoolSlice | null = useMemo(() => {
    if (!quizSummary) return null;
    if (schoolFilter === "all") return quizSummary.all;
    return quizSummary[schoolFilter as "0021-01" | "0021-02"] ?? quizSummary.all;
  }, [quizSummary, schoolFilter]);

  const availableSections = useMemo(() => {
    if (!schoolSlice || browseClass === "all") return [];
    return schoolSlice.sections[browseClass] ?? [];
  }, [schoolSlice, browseClass]);

  /* ── Browse by class/section ── */
  const handleBrowse = useCallback(async (classCode: string, sectionCode: string) => {
    if (classCode === "all") {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setBrowsing(true);
    setHasSearched(true);
    setSelectedStudent(null);
    setProgress(null);
    setSearchTerm("");

    // Convert selected year label (e.g. "24-25") to the key used in student_progress
    const yearKey = selectedYear ?? "";

    try {
      const res = await fetch("/api/student-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "browse",
          classCode,
          sectionCode: sectionCode !== "all" ? sectionCode : undefined,
          year: yearKey,
          school: schoolFilter !== "all" ? schoolFilter : undefined,
          limit: 200,
        }),
      });
      if (!res.ok) {
        setResults([]);
        return;
      }
      const data = await res.json();
      const sorted = (data.results || []).sort((a: SearchResult, b: SearchResult) => a.student_name.localeCompare(b.student_name));
      setResults(sorted);
    } catch (err) {
      console.error("Browse failed:", err);
      setResults([]);
    } finally {
      setBrowsing(false);
    }
  }, [selectedYear, schoolFilter]);

  const handleClassChange = (cls: string) => {
    setBrowseClass(cls);
    setBrowseSection("all");
    handleBrowse(cls, "all");
  };

  const handleSectionChange = (sec: string) => {
    setBrowseSection(sec);
    handleBrowse(browseClass, sec);
  };

  /* ── Fetch detail ── */
  const fetchDetail = useCallback(async (studentNumber: string) => {
    setSelectedStudent(studentNumber);
    setProgressLoading(true);
    try {
      const res = await fetch(
        `/api/student-progress?studentNumber=${encodeURIComponent(studentNumber)}`
      );
      if (res.ok) {
        const json = await res.json();
        setProgress(json.data as StudentProgress);
      } else {
        setProgress(null);
      }
    } catch (err) {
      console.error("Failed to fetch progress:", err);
      setProgress(null);
    } finally {
      setProgressLoading(false);
    }
  }, []);

  /* ── Chart data ── */
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

  const trendData = useMemo(() => {
    if (!progress?.years) return [];
    return Object.entries(progress.years)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, data]) => ({
        year: `20${year}`,
        avg: data.overall_avg,
        class: data.class_name,
        rank: data.rank,
        classSize: data.class_size,
      }));
  }, [progress]);

  const subjectBarData = useMemo(() => {
    if (!currentYear?.subjects) return [];
    return [...currentYear.subjects]
      .sort((a, b) => b.grade - a.grade)
      .map((s) => ({
        subject:
          s.subject.length > 15
            ? s.subject.substring(0, 15) + "…"
            : s.subject,
        fullSubject: s.subject,
        grade: s.grade,
        fill: gradeColor(s.grade),
      }));
  }, [currentYear]);

  const subjectTrend = useMemo(() => {
    if (!progress?.years) return [];
    const years = Object.keys(progress.years).sort();
    if (years.length < 2) return [];
    const prevYear = years[years.length - 2];
    const currYear = years[years.length - 1];
    const prev = progress.years[prevYear];
    const curr = progress.years[currYear];
    const prevMap = new Map(prev.subjects.map((s) => [s.subject, s.grade]));
    const currMap = new Map(curr.subjects.map((s) => [s.subject, s.grade]));
    const allSubjects = new Set([...prevMap.keys(), ...currMap.keys()]);
    return Array.from(allSubjects).map((subject) => ({
      subject:
        subject.length > 12 ? subject.substring(0, 12) + "…" : subject,
      fullSubject: subject,
      [`20${prevYear}`]: prevMap.get(subject) ?? 0,
      [`20${currYear}`]: currMap.get(subject) ?? 0,
    }));
  }, [progress]);

  /* ── Render ── */
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Student Progress
        </h1>
        <p className="text-muted-foreground">
          Search and view individual student academic history across years
        </p>
      </div>

      {/* ── Search Bar + Browse by Class ── */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Text search */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setBrowseClass("all");
              setBrowseSection("all");
              handleSearch();
            }}
            className="flex gap-3"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by student name, number, or family number…"
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={searching || searchTerm.trim().length < 2}>
              {searching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Search
            </Button>
          </form>

          {/* Divider */}
          {schoolSlice && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or browse by grade</span>
                </div>
              </div>

              {/* Grade / Section selectors */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <GraduationCap className="inline h-3.5 w-3.5 mr-1" />
                    Grade / Class
                  </label>
                  <select
                    value={browseClass}
                    onChange={(e) => handleClassChange(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="all">Select a grade…</option>
                    {schoolSlice.classes.map((cl) => (
                      <option key={cl.classCode} value={cl.classCode}>
                        {cl.className}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <Users className="inline h-3.5 w-3.5 mr-1" />
                    Section
                  </label>
                  <select
                    value={browseSection}
                    onChange={(e) => handleSectionChange(e.target.value)}
                    disabled={browseClass === "all"}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm font-medium disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="all">
                      {browseClass === "all" ? "Select a grade first" : "All Sections"}
                    </option>
                    {availableSections.map((sec) => (
                      <option key={sec.sectionCode} value={sec.sectionCode}>
                        {sec.sectionName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Search / Browse Results ── */}
      {!selectedStudent && hasSearched && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {(searching || browsing)
                ? "Searching…"
                : results.length > 0
                ? `Found ${results.length} student${results.length > 1 ? "s" : ""}`
                : "No Results"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {results.length === 0 && !searching && !browsing && (
              <p className="text-sm text-muted-foreground">
                No students found. Try a different search term or class selection.
              </p>
            )}
            {(searching || browsing) && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {!searching && !browsing && results.length > 0 && (
              <div className="space-y-2">
                {results.map((r) => (
                  <button
                    key={r.student_number}
                    onClick={() => fetchDetail(r.student_number)}
                    className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${
                          r.gender === "Male" ? "bg-blue-500" : "bg-pink-500"
                        }`}
                      >
                        {(r.student_name || "?").charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium">
                          {r.student_name || r.student_number}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.student_number} · {r.latest_class} ·{" "}
                          {r.years.length} year{r.years.length > 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-lg font-bold`}
                        style={{ color: gradeColor(r.latest_avg) }}
                      >
                        {r.latest_avg}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Latest avg
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Student Detail ── */}
      {selectedStudent && (
        <>
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedStudent(null);
                setProgress(null);
              }}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back to results
            </Button>

            {!progressLoading && progress && (
              <div className="flex gap-2">
                {can("bulk_export.view") && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      window.open(
                        `/report?student=${encodeURIComponent(
                          progress.student_number
                        )}`,
                        "_blank"
                      );
                    }}
                  >
                    <Printer className="mr-1 h-4 w-4" />
                    Print Report
                  </Button>
                )}
                {can("bulk_export.view") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Initialise checkboxes: pre-select all available years
                      const yrs = Object.keys(progress.years || {}).sort();
                      const init: Record<string, boolean> = {};
                      for (const y of yrs) init[y] = true;
                      setTranscriptYears(init);
                      setTranscriptOpen(true);
                    }}
                  >
                    <FileText className="mr-1 h-4 w-4" />
                    Print Transcript
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    window.open(
                      `/dashboard/student/${encodeURIComponent(progress.student_number)}`,
                      "_blank"
                    );
                  }}
                >
                  <User className="mr-1 h-4 w-4" />
                  View Profile
                </Button>

                {/* ── Transcript Year Selection Dialog ── */}
                <Dialog open={transcriptOpen} onOpenChange={setTranscriptOpen}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Select Transcript Years</DialogTitle>
                      <DialogDescription>
                        Choose which academic years to include in the transcript.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                      {/* Quick-select buttons */}
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const next = { ...transcriptYears };
                            for (const k of Object.keys(next)) next[k] = true;
                            setTranscriptYears(next);
                          }}
                        >
                          Select All
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const next = { ...transcriptYears };
                            for (const k of Object.keys(next)) next[k] = false;
                            setTranscriptYears(next);
                          }}
                        >
                          Deselect All
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            // Select only G9-G12 years
                            const next = { ...transcriptYears };
                            for (const k of Object.keys(next)) {
                              const cls = progress.years[k]?.class_name || "";
                              const g = parseInt(cls.replace(/\D/g, ""), 10);
                              next[k] = g >= 9 && g <= 12;
                            }
                            setTranscriptYears(next);
                          }}
                        >
                          G9–G12 Only
                        </Button>
                      </div>

                      {/* Year checkboxes */}
                      <div className="space-y-1">
                        {Object.keys(transcriptYears)
                          .sort()
                          .map((yr) => {
                            const yd = progress.years[yr];
                            const label = yd
                              ? `${yd.class_name} — ${yr.length === 5 ? (() => { const p = yr.split("-"); const a = Number(p[0]); const b = Number(p[1]); return `${a >= 50 ? 1900 + a : 2000 + a}-${b >= 50 ? 1900 + b : 2000 + b}`; })() : yr}`
                              : yr;
                            return (
                              <label
                                key={yr}
                                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted cursor-pointer text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={transcriptYears[yr]}
                                  onChange={(e) =>
                                    setTranscriptYears((prev) => ({
                                      ...prev,
                                      [yr]: e.target.checked,
                                    }))
                                  }
                                  className="h-4 w-4 rounded border-gray-300"
                                />
                                <span>{label}</span>
                                {yd && (
                                  <span className="ml-auto text-xs text-muted-foreground">
                                    Avg: {yd.overall_avg}
                                  </span>
                                )}
                              </label>
                            );
                          })}
                      </div>
                    </div>

                    <DialogFooter>
                      <Button
                        variant="ghost"
                        onClick={() => setTranscriptOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        disabled={
                          !Object.values(transcriptYears).some(Boolean)
                        }
                        onClick={() => {
                          const selected = Object.entries(transcriptYears)
                            .filter(([, v]) => v)
                            .map(([k]) => k)
                            .sort()
                            .join(",");
                          window.open(
                            `/transcript?student=${encodeURIComponent(
                              progress.student_number
                            )}&year=${encodeURIComponent(selected)}`,
                            "_blank"
                          );
                          setTranscriptOpen(false);
                        }}
                      >
                        <Printer className="mr-1 h-4 w-4" />
                        Print Transcript
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>

          {progressLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {!progressLoading && !progress && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <UserSearch className="mb-4 h-12 w-12 text-muted-foreground/40" />
                <p className="text-muted-foreground">
                  No academic records found for this student.
                </p>
              </CardContent>
            </Card>
          )}

          {!progressLoading && progress && currentYear && (
            <>
              {/* ── Student Info Banner ── */}
              <div className="rounded-xl border bg-gradient-to-r from-blue-50 to-purple-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold">
                      {progress.student_name || progress.student_number}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {progress.student_number} · Family:{" "}
                      {progress.family_number} ·{" "}
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
                  <div className="flex gap-4">
                    <div className="text-center">
                      <p
                        className="text-2xl font-bold"
                        style={{ color: gradeColor(currentYear.overall_avg) }}
                      >
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

              {/* ── KPI Cards ── */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
                          {Object.keys(progress.years).length}
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
                <Card>
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
                          stroke="#3b82f6"
                          strokeWidth={3}
                          dot={{ fill: "#3b82f6", r: 6 }}
                          activeDot={{ r: 8 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* ── Subject Grades (Current Year) ── */}
              <div className="grid gap-6 lg:grid-cols-2">
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
                                stroke={i === 0 ? "#94a3b8" : "#3b82f6"}
                                fill={i === 0 ? "#94a3b8" : "#3b82f6"}
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

              {/* ── Academic History Table ── */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Academic History
                  </CardTitle>
                  <CardDescription>
                    Complete year-by-year overview
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
                        {Object.entries(progress.years)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([yr, data]) => {
                            const prevYear = Object.keys(progress.years)
                              .sort()
                              .filter((y) => y < yr)
                              .pop();
                            const prevAvg = prevYear
                              ? progress.years[prevYear].overall_avg
                              : null;
                            const diff =
                              prevAvg !== null
                                ? data.overall_avg - prevAvg
                                : null;

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

              {/* ── Term-by-Term Breakdown ── */}
              {currentYear.terms && Object.keys(currentYear.terms).length > 0 ? (() => {
                const termCount = currentYear.term_count ?? 2;
                // Define column order based on term count
                const termColumns = termCount === 3
                  ? ["t1_assess", "t1_final", "sem1", "t2_assess", "t2_final", "sem2", "t3_assess", "t3_final", "sem3", "annual"] as const
                  : ["t1_assess", "t1_final", "sem1", "t2_assess", "t2_final", "sem2", "annual"] as const;
                // Only show columns that have data
                const activeCols = termColumns.filter(k => currentYear.terms![k]);
                // Collect all subjects across all terms
                const allSubjects = new Set<string>();
                for (const tk of activeCols) {
                  const t = currentYear.terms![tk];
                  if (t) t.subjects.forEach(s => allSubjects.add(s.subject));
                }
                const subjectList = Array.from(allSubjects).sort();
                // Build lookup: termKey -> subject -> grade
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
                            {/* Averages row */}
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
                /* Fallback: simple subject table when no term data */
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

      {/* ── Empty state ── */}
      {!selectedStudent && !hasSearched && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20">
            <UserSearch className="mb-4 h-16 w-16 text-muted-foreground/30" />
            <h3 className="mb-1 text-lg font-medium">
              Search for a Student
            </h3>
            <p className="text-sm text-muted-foreground">
              Enter a student name, number, or family number to view their
              academic progress over the years.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
