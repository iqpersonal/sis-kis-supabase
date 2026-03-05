"use client";

export const dynamic = "force-dynamic";

import { useSummary, type SummarySchoolData } from "@/hooks/use-sis-data";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";
import { AcademicKpiCards } from "@/components/dashboard/academic-kpi-cards";
import { PassFailChart } from "@/components/dashboard/pass-fail-chart";
import { GradeDistributionChart } from "@/components/dashboard/grade-distribution-chart";
import { AttendanceChart } from "@/components/dashboard/attendance-chart";
import { ClassBreakdownTable } from "@/components/dashboard/class-breakdown-table";

export default function AcademicsPage() {
  const { selectedYear, selectedLabel, loading: yearLoading } = useAcademicYear();
  const { schoolFilter, schoolLabel } = useSchoolFilter();

  // Single Firestore read — pre-aggregated summary document
  const { summary, loading: loadSummary } = useSummary(selectedYear);

  const loading = yearLoading || loadSummary;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading academics...
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No summary data available for this year. Run the summary generation script.
      </div>
    );
  }

  // Pick the right school data slice
  const schoolData: SummarySchoolData =
    schoolFilter === "all"
      ? summary.all
      : (summary[schoolFilter as "0021-01" | "0021-02"] ?? summary.all);

  const acad = schoolData.academics;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Academics</h1>
        <p className="text-muted-foreground">
          Exam results, attendance &amp; class performance — {selectedLabel}
          {schoolFilter !== "all" && ` — ${schoolLabel}`}
        </p>
      </div>

      {/* KPI Cards */}
      <AcademicKpiCards
        totalExams={acad.total_exams}
        passRate={acad.pass_rate}
        avgGrade={acad.avg_grade}
        totalAbsenceDays={acad.total_absence_days}
        totalTardy={acad.total_tardy}
      />

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PassFailChart data={acad.pass_fail} />
        <GradeDistributionChart data={acad.grade_distribution} />
      </div>

      {/* Attendance Chart */}
      {acad.attendance_by_month.length > 0 && (
        <AttendanceChart data={acad.attendance_by_month} />
      )}

      {/* Class Breakdown Table */}
      <ClassBreakdownTable rows={acad.class_breakdown} />
    </div>
  );
}
