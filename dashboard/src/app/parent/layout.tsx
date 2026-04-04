"use client";

import { ParentAuthProvider } from "@/context/parent-auth-context";

export default function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ParentAuthProvider>{children}</ParentAuthProvider>;
}
