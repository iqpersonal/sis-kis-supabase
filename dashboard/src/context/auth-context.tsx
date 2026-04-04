/**
 * Auth context – wraps the app and exposes the current Firebase user + RBAC role.
 */
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseAuth, getDb } from "@/lib/firebase";
import type { Role, Permission } from "@/lib/rbac";
import { ROLE_PERMISSIONS, hasPermission, MAJOR_SCOPED_ROLES } from "@/lib/rbac";

interface AuthCtx {
  user: User | null;
  role: Role | null;
  assignedMajor: string | null;
  supervisedClasses: string[];
  supervisedSubjects: string[];
  teaches: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  role: null,
  assignedMajor: null,
  supervisedClasses: [],
  supervisedSubjects: [],
  teaches: false,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
  can: () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [assignedMajor, setAssignedMajor] = useState<string | null>(null);
  const [supervisedClasses, setSupervisedClasses] = useState<string[]>([]);
  const [supervisedSubjects, setSupervisedSubjects] = useState<string[]>([]);
  const [teaches, setTeaches] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let requestId = 0; // Track latest auth event to ignore stale responses
    const authInstance = getFirebaseAuth();
    const unsub = onAuthStateChanged(authInstance, async (u) => {
      const thisRequest = ++requestId;
      setUser(u);
      if (u) {
        // Refresh __session cookie with a fresh Firebase ID token
        try {
          const idToken = await u.getIdToken();
          document.cookie = `__session=${idToken}; path=/; max-age=${3600}; SameSite=Lax; Secure`;
        } catch { /* ignore — cookie will be refreshed next auth event */ }

        try {
          const snap = await getDoc(doc(getDb(), "admin_users", u.uid));
          if (thisRequest !== requestId) return; // Stale — user changed since this request started
          if (snap.exists()) {
            const data = snap.data();
            setRole(data.role as Role);
            setAssignedMajor(data.assigned_major ?? null);
            setSupervisedClasses(Array.isArray(data.supervised_classes) ? data.supervised_classes : []);
            setSupervisedSubjects(Array.isArray(data.supervised_subjects) ? data.supervised_subjects : []);
            setTeaches(!!data.teaches);
          } else {
            // No admin_users doc → default to viewer (safe). Super-admin bootstrap happens server-side.
            setRole("viewer");
            setAssignedMajor(null);
            setSupervisedClasses([]);
            setSupervisedSubjects([]);
            setTeaches(false);
          }
        } catch {
          if (thisRequest !== requestId) return;
          setRole("viewer");
          setAssignedMajor(null);
          setSupervisedClasses([]);
          setSupervisedSubjects([]);
          setTeaches(false);
        }
      } else {
        setRole(null);
        setAssignedMajor(null);
        setSupervisedClasses([]);
        setSupervisedSubjects([]);
        setTeaches(false);
      }
      if (thisRequest === requestId) setLoading(false);
    });
    return unsub;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth());
  }, []);

  const can = useCallback((permission: Permission): boolean => {
    if (!role) return false;
    return hasPermission(role, permission);
  }, [role]);

  const value = useMemo(() => ({
    user, role, assignedMajor, supervisedClasses, supervisedSubjects, teaches, loading, signIn, signUp, signOut, can,
  }), [user, role, assignedMajor, supervisedClasses, supervisedSubjects, teaches, loading, signIn, signUp, signOut, can]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
