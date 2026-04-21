"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Save, CheckCircle, Loader2, CalendarDays } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { PageTransition } from "@/components/motion";

/* ── Types ──────────────────────────────────────────────────────── */

interface AcademicYearRow {
  id: string;
  year: string;
  term_count: number;
  current_year: boolean;
  date_from: string | null;
  date_to: string | null;
}

/* ── Page ───────────────────────────────────────────────────────── */

export default function AcademicYearSettingsPage() {
  const { t, locale } = useLanguage();
  const [rows, setRows] = useState<AcademicYearRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Fetch all academic years
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/academic-year");
        const json = await res.json();
        if (json.years) setRows(json.years);
      } catch {
        console.error("Failed to load academic years");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Update term count
  const handleTermChange = useCallback(
    async (year: string, termCount: number) => {
      // Optimistic update
      setRows((prev) =>
        prev.map((r) => (r.year === year ? { ...r, term_count: termCount } : r))
      );

      setSaving(year);
      setSaved(null);
      try {
        const res = await fetch("/api/academic-year", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year, term_count: termCount }),
        });
        if (!res.ok) throw new Error("Save failed");
        setSaved(year);
        setTimeout(() => setSaved(null), 3000);
      } catch {
        // Revert on error
        setRows((prev) =>
          prev.map((r) =>
            r.year === year ? { ...r, term_count: r.term_count } : r
          )
        );
        alert("Failed to save term count");
      } finally {
        setSaving(null);
      }
    },
    []
  );

  /** Convert "25-26" → "2025–2026" */
  function formatYear(code: string): string {
    const parts = code.split("-");
    if (parts.length === 2) {
      const a = Number(parts[0]);
      const b = Number(parts[1]);
      if (!isNaN(a) && !isNaN(b)) {
        const y1 = a >= 50 ? 1900 + a : 2000 + a;
        const y2 = b >= 50 ? 1900 + b : 2000 + b;
        return `${y1}–${y2}`;
      }
    }
    return code;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            {locale === "ar" ? "إعدادات السنة الدراسية" : "Academic Year Settings"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {locale === "ar"
              ? "اضبط عدد الفصول لكل سنة دراسية. ينطبق على جميع الصفوف والأقسام والتخصصات."
              : "Set the number of terms for each academic year. Applies globally to all classes, sections, and majors."}
          </p>
        </div>

        {/* Year Cards */}
        <div className="grid gap-4 max-w-2xl">
          {rows.map((row) => (
            <Card key={row.year} className="p-5">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                {/* Year Label */}
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold">
                    {formatYear(row.year)}
                  </span>
                  {row.current_year && (
                    <Badge variant="default" className="text-xs">
                      {locale === "ar" ? "السنة الحالية" : "Current"}
                    </Badge>
                  )}
                  {row.date_from && row.date_to && (
                    <span className="text-xs text-muted-foreground">
                      {row.date_from} → {row.date_to}
                    </span>
                  )}
                </div>

                {/* Term Count Selector */}
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {locale === "ar" ? "عدد الفصول:" : "Terms:"}
                  </span>
                  <Select
                    value={String(row.term_count)}
                    onValueChange={(v) => handleTermChange(row.year, Number(v))}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">
                        {locale === "ar" ? "فصلين (2)" : "2 Terms"}
                      </SelectItem>
                      <SelectItem value="3">
                        {locale === "ar" ? "٣ فصول (3)" : "3 Terms"}
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Status indicator */}
                  {saving === row.year && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {saved === row.year && (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>

        {rows.length === 0 && !loading && (
          <Card className="p-8 text-center text-muted-foreground">
            {locale === "ar"
              ? "لم يتم العثور على سنوات دراسية"
              : "No academic years found"}
          </Card>
        )}
      </div>
    </PageTransition>
  );
}
