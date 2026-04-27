import React, { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export type UserRole = "parent" | "teacher" | "admin" | "school_admin" | "store_clerk" | "it_manager" | "it_admin" | "super_admin" | "staff" | "librarian";

/* ── Role helpers (work on the roles ARRAY) ───────────────────── */

/** Returns true if any of the user's roles gives store access */
export function getStoreAccess(roles: UserRole[]): { general: boolean; it: boolean } {
  const has = (r: UserRole) => roles.includes(r);
  if (has("super_admin") || has("school_admin") || has("admin")) return { general: true, it: true };
  return {
    general: has("store_clerk"),
    it: has("it_manager") || has("it_admin"),
  };
}

/** True if the user's ONLY purpose is the store (no teacher/admin overlay) */
export function isStoreRole(roles: UserRole[]): boolean {
  return (
    (roles.includes("store_clerk") || roles.includes("it_manager") || roles.includes("it_admin")) &&
    !roles.some((r) => ["teacher", "admin", "school_admin", "super_admin", "librarian"].includes(r))
  );
}

/** True if the user is a generic staff member with no other elevated role */
export function isStaffOnlyRole(roles: UserRole[]): boolean {
  return roles.length === 1 && roles[0] === "staff";
}

/** True if the user has library access */
export function hasLibraryAccess(roles: UserRole[]): boolean {
  return roles.some((r) =>
    ["librarian", "admin", "school_admin", "super_admin"].includes(r)
  );
}

/** @deprecated — use roles array helpers */
export function isLibrarianRole(role: UserRole | null): boolean {
  return role === "librarian";
}

/* ── Auth context ─────────────────────────────────────────────── */

interface AuthState {
  user: User | null;
  /** Primary (first) role — kept for backward compat */
  role: UserRole | null;
  /** All roles the user holds */
  roles: UserRole[];
  /** Username from admin_users doc (e.g. "pedros.hindoyan") */
  username: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  role: null,
  roles: [],
  username: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchUserProfile(session.user.id, session.user.email ?? "");
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          setUser(session.user);
          await fetchUserProfile(session.user.id, session.user.email ?? "");
        } else {
          setUser(null);
          setRole(null);
          setRoles([]);
          setUsername(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function fetchUserProfile(uid: string, email: string) {
    try {
      let { data } = await supabase
        .from("admin_users")
        .select("role, roles, secondary_roles, username")
        .eq("id", uid)
        .single();

      if (!data && email) {
        const res = await supabase
          .from("admin_users")
          .select("role, roles, secondary_roles, username")
          .eq("email", email.trim().toLowerCase())
          .single();
        data = res.data;
      }

      if (data) {
        // Support both legacy `role` string and new `roles` array
        const rolesArr: UserRole[] = Array.isArray(data.roles) && data.roles.length > 0
          ? (data.roles as UserRole[])
          : [(data.role as UserRole) || "admin"];
        // Also merge secondary_roles (e.g. teacher who is also librarian)
        if (Array.isArray(data.secondary_roles)) {
          for (const r of data.secondary_roles as UserRole[]) {
            if (!rolesArr.includes(r)) rolesArr.push(r);
          }
        }
        setRoles(rolesArr);
        setRole(rolesArr[0]);
        setUsername(data.username || null);
      } else {
        // Check staff table as fallback
        const { data: staffData } = await supabase
          .from("staff")
          .select("id")
          .eq("E_Mail", email.toLowerCase())
          .limit(1)
          .single();
        if (staffData) {
          setRole("staff");
          setRoles(["staff"]);
        } else {
          setRole("admin");
          setRoles(["admin"]);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch user role:", err);
      setRole("admin");
      setRoles(["admin"]);
    }
    setLoading(false);
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, role, roles, username, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

