"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { Report } from "@/types/report";

export function useReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const q = query(collection(getDb(), "reports"), orderBy("date", "desc"));
        const snap = await getDocs(q);
        const data = snap.docs.map((d) => ({
          ...(d.data() as Omit<Report, "id">),
          id: d.id,
        }));
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
