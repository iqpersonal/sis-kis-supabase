"use client";

import { useAuth } from "@/context/auth-context";
import type { Permission } from "@/lib/rbac";

interface PermissionGateProps {
  /** Required permission(s). If an array, user needs ALL of them. */
  permission: Permission | Permission[];
  /** Rendered when permission is denied (optional). */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Conditionally renders children only if the current user
 * holds the required permission(s).
 *
 * Usage:
 *   <PermissionGate permission="students.edit">
 *     <Button>Edit Student</Button>
 *   </PermissionGate>
 */
export function PermissionGate({
  permission,
  fallback = null,
  children,
}: PermissionGateProps) {
  const { can } = useAuth();

  const perms = Array.isArray(permission) ? permission : [permission];
  const allowed = perms.every((p) => can(p));

  return allowed ? <>{children}</> : <>{fallback}</>;
}
