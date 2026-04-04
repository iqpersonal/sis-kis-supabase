"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  ClipboardList,
  Printer,
  Eye,
  ChevronLeft,
} from "lucide-react";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";
import {
  useQuizSummary,
  type QuizSchoolSlice,
} from "@/hooks/use-sis-data";
import {
  MONTHS,
  bandColor,
  homeworkColor,
  participationColor,
  conductColor,
  monthToTerm,
} from "@/lib/progress-report-rubric";

/* ── Types ── */

interface ReportEntry {
  id: string;
  student_number: string;
  student_name: string;
  subject: string;
  academic_performance: string;
  homework_effort: string;
  participation: string;
  conduct: string;
  notes: string;
  recorded_by: string;
  month: string;
  term: string;
}

interface StudentGroup {
  student_number: string;
  student_name: string;
  subjects: ReportEntry[];
}

/* ── Page ── */

export default function AdminProgressReportPage() {
  const { selectedYear } = useAcademicYear();
  const { schoolFilter } = useSchoolFilter();
  const { quizSummary } = useQuizSummary(selectedYear);

  const [classCode, setClassCode] = useState("all");
  const [sectionCode, setSectionCode] = useState("all");
  const [month, setMonth] = useState("");
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentGroup | null>(null);

  const year = selectedYear || "25-26";

  /* ── Class / section dropdowns from quiz summary ── */
  const schoolSlice: QuizSchoolSlice | null = useMemo(() => {
    if (!quizSummary) return null;
    if (schoolFilter === "all") return quizSummary.all;
    return quizSummary[schoolFilter as "0021-01" | "0021-02"] ?? quizSummary.all;
  }, [quizSummary, schoolFilter]);

  const availableSections = useMemo(() => {
    if (!schoolSlice || classCode === "all") return [];
    return schoolSlice.sections[classCode] ?? [];
  }, [schoolSlice, classCode]);

  /* ── Fetch reports ── */
  const fetchReports = useCallback(async () => {
    if (classCode === "all" || !month) return;
    setLoading(true);

    try {
      // Resolve human-readable class name from classCode
      // because teachers store class_code as "Grade 8", not "28"
      const classInfo = schoolSlice?.classes.find((c) => c.classCode === classCode);
      const classLabel = classInfo?.className || classCode;

      // Resolve human-readable section name from sectionCode
      const secList = schoolSlice?.sections[classCode] ?? [];
      const secInfo = secList.find(
        (s) => (typeof s === "string" ? s : s.sectionCode) === sectionCode,
      );
      const secLabel =
        sectionCode !== "all"
          ? typeof secInfo === "string"
            ? secInfo
            : secInfo?.sectionName || sectionCode
          : undefined;

      const params = new URLSearchParams({
        action: "list",
        year,
        month,
        classCode: classLabel,
      });
      if (secLabel) params.set("sectionCode", secLabel);

      const res = await fetch(`/api/progress-report?${params}`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch (err) {
      console.error("Failed to fetch reports:", err);
    } finally {
      setLoading(false);
    }
  }, [classCode, sectionCode, month, year, schoolSlice]);

  useEffect(() => {
    if (classCode !== "all" && month) fetchReports();
    else setReports([]);
  }, [fetchReports, classCode, month]);

  /* ── Resolved human-readable labels ── */
  const classLabel = useMemo(() => {
    const info = schoolSlice?.classes.find((c) => c.classCode === classCode);
    return info?.className || classCode;
  }, [schoolSlice, classCode]);

  const sectionLabel = useMemo(() => {
    if (sectionCode === "all") return "All Sections";
    const secList = schoolSlice?.sections[classCode] ?? [];
    const info = secList.find(
      (s) => (typeof s === "string" ? s : s.sectionCode) === sectionCode,
    );
    return typeof info === "string" ? info : info?.sectionName || sectionCode;
  }, [schoolSlice, classCode, sectionCode]);

  /* ── Group reports by student ── */
  const studentGroups: StudentGroup[] = useMemo(() => {
    const map = new Map<string, StudentGroup>();
    for (const r of reports) {
      if (!map.has(r.student_number)) {
        map.set(r.student_number, {
          student_number: r.student_number,
          student_name: r.student_name,
          subjects: [],
        });
      }
      map.get(r.student_number)!.subjects.push(r);
    }
    return [...map.values()].sort((a, b) => a.student_name.localeCompare(b.student_name));
  }, [reports]);

  /* ── All subjects that appear ── */
  const allSubjects = useMemo(() => {
    const set = new Set<string>();
    for (const r of reports) set.add(r.subject);
    return [...set].sort();
  }, [reports]);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="h-7 w-7" />
          Progress Reports
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review monthly progress reports submitted by teachers.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Select class, section, and month to view reports.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="w-48">
              <Label>Class</Label>
              <Select
                value={classCode}
                onValueChange={(v) => {
                  setClassCode(v);
                  setSectionCode("all");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select class…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {schoolSlice?.classes.map((c) => (
                    <SelectItem key={c.classCode} value={c.classCode}>
                      {c.className || c.classCode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-48">
              <Label>Section</Label>
              <Select value={sectionCode} onValueChange={setSectionCode}>
                <SelectTrigger>
                  <SelectValue placeholder="All sections" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {availableSections.map((s) => (
                    <SelectItem key={typeof s === "string" ? s : s.sectionCode} value={typeof s === "string" ? s : s.sectionCode}>
                      {typeof s === "string" ? s : s.sectionName || s.sectionCode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-48">
              <Label>Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="Select month…" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Badge variant="outline" className="h-9 px-4 text-sm">
                {reports.length} entries · {studentGroups.length} students
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Results matrix: students × subjects */}
      {!loading && studentGroups.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {classLabel} {sectionCode !== "all" ? `– ${sectionLabel}` : ""} — {month}{" "}
              ({monthToTerm(month)})
            </CardTitle>
            <CardDescription>
              Click a student row to see their full report card.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead className="min-w-[180px]">Student</TableHead>
                  {allSubjects.map((s) => (
                    <TableHead key={s} className="text-center min-w-[80px]">
                      {s}
                    </TableHead>
                  ))}
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentGroups.map((sg, idx) => {
                  const subjectMap = new Map(sg.subjects.map((s) => [s.subject, s]));
                  return (
                    <TableRow key={sg.student_number}>
                      <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                      <TableCell>
                        <span className="font-medium text-sm">{sg.student_name}</span>
                        <br />
                        <span className="text-xs text-muted-foreground">#{sg.student_number}</span>
                      </TableCell>
                      {allSubjects.map((subj) => {
                        const entry = subjectMap.get(subj);
                        if (!entry) {
                          return (
                            <TableCell key={subj} className="text-center text-muted-foreground text-xs">
                              —
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell key={subj} className="text-center">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1 ${bandColor(entry.academic_performance)}`}
                            >
                              {entry.academic_performance
                                ? entry.academic_performance.split(" ")[0]
                                : "—"}
                            </Badge>
                          </TableCell>
                        );
                      })}
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedStudent(sg)}
                          title="View full report"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && classCode !== "all" && month && studentGroups.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No progress reports found for this class/section/month.
          </CardContent>
        </Card>
      )}

      {!month && classCode === "all" && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Select a class and month to view progress reports.
          </CardContent>
        </Card>
      )}

      {/* ── Student detail dialog (printable) ── */}
      {selectedStudent && (
        <StudentReportDialog
          student={selectedStudent}
          month={month}
          year={year}
          classLabel={classLabel}
          sectionLabel={sectionLabel}
          onClose={() => setSelectedStudent(null)}
        />
      )}
    </div>
  );
}

/* ================================================================ */
/*  Student Report Dialog — matches the school Excel template        */
/* ================================================================ */

function StudentReportDialog({
  student,
  month,
  year,
  classLabel,
  sectionLabel,
  onClose,
}: {
  student: StudentGroup;
  month: string;
  year: string;
  classLabel: string;
  sectionLabel: string;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!printRef.current) return;
    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) return;
    win.document.write(`
      <html><head><title>Progress Report — ${student.student_name}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 24px; color: #1a1a1a; }
        .report-card { border: 2px solid #1e3a5f; border-radius: 8px; overflow: hidden; }
        .report-header { background: linear-gradient(135deg, #1e3a5f 0%, #2d5f8a 100%); color: #fff; padding: 20px 24px; text-align: center; }
        .report-header h1 { font-size: 22px; font-weight: 700; letter-spacing: 1px; margin-bottom: 2px; }
        .report-header h2 { font-size: 13px; font-weight: 400; opacity: 0.85; }
        .school-name { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.7; margin-bottom: 6px; }
        .info-section { padding: 16px 24px; background: #f8f9fa; border-bottom: 1px solid #e0e0e0; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 32px; }
        .info-item { display: flex; gap: 6px; font-size: 13px; }
        .info-label { font-weight: 600; color: #555; min-width: 70px; }
        .info-value { font-weight: 500; color: #1a1a1a; }
        table { width: 100%; border-collapse: collapse; }
        thead th { background: #1e3a5f; color: #fff; padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; }
        thead th:first-child { text-align: left; }
        tbody td { padding: 10px 12px; font-size: 12px; text-align: center; border-bottom: 1px solid #e8e8e8; }
        tbody td:first-child { text-align: left; font-weight: 600; }
        tbody tr:nth-child(even) { background: #f8f9fa; }
        tbody tr:hover { background: #eef3f8; }
        .good { color: #15803d; background: #f0fdf4 !important; }
        .mid { color: #a16207; background: #fefce8 !important; }
        .bad { color: #b91c1c; background: #fef2f2 !important; }
        .footer-note { margin: 0; padding: 14px 24px; font-size: 11px; color: #555; background: #fffbeb; border-top: 1px solid #fde68a; line-height: 1.5; }
        .footer-note b { color: #b45309; }
        @media print {
          body { margin: 0; }
          .report-card { border: none; }
        }
      </style>
      </head><body><div class="report-card">${printRef.current.innerHTML}</div></body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  const yearLabel = year.includes("-") ? `20${year.split("-")[0]}-20${year.split("-")[1]}` : year;
  const term = monthToTerm(month);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Progress Report — {student.student_name}</DialogTitle>
        </DialogHeader>

        {/* Print button floating top-right */}
        <div className="absolute top-3 right-12 z-10">
          <Button size="sm" variant="outline" onClick={handlePrint} className="shadow-sm">
            <Printer className="mr-1.5 h-4 w-4" /> Print
          </Button>
        </div>

        {/* Printable content */}
        <div ref={printRef}>
          {/* Header */}
          <div style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #2d5f8a 100%)", color: "#fff", padding: "24px 28px", textAlign: "center" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 2, opacity: 0.7, marginBottom: 6 }}>
              Khaled International Schools
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
              Monthly Progress Report
            </h1>
            <div style={{ fontSize: 13, opacity: 0.85 }}>
              Academic Year {yearLabel} &bull; {term}
            </div>
          </div>

          {/* Student info */}
          <div style={{ padding: "16px 28px", background: "#f8f9fa", borderBottom: "1px solid #e0e0e0" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 32px" }}>
              <div style={{ display: "flex", gap: 6, fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: "#555" }}>Student:</span>
                <span style={{ fontWeight: 500 }}>{student.student_name}</span>
              </div>
              <div style={{ display: "flex", gap: 6, fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: "#555" }}>ID:</span>
                <span style={{ fontWeight: 500 }}>{student.student_number}</span>
              </div>
              <div style={{ display: "flex", gap: 6, fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: "#555" }}>Grade:</span>
                <span style={{ fontWeight: 500 }}>{classLabel}</span>
              </div>
              <div style={{ display: "flex", gap: 6, fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: "#555" }}>Section:</span>
                <span style={{ fontWeight: 500 }}>{sectionLabel}</span>
              </div>
              <div style={{ display: "flex", gap: 6, fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: "#555" }}>Month:</span>
                <span style={{ fontWeight: 500 }}>{month}</span>
              </div>
              <div style={{ display: "flex", gap: 6, fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: "#555" }}>Term:</span>
                <span style={{ fontWeight: 500 }}>{term}</span>
              </div>
            </div>
          </div>

          {/* Report table */}
          <div style={{ padding: "0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ background: "#1e3a5f", color: "#fff", padding: "10px 14px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "left" }}>Subject</th>
                  <th style={{ background: "#1e3a5f", color: "#fff", padding: "10px 14px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" }}>Academic Performance</th>
                  <th style={{ background: "#1e3a5f", color: "#fff", padding: "10px 14px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" }}>Homework Effort</th>
                  <th style={{ background: "#1e3a5f", color: "#fff", padding: "10px 14px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" }}>Participation</th>
                  <th style={{ background: "#1e3a5f", color: "#fff", padding: "10px 14px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" }}>Conduct</th>
                  <th style={{ background: "#1e3a5f", color: "#fff", padding: "10px 14px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {student.subjects
                  .sort((a, b) => a.subject.localeCompare(b.subject))
                  .map((entry, i) => (
                    <tr key={entry.subject} style={{ background: i % 2 === 0 ? "#fff" : "#f8f9fa" }}>
                      <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 600, textAlign: "left", borderBottom: "1px solid #e8e8e8" }}>
                        {entry.subject}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 12, textAlign: "center", borderBottom: "1px solid #e8e8e8", ...apCellStyle(entry.academic_performance) }}>
                        {entry.academic_performance || "—"}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 12, textAlign: "center", borderBottom: "1px solid #e8e8e8", ...hwCellStyle(entry.homework_effort) }}>
                        {entry.homework_effort || "—"}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 12, textAlign: "center", borderBottom: "1px solid #e8e8e8", ...partCellStyle(entry.participation) }}>
                        {entry.participation || "—"}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 12, textAlign: "center", borderBottom: "1px solid #e8e8e8", ...condCellStyle(entry.conduct) }}>
                        {entry.conduct || "—"}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 12, textAlign: "center", borderBottom: "1px solid #e8e8e8", color: "#666", fontStyle: entry.notes ? "normal" : "italic" }}>
                        {entry.notes || "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Footer note */}
          <div style={{ padding: "14px 28px", fontSize: 11, color: "#555", background: "#fffbeb", borderTop: "1px solid #fde68a", lineHeight: 1.6 }}>
            <b style={{ color: "#b45309" }}>Note:</b> This progress report is being sent to you to keep you informed of
            your son&apos;s or daughter&apos;s progress every month. Please discuss it with
            your child. Should you have any concerns, please contact the school for an
            appointment.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* Helper: inline styles for print-safe colored cells */
function apCellStyle(v: string): React.CSSProperties {
  if (v.includes("Outstanding") || v.includes("Strong")) return { color: "#15803d", background: "#f0fdf4" };
  if (v.includes("Consistent") || v.includes("Improvement")) return { color: "#a16207", background: "#fefce8" };
  if (v.includes("Major") || v.includes("Danger")) return { color: "#b91c1c", background: "#fef2f2" };
  return {};
}
function hwCellStyle(v: string): React.CSSProperties {
  if (v.includes("Consistently")) return { color: "#15803d", background: "#f0fdf4" };
  if (v.includes("Partially")) return { color: "#a16207", background: "#fefce8" };
  if (v.includes("Not")) return { color: "#b91c1c", background: "#fef2f2" };
  return {};
}
function partCellStyle(v: string): React.CSSProperties {
  if (v.includes("Highly")) return { color: "#15803d", background: "#f0fdf4" };
  if (v.includes("Partially")) return { color: "#a16207", background: "#fefce8" };
  if (v.includes("Rarely")) return { color: "#b91c1c", background: "#fef2f2" };
  return {};
}
function condCellStyle(v: string): React.CSSProperties {
  if (v.includes("Respectful")) return { color: "#15803d", background: "#f0fdf4" };
  if (v.includes("Disruptive")) return { color: "#a16207", background: "#fefce8" };
  if (v.includes("Un-cooperative")) return { color: "#b91c1c", background: "#fef2f2" };
  return {};
}
