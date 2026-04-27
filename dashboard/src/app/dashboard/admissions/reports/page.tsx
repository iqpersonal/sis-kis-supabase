"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart3, TrendingUp, Download, Users,
} from "lucide-react";

/* ── Status flow for funnel ── */
const FUNNEL_STAGES = [
  { id: "new", label: "Enquiry" },
  { id: "contacted", label: "Contacted" },
  { id: "test_scheduled", label: "Test Scheduled" },
  { id: "test_done", label: "Test Done" },
  { id: "interview_scheduled", label: "Interview Scheduled" },
  { id: "interview_done", label: "Interview Done" },
  { id: "offer_sent", label: "Offer Sent" },
  { id: "accepted", label: "Accepted" },
  { id: "enrolled", label: "Enrolled" },
];

const STATUS_ORDER = FUNNEL_STAGES.map((s) => s.id);

interface Enquiry {
  ref_number: string;
  parent_name: string;
  phone: string;
  email: string;
  students: { name: string; gender: string; desired_grade: string }[];
  student_count: number;
  status: string;
  source?: string;
  created_at: string;
}

export default function ReportsPage() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState("all");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admissions/enquiries?limit=1000", { cache: "no-store" });
      const json = await res.json();
      const all = (json.enquiries || []) as Enquiry[];
      all.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setEnquiries(all);
    } catch (err) {
      console.error("Failed to load reports:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filter by year
  const filtered = yearFilter === "all" ? enquiries :
    enquiries.filter((e) => e.created_at.startsWith(yearFilter));

  /* ── Conversion Funnel ── */
  function getFunnelData() {
    const counts: Record<string, number> = {};
    FUNNEL_STAGES.forEach((s) => { counts[s.id] = 0; });
    filtered.forEach((e) => {
      const idx = STATUS_ORDER.indexOf(e.status);
      // Count everyone who reached this stage or beyond
      for (let i = 0; i <= Math.max(idx, 0); i++) {
        counts[STATUS_ORDER[i]]++;
      }
    });
    return FUNNEL_STAGES.map((s) => ({ ...s, count: counts[s.id] }));
  }

  /* ── Grade Demand ── */
  function getGradeDemand() {
    const grades: Record<string, number> = {};
    filtered.forEach((e) => {
      e.students?.forEach((s) => {
        grades[s.desired_grade] = (grades[s.desired_grade] || 0) + 1;
      });
    });
    return Object.entries(grades)
      .sort((a, b) => b[1] - a[1])
      .map(([grade, count]) => ({ grade, count }));
  }

  /* ── Monthly Trends ── */
  function getMonthlyTrends() {
    const months: Record<string, number> = {};
    filtered.forEach((e) => {
      const month = e.created_at.slice(0, 7); // YYYY-MM
      months[month] = (months[month] || 0) + 1;
    });
    return Object.entries(months)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, count]) => ({ month, count }));
  }

  /* ── Source Breakdown ── */
  function getSourceBreakdown() {
    const sources: Record<string, number> = {};
    filtered.forEach((e) => {
      const src = e.source || "whatsapp";
      sources[src] = (sources[src] || 0) + 1;
    });
    return Object.entries(sources)
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({ source, count }));
  }

  /* ── Gender Split ── */
  function getGenderSplit() {
    let male = 0, female = 0;
    filtered.forEach((e) => {
      e.students?.forEach((s) => {
        if (s.gender === "Male") male++;
        else female++;
      });
    });
    return { male, female, total: male + female };
  }

  /* ── Status Distribution ── */
  function getStatusDistribution() {
    const statuses: Record<string, number> = {};
    filtered.forEach((e) => {
      statuses[e.status] = (statuses[e.status] || 0) + 1;
    });
    return Object.entries(statuses)
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => ({ status, count }));
  }

  /* ── Export ── */
  function exportReport() {
    const funnel = getFunnelData();
    const grades = getGradeDemand();
    const trends = getMonthlyTrends();
    const sources = getSourceBreakdown();
    const gender = getGenderSplit();

    let csv = "=== ADMISSIONS REPORT ===\n\n";
    csv += "--- Conversion Funnel ---\nStage,Count\n";
    funnel.forEach((f) => csv += `${f.label},${f.count}\n`);
    csv += "\n--- Grade Demand ---\nGrade,Applications\n";
    grades.forEach((g) => csv += `${g.grade},${g.count}\n`);
    csv += "\n--- Monthly Trends ---\nMonth,Enquiries\n";
    trends.forEach((t) => csv += `${t.month},${t.count}\n`);
    csv += "\n--- Source Breakdown ---\nSource,Count\n";
    sources.forEach((s) => csv += `${s.source},${s.count}\n`);
    csv += `\n--- Gender Split ---\nMale,${gender.male}\nFemale,${gender.female}\n`;

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `admissions_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const funnel = getFunnelData();
  const gradeDemand = getGradeDemand();
  const monthlyTrends = getMonthlyTrends();
  const sourceBreakdown = getSourceBreakdown();
  const genderSplit = getGenderSplit();
  const statusDist = getStatusDistribution();
  const years = [...new Set(enquiries.map((e) => e.created_at.slice(0, 4)))].sort().reverse();

  const maxFunnel = Math.max(...funnel.map((f) => f.count), 1);
  const maxGrade = Math.max(...gradeDemand.map((g) => g.count), 1);
  const maxMonth = Math.max(...monthlyTrends.map((t) => t.count), 1);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Admissions Reports</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} enquiries analyzed</p>
        </div>
        <div className="flex gap-2">
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportReport}>
            <Download className="mr-1 h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Total Enquiries</p>
            <p className="text-3xl font-bold">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Total Students</p>
            <p className="text-3xl font-bold">{genderSplit.total}</p>
            <p className="text-xs text-muted-foreground">{genderSplit.male} male · {genderSplit.female} female</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Enrolled</p>
            <p className="text-3xl font-bold text-green-600">{filtered.filter((e) => e.status === "enrolled").length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Conversion Rate</p>
            <p className="text-3xl font-bold text-blue-600">
              {filtered.length > 0
                ? `${Math.round((filtered.filter((e) => e.status === "enrolled").length / filtered.length) * 100)}%`
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Conversion Funnel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {funnel.map((stage, i) => (
              <div key={stage.id} className="flex items-center gap-3">
                <span className="text-sm w-[140px] text-right text-muted-foreground">{stage.label}</span>
                <div className="flex-1 bg-muted rounded-full h-8 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full flex items-center justify-end pr-3 transition-all duration-500"
                    style={{ width: `${Math.max((stage.count / maxFunnel) * 100, 5)}%` }}
                  >
                    <span className="text-xs font-bold text-white">{stage.count}</span>
                  </div>
                </div>
                {i < funnel.length - 1 && funnel[i].count > 0 && (
                  <span className="text-xs text-muted-foreground w-[50px]">
                    {Math.round((funnel[i + 1].count / funnel[i].count) * 100)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Grade Demand */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Grade Demand
            </CardTitle>
          </CardHeader>
          <CardContent>
            {gradeDemand.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No data</p>
            ) : (
              <div className="space-y-2">
                {gradeDemand.map((g) => (
                  <div key={g.grade} className="flex items-center gap-3">
                    <span className="text-sm w-[80px] font-medium">{g.grade}</span>
                    <div className="flex-1 bg-muted rounded-full h-6 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full flex items-center justify-end pr-2"
                        style={{ width: `${Math.max((g.count / maxGrade) * 100, 8)}%` }}
                      >
                        <span className="text-xs font-bold text-white">{g.count}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Monthly Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyTrends.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No data</p>
            ) : (
              <div className="flex items-end gap-2 h-[200px]">
                {monthlyTrends.map((t) => (
                  <div key={t.month} className="flex-1 flex flex-col items-center justify-end h-full">
                    <span className="text-xs font-bold mb-1">{t.count}</span>
                    <div
                      className="w-full bg-gradient-to-t from-purple-500 to-purple-400 rounded-t-md min-h-[4px]"
                      style={{ height: `${Math.max((t.count / maxMonth) * 170, 4)}px` }}
                    />
                    <span className="text-[10px] text-muted-foreground mt-1 -rotate-45 origin-top-left">
                      {t.month.slice(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Source Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Source Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {sourceBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No data</p>
            ) : (
              <div className="space-y-3">
                {sourceBreakdown.map((s) => (
                  <div key={s.source} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">{s.source}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{s.count}</span>
                      <span className="text-xs text-muted-foreground">
                        ({filtered.length > 0 ? Math.round((s.count / filtered.length) * 100) : 0}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {statusDist.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No data</p>
            ) : (
              <div className="space-y-2">
                {statusDist.map((s) => (
                  <div key={s.status} className="flex items-center justify-between">
                    <Badge variant="secondary" className="capitalize text-xs">{s.status.replace(/_/g, " ")}</Badge>
                    <span className="font-bold">{s.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
