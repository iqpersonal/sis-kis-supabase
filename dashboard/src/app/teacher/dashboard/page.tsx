"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTeacherAuth } from "@/context/teacher-auth-context";
import { useLanguage } from "@/context/language-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Users, BookOpen, CalendarCheck, TrendingUp } from "lucide-react";

interface ClassInfo {
  id: string;
  className: string;
  section: string;
  subject: string;
  teacher: string;
  year: string;
  studentCount: number;
}

export default function TeacherHomePage() {
  const { teacher, loading: authLoading } = useTeacherAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!teacher) {
      router.push("/teacher/login");
      return;
    }

    const fetchClasses = async () => {
      try {
        const res = await fetch(
          `/api/teacher/classes?username=${encodeURIComponent(teacher.username)}`
        );
        const data = await res.json();
        setClasses(data.classes || []);
      } catch {
        // ignore
      }
      setLoading(false);
    };

    fetchClasses();
  }, [teacher, authLoading, router]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  if (!teacher) return null;

  const totalStudents = classes.reduce((sum, c) => sum + c.studentCount, 0);
  const uniqueSubjects = [...new Set(classes.map((c) => c.subject).filter(Boolean))];
  const uniqueClasses = [...new Set(classes.map((c) => `${c.className}-${c.section}`))];
  const activeYear = classes.length > 0 ? classes[0].year : "";

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold">
          {t("welcome")}, {teacher.displayName}
        </h1>
        <p className="text-muted-foreground">
          {t("teacherDashboardDesc")}
          {activeYear && (
            <span className="ml-2 inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-500/30">
              {activeYear}
            </span>
          )}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("teacherMyClasses")}</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueClasses.length}</div>
            <p className="text-xs text-muted-foreground">{t("teacherAssignedClasses")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("totalStudents")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStudents}</div>
            <p className="text-xs text-muted-foreground">{t("teacherAcrossClasses")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("subjects")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueSubjects.length}</div>
            <p className="text-xs text-muted-foreground">{t("teacherSubjectsTeaching")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("teacherAttendance")}</CardTitle>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">—</div>
            <p className="text-xs text-muted-foreground">{t("teacherTodayMarked")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Classes List */}
      <Card>
        <CardHeader>
          <CardTitle>{t("teacherMyClasses")}</CardTitle>
          <CardDescription>{t("teacherClassesDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {classes.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t("teacherNoClasses")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">{t("class")}</th>
                    <th className="pb-2 font-medium">{t("section")}</th>
                    <th className="pb-2 font-medium">{t("subject")}</th>
                    <th className="pb-2 font-medium">{t("students")}</th>
                    <th className="pb-2 font-medium">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2">{c.className}</td>
                      <td className="py-2">{c.section}</td>
                      <td className="py-2">{c.subject}</td>
                      <td className="py-2">{c.studentCount}</td>
                      <td className="py-2">
                        <button
                          onClick={() =>
                            router.push(
                              `/teacher/dashboard/attendance?classId=${encodeURIComponent(c.id)}&class=${encodeURIComponent(c.className)}&section=${encodeURIComponent(c.section)}&year=${encodeURIComponent(c.year || "")}`
                            )
                          }
                          className="text-xs text-blue-600 hover:underline mr-3"
                        >
                          {t("teacherAttendance")}
                        </button>
                        <button
                          onClick={() =>
                            router.push(
                              `/teacher/dashboard/grades?classId=${encodeURIComponent(c.id)}&class=${encodeURIComponent(c.className)}&section=${encodeURIComponent(c.section)}&subject=${encodeURIComponent(c.subject)}&year=${encodeURIComponent(c.year || "")}`
                            )
                          }
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {t("teacherGrades")}
                        </button>
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
