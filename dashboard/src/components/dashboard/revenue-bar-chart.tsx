"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { format, parseISO } from "date-fns";
import type { Report } from "@/types/report";

interface Props {
  reports: Report[];
}

export function RevenueBarChart({ reports }: Props) {
  const data = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of reports) {
      const month = format(parseISO(r.date), "MMM yyyy");
      map.set(month, (map.get(month) ?? 0) + r.revenue);
    }
    // Sort chronologically
    return Array.from(map.entries())
      .sort(
        (a, b) =>
          new Date(a[0]).getTime() - new Date(b[0]).getTime()
      )
      .map(([month, revenue]) => ({ month, revenue }));
  }, [reports]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue Over Time</CardTitle>
        <CardDescription>Monthly revenue from all reports</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]" style={{ minWidth: 0, minHeight: 300 }}>
          <ResponsiveContainer width="100%" height="100%" minHeight={1} minWidth={1}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="month"
                className="text-xs"
                tick={{ fill: "var(--color-muted-foreground)" }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: "var(--color-muted-foreground)" }}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value) => [
                  `$${Number(value).toLocaleString()}`,
                  "Revenue",
                ]}
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                }}
              />
              <Bar
                dataKey="revenue"
                fill="var(--color-chart-1)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
