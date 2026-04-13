import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();

  // ログインページとAPI認証はスルー
  if (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/api/auth") {
    return NextResponse.next();
  }

  // API routesはスルー
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get("site-auth");
  if (cookie?.value === password) return NextResponse.next();

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logomark.svg).*)"]
};
