"use client";

export const dynamic = "force-dynamic";

import { useState, useMemo } from "react";
import {
  useQuizSummary,
  type QuizSubjectRow,
  type QuizExamData,
  type QuizSchoolSlice,
} from "@/hooks/use-sis-data";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ClipboardList,
  Users,
  FileCheck,
  TrendingUp,
  BookOpen,
  BarChart3,
  Filter,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

/* ── Colour helpers ─────────────────────────────────────────────── */
function gradeColor(avg: number): string {
  if (avg >= 95) return "bg-emerald-500";
  if (avg >= 90) return "bg-emerald-400";
  if (avg >= 85) return "bg-lime-400";
  if (avg >= 80) return "bg-yellow-400";
  if (avg >= 75) return "bg-orange-400";
  if (avg >= 70) return "bg-orange-500";
  return "bg-red-500";
}

function gradeTextColor(avg: number): string {
  if (avg >= 90) return "text-emerald-600 dark:text-emerald-400";
  if (avg >= 80) return "text-yellow-600 dark:text-yellow-400";
  if (avg >= 70) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

const BAR_COLORS = [
  "#22c55e", "#16a34a", "#84cc16", "#eab308", "#f59e0b",
  "#ef4444", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
  "#14b8a6", "#06b6d4", "#f97316", "#64748b", "#a855f7",
  "#10b981", "#0ea5e9", "#d946ef",
];

function barColor(avg: number): string {
  if (avg >= 90) return "#22c55e";
  if (avg >= 80) return "#eab308";
  if (avg >= 70) return "#f59e0b";
  return "#ef4444";
}

/* ── Page ───────────────────────────────────────────────────────── */
export default function AssessmentsPage() {
  const { selectedYear, selectedLabel, loading: yearLoading } = useAcademicYear();
  const { schoolFilter, schoolLabel } = useSchoolFilter();
  const { quizSummary, loading: loadQuiz } = useQuizSummary(selectedYear);

  const [selectedExam, setSelectedExam] = useState<string>("all");
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [selectedSection, setSelectedSection] = useState<string>("all");

  const loading = yearLoading || loadQuiz;

  // Pick the right school slice
  const schoolSlice: QuizSchoolSlice | null = useMemo(() => {
    if (!quizSummary) return null;
    if (schoolFilter === "all") return quizSummary.all;
    return quizSummary[schoolFilter as "0021-01" | "0021-02"] ?? quizSummary.all;
  }, [quizSummary, schoolFilter]);

  // Available sections for the selected class
  const availableSections = useMemo(() => {
    if (!schoolSlice || selectedClass === "all") return [];
    return schoolSlice.sections[selectedClass] ?? [];
  }, [schoolSlice, selectedClass]);

  // Reset section when class changes
  const handleClassChange = (cls: string) => {
    setSelectedClass(cls);
    setSelectedSection("all");
  };

  // Compute the data slice based on filters
  const { kpis, subjectData, classBreakdown } = useMemo(() => {
    if (!schoolSlice)
      return { kpis: null, subjectData: [] as QuizSubjectRow[], classBreakdown: [] as { classCode: string; className: string; records: number; graded: number; avg: number; students: number }[] };

    // Which exams to include
    const examCodes =
      selectedExam === "all"
        ? Object.keys(schoolSlice.data)
        : [selectedExam];

    let totalRecords = 0;
    let totalGraded = 0;
    let totalSum = 0;
    let totalStudents = 0;
    const subjectAcc: Record<string, { total: number; graded: number; sum: number; min: number; max: number }> = {};
    const classAcc: Record<string, { className: string; total: number; graded: number; sum: number; students: number }> = {};

    for (const ec of examCodes) {
      const examData: QuizExamData | undefined = schoolSlice.data[ec];
      if (!examData) continue;

      if (selectedClass === "all") {
        // Use overall
        const ov = examData.overall;
        totalRecords += ov.records;
        totalGraded += ov.graded;
        totalSum += ov.avg * ov.graded;
        totalStudents += ov.students;

        for (const s of ov.bySubject) {
          const a = subjectAcc[s.code] || (subjectAcc[s.code] = { total: 0, graded: 0, sum: 0, min: 999, max: 0 });
          a.total += s.records;
          a.graded += s.graded;
          a.sum += s.avg * s.graded;
          if (s.min < a.min) a.min = s.min;
          if (s.max > a.max) a.max = s.max;
        }

        // Class breakdown
        for (const [cc, cd] of Object.entries(examData.byClass)) {
          const a = classAcc[cc] || (classAcc[cc] = { className: cd.className, total: 0, graded: 0, sum: 0, students: 0 });
          a.total += cd.records;
          a.graded += cd.graded;
          a.sum += cd.avg * cd.graded;
          a.students += cd.students;
        }
      } else if (selectedSection === "all") {
        // Use class level
        const cd = examData.byClass[selectedClass];
        if (!cd) continue;
        totalRecords += cd.records;
        totalGraded += cd.graded;
        totalSum += cd.avg * cd.graded;
        totalStudents += cd.students;

        for (const s of cd.bySubject) {
          const a = subjectAcc[s.code] || (subjectAcc[s.code] = { total: 0, graded: 0, sum: 0, min: 999, max: 0 });
          a.total += s.records;
          a.graded += s.graded;
          a.sum += s.avg * s.graded;
          if (s.min < a.min) a.min = s.min;
          if (s.max > a.max) a.max = s.max;
        }

        // Section breakdown as "class breakdown"
        for (const [sc, sd] of Object.entries(cd.bySection)) {
          const a = classAcc[sc] || (classAcc[sc] = { className: sd.sectionName, total: 0, graded: 0, sum: 0, students: 0 });
          a.total += sd.records;
          a.graded += sd.graded;
          a.sum += sd.avg * sd.graded;
          a.students += sd.students;
        }
      } else {
        // Use section level
        const cd = examData.byClass[selectedClass];
        if (!cd) continue;
        const sd = cd.bySection[selectedSection];
        if (!sd) continue;
        totalRecords += sd.records;
        totalGraded += sd.graded;
        totalSum += sd.avg * sd.graded;
        totalStudents += sd.students;

        for (const s of sd.bySubject) {
          const a = subjectAcc[s.code] || (subjectAcc[s.code] = { total: 0, graded: 0, sum: 0, min: 999, max: 0 });
          a.total += s.records;
          a.graded += s.graded;
          a.sum += s.avg * s.graded;
          if (s.min < a.min) a.min = s.min;
          if (s.max > a.max) a.max = s.max;
        }
      }
    }

    const kpis = {
      records: totalRecords,
      graded: totalGraded,
      avg: totalGraded > 0 ? Math.round((totalSum / totalGraded) * 10) / 10 : 0,
      students: totalStudents,
      pending: totalRecords - totalGraded,
    };

    // Build subject list
    const subjectNames: Record<string, string> = {};
    for (const ex of Object.values(schoolSlice.data)) {
      for (const s of ex.overall.bySubject) {
        subjectNames[s.code] = s.name;
      }
    }

    const subjectData: QuizSubjectRow[] = Object.entries(subjectAcc)
      .map(([code, a]) => ({
        code,
        name: subjectNames[code] || code,
        records: a.total,
        graded: a.graded,
        avg: a.graded > 0 ? Math.round((a.sum / a.graded) * 10) / 10 : 0,
        min: a.min < 999 ? a.min : 0,
        max: a.max,
      }))
      .sort((a, b) => a.avg - b.avg);

    const classBreakdown = Object.entries(classAcc)
      .map(([code, a]) => ({
        classCode: code,
        className: a.className,
        records: a.total,
        graded: a.graded,
        avg: a.graded > 0 ? Math.round((a.sum / a.graded) * 10) / 10 : 0,
        students: a.students,
      }))
      .sort((a, b) => a.classCode.localeCompare(b.classCode));

    return { kpis, subjectData, classBreakdown };
  }, [schoolSlice, selectedExam, selectedClass, selectedSection]);

  /* ── Render ──────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading assessment data...
      </div>
    );
  }

  if (!quizSummary || !schoolSlice) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No assessment data available for {selectedLabel}. Run the summary generation script.
      </div>
    );
  }

  const filterLabel = [
    selectedExam !== "all"
      ? schoolSlice.exams.find((e) => e.examCode === selectedExam)?.examName
      : null,
    selectedClass !== "all"
      ? schoolSlice.classes.find((c) => c.classCode === selectedClass)?.className
      : null,
    selectedSection !== "all"
      ? availableSections.find((s) => s.sectionCode === selectedSection)?.sectionName
      : null,
  ]
    .filter(Boolean)
    .join(" → ");

  return (
    <div className="space-y-8">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Assessments</h1>
        <p className="text-muted-foreground">
          Quiz &amp; assessment grades breakdown — {selectedLabel}
          {schoolFilter !== "all" && ` — ${schoolLabel}`}
          {filterLabel && ` — ${filterLabel}`}
        </p>
      </div>

      {/* ── Filters ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Term / Exam selector */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Term / Exam
              </label>
              <select
                value={selectedExam}
                onChange={(e) => setSelectedExam(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All Terms</option>
                {schoolSlice.exams.map((ex) => (
                  <option key={ex.examCode} value={ex.examCode}>
                    {ex.examName} ({ex.graded.toLocaleString()} graded)
                  </option>
                ))}
              </select>
            </div>

            {/* Class selector */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Class / Grade
              </label>
              <select
                value={selectedClass}
                onChange={(e) => handleClassChange(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All Classes</option>
                {schoolSlice.classes.map((cl) => (
                  <option key={cl.classCode} value={cl.classCode}>
                    {cl.className}
                  </option>
                ))}
              </select>
            </div>

            {/* Section selector */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Section / School
              </label>
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                disabled={selectedClass === "all"}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm font-medium disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">
                  {selectedClass === "all" ? "Select a class first" : "All Sections"}
                </option>
                {availableSections.map((sec) => (
                  <option key={sec.sectionCode} value={sec.sectionCode}>
                    {sec.sectionName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── KPI Cards ───────────────────────────────────────────── */}
      {kpis && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                <ClipboardList className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Records</p>
                <p className="text-2xl font-bold tabular-nums">{kpis.records.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                <FileCheck className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Graded</p>
                <p className="text-2xl font-bold tabular-nums">{kpis.graded.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                <TrendingUp className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Average</p>
                <p className={`text-2xl font-bold tabular-nums ${gradeTextColor(kpis.avg)}`}>{kpis.avg}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10">
                <Users className="h-5 w-5 text-cyan-500" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Students</p>
                <p className="text-2xl font-bold tabular-nums">{kpis.students.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
                <ClipboardList className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pending</p>
                <p className="text-2xl font-bold tabular-nums text-orange-600">{kpis.pending.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Subject Performance Chart ───────────────────────────── */}
      {subjectData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Average Grade by Subject
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ width: "100%", height: Math.max(300, subjectData.length * 38) }}>
              <ResponsiveContainer>
                <BarChart
                  data={subjectData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={180}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value) => [`${value}`, "Average"]}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Bar dataKey="avg" radius={[0, 4, 4, 0]} barSize={22}>
                    {subjectData.map((entry, idx) => (
                      <Cell key={idx} fill={barColor(entry.avg)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Subject Details Table ───────────────────────────────── */}
      {subjectData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Subject Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Subject</TableHead>
                    <TableHead className="text-right">Records</TableHead>
                    <TableHead className="text-right">Graded</TableHead>
                    <TableHead className="text-right">Average</TableHead>
                    <TableHead className="text-right">Min</TableHead>
                    <TableHead className="text-right">Max</TableHead>
                    <TableHead className="w-[140px]">Grade Bar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subjectData.map((s) => (
                    <TableRow key={s.code}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.records.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.graded.toLocaleString()}</TableCell>
                      <TableCell className={`text-right font-semibold tabular-nums ${gradeTextColor(s.avg)}`}>
                        {s.avg}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{s.min}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{s.max}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-full rounded-full bg-muted">
                            <div
                              className={`h-2.5 rounded-full ${gradeColor(s.avg)}`}
                              style={{ width: `${s.avg}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{s.avg}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Class / Section Comparison Table ────────────────────── */}
      {classBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {selectedClass === "all" ? "Class Comparison" : "Section Comparison"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">
                      {selectedClass === "all" ? "Class" : "Section"}
                    </TableHead>
                    <TableHead className="text-right">Students</TableHead>
                    <TableHead className="text-right">Records</TableHead>
                    <TableHead className="text-right">Graded</TableHead>
                    <TableHead className="text-right">Average</TableHead>
                    <TableHead className="w-[160px]">Performance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classBreakdown.map((row) => (
                    <TableRow key={row.classCode}>
                      <TableCell className="font-medium">{row.className}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.students}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.records.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.graded.toLocaleString()}</TableCell>
                      <TableCell className={`text-right font-semibold tabular-nums ${gradeTextColor(row.avg)}`}>
                        {row.avg}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-full rounded-full bg-muted">
                            <div
                              className={`h-2.5 rounded-full ${gradeColor(row.avg)}`}
                              style={{ width: `${row.avg}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{row.avg}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Exam Overview Cards (when "All Terms" is selected) ─── */}
      {selectedExam === "all" && schoolSlice.exams.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Term / Exam Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {schoolSlice.exams.map((ex) => (
                <div
                  key={ex.examCode}
                  className="rounded-lg border p-4 transition-colors hover:bg-muted/50 cursor-pointer"
                  onClick={() => setSelectedExam(ex.examCode)}
                >
                  <h3 className="font-semibold text-sm mb-2">{ex.examName}</h3>
                  <div className="grid grid-cols-3 gap-y-1 text-sm">
                    <span className="text-muted-foreground">Graded</span>
                    <span className="col-span-2 tabular-nums font-medium">{ex.graded.toLocaleString()}</span>
                    <span className="text-muted-foreground">Average</span>
                    <span className={`col-span-2 tabular-nums font-semibold ${gradeTextColor(ex.avg)}`}>{ex.avg}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted">
                    <div
                      className={`h-2 rounded-full ${gradeColor(ex.avg)}`}
                      style={{ width: `${ex.avg}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
