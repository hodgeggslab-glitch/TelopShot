import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();

  const cookie = request.cookies.get("site-auth");
  if (cookie?.value === password) return NextResponse.next();

  if (request.nextUrl.pathname === "/api/auth") {
    return NextResponse.next();
  }

  // API routes should not be blocked if already authed via cookie
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logomark.svg|login).*)"]
};
