"use client";

import { useEffect, useState, useCallback } from "react";
import { useTeacherAuth } from "@/context/teacher-auth-context";
import { useLanguage } from "@/context/language-context";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList, Plus, Eye, XCircle, Loader2, FileText,
  Clock, Users, CheckCircle2, AlertCircle,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────── */

interface Question {
  id: string;
  text: string;
  subject: string;
  class_code: string;
  difficulty: number;
}

interface Assignment {
  id: string;
  title: string;
  title_ar?: string;
  subject: string;
  class_code: string;
  section?: string;
  question_ids: string[];
  year: string;
  start_date: string;
  end_date: string;
  duration_minutes: number;
  adaptive: boolean;
  status: string;
  created_by: string;
  stats?: { started: number; completed: number; avg_score: number };
  created_at?: any;
}

/* ─── Helpers ────────────────────────────────────────────────── */

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  completed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

/* NWEA-style grade bands & subjects */
const GRADE_BANDS = [
  { value: "pre-k", label: "Pre-K (Ages 3–5)" },
  { value: "k-2", label: "K–2 (Ages 5–8)" },
  { value: "3-5", label: "3–5 (Ages 8–11)" },
  { value: "6-8", label: "6–8 (Ages 11–14)" },
  { value: "9-12", label: "9–12 (Ages 14–18)" },
];

const SUBJECTS = [
  { value: "Mathematics", label: "Mathematics" },
  { value: "Reading", label: "Reading" },
  { value: "Language Usage", label: "Language Usage" },
  { value: "Science", label: "Science" },
  { value: "General Knowledge", label: "General Knowledge" },
];

/* ─── Page ───────────────────────────────────────────────────── */

export default function QuizAssignPage() {
  const { teacher } = useTeacherAuth();
  const { t } = useLanguage();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    title_ar: "",
    subject: "",
    class_code: "",
    section: "",
    duration_minutes: 40,
    adaptive: true,
    start_date: "",
    end_date: "",
    year: "25-26",
    selectedIds: [] as string[],
  });

  // Question picker filter
  const [qFilterSubject, setQFilterSubject] = useState("all");
  const [qFilterClass, setQFilterClass] = useState("all");

  /* ─── Fetch ──────────────────────────────────────────────── */

  const fetchData = useCallback(async () => {
    if (!teacher) return;
    setLoading(true);
    try {
      const [aRes, qRes] = await Promise.all([
        fetch(`/api/quiz/assignments?teacher=${teacher.username}&year=25-26`),
        fetch(`/api/quiz/questions?createdBy=${teacher.username}`),
      ]);
      const aData = await aRes.json();
      const qData = await qRes.json();
      setAssignments(aData.assignments || []);
      setQuestions(qData.questions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [teacher]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ─── Derived ────────────────────────────────────────────── */

  const subjects = [...new Set(questions.map((q) => q.subject))].sort();
  const classes = [...new Set(questions.map((q) => q.class_code))].sort();

  const filteredQuestions = questions.filter((q) => {
    if (qFilterSubject !== "all" && q.subject !== qFilterSubject) return false;
    if (qFilterClass !== "all" && q.class_code !== qFilterClass) return false;
    return true;
  });

  /* ─── Save Assignment ───────────────────────────────────── */

  const handleSave = async () => {
    if (!form.title || !form.subject || !form.class_code || form.selectedIds.length === 0) {
      alert("Please fill Title, Subject, Class, and select at least 1 question.");
      return;
    }
    if (!form.start_date || !form.end_date) {
      alert("Please set start and end dates.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/quiz/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          assignment: {
            title: form.title,
            title_ar: form.title_ar,
            subject: form.subject,
            class_code: form.class_code,
            section: form.section || undefined,
            question_ids: form.selectedIds,
            year: form.year,
            start_date: form.start_date,
            end_date: form.end_date,
            duration_minutes: form.duration_minutes,
            adaptive: form.adaptive,
            created_by: teacher!.username,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to create");
        return;
      }
      setDialogOpen(false);
      fetchData();
    } catch {
      alert("Network error");
    } finally {
      setSaving(false);
    }
  };

  /* ─── Cancel Assignment ─────────────────────────────────── */

  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this quiz assignment?")) return;
    try {
      await fetch("/api/quiz/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", assignmentId: id }),
      });
      fetchData();
    } catch {
      alert("Failed to cancel");
    }
  };

  /* ─── Toggle question ───────────────────────────────────── */

  const toggleQuestion = (id: string) => {
    setForm((f) => ({
      ...f,
      selectedIds: f.selectedIds.includes(id)
        ? f.selectedIds.filter((x) => x !== id)
        : [...f.selectedIds, id],
    }));
  };

  /* ─── KPI ─────────────────────────────────────────────────── */

  const active = assignments.filter((a) => a.status === "active").length;
  const completed = assignments.filter((a) => a.status === "completed").length;
  const totalStarted = assignments.reduce((s, a) => s + (a.stats?.started || 0), 0);

  /* ─── Render ──────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-purple-600" />
            Quiz Assignments
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Assign quizzes to your classes and track student progress
          </p>
        </div>
        <Button onClick={() => {
          setForm({
            title: "", title_ar: "", subject: "", class_code: "", section: "",
            duration_minutes: 40, adaptive: true, start_date: "", end_date: "",
            year: "25-26", selectedIds: [],
          });
          setDialogOpen(true);
        }}>
          <Plus className="h-4 w-4 mr-2" />
          New Assignment
        </Button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Quizzes</CardDescription>
            <CardTitle className="text-3xl text-green-600">{active}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-3xl text-blue-600">{completed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Attempts</CardDescription>
            <CardTitle className="text-3xl">{totalStarted}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Assignments List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Assignments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : assignments.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No assignments yet</p>
              <p className="text-sm">Create your first quiz assignment</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Questions</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.title}</TableCell>
                    <TableCell><Badge variant="outline">{a.subject}</Badge></TableCell>
                    <TableCell>
                      {GRADE_BANDS.find((g) => g.value === a.class_code)?.label || a.class_code}
                      {a.section ? `/${a.section}` : ""}
                    </TableCell>
                    <TableCell>{a.question_ids.length}</TableCell>
                    <TableCell className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />{a.duration_minutes}m
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.start_date?.slice(0, 10)} → {a.end_date?.slice(0, 10)}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[a.status] || ""}>
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.stats ? (
                        <span>{a.stats.completed}/{a.stats.started} done, avg {a.stats.avg_score}%</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {a.status === "active" && (
                        <Button size="icon" variant="ghost" className="text-red-500" onClick={() => handleCancel(a.id)}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ─── Create Dialog ──────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Quiz Assignment</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Title */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Title (English) *</Label>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="mt-1" placeholder="Chapter 5 Quiz" />
              </div>
              <div>
                <Label>Title (Arabic)</Label>
                <Input value={form.title_ar} onChange={(e) => setForm((f) => ({ ...f, title_ar: e.target.value }))} className="mt-1" dir="rtl" />
              </div>
            </div>

            {/* Subject, Grade Band, Section */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Subject *</Label>
                <Select
                  value={form.subject}
                  onValueChange={(v) => setForm((f) => ({ ...f, subject: v }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Grade Band *</Label>
                <Select
                  value={form.class_code}
                  onValueChange={(v) => setForm((f) => ({ ...f, class_code: v }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select grade band" />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADE_BANDS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Section</Label>
                <Input value={form.section} onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))} className="mt-1" placeholder="A" />
              </div>
            </div>

            {/* Duration, Adaptive, Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date *</Label>
                <Input type="datetime-local" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>End Date *</Label>
                <Input type="datetime-local" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Duration (minutes)</Label>
                <Input type="number" min={5} max={120} value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: parseInt(e.target.value) || 40 }))} className="mt-1" />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Checkbox
                  checked={form.adaptive}
                  onCheckedChange={(c: boolean) => setForm((f) => ({ ...f, adaptive: !!c }))}
                  id="adaptive"
                />
                <label htmlFor="adaptive" className="text-sm cursor-pointer">
                  Adaptive difficulty (adjusts to student level)
                </label>
              </div>
            </div>

            {/* Question picker */}
            <div>
              <Label className="text-base font-medium">Select Questions ({form.selectedIds.length} selected)</Label>

              <div className="flex gap-2 mt-2">
                <Select value={qFilterSubject} onValueChange={setQFilterSubject}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Subject" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Subjects</SelectItem>
                    {SUBJECTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={qFilterClass} onValueChange={setQFilterClass}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Grade Band" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Grade Bands</SelectItem>
                    {GRADE_BANDS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.selectedIds.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, selectedIds: [] }))}>
                    Clear all
                  </Button>
                )}
              </div>

              <div className="border rounded-md mt-2 max-h-[250px] overflow-y-auto">
                {filteredQuestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No questions found. Create some in the Question Bank first.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]" />
                        <TableHead>Question</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Diff</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredQuestions.map((q) => (
                        <TableRow key={q.id} className="cursor-pointer" onClick={() => toggleQuestion(q.id)}>
                          <TableCell>
                            <Checkbox checked={form.selectedIds.includes(q.id)} />
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-sm">{q.text}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{q.subject}</Badge></TableCell>
                          <TableCell><Badge variant="secondary">{q.difficulty}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
