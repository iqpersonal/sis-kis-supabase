"use client";

export const dynamic = "force-dynamic";

import { useSummary, type SummarySchoolData } from "@/hooks/use-sis-data";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";
import { useLanguage } from "@/context/language-context";
import { useAuth } from "@/context/auth-context";
import { RegistrationsByYearChart } from "@/components/dashboard/registrations-chart";
import { NationalityPieChart } from "@/components/dashboard/nationality-pie-chart";
import { FinancialChart } from "@/components/dashboard/financial-chart";
import { TermFinancialCards } from "@/components/dashboard/term-financial-cards";
import { GradeDistributionChart } from "@/components/dashboard/grade-distribution-chart";
import { PassFailChart } from "@/components/dashboard/pass-fail-chart";
import { AttendanceChart } from "@/components/dashboard/attendance-chart";
import { ClassBreakdownTable } from "@/components/dashboard/class-breakdown-table";
import { AcademicKpiCards } from "@/components/dashboard/academic-kpi-cards";

export default function AnalyticsPage() {
  const { selectedYear, selectedLabel, loading: yearLoading } = useAcademicYear();
  const { schoolFilter, schoolLabel } = useSchoolFilter();
  const { t } = useLanguage();
  const { can } = useAuth();

  // Single Firestore read — pre-aggregated summary document
  const { summary, loading: loadSummary } = useSummary(selectedYear);

  const loading = yearLoading || loadSummary;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading analytics...
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

  const hasFinancials = schoolData.financials.installments.some(
    (i) => i.totalCharges > 0 || i.totalPaid > 0
  );

  const acad = schoolData.academics;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("analytics")}</h1>
        <p className="text-muted-foreground">
          {t("visualBreakdown")} — {selectedLabel}
          {schoolFilter !== "all" && ` — ${schoolLabel}`}
        </p>
      </div>

      {/* Academic KPIs */}
      <AcademicKpiCards
        totalExams={acad.total_exams}
        passRate={acad.pass_rate}
        avgGrade={acad.avg_grade}
        totalAbsenceDays={acad.total_absence_days}
        totalTardy={acad.total_tardy}
      />

      {/* Charts Row 1: Registrations + Nationality */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RegistrationsByYearChart data={summary.reg_counts_all_years} />
        <NationalityPieChart data={schoolData.nationalities} />
      </div>

      {/* Charts Row 2: Grade Distribution + Pass/Fail */}
      <div className="grid gap-6 lg:grid-cols-2">
        <GradeDistributionChart data={acad.grade_distribution} />
        <PassFailChart data={acad.pass_fail} />
      </div>

      {/* Charts Row 3: Attendance */}
      {acad.attendance_by_month.length > 0 && (
        <AttendanceChart data={acad.attendance_by_month} />
      )}

      {/* Class Breakdown Table */}
      {acad.class_breakdown.length > 0 && (
        <ClassBreakdownTable rows={acad.class_breakdown} />
      )}

      {/* Per-installment Financial KPIs */}
      {hasFinancials && can("fees.view") && <TermFinancialCards termData={schoolData.financials.installments} />}

      {hasFinancials && can("fees.view") && (
        <FinancialChart data={schoolData.financials.chart} />
      )}
    </div>
  );
}
