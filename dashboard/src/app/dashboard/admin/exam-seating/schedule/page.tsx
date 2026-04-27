"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { useAcademicYear } from "@/context/academic-year-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
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
  CalendarDays,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  ChevronDown,
  Pencil,
  X,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";

/* ── Types ──────────────────────────────────────────────────── */
interface ExamDay {
  date: string;
  subjectCode: string;
  subjectName: string;
}

interface Schedule {
  id: string;
  academicYear: string;
  examType: string;
  gradeGroup: string;
  days: ExamDay[];
  status: string;
  createdAt: string;
}

interface SubjectInfo {
  code: string;
  nameEn: string;
  nameAr: string;
}

/* ── Page ───────────────────────────────────────────────────── */
export default function ExamSchedulePage() {
  const { user } = useAuth();
  const { isRTL } = useLanguage();
  const { selectedYear } = useAcademicYear();

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Editor state
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [examType, setExamType] = useState("T1");
  const [gradeGroup, setGradeGroup] = useState("junior");
  const [days, setDays] = useState<ExamDay[]>([]);
  const [saving, setSaving] = useState(false);

  async function getAuthHeaders() {
    const { data: { session } } = await getSupabase().auth.getSession();
    const token = session?.access_token;
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const [schedRes, subRes] = await Promise.all([
        fetch(`/api/admin/exam-seating/schedule?year=${selectedYear}`, { headers }),
        fetch(`/api/admin/users/assign-classes?year=${selectedYear}&subjects=1`, { headers }),
      ]);

      if (schedRes.ok) {
        const data = await schedRes.json();
        setSchedules(data.schedules || []);
      }
      if (subRes.ok) {
        const data = await subRes.json();
        setSubjects(data.subjects || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) loadData();
  }, [user, selectedYear]);

  function startNew() {
    setEditId(null);
    setExamType("T1");
    setGradeGroup("junior");
    setDays([{ date: "", subjectCode: "", subjectName: "" }]);
    setEditing(true);
    setSuccessMsg(null);
  }

  function startEdit(schedule: Schedule) {
    setEditId(schedule.id);
    setExamType(schedule.examType);
    setGradeGroup(schedule.gradeGroup);
    setDays([...schedule.days]);
    setEditing(true);
    setSuccessMsg(null);
  }

  function addDay() {
    setDays((prev) => [...prev, { date: "", subjectCode: "", subjectName: "" }]);
  }

  function removeDay(index: number) {
    setDays((prev) => prev.filter((_, i) => i !== index));
  }

  function updateDay(index: number, field: keyof ExamDay, value: string) {
    setDays((prev) =>
      prev.map((d, i) => {
        if (i !== index) return d;
        if (field === "subjectName") {
          // Also set the code from subjects list
          const subject = subjects.find((s) => s.nameEn === value);
          return { ...d, subjectName: value, subjectCode: subject?.code || "" };
        }
        return { ...d, [field]: value };
      })
    );
  }

  async function handleSave() {
    // Validate
    const validDays = days.filter((d) => d.date && d.subjectName);
    if (validDays.length === 0) {
      setError("Add at least one exam day with date and subject");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      if (editId) {
        await fetch("/api/admin/exam-seating/schedule", {
          method: "PUT",
          headers,
          body: JSON.stringify({
            id: editId,
            examType,
            gradeGroup,
            days: validDays,
          }),
        });
      } else {
        await fetch("/api/admin/exam-seating/schedule", {
          method: "POST",
          headers,
          body: JSON.stringify({
            academicYear: selectedYear,
            examType,
            gradeGroup,
            days: validDays,
          }),
        });
      }
      setEditing(false);
      setSuccessMsg("Schedule saved successfully!");
      await loadData();
    } catch {
      setError("Failed to save schedule");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this exam schedule?")) return;
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/admin/exam-seating/schedule", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ id }),
      });
      await loadData();
    } catch {
      setError("Failed to delete schedule");
    }
  }

  const gradeGroupLabels: Record<string, string> = {
    junior: "Junior School (Gr 4–8)",
    high: "High School (Gr 9–12)",
    all: "All Grades (4–12)",
  };

  return (
    <div className="space-y-6" dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6" />
            Exam Schedule
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure exam timetable — date and subject for each exam day
          </p>
        </div>
        {!editing && (
          <Button onClick={startNew} className="gap-2">
            <Plus className="h-4 w-4" />
            New Schedule
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm px-4 py-2 rounded-md">{error}</div>
      )}
      {successMsg && (
        <div className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 text-sm px-4 py-2 rounded-md flex items-center gap-2">
          ✓ {successMsg}
        </div>
      )}

      {/* Editor */}
      {editing && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {editId ? "Edit Schedule" : "New Exam Schedule"} — {selectedYear}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Exam Type & Grade Group */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Exam Type</label>
                <select
                  value={examType}
                  onChange={(e) => setExamType(e.target.value)}
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="T1">T1 Final Exam</option>
                  <option value="T2">T2 Final Exam</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Grade Group</label>
                <select
                  value={gradeGroup}
                  onChange={(e) => setGradeGroup(e.target.value)}
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="junior">Junior School (Gr 4–8)</option>
                  <option value="high">High School (Gr 9–12)</option>
                  <option value="all">All Grades (4–12)</option>
                </select>
              </div>
            </div>

            {/* Days Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Exam Days</label>
                <Button variant="outline" size="sm" onClick={addDay} className="gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  Add Day
                </Button>
              </div>

              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold w-12">#</TableHead>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Subject</TableHead>
                      <TableHead className="font-semibold w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {days.map((day, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={day.date}
                            onChange={(e) => updateDay(i, "date", e.target.value)}
                            className="h-8 text-sm w-auto"
                          />
                        </TableCell>
                        <TableCell>
                          <select
                            value={day.subjectName}
                            onChange={(e) => updateDay(i, "subjectName", e.target.value)}
                            className="h-8 rounded-md border bg-background px-2 text-sm w-full max-w-[250px]"
                          >
                            <option value="">— Select Subject —</option>
                            {subjects.map((s) => (
                              <option key={s.code} value={s.nameEn}>
                                {s.nameEn}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell>
                          {days.length > 1 && (
                            <button
                              onClick={() => removeDay(i)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save Schedule"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Schedules */}
      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : schedules.length === 0 && !editing ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No exam schedules for {selectedYear}. Click &quot;New Schedule&quot; to create one.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {schedules.map((schedule) => (
            <Card key={schedule.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">
                      {schedule.examType === "T1" ? "T1 Final Exam" : "T2 Final Exam"}
                    </CardTitle>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                      {gradeGroupLabels[schedule.gradeGroup] || schedule.gradeGroup}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      schedule.status === "finalized"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                        : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                    }`}>
                      {schedule.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(schedule)}
                      className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(schedule.id)}
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold w-12">#</TableHead>
                        <TableHead className="font-semibold">Date</TableHead>
                        <TableHead className="font-semibold">Subject</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schedule.days.map((day, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">{day.date}</TableCell>
                          <TableCell>{day.subjectName}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {schedule.days.length} exam days
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
