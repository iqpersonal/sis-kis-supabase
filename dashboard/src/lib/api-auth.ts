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
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import type { Role } from "@/lib/rbac";

interface AuthSuccess {
  ok: true;
  uid: string;
  role: Role;
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
 * Verify that the request carries a valid Firebase ID token.
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
    const decoded = await adminAuth.verifyIdToken(token);
    const snap = await adminDb.collection("admin_users").doc(decoded.uid).get();
    const role = (snap.exists ? snap.data()?.role : "viewer") as Role;

    return { ok: true, uid: decoded.uid, role };
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
 * Verify the request has either a valid Firebase token (admin dashboard)
 * OR a valid portal session cookie (teacher/student/parent portals).
 * Returns ok:true if the caller is authenticated through either mechanism.
 *
 * NOTE: All portals now use the "__session" cookie (Firebase Hosting strips
 * every other cookie). The expectedValue param identifies the portal type.
 */
export async function verifyAuthOrPortalSession(
  req: NextRequest,
  expectedValue: "teacher" | "student" | "parent"
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  // Try Firebase Auth first (admin dashboard callers)
  const token = extractToken(req);
  if (token) {
    try {
      await adminAuth.verifyIdToken(token);
      return { ok: true };
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
