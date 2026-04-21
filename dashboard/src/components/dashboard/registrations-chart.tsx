"use client";

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

interface Props {
  data: { year: string; count: number }[];
}

export function RegistrationsByYearChart({ data }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Registrations by Academic Year</CardTitle>
        <CardDescription>Active student enrollment trends over time</CardDescription>
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
              />
              <Tooltip
                formatter={(value) => [
                  Number(value).toLocaleString(),
                  "Registrations",
                ]}
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                }}
              />
              <Bar
                dataKey="count"
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
