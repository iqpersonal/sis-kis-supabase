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
import { CheckCircle2, XCircle, Clock, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface StudentInfo {
  studentNumber: string;
  nameEn: string;
  nameAr: string;
  gender: string;
  grade: string;
  section: string;
}

type AttendanceStatus = "present" | "absent" | "late";

export default function TeacherAttendancePageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Loading…</p></div>}>
      <TeacherAttendancePage />
    </Suspense>
  );
}

function TeacherAttendancePage() {
  const { teacher, loading: authLoading } = useTeacherAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

  const classIdParam = searchParams.get("classId") || "";
  const classParam = searchParams.get("class") || "";
  const sectionParam = searchParams.get("section") || "";
  const yearParam = searchParams.get("year") || "";

  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchStudents = useCallback(async () => {
    if (!classParam) return;
    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (classIdParam) params.set("classId", classIdParam);
      params.set("class", classParam);
      if (sectionParam) params.set("section", sectionParam);
      if (yearParam) params.set("year", yearParam);

      const res = await fetch(`/api/teacher/students?${params}`);
      const data = await res.json();
      const studentList: StudentInfo[] = data.students || [];
      setStudents(studentList);

      // Default all to present
      const defaults: Record<string, AttendanceStatus> = {};
      for (const s of studentList) {
        defaults[s.studentNumber] = "present";
      }
      setStatuses(defaults);
    } catch {
      setStudents([]);
    }
    setLoading(false);
  }, [classIdParam, classParam, sectionParam, yearParam]);

  // Fetch existing attendance for the selected date
  const fetchExisting = useCallback(async () => {
    if (!classParam || !date) return;

    try {
      const params = new URLSearchParams({ class: classParam, date });
      if (sectionParam) params.set("section", sectionParam);

      const res = await fetch(`/api/teacher/attendance?${params}`);
      const data = await res.json();

      if (data.records && data.records.length > 0) {
        const existing: Record<string, AttendanceStatus> = {};
        for (const r of data.records) {
          existing[r.studentNumber] = r.status as AttendanceStatus;
        }
        setStatuses((prev) => ({ ...prev, ...existing }));
      }
    } catch {
      // ignore
    }
  }, [classParam, sectionParam, date]);

  useEffect(() => {
    if (authLoading) return;
    if (!teacher) {
      router.push("/teacher/login");
      return;
    }
    fetchStudents();
  }, [teacher, authLoading, router, fetchStudents]);

  useEffect(() => {
    if (students.length > 0 && date) {
      fetchExisting();
    }
  }, [date, students.length, fetchExisting]);

  const toggleStatus = (sn: string) => {
    setStatuses((prev) => {
      const current = prev[sn] || "present";
      const next: AttendanceStatus =
        current === "present" ? "absent" : current === "absent" ? "late" : "present";
      return { ...prev, [sn]: next };
    });
    setSaved(false);
  };

  const markAllPresent = () => {
    const all: Record<string, AttendanceStatus> = {};
    for (const s of students) {
      all[s.studentNumber] = "present";
    }
    setStatuses(all);
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);

    try {
      const records = Object.entries(statuses).map(([studentNumber, status]) => ({
        studentNumber,
        status,
      }));

      await fetch("/api/teacher/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records,
          class: classParam,
          section: sectionParam,
          date,
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

  if (!classParam) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("teacherAttendance")}</h1>
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

  const presentCount = Object.values(statuses).filter((s) => s === "present").length;
  const absentCount = Object.values(statuses).filter((s) => s === "absent").length;
  const lateCount = Object.values(statuses).filter((s) => s === "late").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("teacherAttendance")}</h1>
          <p className="text-muted-foreground">
            {classParam} — {sectionParam}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-3 grid-cols-3">
        <div className="flex items-center gap-2 rounded-lg border p-3">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <div>
            <p className="text-lg font-bold">{presentCount}</p>
            <p className="text-xs text-muted-foreground">{t("present")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border p-3">
          <XCircle className="h-5 w-5 text-red-600" />
          <div>
            <p className="text-lg font-bold">{absentCount}</p>
            <p className="text-xs text-muted-foreground">{t("absent")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border p-3">
          <Clock className="h-5 w-5 text-amber-600" />
          <div>
            <p className="text-lg font-bold">{lateCount}</p>
            <p className="text-xs text-muted-foreground">{t("late")}</p>
          </div>
        </div>
      </div>

      {/* Attendance Grid */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t("dailyAttendance")}</CardTitle>
            <CardDescription>{students.length} {t("students")}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={markAllPresent}>
              {t("markAllPresent")}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-1" />
              {saving ? t("loading") : t("save")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {saved && (
            <div className="mb-4 rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700 dark:bg-green-950 dark:border-green-800 dark:text-green-400">
              {t("teacherAttendanceSaved")}
            </div>
          )}

          {students.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">{t("noData")}</p>
          ) : (
            <div className="space-y-1">
              {students.map((s, i) => {
                const status = statuses[s.studentNumber] || "present";
                return (
                  <div
                    key={s.studentNumber}
                    className={cn(
                      "flex items-center justify-between rounded-md px-3 py-2 cursor-pointer transition-colors",
                      status === "present" && "bg-green-50 dark:bg-green-950/30",
                      status === "absent" && "bg-red-50 dark:bg-red-950/30",
                      status === "late" && "bg-amber-50 dark:bg-amber-950/30"
                    )}
                    onClick={() => toggleStatus(s.studentNumber)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-xs text-muted-foreground">{i + 1}</span>
                      <div>
                        <p className="text-sm font-medium">{s.nameEn || s.nameAr}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {s.studentNumber}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {status === "present" && (
                        <span className="flex items-center gap-1 text-sm text-green-700 dark:text-green-400">
                          <CheckCircle2 className="h-4 w-4" /> {t("present")}
                        </span>
                      )}
                      {status === "absent" && (
                        <span className="flex items-center gap-1 text-sm text-red-700 dark:text-red-400">
                          <XCircle className="h-4 w-4" /> {t("absent")}
                        </span>
                      )}
                      {status === "late" && (
                        <span className="flex items-center gap-1 text-sm text-amber-700 dark:text-amber-400">
                          <Clock className="h-4 w-4" /> {t("late")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
