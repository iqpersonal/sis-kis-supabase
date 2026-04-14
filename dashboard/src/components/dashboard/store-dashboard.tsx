"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/motion";
import {
  Package,
  Boxes,
  AlertTriangle,
  XCircle,
  ClipboardList,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

type StoreStats = {
  total_items: number;
  total_quantity: number;
  low_stock: number;
  out_of_stock: number;
  by_category: Record<string, number>;
  pending_requests: number;
};

type StoreSection = {
  label: string;
  apiBase: string;
  href: string;
};

export function StoreDashboard({ sections }: { sections: StoreSection[] }) {
  const { role } = useAuth();
  const [statsMap, setStatsMap] = useState<Record<string, StoreStats | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const results: Record<string, StoreStats | null> = {};
      await Promise.all(
        sections.map(async (s) => {
          try {
            const res = await fetch(`${s.apiBase}?action=stats`);
            if (res.ok) {
              results[s.label] = await res.json();
            } else {
              results[s.label] = null;
            }
          } catch {
            results[s.label] = null;
          }
        })
      );
      setStatsMap(results);
      setLoading(false);
    }
    load();
  }, [sections]);

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-9 w-64" />
          <Skeleton className="mt-2 h-4 w-48" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
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

  const title =
    role === "store_clerk"
      ? "General Store Dashboard"
      : role === "it_admin"
      ? "IT Inventory Dashboard"
      : "Store Dashboard";

  return (
    <PageTransition className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Khaled International Schools — Inventory Overview
        </p>
      </div>

      {sections.map((section) => {
        const stats = statsMap[section.label];
        if (!stats) return null;

        const kpis = [
          {
            label: "Total Items",
            value: stats.total_items,
            icon: Package,
            color: "text-primary",
          },
          {
            label: "Total Quantity",
            value: stats.total_quantity,
            icon: Boxes,
            color: "text-primary",
          },
          {
            label: "Low Stock",
            value: stats.low_stock,
            icon: AlertTriangle,
            color: "text-yellow-600",
            border: "border-yellow-200 dark:border-yellow-800",
          },
          {
            label: "Out of Stock",
            value: stats.out_of_stock,
            icon: XCircle,
            color: "text-red-600",
            border: "border-red-200 dark:border-red-800",
          },
          {
            label: "Pending Requests",
            value: stats.pending_requests,
            icon: ClipboardList,
            color: "text-blue-600",
            border: "border-blue-200 dark:border-blue-800",
          },
        ];

        return (
          <div key={section.label} className="space-y-4">
            {sections.length > 1 && (
              <h2 className="text-xl font-semibold">{section.label}</h2>
            )}

            {/* KPI cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {kpis.map((kpi) => (
                <Card key={kpi.label} className={kpi.border}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm font-medium ${kpi.color}`}>
                        {kpi.label}
                      </p>
                      <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                    </div>
                    <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>
                      {kpi.value}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Category breakdown */}
            {stats.by_category &&
              Object.keys(stats.by_category).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Stock by Category
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(stats.by_category).map(([cat, count]) => (
                        <Badge
                          key={cat}
                          variant="secondary"
                          className="text-sm px-3 py-1"
                        >
                          {cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          <span className="ml-1.5 font-bold">{count as number}</span>
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

            {/* Quick link */}
            <Link
              href={section.href}
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              Go to {section.label} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        );
      })}
    </PageTransition>
  );
}
