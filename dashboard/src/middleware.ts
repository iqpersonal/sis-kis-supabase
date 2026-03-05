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

  // Only guard /dashboard routes
  if (pathname.startsWith("/dashboard")) {
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
  matcher: ["/dashboard/:path*"],
};
