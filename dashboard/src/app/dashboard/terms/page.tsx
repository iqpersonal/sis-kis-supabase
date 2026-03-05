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
import { CalendarDays, TrendingUp, TrendingDown, Award } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const TERM_COLORS = ["#3b82f6", "#22c55e", "#f59e0b"];

export default function TermsPage() {
  const { selectedYear, selectedLabel, loading: yearLoading } = useAcademicYear();
  const { schoolFilter, schoolLabel } = useSchoolFilter();
  const { summary, loading: loadSummary } = useSummary(selectedYear);

  const loading = yearLoading || loadSummary;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading term data...
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

  const tp = schoolData.term_progress;
  const terms = tp.terms;
  const termBySubject = tp.term_by_subject;

  // Compute trend direction
  const hasTrend = terms.length >= 2;
  const firstAvg = terms[0]?.avgGrade ?? 0;
  const lastAvg = terms[terms.length - 1]?.avgGrade ?? 0;
  const trendUp = lastAvg >= firstAvg;
  const trendDelta = Math.abs(lastAvg - firstAvg).toFixed(1);

  const kpis = [
    {
      title: "Terms Available",
      value: terms.length.toString(),
      icon: CalendarDays,
      desc: terms.map((t) => t.termName).join(", ") || "No semester data",
    },
    {
      title: "Latest Avg Grade",
      value: terms.length > 0 ? terms[terms.length - 1].avgGrade.toFixed(1) : "—",
      icon: Award,
      desc: terms.length > 0 ? terms[terms.length - 1].termName : "",
    },
    {
      title: "Latest Pass Rate",
      value: terms.length > 0 ? `${terms[terms.length - 1].passRate.toFixed(1)}%` : "—",
      icon: TrendingUp,
      desc: terms.length > 0 ? `${terms[terms.length - 1].count} students` : "",
    },
    {
      title: "Trend",
      value: hasTrend
        ? `${trendUp ? "▲" : "▼"} ${trendDelta} pts`
        : "—",
      icon: trendUp ? TrendingUp : TrendingDown,
      desc: hasTrend
        ? `${terms[0].termName} → ${terms[terms.length - 1].termName}`
        : "Need 2+ terms",
    },
  ];

  // Chart: term avg + pass rate side by side
  const termChartData = terms.map((t) => ({
    name: t.termName,
    "Avg Grade": t.avgGrade,
    "Pass Rate": t.passRate,
  }));

  // Build pivot table: each subject as a row, each term as a column
  const termNames = termBySubject.length > 0
    ? termBySubject[0].terms.map((t) => t.term)
    : terms.map((t) => t.termName);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Term-by-Term Progress
        </h1>
        <p className="text-muted-foreground">
          Semester comparison &amp; subject trends within the year — {selectedLabel}
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
              <p className="text-xs text-muted-foreground truncate">{k.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Term Avg & Pass Rate Chart */}
      {termChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Average Grade & Pass Rate by Term</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={termChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Avg Grade" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Pass Rate" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Subject Progress Across Terms (Line Chart) */}
      {termBySubject.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Subject Averages Across Terms</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart
                data={termNames.map((termName, idx) => {
                  const point: Record<string, string | number> = { term: termName };
                  termBySubject.forEach((s) => {
                    if (s.terms[idx]) {
                      point[s.subject] = s.terms[idx].avg;
                    }
                  });
                  return point;
                })}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="term" />
                <YAxis domain={[60, 100]} />
                <Tooltip />
                <Legend />
                {termBySubject.map((s, i) => (
                  <Line
                    key={s.subject}
                    type="monotone"
                    dataKey={s.subject}
                    stroke={TERM_COLORS[i % TERM_COLORS.length] || `hsl(${i * 37}, 70%, 50%)`}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Subject × Term Table */}
      {termBySubject.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Subject Averages by Term</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  {termNames.map((t) => (
                    <TableHead key={t} className="text-right">
                      {t}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {termBySubject.map((s) => {
                  const first = s.terms[0]?.avg ?? 0;
                  const last = s.terms[s.terms.length - 1]?.avg ?? 0;
                  const delta = last - first;
                  return (
                    <TableRow key={s.subject}>
                      <TableCell className="font-medium">{s.subject}</TableCell>
                      {s.terms.map((t, i) => (
                        <TableCell key={i} className="text-right">
                          {t.avg}
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
