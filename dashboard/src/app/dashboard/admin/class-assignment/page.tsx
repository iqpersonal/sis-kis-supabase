"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BookOpen,
  CheckCircle2,
  RefreshCw,
  Search,
  Users,
  GraduationCap,
  FileDown,
  ChevronDown,
  X,
} from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase";
import type { Role } from "@/lib/rbac";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";

/* ── Types ──────────────────────────────────────────────────────── */

interface AdminUser {
  uid: string;
  email?: string;
  displayName?: string;
  role: Role;
  assigned_classes?: AssignedClass[];
}

interface AssignedClass {
  classId: string;
  className: string;
  section: string;
  year: string;
  campus: string;
  subject?: string;
}

interface SubjectEntry {
  name: string;
  periods: number;
}

interface SubjectInfo {
  code: string;
  nameEn: string;
  nameAr: string;
}

interface AvailableClass {
  classId: string;
  className: string;
  classNameAr: string;
  section: string;
  year: string;
  campus: string;
}

function formatSubjectLabel(subject: SubjectInfo, isRTL: boolean) {
  return isRTL ? (subject.nameAr || subject.nameEn) : subject.nameEn;
}

function formatAssignedSubjects(entries: SubjectEntry[]) {
  if (entries.length === 0) return "— Select —";
  return entries.map((s) => `${s.name} (${s.periods})`).join(", ");
}

/* ── Page ───────────────────────────────────────────────────────── */

export default function ClassAssignmentPage() {
  const { user, can } = useAuth();
  const { t, isRTL } = useLanguage();

  // Teachers list
  const [teachers, setTeachers] = useState<AdminUser[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(true);

  // Selected teacher
  const [selectedTeacherUid, setSelectedTeacherUid] = useState<string | null>(null);

  // Global contexts for year & campus
  const { selectedYear } = useAcademicYear();
  const { schoolFilter } = useSchoolFilter();

  // Sections / classes
  const [availableClasses, setAvailableClasses] = useState<AvailableClass[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set());
  const [classesLoading, setClassesLoading] = useState(false);

  // Subject — per-class map: classId → array of {name, periods}
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [classSubjects, setClassSubjects] = useState<Record<string, SubjectEntry[]>>({});
  const [openSubjectDropdown, setOpenSubjectDropdown] = useState<string | null>(null);
  const [subjectSearchByClass, setSubjectSearchByClass] = useState<Record<string, string>>({});
  const [commonSubjectCode, setCommonSubjectCode] = useState("");
  const [commonSubjectSearch, setCommonSubjectSearch] = useState("");
  const [commonPeriods, setCommonPeriods] = useState(0);
  const [commonApplyMode, setCommonApplyMode] = useState<"selected" | "filtered">("selected");

  // Close subject dropdown on outside click
  useEffect(() => {
    if (!openSubjectDropdown) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-subject-dropdown]')) setOpenSubjectDropdown(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openSubjectDropdown]);

  // Search filters
  const [searchFilter, setSearchFilter] = useState("");
  const [teacherSearch, setTeacherSearch] = useState("");

  // Save state
  const [saving, setSaving] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isSuperAdmin = can("admin.users");

  async function getAuthHeaders() {
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  // Load teachers on mount
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/admin/users", { headers });
        if (!res.ok) throw new Error("Failed to load users");
        const data = await res.json();
        setTeachers(
          (data.users || []).filter((u: AdminUser) => u.role === "teacher")
        );
      } catch {
        setTeachers([]);
      } finally {
        setLoadingTeachers(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Load sections when teacher, year, or campus changes
  async function loadSections() {
    setClassesLoading(true);
    setErrorMsg(null);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      if (selectedYear) params.set("year", selectedYear);
      if (schoolFilter !== "all") params.set("school", schoolFilter);
      if (subjects.length === 0) params.set("subjects", "1");
      const url = `/api/admin/users/assign-classes?${params}`;
      console.log("[class-assignment] fetching:", url);
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("Failed to load classes");
      const data = await res.json();
      console.log("[class-assignment] got", data.classes?.length, "classes,", data.subjects?.length, "subjects");
      setAvailableClasses(data.classes || []);
      if (data.subjects?.length) {
        setSubjects(data.subjects);
      }
    } catch (err) {
      console.error("[class-assignment] loadSections error:", err);
      setAvailableClasses([]);
    } finally {
      setClassesLoading(false);
    }
  }

  function handleSelectTeacher(uid: string) {
    setSelectedTeacherUid(uid);
    setSuccessMsg(null);
    setErrorMsg(null);

    // Pre-select currently assigned classes & per-class subjects
    const teacher = teachers.find((t) => t.uid === uid);
    const assigned = teacher?.assigned_classes || [];
    const currentIds = new Set(assigned.map((c) => c.classId));
    setSelectedClassIds(currentIds);

    // Restore per-class subjects from existing assignments
    const subjectMap: Record<string, SubjectEntry[]> = {};
    assigned.forEach((c) => {
      if (c.subject) {
        subjectMap[c.classId] = c.subject.split(", ").filter(Boolean).map((s) => {
          const [name, p] = s.split(":");
          return { name: name.trim(), periods: p ? parseInt(p, 10) || 0 : 0 };
        }).filter((e) => e.name && e.name !== "undefined");
      }
    });
    setClassSubjects(subjectMap);
  }

  function toggleClassSelection(classId: string) {
    setSelectedClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
    setSuccessMsg(null);
  }

  function addOrUpdateSubjectForClass(classId: string, subjectName: string, periods: number) {
    setClassSubjects((prev) => {
      const current = prev[classId] || [];
      const existing = current.find((entry) => entry.name === subjectName);
      const next = existing
        ? current.map((entry) =>
            entry.name === subjectName ? { ...entry, periods } : entry
          )
        : [...current, { name: subjectName, periods }];
      return { ...prev, [classId]: next };
    });
  }

  function removeSubjectForClass(classId: string, subjectName: string) {
    setClassSubjects((prev) => {
      const current = prev[classId] || [];
      return {
        ...prev,
        [classId]: current.filter((entry) => entry.name !== subjectName),
      };
    });
  }

  function getCommonTargetClassIds() {
    if (commonApplyMode === "filtered") {
      return filteredClasses.map((entry) => entry.classId);
    }

    return filteredClasses
      .filter((entry) => selectedClassIds.has(entry.classId))
      .map((entry) => entry.classId);
  }

  function applyCommonSubject() {
    if (!commonSubjectCode) return;
    const subject = subjects.find((entry) => entry.code === commonSubjectCode);
    if (!subject) return;

    const targetClassIds = getCommonTargetClassIds();

    if (targetClassIds.length === 0) return;

    targetClassIds.forEach((classId) => {
      addOrUpdateSubjectForClass(classId, subject.nameEn, commonPeriods);
    });

    setSuccessMsg(
      `Applied ${subject.nameEn} (${commonPeriods}) to ${targetClassIds.length} ${commonApplyMode === "filtered" ? "filtered" : "selected"} classes`
    );
  }

  function clearCommonSubject() {
    if (!commonSubjectCode) return;
    const subject = subjects.find((entry) => entry.code === commonSubjectCode);
    if (!subject) return;

    const targetClassIds = getCommonTargetClassIds();

    if (targetClassIds.length === 0) return;

    targetClassIds.forEach((classId) => {
      removeSubjectForClass(classId, subject.nameEn);
    });

    setSuccessMsg(
      `Removed ${subject.nameEn} from ${targetClassIds.length} ${commonApplyMode === "filtered" ? "filtered" : "selected"} classes`
    );
  }

  function selectAll(filtered: AvailableClass[]) {
    setSelectedClassIds((prev) => {
      const next = new Set(prev);
      filtered.forEach((c) => next.add(c.classId));
      return next;
    });
    setSuccessMsg(null);
  }

  function deselectAll(filtered: AvailableClass[]) {
    setSelectedClassIds((prev) => {
      const next = new Set(prev);
      filtered.forEach((c) => next.delete(c.classId));
      return next;
    });
    setSuccessMsg(null);
  }

  async function handleSave() {
    if (!selectedTeacherUid) return;
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const headers = await getAuthHeaders();
      const assignedList = availableClasses
        .filter((c) => selectedClassIds.has(c.classId))
        .map((c) => ({
          classId: c.classId,
          className: c.className,
          section: c.section,
          year: c.year,
          campus: c.campus,
          subject: (classSubjects[c.classId] || []).map((s) => `${s.name}:${s.periods}`).join(", "),
        }));

      const res = await fetch("/api/admin/users/assign-classes", {
        method: "PUT",
        headers,
        body: JSON.stringify({ uid: selectedTeacherUid, classes: assignedList }),
      });
      if (!res.ok) throw new Error("Failed to save assignments");

      // Update local state
      setTeachers((prev) =>
        prev.map((u) =>
          u.uid === selectedTeacherUid
            ? { ...u, assigned_classes: assignedList }
            : u
        )
      );

      setSuccessMsg(
        `${t("classesUpdated" as never) || "Classes updated successfully!"} (${assignedList.length} ${t("classesAssigned" as never) || "assigned"})`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadTeacherAssignmentReport() {
    if (!selectedYear) {
      setErrorMsg("Select an academic year first");
      return;
    }

    setGeneratingReport(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/pdf-reports", {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "teacher_assignment",
          year: selectedYear,
          school: schoolFilter,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate teacher assignment report");
      }

      const blob = await res.blob();
      const fileName = `teacher_assignment_${selectedYear}${schoolFilter !== "all" ? `_${schoolFilter}` : ""}.pdf`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setSuccessMsg("Teacher assignment report generated");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setGeneratingReport(false);
    }
  }

  // Load/reload sections when teacher, year, or campus changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selectedTeacherUid) loadSections();
  }, [selectedTeacherUid, selectedYear, schoolFilter]);

  // ── Filter & sort the visible list ──
  const filteredClasses = availableClasses
    .filter((c) => {
      if (!searchFilter) return true;
      const q = searchFilter.toLowerCase();
      return (
        c.className.toLowerCase().includes(q) ||
        c.section.toLowerCase().includes(q) ||
        c.year.toLowerCase().includes(q) ||
        c.campus.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      // Extract numeric grade for proper sorting ("Grade 1" before "Grade 10")
      const gradeNum = (s: string) => {
        const m = s.match(/(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
      };
      const ga = gradeNum(a.className);
      const gb = gradeNum(b.className);
      if (ga !== gb) return ga - gb;
      // Fallback to alphabetical class name
      const ca = a.className.localeCompare(b.className);
      if (ca !== 0) return ca;
      // Then sort by section
      return a.section.localeCompare(b.section, undefined, { numeric: true });
    });

  const filteredCommonSubjects = subjects.filter((subject) => {
    if (!commonSubjectSearch) return true;
    const query = commonSubjectSearch.toLowerCase();
    return (
      subject.nameEn.toLowerCase().includes(query) ||
      subject.nameAr.toLowerCase().includes(query) ||
      subject.code.toLowerCase().includes(query)
    );
  });

  const selectedTeacher = teachers.find((t) => t.uid === selectedTeacherUid);
  const allFilteredSelected = filteredClasses.length > 0 && filteredClasses.every((c) => selectedClassIds.has(c.classId));
  const commonTargetCount = commonApplyMode === "filtered"
    ? filteredClasses.length
    : filteredClasses.filter((entry) => selectedClassIds.has(entry.classId)).length;

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Access denied</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir={isRTL ? "rtl" : "ltr"}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          {t("classAssignment" as never) || "Class Assignment"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("manageClassesDesc" as never) || "Assign sections to teachers"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* ── Left: Teacher List ───────────────────────────────── */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              {t("selectTeacher" as never) || "Select Teacher"}
            </CardTitle>
            <CardDescription className="text-xs">
              {teachers.length} {t("teachers" as never) || "teachers"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {/* Teacher search */}
            <div className="px-4 pb-2 pt-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search teachers..."
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>
            {loadingTeachers ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : teachers.length === 0 ? (
              <p className="text-sm text-muted-foreground px-6 pb-4">
                No teachers found
              </p>
            ) : (
              <div className="max-h-[500px] overflow-y-auto">
                {teachers
                  .filter((teacher) => {
                    if (!teacherSearch) return true;
                    const q = teacherSearch.toLowerCase();
                    return (
                      (teacher.displayName || "").toLowerCase().includes(q) ||
                      (teacher.email || "").toLowerCase().includes(q)
                    );
                  })
                  .map((teacher) => {
                  const isSelected = teacher.uid === selectedTeacherUid;
                  const assignedCount = teacher.assigned_classes?.length || 0;
                  const totalPeriods = (teacher.assigned_classes || []).reduce((sum, c) => {
                    if (!c.subject) return sum;
                    return sum + c.subject.split(", ").filter(Boolean).reduce((s2, entry) => {
                      const [, p] = entry.split(":");
                      return s2 + (p ? parseInt(p, 10) || 0 : 0);
                    }, 0);
                  }, 0);
                  return (
                    <button
                      key={teacher.uid}
                      onClick={() => handleSelectTeacher(teacher.uid)}
                      className={`w-full text-left px-4 py-3 border-b last:border-b-0 transition-colors hover:bg-accent/50 ${
                        isSelected
                          ? "bg-primary/10 border-l-2 border-l-primary"
                          : ""
                      }`}
                    >
                      <div className="font-medium text-sm truncate">
                        {teacher.displayName || teacher.email || teacher.uid}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {teacher.email}
                        </span>
                        {assignedCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                            <GraduationCap className="h-3 w-3" />
                            {assignedCount}
                          </span>
                        )}
                        {totalPeriods > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 px-1.5 py-0.5 rounded-full">
                            {totalPeriods} periods
                          </span>
                        )}
                      </div>
                      {assignedCount > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {teacher.assigned_classes!.map((c) => (
                            <span key={c.classId} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                              {c.className} — {c.section}{c.subject ? ` (${c.subject.split(", ").filter((s) => !s.startsWith("undefined")).map((s) => { const [n, p] = s.split(":"); return p ? `${n} ×${p}` : n; }).join(", ")})` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Right: Section Assignment Table ──────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <GraduationCap className="h-4 w-4" />
                  {selectedTeacher
                    ? `${t("assignClasses" as never) || "Assign Sections"} — ${selectedTeacher.displayName || selectedTeacher.email}`
                    : t("availableClasses" as never) || "Available Sections"}
                </CardTitle>
                {selectedTeacher && (
                  <CardDescription className="text-xs mt-1">
                    {selectedClassIds.size} {t("classesAssigned" as never) || "selected"} / {availableClasses.length} {t("availableClasses" as never) || "available"}
                  </CardDescription>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadTeacherAssignmentReport}
                  disabled={generatingReport}
                  className="w-fit"
                >
                  {generatingReport ? (
                    <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4 mr-1" />
                  )}
                  A3 Assignment Report
                </Button>

                {selectedTeacherUid && (
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving}
                    className="w-fit"
                  >
                    {saving ? (
                      <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                    )}
                    {t("save" as never) || "Save Assignments"}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {!selectedTeacherUid ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Users className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">
                  {t("selectTeacher" as never) || "Select a teacher to manage their class assignments"}
                </p>
              </div>
            ) : classesLoading ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Filters row */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={`${t("search" as never) || "Search"} ...`}
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="pl-8 h-9 text-sm"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => selectAll(filteredClasses)}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deselectAll(filteredClasses)}
                    >
                      Deselect All
                    </Button>
                  </div>
                </div>

                {subjects.length > 0 && (
                  <div className="rounded-md border bg-muted/20 p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                      <div className="min-w-[280px] flex-1">
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          Common Subject
                        </label>
                        <div className="rounded-md border bg-background">
                          <div className="border-b p-2">
                            <Input
                              value={commonSubjectSearch}
                              onChange={(e) => setCommonSubjectSearch(e.target.value)}
                              placeholder="Search subject..."
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="max-h-40 overflow-y-auto p-1">
                            {filteredCommonSubjects.map((subject) => {
                              const active = commonSubjectCode === subject.code;
                              return (
                                <button
                                  key={subject.code}
                                  type="button"
                                  onClick={() => setCommonSubjectCode(subject.code)}
                                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm transition-colors ${
                                    active ? "bg-primary/10 text-primary" : "hover:bg-accent"
                                  }`}
                                >
                                  <span className="truncate">{formatSubjectLabel(subject, isRTL)}</span>
                                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">{subject.code}</span>
                                </button>
                              );
                            })}
                            {filteredCommonSubjects.length === 0 && (
                              <div className="px-2 py-3 text-sm text-muted-foreground">No subjects found</div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="w-full lg:w-28">
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          Periods
                        </label>
                        <Input
                          type="number"
                          min={0}
                          max={50}
                          value={commonPeriods}
                          onChange={(e) => setCommonPeriods(parseInt(e.target.value, 10) || 0)}
                          className="h-9"
                        />
                      </div>

                      <div className="w-full lg:w-44">
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          Apply To
                        </label>
                        <div className="grid grid-cols-2 rounded-md border bg-background p-1">
                          <button
                            type="button"
                            onClick={() => setCommonApplyMode("selected")}
                            className={`rounded px-2 py-1.5 text-xs transition-colors ${
                              commonApplyMode === "selected"
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-accent"
                            }`}
                          >
                            Selected
                          </button>
                          <button
                            type="button"
                            onClick={() => setCommonApplyMode("filtered")}
                            className={`rounded px-2 py-1.5 text-xs transition-colors ${
                              commonApplyMode === "filtered"
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-accent"
                            }`}
                          >
                            Filtered
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={applyCommonSubject}
                          disabled={!commonSubjectCode || commonTargetCount === 0}
                        >
                          Apply to {commonApplyMode === "filtered" ? "Filtered" : "Selected"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={clearCommonSubject}
                          disabled={!commonSubjectCode || commonTargetCount === 0}
                        >
                          Clear from {commonApplyMode === "filtered" ? "Filtered" : "Selected"}
                        </Button>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Workflow: choose whether to target selected rows or all filtered rows, apply one subject, then move to the next subject. Current target: {commonTargetCount} classes.
                    </p>
                  </div>
                )}

                {/* Success / Error messages */}
                {successMsg && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20 rounded-md px-3 py-2">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    {successMsg}
                  </div>
                )}
                {errorMsg && (
                  <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 rounded-md px-3 py-2">
                    {errorMsg}
                  </div>
                )}

                {/* Sections table */}
                {filteredClasses.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    {t("noClassesAvailable" as never) || "No sections found"}
                  </p>
                ) : (
                  <div className="border rounded-md overflow-hidden">
                    <div className="max-h-[480px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="w-10">
                              <input
                                type="checkbox"
                                checked={allFilteredSelected}
                                onChange={() =>
                                  allFilteredSelected
                                    ? deselectAll(filteredClasses)
                                    : selectAll(filteredClasses)
                                }
                                className="rounded"
                              />
                            </TableHead>
                            <TableHead className="font-semibold">
                              {t("class" as never) || "Grade"}
                            </TableHead>
                            <TableHead className="font-semibold">
                              {t("section" as never) || "Section"}
                            </TableHead>
                            <TableHead className="font-semibold">
                              {t("academicYear" as never) || "Academic Year"}
                            </TableHead>
                            <TableHead className="font-semibold">
                              {t("campus" as never) || "Campus"}
                            </TableHead>
                            <TableHead className="font-semibold">
                              {t("subject" as never) || "Subject"}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredClasses.map((c) => {
                            const checked = selectedClassIds.has(c.classId);
                            return (
                              <TableRow
                                key={c.classId}
                                className={`cursor-pointer transition-colors ${
                                  checked ? "bg-primary/5" : "hover:bg-accent/30"
                                }`}
                                onClick={() => toggleClassSelection(c.classId)}
                              >
                                <TableCell>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      toggleClassSelection(c.classId)
                                    }
                                    onClick={(e) => e.stopPropagation()}
                                    className="rounded"
                                  />
                                </TableCell>
                                <TableCell className="font-medium">
                                  {c.className}
                                </TableCell>
                                <TableCell>{c.section}</TableCell>
                                <TableCell>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                    {c.year}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                      c.campus === "Boys"
                                        ? "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
                                        : c.campus === "Girls"
                                          ? "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300"
                                          : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
                                    }`}
                                  >
                                    {c.campus || "—"}
                                  </span>
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                    <div className="relative min-w-[160px]" data-subject-dropdown>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenSubjectDropdown((prev) => prev === c.classId ? null : c.classId);
                                          setSubjectSearchByClass((prev) => ({ ...prev, [c.classId]: prev[c.classId] || "" }));
                                        }}
                                        className="h-7 w-full rounded border bg-background px-2 text-xs text-left flex items-center justify-between gap-1"
                                      >
                                        <span className="truncate">
                                          {formatAssignedSubjects(classSubjects[c.classId] || [])}
                                        </span>
                                        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                                      </button>
                                      {openSubjectDropdown === c.classId && (
                                        <div className="absolute z-50 mt-1 w-80 rounded-md border bg-popover shadow-lg">
                                          <div className="border-b p-2">
                                            <Input
                                              value={subjectSearchByClass[c.classId] || ""}
                                              onChange={(e) =>
                                                setSubjectSearchByClass((prev) => ({
                                                  ...prev,
                                                  [c.classId]: e.target.value,
                                                }))
                                              }
                                              placeholder="Search subject..."
                                              className="h-8 text-sm"
                                            />
                                          </div>
                                          <div className="max-h-64 overflow-y-auto">
                                          {subjects
                                            .filter((s) => {
                                              const query = (subjectSearchByClass[c.classId] || "").toLowerCase();
                                              if (!query) return true;
                                              return (
                                                s.nameEn.toLowerCase().includes(query) ||
                                                s.nameAr.toLowerCase().includes(query) ||
                                                s.code.toLowerCase().includes(query)
                                              );
                                            })
                                            .map((s) => {
                                            const entry = (classSubjects[c.classId] || []).find((e) => e.name === s.nameEn);
                                            const isSelected = !!entry;
                                            return (
                                              <div key={s.code} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent">
                                                <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                                                  <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => {
                                                      setClassSubjects((prev) => {
                                                        const current = prev[c.classId] || [];
                                                        const next = isSelected
                                                          ? current.filter((x) => x.name !== s.nameEn)
                                                          : [...current, { name: s.nameEn, periods: 0 }];
                                                        return { ...prev, [c.classId]: next };
                                                      });
                                                      if (!isSelected) {
                                                        setSelectedClassIds((prev) => {
                                                          if (prev.has(c.classId)) return prev;
                                                          const next = new Set(prev);
                                                          next.add(c.classId);
                                                          return next;
                                                        });
                                                      }
                                                    }}
                                                    className="rounded"
                                                  />
                                                  <span className="truncate">{formatSubjectLabel(s, isRTL)}</span>
                                                </label>
                                                {isSelected && (
                                                  <div className="flex items-center gap-1">
                                                    <input
                                                      type="number"
                                                      min={0}
                                                      max={50}
                                                      value={entry!.periods || ""}
                                                      placeholder="0"
                                                      onChange={(e) => {
                                                        const val = parseInt(e.target.value, 10) || 0;
                                                        setClassSubjects((prev) => {
                                                          const current = prev[c.classId] || [];
                                                          return {
                                                            ...prev,
                                                            [c.classId]: current.map((x) =>
                                                              x.name === s.nameEn ? { ...x, periods: val } : x
                                                            ),
                                                          };
                                                        });
                                                      }}
                                                      className="w-12 h-6 rounded border bg-background px-1 text-xs text-center"
                                                      onClick={(e) => e.stopPropagation()}
                                                    />
                                                    <button
                                                      type="button"
                                                      onClick={() => removeSubjectForClass(c.classId, s.nameEn)}
                                                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                                    >
                                                      <X className="h-3 w-3" />
                                                    </button>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
