"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface ClassRow {
  classCode: string;
  className: string;
  students: number;
  avgGrade: number;
  passRate: number;
  absenceDays: number;
}

interface Props {
  rows: ClassRow[];
}

export function ClassBreakdownTable({ rows }: Props) {

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance by Grade Level</CardTitle>
        <CardDescription>
          Students, average grade, pass rate &amp; absences per class
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Grade</th>
                <th className="pb-2 pr-4 font-medium text-right">Students</th>
                <th className="pb-2 pr-4 font-medium text-right">Avg Grade</th>
                <th className="pb-2 pr-4 font-medium text-right">Pass Rate</th>
                <th className="pb-2 font-medium text-right">Absence Days</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.classCode}
                  className="border-b last:border-0 hover:bg-muted/50"
                >
                  <td className="py-2 pr-4 font-medium">{r.className}</td>
                  <td className="py-2 pr-4 text-right">
                    {r.students.toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {r.avgGrade > 0 ? r.avgGrade.toFixed(1) : "—"}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <span
                      className={
                        r.passRate >= 90
                          ? "text-green-600"
                          : r.passRate >= 75
                            ? "text-yellow-600"
                            : "text-red-600"
                      }
                    >
                      {r.passRate > 0 ? `${r.passRate.toFixed(1)}%` : "—"}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {r.absenceDays.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
