"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import {
  useAcademicYear,
} from "@/context/academic-year-context";
import {
  useSchoolFilter,
  type SchoolFilter,
} from "@/context/school-filter-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  BarChart3,
  LayoutDashboard,
  Users,
  LogOut,
  PieChart,
  Upload,
  CalendarDays,
  GraduationCap,
  School,
  CalendarOff,
  DollarSign,
  GitCompareArrows,
  BookOpen,
  CalendarRange,
  TrendingUp,
  Trophy,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/reports", label: "Students", icon: Users },
  { href: "/dashboard/academics", label: "Academics", icon: GraduationCap },
  { href: "/dashboard/subjects", label: "Subject Performance", icon: BookOpen },
  { href: "/dashboard/terms", label: "Term Progress", icon: CalendarRange },
  { href: "/dashboard/subject-trends", label: "Subject Trends", icon: TrendingUp },
  { href: "/dashboard/honor-roll", label: "Honor Roll", icon: Trophy },
  { href: "/dashboard/at-risk", label: "At-Risk Students", icon: AlertTriangle },
  { href: "/dashboard/attendance", label: "Attendance", icon: CalendarOff },
  { href: "/dashboard/delinquency", label: "Delinquency", icon: DollarSign },
  { href: "/dashboard/analytics", label: "Analytics", icon: PieChart },
  { href: "/dashboard/compare", label: "Year Comparison", icon: GitCompareArrows },
  { href: "/dashboard/upload", label: "Upload Data", icon: Upload },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { years, selectedYear, selectedLabel, setSelectedYear, loading: yearsLoading } =
    useAcademicYear();
  const { schoolFilter, setSchoolFilter } = useSchoolFilter();

  const handleSignOut = async () => {
    await signOut();
    document.cookie = "__session=; path=/; max-age=0";
    router.push("/login");
  };

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside className="sticky top-0 flex h-screen w-64 flex-col border-r bg-card">
        <div className="flex h-16 items-center gap-2 px-6">
          <BarChart3 className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold">SiS Dashboard</span>
        </div>

        <Separator />

        {/* Academic Year Picker */}
        <div className="px-4 py-3">
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            Academic Year
          </label>
          <select
            value={selectedYear ?? ""}
            onChange={(e) => setSelectedYear(e.target.value)}
            disabled={yearsLoading}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {years.map((code) => {
              // Convert "22-23" → "2022–2023"
              const parts = code.split("-");
              let label = code;
              if (parts.length === 2) {
                const a = Number(parts[0]);
                const b = Number(parts[1]);
                if (!isNaN(a) && !isNaN(b)) {
                  const y1 = a >= 50 ? 1900 + a : 2000 + a;
                  const y2 = b >= 50 ? 1900 + b : 2000 + b;
                  label = `${y1}–${y2}`;
                }
              }
              return (
                <option key={code} value={code}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>

        <Separator />

        {/* School Filter */}
        <div className="px-4 py-3">
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <School className="h-3.5 w-3.5" />
            School
          </label>
          <select
            value={schoolFilter}
            onChange={(e) => setSchoolFilter(e.target.value as SchoolFilter)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Schools</option>
            <option value="0021-01">Boys&apos; School</option>
            <option value="0021-02">Girls&apos; School</option>
          </select>
        </div>

        <Separator />

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <Separator />

        <div className="p-4">
          <p className="mb-2 truncate text-xs text-muted-foreground">
            {user?.email ?? "—"}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-muted/40 p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
