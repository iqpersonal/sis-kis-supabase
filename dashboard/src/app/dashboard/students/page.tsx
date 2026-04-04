"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  usePaginatedCollection,
  useCollection,
} from "@/hooks/use-sis-data";
import { useClassNames } from "@/hooks/use-classes";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Filter, Download, User } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";
import { useAuth } from "@/context/auth-context";
import { getDb } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

type DocRecord = Record<string, unknown> & { id: string };
type StatusFilter = "all" | "active" | "withdrawn";

const EXCLUDED_CLASS_CODES = new Set(["34", "51"]);

export default function StudentsPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { selectedYear, selectedLabel } = useAcademicYear();
  const { schoolFilter, schoolLabel } = useSchoolFilter();
  const { can } = useAuth();

  /* ─── Filter state ─── */
  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [classFilter, setClassFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");

  /* ─── Class / Section data ─── */
  const { classNameMap } = useClassNames();
  const [classSections, setClassSections] = useState<
    { classCode: string; sectionCode: string; sectionName: string }[]
  >([]);

  // Load sections when school changes
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

  // Unique classes and sections for the dropdowns
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

  /* ─── Data hooks ─── */
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

  const needServerSearch =
    searchMode ||
    statusFilter !== "all" ||
    schoolFilter !== "all" ||
    classFilter !== "all" ||
    sectionFilter !== "all";

  const isFiltering = needServerSearch;

  // Server-side search state
  const [serverResults, setServerResults] = useState<DocRecord[]>([]);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverTotal, setServerTotal] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchServerSearch = useCallback(async () => {
    if (!needServerSearch) return;
    setServerLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("year", selectedYear || "25-26");
      if (search.trim()) params.set("q", search.trim());
      if (schoolFilter !== "all") params.set("school", schoolFilter);
      if (classFilter !== "all") params.set("class", classFilter);
      if (sectionFilter !== "all") params.set("section", sectionFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", "500");

      const res = await fetch(`/api/students/search?${params}`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setServerResults(
        (data.students || []).map((s: Record<string, unknown>, i: number) => ({
          ...s,
          id: s.id || String(i),
          _student: {
            E_Full_Name: s.E_Full_Name,
            Gender: s.Gender,
            Child_Birth_Date: s.Child_Birth_Date,
            Nationality_Code_Primary: s.Nationality_Code_Primary,
          },
        }))
      );
      setServerTotal(data.total || 0);
    } catch (err) {
      console.error("Server search failed:", err);
    } finally {
      setServerLoading(false);
    }
  }, [needServerSearch, selectedYear, search, schoolFilter, classFilter, sectionFilter, statusFilter]);

  // Debounce server search for text input, immediate for dropdown changes
  useEffect(() => {
    if (!needServerSearch) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchServerSearch, search.trim() ? 400 : 50);
    return () => clearTimeout(debounceRef.current);
  }, [needServerSearch, fetchServerSearch, search]);

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

  const enrich = (reg: DocRecord): DocRecord => {
    // For paginated (non-search) mode, _student isn't set — return as-is
    return reg;
  };

  // Enrich paginated results with student details (small batch per page)
  const [enrichedPagedRegs, setEnrichedPagedRegs] = useState<DocRecord[]>([]);
  useEffect(() => {
    if (isFiltering || pagedRegs.length === 0) {
      setEnrichedPagedRegs([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const db = getDb();
        const sns = [...new Set(pagedRegs.map((r) => String(r.Student_Number || "")))].filter(Boolean);
        const studentMap = new Map<string, Record<string, unknown>>();
        // Fetch in batches of 30 (Firestore 'in' limit)
        for (let i = 0; i < sns.length; i += 30) {
          const batch = sns.slice(i, i + 30);
          const q = query(
            collection(getDb(), "students"),
            where("Student_Number", "in", batch.map((sn) => {
              const num = Number(sn);
              return isNaN(num) ? sn : num;
            }))
          );
          const snap = await getDocs(q);
          snap.docs.forEach((d) => {
            const data = d.data();
            studentMap.set(String(data.Student_Number), data);
          });
        }
        if (cancelled) return;
        setEnrichedPagedRegs(
          pagedRegs.map((reg) => {
            const stu = studentMap.get(String(reg.Student_Number)) || null;
            return { ...reg, _student: stu } as DocRecord;
          })
        );
      } catch (err) {
        console.error("Failed to enrich students:", err);
        setEnrichedPagedRegs(pagedRegs);
      }
    })();
    return () => { cancelled = true; };
  }, [pagedRegs, isFiltering]);

  /* ─── Display logic ─── */
  const displayData = isFiltering ? serverResults : (enrichedPagedRegs.length > 0 ? enrichedPagedRegs : pagedRegs);
  const loading = isFiltering ? serverLoading : pagedLoading;
  const displayCount = isFiltering ? serverTotal : pagination.totalCount;

  if (!isFiltering && loading && pagedRegs.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        {t("loadingStudents")}
      </div>
    );
  }

  if (pagedError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
        {pagedError}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("navStudentProfile")}</h1>
          <p className="text-muted-foreground">
            {t("browseStudents")} — {selectedLabel}
            {schoolFilter !== "all" && ` — ${schoolLabel}`}
            {displayCount > 0 && ` (${displayCount.toLocaleString()} ${t("totalStudents")})`}
          </p>
        </div>
        {displayData.length > 0 && can("bulk_export.view") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const { exportToCSV } = require("@/lib/export-csv");
              exportToCSV(
                `students-${selectedYear}`,
                [t("studentNumber"), t("name"), t("gender"), t("birthDate"), t("profileNationality"), t("status")],
                displayData.map((s) => {
                  const stu = s._student as DocRecord | null;
                  return [
                    String(s.Student_Number || ""),
                    String(stu?.E_Full_Name || stu?.E_Child_Name || "-"),
                    stu?.Gender === true ? t("male") : stu?.Gender === false ? t("female") : "-",
                    stu?.Child_Birth_Date ? String(stu.Child_Birth_Date).split("T")[0] : "-",
                    stu?.Nationality_Code_Primary
                      ? nationalityMap.get(String(stu.Nationality_Code_Primary)) || String(stu.Nationality_Code_Primary)
                      : "-",
                    s.Termination_Date ? t("withdrawn") : t("active"),
                  ];
                })
              );
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            {t("exportCsv")}
          </Button>
        )}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchByNameNumber")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSearchMode(e.target.value.trim().length > 0);
            }}
            className="pl-9"
          />
          {isFiltering && serverLoading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {t("searching")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">{t("allStudents")}</option>
            <option value="active">{t("activeOnly")}</option>
            <option value="withdrawn">{t("withdrawnOnly")}</option>
          </select>

          {/* Class filter (only when a school is selected) */}
          {schoolFilter !== "all" && (
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

          {/* Section filter (only when a class is selected) */}
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
              <TableHead>{t("studentNumber")}</TableHead>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("gender")}</TableHead>
              <TableHead>{t("birthDate")}</TableHead>
              <TableHead>{t("profileNationality")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayData.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {search.trim() ? t("noStudentsMatch") : t("noStudentsFound")}
                </TableCell>
              </TableRow>
            )}
            {loading && displayData.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {t("loadingStudents")}
                </TableCell>
              </TableRow>
            )}
            {displayData.map((s) => {
              const stu = s._student as DocRecord | null;
              const terminated = !!s.Termination_Date;
              return (
                <TableRow
                  key={s.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/dashboard/students/${s.Student_Number}`)}
                >
                  <TableCell className="font-medium font-mono">
                    {String(s.Student_Number || "")}
                  </TableCell>
                  <TableCell>{String(stu?.E_Full_Name || stu?.E_Child_Name || "-")}</TableCell>
                  <TableCell>
                    {stu?.Gender === true ? t("male") : stu?.Gender === false ? t("female") : "-"}
                  </TableCell>
                  <TableCell>
                    {stu?.Child_Birth_Date ? String(stu.Child_Birth_Date).split("T")[0] : "-"}
                  </TableCell>
                  <TableCell>
                    {stu?.Nationality_Code_Primary
                      ? nationalityMap.get(String(stu.Nationality_Code_Primary)) || String(stu.Nationality_Code_Primary)
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={terminated ? "secondary" : "default"}>
                      {terminated ? t("withdrawn") : t("active")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm">
                      <User className="mr-1 h-4 w-4" />
                      {t("profileOverview")}
                    </Button>
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
        {isFiltering && !serverLoading && (
          <div className="border-t p-3 text-center text-sm text-muted-foreground">
            {serverTotal.toLocaleString()} {serverTotal !== 1 ? t("navStudents") : t("navStudentProfile")}
            {search.trim() ? ` — ${t("noStudentsMatch").replace(".", "")}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
