"use client";

export const dynamic = "force-dynamic";

import { useSummary, type SummarySchoolData } from "@/hooks/use-sis-data";
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
import { Trophy, Star, Users, Percent } from "lucide-react";
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
  const { summary, loading: loadSummary } = useSummary(selectedYear);

  const loading = yearLoading || loadSummary;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading honor roll data...
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No summary data available. Run the summary generation script.
      </div>
    );
  }

  const schoolData: SummarySchoolData =
    schoolFilter === "all"
      ? summary.all
      : (summary[schoolFilter as "0021-01" | "0021-02"] ?? summary.all);

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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Honor Roll</h1>
        <p className="text-muted-foreground">
          Top-performing students (avg &ge; 95) — {selectedLabel}
          {schoolFilter !== "all" && ` — ${schoolLabel}`}
        </p>
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
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Top Honor Students
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Student Number</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Average</TableHead>
                  <TableHead className="text-right">Class Rank</TableHead>
                  <TableHead className="text-right">Section Rank</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hr.top_students.map((s, i) => (
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
                    <TableCell className="font-mono text-sm">
                      {s.studentNumber}
                    </TableCell>
                    <TableCell>{s.className}</TableCell>
                    <TableCell className="text-right font-semibold text-yellow-600">
                      {s.avg}
                    </TableCell>
                    <TableCell className="text-right">{s.classRank}</TableCell>
                    <TableCell className="text-right">{s.secRank}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
