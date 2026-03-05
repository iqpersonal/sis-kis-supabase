"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type SchoolFilter = "all" | "0021-01" | "0021-02";

interface SchoolFilterCtx {
  schoolFilter: SchoolFilter;
  schoolLabel: string;
  setSchoolFilter: (f: SchoolFilter) => void;
}

const SchoolFilterContext = createContext<SchoolFilterCtx>({
  schoolFilter: "all",
  schoolLabel: "All Schools",
  setSchoolFilter: () => {},
});

export const useSchoolFilter = () => useContext(SchoolFilterContext);

const LABELS: Record<SchoolFilter, string> = {
  all: "All Schools",
  "0021-01": "Boys' School",
  "0021-02": "Girls' School",
};

export function SchoolFilterProvider({ children }: { children: ReactNode }) {
  const [schoolFilter, setSchoolFilter] = useState<SchoolFilter>("all");

  const schoolLabel = LABELS[schoolFilter];

  return (
    <SchoolFilterContext.Provider
      value={{ schoolFilter, schoolLabel, setSchoolFilter }}
    >
      {children}
    </SchoolFilterContext.Provider>
  );
}
