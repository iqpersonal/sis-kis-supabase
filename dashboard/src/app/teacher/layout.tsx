"use client";

import { TeacherAuthProvider } from "@/context/teacher-auth-context";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TeacherAuthProvider>{children}</TeacherAuthProvider>;
}
