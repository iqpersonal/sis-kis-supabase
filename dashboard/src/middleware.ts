import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware: protect /dashboard routes.
 *
 * Firebase Auth runs client-side, so we can't validate JWTs here without
 * firebase-admin (which requires Node runtime).  Instead, the client stores
 * a lightweight "__session" cookie when the user signs in.  If the cookie
 * is absent we redirect to /login.
 *
 * For a production setup you can:
 *   1. Set an HttpOnly session cookie via a server action / API route
 *      after the user signs in.
 *   2. Validate the cookie's Firebase ID token here using firebase-admin.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Guard /parent/dashboard routes (parents) — check BEFORE /dashboard
  if (pathname.startsWith("/parent/dashboard")) {
    const parentSession = request.cookies.get("__parent_session")?.value;

    if (!parentSession) {
      const loginUrl = new URL("/parent/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Guard /student/dashboard routes (students)
  else if (pathname.startsWith("/student/dashboard")) {
    const studentSession = request.cookies.get("__student_session")?.value;

    if (!studentSession) {
      const loginUrl = new URL("/student/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Guard /teacher/dashboard routes (teachers)
  else if (pathname.startsWith("/teacher/dashboard")) {
    const teacherSession = request.cookies.get("__teacher_session")?.value;

    if (!teacherSession) {
      const loginUrl = new URL("/teacher/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Guard /dashboard routes (admin)
  else if (pathname.startsWith("/dashboard")) {
    const session = request.cookies.get("__session")?.value;

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
