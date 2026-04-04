"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Printer,
  Search,
  CheckSquare,
  Square,
  FileText,
  Download,
  Users,
  Filter,
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
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";
import { useLanguage } from "@/context/language-context";
import { cn } from "@/lib/utils";

/* ────────────────────── Types ────────────────────── */

interface StudentEntry {
  student_number: string;
  student_name: string;
  student_name_ar: string;
  class_code: string;
  class_name: string;
  section_code: string;
  section_name: string;
  school: string;
  overall_avg: number;
  has_transcript: boolean;
}

interface ClassEntry {
  code: string;
  name: string;
  count: number;
}

/* ────────────────────── Page ────────────────────── */

export default function BulkExportPage() {
  const { selectedYear } = useAcademicYear();
  const { schoolFilter } = useSchoolFilter();
  const { t } = useLanguage();

  const [students, setStudents] = useState<StudentEntry[]>([]);
  const [classes, setClasses] = useState<ClassEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedYear) params.set("year", selectedYear);
      if (schoolFilter !== "all") params.set("school", schoolFilter);
      const res = await fetch(`/api/bulk-export?${params}`);
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
        setClasses(data.classes || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [selectedYear, schoolFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset selection when data changes
  useEffect(() => {
    setSelected(new Set());
  }, [students]);

  const filtered = students.filter((s) => {
    if (classFilter !== "all" && s.class_code !== classFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.student_name.toLowerCase().includes(q) ||
        s.student_name_ar.includes(q) ||
        s.student_number.includes(q)
      );
    }
    return true;
  });

  const toggleSelect = (sn: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sn)) next.delete(sn);
      else next.add(sn);
      return next;
    });
  };

  const selectAll = () => {
    const allFiltered = new Set(filtered.map((s) => s.student_number));
    setSelected(allFiltered);
  };

  const deselectAll = () => {
    setSelected(new Set());
  };

  const selectWithTranscript = () => {
    const withData = new Set(
      filtered.filter((s) => s.has_transcript).map((s) => s.student_number)
    );
    setSelected(withData);
  };

  const printSelected = () => {
    if (selected.size === 0) return;
    const nums = Array.from(selected);
    
    // Open transcripts in new windows — batch by opening one consolidated URL
    // The transcript page supports ?student=X&year=Y format
    const yearParam = selectedYear ? `&year=${selectedYear}` : "";
    
    // For large batches, open in groups of 10
    const batchSize = 10;
    for (let i = 0; i < nums.length; i += batchSize) {
      const batch = nums.slice(i, i + batchSize);
      batch.forEach((sn) => {
        window.open(`/transcript?student=${sn}${yearParam}`, `_transcript_${sn}`);
      });
    }
  };

  const exportStudentList = () => {
    const header = "Student Number,Student Name,Class,Section,Average,Has Transcript\n";
    const rows = filtered
      .map(
        (s) =>
          `${s.student_number},"${s.student_name}",${s.class_name},${s.section_name},${s.overall_avg},${s.has_transcript}`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `students_${selectedYear || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const allSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.student_number));
  const someSelected = selected.size > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Printer className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Bulk Transcript Export
            </h1>
            <p className="text-sm text-muted-foreground">
              Select students to print or export transcripts in batch
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportStudentList}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button
            size="sm"
            onClick={printSelected}
            disabled={selected.size === 0}
          >
            <Printer className="mr-2 h-4 w-4" />
            Print {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-700">{students.length}</p>
                <p className="text-xs text-muted-foreground">{t("totalStudents")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 p-2">
                <FileText className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-700">
                  {students.filter((s) => s.has_transcript).length}
                </p>
                <p className="text-xs text-muted-foreground">With Transcript Data</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-2">
                <Filter className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-700">{classes.length}</p>
                <p className="text-xs text-muted-foreground">Classes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 p-2">
                <CheckSquare className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-700">{selected.size}</p>
                <p className="text-xs text-muted-foreground">Selected</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Class Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Class:</span>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">{t("all")} ({students.length})</option>
            {classes.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>
        </div>

        {/* Quick select buttons */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>
            Select All ({filtered.length})
          </Button>
          <Button variant="outline" size="sm" onClick={selectWithTranscript}>
            With Transcript
          </Button>
          {someSelected && (
            <Button variant="ghost" size="sm" onClick={deselectAll}>
              Clear Selection
            </Button>
          )}
        </div>

        {/* Search */}
        <div className="relative ml-auto w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={`${t("search")}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Student Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("students")}</CardTitle>
          <CardDescription>
            {filtered.length} students · {selected.size} selected
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <FileText className="h-12 w-12 opacity-20" />
              <p className="text-sm">{t("noData")}</p>
            </div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b text-left">
                    <th className="px-3 py-2 w-10">
                      <button
                        onClick={() => (allSelected ? deselectAll() : selectAll())}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {allSelected ? (
                          <CheckSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    </th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">
                      {t("studentNumber")}
                    </th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">
                      {t("name")}
                    </th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">
                      {t("grade")}
                    </th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">
                      Section
                    </th>
                    <th className="px-3 py-2 font-medium text-muted-foreground text-right">
                      Average
                    </th>
                    <th className="px-3 py-2 font-medium text-muted-foreground text-center">
                      Transcript
                    </th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">
                      {t("actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const isSelected = selected.has(s.student_number);
                    return (
                      <tr
                        key={s.student_number}
                        className={cn(
                          "border-b hover:bg-muted/50 cursor-pointer",
                          isSelected && "bg-primary/5"
                        )}
                        onClick={() => toggleSelect(s.student_number)}
                      >
                        <td className="px-3 py-2">
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {s.student_number}
                        </td>
                        <td className="px-3 py-2">
                          <div>
                            <p className="font-medium">{s.student_name}</p>
                            {s.student_name_ar && (
                              <p className="text-xs text-muted-foreground" dir="rtl">
                                {s.student_name_ar}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">{s.class_name}</td>
                        <td className="px-3 py-2">{s.section_name || "—"}</td>
                        <td className="px-3 py-2 text-right">
                          {s.overall_avg > 0 ? (
                            <span
                              className={cn(
                                "font-medium",
                                s.overall_avg >= 90
                                  ? "text-emerald-600"
                                  : s.overall_avg >= 70
                                  ? "text-blue-600"
                                  : s.overall_avg >= 60
                                  ? "text-amber-600"
                                  : "text-red-600"
                              )}
                            >
                              {s.overall_avg.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {s.has_transcript ? (
                            <Badge
                              variant="outline"
                              className="bg-emerald-50 text-emerald-700 border-emerald-200"
                            >
                              Ready
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-gray-50 text-gray-400 border-gray-200"
                            >
                              No Data
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              const yearParam = selectedYear
                                ? `&year=${selectedYear}`
                                : "";
                              window.open(
                                `/transcript?student=${s.student_number}${yearParam}`,
                                `_transcript_${s.student_number}`
                              );
                            }}
                          >
                            <Printer className="mr-1 h-3 w-3" />
                            View
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
    </div>
  );
}
