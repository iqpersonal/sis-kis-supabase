"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DollarSign,
  Search,
  Receipt,
  CheckCircle2,
  CircleDollarSign,
  AlertTriangle,
  Wallet,
  Plus,
  Download,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAcademicYear } from "@/context/academic-year-context";
import { compareAlphabeticalNames } from "@/lib/name-sort";
import { useSchoolFilter } from "@/context/school-filter-context";
import { useLanguage } from "@/context/language-context";
import { cn } from "@/lib/utils";
import Link from "next/link";

/* ────────────────────── Types ────────────────────── */

interface Installment {
  label: string;
  charged: number;
  paid: number;
  discount: number;
  balance: number;
}

interface YearFee {
  year: string;
  class_name: string;
  total_charged: number;
  total_paid: number;
  total_discount: number;
  balance: number;
  installments: Installment[];
}

interface StudentFee {
  student_number: string;
  student_name: string;
  class_name: string;
  school: string;
  total_charged: number;
  total_paid: number;
  total_discount: number;
  balance: number;
  installments: Installment[];
  status: "paid" | "partial" | "unpaid" | "overpaid";
}

interface Summary {
  total_students: number;
  total_charged: number;
  total_paid: number;
  total_discount: number;
  total_balance: number;
  collection_rate: number;
  paid_count: number;
  partial_count: number;
  unpaid_count: number;
}

type FilterStatus = "all" | "paid" | "partial" | "unpaid";

/* ────────────────────── Helpers ────────────────────── */

function formatSAR(n: number): string {
  return n.toLocaleString("en-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  });
}

const statusBadge: Record<string, { label: string; className: string }> = {
  paid: { label: "Fully Paid", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  overpaid: { label: "Overpaid", className: "bg-blue-50 text-blue-700 border-blue-200" },
  partial: { label: "Partial", className: "bg-amber-50 text-amber-700 border-amber-200" },
  unpaid: { label: "Unpaid", className: "bg-red-50 text-red-700 border-red-200" },
};

/* ────────────────────── Page ────────────────────── */

export default function FeeManagementPage() {
  const { selectedYear } = useAcademicYear();
  const { schoolFilter } = useSchoolFilter();
  const { t } = useLanguage();

  const [students, setStudents] = useState<StudentFee[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [selectedStudent, setSelectedStudent] = useState<StudentFee | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentType, setPaymentType] = useState<"payment" | "discount">("payment");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [yearHistory, setYearHistory] = useState<YearFee[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedYear, setExpandedYear] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedYear) params.set("year", selectedYear);
      if (schoolFilter !== "all") params.set("school", schoolFilter);
      const res = await fetch(`/api/fees?${params}`);
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
        setSummary(data.summary || null);
      } else {
        setError("Failed to load fee data. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [selectedYear, schoolFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = students.filter((s) => {
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.student_name.toLowerCase().includes(q) ||
        s.student_number.includes(q) ||
        s.class_name.toLowerCase().includes(q)
      );
    }
    return true;
  }).sort((a, b) => compareAlphabeticalNames(a.student_name, b.student_name));

  const handleRecordPayment = async () => {
    if (!selectedStudent || !paymentAmount) return;
    setSaving(true);
    try {
      await fetch("/api/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentNumber: selectedStudent.student_number,
          year: selectedYear,
          amount: parseFloat(paymentAmount),
          type: paymentType,
          notes: paymentNotes,
        }),
      });
      setPaymentDialogOpen(false);
      setPaymentAmount("");
      setPaymentNotes("");
      setSelectedStudent(null);
      fetchData();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const exportCSV = () => {
    const header = "Student Number,Student Name,Class,Status,Charged,Paid,Discount,Balance\n";
    const rows = filtered
      .map(
        (s) =>
          `${s.student_number},"${s.student_name}",${s.class_name},${s.status},${s.total_charged},${s.total_paid},${s.total_discount},${s.balance}`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fees_${selectedYear || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filters: { key: FilterStatus; label: string; count: number; color: string }[] = [
    { key: "all", label: t("all"), count: summary?.total_students || 0, color: "" },
    { key: "unpaid", label: statusBadge.unpaid.label, count: summary?.unpaid_count || 0, color: "text-red-600" },
    { key: "partial", label: statusBadge.partial.label, count: summary?.partial_count || 0, color: "text-amber-600" },
    { key: "paid", label: statusBadge.paid.label, count: summary?.paid_count || 0, color: "text-emerald-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DollarSign className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("financials")} Management</h1>
            <p className="text-sm text-muted-foreground">
              Track fees, payments, and outstanding balances
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2">
                  <Receipt className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-blue-700">{formatSAR(summary.total_charged)}</p>
                  <p className="text-xs text-muted-foreground">{t("totalFees")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-100 p-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-emerald-700">{formatSAR(summary.total_paid)}</p>
                  <p className="text-xs text-muted-foreground">{t("paid")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 p-2">
                  <CircleDollarSign className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-purple-700">{formatSAR(summary.total_discount)}</p>
                  <p className="text-xs text-muted-foreground">{t("discount")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2 ${summary.total_balance > 0 ? "bg-amber-100" : "bg-emerald-100"}`}>
                  <Wallet className={`h-5 w-5 ${summary.total_balance > 0 ? "text-amber-600" : "text-emerald-600"}`} />
                </div>
                <div>
                  <p className={`text-lg font-bold ${summary.total_balance > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                    {formatSAR(summary.total_balance)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("outstandingBalance")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-blue-700">{summary.collection_rate}%</p>
                  <p className="text-xs text-muted-foreground">Collection Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters + Search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {filters.map((f) => (
            <Button
              key={f.key}
              variant={filterStatus === f.key ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus(f.key)}
              className={cn(filterStatus !== f.key && f.color)}
            >
              {f.label}
              <Badge
                variant="secondary"
                className={cn(
                  "ml-2",
                  filterStatus === f.key && "bg-primary-foreground/20 text-primary-foreground"
                )}
              >
                {f.count}
              </Badge>
            </Button>
          ))}
        </div>
        <div className="relative ml-auto w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={`${t("search")} by name or number...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Student Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Student Fees</CardTitle>
          <CardDescription>
            {filtered.length} students · Click a student for installment details
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <DollarSign className="h-12 w-12 opacity-20" />
              <p className="text-sm">{t("noData")}</p>
            </div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b text-left">
                    <th className="px-3 py-2 font-medium text-muted-foreground">{t("studentNumber")}</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">{t("name")}</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">{t("grade")}</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground text-right">{t("charged")}</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground text-right">{t("paid")}</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground text-right">{t("balance")}</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground text-center">{t("status")}</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const badge = statusBadge[s.status];
                    return (
                      <tr
                        key={s.student_number}
                        className="border-b hover:bg-muted/50 cursor-pointer"
                        onClick={() => setSelectedStudent(s)}
                      >
                        <td className="px-3 py-2 font-mono text-xs">{s.student_number}</td>
                        <td className="px-3 py-2 font-medium">
                          <Link
                            href={`/dashboard/student/${s.student_number}`}
                            className="text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {s.student_name}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{s.class_name}</td>
                        <td className="px-3 py-2 text-right">{formatSAR(s.total_charged)}</td>
                        <td className="px-3 py-2 text-right text-emerald-600">{formatSAR(s.total_paid)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${
                          s.balance > 0 ? "text-amber-600" : "text-emerald-600"
                        }`}>
                          {formatSAR(s.balance)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${badge.className}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStudent(s);
                              setPaymentDialogOpen(true);
                            }}
                          >
                            <Plus className="mr-1 h-3 w-3" />
                            Payment
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Student Detail Dialog */}
      {selectedStudent && !paymentDialogOpen && (
        <Dialog
          open={!!selectedStudent}
          onOpenChange={() => {
            setSelectedStudent(null);
            setYearHistory([]);
            setExpandedYear(null);
          }}
        >
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedStudent.student_name}</DialogTitle>
              <DialogDescription>
                #{selectedStudent.student_number} · {selectedStudent.class_name}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Current Year Summary */}
              <h4 className="text-sm font-medium text-muted-foreground">Current Year ({selectedYear})</h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{t("totalFees")}</p>
                  <p className="text-lg font-bold">{formatSAR(selectedStudent.total_charged)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{t("paid")}</p>
                  <p className="text-lg font-bold text-emerald-600">{formatSAR(selectedStudent.total_paid)}</p>
                </div>
                {selectedStudent.total_discount > 0 && (
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{t("discount")}</p>
                    <p className="text-lg font-bold text-purple-600">{formatSAR(selectedStudent.total_discount)}</p>
                  </div>
                )}
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{t("balance")}</p>
                  <p className={`text-lg font-bold ${
                    selectedStudent.balance > 0 ? "text-amber-600" : "text-emerald-600"
                  }`}>
                    {formatSAR(selectedStudent.balance)}
                  </p>
                </div>
              </div>

              {/* Current Year Installments */}
              {selectedStudent.installments.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">{t("installment")} Breakdown</h4>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="px-2 py-1.5 text-xs text-muted-foreground">{t("installment")}</th>
                        <th className="px-2 py-1.5 text-xs text-muted-foreground text-right">{t("charged")}</th>
                        <th className="px-2 py-1.5 text-xs text-muted-foreground text-right">{t("paid")}</th>
                        <th className="px-2 py-1.5 text-xs text-muted-foreground text-right">{t("balance")}</th>
                        <th className="px-2 py-1.5 text-xs text-muted-foreground text-center">{t("status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStudent.installments.map((inst) => (
                        <tr key={inst.label} className="border-b">
                          <td className="px-2 py-1.5 font-medium">{inst.label}</td>
                          <td className="px-2 py-1.5 text-right">{formatSAR(inst.charged)}</td>
                          <td className="px-2 py-1.5 text-right text-emerald-600">{formatSAR(inst.paid)}</td>
                          <td className={`px-2 py-1.5 text-right font-medium ${
                            inst.balance > 0 ? "text-amber-600" : "text-emerald-600"
                          }`}>
                            {formatSAR(inst.balance)}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {inst.balance <= 0 ? (
                              <CheckCircle2 className="inline h-4 w-4 text-emerald-500" />
                            ) : (
                              <AlertTriangle className="inline h-4 w-4 text-amber-500" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Year-by-Year History */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium">All Years Fee History</h4>
                  {yearHistory.length === 0 && !historyLoading && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        setHistoryLoading(true);
                        try {
                          const res = await fetch(`/api/fees?student=${selectedStudent.student_number}`);
                          if (res.ok) {
                            const data = await res.json();
                            setYearHistory(data.years || []);
                          }
                        } catch { /* silent */ } finally {
                          setHistoryLoading(false);
                        }
                      }}
                    >
                      Load History
                    </Button>
                  )}
                </div>

                {historyLoading && (
                  <div className="flex justify-center py-4">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                )}

                {yearHistory.length > 0 && (
                  <div className="space-y-2">
                    {/* Grand total across all years */}
                    {(() => {
                      const grandCharged = yearHistory.reduce((s, y) => s + y.total_charged, 0);
                      const grandPaid = yearHistory.reduce((s, y) => s + y.total_paid, 0);
                      const grandDiscount = yearHistory.reduce((s, y) => s + y.total_discount, 0);
                      const grandBalance = yearHistory.reduce((s, y) => s + y.balance, 0);
                      return (
                        <div className="mb-3 rounded-lg bg-muted/50 p-3">
                          <div className="grid grid-cols-4 gap-2 text-center text-xs">
                            <div>
                              <p className="text-muted-foreground">Total Charged</p>
                              <p className="text-sm font-bold">{formatSAR(grandCharged)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Total Paid</p>
                              <p className="text-sm font-bold text-emerald-600">{formatSAR(grandPaid)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Total Discount</p>
                              <p className="text-sm font-bold text-purple-600">{formatSAR(grandDiscount)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Total Balance</p>
                              <p className={`text-sm font-bold ${grandBalance > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                                {formatSAR(grandBalance)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Per-year rows */}
                    {yearHistory.map((yr) => (
                      <div key={yr.year} className="rounded-lg border">
                        <button
                          className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-muted/50 transition-colors"
                          onClick={() => setExpandedYear(expandedYear === yr.year ? null : yr.year)}
                        >
                          <div className="flex items-center gap-3">
                            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                              {yr.year}
                            </span>
                            <span className="text-sm text-muted-foreground">{yr.class_name}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span>{formatSAR(yr.total_charged)}</span>
                            <span className="text-emerald-600">{formatSAR(yr.total_paid)}</span>
                            <span className={`font-medium ${yr.balance > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                              {yr.balance > 0 ? formatSAR(yr.balance) : <CheckCircle2 className="inline h-4 w-4" />}
                            </span>
                          </div>
                        </button>

                        {expandedYear === yr.year && yr.installments.length > 0 && (
                          <div className="border-t px-4 py-2">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b">
                                  <th className="px-2 py-1 text-left text-muted-foreground">{t("installment")}</th>
                                  <th className="px-2 py-1 text-right text-muted-foreground">{t("charged")}</th>
                                  <th className="px-2 py-1 text-right text-muted-foreground">{t("paid")}</th>
                                  <th className="px-2 py-1 text-right text-muted-foreground">{t("balance")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {yr.installments.map((inst) => (
                                  <tr key={inst.label} className="border-b last:border-0">
                                    <td className="px-2 py-1">{inst.label}</td>
                                    <td className="px-2 py-1 text-right">{formatSAR(inst.charged)}</td>
                                    <td className="px-2 py-1 text-right text-emerald-600">{formatSAR(inst.paid)}</td>
                                    <td className={`px-2 py-1 text-right font-medium ${
                                      inst.balance > 0 ? "text-amber-600" : "text-emerald-600"
                                    }`}>
                                      {formatSAR(inst.balance)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => setPaymentDialogOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Record Payment
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {selectedStudent?.student_name} (#{selectedStudent?.student_number})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <div className="flex gap-2">
                <Button
                  variant={paymentType === "payment" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPaymentType("payment")}
                >
                  {t("paid")}
                </Button>
                <Button
                  variant={paymentType === "discount" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPaymentType("discount")}
                >
                  {t("discount")}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Amount (SAR)</label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Input
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Optional notes..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
                {t("cancel")}
              </Button>
              <Button onClick={handleRecordPayment} disabled={saving || !paymentAmount}>
                {saving ? t("loading") : t("save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
