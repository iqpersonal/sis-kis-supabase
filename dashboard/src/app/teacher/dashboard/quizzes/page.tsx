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
  HelpCircle, Plus, Pencil, Trash2, Loader2, Search, BookOpen, Star,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────── */

interface Option {
  label: string;
  text: string;
  text_ar?: string;
}

interface Question {
  id: string;
  text: string;
  text_ar?: string;
  type: "mcq";
  subject: string;
  class_code: string;
  difficulty: number;
  options: Option[];
  correct_option: string;
  explanation?: string;
  standard?: string;
  created_by: string;
  year: string;
  created_at?: any;
}

/* ─── Helpers ────────────────────────────────────────────────── */

const DIFFICULTIES = [
  { value: "1", label: "1 — Very Easy", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" },
  { value: "2", label: "2 — Easy", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300" },
  { value: "3", label: "3 — Medium", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300" },
  { value: "4", label: "4 — Hard", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300" },
  { value: "5", label: "5 — Very Hard", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300" },
];

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

const EMPTY_QUESTION = {
  text: "",
  text_ar: "",
  subject: "",
  class_code: "",
  difficulty: 3,
  options: [
    { label: "A", text: "", text_ar: "" },
    { label: "B", text: "", text_ar: "" },
    { label: "C", text: "", text_ar: "" },
    { label: "D", text: "", text_ar: "" },
  ],
  correct_option: "",
  explanation: "",
  standard: "",
  year: "25-26",
};

/* ─── Page ───────────────────────────────────────────────────── */

export default function QuestionBankPage() {
  const { teacher } = useTeacherAuth();
  const { t, isRTL: rtl } = useLanguage();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterDifficulty, setFilterDifficulty] = useState("all");
  const [filterGradeBand, setFilterGradeBand] = useState("all");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY_QUESTION>({ ...EMPTY_QUESTION });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Available subjects and grade bands from teacher's questions
  const subjects = [...new Set(questions.map((q) => q.subject))].sort();
  const gradeBands = [...new Set(questions.map((q) => q.class_code))].sort();

  /* ─── Fetch ──────────────────────────────────────────────── */

  const fetchQuestions = useCallback(async () => {
    if (!teacher) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/quiz/questions?createdBy=${teacher.username}`);
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch (err) {
      console.error("Failed to fetch questions:", err);
    } finally {
      setLoading(false);
    }
  }, [teacher]);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  /* ─── Save question ────────────────────────────────────── */

  const handleSave = async () => {
    if (!form.text || !form.subject || !form.class_code || !form.correct_option) {
      alert("Please fill all required fields: Question text, Subject, Class, and Correct answer.");
      return;
    }
    if (form.options.some((o) => !o.text)) {
      alert("Please fill all option texts.");
      return;
    }
    setSaving(true);
    try {
      const payload = editingId
        ? { action: "update", questionId: editingId, updates: { ...form, created_by: teacher!.username } }
        : { action: "create", question: { ...form, created_by: teacher!.username, type: "mcq" } };

      const res = await fetch("/api/quiz/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to save");
        return;
      }

      setDialogOpen(false);
      setEditingId(null);
      setForm({ ...EMPTY_QUESTION });
      fetchQuestions();
    } catch (err) {
      alert("Network error");
    } finally {
      setSaving(false);
    }
  };

  /* ─── Delete question ─────────────────────────────────── */

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch("/api/quiz/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", questionId: deleteId }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to delete");
        return;
      }
      setDeleteId(null);
      fetchQuestions();
    } catch {
      alert("Network error");
    }
  };

  /* ─── Open edit dialog ────────────────────────────────── */

  const openEdit = (q: Question) => {
    setEditingId(q.id);
    setForm({
      text: q.text,
      text_ar: q.text_ar || "",
      subject: q.subject,
      class_code: q.class_code,
      difficulty: q.difficulty,
      options: q.options.length >= 4
        ? q.options
        : [...q.options, ...Array(4 - q.options.length).fill({ label: "", text: "", text_ar: "" })],
      correct_option: q.correct_option,
      explanation: q.explanation || "",
      standard: q.standard || "",
      year: q.year || "25-26",
    });
    setDialogOpen(true);
  };

  /* ─── Filter ──────────────────────────────────────────── */

  const filtered = questions.filter((q) => {
    if (filterSubject !== "all" && q.subject !== filterSubject) return false;
    if (filterDifficulty !== "all" && String(q.difficulty) !== filterDifficulty) return false;
    if (filterGradeBand !== "all" && q.class_code !== filterGradeBand) return false;
    if (search) {
      const s = search.toLowerCase();
      return q.text.toLowerCase().includes(s) || q.subject.toLowerCase().includes(s);
    }
    return true;
  });

  /* ─── KPI ─────────────────────────────────────────────── */

  const totalQ = questions.length;
  const avgDiff = totalQ > 0
    ? (questions.reduce((s, q) => s + q.difficulty, 0) / totalQ).toFixed(1)
    : "0";
  const subjectCount = subjects.length;

  const diffColor = (d: number) =>
    DIFFICULTIES[d - 1]?.color || "bg-muted text-muted-foreground";

  /* ─── Render ──────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HelpCircle className="h-6 w-6 text-blue-600" />
            Question Bank
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage quiz questions for your classes
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingId(null);
            setForm({ ...EMPTY_QUESTION });
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Question
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Questions</CardDescription>
            <CardTitle className="text-3xl">{totalQ}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg. Difficulty</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              {avgDiff}
              <Star className="h-5 w-5 text-yellow-500" />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Subjects Covered</CardDescription>
            <CardTitle className="text-3xl">{subjectCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search questions…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={filterSubject} onValueChange={setFilterSubject}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subjects</SelectItem>
                {SUBJECTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterGradeBand} onValueChange={setFilterGradeBand}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Grade Band" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Grade Bands</SelectItem>
                {GRADE_BANDS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                {DIFFICULTIES.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Questions Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <HelpCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No questions yet</p>
              <p className="text-sm">Click "New Question" to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50%]">Question</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Grade Band</TableHead>
                  <TableHead>Difficulty</TableHead>
                  <TableHead>Answer</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium max-w-xs truncate">
                      {q.text}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{q.subject}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {GRADE_BANDS.find((g) => g.value === q.class_code)?.label || q.class_code}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={diffColor(q.difficulty)}>
                        {q.difficulty}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{q.correct_option}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(q)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => setDeleteId(q.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ─── Create / Edit Dialog ───────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Question" : "New Question"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Question text */}
            <div>
              <Label>Question Text (English) *</Label>
              <textarea
                className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.text}
                onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
                placeholder="What is the value of x if 2x + 3 = 7?"
              />
            </div>
            <div>
              <Label>Question Text (Arabic)</Label>
              <textarea
                className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm min-h-[60px] focus:outline-none focus:ring-2 focus:ring-ring"
                dir="rtl"
                value={form.text_ar}
                onChange={(e) => setForm((f) => ({ ...f, text_ar: e.target.value }))}
              />
            </div>

            {/* Subject / Class / Difficulty / Year */}
            <div className="grid grid-cols-2 gap-3">
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
                <Label>Difficulty *</Label>
                <Select
                  value={String(form.difficulty)}
                  onValueChange={(v) => setForm((f) => ({ ...f, difficulty: parseInt(v) }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Year</Label>
                <Input
                  value={form.year}
                  onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                  placeholder="25-26"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Options */}
            <div>
              <Label>Answer Options *</Label>
              <div className="space-y-2 mt-2">
                {form.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Badge
                      variant={form.correct_option === opt.label ? "default" : "outline"}
                      className="cursor-pointer min-w-[32px] justify-center"
                      onClick={() => setForm((f) => ({ ...f, correct_option: opt.label }))}
                    >
                      {opt.label}
                    </Badge>
                    <Input
                      value={opt.text}
                      onChange={(e) => {
                        const newOpts = [...form.options];
                        newOpts[i] = { ...newOpts[i], text: e.target.value };
                        setForm((f) => ({ ...f, options: newOpts }));
                      }}
                      placeholder={`Option ${opt.label}`}
                      className="flex-1"
                    />
                    <Input
                      value={opt.text_ar || ""}
                      onChange={(e) => {
                        const newOpts = [...form.options];
                        newOpts[i] = { ...newOpts[i], text_ar: e.target.value };
                        setForm((f) => ({ ...f, options: newOpts }));
                      }}
                      placeholder="عربي"
                      className="w-32"
                      dir="rtl"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Click a letter badge to mark it as the correct answer
              </p>
            </div>

            {/* Explanation */}
            <div>
              <Label>Explanation (shown after answering)</Label>
              <textarea
                className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm min-h-[60px] focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.explanation}
                onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
                placeholder="Explain why this is the correct answer…"
              />
            </div>

            {/* Standard */}
            <div>
              <Label>Curriculum Standard (optional)</Label>
              <Input
                value={form.standard}
                onChange={(e) => setForm((f) => ({ ...f, standard: e.target.value }))}
                placeholder="e.g. CCSS.MATH.6.RP.A.1"
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ───────────────────────────── */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Question?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This action cannot be undone. The question will be permanently removed.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
