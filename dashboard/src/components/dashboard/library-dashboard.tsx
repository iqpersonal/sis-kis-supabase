"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/motion";
import {
  BookOpen,
  BookCheck,
  Library,
  Clock,
  AlertTriangle,
  Ban,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

type LibraryStats = {
  total_books: number;
  total_copies: number;
  available_copies: number;
  active_borrowings: number;
  overdue: number;
  lost: number;
  damaged: number;
  total_fines: number;
};

type Borrowing = {
  id: string;
  student_number: string;
  student_name: string;
  book_title: string;
  borrow_date: string;
  due_date: string;
  return_date: string | null;
  status: "borrowed" | "returned" | "overdue" | "lost";
};

export function LibraryDashboard() {
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [borrowings, setBorrowings] = useState<Borrowing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, borrowRes] = await Promise.all([
          fetch("/api/library?action=stats"),
          fetch("/api/library?action=borrowings"),
        ]);
        if (statsRes.ok) setStats(await statsRes.json());
        if (borrowRes.ok) {
          const data = await borrowRes.json();
          setBorrowings(data.borrowings || []);
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-9 w-64" />
          <Skeleton className="mt-2 h-4 w-48" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-2 h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const overdue = borrowings.filter((b) => b.status === "overdue");
  const active = borrowings.filter(
    (b) => b.status === "borrowed" || b.status === "overdue"
  );
  const recentReturns = borrowings
    .filter((b) => b.status === "returned")
    .slice(0, 5);

  return (
    <PageTransition className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Library Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Overview of library inventory and borrowings
          </p>
        </div>
        <Link
          href="/dashboard/library"
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Open Library <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* KPI cards */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            title="Total Books"
            value={stats.total_books}
            icon={<Library className="h-5 w-5 text-blue-500" />}
          />
          <KPICard
            title="Available Copies"
            value={stats.available_copies}
            subtitle={`of ${stats.total_copies} total`}
            icon={<BookOpen className="h-5 w-5 text-green-500" />}
          />
          <KPICard
            title="Active Borrowings"
            value={stats.active_borrowings}
            icon={<BookCheck className="h-5 w-5 text-amber-500" />}
          />
          <KPICard
            title="Overdue"
            value={stats.overdue}
            icon={<Clock className="h-5 w-5 text-red-500" />}
            danger={stats.overdue > 0}
          />
        </div>
      )}

      {/* Secondary stats */}
      {stats && (stats.lost > 0 || stats.damaged > 0 || stats.total_fines > 0) && (
        <div className="grid gap-4 sm:grid-cols-3">
          <KPICard
            title="Lost Books"
            value={stats.lost}
            icon={<Ban className="h-5 w-5 text-red-400" />}
            danger={stats.lost > 0}
          />
          <KPICard
            title="Damaged"
            value={stats.damaged}
            icon={<AlertTriangle className="h-5 w-5 text-orange-400" />}
            danger={stats.damaged > 0}
          />
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-lg bg-muted p-2.5">
                <Clock className="h-5 w-5 text-violet-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Outstanding Fines</p>
                <p className="text-2xl font-bold">{stats.total_fines.toFixed(0)} SAR</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Overdue alert */}
      {overdue.length > 0 && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-red-500 flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5" />
              {overdue.length} Overdue Book{overdue.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {overdue.slice(0, 10).map((b) => {
                const days = Math.ceil(
                  (Date.now() - new Date(b.due_date).getTime()) / 86400000
                );
                return (
                  <div key={b.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium">{b.student_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.book_title} · Due {new Date(b.due_date).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="destructive">{days}d overdue</Badge>
                  </div>
                );
              })}
              {overdue.length > 10 && (
                <p className="pt-2 text-xs text-muted-foreground text-center">
                  +{overdue.length - 10} more overdue
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Currently borrowed */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Currently Borrowed ({active.length})
          </CardTitle>
          <CardDescription>Books currently checked out by students</CardDescription>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No active borrowings
            </p>
          ) : (
            <div className="divide-y">
              {active.slice(0, 15).map((b) => (
                <div key={b.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium">{b.student_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.book_title}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant={b.status === "overdue" ? "destructive" : "secondary"}>
                      {b.status}
                    </Badge>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Due {new Date(b.due_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
              {active.length > 15 && (
                <p className="pt-2 text-xs text-muted-foreground text-center">
                  +{active.length - 15} more
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent returns */}
      {recentReturns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Returns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {recentReturns.map((b) => (
                <div key={b.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium">{b.student_name}</p>
                    <p className="text-xs text-muted-foreground">{b.book_title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {b.return_date
                      ? new Date(b.return_date).toLocaleDateString()
                      : "—"}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </PageTransition>
  );
}

/* ── KPI Card ── */
function KPICard({
  title,
  value,
  subtitle,
  icon,
  danger,
}: {
  title: string;
  value: number;
  subtitle?: string;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="rounded-lg bg-muted p-2.5">{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className={`text-2xl font-bold ${danger ? "text-red-500" : ""}`}>
            {value}
          </p>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
