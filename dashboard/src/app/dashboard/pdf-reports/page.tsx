"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import {
  FileText,
  Download,
  Search,
  CheckSquare,
  Square,
  Loader2,
  ClipboardList,
  GraduationCap,
  Users,
  Filter,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { cn } from "@/lib/utils";

/* ── Types ────────────────────────────────────────────────────────── */

interface StudentEntry {
  student_number: string;
  student_name: string;
  student_name_ar: string;
  class_code: string;
  class_name: string;
  section_code: string;
  section_name: string;
  school: string;
  overall_avg: number;
  has_transcript: boolean;
}

interface ClassEntry {
  code: string;
  name: string;
  count: number;
}

interface SectionEntry {
  code: string;
  name: string;
  classCode: string;
  count: number;
}

type ReportType = "transcript" | "report_card" | "class_report";

/* ── Page ─────────────────────────────────────────────────────────── */

export default function PDFReportsPage() {
  const { selectedYear, selectedLabel, years } = useAcademicYear();
  const { schoolFilter } = useSchoolFilter();
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();

  const [reportType, setReportType] = useState<ReportType>("transcript");
  const [students, setStudents] = useState<StudentEntry[]>([]);
  const [classes, setClasses] = useState<ClassEntry[]>([]);
  const [sections, setSections] = useState<SectionEntry[]>([]);
  const [schools, setSchools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [search, setSearch] = useState("");
  const [majorFilter, setMajorFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Initialize selected years with the current year
  useEffect(() => {
    if (selectedYear) setSelectedYears([selectedYear]);
  }, [selectedYear]);

  // Fetch students
  const fetchData = useCallback(async () => {
    if (!selectedYear) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("year", selectedYear);
      if (majorFilter !== "all") params.set("school", majorFilter);
      else if (schoolFilter !== "all") params.set("school", schoolFilter);
      const res = await fetch(`/api/bulk-export?${params}`);
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
        setClasses(data.classes || []);
        setSections(data.sections || []);
        setSchools(data.schools || []);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [selectedYear, schoolFilter, majorFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset dependent filters when parent changes
  useEffect(() => {
    setClassFilter("all");
    setSectionFilter("all");
    setSelected(new Set());
  }, [majorFilter]);

  useEffect(() => {
    setSectionFilter("all");
    setSelected(new Set());
  }, [classFilter]);

  // Filtered sections for current class selection
  const filteredSections = classFilter === "all"
    ? sections
    : sections.filter((s) => s.classCode === classFilter);

  // Filter students
  const filtered = students.filter((s) => {
    if (classFilter !== "all" && s.class_code !== classFilter) return false;
    if (sectionFilter !== "all" && s.section_code !== sectionFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.student_name.toLowerCase().includes(q) ||
        s.student_name_ar.includes(q) ||
        s.student_number.includes(q)
      );
    }
    return true;
  });

  // Toggle selection
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((s) => s.student_number)));
    }
  };

  const toggleYear = (yr: string) => {
    setSelectedYears((prev) =>
      prev.includes(yr) ? prev.filter((y) => y !== yr) : [...prev, yr],
    );
  };

  // ── Generate & download PDF ──
  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);

    try {
      const token = await user?.getIdToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      if (reportType === "class_report") {
        const res = await fetch("/api/pdf-reports", {
          method: "POST",
          headers,
          body: JSON.stringify({
            type: "class_report",
            year: selectedYear,
            classCode: classFilter !== "all" ? classFilter : "",
            school: schoolFilter,
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
        await downloadBlob(res, `class_report_${selectedYear}.pdf`);
        return;
      }

      // Individual student PDFs
      const studentIds = Array.from(selected);
      if (!studentIds.length) {
        setError("Please select at least one student");
        return;
      }

      for (const sid of studentIds) {
        const payload: Record<string, unknown> = {
          type: reportType,
          studentNumber: sid,
        };

        if (reportType === "transcript") {
          payload.years = selectedYears.length ? selectedYears : [selectedYear];
        } else {
          payload.year = selectedYear;
        }

        const res = await fetch("/api/pdf-reports", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.error(`PDF error for ${sid}:`, errData);
          continue;
        }

        const filename =
          reportType === "transcript"
            ? `transcript_${sid}.pdf`
            : `report_card_${sid}_${selectedYear}.pdf`;

        await downloadBlob(res, filename);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate PDF");
    } finally {
      setGenerating(false);
    }
  };

  // Report type cards
  const REPORT_TYPES: {
    type: ReportType;
    icon: React.ElementType;
    title: string;
    desc: string;
  }[] = [
    {
      type: "transcript",
      icon: FileText,
      title: t("pdfTranscript" as never) || "Official Transcript",
      desc:
        t("pdfTranscriptDesc" as never) ||
        "Formal academic transcript with GPA, credit hours, and letter grades",
    },
    {
      type: "report_card",
      icon: ClipboardList,
      title: t("pdfReportCard" as never) || "Report Card",
      desc:
        t("pdfReportCardDesc" as never) ||
        "Term-by-term progress report with averages, rank, and subject grades",
    },
    {
      type: "class_report",
      icon: Users,
      title: t("pdfClassReport" as never) || "Class Report",
      desc:
        t("pdfClassReportDesc" as never) ||
        "Class-wide performance summary with rankings and pass/fail statistics",
    },
  ];

  return (
    <div className="space-y-6" dir={isRTL ? "rtl" : "ltr"}>
      {/* ── Header ────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          {t("pdfReports" as never) || "PDF Reports"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("pdfReportsDesc" as never) ||
            "Generate and download PDF transcripts, report cards, and class reports"}{" "}
          — {selectedLabel}
        </p>
      </div>

      {/* ── Report Type Selection ─────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">
        {REPORT_TYPES.map((rt) => {
          const Icon = rt.icon;
          const active = reportType === rt.type;
          return (
            <Card
              key={rt.type}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                active && "ring-2 ring-primary shadow-md",
              )}
              onClick={() => setReportType(rt.type)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  {rt.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{rt.desc}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Transcript Year Picker ────────────────────────── */}
      {reportType === "transcript" && years.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {t("pdfSelectYears" as never) || "Select Academic Years"}
            </CardTitle>
            <CardDescription>
              {t("pdfSelectYearsDesc" as never) ||
                "Choose which years to include in the transcript"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {years.map((yr) => {
                const chosen = selectedYears.includes(yr);
                return (
                  <Badge
                    key={yr}
                    variant={chosen ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleYear(yr)}
                  >
                    {chosen ? (
                      <CheckSquare className="h-3 w-3 mr-1" />
                    ) : (
                      <Square className="h-3 w-3 mr-1" />
                    )}
                    {yr}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Student Selection (not for class_report) ──────── */}
      {reportType !== "class_report" ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <GraduationCap className="h-4 w-4" />
                  {t("pdfSelectStudents" as never) || "Select Students"}
                </CardTitle>
                <CardDescription>
                  {selected.size} / {filtered.length}{" "}
                  {t("selected" as never) || "selected"}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("search" as never) || "Search..."}
                    className="pl-8 w-48"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {/* Major / School */}
                {schools.length > 1 && (
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={majorFilter}
                    onChange={(e) => setMajorFilter(e.target.value)}
                  >
                    <option value="all">All Majors</option>
                    {schools.map((s) => (
                      <option key={s} value={s}>
                        {s === "0021-01" ? "Boys" : s === "0021-02" ? "Girls" : s}
                      </option>
                    ))}
                  </select>
                )}
                {/* Class */}
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                >
                  <option value="all">
                    {t("all" as never) || "All Classes"}
                  </option>
                  {classes.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} ({c.count})
                    </option>
                  ))}
                </select>
                {/* Section */}
                {filteredSections.length > 1 && (
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={sectionFilter}
                    onChange={(e) => setSectionFilter(e.target.value)}
                  >
                    <option value="all">All Sections</option>
                    {filteredSections.map((s) => (
                      <option key={`${s.classCode}_${s.code}`} value={s.code}>
                        {s.name} ({s.count})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                {t("loading" as never) || "Loading..."}
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                {t("noData" as never) || "No students found"}
              </p>
            ) : (
              <>
                {/* ── Select All ── */}
                <div className="flex items-center gap-2 pb-2 border-b mb-2">
                  <button onClick={toggleAll} className="flex items-center gap-2 text-sm hover:text-primary">
                    {selected.size === filtered.length ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    {t("selectAll" as never) || "Select All"} ({filtered.length})
                  </button>
                </div>

                {/* ── Student list ── */}
                <div className="max-h-[400px] overflow-y-auto space-y-0.5">
                  {filtered.map((s) => {
                    const isSelected = selected.has(s.student_number);
                    return (
                      <div
                        key={s.student_number}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors",
                          isSelected
                            ? "bg-primary/5 hover:bg-primary/10"
                            : "hover:bg-muted/50",
                        )}
                        onClick={() => toggleSelect(s.student_number)}
                      >
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-primary flex-shrink-0" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {s.student_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {s.student_number} · {s.class_name} · {s.section_name}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-medium">
                            {s.overall_avg?.toFixed(1) || "-"}
                          </p>
                          {reportType === "transcript" && (
                            <Badge
                              variant={s.has_transcript ? "default" : "secondary"}
                              className="text-[10px]"
                            >
                              {s.has_transcript ? "Has Data" : "No Data"}
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        /* ── Class filter for class_report ── */
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="h-4 w-4" />
              {t("pdfClassFilter" as never) || "Filter by Class"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {schools.length > 1 && (
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={majorFilter}
                  onChange={(e) => setMajorFilter(e.target.value)}
                >
                  <option value="all">All Majors</option>
                  {schools.map((s) => (
                    <option key={s} value={s}>
                      {s === "0021-01" ? "Boys" : s === "0021-02" ? "Girls" : s}
                    </option>
                  ))}
                </select>
              )}
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full max-w-xs"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
              >
                <option value="all">
                  {t("all" as never) || "All Classes"}
                </option>
                {classes.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.count})
                  </option>
                ))}
              </select>
              {filteredSections.length > 1 && (
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                >
                  <option value="all">All Sections</option>
                  {filteredSections.map((s) => (
                    <option key={`${s.classCode}_${s.code}`} value={s.code}>
                      {s.name} ({s.count})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Generate Button ──────────────────────────────── */}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex gap-3">
        <Button
          onClick={handleGenerate}
          disabled={
            generating ||
            (reportType !== "class_report" && selected.size === 0)
          }
          className="gap-2"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {generating
            ? t("pdfGenerating" as never) || "Generating..."
            : t("pdfDownload" as never) || "Download PDF"}
          {reportType !== "class_report" &&
            selected.size > 0 &&
            ` (${selected.size})`}
        </Button>
      </div>
    </div>
  );
}

/* ── Utility ─────────────────────────────────────────────────────── */

async function downloadBlob(res: Response, filename: string) {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
