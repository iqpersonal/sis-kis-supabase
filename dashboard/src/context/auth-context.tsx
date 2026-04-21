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
import { doc, getDoc, collection, query, where, limit, getDocs } from "firebase/firestore";
import { getFirebaseAuth, getDb } from "@/lib/firebase";
import type { Role, Permission } from "@/lib/rbac";
import { ROLE_PERMISSIONS, hasPermission, MAJOR_SCOPED_ROLES } from "@/lib/rbac";

interface AuthCtx {
  user: User | null;
  role: Role | null;
  secondaryRoles: Role[];
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
  secondaryRoles: [],
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
  const [secondaryRoles, setSecondaryRoles] = useState<Role[]>([]);
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
            setSecondaryRoles(
              Array.isArray(data.secondary_roles)
                ? (data.secondary_roles as string[]).filter((r) => r in ROLE_PERMISSIONS) as Role[]
                : []
            );
            setAssignedMajor(data.assigned_major ?? null);
            setSupervisedClasses(Array.isArray(data.supervised_classes) ? data.supervised_classes : []);
            setSupervisedSubjects(Array.isArray(data.supervised_subjects) ? data.supervised_subjects : []);
            setTeaches(!!data.teaches);
          } else {
            // Fallback for accounts where admin_users doc ID differs from Firebase UID.
            // Try resolving by email before defaulting to viewer.
            let emailResolved = false;
            const normalizedEmail = (u.email || "").trim().toLowerCase();
            if (normalizedEmail) {
              const byEmailQ = query(
                collection(getDb(), "admin_users"),
                where("email", "==", normalizedEmail),
                limit(1)
              );
              const byEmail = await getDocs(byEmailQ);
              if (thisRequest !== requestId) return;
              if (!byEmail.empty) {
                const data = byEmail.docs[0].data();
                setRole(data.role as Role);
                setSecondaryRoles(
                  Array.isArray(data.secondary_roles)
                    ? (data.secondary_roles as string[]).filter((r) => r in ROLE_PERMISSIONS) as Role[]
                    : []
                );
                setAssignedMajor(data.assigned_major ?? null);
                setSupervisedClasses(Array.isArray(data.supervised_classes) ? data.supervised_classes : []);
                setSupervisedSubjects(Array.isArray(data.supervised_subjects) ? data.supervised_subjects : []);
                setTeaches(!!data.teaches);
                emailResolved = true;
              }
            }

            if (!emailResolved) {
              // No admin_users mapping found → default to viewer (safe).
              setRole("viewer");
              setSecondaryRoles([]);
              setAssignedMajor(null);
              setSupervisedClasses([]);
              setSupervisedSubjects([]);
              setTeaches(false);
            }
          }
        } catch {
          if (thisRequest !== requestId) return;
          setRole("viewer");
          setSecondaryRoles([]);
          setAssignedMajor(null);
          setSupervisedClasses([]);
          setSupervisedSubjects([]);
          setTeaches(false);
        }
      } else {
        setRole(null);
        setSecondaryRoles([]);
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
    return hasPermission(role, permission, secondaryRoles);
  }, [role, secondaryRoles]);

  const value = useMemo(() => ({
    user, role, secondaryRoles, assignedMajor, supervisedClasses, supervisedSubjects, teaches, loading, signIn, signUp, signOut, can,
  }), [user, role, secondaryRoles, assignedMajor, supervisedClasses, supervisedSubjects, teaches, loading, signIn, signUp, signOut, can]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
