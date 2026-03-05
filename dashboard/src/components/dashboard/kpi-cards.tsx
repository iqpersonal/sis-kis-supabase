"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DollarSign, Package, TrendingUp, FileText } from "lucide-react";
import type { Report } from "@/types/report";

interface Props {
  reports: Report[];
}

export function KpiCards({ reports }: Props) {
  const totalRevenue = reports.reduce((s, r) => s + r.revenue, 0);
  const totalProfit = reports.reduce((s, r) => s + r.profit, 0);
  const totalUnits = reports.reduce((s, r) => s + r.units, 0);
  const totalReports = reports.length;

  const cards = [
    {
      title: "Total Revenue",
      value: `$${totalRevenue.toLocaleString()}`,
      icon: DollarSign,
      description: "All-time revenue",
    },
    {
      title: "Total Profit",
      value: `$${totalProfit.toLocaleString()}`,
      icon: TrendingUp,
      description: `${((totalProfit / totalRevenue) * 100).toFixed(1)}% margin`,
    },
    {
      title: "Units Sold",
      value: totalUnits.toLocaleString(),
      icon: Package,
      description: "Across all categories",
    },
    {
      title: "Reports",
      value: totalReports.toString(),
      icon: FileText,
      description: `${reports.filter((r) => r.status === "pending").length} pending`,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {c.title}
            </CardTitle>
            <c.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{c.value}</div>
            <p className="text-xs text-muted-foreground">{c.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
