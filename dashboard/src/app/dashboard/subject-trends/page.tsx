"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
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
import { TrendingUp, TrendingDown, BarChart3, Eye } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const LINE_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
  "#84cc16", "#a855f7", "#d946ef", "#64748b", "#0ea5e9",
  "#10b981", "#e11d48", "#7c3aed",
];

export default function SubjectTrendsPage() {
  const { selectedYear, selectedLabel, loading: yearLoading } = useAcademicYear();
  const { schoolFilter, schoolLabel } = useSchoolFilter();
  const { summary, loading: loadSummary } = useSummary(selectedYear);
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());

  const loading = yearLoading || loadSummary;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading subject trends...
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

  const trends = schoolData.subject_trends.trends;

  // If no subjects selected, show top 5 core subjects
  const coreSubjects = ["English", "Math", "Arabic Language", "Science", "Physics"];
  const activeSubjects =
    selectedSubjects.size > 0
      ? selectedSubjects
      : new Set(
          trends
            .filter((t) => coreSubjects.includes(t.subject))
            .map((t) => t.subject)
            .slice(0, 5)
        );

  // Build all years from trends data
  const allYears = Array.from(
    new Set(trends.flatMap((t) => t.years.map((y) => y.year)))
  ).sort();

  // Chart data: each year is a point, each subject is a line
  const chartData = allYears.map((year) => {
    const point: Record<string, string | number> = { year };
    trends.forEach((t) => {
      if (activeSubjects.has(t.subject)) {
        const entry = t.years.find((y) => y.year === year);
        if (entry) point[t.subject] = entry.avg;
      }
    });
    return point;
  });

  // Compute biggest improver and decliner
  const trendDeltas = trends
    .filter((t) => t.years.length >= 2)
    .map((t) => ({
      subject: t.subject,
      first: t.years[0].avg,
      last: t.years[t.years.length - 1].avg,
      delta: t.years[t.years.length - 1].avg - t.years[0].avg,
      years: t.years.length,
    }));

  const improver = trendDeltas.length > 0
    ? trendDeltas.reduce((a, b) => (a.delta > b.delta ? a : b))
    : null;
  const decliner = trendDeltas.length > 0
    ? trendDeltas.reduce((a, b) => (a.delta < b.delta ? a : b))
    : null;

  const toggleSubject = (name: string) => {
    setSelectedSubjects((prev) => {
      const next = new Set(prev);
      // If using defaults, initialize with current active
      if (prev.size === 0) {
        activeSubjects.forEach((s) => next.add(s));
      }
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const kpis = [
    {
      title: "Subjects Tracked",
      value: trends.length.toString(),
      icon: BarChart3,
      desc: `Across ${allYears.length} academic years`,
    },
    {
      title: "Years of Data",
      value: allYears.length.toString(),
      icon: Eye,
      desc: allYears.length > 0 ? `${allYears[0]} – ${allYears[allYears.length - 1]}` : "",
    },
    {
      title: "Most Improved",
      value: improver ? improver.subject : "—",
      icon: TrendingUp,
      desc: improver ? `+${improver.delta.toFixed(1)} pts over ${improver.years} years` : "",
    },
    {
      title: "Most Declined",
      value: decliner && decliner.delta < 0 ? decliner.subject : "—",
      icon: TrendingDown,
      desc:
        decliner && decliner.delta < 0
          ? `${decliner.delta.toFixed(1)} pts over ${decliner.years} years`
          : "No decline detected",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Subject Trend Analysis
        </h1>
        <p className="text-muted-foreground">
          Multi-year subject performance trends — {selectedLabel}
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
              <div className="text-2xl font-bold truncate">{k.value}</div>
              <p className="text-xs text-muted-foreground">{k.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Subject Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Subjects to Compare</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {trends.map((t, i) => {
              const isActive = activeSubjects.has(t.subject);
              return (
                <button
                  key={t.subject}
                  onClick={() => toggleSubject(t.subject)}
                  className={`rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
                    isActive
                      ? "text-white border-transparent"
                      : "text-muted-foreground border-border hover:bg-muted"
                  }`}
                  style={
                    isActive
                      ? { backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }
                      : undefined
                  }
                >
                  {t.subject}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Multi-Year Line Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Subject Averages Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={420}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis domain={[60, 100]} />
                <Tooltip />
                <Legend />
                {trends
                  .filter((t) => activeSubjects.has(t.subject))
                  .map((t, i) => (
                    <Line
                      key={t.subject}
                      type="monotone"
                      dataKey={t.subject}
                      stroke={LINE_COLORS[trends.indexOf(t) % LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* All Subjects Trend Table */}
      {trends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Subject Averages by Year</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  {allYears.map((y) => (
                    <TableHead key={y} className="text-right text-xs">
                      {y}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Δ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trends.map((t) => {
                  const yearMap = Object.fromEntries(
                    t.years.map((y) => [y.year, y.avg])
                  );
                  const delta =
                    t.years.length >= 2
                      ? t.years[t.years.length - 1].avg - t.years[0].avg
                      : 0;
                  return (
                    <TableRow key={t.subject}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {t.subject}
                      </TableCell>
                      {allYears.map((y) => (
                        <TableCell key={y} className="text-right text-xs">
                          {yearMap[y] !== undefined ? yearMap[y] : "—"}
                        </TableCell>
                      ))}
                      <TableCell
                        className={`text-right font-semibold ${
                          delta > 0
                            ? "text-emerald-600"
                            : delta < 0
                            ? "text-red-600"
                            : ""
                        }`}
                      >
                        {delta > 0 ? "+" : ""}
                        {delta.toFixed(1)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
