"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useFilteredCollection, useCollection } from "@/hooks/use-sis-data";
import { useClassNames } from "@/hooks/use-classes";
import { useAcademicYear } from "@/context/academic-year-context";
import { useAuth } from "@/context/auth-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  GraduationCap,
  Printer,
  Search,
  Eye,
  CheckSquare,
} from "lucide-react";
import { getDb } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { printDiplomas, type DiplomaStudent } from "@/components/diploma-template";

type DocRecord = Record<string, unknown> & { id: string };

const EXCLUDED_CLASS_CODES = new Set(["34", "51"]);

export default function DiplomasPage() {
  const { selectedYear } = useAcademicYear();
  const { can, loading: authLoading } = useAuth();

  /* ── Filters ── */
  const [majorFilter, setMajorFilter] = useState<string>("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  /* ── Date ── */
  const [ceremonyDate, setCeremonyDate] = useState("June 11, 2026");

  /* ── Selection ── */
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /* ── Class / Section data ── */
  const { classNameMap } = useClassNames();
  const [classSections, setClassSections] = useState<
    { classCode: string; sectionCode: string; sectionName: string }[]
  >([]);

  // Load sections when major filter changes
  useEffect(() => {
    if (majorFilter === "all") {
      setClassSections([]);
      setClassFilter("all");
      setSectionFilter("all");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const yearStr = selectedYear || "25-26";
        const q = query(
          collection(getDb(), "sections"),
          where("Academic_Year", "==", yearStr),
          where("Major_Code", "==", majorFilter)
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
    return () => {
      cancelled = true;
    };
  }, [majorFilter, selectedYear, classNameMap]);

  useEffect(() => { setClassFilter("all"); setSectionFilter("all"); }, [majorFilter]);
  useEffect(() => { setSectionFilter("all"); }, [classFilter]);

  // Dropdown options
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

  const sectionNameMap = useMemo(
    () =>
      classSections.reduce<Record<string, string>>(
        (acc, { classCode, sectionCode, sectionName }) => {
          acc[`${classCode}__${sectionCode}`] = sectionName;
          return acc;
        },
        {}
      ),
    [classSections]
  );

  /* ── Load registrations + students ── */
  const { data: allRegs, loading: regsLoading } =
    useFilteredCollection<DocRecord>("registrations", selectedYear);
  const { data: students, loading: studentsLoading } =
    useCollection<DocRecord>("students", 10000);

  const studentMap = useMemo(() => {
    const map = new Map<string, DocRecord>();
    for (const s of students) {
      const sn = String(s.Student_Number || "");
      if (sn) map.set(sn, s);
    }
    return map;
  }, [students]);

  /* ── Filtered & enriched student list ── */
  const rows = useMemo(() => {
    const result: {
      studentNumber: string;
      fullName: string;
      className: string;
      classCode: string;
      sectionCode: string;
      sectionName: string;
      majorCode: string;
    }[] = [];

    for (const reg of allRegs) {
      // Only active (no termination date)
      if (reg.Termination_Date) continue;

      const sn = String(reg.Student_Number || "");
      const major = String(reg.Major_Code || "");
      const cls = String(reg.Class_Code || "");
      const sec = String(reg.Section_Code || "");

      if (EXCLUDED_CLASS_CODES.has(cls)) continue;

      // Apply filters
      if (majorFilter !== "all" && major !== majorFilter) continue;
      if (classFilter !== "all" && cls !== classFilter) continue;
      if (sectionFilter !== "all" && sec !== sectionFilter) continue;

      const stu = studentMap.get(sn);
      const fullName = String(stu?.E_Full_Name || stu?.E_Child_Name || sn);

      // Search
      if (
        search &&
        !fullName.toLowerCase().includes(search.toLowerCase()) &&
        !sn.includes(search)
      )
        continue;

      result.push({
        studentNumber: sn,
        fullName,
        className: classNameMap[cls] || cls,
        classCode: cls,
        sectionCode: sec,
        sectionName: sectionNameMap[`${cls}__${sec}`] || sec,
        majorCode: major,
      });
    }

    result.sort((a, b) => a.fullName.localeCompare(b.fullName));
    return result;
  }, [allRegs, studentMap, majorFilter, classFilter, sectionFilter, search, classNameMap, sectionNameMap]);

  // Reset selection when filters change
  useEffect(() => {
    setSelected(new Set());
  }, [majorFilter, classFilter, sectionFilter, search, selectedYear]);

  /* ── Selection handlers ── */
  const toggleOne = useCallback((sn: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sn)) next.delete(sn);
      else next.add(sn);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === rows.length
        ? new Set()
        : new Set(rows.map((r) => r.studentNumber))
    );
  }, [rows]);

  /* ── Print ── */
  const handlePrint = useCallback(async () => {
    const toPrint: DiplomaStudent[] = rows
      .filter((r) => selected.has(r.studentNumber))
      .map((r) => ({
        fullName: r.fullName,
        studentNumber: r.studentNumber,
      }));
    await printDiplomas(toPrint, ceremonyDate);
  }, [rows, selected, ceremonyDate]);

  const handlePreview = useCallback(
    async (studentNumber: string) => {
      const r = rows.find((x) => x.studentNumber === studentNumber);
      if (!r) return;
      await printDiplomas(
        [{ fullName: r.fullName, studentNumber: r.studentNumber }],
        ceremonyDate
      );
    },
    [rows, ceremonyDate]
  );

  if (authLoading) return null;
  if (!can("certificates.print" as never)) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">You don&apos;t have permission to access this page.</p>
      </div>
    );
  }

  const loading = regsLoading || studentsLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            Diploma Printing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Select students and print High School Diplomas
          </p>
        </div>
        {selected.size > 0 && (
          <Button onClick={handlePrint} size="lg" className="gap-2">
            <Printer className="h-4 w-4" />
            Print {selected.size} Diploma{selected.size > 1 ? "s" : ""}
          </Button>
        )}
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4">
        {/* Major */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">School</label>
          <select
            value={majorFilter}
            onChange={(e) => setMajorFilter(e.target.value)}
            className="h-9 w-40 rounded-md border bg-background px-2 text-sm"
          >
            <option value="all">All Schools</option>
            <option value="0021-01">Boys School</option>
            <option value="0021-02">Girls School</option>
          </select>
        </div>

        {/* Class */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Class</label>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            disabled={majorFilter === "all"}
            className="h-9 w-44 rounded-md border bg-background px-2 text-sm disabled:opacity-50"
          >
            <option value="all">All Classes</option>
            {uniqueClasses.map((code) => (
              <option key={code} value={code}>
                {classNameMap[code] || code}
              </option>
            ))}
          </select>
        </div>

        {/* Section */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Section</label>
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            disabled={classFilter === "all"}
            className="h-9 w-36 rounded-md border bg-background px-2 text-sm disabled:opacity-50"
          >
            <option value="all">All Sections</option>
            {sectionsForClass.map((code) => (
              <option key={code} value={code}>
                {sectionNameMap[`${classFilter}__${code}`] || code}
              </option>
            ))}
          </select>
        </div>

        {/* Ceremony Date */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Ceremony Date</label>
          <Input
            value={ceremonyDate}
            onChange={(e) => setCeremonyDate(e.target.value)}
            className="h-9 w-48"
            placeholder="e.g. June 11, 2026"
          />
        </div>

        {/* Search */}
        <div className="space-y-1 flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-muted-foreground">Search</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or student number..."
              className="h-9 pl-8"
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4">
        <Badge variant="secondary" className="text-sm">
          {rows.length} student{rows.length !== 1 ? "s" : ""} found
        </Badge>
        {selected.size > 0 && (
          <Badge className="text-sm">
            <CheckSquare className="h-3 w-3 mr-1" />
            {selected.size} selected
          </Badge>
        )}
      </div>

      {/* Student table */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          Loading students…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          {majorFilter === "all"
            ? "Select a school to begin"
            : "No active students match the selected filters"}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-10">
                  <Checkbox
                    checked={selected.size === rows.length && rows.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead className="text-xs font-semibold">#</TableHead>
                <TableHead className="text-xs font-semibold">Student Name</TableHead>
                <TableHead className="text-xs font-semibold">Student #</TableHead>
                <TableHead className="text-xs font-semibold">Class</TableHead>
                <TableHead className="text-xs font-semibold">Section</TableHead>
                <TableHead className="text-xs font-semibold w-20">Preview</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow
                  key={r.studentNumber}
                  className={selected.has(r.studentNumber) ? "bg-primary/5" : ""}
                >
                  <TableCell>
                    <Checkbox
                      checked={selected.has(r.studentNumber)}
                      onCheckedChange={() => toggleOne(r.studentNumber)}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="text-sm font-medium">{r.fullName}</TableCell>
                  <TableCell className="text-sm font-mono text-muted-foreground">
                    {r.studentNumber}
                  </TableCell>
                  <TableCell className="text-sm">{r.className}</TableCell>
                  <TableCell className="text-sm">{r.sectionName}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handlePreview(r.studentNumber)}
                      title="Preview diploma"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
