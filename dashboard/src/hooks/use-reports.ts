"use client";

import { useEffect, useState } from "react";
import type { Report } from "@/types/report";

/* ── In-memory cache (shared with session) ── */
let reportsCache: { data: Report[]; ts: number } | null = null;
const REPORTS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export function useReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Return cached data if still fresh
    if (reportsCache && Date.now() - reportsCache.ts < REPORTS_CACHE_TTL) {
      setReports(reportsCache.data);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/reports");
        const json = await res.json();
        const data: Report[] = (json.reports ?? []);
        reportsCache = { data, ts: Date.now() };
        setReports(data);
      } catch (err: unknown) {
        console.error("Failed to fetch reports:", err);
        setError(err instanceof Error ? err.message : "Failed to load reports");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { reports, loading, error };
}
