"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStudentAuth } from "@/context/student-auth-context";
import { useLanguage } from "@/context/language-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CalendarX, Clock } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface AbsenceRecord {
  date: string;
  days: number;
  reason_desc: string;
  year: string;
}

interface TardyRecord {
  date: string;
  reason_desc: string;
  year: string;
}

interface MonthlyBreakdown {
  month: string;
  absences: number;
  tardies: number;
}

interface AttendanceData {
  summary: {
    total_absence_days: number;
    total_tardy_days: number;
  };
  monthly_breakdown: MonthlyBreakdown[];
  absences: AbsenceRecord[];
  tardies: TardyRecord[];
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function StudentAttendancePage() {
  const { student, loading: authLoading } = useStudentAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [data, setData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!student) {
      router.push("/student/login");
      return;
    }

    const fetchAttendance = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/parent/attendance?studentNumber=${encodeURIComponent(student.student_number)}`
        );
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Attendance fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAttendance();
  }, [student, authLoading, router]);

  if (authLoading || !student) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("attendance") || "Attendance"}</h1>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No attendance data available.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Absences
                </CardTitle>
                <CalendarX className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {data.summary.total_absence_days}
                </p>
                <p className="text-xs text-muted-foreground mt-1">days this year</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Tardies
                </CardTitle>
                <Clock className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {data.summary.total_tardy_days}
                </p>
                <p className="text-xs text-muted-foreground mt-1">late arrivals</p>
              </CardContent>
            </Card>
          </div>

          {/* Monthly Breakdown */}
          {data.monthly_breakdown && data.monthly_breakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Monthly Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Month</th>
                        <th className="pb-2 font-medium text-right">Absences</th>
                        <th className="pb-2 font-medium text-right">Tardies</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.monthly_breakdown.map((m) => (
                        <tr key={m.month} className="border-b last:border-0">
                          <td className="py-2">{m.month}</td>
                          <td className="py-2 text-right">
                            {m.absences > 0 ? (
                              <Badge variant="destructive" className="text-xs">
                                {m.absences}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                          <td className="py-2 text-right">
                            {m.tardies > 0 ? (
                              <Badge
                                variant="outline"
                                className="text-xs border-amber-300 text-amber-600"
                              >
                                {m.tardies}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Absences */}
          {data.absences && data.absences.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Absence Records</CardTitle>
                <CardDescription>
                  {data.absences.length} records
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Date</th>
                        <th className="pb-2 font-medium text-right">Days</th>
                        <th className="pb-2 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.absences
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((a, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2">
                              {new Date(a.date).toLocaleDateString()}
                            </td>
                            <td className="py-2 text-right font-medium">{a.days}</td>
                            <td className="py-2 text-muted-foreground">
                              {a.reason_desc || "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Tardies */}
          {data.tardies && data.tardies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tardy Records</CardTitle>
                <CardDescription>
                  {data.tardies.length} records
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Date</th>
                        <th className="pb-2 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.tardies
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((a, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2">
                              {new Date(a.date).toLocaleDateString()}
                            </td>
                            <td className="py-2 text-muted-foreground">
                              {a.reason_desc || "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
