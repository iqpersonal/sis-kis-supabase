"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCollection } from "@/hooks/use-sis-data";
import { useClassNames } from "@/hooks/use-classes";
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
import { compareAlphabeticalNames } from "@/lib/name-sort";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { exportToCSV } from "@/lib/export-csv";

type DocRecord = Record<string, unknown> & { id: string };
type StatusFilter = "all" | "active" | "withdrawn";

const EXCLUDED_CLASS_CODES = new Set(["34", "51"]);

function formatGender(value: unknown, maleLabel: string, femaleLabel: string) {
  if (value === true) return maleLabel;
  if (value === false) return femaleLabel;
  const normalized = String(value || "").trim().toLowerCase();
  if (["male", "m", "true", "boy"].includes(normalized)) return maleLabel;
  if (["female", "f", "false", "girl"].includes(normalized)) return femaleLabel;
  return "-";
}

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

  // Load sections when school/year changes
  useEffect(() => {
    const school = schoolFilter === "all" ? "" : schoolFilter;
    let cancelled = false;
    (async () => {
      try {
        let q;
        if (school) {
          q = query(
            collection(getDb(), "sections"),
            where("Academic_Year", "==", selectedYear || "25-26"),
            where("Major_Code", "==", school)
          );
        } else {
          q = query(
            collection(getDb(), "sections"),
            where("Academic_Year", "==", selectedYear || "25-26"),
            limit(2000)
          );
        }
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

  /* ─── Server-side listing state ─── */
  const [serverResults, setServerResults] = useState<DocRecord[]>([]);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverTotal, setServerTotal] = useState(0);
  const [serverOffset, setServerOffset] = useState(0);
  const SERVER_PAGE_SIZE = 50;
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchServerSearch = useCallback(async (offset = 0) => {
    setServerLoading(true);
    setServerError(null);
    try {
      const params = new URLSearchParams();
      params.set("year", selectedYear || "25-26");
      if (search.trim()) params.set("q", search.trim());
      if (schoolFilter !== "all") params.set("school", schoolFilter);
      if (classFilter !== "all") params.set("class", classFilter);
      if (sectionFilter !== "all") params.set("section", sectionFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", String(SERVER_PAGE_SIZE));
      params.set("offset", String(offset));

      const res = await fetch(`/api/students/search?${params}`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setServerResults(
        (data.students || []).map((s: Record<string, unknown>, i: number) => ({
          ...s,
          id: s.id || String(i),
          _student: {
            E_Student_Name: s.E_Student_Name,
            A_Student_Name: s.A_Student_Name,
            Gender: s.Gender,
            Birth_Date: s.Birth_Date,
            Nationality_Name: s.Nationality_Name,
            Nationality_Code: s.Nationality_Code,
          },
        })).sort((a: DocRecord, b: DocRecord) => compareAlphabeticalNames(
          (a._student as DocRecord | null)?.E_Student_Name,
          (b._student as DocRecord | null)?.E_Student_Name
        ))
      );
      setServerOffset(offset);
      setServerTotal(data.total || 0);
    } catch (err) {
      console.error("Server search failed:", err);
      setServerError(err instanceof Error ? err.message : "Search failed");
      setServerResults([]);
      setServerTotal(0);
    } finally {
      setServerLoading(false);
    }
  }, [selectedYear, search, schoolFilter, classFilter, sectionFilter, statusFilter]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setServerOffset(0);
  }, [search, selectedYear, schoolFilter, classFilter, sectionFilter, statusFilter]);

  // Debounce list/search requests for the shared server-backed grid.
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchServerSearch(0), search.trim() ? 400 : 50);
    return () => clearTimeout(debounceRef.current);
  }, [fetchServerSearch, search]);

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

  /* ─── Display logic ─── */
  const displayData = serverResults;
  const loading = serverLoading;
  const displayCount = serverTotal;

  if (loading && displayData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        {t("loadingStudents")}
      </div>
    );
  }

  if (serverError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
        {serverError}
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
              exportToCSV(
                `students-${selectedYear}`,
                [t("studentNumber"), t("name"), t("gender"), t("birthDate"), t("profileNationality"), t("status")],
                displayData.map((s) => {
                  const stu = s._student as DocRecord | null;
                  return [
                    String(s.Student_Number || ""),
                    String(stu?.E_Student_Name || stu?.E_Full_Name || stu?.E_Child_Name || "-"),
                    formatGender(stu?.Gender, t("male"), t("female")),
                    (stu?.Birth_Date || stu?.Child_Birth_Date) ? String(stu?.Birth_Date || stu?.Child_Birth_Date).split("T")[0] : "-",
                    (stu?.Nationality_Name || stu?.Nationality_Code || stu?.Nationality_Code_Primary)
                      ? String(stu?.Nationality_Name || "") ||
                        nationalityMap.get(String(stu?.Nationality_Code || stu?.Nationality_Code_Primary)) ||
                        String(stu?.Nationality_Code || stu?.Nationality_Code_Primary)
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
          {serverLoading && (
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

          {/* Class filter */}
          {uniqueClasses.length > 0 && (
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
                  <TableCell>{String(stu?.E_Student_Name || stu?.E_Full_Name || stu?.E_Child_Name || "-")}</TableCell>
                  <TableCell>
                    {formatGender(stu?.Gender, t("male"), t("female"))}
                  </TableCell>
                  <TableCell>
                    {(stu?.Birth_Date || stu?.Child_Birth_Date) ? String(stu?.Birth_Date || stu?.Child_Birth_Date).split("T")[0] : "-"}
                  </TableCell>
                  <TableCell>
                    {(stu?.Nationality_Name || stu?.Nationality_Code || stu?.Nationality_Code_Primary)
                      ? String(stu?.Nationality_Name || "") ||
                        nationalityMap.get(String(stu?.Nationality_Code || stu?.Nationality_Code_Primary)) ||
                        String(stu?.Nationality_Code || stu?.Nationality_Code_Primary)
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

        {/* Server pagination */}
        {serverTotal > 0 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-sm text-muted-foreground">
              {serverLoading ? t("searching") : (
                <>
                  {serverTotal.toLocaleString()} {serverTotal !== 1 ? t("navStudents") : t("navStudentProfile")}
                  {serverTotal > SERVER_PAGE_SIZE && (
                    <> &middot; Page {Math.floor(serverOffset / SERVER_PAGE_SIZE) + 1} of {Math.ceil(serverTotal / SERVER_PAGE_SIZE)}</>
                  )}
                </>
              )}
            </span>
            {serverTotal > SERVER_PAGE_SIZE && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={serverOffset === 0 || serverLoading}
                  onClick={() => fetchServerSearch(0)}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={serverOffset === 0 || serverLoading}
                  onClick={() => fetchServerSearch(serverOffset - SERVER_PAGE_SIZE)}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={serverOffset + SERVER_PAGE_SIZE >= serverTotal || serverLoading}
                  onClick={() => fetchServerSearch(serverOffset + SERVER_PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
