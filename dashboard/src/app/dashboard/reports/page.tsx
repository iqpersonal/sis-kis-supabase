"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { usePaginatedCollection, useFilteredCollection, useCollection } from "@/hooks/use-sis-data";
import { useClassNames } from "@/hooks/use-classes";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Filter, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";
import { getDb } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

type DocRecord = Record<string, unknown> & { id: string };
type StatusFilter = "all" | "active" | "withdrawn";

const EXCLUDED_CLASS_CODES = new Set(["34", "51"]);

export default function StudentsPage() {
  const { t } = useLanguage();
  const { selectedYear, selectedLabel } = useAcademicYear();
  const { schoolFilter, schoolLabel } = useSchoolFilter();
  const [searchMode, setSearchMode] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [classFilter, setClassFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");

  /* ─── Class / Section dropdown data ─── */
  const { classNameMap } = useClassNames();
  const [classSections, setClassSections] = useState<
    { classCode: string; sectionCode: string; sectionName: string }[]
  >([]);

  // Load sections when school filter changes
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
          const nameA = classNameMap[a.classCode] || a.classCode;
          const nameB = classNameMap[b.classCode] || b.classCode;
          const numA = parseInt(nameA.replace(/\D/g, "")) || 0;
          const numB = parseInt(nameB.replace(/\D/g, "")) || 0;
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

  // Reset class/section when school changes
  useEffect(() => {
    setClassFilter("all");
    setSectionFilter("all");
  }, [schoolFilter]);

  // Reset section when class changes
  useEffect(() => {
    setSectionFilter("all");
  }, [classFilter]);

  // Derived dropdown options
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

  // Paginated registrations filtered by academic year
  const {
    data: pagedRegs,
    loading: pagedLoading,
    error: pagedError,
    pagination,
    goNext,
    goPrev,
    goFirst,
    setPageSize,
  } = usePaginatedCollection<DocRecord>("registrations", "Student_Number", 50, selectedYear);

  // Full registrations only when searching or filtering
  const needFullFetch = searchMode || statusFilter !== "all" || schoolFilter !== "all" || classFilter !== "all" || sectionFilter !== "all";
  const { data: allRegs, loading: fullLoading } =
    useFilteredCollection<DocRecord>("registrations", needFullFetch ? selectedYear : null);

  // Students collection (has names, gender, DOB, nationality) — only load when needed
  const { data: students, loading: studentsLoading } = useCollection<DocRecord>(
    needFullFetch ? "students" : "",
    needFullFetch ? 10000 : 0
  );

  // Nationalities lookup (code → country name)
  const { data: nationalities } = useCollection<DocRecord>("nationalities", 500);
  const nationalityMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of nationalities) {
      const code = String(n.Nationality_Code || "");
      const name = String(n.E_Nationality_Name || n.E_Country_Name || "");
      if (code && name) map.set(code, name);
    }
    return map;
  }, [nationalities]);

  // Build a lookup map: Student_Number → student details
  const studentMap = useMemo(() => {
    const map = new Map<string, DocRecord>();
    for (const s of students) {
      const sn = String(s.Student_Number || "");
      if (sn) map.set(sn, s);
    }
    return map;
  }, [students]);

  // Merge registration with student details
  const enrich = (reg: DocRecord): DocRecord => {
    const sn = String(reg.Student_Number || "");
    const stu = studentMap.get(sn);
    return { ...reg, _student: stu ?? null } as DocRecord;
  };

  // Apply school, class, section, status filters
  const applyFilters = (rows: DocRecord[]): DocRecord[] => {
    let result = rows;
    if (schoolFilter !== "all") {
      result = result.filter((s) => String(s.Major_Code || "") === schoolFilter);
    }
    if (classFilter !== "all") {
      result = result.filter((s) => String(s.Class_Code || "") === classFilter);
    }
    if (sectionFilter !== "all") {
      result = result.filter((s) => String(s.Section_Code || "") === sectionFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((s) => {
        const terminated = !!s.Termination_Date;
        return statusFilter === "withdrawn" ? terminated : !terminated;
      });
    }
    return result;
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setSearchMode(value.trim().length > 0);
  };

  const filtered = useMemo(() => {
    const enriched = allRegs.map(enrich);
    const applied = applyFilters(enriched);
    let result = applied;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((s) => {
        const stu = s._student as DocRecord | null;
        const name = String(stu?.E_Full_Name || stu?.E_Child_Name || "").toLowerCase();
        const num = String(s.Student_Number || "").toLowerCase();
        const natCode = String(stu?.Nationality_Code_Primary || "");
        const natName = (nationalityMap.get(natCode) || "").toLowerCase();
        return name.includes(q) || num.includes(q) || natName.includes(q);
      });
    }
    result.sort((a, b) => {
      const nameA = String((a._student as DocRecord | null)?.E_Full_Name || (a._student as DocRecord | null)?.E_Child_Name || "");
      const nameB = String((b._student as DocRecord | null)?.E_Full_Name || (b._student as DocRecord | null)?.E_Child_Name || "");
      return nameA.localeCompare(nameB);
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRegs, search, studentMap, statusFilter, nationalityMap, schoolFilter, classFilter, sectionFilter]);

  const isFiltering = needFullFetch || schoolFilter !== "all";
  const displayData = isFiltering ? filtered : pagedRegs.map(enrich);
  const loading = studentsLoading || (isFiltering ? fullLoading : pagedLoading);
  const error = pagedError;

  // Count active/withdrawn for subtitle
  const displayCount = isFiltering
    ? filtered.length
    : pagination.totalCount;

  if (!isFiltering && loading && pagedRegs.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading students...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Students</h1>
          <p className="text-muted-foreground">
            Browse and search student records — {selectedLabel}
            {schoolFilter !== "all" && ` — ${schoolLabel}`}
            {displayCount > 0 && ` (${displayCount.toLocaleString()} total)`}
          </p>
        </div>
        {displayData.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const { exportToCSV } = require("@/lib/export-csv");
              exportToCSV(
                `students-${selectedYear}`,
                ["Student #", "Name", "Gender", "Birth Date", "Nationality", "Status"],
                displayData.map((s) => {
                  const stu = s._student as DocRecord | null;
                  return [
                    String(s.Student_Number || ""),
                    String(stu?.E_Full_Name || stu?.E_Child_Name || "-"),
                    stu?.Gender === true ? "Male" : stu?.Gender === false ? "Female" : "-",
                    stu?.Child_Birth_Date ? String(stu.Child_Birth_Date).split("T")[0] : "-",
                    stu?.Nationality_Code_Primary ? nationalityMap.get(String(stu.Nationality_Code_Primary)) || String(stu.Nationality_Code_Primary) : "-",
                    s.Termination_Date ? "Withdrawn" : "Active",
                  ];
                }),
              );
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        )}
      </div>

      {/* Search + Status Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, number, nationality..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
          {isFiltering && fullLoading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              Loading...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">{t("allStudents")}</option>
            <option value="active">{t("activeOnly")}</option>
            <option value="withdrawn">{t("withdrawnOnly")}</option>
          </select>

          {/* Class filter — visible when a school is selected */}
          {schoolFilter !== "all" && uniqueClasses.length > 0 && (
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">{t("allClasses")}</option>
              {uniqueClasses.map((cc) => (
                <option key={cc} value={cc}>
                  {classNameMap[cc] || `${t("class")} ${cc}`}
                </option>
              ))}
            </select>
          )}

          {/* Section filter — visible when a class is selected */}
          {classFilter !== "all" && sectionsForClass.length > 0 && (
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">{t("allSections")}</option>
              {sectionsForClass.map((sc) => (
                <option key={sc} value={sc}>
                  {sectionNameMap[`${classFilter}__${sc}`] || sc}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student #</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Birth Date</TableHead>
              <TableHead>Nationality</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayData.length === 0 && !loading && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  {search.trim()
                    ? "No students match your search."
                    : "No students found."}
                </TableCell>
              </TableRow>
            )}
            {loading && displayData.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {displayData.map((s) => {
              const stu = s._student as DocRecord | null;
              const terminated = !!s.Termination_Date;
              return (
              <TableRow key={s.id}>
                <TableCell className="font-medium">
                  {String(s.Student_Number || "")}
                </TableCell>
                <TableCell>{String(stu?.E_Full_Name || stu?.E_Child_Name || "-")}</TableCell>
                <TableCell>
                  {stu?.Gender === true
                    ? "Male"
                    : stu?.Gender === false
                      ? "Female"
                      : "-"}
                </TableCell>
                <TableCell>
                  {stu?.Child_Birth_Date
                    ? String(stu.Child_Birth_Date).split("T")[0]
                    : "-"}
                </TableCell>
                <TableCell>
                  {stu?.Nationality_Code_Primary
                    ? nationalityMap.get(String(stu.Nationality_Code_Primary)) || String(stu.Nationality_Code_Primary)
                    : "-"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={terminated ? "secondary" : "default"}
                  >
                    {terminated ? "Withdrawn" : "Active"}
                  </Badge>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Pagination (only when not filtering) */}
        {!isFiltering && (
          <PaginationControls
            pagination={pagination}
            onNext={goNext}
            onPrev={goPrev}
            onFirst={goFirst}
            onPageSizeChange={setPageSize}
            loading={loading}
          />
        )}

        {/* Filtered result count */}
        {isFiltering && !fullLoading && (
          <div className="border-t p-3 text-center text-sm text-muted-foreground">
            {filtered.length.toLocaleString()} student
            {filtered.length !== 1 ? "s" : ""}
            {search.trim() ? " match your search" : " found"}
          </div>
        )}
      </div>
    </div>
  );
}
