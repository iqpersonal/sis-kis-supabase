"use client";

export const dynamic = "force-dynamic";

import { useState, useMemo } from "react";
import { useSummary, type SummarySchoolData } from "@/hooks/use-sis-data";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";
import { useAuth } from "@/context/auth-context";
import { StudentDetailDialog } from "@/components/student-detail-dialog";
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
import { Trophy, Star, Users, Percent } from "lucide-react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportToCSV } from "@/lib/export-csv";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function HonorRollPage() {
  const { selectedYear, selectedLabel, loading: yearLoading } = useAcademicYear();
  const { schoolFilter, schoolLabel } = useSchoolFilter();
  const { can } = useAuth();
  const { summary, loading: loadSummary } = useSummary(selectedYear);

  /* ── Filters for Top Honor Students table (hooks must be before early returns) ── */
  const [classFilter, setClassFilter] = useState<string>("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");

  const loading = yearLoading || loadSummary;

  const schoolData: SummarySchoolData | null = summary
    ? schoolFilter === "all"
      ? summary.all
      : (summary[schoolFilter as "0021-01" | "0021-02"] ?? summary.all)
    : null;

  const topStudents = schoolData?.honor_roll.top_students ?? [];
  const honorByClass = schoolData?.honor_roll.honor_by_class ?? [];

  // Unique class names from honor_by_class (includes all classes, not just those in top_students)
  const classNames = useMemo(() => {
    return honorByClass
      .filter((c) => c.count > 0)
      .map((c) => c.className)
      .sort();
  }, [honorByClass]);

  // Unique sections — filtered by selected class when a class is picked
  const sectionNames = useMemo(() => {
    const filtered =
      classFilter === "all"
        ? topStudents
        : topStudents.filter((s) => s.className === classFilter);
    const set = new Set(filtered.map((s) => s.detail?.section).filter(Boolean));
    return Array.from(set).sort();
  }, [topStudents, classFilter]);

  // Reset section when class changes
  const handleClassChange = (val: string) => {
    setClassFilter(val);
    setSectionFilter("all");
  };

  // Apply filters
  const filteredStudents = useMemo(() => {
    let list = topStudents;
    if (classFilter !== "all") {
      list = list.filter((s) => s.className === classFilter);
    }
    if (sectionFilter !== "all") {
      list = list.filter((s) => s.detail?.section === sectionFilter);
    }
    return list;
  }, [topStudents, classFilter, sectionFilter]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading honor roll data...
      </div>
    );
  }

  if (!summary || !schoolData) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No summary data available. Run the summary generation script.
      </div>
    );
  }

  const hr = schoolData.honor_roll;

  const kpis = [
    {
      title: "Honor Students",
      value: hr.total_honor.toLocaleString(),
      icon: Trophy,
      desc: "Students with avg >= 95",
    },
    {
      title: "Honor Rate",
      value: `${hr.honor_rate}%`,
      icon: Percent,
      desc: "Of total examined students",
    },
    {
      title: "Top Average",
      value:
        hr.top_students.length > 0
          ? hr.top_students[0].avg.toFixed(1)
          : "—",
      icon: Star,
      desc:
        hr.top_students.length > 0
          ? hr.top_students[0].className
          : "",
    },
    {
      title: "Classes Represented",
      value: hr.honor_by_class.filter((c) => c.count > 0).length.toString(),
      icon: Users,
      desc: "Classes with honor students",
    },
  ];

  // Chart data: honor count by class
  const classChartData = hr.honor_by_class
    .filter((c) => c.count > 0)
    .map((c) => ({
      name: c.className,
      "Honor Students": c.count,
      "Honor Rate %": c.rate,
    }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Honor Roll</h1>
          <p className="text-muted-foreground">
            Top-performing students (avg &ge; 95) — {selectedLabel}
            {schoolFilter !== "all" && ` — ${schoolLabel}`}
          </p>
        </div>
        {hr.top_students.length > 0 && can("bulk_export.view") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportToCSV(
                `honor-roll-${selectedYear}`,
                ["#", "Student Name", "Student Number", "Class", "Section", "Average", "Class Rank", "Section Rank"],
                filteredStudents.map((s, i) => [i + 1, s.studentName, s.studentNumber, s.className, s.detail?.section ?? "", s.avg, s.classRank, s.secRank]),
              )
            }
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {k.title}
              </CardTitle>
              <k.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{k.value}</div>
              <p className="text-xs text-muted-foreground">{k.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Honor Students by Class Chart */}
      {classChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Honor Students by Class</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(300, classChartData.length * 36)}>
              <BarChart data={classChartData} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="Honor Students" fill="#eab308" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Honor Rate by Class Table */}
      {hr.honor_by_class.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Honor Rate by Class</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Total Students</TableHead>
                  <TableHead className="text-right">Honor Students</TableHead>
                  <TableHead className="text-right">Honor Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hr.honor_by_class.map((c) => (
                  <TableRow key={c.classCode}>
                    <TableCell className="font-medium">{c.className}</TableCell>
                    <TableCell className="text-right">{c.total}</TableCell>
                    <TableCell className="text-right font-semibold text-yellow-600">
                      {c.count}
                    </TableCell>
                    <TableCell className="text-right">{c.rate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Top Honor Students */}
      {hr.top_students.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Top Honor Students
                <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                  {filteredStudents.length}
                </span>
              </CardTitle>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Class</label>
                  <select
                    value={classFilter}
                    onChange={(e) => handleClassChange(e.target.value)}
                    className="h-8 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="all">All Classes</option>
                    {classNames.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Section</label>
                  <select
                    value={sectionFilter}
                    onChange={(e) => setSectionFilter(e.target.value)}
                    className="h-8 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="all">All Sections</option>
                    {sectionNames.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead className="text-right">Average</TableHead>
                  <TableHead className="text-right">Class Rank</TableHead>
                  <TableHead className="text-right">Section Rank</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No honor students found for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStudents.map((s, i) => (
                    <TableRow key={s.studentNumber}>
                      <TableCell>
                        {i < 3 ? (
                          <span className="text-lg">
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                          </span>
                        ) : (
                          i + 1
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        <StudentDetailDialog
                          studentName={s.studentName}
                          studentNumber={s.studentNumber}
                          className={s.className}
                          detail={s.detail}
                          stats={[
                            { label: "Average", value: s.avg },
                            { label: "Class Rank", value: s.classRank },
                            { label: "Section Rank", value: s.secRank },
                          ]}
                        >
                          <button className="text-left hover:underline text-blue-600 cursor-pointer">
                            {s.studentName}
                          </button>
                        </StudentDetailDialog>
                      </TableCell>
                      <TableCell>{s.className}</TableCell>
                      <TableCell>{s.detail?.section ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold text-yellow-600">
                        {s.avg}
                      </TableCell>
                      <TableCell className="text-right">{s.classRank}</TableCell>
                      <TableCell className="text-right">{s.secRank}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
