"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface ParentChild {
  student_number: string;
  child_name: string;
  gender: string;
  current_class: string;
  current_section: string;
  current_year: string;
}

export interface ParentFamily {
  family_number: string;
  username: string;
  father_name: string;
  family_name: string;
  father_phone: string;
  father_email: string;
  mother_phone: string;
  mother_email: string;
  children: ParentChild[];
}

interface ParentAuthCtx {
  family: ParentFamily | null;
  loading: boolean;
  error: string | null;
  signIn: (username: string, password: string) => Promise<boolean>;
  signOut: () => void;
}

/* ------------------------------------------------------------------ */
/*  Context                                                           */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "parent_session";

const ParentAuthContext = createContext<ParentAuthCtx>({
  family: null,
  loading: true,
  error: null,
  signIn: async () => false,
  signOut: () => {},
});

export function ParentAuthProvider({ children }: { children: ReactNode }) {
  const [family, setFamily] = useState<ParentFamily | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ParentFamily;
        setFamily(parsed);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/parent-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        setError("Server error. Please try again.");
        setLoading(false);
        return false;
      }

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Authentication failed");
        setLoading(false);
        return false;
      }

      const familyData = data.family as ParentFamily;
      setFamily(familyData);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(familyData));

      // Set cookie so middleware can detect session
      document.cookie = `__parent_session=1; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;

      setLoading(false);
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Authentication failed"
      );
      setLoading(false);
      return false;
    }
  }, []);

  const signOut = useCallback(() => {
    setFamily(null);
    localStorage.removeItem(STORAGE_KEY);
    document.cookie = "__parent_session=; path=/; max-age=0";
  }, []);

  return (
    <ParentAuthContext.Provider
      value={{ family, loading, error, signIn, signOut }}
    >
      {children}
    </ParentAuthContext.Provider>
  );
}

export const useParentAuth = () => useContext(ParentAuthContext);
