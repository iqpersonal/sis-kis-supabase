"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Loader2, Download, FileText, DollarSign, Users, TrendingUp,
  ShoppingCart, BookOpen, CalendarDays, Printer,
} from "lucide-react";

/* ─── Types ─── */

interface ReportSummary {
  total_transactions: number;
  total_revenue: number;
  total_subtotal: number;
  total_vat: number;
  items_sold: number;
  voided: number;
  unique_students: number;
  by_payment_method: Record<string, { count: number; revenue: number }>;
  by_grade: Record<string, { count: number; revenue: number; unique_students: number }>;
  by_school: Record<string, { count: number; revenue: number }>;
  by_book: Record<string, { title: string; count: number; revenue: number }>;
  by_date: Record<string, { count: number; revenue: number; vat: number }>;
}

interface DailyTransaction {
  id: string;
  receipt_number: string;
  student_name: string;
  student_number: string;
  family_number: string;
  grade: string;
  school: string;
  items_count: number;
  subtotal: number;
  vat: number;
  total: number;
  paid: number;
  payment_method: string;
  sold_by: string;
  time: string;
}

interface UnpaidEntry {
  student_number: string;
  student_name: string;
  family_number: string;
  grade: string;
  school: string;
}

interface CatalogEntry {
  id: string;
  title: string;
  grade: string;
  price: number;
  is_active: boolean;
  sold: number;
  revenue: number;
}

type ReportType = "daily" | "range" | "grade" | "unpaid" | "inventory";

interface ReportsTabProps {
  selectedYear: string;
}

const formatSAR = (n: number) => `SAR ${n.toFixed(2)}`;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsTab({ selectedYear }: ReportsTabProps) {
  const [reportType, setReportType] = useState<ReportType>("daily");
  const [loading, setLoading] = useState(false);

  // Date controls
  const [dailyDate, setDailyDate] = useState(todayStr());
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  // Report data
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [transactions, setTransactions] = useState<DailyTransaction[]>([]);
  const [unpaid, setUnpaid] = useState<UnpaidEntry[]>([]);
  const [unpaidStats, setUnpaidStats] = useState({ total_enrolled: 0, total_paid: 0, total_unpaid: 0 });
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [enrolledByGrade, setEnrolledByGrade] = useState<Record<string, number>>({});

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setSummary(null);
    setTransactions([]);
    setUnpaid([]);
    setCatalog([]);
    try {
      let url = `/api/book-sales/reports?year=${encodeURIComponent(selectedYear)}&type=${reportType}`;
      if (reportType === "daily") url += `&date=${dailyDate}`;
      if (reportType === "range") url += `&from=${rangeFrom}&to=${rangeTo}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.summary) setSummary(data.summary);
      if (data.transactions) setTransactions(data.transactions);
      if (data.unpaid) setUnpaid(data.unpaid);
      if (data.total_enrolled != null) {
        setUnpaidStats({ total_enrolled: data.total_enrolled, total_paid: data.total_paid, total_unpaid: data.total_unpaid });
      }
      if (data.catalog) setCatalog(data.catalog);
      if (data.enrolled_by_grade) setEnrolledByGrade(data.enrolled_by_grade);
    } catch (err) {
      console.error("Report fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, reportType, dailyDate, rangeFrom, rangeTo]);

  // Auto-fetch on type change
  useEffect(() => {
    if (reportType === "range" && (!rangeFrom || !rangeTo)) return;
    fetchReport();
  }, [reportType, fetchReport]);

  /* ── CSV Export ── */
  function exportCSV(filename: string, headers: string[], rows: string[][]) {
    const bom = "\uFEFF";
    const csv = bom + [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function handleExport() {
    if (reportType === "daily" && transactions.length) {
      exportCSV(`daily-report-${dailyDate}.csv`,
        ["Time", "Receipt", "Student", "Student#", "Family#", "Grade", "School", "Items", "Subtotal", "VAT", "Total", "Method", "Sold By"],
        transactions.map((t) => [t.time, t.receipt_number, t.student_name, t.student_number, t.family_number, t.grade, t.school, String(t.items_count), t.subtotal.toFixed(2), t.vat.toFixed(2), t.total.toFixed(2), t.payment_method, t.sold_by]),
      );
    } else if (reportType === "range" && summary) {
      const rows = Object.entries(summary.by_date)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => [date, String(d.count), d.revenue.toFixed(2), d.vat.toFixed(2)]);
      exportCSV(`sales-${rangeFrom}-to-${rangeTo}.csv`, ["Date", "Transactions", "Revenue", "VAT"], rows);
    } else if (reportType === "grade" && summary) {
      const rows = Object.entries(summary.by_grade)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([g, d]) => [g, String(d.count), d.revenue.toFixed(2), String(d.unique_students), String(enrolledByGrade[g] || "—")]);
      exportCSV(`grade-report.csv`, ["Grade", "Transactions", "Revenue", "Students Purchased", "Total Enrolled"], rows);
    } else if (reportType === "unpaid" && unpaid.length) {
      exportCSV(`unpaid-families.csv`,
        ["Student#", "Student Name", "Family#", "Grade", "School"],
        unpaid.map((u) => [u.student_number, u.student_name, u.family_number, u.grade, u.school]),
      );
    } else if (reportType === "inventory" && catalog.length) {
      exportCSV(`book-inventory.csv`,
        ["Title", "Grade", "Price", "Sold", "Revenue", "Active"],
        catalog.map((b) => [b.title, b.grade, b.price.toFixed(2), String(b.sold), b.revenue.toFixed(2), b.is_active ? "Yes" : "No"]),
      );
    }
  }

  /* ── Print ── */
  function handlePrint() {
    window.print();
  }

  /* ── KPI Cards ── */
  function KPICards() {
    if (!summary) return null;
    const cards = [
      { label: "Transactions", value: String(summary.total_transactions), icon: <ShoppingCart className="h-5 w-5" />, color: "text-blue-600" },
      { label: "Revenue", value: formatSAR(summary.total_revenue), icon: <DollarSign className="h-5 w-5" />, color: "text-emerald-600" },
      { label: "VAT Collected", value: formatSAR(summary.total_vat), icon: <TrendingUp className="h-5 w-5" />, color: "text-orange-600" },
      { label: "Items Sold", value: String(summary.items_sold), icon: <BookOpen className="h-5 w-5" />, color: "text-purple-600" },
      { label: "Students", value: String(summary.unique_students), icon: <Users className="h-5 w-5" />, color: "text-indigo-600" },
    ];
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground font-medium">{c.label}</span>
                <span className={c.color}>{c.icon}</span>
              </div>
              <div className="text-lg font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  /* ── Report type tabs ── */
  const reportTypes: { key: ReportType; label: string; icon: React.ReactNode }[] = [
    { key: "daily", label: "Daily Report", icon: <CalendarDays className="h-4 w-4" /> },
    { key: "range", label: "Date Range", icon: <FileText className="h-4 w-4" /> },
    { key: "grade", label: "By Grade", icon: <Users className="h-4 w-4" /> },
    { key: "unpaid", label: "Unpaid Students", icon: <ShoppingCart className="h-4 w-4" /> },
    { key: "inventory", label: "Book Inventory", icon: <BookOpen className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-4 print:space-y-2">
      {/* ── Report Type Selector ── */}
      <div className="flex flex-wrap items-center gap-2">
        {reportTypes.map((rt) => (
          <button
            key={rt.key}
            onClick={() => setReportType(rt.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-all ${
              reportType === rt.key
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {rt.icon}
            {rt.label}
          </button>
        ))}
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={handleExport} disabled={loading} className="gap-1.5 print:hidden">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 print:hidden">
          <Printer className="h-4 w-4" /> Print
        </Button>
      </div>

      {/* ── Date Controls ── */}
      {reportType === "daily" && (
        <div className="flex items-center gap-3">
          <Input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} className="w-48" />
          <Button variant="outline" size="sm" onClick={() => setDailyDate(todayStr())}>Today</Button>
          <Button size="sm" onClick={fetchReport} disabled={loading} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate"}
          </Button>
        </div>
      )}
      {reportType === "range" && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">From</span>
            <Input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="w-44" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">To</span>
            <Input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="w-44" />
          </div>
          <Button size="sm" onClick={fetchReport} disabled={loading || !rangeFrom || !rangeTo} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate"}
          </Button>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      )}

      {/* ── Content ── */}
      {!loading && (
        <>
          {/* KPI Cards (for reports with summary) */}
          {summary && <KPICards />}

          {/* ════ DAILY REPORT ════ */}
          {reportType === "daily" && summary && (
            <div className="space-y-4">
              {/* Payment method breakdown */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Payment Method Breakdown</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex gap-4 flex-wrap">
                    {Object.entries(summary.by_payment_method).map(([method, data]) => (
                      <div key={method} className="bg-muted/50 rounded-lg px-4 py-2 text-center min-w-[120px]">
                        <div className="text-xs text-muted-foreground capitalize">{method}</div>
                        <div className="font-bold text-sm">{formatSAR(data.revenue)}</div>
                        <div className="text-xs text-muted-foreground">{data.count} sale{data.count !== 1 ? "s" : ""}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Transactions table */}
              {transactions.length > 0 && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Transactions ({transactions.length})</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead className="text-xs">Time</TableHead>
                            <TableHead className="text-xs">Receipt</TableHead>
                            <TableHead className="text-xs">Student</TableHead>
                            <TableHead className="text-xs">Grade</TableHead>
                            <TableHead className="text-xs text-right">Items</TableHead>
                            <TableHead className="text-xs text-right">Total</TableHead>
                            <TableHead className="text-xs">Method</TableHead>
                            <TableHead className="text-xs">By</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactions.map((tx) => (
                            <TableRow key={tx.id} className="text-sm">
                              <TableCell className="font-mono text-xs">{tx.time}</TableCell>
                              <TableCell className="font-mono text-xs">{tx.receipt_number}</TableCell>
                              <TableCell className="max-w-[160px] truncate">{tx.student_name}</TableCell>
                              <TableCell><Badge variant="outline" className="text-xs">{tx.grade}</Badge></TableCell>
                              <TableCell className="text-right">{tx.items_count}</TableCell>
                              <TableCell className="text-right font-medium">{formatSAR(tx.total)}</TableCell>
                              <TableCell className="capitalize text-xs">{tx.payment_method}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{tx.sold_by}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {transactions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">No transactions for this date.</div>
              )}
            </div>
          )}

          {/* ════ DATE RANGE REPORT ════ */}
          {reportType === "range" && summary && (
            <div className="space-y-4">
              {/* Payment method breakdown */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Payment Method Breakdown</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex gap-4 flex-wrap">
                    {Object.entries(summary.by_payment_method).map(([method, data]) => (
                      <div key={method} className="bg-muted/50 rounded-lg px-4 py-2 text-center min-w-[120px]">
                        <div className="text-xs text-muted-foreground capitalize">{method}</div>
                        <div className="font-bold text-sm">{formatSAR(data.revenue)}</div>
                        <div className="text-xs text-muted-foreground">{data.count} sale{data.count !== 1 ? "s" : ""}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Daily breakdown table */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Daily Breakdown</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs text-right">Transactions</TableHead>
                          <TableHead className="text-xs text-right">Revenue</TableHead>
                          <TableHead className="text-xs text-right">VAT</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(summary.by_date)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([date, d]) => (
                          <TableRow key={date} className="text-sm">
                            <TableCell className="font-mono text-xs">{date}</TableCell>
                            <TableCell className="text-right">{d.count}</TableCell>
                            <TableCell className="text-right font-medium">{formatSAR(d.revenue)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{formatSAR(d.vat)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Top books */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Top Books</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-xs">Book</TableHead>
                          <TableHead className="text-xs text-right">Qty Sold</TableHead>
                          <TableHead className="text-xs text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(summary.by_book)
                          .sort(([, a], [, b]) => b.count - a.count)
                          .slice(0, 20)
                          .map(([id, d]) => (
                          <TableRow key={id} className="text-sm">
                            <TableCell className="max-w-[300px] truncate">{d.title}</TableCell>
                            <TableCell className="text-right">{d.count}</TableCell>
                            <TableCell className="text-right font-medium">{formatSAR(d.revenue)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ════ GRADE REPORT ════ */}
          {reportType === "grade" && summary && (
            <div className="space-y-4">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Sales by Grade</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-xs">Grade</TableHead>
                          <TableHead className="text-xs text-right">Transactions</TableHead>
                          <TableHead className="text-xs text-right">Revenue</TableHead>
                          <TableHead className="text-xs text-right">Students Purchased</TableHead>
                          <TableHead className="text-xs text-right">Total Enrolled</TableHead>
                          <TableHead className="text-xs text-right">Coverage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(summary.by_grade)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([grade, d]) => {
                            const enrolled = enrolledByGrade[grade] || 0;
                            const pct = enrolled > 0 ? Math.round((d.unique_students / enrolled) * 100) : 0;
                            return (
                              <TableRow key={grade} className="text-sm">
                                <TableCell><Badge variant="outline" className="text-xs">{grade}</Badge></TableCell>
                                <TableCell className="text-right">{d.count}</TableCell>
                                <TableCell className="text-right font-medium">{formatSAR(d.revenue)}</TableCell>
                                <TableCell className="text-right">{d.unique_students}</TableCell>
                                <TableCell className="text-right text-muted-foreground">{enrolled || "—"}</TableCell>
                                <TableCell className="text-right">
                                  {enrolled > 0 ? (
                                    <Badge className={`text-xs ${pct >= 80 ? "bg-emerald-100 text-emerald-700" : pct >= 50 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                                      {pct}%
                                    </Badge>
                                  ) : "—"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* School breakdown */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">By School</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex gap-4 flex-wrap">
                    {Object.entries(summary.by_school).map(([school, data]) => (
                      <div key={school} className="bg-muted/50 rounded-lg px-4 py-3 text-center min-w-[140px]">
                        <div className="text-xs text-muted-foreground">{school}</div>
                        <div className="font-bold text-sm">{formatSAR(data.revenue)}</div>
                        <div className="text-xs text-muted-foreground">{data.count} sale{data.count !== 1 ? "s" : ""}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ════ UNPAID STUDENTS REPORT ════ */}
          {reportType === "unpaid" && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="border-0 shadow-sm">
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Total Enrolled</span>
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="text-lg font-bold">{unpaidStats.total_enrolled}</div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Purchased</span>
                      <ShoppingCart className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="text-lg font-bold text-emerald-600">{unpaidStats.total_paid}</div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Not Yet Purchased</span>
                      <Users className="h-5 w-5 text-red-600" />
                    </div>
                    <div className="text-lg font-bold text-red-600">{unpaidStats.total_unpaid}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Unpaid list */}
              {unpaid.length > 0 && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Students Without Book Purchases ({unpaid.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background">
                          <TableRow className="bg-muted/30">
                            <TableHead className="text-xs">#</TableHead>
                            <TableHead className="text-xs">Student #</TableHead>
                            <TableHead className="text-xs">Name</TableHead>
                            <TableHead className="text-xs">Family #</TableHead>
                            <TableHead className="text-xs">Grade</TableHead>
                            <TableHead className="text-xs">School</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {unpaid.map((u, i) => (
                            <TableRow key={u.student_number} className="text-sm">
                              <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                              <TableCell className="font-mono text-xs">{u.student_number}</TableCell>
                              <TableCell>{u.student_name}</TableCell>
                              <TableCell className="font-mono text-xs">{u.family_number}</TableCell>
                              <TableCell><Badge variant="outline" className="text-xs">{u.grade}</Badge></TableCell>
                              <TableCell className="text-xs">{u.school}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {unpaid.length === 0 && !loading && (
                <div className="text-center py-8 text-muted-foreground">
                  {unpaidStats.total_enrolled > 0 ? "All enrolled students have purchased books!" : "No enrollment data available."}
                </div>
              )}
            </div>
          )}

          {/* ════ BOOK INVENTORY REPORT ════ */}
          {reportType === "inventory" && (
            <div className="space-y-4">
              {summary && <KPICards />}

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Book Sales Details ({catalog.length} titles)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-xs">Title</TableHead>
                          <TableHead className="text-xs">Grade</TableHead>
                          <TableHead className="text-xs text-right">Price</TableHead>
                          <TableHead className="text-xs text-right">Qty Sold</TableHead>
                          <TableHead className="text-xs text-right">Revenue</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {catalog
                          .sort((a, b) => b.sold - a.sold)
                          .map((book) => (
                          <TableRow key={book.id} className="text-sm">
                            <TableCell className="max-w-[250px] truncate">{book.title}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{book.grade}</Badge></TableCell>
                            <TableCell className="text-right">{formatSAR(book.price)}</TableCell>
                            <TableCell className="text-right font-medium">{book.sold}</TableCell>
                            <TableCell className="text-right font-medium">{formatSAR(book.revenue)}</TableCell>
                            <TableCell>
                              <Badge className={`text-xs ${book.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                                {book.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
