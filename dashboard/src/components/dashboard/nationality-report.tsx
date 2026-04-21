"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  type PieLabelRenderProps,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Search, BarChart3, PieChartIcon } from "lucide-react";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";
import { useClassNames } from "@/hooks/use-classes";
import { getDb } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { exportToCSV } from "@/lib/export-csv";

/* ── types ────────────────────────────────────────────────────── */
interface NatRow {
  name: string;
  count: number;
  pct: number;
}

/* ── colours ──────────────────────────────────────────────────── */
const PIE_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7300",
  "#d0ed57",
];

const BAR_COLORS = [
  "hsl(217, 91%, 60%)",
  "hsl(142, 71%, 45%)",
  "hsl(47, 96%, 53%)",
  "hsl(0, 84%, 60%)",
  "hsl(262, 83%, 58%)",
  "hsl(25, 95%, 53%)",
  "hsl(199, 89%, 48%)",
  "hsl(326, 80%, 50%)",
  "hsl(160, 60%, 45%)",
  "hsl(40, 90%, 50%)",
];

const EXCLUDED_CLASS_CODES = new Set(["34", "51"]);

/* ── component ────────────────────────────────────────────────── */
export function NationalityReport() {
  const { selectedYear } = useAcademicYear();
  const { schoolFilter } = useSchoolFilter();
  const { classNameMap } = useClassNames();

  /* filters */
  const [classFilter, setClassFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [chartType, setChartType] = useState<"pie" | "bar">("pie");
  const [showAll, setShowAll] = useState(false);

  /* dynamic class/section dropdown data */
  const [classSections, setClassSections] = useState<
    { classCode: string; sectionCode: string; sectionName: string }[]
  >([]);

  /* API data */
  const [rows, setRows] = useState<NatRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ─── fetch nationality data from server API ─── */
  const fetchData = useCallback(async () => {
    if (!selectedYear) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ year: selectedYear });
      if (schoolFilter !== "all") params.set("school", schoolFilter);
      if (classFilter !== "all") params.set("class", classFilter);
      if (sectionFilter !== "all") params.set("section", sectionFilter);

      const res = await fetch(`/api/reports/nationalities?${params}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error("Nationality report fetch failed:", err);
      setError("Failed to load nationality data");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, schoolFilter, classFilter, sectionFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ─── load sections for class dropdown ─── */
  useEffect(() => {
    const school = schoolFilter === "all" ? "" : schoolFilter;
    if (!school) {
      setClassSections([]);
      setClassFilter("all");
      setSectionFilter("all");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const q = query(
          collection(getDb(), "sections"),
          where("Academic_Year", "==", selectedYear || "25-26"),
          where("Major_Code", "==", school)
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const items: { classCode: string; sectionCode: string; sectionName: string }[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          const classCode = String(data.Class_Code || "");
          if (classCode && data.Section_Code && !EXCLUDED_CLASS_CODES.has(classCode)) {
            items.push({
              classCode,
              sectionCode: String(data.Section_Code),
              sectionName: String(data.E_Section_Name || data.Section_Code),
            });
          }
        });
        items.sort((a, b) => {
          const numA = parseInt((classNameMap[a.classCode] || a.classCode).replace(/\D/g, "")) || 0;
          const numB = parseInt((classNameMap[b.classCode] || b.classCode).replace(/\D/g, "")) || 0;
          if (numA !== numB) return numA - numB;
          return a.sectionName.localeCompare(b.sectionName);
        });
        setClassSections(items);
      } catch (err) {
        console.error("Failed to load sections:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [schoolFilter, classNameMap, selectedYear]);

  /* reset cascading filters */
  useEffect(() => { setClassFilter("all"); setSectionFilter("all"); }, [schoolFilter]);
  useEffect(() => { setSectionFilter("all"); }, [classFilter]);

  /* dropdown options */
  const uniqueClasses = useMemo(
    () =>
      [...new Set(classSections.map((s) => s.classCode))].sort((a, b) => {
        const numA = parseInt((classNameMap[a] || a).replace(/\D/g, "")) || 0;
        const numB = parseInt((classNameMap[b] || b).replace(/\D/g, "")) || 0;
        return numA - numB;
      }),
    [classSections, classNameMap]
  );

  const sectionsForClass = useMemo(
    () =>
      classFilter === "all"
        ? []
        : [...new Set(
            classSections
              .filter((s) => s.classCode === classFilter)
              .map((s) => s.sectionCode)
          )].sort(),
    [classSections, classFilter]
  );

  /* ─── chart data — top 9 + Others for pie ─── */
  const chartData = useMemo(() => {
    const top = rows.slice(0, 9);
    const othersCount = rows.slice(9).reduce((s, r) => s + r.count, 0);
    return othersCount > 0
      ? [...top.map((r) => ({ name: r.name, value: r.count })), { name: "Others", value: othersCount }]
      : top.map((r) => ({ name: r.name, value: r.count }));
  }, [rows]);

  /* search filter on the table */
  const displayRows = useMemo(() => {
    const list = search
      ? rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
      : rows;
    return showAll ? list : list.slice(0, 20);
  }, [rows, search, showAll]);

  const handleExport = () => {
    exportToCSV(
      `nationality_report_${selectedYear}`,
      ["#", "Nationality", "Count", "%"],
      rows.map((r, i) => [i + 1, r.name, r.count, `${r.pct}%`])
    );
  };

  /* ─── render ─── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading nationality data…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {schoolFilter !== "all" && (
          <select
            className="border rounded-md px-3 py-2 text-sm bg-background"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
          >
            <option value="all">All Classes</option>
            {uniqueClasses.map((c) => (
              <option key={c} value={c}>
                {classNameMap[c] || `Class ${c}`}
              </option>
            ))}
          </select>
        )}

        {classFilter !== "all" && sectionsForClass.length > 0 && (
          <select
            className="border rounded-md px-3 py-2 text-sm bg-background"
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
          >
            <option value="all">All Sections</option>
            {sectionsForClass.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        <div className="relative ml-auto">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search nationality…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 w-52"
          />
        </div>

        <div className="flex border rounded-md overflow-hidden">
          <button
            className={`px-3 py-2 text-sm ${chartType === "pie" ? "bg-primary text-primary-foreground" : "bg-background"}`}
            onClick={() => setChartType("pie")}
            title="Pie chart"
          >
            <PieChartIcon className="h-4 w-4" />
          </button>
          <button
            className={`px-3 py-2 text-sm ${chartType === "bar" ? "bg-primary text-primary-foreground" : "bg-background"}`}
            onClick={() => setChartType("bar")}
            title="Bar chart"
          >
            <BarChart3 className="h-4 w-4" />
          </button>
        </div>

        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1 h-4 w-4" />
          CSV
        </Button>
      </div>

      {/* Summary badges */}
      <div className="flex items-center gap-3 text-sm">
        <Badge variant="secondary" className="text-sm">
          {total.toLocaleString()} students
        </Badge>
        <Badge variant="outline" className="text-sm">
          {rows.length} nationalities
        </Badge>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="h-[350px]" style={{ minWidth: 0, minHeight: 350 }}>
          <ResponsiveContainer width="100%" height="100%" minHeight={1} minWidth={1}>
            {chartType === "pie" ? (
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  strokeWidth={2}
                  stroke="var(--color-background)"
                  label={(props: PieLabelRenderProps) => {
                    const name = props.name ?? "";
                    const percent = props.percent ?? 0;
                    return `${name} ${(percent * 100).toFixed(0)}%`;
                  }}
                >
                  {chartData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [Number(value).toLocaleString(), "Students"]}
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
              </PieChart>
            ) : (
              <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 60, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value) => [Number(value).toLocaleString(), "Students"]}
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, idx) => (
                    <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Nationality</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="w-1/3">Distribution</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayRows.map((r, i) => (
              <TableRow key={r.name}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-right font-mono">
                  {r.count.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-mono">{r.pct}%</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(r.pct, 100)}%` }}
                      />
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {displayRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No nationalities found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Show all / totals */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing {displayRows.length} of {rows.length} nationalities
        </span>
        {rows.length > 20 && !showAll && !search && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
            Show all {rows.length}
          </Button>
        )}
      </div>
    </div>
  );
}
