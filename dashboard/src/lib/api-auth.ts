/**
 * Reusable auth helpers for API routes.
 *
 * Usage in any route:
 *   import { verifyAuth, verifyAdmin } from "@/lib/api-auth";
 *
 *   export async function POST(req: NextRequest) {
 *     const auth = await verifyAuth(req);
 *     if (!auth.ok) return auth.response;
 *     // ... auth.uid and auth.role are available
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { ROLE_PERMISSIONS, type Role } from "@/lib/rbac";

interface AuthSuccess {
  ok: true;
  uid: string;
  role: Role;
  secondaryRoles: Role[];
}

interface AuthFailure {
  ok: false;
  response: NextResponse;
}

export type AuthResult = AuthSuccess | AuthFailure;

/**
 * Extract the Firebase ID token from Bearer header OR __session cookie.
 */
function extractToken(req: NextRequest): string | null {
  // 1. Check Authorization header
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  // 2. Fall back to __session cookie (stores Firebase ID token)
  const cookie = req.cookies.get("__session")?.value;
  if (cookie && cookie !== "1") {
    return cookie;
  }
  return null;
}

/**
 * Verify that the request carries a valid Supabase access token.
 * Returns the caller's uid and role if authenticated, or a 401/403 response.
 */
export async function verifyAuth(req: NextRequest): Promise<AuthResult> {
  const token = extractToken(req);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  try {
    const supabase = createServiceClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Invalid token" }, { status: 401 }),
      };
    }

    const { data } = await supabase
      .from("admin_users")
      .select("role, roles, secondary_roles")
      .eq("id", user.id)
      .single();

    // Support both new `roles` array and legacy `role` string
    let role: Role;
    if (data?.roles && Array.isArray(data.roles) && data.roles.length > 0) {
      // Pick the "highest privilege" role from the array for single-role checks
      const PRIORITY: Role[] = [
        "super_admin", "school_admin", "doa", "it_admin", "it_manager",
        "academic_director", "head_of_section", "subject_coordinator", "academic",
        "finance", "accounts", "registrar", "teacher", "librarian",
        "store_clerk", "bookshop", "admissions", "viewer",
      ];
      role = (data.roles as Role[]).sort(
        (a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b)
      )[0] ?? "viewer";
    } else {
      role = (data?.role ?? "viewer") as Role;
    }

    const secondaryRoles: Role[] = Array.isArray(data?.secondary_roles)
      ? (data.secondary_roles as string[]).filter((r): r is Role => r in ROLE_PERMISSIONS) as Role[]
      : [];

    return { ok: true, uid: user.id, role, secondaryRoles };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid token" }, { status: 401 }),
    };
  }
}

/**
 * Verify that the caller has a management-level role.
 */
export async function verifyAdmin(req: NextRequest): Promise<AuthResult> {
  const result = await verifyAuth(req);
  if (!result.ok) return result;

  const ADMIN_ROLES: Role[] = [
    "super_admin",
    "it_manager",
    "academic_director",
    "finance",
    "accounts",
    "registrar",
    "it_admin",
  ];
  if (!ADMIN_ROLES.includes(result.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return result;
}

/**
 * Verify that the caller is a super_admin.
 */
export async function verifySuperAdmin(req: NextRequest): Promise<AuthResult> {
  const result = await verifyAuth(req);
  if (!result.ok) return result;

  if (result.role !== "super_admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return result;
}

/**
 * Verify the request has either a valid Supabase access token (admin dashboard)
 * OR a valid portal session cookie (teacher/student/parent portals).
 * Returns ok:true if the caller is authenticated through either mechanism.
 *
 * NOTE: All portals use the "__session" cookie. The expectedValue param
 * identifies the portal type (teacher/student/parent).
 */
export async function verifyAuthOrPortalSession(
  req: NextRequest,
  expectedValue: "teacher" | "student" | "parent"
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  // Try Supabase Auth first (admin dashboard callers)
  const token = extractToken(req);
  if (token && token !== expectedValue) {
    try {
      const supabase = createServiceClient();
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) return { ok: true };
    } catch { /* fall through to portal check */ }
  }

  // Fall back to portal session cookie (__session with portal-specific value)
  const session = req.cookies.get("__session")?.value;
  if (session === expectedValue) {
    return { ok: true };
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}
