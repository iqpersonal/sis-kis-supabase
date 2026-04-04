import React, { createContext, useContext, useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import * as SecureStore from "expo-secure-store";

interface ParentChild {
  studentNumber: string;
  fullName: string;
  fullNameAr: string;
  class: string;
  section: string;
  school: string;
}

interface ParentState {
  familyNumber: string | null;
  children: ParentChild[];
  selectedChild: ParentChild | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<boolean>;
  signOut: () => void;
  selectChild: (child: ParentChild) => void;
}

const ParentContext = createContext<ParentState>({
  familyNumber: null,
  children: [],
  selectedChild: null,
  loading: true,
  signIn: async () => false,
  signOut: () => {},
  selectChild: () => {},
});

const PARENT_SESSION_KEY = "sis_parent_session";

export function ParentProvider({ children: reactChildren }: { children: React.ReactNode }) {
  const [familyNumber, setFamilyNumber] = useState<string | null>(null);
  const [childrenList, setChildrenList] = useState<ParentChild[]>([]);
  const [selectedChild, setSelectedChild] = useState<ParentChild | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  React.useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(PARENT_SESSION_KEY);
        if (stored) {
          const session = JSON.parse(stored);
          setFamilyNumber(session.familyNumber);
          setChildrenList(session.children);
          if (session.children.length > 0) {
            setSelectedChild(session.children[0]);
          }
        }
      } catch {
        // ignore
      }
      setLoading(false);
    })();
  }, []);

  const signIn = async (username: string, password: string): Promise<boolean> => {
    try {
      // Look up parent credentials in families collection
      const q = query(
        collection(db, "families"),
        where("username", "==", username),
        where("password", "==", password)
      );
      const snap = await getDocs(q);
      if (snap.empty) return false;

      const parentDoc = snap.docs[0].data();
      const famNum = parentDoc.family_number as string;

      // Children are already embedded in the family document
      const childrenData = (parentDoc.children || []) as Array<{
        student_number: string;
        child_name: string;
        current_class: string;
        current_section: string;
        gender: string;
      }>;

      const kids: ParentChild[] = childrenData.map((c) => ({
        studentNumber: c.student_number || "",
        fullName: c.child_name || "",
        fullNameAr: "",
        class: c.current_class || "",
        section: c.current_section || "",
        school: "",
      }));

      setFamilyNumber(famNum);
      setChildrenList(kids);
      if (kids.length > 0) setSelectedChild(kids[0]);

      // Persist session securely
      await SecureStore.setItemAsync(
        PARENT_SESSION_KEY,
        JSON.stringify({ familyNumber: famNum, children: kids })
      );

      return true;
    } catch {
      return false;
    }
  };

  const signOut = async () => {
    setFamilyNumber(null);
    setChildrenList([]);
    setSelectedChild(null);
    await SecureStore.deleteItemAsync(PARENT_SESSION_KEY);
  };

  return (
    <ParentContext.Provider
      value={{
        familyNumber,
        children: childrenList,
        selectedChild,
        loading,
        signIn,
        signOut,
        selectChild: setSelectedChild,
      }}
    >
      {reactChildren}
    </ParentContext.Provider>
  );
}

export function useParent() {
  return useContext(ParentContext);
}
