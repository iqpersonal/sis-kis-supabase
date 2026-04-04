"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CalendarDays,
  Check,
  X,
  Clock,
  ShieldCheck,
  Loader2,
  Save,
  Users,
  Search,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AttendanceStatus = "present" | "absent" | "late" | "excused" | "not-recorded";

interface StudentAttendance {
  student_number: string;
  student_name: string;
  gender: string;
  section: string;
  status: AttendanceStatus;
  note: string;
  record_id: string | null;
}

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; color: string; icon: React.ReactNode; bg: string }
> = {
  present: {
    label: "Present",
    color: "text-emerald-600",
    icon: <Check className="h-4 w-4" />,
    bg: "bg-emerald-50 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-800",
  },
  absent: {
    label: "Absent",
    color: "text-red-600",
    icon: <X className="h-4 w-4" />,
    bg: "bg-red-50 border-red-200 hover:bg-red-100 dark:bg-red-950/30 dark:border-red-800",
  },
  late: {
    label: "Late",
    color: "text-amber-600",
    icon: <Clock className="h-4 w-4" />,
    bg: "bg-amber-50 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-800",
  },
  excused: {
    label: "Excused",
    color: "text-blue-600",
    icon: <ShieldCheck className="h-4 w-4" />,
    bg: "bg-blue-50 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/30 dark:border-blue-800",
  },
  "not-recorded": {
    label: "—",
    color: "text-muted-foreground",
    icon: null,
    bg: "bg-muted/30 border-muted hover:bg-muted/50",
  },
};

/* ------------------------------------------------------------------ */
/*  Class list (TODO: could fetch dynamically)                         */
/* ------------------------------------------------------------------ */

const CLASSES = [
  { code: "01", label: "Grade 1" },
  { code: "02", label: "Grade 2" },
  { code: "03", label: "Grade 3" },
  { code: "04", label: "Grade 4" },
  { code: "05", label: "Grade 5" },
  { code: "06", label: "Grade 6" },
  { code: "07", label: "Grade 7" },
  { code: "08", label: "Grade 8" },
  { code: "09", label: "Grade 9" },
  { code: "10", label: "Grade 10" },
  { code: "11", label: "Grade 11" },
  { code: "12", label: "Grade 12" },
  { code: "KG", label: "KG" },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DailyAttendancePage() {
  const router = useRouter();
  const { selectedYear } = useAcademicYear();
  const { schoolFilter } = useSchoolFilter();

  // Form state
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [classCode, setClassCode] = useState("");
  const [sectionCode] = useState("all");

  // Data
  const [students, setStudents] = useState<StudentAttendance[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Track modifications
  const [modifications, setModifications] = useState<
    Map<string, { status: AttendanceStatus; note: string }>
  >(new Map());

  const fetchStudents = useCallback(async () => {
    if (!classCode || !date || !selectedYear) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    setModifications(new Map());
    try {
      const params = new URLSearchParams({
        date,
        classCode,
        sectionCode,
        year: selectedYear,
        school: schoolFilter || "all",
      });
      const res = await fetch(`/api/attendance?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setStudents(data.students || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load students");
    } finally {
      setLoading(false);
    }
  }, [classCode, date, selectedYear, sectionCode, schoolFilter]);

  useEffect(() => {
    if (classCode && date && selectedYear) {
      fetchStudents();
    }
  }, [classCode, date, selectedYear, fetchStudents]);

  const handleStatusChange = (studentNumber: string, status: AttendanceStatus) => {
    setModifications((prev) => {
      const next = new Map(prev);
      const existing = next.get(studentNumber);
      next.set(studentNumber, {
        status,
        note: existing?.note || "",
      });
      return next;
    });
    setSaved(false);
  };

  const handleNoteChange = (studentNumber: string, note: string) => {
    setModifications((prev) => {
      const next = new Map(prev);
      const existing = next.get(studentNumber);
      next.set(studentNumber, {
        status: existing?.status || "present",
        note,
      });
      return next;
    });
  };

  const markAllPresent = () => {
    const next = new Map<string, { status: AttendanceStatus; note: string }>();
    for (const s of students) {
      next.set(s.student_number, {
        status: "present",
        note: modifications.get(s.student_number)?.note || s.note || "",
      });
    }
    setModifications(next);
    setSaved(false);
  };

  const handleSave = async () => {
    if (modifications.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      const records = Array.from(modifications.entries()).map(
        ([sn, { status, note }]) => {
          const student = students.find((s) => s.student_number === sn);
          return {
            studentNumber: sn,
            studentName: student?.student_name || "",
            status,
            note,
          };
        }
      );

      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          classCode,
          sectionCode,
          year: selectedYear,
          school: schoolFilter || "all",
          records,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      setSaved(true);
      // Refresh to see updated statuses
      await fetchStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  };

  // Client-side search + alphabetical sort
  const filteredStudents = (searchTerm
    ? students.filter(
        (s) =>
          s.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.student_number.includes(searchTerm)
      )
    : [...students]
  ).sort((a, b) => a.student_name.localeCompare(b.student_name));

  // Stats
  const getEffectiveStatus = (s: StudentAttendance): AttendanceStatus => {
    return modifications.get(s.student_number)?.status || s.status;
  };

  const stats = {
    total: students.length,
    present: students.filter((s) => getEffectiveStatus(s) === "present").length,
    absent: students.filter((s) => getEffectiveStatus(s) === "absent").length,
    late: students.filter((s) => getEffectiveStatus(s) === "late").length,
    excused: students.filter((s) => getEffectiveStatus(s) === "excused").length,
    notRecorded: students.filter((s) => getEffectiveStatus(s) === "not-recorded")
      .length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/attendance")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-blue-500" />
            Daily Attendance
          </h1>
          <p className="text-sm text-muted-foreground">
            Record daily attendance by class. Select a date and class to begin.
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Date
              </label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-44"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Class
              </label>
              <select
                value={classCode}
                onChange={(e) => setClassCode(e.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Select class…</option>
                {CLASSES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <Button
              variant="outline"
              onClick={fetchStudents}
              disabled={!classCode || !date || loading}
            >
              <Search className="mr-2 h-4 w-4" />
              Load Students
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats bar */}
      {students.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <StatTile label="Total" value={stats.total} />
          <StatTile
            label="Present"
            value={stats.present}
            color="text-emerald-600"
          />
          <StatTile label="Absent" value={stats.absent} color="text-red-600" />
          <StatTile label="Late" value={stats.late} color="text-amber-600" />
          <StatTile
            label="Excused"
            value={stats.excused}
            color="text-blue-600"
          />
          <StatTile
            label="Not Recorded"
            value={stats.notRecorded}
            color="text-muted-foreground"
          />
        </div>
      )}

      {/* Student list */}
      {students.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Students ({filteredStudents.length})
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={markAllPresent}
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4 text-emerald-500" />
                  Mark All Present
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={modifications.size === 0 || saving}
                >
                  {saving ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : saved ? (
                    <Check className="mr-1.5 h-4 w-4" />
                  ) : (
                    <Save className="mr-1.5 h-4 w-4" />
                  )}
                  {saved ? "Saved!" : `Save (${modifications.size})`}
                </Button>
              </div>
            </div>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search students..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardHeader>
          <CardContent className="px-0 pt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs w-8">#</TableHead>
                    <TableHead className="text-xs">Student</TableHead>
                    <TableHead className="text-xs w-20">Section</TableHead>
                    <TableHead className="text-xs text-center">
                      Status
                    </TableHead>
                    <TableHead className="text-xs w-48">Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((s, i) => {
                    const currentStatus =
                      modifications.get(s.student_number)?.status || s.status;
                    const currentNote =
                      modifications.get(s.student_number)?.note ?? s.note;
                    const isModified = modifications.has(s.student_number);

                    return (
                      <TableRow
                        key={s.student_number}
                        className={isModified ? "bg-blue-50/50 dark:bg-blue-950/10" : ""}
                      >
                        <TableCell className="text-xs text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">
                              {s.student_name}
                            </p>
                            <p className="text-[11px] text-muted-foreground font-mono">
                              {s.student_number}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {s.section || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-center">
                            {(
                              ["present", "absent", "late", "excused"] as AttendanceStatus[]
                            ).map((status) => {
                              const cfg = STATUS_CONFIG[status];
                              const isActive = currentStatus === status;
                              return (
                                <button
                                  key={status}
                                  onClick={() =>
                                    handleStatusChange(s.student_number, status)
                                  }
                                  className={`flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium transition-all ${
                                    isActive
                                      ? `${cfg.bg} ${cfg.color} ring-2 ring-offset-1 ring-current`
                                      : "border-muted bg-background text-muted-foreground hover:border-current"
                                  }`}
                                  title={cfg.label}
                                >
                                  {cfg.icon}
                                  <span className="hidden sm:inline">
                                    {cfg.label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="Optional note..."
                            value={currentNote}
                            onChange={(e) =>
                              handleNoteChange(s.student_number, e.target.value)
                            }
                            className="h-7 text-xs"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading / Empty */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Loading students…</span>
        </div>
      )}

      {!loading && !error && students.length === 0 && classCode && (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <Users className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">
            No students found for this class and date.
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center py-8 gap-2 text-red-600">
          <AlertTriangle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {saved && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 rounded-lg border bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 shadow-lg text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-5 w-5" />
          Attendance saved successfully!
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function StatTile({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`text-xl font-bold mt-0.5 ${color || ""}`}>{value}</p>
    </div>
  );
}
