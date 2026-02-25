import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

/**
 * Returns true if the request is allowed, false if the rate limit is exceeded.
 * Uses an INCR counter per IP, with an expiry set only on the first request in the window.
 */
export async function checkRateLimit(
  ip: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const key = `rl:upload:${ip}`

  try {
    const count = await redis.incr(key)

    // Set expiry only on the first increment so the window starts fresh
    if (count === 1) {
      await redis.expire(key, windowSeconds)
    }

    return count <= limit
  } catch (err) {
    // Fail open: if Redis is unavailable, allow the request through
    // rather than blocking all uploads. Log for ops awareness.
    console.error('[redis] rate-limit check failed:', err instanceof Error ? err.message : err)
    return true
  }
}
