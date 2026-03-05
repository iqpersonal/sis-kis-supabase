"use client";

export const dynamic = "force-dynamic";

import { useState, useMemo } from "react";
import { usePaginatedCollection, useFilteredCollection, useCollection } from "@/hooks/use-sis-data";
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
import { Search, Filter } from "lucide-react";

type DocRecord = Record<string, unknown> & { id: string };
type StatusFilter = "all" | "active" | "withdrawn";

export default function StudentsPage() {
  const { selectedYear, selectedLabel } = useAcademicYear();
  const { schoolFilter, schoolLabel } = useSchoolFilter();
  const [searchMode, setSearchMode] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

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

  // Full registrations only when searching or filtering by status
  const needFullFetch = searchMode || statusFilter !== "all" || schoolFilter !== "all";
  const { data: allRegs, loading: fullLoading } =
    useFilteredCollection<DocRecord>("registrations", needFullFetch ? selectedYear : null);

  // Students collection (has names, gender, DOB, nationality)
  const { data: students, loading: studentsLoading } = useCollection<DocRecord>("students", 10000);

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

  // Apply status filter + school filter
  const applyStatusFilter = (rows: DocRecord[]): DocRecord[] => {
    let result = rows;
    // School filter — registrations have Major_Code
    if (schoolFilter !== "all") {
      result = result.filter((s) => String(s.Major_Code || "") === schoolFilter);
    }
    if (statusFilter === "all") return result;
    return result.filter((s) => {
      const terminated = !!s.Termination_Date;
      return statusFilter === "withdrawn" ? terminated : !terminated;
    });
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setSearchMode(value.trim().length > 0);
  };

  const filtered = useMemo(() => {
    const enriched = allRegs.map(enrich);
    const statusFiltered = applyStatusFilter(enriched);
    if (!search.trim()) return statusFiltered;
    const q = search.toLowerCase();
    return statusFiltered.filter((s) => {
      const stu = s._student as DocRecord | null;
      const name = String(stu?.E_Full_Name || stu?.E_Child_Name || "").toLowerCase();
      const num = String(s.Student_Number || "").toLowerCase();
      const natCode = String(stu?.Nationality_Code_Primary || "");
      const natName = (nationalityMap.get(natCode) || "").toLowerCase();
      return name.includes(q) || num.includes(q) || natName.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRegs, search, studentMap, statusFilter, nationalityMap, schoolFilter]);

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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Students</h1>
        <p className="text-muted-foreground">
          Browse and search student records — {selectedLabel}
          {schoolFilter !== "all" && ` — ${schoolLabel}`}
          {displayCount > 0 && ` (${displayCount.toLocaleString()} total)`}
        </p>
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
            <option value="all">All Students</option>
            <option value="active">Active Only</option>
            <option value="withdrawn">Withdrawn Only</option>
          </select>
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
