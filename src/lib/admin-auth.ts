import { randomBytes, timingSafeEqual } from "crypto";
import { redis } from "@/lib/redis";

export const ADMIN_SESSION_COOKIE = "admin_session";
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12;

const SESSION_PREFIX = "admin:session:";

export function isValidAdminPassword(input: string | undefined | null): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected || !input) return false;

  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

// Cookie holds only an opaque, revocable token — never the admin secret itself,
// so a leaked cookie (logs, XSS, error telemetry) can't be used to derive the password.
export async function createAdminSession(): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await redis.set(`${SESSION_PREFIX}${token}`, "1", {
    ex: ADMIN_SESSION_TTL_SECONDS,
  });
  return token;
}

export async function isValidAdminSession(
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;
  try {
    return (await redis.get(`${SESSION_PREFIX}${token}`)) !== null;
  } catch {
    return false; // fail closed if Redis is unavailable
  }
}

export async function destroyAdminSession(
  token: string | undefined | null,
): Promise<void> {
  if (!token) return;
  try {
    await redis.del(`${SESSION_PREFIX}${token}`);
  } catch {
    // best-effort — cookie is cleared client-side regardless
  }
}
