"use client";

import { StudentAuthProvider } from "@/context/student-auth-context";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StudentAuthProvider>{children}</StudentAuthProvider>;
}
