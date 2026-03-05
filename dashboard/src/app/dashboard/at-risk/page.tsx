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
import { AlertTriangle, Users, Percent, CalendarOff } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";

export default function AtRiskPage() {
  const { selectedYear, selectedLabel, loading: yearLoading } = useAcademicYear();
  const { schoolFilter, schoolLabel } = useSchoolFilter();
  const { summary, loading: loadSummary } = useSummary(selectedYear);

  const loading = yearLoading || loadSummary;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading at-risk data...
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

  const ar = schoolData.at_risk;

  // Students who are both low-grade AND high absence
  const dualRisk = ar.at_risk_students.filter((s) => s.absenceDays >= 5);

  const kpis = [
    {
      title: "At-Risk Students",
      value: ar.total_at_risk.toLocaleString(),
      icon: AlertTriangle,
      desc: "Students with avg < 70",
    },
    {
      title: "At-Risk Rate",
      value: `${ar.at_risk_rate}%`,
      icon: Percent,
      desc: "Of total examined students",
    },
    {
      title: "Dual Risk",
      value: dualRisk.length.toLocaleString(),
      icon: CalendarOff,
      desc: "Low grade + high absence (5+ days)",
    },
    {
      title: "Classes Affected",
      value: ar.at_risk_by_class.filter((c) => c.count > 0).length.toString(),
      icon: Users,
      desc: "Classes with at-risk students",
    },
  ];

  // Chart: at-risk count by class
  const classChartData = ar.at_risk_by_class
    .filter((c) => c.count > 0)
    .map((c) => ({
      name: c.className,
      "At-Risk Students": c.count,
      "At-Risk Rate %": c.rate,
    }));

  // Scatter plot data: grade vs absence days
  const scatterData = ar.at_risk_students.map((s) => ({
    avg: s.avg,
    absences: s.absenceDays,
    student: s.studentNumber,
    className: s.className,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          At-Risk Students
        </h1>
        <p className="text-muted-foreground">
          Students with avg &lt; 70, cross-referenced with attendance — {selectedLabel}
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

      {/* At-Risk by Class Chart */}
      {classChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>At-Risk Students by Class</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(300, classChartData.length * 36)}>
              <BarChart data={classChartData} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="At-Risk Students" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Grade vs Absence Scatter Plot */}
      {scatterData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Grade vs. Absence Days</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={360}>
              <ScatterChart margin={{ bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="avg"
                  name="Average Grade"
                  domain={[0, 70]}
                  label={{ value: "Average Grade", position: "bottom", offset: 0 }}
                />
                <YAxis
                  type="number"
                  dataKey="absences"
                  name="Absence Days"
                  label={{ value: "Absence Days", angle: -90, position: "insideLeft" }}
                />
                <ZAxis range={[60, 60]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={({ payload }: any) => {
                    if (!payload || payload.length === 0) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="rounded bg-background border p-2 text-xs shadow">
                        <p className="font-semibold">{d.student}</p>
                        <p>Class: {d.className}</p>
                        <p>Average: {d.avg}</p>
                        <p>Absences: {d.absences} days</p>
                      </div>
                    );
                  }}
                />
                <Scatter
                  data={scatterData}
                  fill="#ef4444"
                  fillOpacity={0.7}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* At-Risk by Class Table */}
      {ar.at_risk_by_class.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>At-Risk Rate by Class</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Total Students</TableHead>
                  <TableHead className="text-right">At-Risk</TableHead>
                  <TableHead className="text-right">At-Risk Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ar.at_risk_by_class.map((c) => (
                  <TableRow key={c.classCode}>
                    <TableCell className="font-medium">{c.className}</TableCell>
                    <TableCell className="text-right">{c.total}</TableCell>
                    <TableCell className="text-right font-semibold text-red-600">
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

      {/* At-Risk Student List */}
      {ar.at_risk_students.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              At-Risk Student List
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
                  <TableHead className="text-right">Absence Days</TableHead>
                  <TableHead className="text-center">Dual Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ar.at_risk_students.map((s, i) => (
                  <TableRow key={s.studentNumber}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {s.studentNumber}
                    </TableCell>
                    <TableCell>{s.className}</TableCell>
                    <TableCell className="text-right font-semibold text-red-600">
                      {s.avg}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.absenceDays > 0 ? s.absenceDays : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {s.absenceDays >= 5 ? (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          ⚠ Dual Risk
                        </span>
                      ) : (
                        ""
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {ar.at_risk_students.length === 0 && (
        <Card>
          <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
            No at-risk students found for this period. All students are above the 70% threshold.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
