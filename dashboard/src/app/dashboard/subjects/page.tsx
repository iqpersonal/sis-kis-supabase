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
import { Trophy, AlertTriangle, BookOpen, BarChart3 } from "lucide-react";
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
  if (avg >= 90) return "text-emerald-700 dark:text-emerald-300";
  if (avg >= 80) return "text-yellow-700 dark:text-yellow-300";
  if (avg >= 70) return "text-orange-700 dark:text-orange-300";
  return "text-red-700 dark:text-red-300";
}

const BAR_COLORS = [
  "#22c55e", "#16a34a", "#84cc16", "#eab308", "#f59e0b",
  "#ef4444", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
  "#14b8a6", "#06b6d4", "#f97316", "#64748b", "#a855f7",
  "#10b981", "#0ea5e9", "#d946ef",
];

export default function SubjectsPage() {
  const { selectedYear, selectedLabel, loading: yearLoading } = useAcademicYear();
  const { schoolFilter, schoolLabel } = useSchoolFilter();
  const { summary, loading: loadSummary } = useSummary(selectedYear);

  const loading = yearLoading || loadSummary;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading subject data...
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

  const sp = schoolData.subject_performance;
  const subjects = sp.subjects;
  const heatmap = sp.heatmap;

  // Sort subjects by avg for the bar chart
  const chartData = [...subjects].sort((a, b) => a.avg - b.avg);

  // Get all unique subject names across heatmap rows for table headers
  const allSubjectNames = Array.from(
    new Set(heatmap.flatMap((row) => row.subjects.map((s) => s.name)))
  ).sort();

  const kpis = [
    {
      title: "Total Subjects",
      value: subjects.length.toString(),
      icon: BookOpen,
      desc: "Tracked across all classes",
    },
    {
      title: "Strongest Subject",
      value: sp.strongest_subject,
      icon: Trophy,
      desc: subjects.find((s) => s.name === sp.strongest_subject)
        ? `Avg: ${subjects.find((s) => s.name === sp.strongest_subject)!.avg}`
        : "",
    },
    {
      title: "Weakest Subject",
      value: sp.weakest_subject,
      icon: AlertTriangle,
      desc: subjects.find((s) => s.name === sp.weakest_subject)
        ? `Avg: ${subjects.find((s) => s.name === sp.weakest_subject)!.avg}`
        : "",
    },
    {
      title: "Overall Avg",
      value:
        subjects.length > 0
          ? (
              subjects.reduce((s, x) => s + x.avg, 0) / subjects.length
            ).toFixed(1)
          : "—",
      icon: BarChart3,
      desc: "Average across all subjects",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Subject Performance
        </h1>
        <p className="text-muted-foreground">
          Per-subject averages, comparisons &amp; class heatmap — {selectedLabel}
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

      {/* Subject Comparison Bar Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Subject Average Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(320, chartData.length * 32)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [`${value}`, "Average"]}
                />
                <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Subject Details Table */}
      {subjects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Subject Details</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead className="text-right">Average</TableHead>
                  <TableHead className="text-right">Min</TableHead>
                  <TableHead className="text-right">Max</TableHead>
                  <TableHead className="text-right">Sections</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...subjects]
                  .sort((a, b) => b.avg - a.avg)
                  .map((s) => (
                    <TableRow key={s.name}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className={`text-right font-semibold ${gradeTextColor(s.avg)}`}>
                        {s.avg}
                      </TableCell>
                      <TableCell className="text-right">{s.min}</TableCell>
                      <TableCell className="text-right">{s.max}</TableCell>
                      <TableCell className="text-right">{s.sectionCount}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Heatmap: Class × Subject */}
      {heatmap.length > 0 && allSubjectNames.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Class × Subject Heatmap</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-background px-2 py-1 text-left font-semibold">
                    Class
                  </th>
                  {allSubjectNames.map((name) => (
                    <th
                      key={name}
                      className="px-1 py-1 text-center font-semibold whitespace-nowrap"
                      style={{ writingMode: "vertical-lr", minWidth: 32 }}
                    >
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.map((row) => {
                  const subjMap = Object.fromEntries(
                    row.subjects.map((s) => [s.name, s.avg])
                  );
                  return (
                    <tr key={row.className} className="border-t">
                      <td className="sticky left-0 bg-background px-2 py-1 font-medium whitespace-nowrap">
                        {row.className}
                      </td>
                      {allSubjectNames.map((name) => {
                        const val = subjMap[name];
                        return (
                          <td key={name} className="px-1 py-1 text-center">
                            {val !== undefined ? (
                              <span
                                className={`inline-block rounded px-1.5 py-0.5 text-white font-medium ${gradeColor(val)}`}
                              >
                                {val}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
