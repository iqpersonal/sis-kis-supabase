"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Props {
  data: { year: string; charges: number; collected: number; balance: number }[];
}

export function FinancialChart({ data }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Financial Overview</CardTitle>
        <CardDescription>Charges vs collections by academic year</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]" style={{ minWidth: 0, minHeight: 300 }}>
          <ResponsiveContainer width="100%" height="100%" minHeight={1} minWidth={1}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="year"
                className="text-xs"
                tick={{ fill: "var(--color-muted-foreground)" }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: "var(--color-muted-foreground)" }}
                tickFormatter={(v: number) =>
                  v >= 1000000
                    ? `${(v / 1000000).toFixed(1)}M`
                    : v >= 1000
                      ? `${(v / 1000).toFixed(0)}K`
                      : String(v)
                }
              />
              <Tooltip
                formatter={(value, name) => [
                  `SAR ${Number(value).toLocaleString()}`,
                  name === "charges" ? "Charges" : name === "collected" ? "Collected" : "Outstanding",
                ]}
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                }}
              />
              <Legend />
              <Bar
                dataKey="charges"
                fill="var(--color-chart-1)"
                radius={[4, 4, 0, 0]}
                name="Charges"
              />
              <Bar
                dataKey="collected"
                fill="var(--color-chart-2)"
                radius={[4, 4, 0, 0]}
                name="Collected"
              />
              <Bar
                dataKey="balance"
                fill="var(--color-chart-4)"
                radius={[4, 4, 0, 0]}
                name="Outstanding"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
