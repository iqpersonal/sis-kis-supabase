"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useAuth } from "@/context/auth-context";
import { MAJOR_SCOPED_ROLES, type Role } from "@/lib/rbac";

export type SchoolFilter = "all" | "0021-01" | "0021-02";

interface SchoolFilterCtx {
  schoolFilter: SchoolFilter;
  schoolLabel: string;
  setSchoolFilter: (f: SchoolFilter) => void;
  /** True when the school filter is locked to the user's assigned major */
  locked: boolean;
}

const SchoolFilterContext = createContext<SchoolFilterCtx>({
  schoolFilter: "all",
  schoolLabel: "All Schools",
  setSchoolFilter: () => {},
  locked: false,
});

export const useSchoolFilter = () => useContext(SchoolFilterContext);

const LABELS: Record<SchoolFilter, string> = {
  all: "All Schools",
  "0021-01": "Boys' School",
  "0021-02": "Girls' School",
};

export function SchoolFilterProvider({ children }: { children: ReactNode }) {
  const { role, assignedMajor } = useAuth();
  const canSelectSchool = role === "super_admin" || role === "school_admin";
  const roleIsMajorScoped = !!role && MAJOR_SCOPED_ROLES.includes(role as Role);
  const locked = !canSelectSchool;
  const forcedValue = (locked
    ? ((roleIsMajorScoped && assignedMajor ? assignedMajor : "all") as SchoolFilter)
    : null);

  const [schoolFilter, setSchoolFilterInternal] = useState<SchoolFilter>(
    forcedValue ?? "all"
  );

  // When auth loads and the user has a major-scoped role, lock the filter
  useEffect(() => {
    if (forcedValue) setSchoolFilterInternal(forcedValue);
  }, [forcedValue]);

  const setSchoolFilter = useCallback((f: SchoolFilter) => {
    if (locked) return; // prevent changes for locked roles
    setSchoolFilterInternal(f);
  }, [locked]);

  const schoolLabel = LABELS[schoolFilter];

  const value = useMemo(() => ({
    schoolFilter, schoolLabel, setSchoolFilter, locked,
  }), [schoolFilter, schoolLabel, setSchoolFilter, locked]);

  return (
    <SchoolFilterContext.Provider value={value}>
      {children}
    </SchoolFilterContext.Provider>
  );
}
