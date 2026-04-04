"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useSummary, useDelinquencyStudents, type SummarySchoolData } from "@/hooks/use-sis-data";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search,
  ChevronDown,
  ChevronRight,
  Users,
  LayoutList,
  Building2,
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

  const [activeDialog, setActiveDialog] = useState<"fully_paid" | "zero_paid" | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [groupMode, setGroupMode] = useState<"flat" | "grade" | "family">("flat");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const { data: delinquencyStudentsData, loading: loadingStudents, fetchStudents } = useDelinquencyStudents(
    selectedYear,
    schoolFilter
  );

  // Fetch student lists when dialog opens
  useEffect(() => {
    if (activeDialog) {
      fetchStudents();
    }
  }, [activeDialog, fetchStudents]);

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
      clickable: false as const,
    },
    {
      title: "Collection Rate",
      value: `${del.collection_rate}%`,
      icon: TrendingUp,
      desc: `${formatSAR(del.total_paid)} collected`,
      color: del.collection_rate >= 70 ? "text-green-600" : "text-amber-600",
      clickable: false as const,
    },
    {
      title: "Fully Paid",
      value: del.students_fully_paid.toLocaleString(),
      icon: CheckCircle,
      desc: "Students with zero balance",
      color: "text-green-600",
      clickable: true as const,
      dialogKey: "fully_paid" as const,
    },
    {
      title: "Zero Payments",
      value: del.students_zero_paid.toLocaleString(),
      icon: XCircle,
      desc: "Students who paid nothing",
      color: "text-red-600",
      clickable: true as const,
      dialogKey: "zero_paid" as const,
    },
  ];

  const dialogStudents = activeDialog === "fully_paid"
    ? (delinquencyStudentsData?.fully_paid_students ?? [])
    : activeDialog === "zero_paid"
    ? (delinquencyStudentsData?.zero_paid_students ?? [])
    : [];

  const filteredDialogStudents = dialogStudents.filter((s) => {
    if (!studentSearch) return true;
    const q = studentSearch.toLowerCase();
    return (
      s.studentName.toLowerCase().includes(q) ||
      s.studentNumber.toLowerCase().includes(q) ||
      s.className.toLowerCase().includes(q)
    );
  }).sort((a, b) => a.studentName.localeCompare(b.studentName));

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
          <Card
            key={k.title}
            className={k.clickable ? "cursor-pointer transition-shadow hover:shadow-lg hover:ring-1 hover:ring-primary/20" : ""}
            onClick={k.clickable ? () => { setActiveDialog(k.dialogKey); setStudentSearch(""); setGroupMode("flat"); setCollapsedGroups(new Set()); } : undefined}
          >
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

      {/* Fully Paid / Zero Payments Student List Dialog */}
      <Dialog open={activeDialog !== null} onOpenChange={(open) => { if (!open) setActiveDialog(null); }}>
        <DialogContent className="sm:max-w-[850px] max-h-[85vh] overflow-hidden p-0 gap-0">
          <div className={`px-6 py-5 text-white rounded-t-lg ${activeDialog === "fully_paid" ? "bg-gradient-to-r from-green-700 to-green-500" : "bg-gradient-to-r from-red-700 to-red-500"}`}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-lg font-semibold text-white">
                {activeDialog === "fully_paid" ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <XCircle className="h-5 w-5" />
                )}
                {activeDialog === "fully_paid" ? "Fully Paid Students" : "Zero Payment Students"}
                <span className="ml-auto text-sm font-normal opacity-80">
                  {loadingStudents ? "Loading..." : `${dialogStudents.length} students`}
                </span>
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="px-6 py-4 border-b space-y-3">
            {/* Group mode toggle */}
            <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
              {([
                { key: "flat" as const, label: "Flat List", icon: LayoutList },
                { key: "grade" as const, label: "By Grade & Section", icon: Building2 },
                { key: "family" as const, label: "By Family", icon: Users },
              ]).map((m) => (
                <button
                  key={m.key}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors flex-1 justify-center ${
                    groupMode === m.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => { setGroupMode(m.key); setCollapsedGroups(new Set()); }}
                >
                  <m.icon className="h-3.5 w-3.5" />
                  {m.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, student number, or class..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="overflow-y-auto max-h-[55vh]">
            {loadingStudents ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-3" />
                Loading student data...
              </div>
            ) : (() => {
              const toggleGroup = (key: string) => {
                setCollapsedGroups((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                });
              };

              if (groupMode === "flat") {
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky top-0 bg-background z-10">#</TableHead>
                        <TableHead className="sticky top-0 bg-background z-10">Student Name</TableHead>
                        <TableHead className="sticky top-0 bg-background z-10">Class</TableHead>
                        <TableHead className="sticky top-0 bg-background z-10 text-right">Charged</TableHead>
                        <TableHead className="sticky top-0 bg-background z-10 text-right">Paid</TableHead>
                        <TableHead className="sticky top-0 bg-background z-10 text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDialogStudents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            {studentSearch ? "No students match your search" : "No students found"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredDialogStudents.map((s, i) => (
                          <TableRow key={s.studentNumber}>
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell>
                              <div className="font-medium">{s.studentName}</div>
                              <div className="text-xs text-muted-foreground font-mono">{s.studentNumber}</div>
                            </TableCell>
                            <TableCell>{s.className}</TableCell>
                            <TableCell className="text-right">{formatSAR(s.charged)}</TableCell>
                            <TableCell className={`text-right ${s.paid > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                              {formatSAR(s.paid)}
                            </TableCell>
                            <TableCell className={`text-right font-semibold ${s.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                              {formatSAR(s.balance)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                );
              }

              // Grouped modes
              const groups = new Map<string, typeof filteredDialogStudents>();
              for (const s of filteredDialogStudents) {
                let key: string;
                if (groupMode === "grade") {
                  const major = s.majorCode === "0021-01" ? "Boys' School" : s.majorCode === "0021-02" ? "Co-ed School" : s.majorCode || "Unknown";
                  key = `${major} — ${s.className || "Unknown"} — ${s.sectionName || `Section ${s.sectionCode}` || "Unknown"}`;
                } else {
                  key = s.familyName ? `${s.familyName} Family` : `Family #${s.familyNumber || "Unknown"}`;
                }
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(s);
              }

              // Sort groups by key
              const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

              return (
                <div>
                  {sortedGroups.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      {studentSearch ? "No students match your search" : "No students found"}
                    </div>
                  ) : (
                    sortedGroups.map(([groupKey, students]) => {
                      const isCollapsed = collapsedGroups.has(groupKey);
                      const groupCharged = students.reduce((sum, s) => sum + s.charged, 0);
                      const groupPaid = students.reduce((sum, s) => sum + s.paid, 0);
                      const groupBalance = students.reduce((sum, s) => sum + s.balance, 0);
                      return (
                        <div key={groupKey}>
                          <button
                            className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/50 hover:bg-muted border-b text-left transition-colors"
                            onClick={() => toggleGroup(groupKey)}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <span className="font-semibold text-sm truncate">{groupKey}</span>
                            <span className="ml-auto flex items-center gap-3 shrink-0 text-xs">
                              <span className="text-muted-foreground">{students.length} student{students.length !== 1 ? "s" : ""}</span>
                              <span className="font-medium">{formatSAR(groupCharged)}</span>
                              <span className={`font-medium ${groupPaid > 0 ? "text-green-600" : "text-muted-foreground"}`}>{formatSAR(groupPaid)}</span>
                              <span className={`font-semibold ${groupBalance > 0 ? "text-red-600" : "text-green-600"}`}>{formatSAR(groupBalance)}</span>
                            </span>
                          </button>
                          {!isCollapsed && (
                            <Table>
                              <TableBody>
                                {students.map((s, i) => (
                                  <TableRow key={s.studentNumber}>
                                    <TableCell className="text-muted-foreground w-10 pl-10">{i + 1}</TableCell>
                                    <TableCell>
                                      <div className="font-medium">{s.studentName}</div>
                                      <div className="text-xs text-muted-foreground font-mono">{s.studentNumber}</div>
                                    </TableCell>
                                    <TableCell>{s.className}</TableCell>
                                    <TableCell className="text-right">{formatSAR(s.charged)}</TableCell>
                                    <TableCell className={`text-right ${s.paid > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                                      {formatSAR(s.paid)}
                                    </TableCell>
                                    <TableCell className={`text-right font-semibold ${s.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                                      {formatSAR(s.balance)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })()}
          </div>

          {studentSearch && filteredDialogStudents.length !== dialogStudents.length && (
            <div className="px-6 py-2 border-t text-xs text-muted-foreground">
              Showing {filteredDialogStudents.length} of {dialogStudents.length} students
            </div>
          )}
        </DialogContent>
      </Dialog>

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
