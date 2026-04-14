"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

export interface StaffProfile {
  uid: string;
  email: string;
  staffNumber: string;
  fullNameEn: string;
  fullNameAr: string;
  firstName: string;
  department: string | null;
  position: string | null;
  school: string | null;
  branch: string | null;
  idNumber: string | null;
  isActive: boolean;
}

interface StaffAuthCtx {
  staff: StaffProfile | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => void;
}

const STORAGE_KEY = "staff_session";

const StaffAuthContext = createContext<StaffAuthCtx>({
  staff: null,
  loading: true,
  error: null,
  signIn: async () => false,
  signOut: () => {},
});

async function fetchStaffProfile(user: User): Promise<StaffProfile | null> {
  const token = await user.getIdToken();
  const res = await fetch("/api/staff-portal/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.profile as StaffProfile;
}

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore session on mount & listen for auth state
  useEffect(() => {
    // Try localStorage first for instant UI
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setStaff(JSON.parse(stored) as StaffProfile);
      }
    } catch {
      // ignore
    }

    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const profile = await fetchStaffProfile(user);
          if (profile) {
            setStaff(profile);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
          } else {
            // Authenticated but not a staff member
            setStaff(null);
            localStorage.removeItem(STORAGE_KEY);
          }
        } catch {
          // keep cached profile if fetch fails
        }
      } else {
        setStaff(null);
        localStorage.removeItem(STORAGE_KEY);
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    setLoading(true);

    try {
      const auth = getFirebaseAuth();
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const profile = await fetchStaffProfile(cred.user);

      if (!profile) {
        setError("No staff profile found for this email.");
        await firebaseSignOut(auth);
        setLoading(false);
        return false;
      }

      setStaff(profile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));

      // Set cookie so middleware can detect session
      document.cookie = `__session=staff; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;

      setLoading(false);
      return true;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Authentication failed";
      setError(
        msg.includes("auth/invalid-credential")
          ? "Invalid email or password"
          : msg
      );
      setLoading(false);
      return false;
    }
  }, []);

  const signOut = useCallback(async () => {
    setStaff(null);
    localStorage.removeItem(STORAGE_KEY);
    document.cookie = "__session=; path=/; max-age=0";
    try {
      await firebaseSignOut(getFirebaseAuth());
    } catch {
      // ignore
    }
  }, []);

  return (
    <StaffAuthContext.Provider
      value={{ staff, loading, error, signIn, signOut }}
    >
      {children}
    </StaffAuthContext.Provider>
  );
}

export const useStaffAuth = () => useContext(StaffAuthContext);
