"use client";

import { useEffect, useState } from "react";

/* ─── In-memory cache (shared across all hook instances) ─── */
let classNameCache: Record<string, string> | null = null;
let classCacheTs = 0;
const CLASS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Shared hook to load class-name map from Firestore with in-memory caching.
 * Replaces the duplicated `getDocs(collection(db, "classes"))` calls
 * found in students, reports, diplomas, messages, whatsapp pages.
 */
export function useClassNames() {
  const [classNameMap, setClassNameMap] = useState<Record<string, string>>(classNameCache ?? {});
  const [loading, setLoading] = useState(!classNameCache);

  useEffect(() => {
    // Return cached data if fresh
    if (classNameCache && Date.now() - classCacheTs < CLASS_CACHE_TTL) {
      setClassNameMap(classNameCache);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/classes");
        const json = await res.json();
        const map: Record<string, string> = {};
        (json.classes ?? []).forEach((d: Record<string, unknown>) => {
          if (d.class_code || d.Class_Code) {
            const code = String(d.class_code ?? d.Class_Code);
            map[code] = String(d.e_class_desc ?? d.E_Class_Desc ?? d.e_class_abbreviation ?? d.E_Class_Abbreviation ?? code);
          }
        });
        classNameCache = map;
        classCacheTs = Date.now();
        setClassNameMap(map);
      } catch (err) {
        console.error("Failed to load class names:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { classNameMap, loading };
}
