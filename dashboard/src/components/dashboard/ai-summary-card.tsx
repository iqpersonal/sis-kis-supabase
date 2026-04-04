"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw } from "lucide-react";
import type { Report } from "@/types/report";

interface Props {
  reports: Report[];
}

export function AiSummaryCard({ reports }: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reports }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setSummary(data.summary);
    } catch {
      setSummary("Failed to generate summary. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            AI Performance Summary
          </CardTitle>
          <CardDescription>
            AI-generated analysis of the current month
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchSummary}
          disabled={loading}
        >
          {loading ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {summary ? "Refresh" : "Generate"}
        </Button>
      </CardHeader>
      <CardContent>
        {summary ? (
          <p className="leading-relaxed text-sm text-foreground/90">
            {summary}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Click <strong>Generate</strong> to get an AI-powered summary of this
            month&apos;s performance based on your report data.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
