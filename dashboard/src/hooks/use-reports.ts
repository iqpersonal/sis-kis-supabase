"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
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
        const q = query(
          collection(getDb(), "reports"),
          orderBy("date", "desc"),
          limit(200)
        );
        const snap = await getDocs(q);
        const data = snap.docs.map((d) => ({
          ...(d.data() as Omit<Report, "id">),
          id: d.id,
        }));
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
