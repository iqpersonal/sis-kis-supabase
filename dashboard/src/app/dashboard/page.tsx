"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useSummary, type SummarySchoolData } from "@/hooks/use-sis-data";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";
import { useLanguage } from "@/context/language-context";
import { useAuth } from "@/context/auth-context";
import { SisKpiCards } from "@/components/dashboard/sis-kpi-cards";
import { RegistrationsByYearChart } from "@/components/dashboard/registrations-chart";
import { NationalityPieChart } from "@/components/dashboard/nationality-pie-chart";
import { FinancialChart } from "@/components/dashboard/financial-chart";
import { TermFinancialCards } from "@/components/dashboard/term-financial-cards";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SyncStatusBanner } from "@/components/dashboard/sync-status-banner";
import { StoreDashboard } from "@/components/dashboard/store-dashboard";
import { LibraryDashboard } from "@/components/dashboard/library-dashboard";
import { DashboardReportsHub } from "@/components/dashboard/dashboard-reports-hub";
import { PageTransition } from "@/components/motion";
import { ACTIVE_PORTAL_KEY } from "@/components/role-switcher";

const STORE_CLERK_SECTIONS = [
  { label: "General Store", apiBase: "/api/general-store", href: "/dashboard/general-store" },
];
const IT_ADMIN_SECTIONS = [
  { label: "IT Store", apiBase: "/api/it-store", href: "/dashboard/it-store" },
];

export default function DashboardOverview() {
  const { selectedYear, selectedLabel, loading: yearLoading } = useAcademicYear();
  const { schoolFilter, schoolLabel } = useSchoolFilter();
  const { t } = useLanguage();
  const { can, role, secondaryRoles, loading: authLoading } = useAuth();
  const [activePortal, setActivePortal] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(ACTIVE_PORTAL_KEY);
    setActivePortal(stored);
  }, []);

  // Single Firestore read — pre-aggregated summary document
  const { summary, loading: loadSummary } = useSummary(selectedYear);

  const loading = yearLoading || loadSummary || authLoading;

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
                <Skeleton className="mt-2 h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-4 rounded" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
                <Skeleton className="mt-2 h-3 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardContent className="pt-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
          <Card><CardContent className="pt-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  // Determine effective role (active portal overrides for scoped roles)
  const effectiveRole = activePortal && (activePortal === role || secondaryRoles.includes(activePortal as never))
    ? activePortal
    : role;

  // Store / IT roles: show inventory-only dashboard
  if (effectiveRole === "store_clerk") {
    return <StoreDashboard sections={STORE_CLERK_SECTIONS} />;
  }
  if (effectiveRole === "it_admin") {
    return <StoreDashboard sections={IT_ADMIN_SECTIONS} />;
  }
  // Librarian: show library-only dashboard
  if (effectiveRole === "librarian") {
    return <LibraryDashboard />;
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
    <PageTransition className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{t("dashboard")}</h1>
        <p className="text-sm text-muted-foreground">
          Khaled International Schools — {selectedLabel}
          {schoolFilter !== "all" && ` — ${schoolLabel}`}
        </p>
      </div>

      {/* Sync status (admin only) */}
      {can("admin.users") && <SyncStatusBanner />}

      {/* KPI row */}
      <SisKpiCards
        activeRegistrations={schoolData.active_registrations}
      />

      {/* Per-installment financial KPIs */}
      {hasFinancials && can("fees.view") && (
        <TermFinancialCards termData={schoolData.financials.installments} />
      )}

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RegistrationsByYearChart data={summary.reg_counts_all_years} />
        <NationalityPieChart data={schoolData.nationalities} />
      </div>

      {/* Financial chart */}
      {hasFinancials && can("fees.view") && (
        <FinancialChart data={schoolData.financials.chart} />
      )}

      {/* Quick Reports hub */}
      <DashboardReportsHub />
    </PageTransition>
  );
}
