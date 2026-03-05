"use client";

export const dynamic = "force-dynamic";

import { useSummary, type SummarySchoolData } from "@/hooks/use-sis-data";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";
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
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
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

const formatSAR = (v: number) =>
  `SAR ${v.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

export default function DelinquencyPage() {
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
        Loading financial data...
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

  const del = schoolData.delinquency;

  const kpis = [
    {
      title: "Total Outstanding",
      value: formatSAR(del.total_outstanding),
      icon: TrendingDown,
      desc: `${del.students_with_balance} students with balance`,
      color: "text-red-600",
    },
    {
      title: "Collection Rate",
      value: `${del.collection_rate}%`,
      icon: TrendingUp,
      desc: `${formatSAR(del.total_paid)} collected`,
      color: del.collection_rate >= 70 ? "text-green-600" : "text-amber-600",
    },
    {
      title: "Fully Paid",
      value: del.students_fully_paid.toLocaleString(),
      icon: CheckCircle,
      desc: "Students with zero balance",
      color: "text-green-600",
    },
    {
      title: "Zero Payments",
      value: del.students_zero_paid.toLocaleString(),
      icon: XCircle,
      desc: "Students who paid nothing",
      color: "text-red-600",
    },
  ];

  // Colors for installment chart bars
  const instColors = ["#3b82f6", "#8b5cf6", "#f59e0b", "#6b7280"];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Financial Delinquency
        </h1>
        <p className="text-muted-foreground">
          Outstanding balances & collection analysis — {selectedLabel}
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
              <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
              <p className="text-xs text-muted-foreground">{k.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary Bar: Charged vs Paid vs Outstanding */}
      <Card>
        <CardHeader>
          <CardTitle>Financial Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Total Charged</p>
              <p className="text-xl font-bold">{formatSAR(del.total_charged)}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Total Paid</p>
              <p className="text-xl font-bold text-green-600">
                {formatSAR(del.total_paid)}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Total Discount</p>
              <p className="text-xl font-bold text-orange-500">
                {formatSAR(del.total_discount)}
              </p>
            </div>
          </div>
          {/* Collection progress bar */}
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-muted-foreground">Collection Progress</span>
              <span className="font-medium">{del.collection_rate}%</span>
            </div>
            <div className="h-3 w-full rounded-full bg-muted">
              <div
                className="h-3 rounded-full bg-green-500 transition-all"
                style={{
                  width: `${Math.min(del.collection_rate, 100)}%`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Outstanding by Installment Chart */}
      {del.balance_by_installment.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Outstanding by Installment</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={del.balance_by_installment}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(v: number) => `${(v / 1e6).toFixed(1)}M`} />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [formatSAR(Number(value)), "Outstanding"]}
                />
                <Bar dataKey="outstanding" radius={[4, 4, 0, 0]}>
                  {del.balance_by_installment.map((_, i) => (
                    <Cell
                      key={i}
                      fill={instColors[i % instColors.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Rate badges */}
            <div className="mt-4 flex flex-wrap gap-3">
              {del.balance_by_installment.map((inst) => (
                <div
                  key={inst.term}
                  className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                >
                  <span className="text-muted-foreground">{inst.label}:</span>
                  <span
                    className={`font-semibold ${
                      inst.rate >= 70 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {inst.rate}% collected
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Balance by Class */}
      {del.balance_by_class.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Outstanding Balance by Class</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Charged</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Collection %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {del.balance_by_class.map((row) => (
                  <TableRow key={row.classCode}>
                    <TableCell className="font-medium">
                      {row.className}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatSAR(row.charged)}
                    </TableCell>
                    <TableCell className="text-right text-red-600 font-semibold">
                      {formatSAR(row.outstanding)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          row.rate >= 70 ? "text-green-600" : "text-red-600"
                        }
                      >
                        {row.rate}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Top Delinquent Students */}
      {del.top_delinquents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Top Outstanding Balances
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Charged</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {del.top_delinquents.map((s, i) => (
                  <TableRow key={s.studentNumber}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <StudentDetailDialog
                        studentName={s.studentName}
                        studentNumber={s.studentNumber}
                        className={s.className}
                        detail={s.detail}
                        stats={[
                          { label: "Charged", value: formatSAR(s.charged) },
                          { label: "Paid", value: formatSAR(s.paid) },
                          { label: "Balance", value: formatSAR(s.balance) },
                        ]}
                      >
                        <button className="text-left hover:underline text-blue-600 cursor-pointer">
                          {s.studentName}
                        </button>
                      </StudentDetailDialog>
                    </TableCell>
                    <TableCell>{s.className}</TableCell>
                    <TableCell className="text-right">
                      {formatSAR(s.charged)}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      {formatSAR(s.paid)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-red-600">
                      {formatSAR(s.balance)}
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
