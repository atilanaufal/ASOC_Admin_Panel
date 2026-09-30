import { getActiveRedisClient } from './redis';

interface MemoryBucket {
  count: number;
  resetAt: number;
}

const memoryRateLimitMap = new Map<string, MemoryBucket>();

/**
 * Enforces rate limiting per IP / key.
 * Default: 5 attempts per 5 minutes for login.
 */
export async function checkRateLimit(
  key: string,
  maxAttempts: number = 5,
  windowSeconds: number = 300
): Promise<{ allowed: boolean; remaining: number; retryAfterSec?: number }> {
  const fullKey = `ratelimit:${key}`;

  // Try Redis first
  try {
    const redis = await getActiveRedisClient();
    if (redis) {
      const current = await redis.incr(fullKey);
      if (current === 1) {
        await redis.expire(fullKey, windowSeconds);
      }
      const ttl = await redis.ttl(fullKey);

      if (current > maxAttempts) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSec: ttl > 0 ? ttl : windowSeconds,
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, maxAttempts - current),
      };
    }
  } catch {
    // Fallback to in-memory store if Redis down
  }

  // In-memory fallback
  const now = Date.now();
  const bucket = memoryRateLimitMap.get(fullKey);

  if (!bucket || now > bucket.resetAt) {
    memoryRateLimitMap.set(fullKey, {
      count: 1,
      resetAt: now + windowSeconds * 1000,
    });
    return { allowed: true, remaining: maxAttempts - 1 };
  }

  bucket.count += 1;
  if (bucket.count > maxAttempts) {
    const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxAttempts - bucket.count),
  };
}

/**
 * Resets the rate limit counter for a key upon successful login.
 */
export async function resetRateLimit(key: string): Promise<void> {
  const fullKey = `ratelimit:${key}`;
  try {
    const redis = await getActiveRedisClient();
    if (redis) {
      await redis.del(fullKey);
    }
  } catch {}
  memoryRateLimitMap.delete(fullKey);
}
