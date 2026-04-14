"use client";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Award, TrendingUp, CalendarOff, Clock } from "lucide-react";
import { AnimatedCounter } from "@/components/dashboard/animated-counter";
import { StaggerContainer, StaggerItem } from "@/components/motion";

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
      gradient: "from-primary/10 to-primary/5",
      iconBg: "bg-primary/15",
      iconColor: "text-primary",
    },
    {
      title: "Pass Rate",
      value: passRate,
      icon: TrendingUp,
      description: passRate >= 90 ? "Excellent" : passRate >= 75 ? "Good" : "Needs attention",
      suffix: "%",
      decimals: 1,
      gradient: "from-emerald-500/10 to-emerald-500/5",
      iconBg: "bg-emerald-500/15",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Average Grade",
      value: avgGrade,
      icon: Award,
      description: "Mean final average",
      suffix: "",
      decimals: 1,
      gradient: "from-amber-500/10 to-amber-500/5",
      iconBg: "bg-amber-500/15",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    {
      title: "Absence Days",
      value: totalAbsenceDays,
      icon: CalendarOff,
      description: `${totalTardy.toLocaleString()} tardy records`,
      suffix: "",
      decimals: 0,
      gradient: "from-rose-500/10 to-rose-500/5",
      iconBg: "bg-rose-500/15",
      iconColor: "text-rose-600 dark:text-rose-400",
    },
  ];

  return (
    <StaggerContainer className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <StaggerItem key={c.title}>
          <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow duration-300">
            <div className={`absolute inset-0 bg-gradient-to-br ${c.gradient} pointer-events-none`} />
            <CardContent className="relative p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {c.title}
                  </p>
                  <div className="text-3xl font-extrabold tracking-tight">
                    <AnimatedCounter value={c.value} suffix={c.suffix} decimals={c.decimals} />
                  </div>
                  <p className="text-xs text-muted-foreground/80">{c.description}</p>
                </div>
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${c.iconBg}`}>
                  <c.icon className={`h-5 w-5 ${c.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
