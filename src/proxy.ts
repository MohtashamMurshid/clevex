import { NextResponse, type NextRequest } from "next/server";

export const COOKIE = "clevex_gate";

export async function gateToken(password: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`clevex:${password}`));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Optional password gate — only active when CLEVEX_PASSWORD is set. */
export async function proxy(request: NextRequest) {
  const password = process.env.CLEVEX_PASSWORD;
  if (!password) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  const cookie = request.cookies.get(COOKIE)?.value;
  if (cookie && cookie === (await gateToken(password))) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|brand/).*)"],
};
