"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  collection,
  getDocs,
  query,
  limit,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/context/auth-context";

/* ── Session-level cache for academic years ── */
let ayCache: { years: string[]; defaultYear: string | null; ts: number } | null = null;
const AY_CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface AcademicYearCtx {
  years: string[];               // e.g. ["22-23", "21-22", "20-21", ...]
  selectedYear: string | null;   // e.g. "22-23"
  selectedLabel: string;          // e.g. "2022–2023"
  setSelectedYear: (year: string) => void;
  loading: boolean;
  locked: boolean;
  activeYear: string | null;
}

const AcademicYearContext = createContext<AcademicYearCtx>({
  years: [],
  selectedYear: null,
  selectedLabel: "All Years",
  setSelectedYear: () => {},
  loading: true,
  locked: false,
  activeYear: null,
});

export const useAcademicYear = () => useContext(AcademicYearContext);

/** Convert "22-23" → "2022–2023" */
function formatYearLabel(code: string): string {
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

export function AcademicYearProvider({ children }: { children: ReactNode }) {
  const [years, setYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYearState] = useState<string | null>(null);
  const [activeYear, setActiveYear] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const { user, role, loading: authLoading } = useAuth();
  const locked = !(role === "super_admin" || role === "school_admin");

  const setSelectedYearInternal = useCallback((year: string | null) => {
    setSelectedYearState(year);
  }, []);

  const setSelectedYear = useCallback((year: string) => {
    if (locked) return;
    setSelectedYearInternal(year);
  }, [locked, setSelectedYearInternal]);

  useEffect(() => {
    // Skip Firestore reads on parent portal routes (no Firebase Auth there)
    if (pathname?.startsWith("/parent")) {
      setLoading(false);
      return;
    }

    // Wait for auth to resolve; if not logged in, skip
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    // Return cached data if still fresh
    if (ayCache && Date.now() - ayCache.ts < AY_CACHE_TTL) {
      setYears(ayCache.years);
      setActiveYear(ayCache.defaultYear);
      setSelectedYearInternal(ayCache.defaultYear);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const db = getDb();

        // 1) Try the dedicated academic_years collection first
        const aySnap = await getDocs(collection(db, "academic_years"));
        if (aySnap.size > 0) {
          const docs = aySnap.docs.map((d) => d.data());
          const codes = docs
            .map((d) => String(d.Academic_Year ?? ""))
            .filter(Boolean);
          const unique = [...new Set(codes)].sort().reverse();
          setYears(unique);

          // Default to the year marked Current_Year, or newest
          const currentDoc = docs.find((d) => d.Current_Year === true);
          const defaultYear = currentDoc
            ? String(currentDoc.Academic_Year)
            : unique[0] ?? null;
          setActiveYear(defaultYear);
          setSelectedYearInternal(defaultYear);
          ayCache = { years: unique, defaultYear, ts: Date.now() };
          setLoading(false);
          return;
        }

        // 2) Fallback: scan a smaller sample of registrations for distinct Academic_Year values
        const regSnap = await getDocs(
          query(collection(db, "registrations"), limit(500))
        );
        const yearSet = new Set<string>();
        regSnap.docs.forEach((d) => {
          const y = d.data().Academic_Year;
          if (y) yearSet.add(String(y));
        });
        const sorted = [...yearSet].sort().reverse(); // newest first
        setYears(sorted);
        setActiveYear(sorted[0] ?? null);
        setSelectedYearInternal(sorted[0] ?? null);
        ayCache = { years: sorted, defaultYear: sorted[0] ?? null, ts: Date.now() };
      } catch (err) {
        console.error("Failed to discover academic years:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, authLoading, pathname, locked]);

  // Non-admin roles are always pinned to the active year.
  useEffect(() => {
    if (!locked) return;
    if (!activeYear) return;
    if (selectedYear !== activeYear) setSelectedYearInternal(activeYear);
  }, [locked, activeYear, selectedYear]);

  const selectedLabel = selectedYear
    ? formatYearLabel(selectedYear)
    : "All Years";

  return (
    <AcademicYearContext.Provider
      value={{ years, selectedYear, selectedLabel, setSelectedYear, loading, locked, activeYear }}
    >
      {children}
    </AcademicYearContext.Provider>
  );
}
