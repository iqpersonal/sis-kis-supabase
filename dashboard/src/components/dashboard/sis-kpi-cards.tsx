"use client";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { GraduationCap } from "lucide-react";
import { AnimatedCounter } from "@/components/dashboard/animated-counter";
import { StaggerContainer, StaggerItem } from "@/components/motion";

interface Props {
  activeRegistrations: number;
}

export function SisKpiCards({
  activeRegistrations,
}: Props) {
  const cards = [
    {
      title: "Active Registrations",
      value: activeRegistrations,
      icon: GraduationCap,
      description: "Current academic year",
      gradient: "from-primary/10 to-primary/5",
      iconBg: "bg-primary/15",
      iconColor: "text-primary",
    },
  ];

  return (
    <StaggerContainer className="grid gap-4 sm:grid-cols-1 max-w-md">
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
                    <AnimatedCounter value={c.value} />
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
