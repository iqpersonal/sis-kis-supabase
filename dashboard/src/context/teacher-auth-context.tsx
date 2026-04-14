"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export interface TeacherProfile {
  uid: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  username: string;
  grade: string;
  schoolYear: string;
  role: string;
}

interface TeacherAuthCtx {
  teacher: TeacherProfile | null;
  loading: boolean;
  error: string | null;
  signIn: (username: string, password: string) => Promise<boolean>;
  signOut: () => void;
}

const STORAGE_KEY = "teacher_session";

const TeacherAuthContext = createContext<TeacherAuthCtx>({
  teacher: null,
  loading: true,
  error: null,
  signIn: async () => false,
  signOut: () => {},
});

export function TeacherAuthProvider({ children }: { children: ReactNode }) {
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setTeacher(JSON.parse(stored) as TeacherProfile);
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
      const res = await fetch("/api/teacher-auth", {
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

      const profile = data.teacher as TeacherProfile;
      setTeacher(profile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));

      // Set cookie so middleware can detect session
      // NOTE: must be named "__session" — Firebase Hosting strips all other cookies
      document.cookie = `__session=teacher; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;

      setLoading(false);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
      setLoading(false);
      return false;
    }
  }, []);

  const signOut = useCallback(() => {
    setTeacher(null);
    localStorage.removeItem(STORAGE_KEY);
    document.cookie = "__session=; path=/; max-age=0";
  }, []);

  return (
    <TeacherAuthContext.Provider
      value={{ teacher, loading, error, signIn, signOut }}
    >
      {children}
    </TeacherAuthContext.Provider>
  );
}

export const useTeacherAuth = () => useContext(TeacherAuthContext);
