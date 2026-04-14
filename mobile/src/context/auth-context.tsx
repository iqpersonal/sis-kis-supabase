import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs, limit } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

export type UserRole = "parent" | "teacher" | "admin" | "school_admin" | "store_clerk" | "it_manager" | "it_admin" | "super_admin" | "staff";

export function getStoreAccess(role: UserRole | null): { general: boolean; it: boolean } {
  switch (role) {
    case "store_clerk": return { general: true, it: false };
    case "it_manager": return { general: false, it: true };
    case "it_admin": return { general: false, it: true };
    case "super_admin":
    case "school_admin":
    case "admin": return { general: true, it: true };
    default: return { general: false, it: false };
  }
}

export function isStoreRole(role: UserRole | null): boolean {
  return role === "store_clerk" || role === "it_manager" || role === "it_admin";
}

export function isStaffOnlyRole(role: UserRole | null): boolean {
  return role === "staff";
}

interface AuthState {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  role: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // Fetch role from Firestore (admin_users collection)
        try {
          const userDoc = await getDoc(doc(db, "admin_users", firebaseUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setRole((data.role as UserRole) || "admin");
          } else {
            // No admin_users doc → check if they exist in staff collection
            const email = firebaseUser.email || "";
            const staffQ = query(
              collection(db, "staff"),
              where("E_Mail", "==", email.toLowerCase()),
              limit(1)
            );
            const staffSnap = await getDocs(staffQ);
            if (!staffSnap.empty) {
              setRole("staff");
            } else {
              setRole("admin");
            }
          }
        } catch (err) {
          console.warn("Failed to fetch user role:", err);
          setRole("admin");
        }
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
