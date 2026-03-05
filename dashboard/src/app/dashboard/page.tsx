"use client";

export const dynamic = "force-dynamic";

import { useSummary, type SummarySchoolData } from "@/hooks/use-sis-data";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";
import { SisKpiCards } from "@/components/dashboard/sis-kpi-cards";
import { RegistrationsByYearChart } from "@/components/dashboard/registrations-chart";
import { NationalityPieChart } from "@/components/dashboard/nationality-pie-chart";
import { FinancialChart } from "@/components/dashboard/financial-chart";
import { TermFinancialCards } from "@/components/dashboard/term-financial-cards";

export default function DashboardOverview() {
  const { selectedYear, selectedLabel, loading: yearLoading } = useAcademicYear();
  const { schoolFilter, schoolLabel } = useSchoolFilter();

  // Single Firestore read — pre-aggregated summary document
  const { summary, loading: loadSummary } = useSummary(selectedYear);

  const loading = yearLoading || loadSummary;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading dashboard...
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Khaled International Schools — {selectedLabel}
          {schoolFilter !== "all" && ` — ${schoolLabel}`}
        </p>
      </div>

      {/* KPI row */}
      <SisKpiCards
        totalStudents={schoolData.total_students}
        activeRegistrations={schoolData.active_registrations}
      />

      {/* Per-installment financial KPIs */}
      {hasFinancials && (
        <TermFinancialCards termData={schoolData.financials.installments} />
      )}

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RegistrationsByYearChart data={summary.reg_counts_all_years} />
        <NationalityPieChart data={schoolData.nationalities} />
      </div>

      {/* Financial chart */}
      {hasFinancials && (
        <FinancialChart data={schoolData.financials.chart} />
      )}
    </div>
  );
}
