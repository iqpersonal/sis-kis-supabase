"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { useAcademicYear } from "@/context/academic-year-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LayoutGrid,
  RefreshCw,
  Printer,
  Zap,
  Trash2,
  ChevronDown,
  Users,
  AlertTriangle,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";

/* ── Types ──────────────────────────────────────────────────── */
interface Schedule {
  id: string;
  academicYear: string;
  examType: string;
  gradeGroup: string;
  days: { date: string; subjectCode: string; subjectName: string }[];
  status: string;
}

interface SeatData {
  row: number;
  col: number;
  studentNumber: string;
  studentName: string;
  className: string;
  section: string;
}

interface HallPlan {
  hallId: string;
  hallName: string;
  rows: number;
  columns: number;
  proctors: { uid: string; name: string; email: string }[];
  seats: (SeatData | null)[][];
  studentCount: number;
}

interface SeatingPlan {
  id: string;
  scheduleId: string;
  examDate: string;
  subjectName: string;
  campus: string;
  halls: HallPlan[];
  totalStudents: number;
  generatedAt: string;
}

/* ── Color palette for class groups ─────────────────────────── */
const CLASS_COLORS = [
  "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200",
  "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200",
  "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200",
  "bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-200",
  "bg-pink-100 text-pink-900 dark:bg-pink-900/40 dark:text-pink-200",
  "bg-teal-100 text-teal-900 dark:bg-teal-900/40 dark:text-teal-200",
  "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
  "bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-200",
  "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200",
  "bg-cyan-100 text-cyan-900 dark:bg-cyan-900/40 dark:text-cyan-200",
  "bg-lime-100 text-lime-900 dark:bg-lime-900/40 dark:text-lime-200",
  "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200",
  "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200",
];

/* ── Page ───────────────────────────────────────────────────── */
export default function ExamSeatingPlanPage() {
  const { user } = useAuth();
  const { isRTL } = useLanguage();
  const { selectedYear } = useAcademicYear();

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [plans, setPlans] = useState<SeatingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [selectedCampus, setSelectedCampus] = useState("Boys");
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);

  const printRef = useRef<HTMLDivElement>(null);

  async function getAuthHeaders() {
    const { data: { session } } = await getSupabase().auth.getSession();
    const token = session?.access_token;
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  // Load schedules
  async function loadSchedules() {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/exam-seating/schedule?year=${selectedYear}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules || []);
        if (data.schedules?.length > 0 && !selectedScheduleId) {
          setSelectedScheduleId(data.schedules[0].id);
        }
      }
    } catch {
      setError("Failed to load schedules");
    } finally {
      setLoading(false);
    }
  }

  // Load plans for selected schedule + campus
  async function loadPlans() {
    if (!selectedScheduleId) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/admin/exam-seating/plan?scheduleId=${selectedScheduleId}&campus=${selectedCampus}`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
        setSelectedDayIdx(0);
      }
    } catch {
      setError("Failed to load plans");
    }
  }

  useEffect(() => {
    if (user) loadSchedules();
  }, [user, selectedYear]);

  useEffect(() => {
    if (selectedScheduleId) loadPlans();
  }, [selectedScheduleId, selectedCampus]);

  // Generate plan
  async function handleGenerate() {
    if (!selectedScheduleId) return;
    setGenerating(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const headers = await getAuthHeaders();

      // Delete old plans first
      await fetch("/api/admin/exam-seating/plan", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ scheduleId: selectedScheduleId, campus: selectedCampus }),
      });

      // Generate new
      const res = await fetch("/api/admin/exam-seating/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({ scheduleId: selectedScheduleId, campus: selectedCampus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Generation failed");
      }

      const data = await res.json();
      setSuccessMsg(`Generated seating plans for ${data.totalDays} exam days!`);
      await loadPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setGenerating(false);
    }
  }

  // Print current day's plan
  function handlePrint() {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Exam Seating Plan</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .hall { page-break-after: always; margin-bottom: 30px; }
            .hall:last-child { page-break-after: auto; }
            .hall-header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #333; padding-bottom: 10px; }
            .hall-header h2 { margin: 0 0 5px 0; font-size: 18px; }
            .hall-header p { margin: 2px 0; font-size: 12px; color: #666; }
            table { border-collapse: collapse; width: 100%; margin-top: 10px; }
            td { border: 1px solid #ccc; padding: 4px 6px; text-align: center; font-size: 10px; min-width: 80px; height: 45px; vertical-align: middle; }
            .student-name { font-weight: bold; font-size: 10px; }
            .student-info { font-size: 8px; color: #666; }
            .empty-seat { background: #f5f5f5; color: #ccc; }
            .legend { margin-top: 15px; font-size: 10px; }
            .legend span { display: inline-block; padding: 2px 8px; margin: 2px; border: 1px solid #ddd; border-radius: 3px; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          ${printRef.current.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  const selectedSchedule = schedules.find((s) => s.id === selectedScheduleId);
  const currentPlan = plans[selectedDayIdx];

  // Build class-color map for current plan
  const classColorMap = new Map<string, string>();
  if (currentPlan) {
    const uniqueClasses = new Set<string>();
    for (const hall of currentPlan.halls) {
      for (const row of hall.seats) {
        for (const seat of row) {
          if (seat) uniqueClasses.add(`${seat.className} — ${seat.section}`);
        }
      }
    }
    [...uniqueClasses].sort().forEach((cls, i) => {
      classColorMap.set(cls, CLASS_COLORS[i % CLASS_COLORS.length]);
    });
  }

  const gradeGroupLabels: Record<string, string> = {
    junior: "Junior (4–8)",
    high: "High (9–12)",
    all: "All (4–12)",
  };

  return (
    <div className="space-y-6" dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutGrid className="h-6 w-6" />
            Exam Seating Plan
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate and view exam seating arrangements
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm px-4 py-2 rounded-md flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}
      {successMsg && (
        <div className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 text-sm px-4 py-2 rounded-md">
          ✓ {successMsg}
        </div>
      )}

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Schedule</label>
              <select
                value={selectedScheduleId}
                onChange={(e) => {
                  setSelectedScheduleId(e.target.value);
                  setPlans([]);
                }}
                className="h-9 rounded-md border bg-background px-3 text-sm min-w-[200px]"
              >
                <option value="">— Select —</option>
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.examType} Final — {gradeGroupLabels[s.gradeGroup] || s.gradeGroup}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Campus</label>
              <select
                value={selectedCampus}
                onChange={(e) => {
                  setSelectedCampus(e.target.value);
                  setPlans([]);
                }}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="Boys">Boys&apos; School</option>
                <option value="Girls">Girls&apos; School</option>
              </select>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={!selectedScheduleId || generating}
              className="gap-2"
            >
              {generating ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {generating ? "Generating..." : "Generate Plan"}
            </Button>

            {plans.length > 0 && (
              <Button variant="outline" onClick={handlePrint} className="gap-2">
                <Printer className="h-4 w-4" />
                Print
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Day tabs */}
      {plans.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {plans.map((plan, idx) => (
            <button
              key={plan.id}
              onClick={() => setSelectedDayIdx(idx)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                selectedDayIdx === idx
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-accent"
              }`}
            >
              <div>{plan.examDate}</div>
              <div className="text-xs opacity-80">{plan.subjectName}</div>
            </button>
          ))}
        </div>
      )}

      {/* Seating Grid View */}
      {currentPlan && (
        <div ref={printRef} className="space-y-6">
          {/* Summary */}
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="font-medium">{currentPlan.examDate}</span>
            <span className="text-muted-foreground">|</span>
            <span>{currentPlan.subjectName}</span>
            <span className="text-muted-foreground">|</span>
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {currentPlan.totalStudents} students
            </span>
            <span className="text-muted-foreground">|</span>
            <span>{currentPlan.halls.length} halls</span>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-1.5">
            {[...classColorMap.entries()].map(([cls, color]) => (
              <span key={cls} className={`text-[10px] px-2 py-0.5 rounded ${color}`}>
                {cls}
              </span>
            ))}
          </div>

          {/* Hall grids */}
          {currentPlan.halls.map((hall) => (
            <Card key={hall.hallId}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{hall.hallName}</CardTitle>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{hall.studentCount} students</span>
                    <span>{hall.rows} × {hall.columns}</span>
                    {hall.proctors.length > 0 && (
                      <span className="font-medium text-foreground">
                        Proctor{hall.proctors.length > 1 ? "s" : ""}: {hall.proctors.map((p) => p.name).join(", ")}
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="border-collapse w-full">
                    <thead>
                      <tr>
                        <th className="p-1 text-[10px] text-muted-foreground w-8"></th>
                        {Array.from({ length: hall.columns }, (_, c) => (
                          <th key={c} className="p-1 text-[10px] text-muted-foreground text-center">
                            {c + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {hall.seats.map((row, r) => (
                        <tr key={r}>
                          <td className="p-1 text-[10px] text-muted-foreground text-center font-medium">
                            {r + 1}
                          </td>
                          {row.map((seat, c) => {
                            if (!seat) {
                              return (
                                <td key={c} className="border p-1 text-center bg-muted/30 min-w-[100px] h-[50px]">
                                  <span className="text-[10px] text-muted-foreground">—</span>
                                </td>
                              );
                            }
                            const cls = `${seat.className} — ${seat.section}`;
                            const color = classColorMap.get(cls) || "bg-gray-100";
                            return (
                              <td
                                key={c}
                                className={`border p-1 text-center min-w-[100px] h-[50px] ${color}`}
                                title={`${seat.studentName}\n${seat.className} - ${seat.section}\n#${seat.studentNumber}`}
                              >
                                <div className="text-[10px] font-medium leading-tight truncate">
                                  {seat.studentName.length > 20
                                    ? seat.studentName.slice(0, 18) + "…"
                                    : seat.studentName}
                                </div>
                                <div className="text-[8px] opacity-70 truncate">
                                  {seat.className} · {seat.section}
                                </div>
                                <div className="text-[8px] opacity-50">
                                  #{seat.studentNumber}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && plans.length === 0 && selectedScheduleId && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No seating plans generated yet. Select a schedule and click &quot;Generate Plan&quot;.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
