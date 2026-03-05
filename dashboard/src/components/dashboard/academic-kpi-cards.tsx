"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Award, TrendingUp, CalendarOff, Clock } from "lucide-react";

interface Props {
  totalExams: number;
  passRate: number;
  avgGrade: number;
  totalAbsenceDays: number;
  totalTardy: number;
}

export function AcademicKpiCards({
  totalExams,
  passRate,
  avgGrade,
  totalAbsenceDays,
  totalTardy,
}: Props) {
  const cards = [
    {
      title: "Exam Results",
      value: totalExams.toLocaleString(),
      icon: Award,
      description: "Student results this year",
    },
    {
      title: "Pass Rate",
      value: `${passRate.toFixed(1)}%`,
      icon: TrendingUp,
      description: passRate >= 90 ? "Excellent" : passRate >= 75 ? "Good" : "Needs attention",
    },
    {
      title: "Average Grade",
      value: avgGrade.toFixed(1),
      icon: Award,
      description: "Mean final average",
    },
    {
      title: "Absence Days",
      value: totalAbsenceDays.toLocaleString(),
      icon: CalendarOff,
      description: `${totalTardy.toLocaleString()} tardy records`,
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
