"use client";

export const dynamic = "force-dynamic";

import { useState, useMemo } from "react";
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
  ArrowUp,
  ArrowDown,
  Minus,
  TrendingUp,
  CalendarDays,
} from "lucide-react";

function MetricRow({
  label,
  current,
  previous,
  format = "number",
}: {
  label: string;
  current: number;
  previous: number;
  format?: "number" | "percent" | "sar" | "decimal";
}) {
  const diff = current - previous;
  const pctChange =
    previous !== 0 ? ((diff / previous) * 100).toFixed(1) : current > 0 ? "∞" : "0";

  const fmt = (v: number) => {
    switch (format) {
      case "sar":
        return `SAR ${v.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })}`;
      case "percent":
        return `${v.toFixed(1)}%`;
      case "decimal":
        return v.toFixed(2);
      default:
        return v.toLocaleString();
    }
  };

  const isPositive = diff > 0;
  const isNegative = diff < 0;

  return (
    <div className="flex items-center justify-between border-b py-3 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-6">
        <span className="w-28 text-right text-sm font-medium">
          {fmt(previous)}
        </span>
        <span className="w-28 text-right text-sm font-bold">{fmt(current)}</span>
        <span
          className={`flex w-24 items-center justify-end gap-1 text-sm font-semibold ${
            isPositive
              ? "text-green-600"
              : isNegative
                ? "text-red-600"
                : "text-muted-foreground"
          }`}
        >
          {isPositive ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : isNegative ? (
            <ArrowDown className="h-3.5 w-3.5" />
          ) : (
            <Minus className="h-3.5 w-3.5" />
          )}
          {typeof pctChange === "string" ? pctChange : pctChange}%
        </span>
      </div>
    </div>
  );
}

export default function YearOverYearPage() {
  const { years, selectedYear, loading: yearLoading } = useAcademicYear();
  const { schoolFilter, schoolLabel } = useSchoolFilter();

  // Determine two years to compare
  const sortedYears = useMemo(
    () =>
      [...years].sort((a, b) => {
        const [a1] = a.split("-").map(Number);
        const [b1] = b.split("-").map(Number);
        return a1 - b1;
      }),
    [years]
  );

  const defaultCompare = useMemo(() => {
    if (!selectedYear || sortedYears.length < 2) return null;
    const idx = sortedYears.indexOf(selectedYear);
    if (idx > 0) return sortedYears[idx - 1];
    return sortedYears.length > 1 ? sortedYears[1] : null;
  }, [selectedYear, sortedYears]);

  const [compareYear, setCompareYear] = useState<string | null>(null);
  const effectiveCompare = compareYear ?? defaultCompare;

  // Fetch both summaries
  const { summary: currentSummary, loading: loadCurrent } =
    useSummary(selectedYear);
  const { summary: compareSummary, loading: loadCompare } =
    useSummary(effectiveCompare);

  const loading = yearLoading || loadCurrent || loadCompare;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading comparison data...
      </div>
    );
  }

  if (!currentSummary || !compareSummary) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Summary data not available for one or both years.
      </div>
    );
  }

  const cur: SummarySchoolData =
    schoolFilter === "all"
      ? currentSummary.all
      : (currentSummary[schoolFilter as "0021-01" | "0021-02"] ??
          currentSummary.all);

  const prev: SummarySchoolData =
    schoolFilter === "all"
      ? compareSummary.all
      : (compareSummary[schoolFilter as "0021-01" | "0021-02"] ??
          compareSummary.all);

  const curFin = cur.financials.installments;
  const prevFin = prev.financials.installments;
  const curCharges = curFin.reduce((s, i) => s + i.totalCharges, 0);
  const prevCharges = prevFin.reduce((s, i) => s + i.totalCharges, 0);
  const curPaid = curFin.reduce((s, i) => s + i.totalPaid, 0);
  const prevPaid = prevFin.reduce((s, i) => s + i.totalPaid, 0);
  const curBalance = curFin.reduce((s, i) => s + i.outstandingBalance, 0);
  const prevBalance = prevFin.reduce((s, i) => s + i.outstandingBalance, 0);

  const fmtYear = (code: string) => {
    const [a, b] = code.split("-").map(Number);
    if (isNaN(a) || isNaN(b)) return code;
    return `${(a >= 50 ? 1900 : 2000) + a}–${(b >= 50 ? 1900 : 2000) + b}`;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Year-over-Year Comparison
          </h1>
          <p className="text-muted-foreground">
            Compare metrics between two academic years
            {schoolFilter !== "all" && ` — ${schoolLabel}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <label className="text-sm text-muted-foreground">Compare with:</label>
          <select
            value={effectiveCompare ?? ""}
            onChange={(e) => setCompareYear(e.target.value || null)}
            className="h-9 rounded-md border bg-background px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {sortedYears
              .filter((y) => y !== selectedYear)
              .map((y) => (
                <option key={y} value={y}>
                  {fmtYear(y)}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Header showing the two years */}
      <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
        <TrendingUp className="h-5 w-5 text-primary" />
        <div className="flex-1 text-center">
          <span className="text-sm text-muted-foreground">Previous</span>
          <p className="text-lg font-bold">
            {fmtYear(effectiveCompare ?? "")}
          </p>
        </div>
        <div className="text-2xl text-muted-foreground">→</div>
        <div className="flex-1 text-center">
          <span className="text-sm text-muted-foreground">Current</span>
          <p className="text-lg font-bold">
            {fmtYear(selectedYear ?? "")}
          </p>
        </div>
      </div>

      {/* Enrollment */}
      <Card>
        <CardHeader>
          <CardTitle>Enrollment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Metric</span>
            <div className="flex gap-6">
              <span className="w-28 text-right">
                {fmtYear(effectiveCompare ?? "")}
              </span>
              <span className="w-28 text-right">
                {fmtYear(selectedYear ?? "")}
              </span>
              <span className="w-24 text-right">Change</span>
            </div>
          </div>
          <MetricRow
            label="Total Students"
            previous={prev.total_students}
            current={cur.total_students}
          />
          <MetricRow
            label="Active Registrations"
            previous={prev.active_registrations}
            current={cur.active_registrations}
          />
          <MetricRow
            label="Total Registrations"
            previous={prev.total_registrations}
            current={cur.total_registrations}
          />
        </CardContent>
      </Card>

      {/* Academics */}
      <Card>
        <CardHeader>
          <CardTitle>Academics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Metric</span>
            <div className="flex gap-6">
              <span className="w-28 text-right">Previous</span>
              <span className="w-28 text-right">Current</span>
              <span className="w-24 text-right">Change</span>
            </div>
          </div>
          <MetricRow
            label="Total Exams"
            previous={prev.academics.total_exams}
            current={cur.academics.total_exams}
          />
          <MetricRow
            label="Pass Rate"
            previous={prev.academics.pass_rate}
            current={cur.academics.pass_rate}
            format="percent"
          />
          <MetricRow
            label="Average Grade"
            previous={prev.academics.avg_grade}
            current={cur.academics.avg_grade}
            format="decimal"
          />
          <MetricRow
            label="Absence Days"
            previous={prev.academics.total_absence_days}
            current={cur.academics.total_absence_days}
          />
          <MetricRow
            label="Tardy Count"
            previous={prev.academics.total_tardy}
            current={cur.academics.total_tardy}
          />
        </CardContent>
      </Card>

      {/* Financials */}
      <Card>
        <CardHeader>
          <CardTitle>Financials</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Metric</span>
            <div className="flex gap-6">
              <span className="w-28 text-right">Previous</span>
              <span className="w-28 text-right">Current</span>
              <span className="w-24 text-right">Change</span>
            </div>
          </div>
          <MetricRow
            label="Total Charges"
            previous={prevCharges}
            current={curCharges}
            format="sar"
          />
          <MetricRow
            label="Total Collected"
            previous={prevPaid}
            current={curPaid}
            format="sar"
          />
          <MetricRow
            label="Outstanding Balance"
            previous={prevBalance}
            current={curBalance}
            format="sar"
          />
          <MetricRow
            label="Collection Rate"
            previous={
              prevCharges > 0 ? (prevPaid / prevCharges) * 100 : 0
            }
            current={
              curCharges > 0 ? (curPaid / curCharges) * 100 : 0
            }
            format="percent"
          />
        </CardContent>
      </Card>

      {/* Nationality shift */}
      <Card>
        <CardHeader>
          <CardTitle>Nationality Distribution Shift</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Nationality</span>
            <div className="flex gap-6">
              <span className="w-28 text-right">Previous</span>
              <span className="w-28 text-right">Current</span>
              <span className="w-24 text-right">Change</span>
            </div>
          </div>
          {(() => {
            // Merge both nationality arrays
            const allNames = new Set([
              ...cur.nationalities.map((n) => n.name),
              ...prev.nationalities.map((n) => n.name),
            ]);
            const curMap = Object.fromEntries(
              cur.nationalities.map((n) => [n.name, n.value])
            );
            const prevMap = Object.fromEntries(
              prev.nationalities.map((n) => [n.name, n.value])
            );
            return [...allNames]
              .sort((a, b) => (curMap[b] ?? 0) - (curMap[a] ?? 0))
              .map((name) => (
                <MetricRow
                  key={name}
                  label={name}
                  previous={prevMap[name] ?? 0}
                  current={curMap[name] ?? 0}
                />
              ));
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
