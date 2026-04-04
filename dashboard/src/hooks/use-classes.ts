"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { getDb } from "@/lib/firebase";

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
        const snap = await getDocs(collection(getDb(), "classes"));
        const map: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.Class_Code) {
            map[String(data.Class_Code)] =
              data.E_Class_Desc || data.E_Class_Abbreviation || String(data.Class_Code);
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
