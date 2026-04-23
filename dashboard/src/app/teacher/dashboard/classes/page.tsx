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
import { Button } from "@/components/ui/button";
import { CalendarCheck, ClipboardList, Users } from "lucide-react";

interface ClassInfo {
  id: string;
  className: string;
  section: string;
  subject: string;
  teacher: string;
  year: string;
  studentCount: number;
}

interface StudentInfo {
  studentNumber: string;
  nameEn: string;
  nameAr: string;
  gender: string;
  grade: string;
  section: string;
}

export default function TeacherClassesPage() {
  const { teacher, loading: authLoading } = useTeacherAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<ClassInfo | null>(null);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!teacher) {
      router.push("/teacher/login");
      return;
    }

    const fetchClasses = async () => {
      try {
        const param = teacher.username
          ? `username=${encodeURIComponent(teacher.username)}`
          : `uid=${encodeURIComponent(teacher.uid)}`;
        const res = await fetch(`/api/teacher/classes?${param}`);
        const data = await res.json();
        setClasses(data.classes || []);
      } catch {
        // ignore
      }
      setLoading(false);
    };

    fetchClasses();
  }, [teacher, authLoading, router]);

  const handleSelectClass = async (c: ClassInfo) => {
    setSelectedClass(c);
    setStudentsLoading(true);

    try {
      const params = new URLSearchParams();
      if (c.id) {
        params.set("classId", c.id);
      } else {
        params.set("class", c.className);
      }
      if (c.section) params.set("section", c.section);
      if (c.year) params.set("year", c.year);

      const res = await fetch(`/api/teacher/students?${params}`);
      const data = await res.json();
      setStudents(data.students || []);
    } catch {
      setStudents([]);
    }
    setStudentsLoading(false);
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("teacherMyClasses")}</h1>
        <p className="text-muted-foreground">{t("teacherClassesDesc")}</p>
      </div>

      {classes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("teacherNoClasses")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <Card
              key={c.id}
              className={`cursor-pointer transition-shadow hover:shadow-md ${
                selectedClass?.id === c.id ? "ring-2 ring-blue-600" : ""
              }`}
              onClick={() => handleSelectClass(c)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {c.className} — {c.section}
                </CardTitle>
                <CardDescription>{c.subject}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {c.studentCount} {t("students")}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(
                        `/teacher/dashboard/attendance?classId=${encodeURIComponent(c.id)}&class=${encodeURIComponent(c.className)}&section=${encodeURIComponent(c.section)}&year=${encodeURIComponent(c.year || "")}`
                      );
                    }}
                  >
                    <CalendarCheck className="h-3 w-3 mr-1" />
                    {t("teacherAttendance")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(
                        `/teacher/dashboard/grades?classId=${encodeURIComponent(c.id)}&class=${encodeURIComponent(c.className)}&section=${encodeURIComponent(c.section)}&subject=${encodeURIComponent(c.subject)}&year=${encodeURIComponent(c.year || "")}`
                      );
                    }}
                  >
                    <ClipboardList className="h-3 w-3 mr-1" />
                    {t("teacherGrades")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Student Roster */}
      {selectedClass && (
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedClass.className} — {selectedClass.section} · {selectedClass.subject}
            </CardTitle>
            <CardDescription>
              {t("teacherStudentRoster")} ({students.length})
            </CardDescription>
          </CardHeader>
          <CardContent>
            {studentsLoading ? (
              <p className="text-center text-muted-foreground py-4">{t("loading")}</p>
            ) : students.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">{t("noData")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium">#</th>
                      <th className="pb-2 font-medium">{t("studentNumber")}</th>
                      <th className="pb-2 font-medium">{t("name")}</th>
                      <th className="pb-2 font-medium">{t("gender")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s, i) => (
                      <tr key={s.studentNumber} className="border-b last:border-0">
                        <td className="py-2 text-muted-foreground">{i + 1}</td>
                        <td className="py-2 font-mono text-xs">{s.studentNumber}</td>
                        <td className="py-2">{s.nameEn || s.nameAr}</td>
                        <td className="py-2">{s.gender === "M" ? t("male") : s.gender === "F" ? t("female") : s.gender}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
