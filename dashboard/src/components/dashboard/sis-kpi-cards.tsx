"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Users, GraduationCap } from "lucide-react";
import { AnimatedCounter } from "@/components/dashboard/animated-counter";

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
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-1 max-w-md">
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
              <AnimatedCounter value={c.value} />
            </div>
            <p className="text-xs text-muted-foreground">{c.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
