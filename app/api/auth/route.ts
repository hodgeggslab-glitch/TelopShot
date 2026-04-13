import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { password } = (await request.json()) as { password?: string };
  const sitePassword = process.env.SITE_PASSWORD;

  if (!sitePassword || password === sitePassword) {
    const res = NextResponse.json({ ok: true });
    res.cookies.set("site-auth", sitePassword || "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30日
      path: "/"
    });
    return res;
  }

  return NextResponse.json({ error: "Invalid password" }, { status: 401 });
}
