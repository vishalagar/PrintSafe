import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, destroyAdminSession } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  await destroyAdminSession(token);

  const res = NextResponse.redirect(new URL("/admin/stats", req.url), 303);
  res.cookies.delete(ADMIN_SESSION_COOKIE);
  return res;
}
