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
import {
  CalendarOff,
  Clock,
  Users,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function AttendancePage() {
  const {
    selectedYear,
    selectedLabel,
    loading: yearLoading,
  } = useAcademicYear();
  const { schoolFilter, schoolLabel } = useSchoolFilter();
  const { summary, loading: loadSummary } = useSummary(selectedYear);

  const loading = yearLoading || loadSummary;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading attendance data...
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

  const att = schoolData.attendance_detail;
  const monthData = schoolData.academics.attendance_by_month;

  const kpis = [
    {
      title: "Total Absence Days",
      value: att.total_absence_days.toLocaleString(),
      icon: CalendarOff,
      desc: `${att.students_with_absences} students with absences`,
    },
    {
      title: "Total Tardy",
      value: att.total_tardy.toLocaleString(),
      icon: Clock,
      desc: `${att.students_with_tardy} students with tardies`,
    },
    {
      title: "Avg Absence/Student",
      value: att.avg_absence_per_student.toFixed(1),
      icon: Users,
      desc: "Days per enrolled student",
    },
    {
      title: "Avg Tardy/Student",
      value: att.avg_tardy_per_student.toFixed(1),
      icon: TrendingUp,
      desc: "Tardies per enrolled student",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Attendance & Conduct
        </h1>
        <p className="text-muted-foreground">
          Absence & tardy analysis — {selectedLabel}
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

      {/* Monthly Attendance Chart */}
      {monthData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly Absences & Tardies</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={monthData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="absences"
                  fill="#ef4444"
                  name="Absences"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="tardy"
                  fill="#f59e0b"
                  name="Tardy"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Absence & Tardy by Class */}
      {att.absence_by_class.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Attendance by Class</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  <TableHead className="text-right">Absence Days</TableHead>
                  <TableHead className="text-right">Tardies</TableHead>
                  <TableHead className="text-right">Avg Absence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {att.absence_by_class.map((row) => (
                  <TableRow key={row.classCode}>
                    <TableCell className="font-medium">
                      {row.className}
                    </TableCell>
                    <TableCell className="text-right">{row.students}</TableCell>
                    <TableCell className="text-right">
                      {row.absenceDays.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.tardyCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.avgAbsence.toFixed(1)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Top Absentees */}
      {att.top_absentees.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Top Absentees
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Absence Days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {att.top_absentees.map((s, i) => (
                  <TableRow key={s.studentNumber}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      {s.studentName}
                    </TableCell>
                    <TableCell>{s.className}</TableCell>
                    <TableCell className="text-right font-semibold text-red-600">
                      {s.days}
                    </TableCell>
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
