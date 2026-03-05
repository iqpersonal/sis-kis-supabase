"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  limit,
  orderBy,
  startAfter,
  where,
  getCountFromServer,
  type DocumentSnapshot,
  type QueryConstraint,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";

/* ------------------------------------------------------------------ */
/*  In-memory cache to avoid re-fetching identical Firestore queries   */
/* ------------------------------------------------------------------ */
const dataCache = new Map<string, { data: unknown; ts: number }>();
const REF_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours – reference tables rarely change
const FILTER_CACHE_TTL = 30 * 60 * 1000;    // 30 minutes – year-filtered data
const SUMMARY_CACHE_TTL = 60 * 60 * 1000;   // 60 minutes – pre-aggregated summaries

function getCached<T>(key: string): T | null {
  const entry = dataCache.get(key);
  if (!entry) return null;
  // Each key stores its own TTL category via prefix
  let ttl = FILTER_CACHE_TTL;
  if (key.startsWith("ref:")) ttl = REF_CACHE_TTL;
  else if (key.startsWith("summary:")) ttl = SUMMARY_CACHE_TTL;
  else if (key.startsWith("regCounts:")) ttl = FILTER_CACHE_TTL;
  if (Date.now() - entry.ts < ttl) {
    return entry.data as T;
  }
  dataCache.delete(key);
  return null;
}

function setCache(key: string, data: unknown) {
  dataCache.set(key, { data, ts: Date.now() });
}

interface CollectionStats {
  name: string;
  collection: string;
  count: number;
}

/** Fetch counts for all SiS collections */
export function useCollectionStats() {
  const [stats, setStats] = useState<CollectionStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = getDb();
        const collections = [
          { name: "Students", collection: "students" },
          { name: "Sponsors", collection: "sponsors" },
          { name: "Registrations", collection: "registrations" },
          { name: "Charges", collection: "student_charges" },
          { name: "Invoices", collection: "student_invoices" },
          { name: "Installments", collection: "student_installments" },
          { name: "Discounts", collection: "student_discounts" },
          { name: "Absence", collection: "student_absence" },
          { name: "Exam Results", collection: "student_exam_results" },
          { name: "Tardy", collection: "student_tardy" },
          { name: "Sections", collection: "sections" },
          { name: "Section Averages", collection: "section_averages" },
          { name: "Classes", collection: "classes" },
          { name: "Subjects", collection: "subjects" },
          { name: "Employees", collection: "employees" },
          { name: "Academic Years", collection: "academic_years" },
        ];

        const results: CollectionStats[] = [];

        for (const col of collections) {
          try {
            const snap = await getCountFromServer(
              collection(db, col.collection)
            );
            results.push({
              name: col.name,
              collection: col.collection,
              count: snap.data().count,
            });
          } catch {
            results.push({ ...col, count: 0 });
          }
        }

        setStats(results);
      } catch (err: unknown) {
        console.error("Failed to fetch collection stats:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load statistics"
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { stats, loading, error };
}

/** Fetch documents from a Firestore collection with optional limit (cached 24 h) */
export function useCollection<T extends { id: string }>(
  collectionName: string,
  maxDocs = 500
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (maxDocs <= 0) {
      setData([]);
      setLoading(false);
      return;
    }
    const cacheKey = `ref:${collectionName}:${maxDocs}`;
    const cached = getCached<T[]>(cacheKey);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const db = getDb();
        const q = query(collection(db, collectionName), limit(maxDocs));
        const snap = await getDocs(q);
        const docs = snap.docs.map((d) => ({
          ...(d.data() as Omit<T, "id">),
          id: d.id,
        })) as T[];
        setCache(cacheKey, docs);
        setData(docs);
      } catch (err: unknown) {
        console.error(`Failed to fetch ${collectionName}:`, err);
        setError(
          err instanceof Error ? err.message : `Failed to load ${collectionName}`
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [collectionName, maxDocs]);

  return { data, loading, error };
}

/** Fetch documents filtered by academic year field (cached 30 min).
 *  Pass `yearField` to override the default "Academic_Year" field name
 *  (e.g. "Academic_year" for student_tardy). */
export function useFilteredCollection<T extends { id: string }>(
  collectionName: string,
  academicYear: string | null,
  maxDocs = 10000,
  yearField = "Academic_Year"
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!academicYear) {
      setData([]);
      setLoading(false);
      return;
    }
    const cacheKey = `filt:${collectionName}:${yearField}:${academicYear}:${maxDocs}`;
    const cached = getCached<T[]>(cacheKey);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const db = getDb();
        // Try both string and number representations
        const yearNum = Number(academicYear);
        const constraints: QueryConstraint[] = [
          where(yearField, "==", isNaN(yearNum) ? academicYear : yearNum),
          limit(maxDocs),
        ];
        const q = query(collection(db, collectionName), ...constraints);
        const snap = await getDocs(q);
        const docs = snap.docs.map((d) => ({
          ...(d.data() as Omit<T, "id">),
          id: d.id,
        })) as T[];
        setCache(cacheKey, docs);
        setData(docs);
      } catch (err: unknown) {
        console.error(`Failed to fetch filtered ${collectionName}:`, err);
        setError(
          err instanceof Error ? err.message : `Failed to load ${collectionName}`
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [collectionName, academicYear, maxDocs, yearField]);

  return { data, loading, error };
}

/* ------------------------------------------------------------------ */
/*  Registration counts per academic year (efficient server counts)   */
/* ------------------------------------------------------------------ */

export function useRegistrationCountsByYear(years: string[]) {
  const [data, setData] = useState<{ year: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!years.length) {
      setData([]);
      setLoading(false);
      return;
    }

    const cacheKey = `regCounts:${years.join(",")}`;
    const cached = getCached<{ year: string; count: number }[]>(cacheKey);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      try {
        const db = getDb();
        const results: { year: string; count: number }[] = [];
        // Use server-side aggregation counts instead of fetching all docs
        const promises = years.map(async (year) => {
          const yearNum = Number(year);
          const q = query(
            collection(db, "registrations"),
            where("Academic_Year", "==", isNaN(yearNum) ? year : yearNum)
          );
          const snap = await getCountFromServer(q);
          return { year, count: snap.data().count };
        });
        const counts = await Promise.all(promises);
        results.push(...counts);
        results.sort((a, b) => a.year.localeCompare(b.year));
        setCache(cacheKey, results);
        setData(results);
      } catch (err) {
        console.error("Failed to fetch registration counts:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [years]);

  return { data, loading };
}

/* ------------------------------------------------------------------ */
/*  Pre-aggregated summary document (1 read per year)                 */
/* ------------------------------------------------------------------ */

export interface SummarySchoolData {
  total_students: number;
  active_registrations: number;
  total_registrations: number;
  financials: {
    installments: {
      term: number;
      label: string;
      totalCharges: number;
      totalPaid: number;
      totalDiscount: number;
      outstandingBalance: number;
    }[];
    chart: { year: string; charges: number; collected: number; balance: number }[];
  };
  nationalities: { name: string; value: number }[];
  academics: {
    total_exams: number;
    pass_rate: number;
    avg_grade: number;
    total_absence_days: number;
    total_tardy: number;
    pass_fail: { name: string; value: number; color: string }[];
    grade_distribution: { range: string; students: number }[];
    attendance_by_month: { month: string; absences: number; tardy: number }[];
    class_breakdown: {
      classCode: string;
      className: string;
      students: number;
      avgGrade: number;
      passRate: number;
      absenceDays: number;
    }[];
  };
  attendance_detail: {
    total_absence_days: number;
    total_tardy: number;
    students_with_absences: number;
    students_with_tardy: number;
    avg_absence_per_student: number;
    avg_tardy_per_student: number;
    top_absentees: { studentNumber: string; studentName: string; days: number; className: string }[];
    absence_by_class: {
      classCode: string;
      className: string;
      students: number;
      absenceDays: number;
      tardyCount: number;
      avgAbsence: number;
    }[];
    tardy_by_class: { classCode: string; className: string; count: number }[];
  };
  delinquency: {
    total_charged: number;
    total_paid: number;
    total_outstanding: number;
    total_discount: number;
    collection_rate: number;
    students_fully_paid: number;
    students_with_balance: number;
    students_zero_paid: number;
    balance_by_installment: {
      term: number;
      label: string;
      outstanding: number;
      charged: number;
      rate: number;
    }[];
    balance_by_class: {
      classCode: string;
      className: string;
      outstanding: number;
      charged: number;
      rate: number;
    }[];
    top_delinquents: {
      studentNumber: string;
      studentName: string;
      charged: number;
      paid: number;
      balance: number;
      className: string;
    }[];
  };
  subject_performance: {
    subjects: {
      name: string;
      avg: number;
      min: number;
      max: number;
      sectionCount: number;
    }[];
    heatmap: {
      className: string;
      subjects: { name: string; avg: number }[];
    }[];
    strongest_subject: string;
    weakest_subject: string;
  };
  term_progress: {
    terms: {
      termCode: string;
      termName: string;
      avgGrade: number;
      passRate: number;
      count: number;
    }[];
    term_by_subject: {
      subject: string;
      terms: { term: string; avg: number }[];
    }[];
  };
  subject_trends: {
    trends: {
      subject: string;
      years: { year: string; avg: number }[];
    }[];
  };
  honor_roll: {
    total_honor: number;
    honor_rate: number;
    top_students: {
      studentNumber: string;
      studentName: string;
      avg: number;
      classRank: number;
      secRank: number;
      className: string;
    }[];
    honor_by_class: {
      classCode: string;
      className: string;
      count: number;
      total: number;
      rate: number;
    }[];
  };
  at_risk: {
    total_at_risk: number;
    at_risk_rate: number;
    at_risk_students: {
      studentNumber: string;
      studentName: string;
      avg: number;
      absenceDays: number;
      className: string;
    }[];
    at_risk_by_class: {
      classCode: string;
      className: string;
      count: number;
      total: number;
      rate: number;
    }[];
  };
}

export interface YearSummary {
  academic_year: string;
  updated_at: string;
  all: SummarySchoolData;
  "0021-01"?: SummarySchoolData;
  "0021-02"?: SummarySchoolData;
  reg_counts_all_years: { year: string; count: number }[];
}

export function useSummary(academicYear: string | null) {
  const [summary, setSummary] = useState<YearSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!academicYear) {
      setSummary(null);
      setLoading(false);
      return;
    }

    const cacheKey = `summary:${academicYear}`;
    const cached = getCached<YearSummary>(cacheKey);
    if (cached) {
      setSummary(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      try {
        const db = getDb();
        const docRef = doc(db, "summaries", academicYear);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data() as YearSummary;
          setCache(cacheKey, data);
          setSummary(data);
        } else {
          setSummary(null);
        }
      } catch (err: unknown) {
        console.error("Failed to fetch summary:", err);
        setError(err instanceof Error ? err.message : "Failed to load summary");
      } finally {
        setLoading(false);
      }
    })();
  }, [academicYear]);

  return { summary, loading, error };
}

/* ------------------------------------------------------------------ */
/*  Cursor-based paginated collection hook                            */
/* ------------------------------------------------------------------ */

export interface PaginationState {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function usePaginatedCollection<T extends { id: string }>(
  collectionName: string,
  orderField: string,
  initialPageSize = 50,
  filterYear: string | null = null
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [totalCount, setTotalCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);

  // Stack of last-document cursors for each visited page
  const cursorsRef = useRef<(DocumentSnapshot | null)[]>([null]);

  // Fetch count (filtered if year supplied)
  useEffect(() => {
    (async () => {
      try {
        const db = getDb();
        let q;
        if (filterYear) {
          const yearNum = Number(filterYear);
          q = query(
            collection(db, collectionName),
            where("Academic_Year", "==", isNaN(yearNum) ? filterYear : yearNum)
          );
        } else {
          q = collection(db, collectionName);
        }
        const snap = await getCountFromServer(q);
        setTotalCount(snap.data().count);
      } catch {
        /* count is non-critical */
      }
    })();
  }, [collectionName, filterYear]);

  // Fetch current page
  const fetchPage = useCallback(
    async (pageIndex: number, size: number) => {
      setLoading(true);
      setError(null);
      try {
        const db = getDb();
        const constraints: QueryConstraint[] = [];

        // Year filter
        if (filterYear) {
          const yearNum = Number(filterYear);
          constraints.push(
            where("Academic_Year", "==", isNaN(yearNum) ? filterYear : yearNum)
          );
        }

        constraints.push(orderBy(orderField));
        constraints.push(limit(size + 1)); // fetch one extra to detect next page

        const cursor = cursorsRef.current[pageIndex];
        if (cursor) {
          constraints.push(startAfter(cursor));
        }

        const q = query(collection(db, collectionName), ...constraints);
        const snap = await getDocs(q);

        const docs = snap.docs.map((d) => ({
          ...(d.data() as Omit<T, "id">),
          id: d.id,
        })) as T[];

        if (docs.length > size) {
          // There is a next page
          setHasNext(true);
          docs.pop(); // remove the extra probe doc
          // Store cursor for next page (last doc of current page)
          cursorsRef.current[pageIndex + 1] = snap.docs[size - 1];
        } else {
          setHasNext(false);
        }

        setData(docs);
        setPage(pageIndex);
      } catch (err: unknown) {
        console.error(`Failed to fetch ${collectionName} page:`, err);
        setError(
          err instanceof Error ? err.message : `Failed to load ${collectionName}`
        );
      } finally {
        setLoading(false);
      }
    },
    [collectionName, orderField, filterYear]
  );

  // Refetch when year changes
  useEffect(() => {
    cursorsRef.current = [null];
    setPage(0);
    fetchPage(0, pageSize);
  }, [fetchPage, pageSize]);

  const goNext = useCallback(() => {
    if (hasNext) fetchPage(page + 1, pageSize);
  }, [hasNext, page, pageSize, fetchPage]);

  const goPrev = useCallback(() => {
    if (page > 0) fetchPage(page - 1, pageSize);
  }, [page, pageSize, fetchPage]);

  const goFirst = useCallback(() => {
    fetchPage(0, pageSize);
  }, [pageSize, fetchPage]);

  const setPageSize = useCallback(
    (size: number) => {
      cursorsRef.current = [null];
      setPageSizeState(size);
      // useEffect will refetch page 0
    },
    []
  );

  const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0;

  const pagination: PaginationState = {
    page,
    pageSize,
    totalCount,
    totalPages,
    hasNext,
    hasPrev: page > 0,
  };

  return {
    data,
    loading,
    error,
    pagination,
    goNext,
    goPrev,
    goFirst,
    setPageSize,
  };
}
