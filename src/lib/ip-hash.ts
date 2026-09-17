import { createHash, createHmac } from "crypto";

/**
 * Hashes a viewer IP for audit purposes (never the raw IP is stored).
 *
 * A plain SHA-256 of an IPv4 address is not actually one-way: there are
 * only ~4 billion possible inputs, so the whole address space can be
 * hashed and reversed with a rainbow table in minutes. HMAC with a secret
 * key that never leaves the server (IP_HASH_SECRET) makes that infeasible.
 *
 * Falls back to plain SHA-256 if IP_HASH_SECRET isn't set, so local dev
 * and any environment that hasn't been given the new env var yet don't
 * break — but this is weaker and should only be relied on transiently.
 * Set IP_HASH_SECRET in production (openssl rand -hex 32).
 */
export function hashIp(ip: string): string {
  const secret = process.env.IP_HASH_SECRET;
  if (secret) {
    return createHmac("sha256", secret).update(ip).digest("hex");
  }
  return createHash("sha256").update(ip).digest("hex");
}
