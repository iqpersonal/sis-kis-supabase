"use client";

import { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTeacherAuth } from "@/context/teacher-auth-context";
import { useLanguage } from "@/context/language-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, AlertCircle } from "lucide-react";
import type {
  AssessmentTemplate,
  AssessmentCategory,
  SubAssessment,
} from "@/types/assessment";

interface StudentInfo {
  studentNumber: string;
  nameEn: string;
  nameAr: string;
  gender: string;
  grade: string;
  section: string;
}

// scores state: studentNumber → subAssessmentId → value string
type ScoresMap = Record<string, Record<string, string>>;

export default function TeacherGradesPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <TeacherGradesPage />
    </Suspense>
  );
}

function TeacherGradesPage() {
  const { teacher, loading: authLoading } = useTeacherAuth();
  const { t, locale } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

  const classIdParam = searchParams.get("classId") || "";
  const classParam = searchParams.get("class") || "";
  const sectionParam = searchParams.get("section") || "";
  const subjectParam = searchParams.get("subject") || "";
  const yearParam = searchParams.get("year") || "25-26";

  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [semester, setSemester] = useState<"S1" | "S2">("S1");
  const [template, setTemplate] = useState<AssessmentTemplate | null>(null);
  const [scores, setScores] = useState<ScoresMap>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [templateMsg, setTemplateMsg] = useState("");

  const isAr = locale === "ar";

  // ── Fetch students ──────────────────────────────────────────────────
  const fetchStudents = useCallback(async () => {
    if (!classParam && !classIdParam) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (classIdParam) params.set("classId", classIdParam);
      if (classParam) params.set("class", classParam);
      if (sectionParam) params.set("section", sectionParam);
      if (yearParam) params.set("year", yearParam);
      const res = await fetch(`/api/teacher/students?${params}`);
      const data = await res.json();
      setStudents(data.students || []);
    } catch {
      setStudents([]);
    }
    setLoading(false);
  }, [classParam, classIdParam, sectionParam, yearParam]);

  // ── Fetch template + existing scores ────────────────────────────────
  const fetchTemplateAndScores = useCallback(async () => {
    if (!classIdParam || !subjectParam) return;
    setTemplateMsg("");
    try {
      const params = new URLSearchParams({
        classId: classIdParam,
        subjectCode: subjectParam,
        semester,
        year: yearParam,
      });
      const res = await fetch(`/api/teacher/assessment-scores?${params}`);
      const data = await res.json();

      if (!data.template) {
        setTemplate(null);
        setTemplateMsg(
          data.message || "No assessment template configured for this class/subject/semester."
        );
        return;
      }

      setTemplate(data.template as AssessmentTemplate);

      // Convert fetched scores into our local ScoresMap
      const existing: ScoresMap = {};
      if (data.scores) {
        for (const [sn, subs] of Object.entries(
          data.scores as Record<string, Record<string, { score: number }>>
        )) {
          existing[sn] = {};
          for (const [saId, val] of Object.entries(subs)) {
            existing[sn][saId] = String(val.score);
          }
        }
      }
      setScores(existing);
    } catch {
      setTemplate(null);
      setTemplateMsg("Failed to load assessment template.");
    }
  }, [classIdParam, subjectParam, semester, yearParam]);

  // ── Effects ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!teacher) {
      router.push("/teacher/login");
      return;
    }
    fetchStudents();
  }, [teacher, authLoading, router, fetchStudents]);

  useEffect(() => {
    if (students.length > 0 && subjectParam) {
      fetchTemplateAndScores();
    }
  }, [students.length, subjectParam, fetchTemplateAndScores]);

  // ── Helpers ─────────────────────────────────────────────────────────
  const handleScoreChange = (
    studentNumber: string,
    subAssessmentId: string,
    value: string
  ) => {
    setScores((prev) => ({
      ...prev,
      [studentNumber]: { ...(prev[studentNumber] || {}), [subAssessmentId]: value },
    }));
    setSaved(false);
  };

  // Flat list of all sub-assessments in order (for column headers)
  const allSubAssessments = useMemo(() => {
    if (!template) return [];
    const list: { cat: AssessmentCategory; sa: SubAssessment }[] = [];
    for (const cat of [...template.categories].sort((a, b) => a.order - b.order)) {
      for (const sa of [...cat.sub_assessments].sort((a, b) => a.order - b.order)) {
        list.push({ cat, sa });
      }
    }
    return list;
  }, [template]);

  // Compute category total for a student: sum of scores / sum of max_scores * weight
  const computeCategoryTotal = (
    studentNumber: string,
    cat: AssessmentCategory
  ): number | null => {
    const studentScores = scores[studentNumber];
    if (!studentScores) return null;

    let sumScores = 0;
    let sumMax = 0;
    let hasAny = false;

    for (const sa of cat.sub_assessments) {
      const val = studentScores[sa.id];
      if (val !== undefined && val !== "") {
        sumScores += Number(val);
        sumMax += sa.max_score;
        hasAny = true;
      }
    }

    if (!hasAny || sumMax === 0) return null;
    return (sumScores / sumMax) * cat.weight;
  };

  // Overall weighted total for a student (sum of all category weighted scores)
  const computeOverallTotal = (studentNumber: string): number | null => {
    if (!template) return null;
    let total = 0;
    let hasAny = false;
    for (const cat of template.categories) {
      const catTotal = computeCategoryTotal(studentNumber, cat);
      if (catTotal !== null) {
        total += catTotal;
        hasAny = true;
      }
    }
    return hasAny ? total : null;
  };

  // ── Save ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!template) return;
    setSaving(true);
    setSaved(false);
    setError("");

    try {
      // Build flat score list from ScoresMap
      const scoresList: Array<{
        student_number: string;
        sub_assessment_id: string;
        category_id: string;
        score: number;
        max_score: number;
      }> = [];

      // Build sub_assessment_id → category_id lookup
      const saCatMap = new Map<string, string>();
      for (const cat of template.categories) {
        for (const sa of cat.sub_assessments) {
          saCatMap.set(sa.id, cat.id);
        }
      }

      for (const [sn, subs] of Object.entries(scores)) {
        for (const [saId, val] of Object.entries(subs)) {
          if (val === "" || val === undefined) continue;
          const numVal = Number(val);
          if (isNaN(numVal)) continue;
          scoresList.push({
            student_number: sn,
            sub_assessment_id: saId,
            category_id: saCatMap.get(saId) || "",
            score: numVal,
            max_score: 0, // server will use template max
          });
        }
      }

      const res = await fetch("/api/teacher/assessment-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: classIdParam,
          subjectCode: subjectParam,
          semester,
          year: yearParam,
          scores: scoresList,
          recorded_by: teacher?.username || "",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
      } else {
        setSaved(true);
      }
    } catch {
      setError("Failed to save scores.");
    }
    setSaving(false);
  };

  // ── Render guards ───────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  if (!classParam && !classIdParam) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("teacherGrades")}</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("teacherSelectClassFirst")}
            <div className="mt-4">
              <Button
                onClick={() => router.push("/teacher/dashboard/classes")}
              >
                {t("teacherMyClasses")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Compute class stats ─────────────────────────────────────────────
  const overallValues = students
    .map((s) => computeOverallTotal(s.studentNumber))
    .filter((v): v is number => v !== null);
  const avg = overallValues.length
    ? (overallValues.reduce((a, b) => a + b, 0) / overallValues.length).toFixed(
        1
      )
    : "—";
  const highest = overallValues.length
    ? Math.max(...overallValues).toFixed(1)
    : "—";
  const lowest = overallValues.length
    ? Math.min(...overallValues).toFixed(1)
    : "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("teacherGrades")}</h1>
          <p className="text-muted-foreground">
            {classParam} — {sectionParam} · {subjectParam}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={semester}
            onChange={(e) => setSemester(e.target.value as "S1" | "S2")}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="S1">{isAr ? "الفصل الأول" : "Semester 1"}</option>
            <option value="S2">{isAr ? "الفصل الثاني" : "Semester 2"}</option>
          </select>
        </div>
      </div>

      {/* No template message */}
      {templateMsg && (
        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-300 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{templateMsg}</span>
        </div>
      )}

      {/* Template loaded → show grade entry */}
      {template && (
        <>
          {/* Stats */}
          <div className="grid gap-3 grid-cols-3">
            <div className="rounded-lg border p-3 text-center">
              <p className="text-lg font-bold">{avg}</p>
              <p className="text-xs text-muted-foreground">{t("average")}</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-lg font-bold text-green-600">{highest}</p>
              <p className="text-xs text-muted-foreground">
                {t("strongest")}
              </p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-lg font-bold text-red-600">{lowest}</p>
              <p className="text-xs text-muted-foreground">{t("weakest")}</p>
            </div>
          </div>

          {/* Grade Entry Grid */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t("teacherEnterGrades")}</CardTitle>
                <CardDescription>
                  {students.length} {t("students")} ·{" "}
                  {template.categories.length}{" "}
                  {isAr ? "فئات" : "categories"}
                </CardDescription>
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" />
                {saving ? t("loading") : t("save")}
              </Button>
            </CardHeader>
            <CardContent>
              {saved && (
                <div className="mb-4 rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700 dark:bg-green-950 dark:border-green-800 dark:text-green-400">
                  {t("teacherGradesSaved")}
                </div>
              )}
              {error && (
                <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-400">
                  {error}
                </div>
              )}

              {students.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  {t("noData")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      {/* Row 1: Category group headers */}
                      <tr className="border-b bg-muted/50">
                        <th
                          className="p-2 font-medium text-left"
                          rowSpan={2}
                        >
                          #
                        </th>
                        <th
                          className="p-2 font-medium text-left"
                          rowSpan={2}
                        >
                          {t("name")}
                        </th>
                        {template.categories
                          .sort((a, b) => a.order - b.order)
                          .map((cat) => (
                            <th
                              key={cat.id}
                              className="p-2 font-semibold text-center border-l bg-muted/30"
                              colSpan={cat.sub_assessments.length + 1}
                            >
                              {isAr ? cat.name_ar : cat.name_en}
                              <span className="ml-1 text-xs font-normal text-muted-foreground">
                                ({cat.weight}%)
                              </span>
                            </th>
                          ))}
                        <th
                          className="p-2 font-semibold text-center border-l"
                          rowSpan={2}
                        >
                          {isAr ? "المجموع" : "Total"}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            (100%)
                          </span>
                        </th>
                      </tr>

                      {/* Row 2: Sub-assessment headers */}
                      <tr className="border-b bg-muted/30">
                        {template.categories
                          .sort((a, b) => a.order - b.order)
                          .map((cat) => (
                            <>
                              {cat.sub_assessments
                                .sort((a, b) => a.order - b.order)
                                .map((sa) => (
                                  <th
                                    key={sa.id}
                                    className="p-2 text-center text-xs font-normal border-l whitespace-nowrap"
                                  >
                                    {isAr ? sa.name_ar : sa.name_en}
                                    <br />
                                    <span className="text-muted-foreground">
                                      /{sa.max_score}
                                    </span>
                                  </th>
                                ))}
                              <th
                                key={`${cat.id}_total`}
                                className="p-2 text-center text-xs font-medium border-l"
                              >
                                {isAr ? "المجموع" : "Cat."}
                                <br />
                                <span className="text-muted-foreground">
                                  /{cat.weight}
                                </span>
                              </th>
                            </>
                          ))}
                      </tr>
                    </thead>

                    <tbody>
                      {students.map((s, i) => {
                        const overall = computeOverallTotal(s.studentNumber);
                        return (
                          <tr
                            key={s.studentNumber}
                            className="border-b last:border-0 hover:bg-muted/20"
                          >
                            <td className="p-2 text-muted-foreground">
                              {i + 1}
                            </td>
                            <td className="p-2 whitespace-nowrap">
                              <div>{s.nameEn || s.nameAr}</div>
                              <div className="text-xs text-muted-foreground font-mono">
                                {s.studentNumber}
                              </div>
                            </td>

                            {template.categories
                              .sort((a, b) => a.order - b.order)
                              .map((cat) => {
                                const catTotal = computeCategoryTotal(
                                  s.studentNumber,
                                  cat
                                );
                                return (
                                  <>
                                    {cat.sub_assessments
                                      .sort((a, b) => a.order - b.order)
                                      .map((sa) => (
                                        <td
                                          key={sa.id}
                                          className="p-1 text-center border-l"
                                        >
                                          <Input
                                            type="number"
                                            min={0}
                                            max={sa.max_score}
                                            value={
                                              scores[s.studentNumber]?.[
                                                sa.id
                                              ] ?? ""
                                            }
                                            onChange={(e) =>
                                              handleScoreChange(
                                                s.studentNumber,
                                                sa.id,
                                                e.target.value
                                              )
                                            }
                                            className="h-7 w-16 text-center text-xs mx-auto"
                                            placeholder={`0-${sa.max_score}`}
                                          />
                                        </td>
                                      ))}
                                    <td
                                      key={`${cat.id}_total`}
                                      className="p-2 text-center border-l font-medium"
                                    >
                                      {catTotal !== null
                                        ? catTotal.toFixed(1)
                                        : "—"}
                                    </td>
                                  </>
                                );
                              })}

                            {/* Overall */}
                            <td className="p-2 text-center border-l font-bold">
                              {overall !== null ? overall.toFixed(1) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
