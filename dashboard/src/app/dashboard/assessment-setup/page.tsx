"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { PageTransition } from "@/components/motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Save,
  Copy,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import type {
  AssessmentTemplate,
  AssessmentCategory,
  SubAssessment,
  TemplateStatus,
} from "@/types/assessment";

/* ── Helpers ──────────────────────────────────────────────── */

let _idCounter = 0;
function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${++_idCounter}`;
}

function emptySubAssessment(order: number): SubAssessment {
  return { id: genId("sa"), name_en: "", name_ar: "", max_score: 20, order };
}

function emptyCategory(order: number): AssessmentCategory {
  return {
    id: genId("cat"),
    name_en: "",
    name_ar: "",
    weight: 0,
    order,
    sub_assessments: [emptySubAssessment(1)],
  };
}

/* ── Main Page ────────────────────────────────────────────── */

export default function AssessmentSetupPage() {
  const { user, can } = useAuth();
  const { t, locale } = useLanguage();
  const isRtl = locale === "ar";

  // Selection state
  const [year, setYear] = useState("");
  const [classCode, setClassCode] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [semester, setSemester] = useState<"S1" | "S2">("S1");

  // Reference data
  const [years, setYears] = useState<{ value: string; label: string }[]>([]);
  const [classes, setClasses] = useState<{ value: string; label: string }[]>([]);
  const [subjects, setSubjects] = useState<{ value: string; label: string }[]>([]);

  // Template state
  const [template, setTemplate] = useState<AssessmentTemplate | null>(null);
  const [categories, setCategories] = useState<AssessmentCategory[]>([]);
  const [status, setStatus] = useState<TemplateStatus>("draft");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  // UI state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showCopyDialog, setShowCopyDialog] = useState(false);

  // All templates for the year (for copy + overview)
  const [allTemplates, setAllTemplates] = useState<AssessmentTemplate[]>([]);

  // ── Fetch reference data ─────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const token = await user?.getIdToken();
        const headers: Record<string, string> = token
          ? { Authorization: `Bearer ${token}` }
          : {};

        const [yearRes, classRes, subjectRes] = await Promise.all([
          fetch("/api/academic-year", { headers }),
          fetch("/api/classes", { headers }),
          fetch("/api/subjects", { headers }),
        ]);

        const yearData = await yearRes.json();
        const classData = await classRes.json();
        const subjectData = await subjectRes.json();

        const yrs = (yearData.years || yearData || []).map(
          (y: { Academic_Year: string; Current_Year?: boolean }) => ({
            value: y.Academic_Year,
            label: y.Academic_Year,
            current: y.Current_Year,
          })
        );
        setYears(yrs);
        const currentYear = yrs.find((y: { current?: boolean }) => y.current);
        if (currentYear) setYear(currentYear.value);

        const cls = (classData.classes || classData || []).map(
          (c: { Class_Code: string; E_Class_Name?: string; A_Class_Name?: string }) => ({
            value: String(c.Class_Code),
            label: isRtl
              ? c.A_Class_Name || c.E_Class_Name || c.Class_Code
              : c.E_Class_Name || c.A_Class_Name || c.Class_Code,
          })
        );
        setClasses(cls);

        const subs = (subjectData.subjects || subjectData || []).map(
          (s: { Subject_Code: string; E_Subject_Name?: string; A_Subject_Name?: string }) => ({
            value: String(s.Subject_Code),
            label: isRtl
              ? s.A_Subject_Name || s.E_Subject_Name || s.Subject_Code
              : s.E_Subject_Name || s.A_Subject_Name || s.Subject_Code,
          })
        );
        setSubjects(subs);
      } catch {
        /* ignore load errors */
      }
    }
    if (user) load();
  }, [user, isRtl]);

  // ── Fetch template when selection changes ────────────────
  const fetchTemplate = useCallback(async () => {
    if (!year || !classCode || !subjectCode || !semester) {
      setTemplate(null);
      setCategories([]);
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const token = await user?.getIdToken();
      const params = new URLSearchParams({ year, classCode, subjectCode, semester });
      const res = await fetch(`/api/assessment-templates?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();

      if (data.template) {
        setTemplate(data.template);
        setCategories(data.template.categories || []);
        setStatus(data.template.status || "draft");
        // Expand all categories
        setExpandedCats(new Set((data.template.categories || []).map((c: AssessmentCategory) => c.id)));
      } else {
        setTemplate(null);
        setCategories([]);
        setStatus("draft");
        setExpandedCats(new Set());
      }
    } catch {
      setError("Failed to load template");
    }
    setLoading(false);
  }, [year, classCode, subjectCode, semester, user]);

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  // ── Fetch all templates for the year (for overview/copy) ─
  useEffect(() => {
    if (!year || !user) return;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/assessment-templates?year=${year}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setAllTemplates(data.templates || []);
      } catch {
        /* ignore */
      }
    })();
  }, [year, user, template]); // re-fetch after saves

  // ── Category CRUD ────────────────────────────────────────
  const addCategory = () => {
    const newCat = emptyCategory(categories.length + 1);
    setCategories([...categories, newCat]);
    setExpandedCats((prev) => new Set(prev).add(newCat.id));
  };

  const removeCategory = (catId: string) => {
    setCategories(categories.filter((c) => c.id !== catId));
  };

  const updateCategory = (catId: string, field: keyof AssessmentCategory, value: unknown) => {
    setCategories(
      categories.map((c) => (c.id === catId ? { ...c, [field]: value } : c))
    );
  };

  // ── Sub-Assessment CRUD ──────────────────────────────────
  const addSubAssessment = (catId: string) => {
    setCategories(
      categories.map((c) => {
        if (c.id !== catId) return c;
        return {
          ...c,
          sub_assessments: [
            ...c.sub_assessments,
            emptySubAssessment(c.sub_assessments.length + 1),
          ],
        };
      })
    );
  };

  const removeSubAssessment = (catId: string, saId: string) => {
    setCategories(
      categories.map((c) => {
        if (c.id !== catId) return c;
        return {
          ...c,
          sub_assessments: c.sub_assessments.filter((sa) => sa.id !== saId),
        };
      })
    );
  };

  const updateSubAssessment = (
    catId: string,
    saId: string,
    field: keyof SubAssessment,
    value: unknown
  ) => {
    setCategories(
      categories.map((c) => {
        if (c.id !== catId) return c;
        return {
          ...c,
          sub_assessments: c.sub_assessments.map((sa) =>
            sa.id === saId ? { ...sa, [field]: value } : sa
          ),
        };
      })
    );
  };

  // ── Save ─────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/assessment-templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          academic_year: year,
          class_code: classCode,
          subject_code: subjectCode,
          semester,
          status,
          categories,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
      } else {
        setSuccess("Template saved successfully");
        setTemplate({ id: data.id, ...data } as AssessmentTemplate);
        setTimeout(() => setSuccess(""), 3000);
      }
    } catch {
      setError("Failed to save template");
    }
    setSaving(false);
  };

  // ── Delete ───────────────────────────────────────────────
  const handleDelete = async () => {
    if (!template?.id) return;
    if (!window.confirm("Are you sure you want to delete this template?")) return;

    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/assessment-templates?id=${template.id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete");
      } else {
        setTemplate(null);
        setCategories([]);
        setSuccess("Template deleted");
        setTimeout(() => setSuccess(""), 3000);
      }
    } catch {
      setError("Failed to delete template");
    }
  };

  // ── Copy ─────────────────────────────────────────────────
  const [copyTarget, setCopyTarget] = useState({
    target_year: "",
    target_class_code: "",
    target_subject_code: "",
    target_semester: "S1",
  });

  const handleCopy = async () => {
    if (!template) return;
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/assessment-templates/copy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          source_year: year,
          source_class_code: classCode,
          source_subject_code: subjectCode,
          source_semester: semester,
          ...copyTarget,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to copy");
      } else {
        setSuccess(`Template copied successfully to ${copyTarget.target_year} ${copyTarget.target_class_code}/${copyTarget.target_subject_code}`);
        setShowCopyDialog(false);
        setTimeout(() => setSuccess(""), 3000);
      }
    } catch {
      setError("Failed to copy template");
    }
  };

  // ── Computed ─────────────────────────────────────────────
  const totalWeight = categories.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
  const isWeightValid = Math.abs(totalWeight - 100) < 0.01;
  const canSave = year && classCode && subjectCode && categories.length > 0 && isWeightValid;

  const toggleExpanded = (catId: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      next.has(catId) ? next.delete(catId) : next.add(catId);
      return next;
    });
  };

  // ── No permission ────────────────────────────────────────
  if (!can("assessments.manage")) {
    return (
      <PageTransition className="space-y-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            You do not have permission to manage assessment templates.
          </CardContent>
        </Card>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Assessment Setup</h1>
        <p className="text-muted-foreground">
          Configure assessment categories and sub-assessments for each subject, grade, and semester.
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700 dark:bg-green-950 dark:border-green-800 dark:text-green-400">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Selection Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <Label>Academic Year</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue placeholder="Select Year" /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Grade / Class</Label>
              <Select value={classCode} onValueChange={setClassCode}>
                <SelectTrigger><SelectValue placeholder="Select Grade" /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subject</Label>
              <Select value={subjectCode} onValueChange={setSubjectCode}>
                <SelectTrigger><SelectValue placeholder="Select Subject" /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Semester</Label>
              <Select value={semester} onValueChange={(v) => setSemester(v as "S1" | "S2")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="S1">Semester 1</SelectItem>
                  <SelectItem value="S2">Semester 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TemplateStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Template Editor */}
      {!loading && year && classCode && subjectCode && (
        <>
          {/* Weight Summary Bar */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">
                Total Weight:{" "}
                <span className={isWeightValid ? "text-green-600" : "text-red-600"}>
                  {totalWeight}%
                </span>
                {!isWeightValid && (
                  <span className="text-red-600 text-xs ml-1">(must be 100%)</span>
                )}
              </span>
              {template && (
                <Badge variant={template.status === "published" ? "default" : "secondary"}>
                  {template.status}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {template && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCopyTarget({
                        target_year: year,
                        target_class_code: classCode,
                        target_subject_code: "",
                        target_semester: semester,
                      });
                      setShowCopyDialog(true);
                    }}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy To…
                  </Button>
                  <Button size="sm" variant="destructive" onClick={handleDelete}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </>
              )}
              <Button size="sm" onClick={handleSave} disabled={saving || !canSave}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                {saving ? "Saving…" : "Save Template"}
              </Button>
            </div>
          </div>

          {/* Categories */}
          <div className="space-y-4">
            {categories.map((cat, catIdx) => (
              <Card key={cat.id}>
                <CardHeader
                  className="cursor-pointer select-none py-3"
                  onClick={() => toggleExpanded(cat.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      {expandedCats.has(cat.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span className="font-semibold">
                        {cat.name_en || `Category ${catIdx + 1}`}
                      </span>
                      <Badge variant="outline" className="ml-2">
                        {cat.weight}%
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        · {cat.sub_assessments.length} sub-assessment
                        {cat.sub_assessments.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCategory(cat.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>

                {expandedCats.has(cat.id) && (
                  <CardContent className="pt-0 space-y-4">
                    {/* Category fields */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <Label className="text-xs">Name (English)</Label>
                        <Input
                          value={cat.name_en}
                          onChange={(e) =>
                            updateCategory(cat.id, "name_en", e.target.value)
                          }
                          placeholder="e.g., Quizzes"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Name (Arabic)</Label>
                        <Input
                          dir="rtl"
                          value={cat.name_ar}
                          onChange={(e) =>
                            updateCategory(cat.id, "name_ar", e.target.value)
                          }
                          placeholder="مثال: اختبارات"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Weight (%)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={cat.weight}
                          onChange={(e) =>
                            updateCategory(
                              cat.id,
                              "weight",
                              Number(e.target.value)
                            )
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Order</Label>
                        <Input
                          type="number"
                          min={1}
                          value={cat.order}
                          onChange={(e) =>
                            updateCategory(
                              cat.id,
                              "order",
                              Number(e.target.value)
                            )
                          }
                        />
                      </div>
                    </div>

                    {/* Sub-Assessments */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm font-medium">
                          Sub-Assessments
                        </Label>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => addSubAssessment(cat.id)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add
                        </Button>
                      </div>

                      <div className="rounded-md border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="px-3 py-2 text-left font-medium">
                                Name (EN)
                              </th>
                              <th className="px-3 py-2 text-left font-medium">
                                Name (AR)
                              </th>
                              <th className="px-3 py-2 text-left font-medium w-28">
                                Max Score
                              </th>
                              <th className="px-3 py-2 text-left font-medium w-20">
                                Order
                              </th>
                              <th className="px-3 py-2 w-10"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {cat.sub_assessments.map((sa) => (
                              <tr key={sa.id} className="border-b last:border-0">
                                <td className="px-3 py-1.5">
                                  <Input
                                    value={sa.name_en}
                                    onChange={(e) =>
                                      updateSubAssessment(
                                        cat.id,
                                        sa.id,
                                        "name_en",
                                        e.target.value
                                      )
                                    }
                                    placeholder="Quiz 1"
                                    className="h-8"
                                  />
                                </td>
                                <td className="px-3 py-1.5">
                                  <Input
                                    dir="rtl"
                                    value={sa.name_ar}
                                    onChange={(e) =>
                                      updateSubAssessment(
                                        cat.id,
                                        sa.id,
                                        "name_ar",
                                        e.target.value
                                      )
                                    }
                                    placeholder="اختبار 1"
                                    className="h-8"
                                  />
                                </td>
                                <td className="px-3 py-1.5">
                                  <Input
                                    type="number"
                                    min={1}
                                    value={sa.max_score}
                                    onChange={(e) =>
                                      updateSubAssessment(
                                        cat.id,
                                        sa.id,
                                        "max_score",
                                        Number(e.target.value)
                                      )
                                    }
                                    className="h-8"
                                  />
                                </td>
                                <td className="px-3 py-1.5">
                                  <Input
                                    type="number"
                                    min={1}
                                    value={sa.order}
                                    onChange={(e) =>
                                      updateSubAssessment(
                                        cat.id,
                                        sa.id,
                                        "order",
                                        Number(e.target.value)
                                      )
                                    }
                                    className="h-8 w-16"
                                  />
                                </td>
                                <td className="px-3 py-1.5">
                                  {cat.sub_assessments.length > 1 && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 text-red-500"
                                      onClick={() =>
                                        removeSubAssessment(cat.id, sa.id)
                                      }
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}

            {/* Add Category Button */}
            <Button variant="outline" className="w-full" onClick={addCategory}>
              <Plus className="h-4 w-4 mr-2" />
              Add Assessment Category
            </Button>
          </div>

          {/* Templates Overview for this Year */}
          {allTemplates.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  All Templates for {year}
                </CardTitle>
                <CardDescription>
                  {allTemplates.length} template(s) configured
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium">Grade</th>
                        <th className="px-3 py-2 text-left font-medium">Subject</th>
                        <th className="px-3 py-2 text-left font-medium">Semester</th>
                        <th className="px-3 py-2 text-left font-medium">Categories</th>
                        <th className="px-3 py-2 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allTemplates.map((t) => {
                        const classLabel =
                          classes.find((c) => c.value === t.class_code)?.label ||
                          t.class_code;
                        const subjectLabel =
                          subjects.find((s) => s.value === t.subject_code)?.label ||
                          t.subject_code;
                        return (
                          <tr
                            key={t.id}
                            className="border-b last:border-0 cursor-pointer hover:bg-muted/30"
                            onClick={() => {
                              setClassCode(t.class_code);
                              setSubjectCode(t.subject_code);
                              setSemester(t.semester as "S1" | "S2");
                            }}
                          >
                            <td className="px-3 py-2">{classLabel}</td>
                            <td className="px-3 py-2">{subjectLabel}</td>
                            <td className="px-3 py-2">{t.semester}</td>
                            <td className="px-3 py-2">
                              {t.categories.length} ({t.categories.map((c) => c.name_en).join(", ")})
                            </td>
                            <td className="px-3 py-2">
                              <Badge
                                variant={
                                  t.status === "published" ? "default" : "secondary"
                                }
                              >
                                {t.status}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* No selection prompt */}
      {!loading && (!year || !classCode || !subjectCode) && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Select an academic year, grade, and subject above to configure assessment templates.
          </CardContent>
        </Card>
      )}

      {/* Copy Dialog */}
      <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy Template To…</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Target Year</Label>
              <Select
                value={copyTarget.target_year}
                onValueChange={(v) =>
                  setCopyTarget({ ...copyTarget, target_year: v })
                }
              >
                <SelectTrigger><SelectValue placeholder="Select Year" /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target Grade</Label>
              <Select
                value={copyTarget.target_class_code}
                onValueChange={(v) =>
                  setCopyTarget({ ...copyTarget, target_class_code: v })
                }
              >
                <SelectTrigger><SelectValue placeholder="Select Grade" /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target Subject</Label>
              <Select
                value={copyTarget.target_subject_code}
                onValueChange={(v) =>
                  setCopyTarget({ ...copyTarget, target_subject_code: v })
                }
              >
                <SelectTrigger><SelectValue placeholder="Select Subject" /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target Semester</Label>
              <Select
                value={copyTarget.target_semester}
                onValueChange={(v) =>
                  setCopyTarget({ ...copyTarget, target_semester: v })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="S1">Semester 1</SelectItem>
                  <SelectItem value="S2">Semester 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCopyDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCopy}
                disabled={
                  !copyTarget.target_year ||
                  !copyTarget.target_class_code ||
                  !copyTarget.target_subject_code
                }
              >
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
