/**
 * Auth context – wraps the app and exposes the current Supabase user + RBAC role.
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
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import type { Role, Permission } from "@/lib/rbac";
import { ROLE_PERMISSIONS, hasPermission } from "@/lib/rbac";

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
    const supabase = getSupabase();

    // Load initial session synchronously then subscribe to changes
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session?.user ?? null, session?.access_token ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        handleSession(session?.user ?? null, session?.access_token ?? null);
      }
    );

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSession(u: User | null, accessToken: string | null) {
    setUser(u);

    if (u && accessToken) {
      // Refresh __session cookie with the Supabase access token
      document.cookie = `__session=${accessToken}; path=/; max-age=${3600}; SameSite=Lax; Secure`;

      try {
        const supabase = getSupabase();
        let { data } = await supabase
          .from("admin_users")
          .select("role, roles, secondary_roles, assigned_major, supervised_classes, supervised_subjects, teaches")
          .eq("id", u.id)
          .single();

        // Fallback: look up by email when user id is not in admin_users
        if (!data && u.email) {
          const res = await supabase
            .from("admin_users")
            .select("role, roles, secondary_roles, assigned_major, supervised_classes, supervised_subjects, teaches")
            .eq("email", u.email.trim().toLowerCase())
            .single();
          data = res.data;
        }

        if (data) {
          const PRIORITY: Role[] = [
            "super_admin", "school_admin", "doa", "it_admin", "it_manager",
            "academic_director", "head_of_section", "subject_coordinator", "academic",
            "finance", "accounts", "registrar", "teacher", "librarian",
            "store_clerk", "bookshop", "admissions", "viewer",
          ];
          let resolvedRole: Role;
          if (Array.isArray(data.roles) && data.roles.length > 0) {
            resolvedRole = (data.roles as Role[]).sort(
              (a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b)
            )[0] ?? "viewer";
          } else {
            resolvedRole = (data.role ?? "viewer") as Role;
          }
          setRole(resolvedRole);
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
          setRole("viewer");
          setSecondaryRoles([]);
          setAssignedMajor(null);
          setSupervisedClasses([]);
          setSupervisedSubjects([]);
          setTeaches(false);
        }
      } catch {
        setRole("viewer");
        setSecondaryRoles([]);
        setAssignedMajor(null);
        setSupervisedClasses([]);
        setSupervisedSubjects([]);
        setTeaches(false);
      }
    } else {
      // Clear cookie on sign-out
      document.cookie = "__session=; path=/; max-age=0";
      setRole(null);
      setSecondaryRoles([]);
      setAssignedMajor(null);
      setSupervisedClasses([]);
      setSupervisedSubjects([]);
      setTeaches(false);
    }
    setLoading(false);
  }

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
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
