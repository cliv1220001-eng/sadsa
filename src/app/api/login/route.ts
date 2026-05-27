import { NextResponse } from "next/server";
import { AUTH_PASS, AUTH_USER, SESSION_COOKIE, SESSION_TOKEN } from "@/lib/auth";

export async function POST(request: Request) {
  let username = "";
  let password = "";
  try {
    const body = (await request.json()) as { username?: string; password?: string };
    username = body.username ?? "";
    password = body.password ?? "";
  } catch {
    // malformed body → treated as invalid credentials below
  }

  if (username === AUTH_USER && password === AUTH_PASS) {
    // Only mark the cookie Secure when actually served over HTTPS, otherwise it
    // would never be sent back over plain-http localhost / LAN and login fails.
    const isHttps = request.headers.get("x-forwarded-proto") === "https";
    const res = NextResponse.json({ ok: true });
    res.cookies.set({
      name: SESSION_COOKIE,
      value: SESSION_TOKEN,
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps,
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return res;
  }

  return NextResponse.json(
    { ok: false, error: "Invalid username or password." },
    { status: 401 }
  );
}
