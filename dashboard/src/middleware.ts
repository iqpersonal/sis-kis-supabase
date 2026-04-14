import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware: protect /dashboard routes.
 *
 * IMPORTANT: Firebase Hosting CDN only forwards the "__session" cookie to
 * Cloud Functions — all other cookies are stripped.  Therefore every portal
 * (admin, parent, student, teacher) stores its session indicator in the
 * same "__session" cookie with a distinguishing value:
 *   admin   → Firebase ID token (long JWT string)
 *   parent  → "parent"
 *   student → "student"
 *   teacher → "teacher"
 *
 * The middleware only checks for the cookie's *existence* (not its value)
 * because we cannot import firebase-admin in Edge middleware.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get("__session")?.value;

  // Guard /parent/dashboard routes (parents) — check BEFORE /dashboard
  if (pathname.startsWith("/parent/dashboard")) {
    if (!session) {
      const loginUrl = new URL("/parent/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Guard /student/dashboard routes (students)
  else if (pathname.startsWith("/student/dashboard")) {
    if (!session) {
      const loginUrl = new URL("/student/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Guard /teacher/dashboard routes (teachers)
  else if (pathname.startsWith("/teacher/dashboard")) {
    if (!session) {
      const loginUrl = new URL("/teacher/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Guard /dashboard routes (admin)
  else if (pathname.startsWith("/dashboard")) {
    if (!session) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/parent/dashboard/:path*", "/student/dashboard/:path*", "/teacher/dashboard/:path*"],
};
