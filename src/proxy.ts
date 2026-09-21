import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = [/^\/login/, /^\/register/, /^\/reset/, /^\/invite\//, /^\/api\/v1\//, /^\/api\/health/];

/** Coarse gate only: real authentication & authorisation happen server-side in every page, action and route. */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has("sos_session");
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (!hasSession) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: { code: "unauthenticated", message: "Sign in required" } }, { status: 401 });
    const url = req.nextUrl.clone(); url.pathname = "/login"; url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + req.nextUrl.search)}` : "";
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|ico|webp)$).*)"] };
