import crypto from 'crypto';
import { getActiveRedisClient } from './redis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTimeMs: number;
  retryAfterSeconds: number;
}

interface MemoryBucket {
  count: number;
  expiresAt: number;
}

const memoryRateLimitMap = new Map<string, MemoryBucket>();

// Periodic in-memory bucket cleanup
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, item] of memoryRateLimitMap.entries()) {
      if (item.expiresAt < now) {
        memoryRateLimitMap.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

/**
 * Atomic rate limiter with Redis pipeline and automatic fallback.
 * Uses atomic pipeline (INCR + TTL) to prevent race conditions and unexpiring keys.
 */
export async function checkRateLimit(
  key: string,
  limit: number = 5,
  windowSeconds: number = 300
): Promise<{ allowed: boolean; remaining: number; retryAfterSec?: number }> {
  const prefixedKey = `ratelimit:${key}`;
  const now = Date.now();

  try {
    const redis = await getActiveRedisClient();
    if (redis) {
      const pipeline = redis.pipeline();
      pipeline.incr(prefixedKey);
      pipeline.ttl(prefixedKey);
      const results = await pipeline.exec();

      if (results && results[0] && !results[0][0]) {
        const current = Number(results[0][1]);
        let ttl = Number(results[1]?.[1]);

        if (ttl <= 0 || current === 1) {
          await redis.expire(prefixedKey, windowSeconds);
          ttl = windowSeconds;
        }

        const retryAfterSec = current > limit ? Math.max(1, ttl) : 0;

        return {
          allowed: current <= limit,
          remaining: Math.max(0, limit - current),
          retryAfterSec,
        };
      }
    }
  } catch (err: any) {
    console.warn('[RateLimit] Redis unreachable, falling back to in-memory store:', err.message);
  }

  // In-memory fallback
  const bucket = memoryRateLimitMap.get(prefixedKey);
  if (!bucket || bucket.expiresAt < now) {
    const expiresAt = now + windowSeconds * 1000;
    memoryRateLimitMap.set(prefixedKey, { count: 1, expiresAt });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);
  const ttlSec = Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000));
  const retryAfterSec = bucket.count > limit ? ttlSec : 0;

  return {
    allowed: bucket.count <= limit,
    remaining,
    retryAfterSec,
  };
}

/**
 * Dual-Bucket Login Rate Limiter (Defends against password spraying and credential stuffing).
 * Bucket 1: IP Bucket (e.g. 30 requests / 15 min across any username)
 * Bucket 2: User Bucket (e.g. 10 attempts / 15 min per username hash)
 * Username is hashed (SHA-256 slice 16) to prevent arbitrary Redis key explosion.
 */
export async function checkDualLoginRateLimit(
  ip: string,
  username: string,
  options: { ipLimit?: number; userLimit?: number; windowSeconds?: number } = {}
): Promise<{ allowed: boolean; retryAfterSeconds: number; reason?: string }> {
  const ipLimit = options.ipLimit ?? 30;
  const userLimit = options.userLimit ?? 10;
  const windowSeconds = options.windowSeconds ?? 15 * 60; // 15 minutes

  // Sanitize & hash username to prevent key bloat
  const cleanUsername = String(username || '').trim().toLowerCase();
  const usernameHash = crypto.createHash('sha256').update(cleanUsername).digest('hex').slice(0, 16);

  const cleanIp = String(ip || '127.0.0.1').trim().replace(/[^a-fA-F0-9.:]/g, '');

  const ipKey = `login:ip:${cleanIp}`;
  const userKey = `login:user:${usernameHash}`;

  // 1. Check IP bucket (anti-spraying)
  const ipCheck = await checkRateLimit(ipKey, ipLimit, windowSeconds);
  if (!ipCheck.allowed) {
    return {
      allowed: false,
      retryAfterSeconds: ipCheck.retryAfterSec || windowSeconds,
      reason: 'IP_LIMIT_EXCEEDED',
    };
  }

  // 2. Check User bucket (anti-stuffing)
  const userCheck = await checkRateLimit(userKey, userLimit, windowSeconds);
  if (!userCheck.allowed) {
    return {
      allowed: false,
      retryAfterSeconds: userCheck.retryAfterSec || windowSeconds,
      reason: 'USER_LIMIT_EXCEEDED',
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
  };
}

/**
 * Resets user rate limit counter upon successful authentication.
 */
export async function resetLoginRateLimit(username: string): Promise<void> {
  const cleanUsername = String(username || '').trim().toLowerCase();
  const usernameHash = crypto.createHash('sha256').update(cleanUsername).digest('hex').slice(0, 16);
  const userKey = `ratelimit:login:user:${usernameHash}`;

  try {
    const redis = await getActiveRedisClient();
    if (redis) {
      await redis.del(userKey);
    }
  } catch {}
  memoryRateLimitMap.delete(userKey);
}

/**
 * Resets the rate limit counter for a raw key.
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
