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
  data: { month: string; absences: number; tardy: number }[];
}

export function AttendanceChart({ data }: Props) {
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attendance Overview</CardTitle>
        <CardDescription>Absence days &amp; tardy records by month</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]" style={{ minWidth: 0, minHeight: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
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
              />
              <Tooltip
                formatter={(value, name) => [
                  Number(value).toLocaleString(),
                  name === "absences" ? "Absence Days" : "Tardy",
                ]}
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                }}
              />
              <Legend />
              <Bar
                dataKey="absences"
                fill="var(--color-chart-4)"
                radius={[4, 4, 0, 0]}
                name="Absence Days"
              />
              <Bar
                dataKey="tardy"
                fill="var(--color-chart-5)"
                radius={[4, 4, 0, 0]}
                name="Tardy"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
