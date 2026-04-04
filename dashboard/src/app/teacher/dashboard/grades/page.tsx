"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
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
import { Save } from "lucide-react";

interface StudentInfo {
  studentNumber: string;
  nameEn: string;
  nameAr: string;
  gender: string;
  grade: string;
  section: string;
}

export default function TeacherGradesPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Loading…</p></div>}>
      <TeacherGradesPage />
    </Suspense>
  );
}

function TeacherGradesPage() {
  const { teacher, loading: authLoading } = useTeacherAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

  const classParam = searchParams.get("class") || "";
  const sectionParam = searchParams.get("section") || "";
  const subjectParam = searchParams.get("subject") || "";

  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState("T1");
  const [year, setYear] = useState("24-25");
  const [grades, setGrades] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchStudents = useCallback(async () => {
    if (!classParam) return;
    setLoading(true);

    try {
      const params = new URLSearchParams({ class: classParam });
      if (sectionParam) params.set("section", sectionParam);

      const res = await fetch(`/api/teacher/students?${params}`);
      const data = await res.json();
      setStudents(data.students || []);
    } catch {
      setStudents([]);
    }
    setLoading(false);
  }, [classParam, sectionParam]);

  // Fetch existing grades
  const fetchExistingGrades = useCallback(async () => {
    if (!classParam || !subjectParam) return;

    try {
      const params = new URLSearchParams({
        class: classParam,
        subject: subjectParam,
        year,
      });
      if (sectionParam) params.set("section", sectionParam);

      const res = await fetch(`/api/teacher/grades?${params}`);
      const data = await res.json();

      if (data.grades && data.grades.length > 0) {
        const existing: Record<string, string> = {};
        for (const g of data.grades) {
          if (g.term === term) {
            existing[g.studentNumber] = String(g.grade);
          }
        }
        setGrades((prev) => ({ ...prev, ...existing }));
      }
    } catch {
      // ignore
    }
  }, [classParam, sectionParam, subjectParam, year, term]);

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
      fetchExistingGrades();
    }
  }, [students.length, subjectParam, fetchExistingGrades]);

  const handleGradeChange = (studentNumber: string, value: string) => {
    setGrades((prev) => ({ ...prev, [studentNumber]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);

    try {
      const gradesList = Object.entries(grades)
        .filter(([, v]) => v !== "")
        .map(([studentNumber, grade]) => ({
          studentNumber,
          grade: Number(grade),
        }));

      await fetch("/api/teacher/grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grades: gradesList,
          class: classParam,
          section: sectionParam,
          subject: subjectParam,
          year,
          term,
          teacherUsername: teacher?.username || "",
        }),
      });

      setSaved(true);
    } catch {
      // ignore
    }
    setSaving(false);
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  if (!classParam || !subjectParam) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("teacherGrades")}</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("teacherSelectClassFirst")}
            <div className="mt-4">
              <Button onClick={() => router.push("/teacher/dashboard/classes")}>
                {t("teacherMyClasses")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Compute stats
  const gradeValues = Object.values(grades)
    .map(Number)
    .filter((v) => !isNaN(v) && v > 0);
  const avg = gradeValues.length
    ? (gradeValues.reduce((a, b) => a + b, 0) / gradeValues.length).toFixed(1)
    : "—";
  const highest = gradeValues.length ? Math.max(...gradeValues) : "—";
  const lowest = gradeValues.length ? Math.min(...gradeValues) : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("teacherGrades")}</h1>
          <p className="text-muted-foreground">
            {classParam} — {sectionParam} · {subjectParam}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="T1">Term 1</option>
            <option value="T2">Term 2</option>
            <option value="T3">Term 3</option>
          </select>
          <Input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="Year (e.g. 24-25)"
            className="w-32"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-3">
        <div className="rounded-lg border p-3 text-center">
          <p className="text-lg font-bold">{avg}</p>
          <p className="text-xs text-muted-foreground">{t("average")}</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-lg font-bold text-green-600">{highest}</p>
          <p className="text-xs text-muted-foreground">{t("strongest")}</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-lg font-bold text-red-600">{lowest}</p>
          <p className="text-xs text-muted-foreground">{t("weakest")}</p>
        </div>
      </div>

      {/* Grade Entry */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t("teacherEnterGrades")}</CardTitle>
            <CardDescription>{students.length} {t("students")}</CardDescription>
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

          {students.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">{t("noData")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium w-8">#</th>
                    <th className="pb-2 font-medium">{t("studentNumber")}</th>
                    <th className="pb-2 font-medium">{t("name")}</th>
                    <th className="pb-2 font-medium w-28">{t("grade")}</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.studentNumber} className="border-b last:border-0">
                      <td className="py-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 font-mono text-xs">{s.studentNumber}</td>
                      <td className="py-2">{s.nameEn || s.nameAr}</td>
                      <td className="py-2">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={grades[s.studentNumber] || ""}
                          onChange={(e) =>
                            handleGradeChange(s.studentNumber, e.target.value)
                          }
                          className="h-8 w-20"
                          placeholder="0-100"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
