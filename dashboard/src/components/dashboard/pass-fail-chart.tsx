"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Props {
  data: { name: string; value: number; color: string }[];
}

export function PassFailChart({ data }: Props) {
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pass / Fail Distribution</CardTitle>
        <CardDescription>Student exam outcomes</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]" style={{ minWidth: 0, minHeight: 300 }}>
          <ResponsiveContainer width="100%" height="100%" minHeight={1} minWidth={1}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                label={({ name, percent }) =>
                  `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
              >
                {data.map((entry, i) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [
                  Number(value).toLocaleString(),
                  name,
                ]}
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
