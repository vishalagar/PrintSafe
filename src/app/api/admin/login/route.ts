import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/redis";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSession,
  isValidAdminPassword,
} from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  // x-vercel-forwarded-for is set by Vercel's edge network and can't be
  // spoofed by the client, unlike x-forwarded-for which a caller can set
  // directly when not behind that proxy.
  const ip =
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "127.0.0.1";

  // Per-IP limit stops a single attacker; the fixed-key floor caps total
  // attempts even if x-forwarded-for is spoofed to cycle through fake IPs.
  const [allowedByIp, allowedGlobally] = await Promise.all([
    checkRateLimit(`admin-login:${ip}`, 5, 300),
    checkRateLimit("admin-login:global", 30, 300),
  ]);
  if (!allowedByIp || !allowedGlobally) {
    return NextResponse.redirect(
      new URL("/admin/stats?error=rate_limited", req.url),
      303,
    );
  }

  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { error: "Admin access not configured" },
      { status: 503 },
    );
  }

  const formData = await req.formData();
  const password = formData.get("password");

  if (typeof password !== "string" || !isValidAdminPassword(password)) {
    return NextResponse.redirect(
      new URL("/admin/stats?error=invalid", req.url),
      303,
    );
  }

  const token = await createAdminSession();
  const res = NextResponse.redirect(new URL("/admin/stats", req.url), 303);
  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
  return res;
}
