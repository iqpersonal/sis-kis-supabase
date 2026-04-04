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

export interface StudentProfile {
  student_number: string;
  student_name: string;
  gender: string;
  class_name: string;
  section_name: string;
  school: string;
  family_number: string;
  academic_year: string;
}

interface StudentAuthCtx {
  student: StudentProfile | null;
  loading: boolean;
  error: string | null;
  signIn: (username: string, password: string) => Promise<boolean>;
  signOut: () => void;
}

/* ------------------------------------------------------------------ */
/*  Context                                                           */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "student_session";

const StudentAuthContext = createContext<StudentAuthCtx>({
  student: null,
  loading: true,
  error: null,
  signIn: async () => false,
  signOut: () => {},
});

export function StudentAuthProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setStudent(JSON.parse(stored) as StudentProfile);
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
      const res = await fetch("/api/student-auth", {
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

      const profile = data.student as StudentProfile;
      setStudent(profile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));

      // Set cookie so middleware can detect session
      document.cookie = `__student_session=1; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;

      setLoading(false);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
      setLoading(false);
      return false;
    }
  }, []);

  const signOut = useCallback(() => {
    setStudent(null);
    localStorage.removeItem(STORAGE_KEY);
    document.cookie = "__student_session=; path=/; max-age=0";
  }, []);

  return (
    <StudentAuthContext.Provider
      value={{ student, loading, error, signIn, signOut }}
    >
      {children}
    </StudentAuthContext.Provider>
  );
}

export const useStudentAuth = () => useContext(StudentAuthContext);
