import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic auth gate: checks for a Better Auth session cookie. Real
 * authorization happens in Convex (every query/mutation checks the user) and
 * in the (app) layout, which validates the session with getToken().
 */
const PROTECTED_PAGES = [/^\/app(\/|$)/, /^\/p\//];
const PROTECTED_API = [/^\/api\/ai\//, /^\/api\/compile/, /^\/api\/arxiv/, /^\/api\/providers\//, /^\/api\/local\//];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = !!getSessionCookie(request);

  if (!hasSession && PROTECTED_API.some((r) => r.test(pathname))) {
    return NextResponse.json({ error: "Sign in to use clevex." }, { status: 401 });
  }
  if (!hasSession && PROTECTED_PAGES.some((r) => r.test(pathname))) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (hasSession && pathname === "/sign-in") {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/p/:path*", "/sign-in", "/api/:path*"],
};
