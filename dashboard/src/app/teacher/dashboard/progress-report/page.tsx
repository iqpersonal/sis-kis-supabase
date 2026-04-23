"use client";

import { useEffect, useState, useCallback } from "react";
import { useTeacherAuth } from "@/context/teacher-auth-context";
import { useLanguage } from "@/context/language-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Loader2, Save, CheckCircle, ClipboardList } from "lucide-react";
import {
  ACADEMIC_BANDS,
  HOMEWORK_OPTIONS,
  PARTICIPATION_OPTIONS,
  CONDUCT_OPTIONS,
  MONTHS,
  bandColor,
  homeworkColor,
  participationColor,
  conductColor,
  scoreToBand,
  type AcademicBandLabel,
} from "@/lib/progress-report-rubric";

/* ── Types ───────────────────────────────────────────────────── */

interface AssignedClass {
  classId: string;
  className: string;
  section: string;
  year: string;
  campus: string;
  subject?: string;
}

interface StudentInfo {
  studentNumber: string;
  nameEn: string;
  nameAr: string;
  gender: string;
  grade: string;
  section: string;
}

interface ReportRow {
  student_number: string;
  student_name: string;
  academic_performance: string;
  homework_effort: string;
  participation: string;
  conduct: string;
  notes: string;
  autoGrade?: number | null;
}

/* ── Page ────────────────────────────────────────────────────── */

export default function TeacherProgressReportPage() {
  const { teacher, loading: authLoading } = useTeacherAuth();
  const { t } = useLanguage();

  // Teacher's assigned classes
  const [assignedClasses, setAssignedClasses] = useState<AssignedClass[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);

  // Selection state
  const [selectedClassKey, setSelectedClassKey] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const year = "25-26"; // Current academic year

  // Data
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Derive selected class info
  const selectedClass = assignedClasses.find(
    (c) => `${c.classId}|${c.section}` === selectedClassKey,
  );
  const subject = selectedClass?.subject || "";

  /* ── Fetch assigned classes ── */
  useEffect(() => {
    if (!teacher?.uid) return;
    setLoadingClasses(true);
    const param = teacher.username
      ? `username=${encodeURIComponent(teacher.username)}`
      : `uid=${encodeURIComponent(teacher.uid)}`;

    fetch(`/api/teacher/classes?${param}`)
      .then((r) => r.json())
      .then((data) => {
        setAssignedClasses(data.classes || []);
      })
      .catch(console.error)
      .finally(() => setLoadingClasses(false));
  }, [teacher?.username]);

  /* ── Fetch students + existing reports when class/month change ── */
  const loadData = useCallback(async () => {
    if (!selectedClass || !selectedMonth) return;

    setLoading(true);
    setSaved(false);

    try {
      // Fetch students in this class/section
      const stuParams = new URLSearchParams({ year });
      if (selectedClass.classId) {
        stuParams.set("classId", selectedClass.classId);
      } else {
        stuParams.set("class", selectedClass.className);
        stuParams.set("section", selectedClass.section);
      }
      const stuRes = await fetch(`/api/teacher/students?${stuParams}`);
      const stuData = await stuRes.json();
      const stuList: StudentInfo[] = stuData.students || [];
      setStudents(stuList);

      // Fetch existing reports for this class/section/month
      const repParams = new URLSearchParams({
        action: "list",
        year,
        month: selectedMonth,
        classCode: selectedClass.className,
        sectionCode: selectedClass.section,
      });
      const repRes = await fetch(`/api/progress-report?${repParams}`);
      const repData = await repRes.json();
      const existing: Record<string, ReportRow> = {};
      for (const r of repData.reports || []) {
        if (r.subject === subject) {
          existing[r.student_number] = {
            student_number: r.student_number,
            student_name: r.student_name,
            academic_performance: r.academic_performance || "",
            homework_effort: r.homework_effort || "",
            participation: r.participation || "",
            conduct: r.conduct || "",
            notes: r.notes || "",
          };
        }
      }

      // Fetch student grades in parallel for auto-filling academic performance
      const gradeMap: Record<string, number | null> = {};
      await Promise.all(
        stuList.map(async (s) => {
          try {
            const gRes = await fetch(
              `/api/student-progress?studentNumber=${s.studentNumber}`,
            );
            if (gRes.ok) {
              const gData = await gRes.json();
              const yearData = gData.data?.years?.[year];
              if (yearData?.subjects) {
                for (const sub of yearData.subjects) {
                  if (sub.subject === subject) {
                    gradeMap[s.studentNumber] = sub.grade ?? null;
                  }
                }
              }
            }
          } catch {
            // ignore individual lookup failure
          }
        }),
      );

      // Build rows
      const newRows: ReportRow[] = stuList.map((s) => {
        const ex = existing[s.studentNumber];
        const grade = gradeMap[s.studentNumber] ?? null;
        return {
          student_number: s.studentNumber,
          student_name: s.nameEn || s.nameAr || s.studentNumber,
          academic_performance:
            ex?.academic_performance || scoreToBand(grade) || "",
          homework_effort: ex?.homework_effort || "",
          participation: ex?.participation || "",
          conduct: ex?.conduct || "",
          notes: ex?.notes || "",
          autoGrade: grade,
        };
      });

      setRows(newRows);
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedClass, selectedMonth, subject, year]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── Update a row field ── */
  const updateRow = (idx: number, field: keyof ReportRow, value: string) => {
    setRows((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
    setSaved(false);
  };

  /* ── Save all ── */
  const handleSave = async () => {
    if (!selectedClass || !selectedMonth || !subject) return;
    setSaving(true);

    try {
      const reports = rows.map((r) => ({
        student_number: r.student_number,
        student_name: r.student_name,
        subject,
        class_code: selectedClass.className,
        section_code: selectedClass.section,
        academic_year: year,
        month: selectedMonth,
        academic_performance: r.academic_performance,
        homework_effort: r.homework_effort,
        participation: r.participation,
        conduct: r.conduct,
        notes: r.notes,
        recorded_by: teacher?.username || "",
      }));

      const res = await fetch("/api/progress-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", reports }),
      });

      if (res.ok) {
        setSaved(true);
        // Reload to confirm data persisted
        await loadData();
      }
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  /* ── Distinct class keys for dropdown (group by className+section) ── */
  const classOptions = assignedClasses.map((c) => ({
    key: `${c.classId}|${c.section}`,
    label: `${c.className} – ${c.section}${c.subject ? ` (${c.subject})` : ""}`,
  }));

  /* ── Auth guard ── */
  if (authLoading || loadingClasses) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!teacher) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="h-7 w-7" />
          {t("progressReport" as never) || "Progress Report"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Monthly student evaluation — fill each column per student.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Select Class & Month</CardTitle>
          <CardDescription>
            Choose the class/section you are assigned to and the reporting month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="w-72">
              <Label>Class / Section</Label>
              <Select value={selectedClassKey} onValueChange={setSelectedClassKey}>
                <SelectTrigger>
                  <SelectValue placeholder="Select class…" />
                </SelectTrigger>
                <SelectContent>
                  {classOptions.map((o) => (
                    <SelectItem key={o.key} value={o.key}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Label>Month</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
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
            {subject && (
              <div className="flex items-end">
                <Badge variant="outline" className="h-9 px-4 text-sm">
                  Subject: {subject}
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* No subject warning */}
      {selectedClassKey && !subject && (
        <Card className="border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20">
          <CardContent className="py-4 text-sm text-yellow-700 dark:text-yellow-300">
            No subject assigned for this class. Ask your admin to assign a subject in
            the Class Assignment page.
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Data table */}
      {!loading && rows.length > 0 && subject && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">
                {selectedClass?.className} – {selectedClass?.section} — {subject} —{" "}
                {selectedMonth}
              </CardTitle>
              <CardDescription>{rows.length} students</CardDescription>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : saved ? (
                <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saved ? "Saved" : "Save All"}
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead className="min-w-[180px]">Student</TableHead>
                  <TableHead className="min-w-[200px]">Academic Performance</TableHead>
                  <TableHead className="min-w-[180px]">Homework Effort</TableHead>
                  <TableHead className="min-w-[180px]">In-Class Participation</TableHead>
                  <TableHead className="min-w-[180px]">Conduct</TableHead>
                  <TableHead className="min-w-[150px]">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={row.student_number}>
                    <TableCell className="text-muted-foreground text-xs">
                      {idx + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {row.academic_performance && row.homework_effort && row.participation && row.conduct && (
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        )}
                        <div>
                          <span className="font-medium text-sm">{row.student_name}</span>
                          <br />
                          <span className="text-xs text-muted-foreground">
                            #{row.student_number}
                            {row.autoGrade != null && (
                              <span className="ml-2 text-blue-600">
                                Grade: {row.autoGrade}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    {/* Academic Performance */}
                    <TableCell>
                      <Select
                        value={row.academic_performance}
                        onValueChange={(v) =>
                          updateRow(idx, "academic_performance", v)
                        }
                      >
                        <SelectTrigger
                          className={`text-xs h-auto py-1 ${bandColor(row.academic_performance)}`}
                        >
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {ACADEMIC_BANDS.map((b) => (
                            <SelectItem key={b.label} value={b.label}>
                              <span className={bandColor(b.label)}>
                                {b.label} ({b.range})
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Homework Effort */}
                    <TableCell>
                      <Select
                        value={row.homework_effort}
                        onValueChange={(v) =>
                          updateRow(idx, "homework_effort", v)
                        }
                      >
                        <SelectTrigger
                          className={`text-xs h-auto py-1 ${homeworkColor(row.homework_effort)}`}
                        >
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {HOMEWORK_OPTIONS.map((o) => (
                            <SelectItem key={o} value={o}>
                              <span className={homeworkColor(o)}>{o}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Participation */}
                    <TableCell>
                      <Select
                        value={row.participation}
                        onValueChange={(v) =>
                          updateRow(idx, "participation", v)
                        }
                      >
                        <SelectTrigger
                          className={`text-xs h-auto py-1 ${participationColor(row.participation)}`}
                        >
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {PARTICIPATION_OPTIONS.map((o) => (
                            <SelectItem key={o} value={o}>
                              <span className={participationColor(o)}>{o}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Conduct */}
                    <TableCell>
                      <Select
                        value={row.conduct}
                        onValueChange={(v) => updateRow(idx, "conduct", v)}
                      >
                        <SelectTrigger
                          className={`text-xs h-auto py-1 ${conductColor(row.conduct)}`}
                        >
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {CONDUCT_OPTIONS.map((o) => (
                            <SelectItem key={o} value={o}>
                              <span className={conductColor(o)}>{o}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Notes */}
                    <TableCell>
                      <Input
                        value={row.notes}
                        onChange={(e) => updateRow(idx, "notes", e.target.value)}
                        placeholder="Optional…"
                        className="text-xs h-8"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && selectedClassKey && selectedMonth && subject && rows.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No students found for this class/section.
          </CardContent>
        </Card>
      )}

      {/* Prompt to select */}
      {!selectedClassKey && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Select a class and month above to begin filling progress reports.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
