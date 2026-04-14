"use client";

import { StaffAuthProvider } from "@/context/staff-auth-context";

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StaffAuthProvider>{children}</StaffAuthProvider>;
}
