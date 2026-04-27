"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import { useAuth } from "@/context/auth-context";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  HelpCircle, ClipboardList, Users, BarChart3, Loader2,
  Trophy, Clock, FileText, Plus, XCircle,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";

/* ─── Types ──────────────────────────────────────────────────── */

/* NWEA-style grade bands */
const GRADE_BANDS: Record<string, string> = {
  "pre-k": "Pre-K (Ages 3–5)",
  "k-2": "K–2 (Ages 5–8)",
  "3-5": "3–5 (Ages 8–11)",
  "6-8": "6–8 (Ages 11–14)",
  "9-12": "9–12 (Ages 14–18)",
};

/** Map a grade name like "Grade 7" to its NWEA band code ("6-8"). */
function gradeNameToBand(name: string): string {
  const m = name.match(/(\d+)/);
  if (!m) return "";
  const n = parseInt(m[1], 10);
  if (n <= 0) return "pre-k";
  if (n <= 2) return "k-2";
  if (n <= 5) return "3-5";
  if (n <= 8) return "6-8";
  return "9-12";
}

/** Reverse: band code → human-readable grade range label (for old assignments without class_name). */
function bandToGradeLabel(code: string): string {
  const labels: Record<string, string> = {
    "pre-k": "Pre-K",
    "k-2": "KG – Grade 2",
    "3-5": "Grade 3 – 5",
    "6-8": "Grade 6 – 8",
    "9-12": "Grade 9 – 12",
  };
  return labels[code] || code;
}

interface Assignment {
  id: string;
  title: string;
  subject: string;
  class_code: string;
  class_name?: string;
  section?: string;
  question_ids: string[];
  year: string;
  status: string;
  adaptive: boolean;
  duration_minutes: number;
  created_by: string;
  sis_school?: string;
  stats?: { started: number; completed: number; avg_score: number };
  created_at?: any;
}

interface Result {
  id: string;
  student_id: string;
  student_name?: string;
  assignment_id: string;
  score: number;
  total: number;
  percentage: number;
  mastery: string;
}

interface AssignedClass {
  classId: string;
  className: string;
  section: string;
  year: string;
  campus: string;
  subject?: string;
}

interface QuestionOption {
  id: string;
  text: string;
  subject: string;
  class_code: string;
  difficulty: number;
}

/* ─── Page ───────────────────────────────────────────────────── */

export default function QuizzesPage() {
  const { t } = useLanguage();
  const { user, role, can } = useAuth();
  const { selectedYear, selectedLabel } = useAcademicYear();
  const { schoolFilter, schoolLabel } = useSchoolFilter();

  const isTeacher = role === "teacher";
  const canManage = can("quizzes.manage");
  const userEmail = user?.email || "";

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [questions, setQuestions] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");

  // Teacher's assigned classes (loaded from admin_users doc)
  const [assignedClasses, setAssignedClasses] = useState<AssignedClass[]>([]);

  // Create assignment dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createSubject, setCreateSubject] = useState("");
  const [createClassCode, setCreateClassCode] = useState("");
  const [createSection, setCreateSection] = useState("all");
  const [createDuration, setCreateDuration] = useState("40");
  const [availableQuestions, setAvailableQuestions] = useState<QuestionOption[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState("");

  /* ─── Load teacher's assigned classes ──────────────────── */

  useEffect(() => {
    if (!user?.uid || !isTeacher) return;
    (async () => {
      try {
        const supabase = getSupabase();
        const { data } = await supabase
          .from("admin_users")
          .select("assigned_classes")
          .eq("id", user.uid)
          .maybeSingle();
        if (data) setAssignedClasses((data as Record<string, unknown>).assigned_classes as AssignedClass[] || []);
      } catch {
        // ignore
      }
    })();
  }, [user?.uid, isTeacher]);

  /* ─── Fetch ──────────────────────────────────────────────── */

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const targetYear = selectedYear || "25-26";

      // Fetch assignments
      const aParams = new URLSearchParams({ year: targetYear, limit: "500" });
      if (isTeacher && userEmail) aParams.set("teacher", userEmail);
      const aRes = await fetch(`/api/quiz/assignments?${aParams}`);
      const aJson = await aRes.json();
      let aData: Assignment[] = (aJson.assignments || []) as Assignment[];
      if (schoolFilter !== "all") {
        aData = aData.filter((a) => !a.sis_school || a.sis_school === schoolFilter);
      }
      setAssignments(aData);

      // Fetch question count
      const qParams = new URLSearchParams({ year: targetYear, limit: "2000" });
      if (isTeacher && userEmail) qParams.set("createdBy", userEmail);
      const qRes = await fetch(`/api/quiz/questions?${qParams}`);
      const qJson = await qRes.json();
      setQuestions((qJson.questions || []).length);

      // Fetch results scoped to loaded assignments
      const assignmentIds = aData.map((a) => a.id).filter(Boolean);
      if (assignmentIds.length > 0) {
        const rRes = await fetch(`/api/quiz/results?year=${targetYear}&assignments=${assignmentIds.join(",")}`);
        const rJson = await rRes.json();
        setResults((rJson.results || []) as Result[]);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error("Failed to load quiz data:", err);
    } finally {
      setLoading(false);
    }
  }, [isTeacher, userEmail, selectedYear, schoolFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ─── Load questions for class selection in create dialog ── */

  // Resolve selected class name to NWEA band code for question lookup
  const createBandCode = gradeNameToBand(createClassCode) || createClassCode;

  useEffect(() => {
    if (!createBandCode || !createOpen) return;
    setQuestionsLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams({
          class: createBandCode,
          year: selectedYear || "25-26",
          limit: "500",
        });
        const res = await fetch(`/api/quiz/questions?${params}`);
        const json = await res.json();
        setAvailableQuestions(
          (json.questions || []).map((q: Record<string, unknown>) => ({
            id: String(q.id || ""),
            text: String(q.text || ""),
            subject: String(q.subject || ""),
            class_code: String(q.class_code || ""),
            difficulty: Number(q.difficulty) || 3,
          }))
        );
      } catch {
        setAvailableQuestions([]);
      } finally {
        setQuestionsLoading(false);
      }
    })();
  }, [createBandCode, createOpen, selectedYear]);

  // Filter available questions by subject
  const matchingQuestions = createSubject
    ? availableQuestions.filter((q) => q.subject === createSubject)
    : availableQuestions;

  // Unique subjects from available questions
  const questionSubjects = [...new Set(availableQuestions.map((q) => q.subject))].sort();

  // Difficulty breakdown for info display
  const difficultyBreakdown = matchingQuestions.reduce((acc, q) => {
    acc[q.difficulty] = (acc[q.difficulty] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  /* ─── Create assignment handler ──────────────────────────── */

  async function handleCreateAssignment() {
    if (!createTitle.trim() || !createClassCode || !createSubject) {
      setCreateError("Title, class, and subject are required.");
      return;
    }
    if (matchingQuestions.length === 0) {
      setCreateError("No questions available for this class and subject.");
      return;
    }
    setCreateSaving(true);
    setCreateError("");
    try {
      // Resolve SIS class/section codes from the selected assigned class
      let sisClassCode = "";
      let sisSectionCode = "";
      let sisSchool = "";

      if (isTeacher) {
        // Find the matching assigned class entry to get the classId (sections doc)
        const matchedClass = assignedClasses.find(
          (c) => c.className === createClassCode &&
            (createSection === "all" || c.section === createSection)
        );
        if (matchedClass?.classId) {
          try {
            const supabase = getSupabase();
            const { data: secData } = await supabase
              .from("sections")
              .select("Class_Code,class_code,Section_Code,section_code,Major_Code,major_code")
              .eq("id", matchedClass.classId)
              .maybeSingle();
            if (secData) {
              const s = secData as Record<string, unknown>;
              sisClassCode = String(s.Class_Code || s.class_code || "");
              sisSectionCode = createSection === "all" ? "" : String(s.Section_Code || s.section_code || "");
              sisSchool = String(s.Major_Code || s.major_code || "");
            }
          } catch {
            // If section lookup fails, still allow creation
          }
        }
      }

      const res = await fetch("/api/quiz/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          assignment: {
            title: createTitle.trim(),
            subject: createSubject,
            class_code: createBandCode,
            class_name: createClassCode,
            section: createSection,
            sis_class_code: sisClassCode,
            sis_section_code: sisSectionCode,
            sis_school: sisSchool,
            question_ids: matchingQuestions.map((q) => q.id),
            year: selectedYear || "25-26",
            duration_minutes: parseInt(createDuration) || 40,
            created_by: userEmail,
            adaptive: true,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create");
      }
      // Reset & close
      setCreateOpen(false);
      setCreateTitle("");
      setCreateSubject("");
      setCreateClassCode("");
      setCreateSection("all");
      setCreateDuration("40");
      fetchData();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create assignment");
    } finally {
      setCreateSaving(false);
    }
  }

  /* ─── Cancel assignment handler ──────────────────────────── */

  async function handleCancelAssignment(assignmentId: string) {
    try {
      const res = await fetch("/api/quiz/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", assignmentId }),
      });
      if (res.ok) {
        fetchData();
      } else {
        alert("Failed to cancel assignment");
      }
    } catch {
      alert("Network error — please try again");
    }
  }

  /* ─── Compute KPIs ──────────────────────────────────────── */

  const totalAssignments = assignments.length;
  const activeAssignments = assignments.filter((a) => a.status === "active").length;
  const totalAttempts = results.length;
  const avgScore = totalAttempts > 0
    ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / totalAttempts)
    : 0;
  const masteryDist = results.reduce((acc, r) => {
    acc[r.mastery] = (acc[r.mastery] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const teachers = [...new Set(assignments.map((a) => a.created_by))];

  const filtered = filterStatus === "all"
    ? assignments
    : assignments.filter((a) => a.status === filterStatus);

  const scopedAssignedClasses = assignedClasses.filter((assigned) => {
    if (selectedYear && assigned.year && assigned.year !== selectedYear) return false;
    if (schoolFilter !== "all") {
      const mappedCampus = assigned.campus === "Boys" ? "0021-01" : assigned.campus === "Girls" ? "0021-02" : "";
      if (mappedCampus && mappedCampus !== schoolFilter) return false;
    }
    return true;
  });

  // Derive unique class codes from teacher's assigned classes
  const teacherClassCodes = [...new Set(scopedAssignedClasses.map((c) => c.className))];
  // Derive teacher's assigned subjects
  const teacherSubjects = [...new Set(scopedAssignedClasses.map((c) => c.subject).filter(Boolean))] as string[];
  // Derive sections for selected class in create dialog
  const sectionsForClass = scopedAssignedClasses
    .filter((c) => c.className === createClassCode)
    .map((c) => c.section);

  /* ─── Render ──────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <HelpCircle className="h-7 w-7 text-blue-600" />
            Quizzes & Assessments
          </h1>
          <p className="text-muted-foreground mt-1">
            {isTeacher ? "Your quizzes and student results" : "School-wide overview of adaptive quizzes"}
            {selectedLabel ? ` — ${selectedLabel}` : ""}
            {schoolFilter !== "all" ? ` — ${schoolLabel}` : ""}
          </p>
        </div>

        {/* Create Assignment Button (teachers with quizzes.manage permission) */}
        {canManage && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Assignment
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Quiz Assignment</DialogTitle>
                <DialogDescription>
                  {isTeacher && assignedClasses.length === 0
                    ? "No classes assigned to you yet. Please contact your admin."
                    : "Select a class and questions to assign a quiz to students."}
                </DialogDescription>
              </DialogHeader>

              {isTeacher && assignedClasses.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No assigned classes found.</p>
                  <p className="text-xs mt-1">Ask your admin to assign classes to you first.</p>
                </div>
              ) : (
                <div className="space-y-4 py-2">
                  {/* Title */}
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input
                      placeholder="e.g. Math Chapter 5 Quiz"
                      value={createTitle}
                      onChange={(e) => setCreateTitle(e.target.value)}
                    />
                  </div>

                  {/* Class selection */}
                  <div className="space-y-2">
                    <Label>Class</Label>
                    <Select value={createClassCode} onValueChange={(v) => { setCreateClassCode(v); setCreateSection("all"); setCreateSubject(""); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select class..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(isTeacher ? teacherClassCodes : Object.keys(GRADE_BANDS)).map((code) => (
                          <SelectItem key={code} value={code}>
                            {GRADE_BANDS[code] || code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Section selection (teacher only — based on assigned sections) */}
                  {isTeacher && sectionsForClass.length > 0 && (
                    <div className="space-y-2">
                      <Label>Section</Label>
                      <Select value={createSection} onValueChange={setCreateSection}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Sections</SelectItem>
                          {sectionsForClass.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Subject (required — determines adaptive question pool) */}
                  <div className="space-y-2">
                    <Label>Subject *</Label>
                    {!createClassCode ? (
                      <p className="text-sm text-muted-foreground">Select a class first</p>
                    ) : questionsLoading ? (
                      <div className="flex items-center gap-2 py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Loading subjects...</span>
                      </div>
                    ) : (() => {
                      // Show teacher's assigned subjects that also have questions in the pool
                      const poolSubjects = isTeacher && teacherSubjects.length > 0
                        ? questionSubjects.filter((s) => teacherSubjects.includes(s))
                        : questionSubjects;
                      return poolSubjects.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No subjects available for this grade.
                          {isTeacher && teacherSubjects.length > 0 && " Your assigned subjects don't have questions in this grade band."}
                        </p>
                      ) : (
                        <Select value={createSubject} onValueChange={setCreateSubject}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select subject..." />
                          </SelectTrigger>
                          <SelectContent>
                            {poolSubjects.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    })()}
                  </div>

                  {/* Duration & Adaptive */}
                  {/* Duration */}
                  <div className="space-y-2">
                    <Label>Duration (minutes)</Label>
                    <Input
                      type="number"
                      min="5"
                      max="120"
                      value={createDuration}
                      onChange={(e) => setCreateDuration(e.target.value)}
                    />
                  </div>

                  {/* Question Pool Info */}
                  <div className="space-y-2">
                    <Label>Question Pool (Adaptive)</Label>
                    {!createClassCode || !createSubject ? (
                      <p className="text-sm text-muted-foreground">Select a class and subject to see the question pool.</p>
                    ) : questionsLoading ? (
                      <div className="flex items-center gap-2 py-3">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Checking question pool...</span>
                      </div>
                    ) : matchingQuestions.length === 0 ? (
                      <div className="border rounded-md p-3 bg-red-50 dark:bg-red-950/20">
                        <p className="text-sm text-red-600 dark:text-red-400">
                          No questions available for {createSubject} in this grade band.
                        </p>
                      </div>
                    ) : (
                      <div className="border rounded-md p-3 bg-green-50 dark:bg-green-950/20 space-y-2">
                        <p className="text-sm font-medium text-green-800 dark:text-green-300">
                          {matchingQuestions.length} questions available
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {[1, 2, 3, 4, 5].map((d) => (
                            difficultyBreakdown[d] ? (
                              <Badge key={d} variant="secondary" className="text-xs">
                                Level {d}: {difficultyBreakdown[d]}
                              </Badge>
                            ) : null
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          The system will adaptively select questions based on each student&apos;s ability level — starting at medium difficulty and adjusting up or down.
                        </p>
                      </div>
                    )}
                  </div>

                  {createError && (
                    <p className="text-sm text-red-600">{createError}</p>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleCreateAssignment}
                  disabled={createSaving || matchingQuestions.length === 0 || !createTitle.trim() || !createSubject}
                >
                  {createSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Create Assignment
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{isTeacher ? "My Questions" : "Question Bank"}</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-blue-500" />
              {questions}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{isTeacher ? "My Assignments" : "Assignments"}</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-purple-500" />
              {totalAssignments}
              {activeAssignments > 0 && (
                <Badge className="ml-2 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                  {activeAssignments} active
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Student Attempts</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-500" />
              {totalAttempts}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Score</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              {avgScore}%
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Mastery Distribution */}
      {totalAttempts > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Mastery Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6 flex-wrap">
              {[
                { key: "excellent", label: "Excellent (≥90%)", color: "bg-green-500" },
                { key: "proficient", label: "Proficient (75–89%)", color: "bg-blue-500" },
                { key: "developing", label: "Developing (60–74%)", color: "bg-yellow-500" },
                { key: "needs_improvement", label: "Needs Improvement (<60%)", color: "bg-red-500" },
              ].map(({ key, label, color }) => {
                const count = masteryDist[key] || 0;
                const pct = totalAttempts > 0 ? Math.round((count / totalAttempts) * 100) : 0;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded ${color}`} />
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-lg font-bold">{count} <span className="text-sm text-muted-foreground">({pct}%)</span></p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assignments Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{isTeacher ? "My Assignments" : "All Assignments"}</CardTitle>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>{isTeacher ? "You haven't created any assignments yet" : "No assignments found"}</p>
              {isTeacher && canManage && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Assignment
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Class / Section</TableHead>
                  <TableHead>Questions</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Adaptive</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  {canManage && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.title}</TableCell>
                    <TableCell><Badge variant="outline">{a.subject}</Badge></TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {a.class_name || bandToGradeLabel(a.class_code)}
                      </span>
                      <span className="text-muted-foreground">
                        {" / "}{a.section && a.section !== "all" ? a.section : "All Sections"}
                      </span>
                    </TableCell>
                    <TableCell>{a.question_ids?.length || 0}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />{a.duration_minutes}m
                      </span>
                    </TableCell>
                    <TableCell>
                      {a.adaptive ? (
                        <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300">Adaptive</Badge>
                      ) : (
                        <Badge variant="secondary">Fixed</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        a.status === "active" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" :
                        a.status === "completed" ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" :
                        a.status === "cancelled" ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300" :
                        "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
                      }>
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {a.stats ? (
                        <span>{a.stats.completed}/{a.stats.started} done, avg {a.stats.avg_score}%</span>
                      ) : "—"}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        {a.status === "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleCancelAssignment(a.id)}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Cancel
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
