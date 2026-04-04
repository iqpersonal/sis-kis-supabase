"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Award, TrendingUp, CalendarOff, Clock } from "lucide-react";
import { AnimatedCounter } from "@/components/dashboard/animated-counter";

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
      value: totalExams,
      icon: Award,
      description: "Student results this year",
      suffix: "",
      decimals: 0,
    },
    {
      title: "Pass Rate",
      value: passRate,
      icon: TrendingUp,
      description: passRate >= 90 ? "Excellent" : passRate >= 75 ? "Good" : "Needs attention",
      suffix: "%",
      decimals: 1,
    },
    {
      title: "Average Grade",
      value: avgGrade,
      icon: Award,
      description: "Mean final average",
      suffix: "",
      decimals: 1,
    },
    {
      title: "Absence Days",
      value: totalAbsenceDays,
      icon: CalendarOff,
      description: `${totalTardy.toLocaleString()} tardy records`,
      suffix: "",
      decimals: 0,
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
            <div className="text-2xl font-bold">
              <AnimatedCounter value={c.value} suffix={c.suffix} decimals={c.decimals} />
            </div>
            <p className="text-xs text-muted-foreground">{c.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
