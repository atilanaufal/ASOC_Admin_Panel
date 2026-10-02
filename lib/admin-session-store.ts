import { getActiveRedisClient } from './redis';

export interface AdminServerSessionData {
  sessionId: string;
  userId: number | string;
  username: string;
  role: 'superadmin' | 'admin';
  tenantId: number;
  tenantCode: string;
  campusName: string;
  createdAt: number;
  lastActive: number;
  expiresAt: number;
}

const ADMIN_SESSION_PREFIX = 'asoc:admin:session:';
const DEFAULT_IDLE_TTL_SECONDS = 30 * 60; // 30 minutes inactivity timeout
export const MAX_SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000; // 12 hours absolute maximum lifetime

// In-memory fallback for local dev or when Redis is temporarily reconnecting
const localAdminMemoryStore = new Map<
  string,
  { data: AdminServerSessionData; expiresAt: number; absoluteExpiresAt: number }
>();

// Periodic in-memory cleanup
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, item] of localAdminMemoryStore.entries()) {
      if (item.expiresAt < now || item.absoluteExpiresAt < now) {
        localAdminMemoryStore.delete(key);
      }
    }
  }, 60 * 1000).unref?.();
}

/**
 * Stores a new authenticated admin session in server-side storage (Redis).
 */
export async function createAdminServerSession(
  sessionId: string,
  data: AdminServerSessionData,
  ttlSeconds: number = DEFAULT_IDLE_TTL_SECONDS
): Promise<void> {
  const key = `${ADMIN_SESSION_PREFIX}${sessionId}`;
  const serialized = JSON.stringify(data);
  const now = Date.now();

  try {
    const redis = await getActiveRedisClient();
    if (redis) {
      await redis.set(key, serialized, 'EX', ttlSeconds);
      return;
    }
  } catch (err: any) {
    console.warn('[AdminSessionStore] Redis set failed, storing in memory fallback:', err.message);
  }

  localAdminMemoryStore.set(sessionId, {
    data,
    expiresAt: now + ttlSeconds * 1000,
    absoluteExpiresAt: now + MAX_SESSION_ABSOLUTE_MS,
  });
}

/**
 * Fetches server-side admin session data.
 * Enforces both idle timeout and 12-hour absolute lifetime ceiling.
 * Returns null if session is missing, revoked, or expired.
 */
export async function getAdminServerSession(
  sessionId: string
): Promise<AdminServerSessionData | null> {
  if (!sessionId) return null;

  const key = `${ADMIN_SESSION_PREFIX}${sessionId}`;
  const now = Date.now();

  try {
    const redis = await getActiveRedisClient();
    if (redis) {
      const val = await redis.get(key);
      if (!val) return null;
      const parsed = JSON.parse(val) as AdminServerSessionData;

      // Absolute lifetime ceiling check (12 hours)
      if (now - parsed.createdAt > MAX_SESSION_ABSOLUTE_MS) {
        await redis.del(key);
        return null;
      }

      return parsed;
    }
  } catch (err: any) {
    console.warn('[AdminSessionStore] Redis get failed, checking memory fallback:', err.message);
  }

  const memItem = localAdminMemoryStore.get(sessionId);
  if (memItem && memItem.expiresAt > now && memItem.absoluteExpiresAt > now) {
    return memItem.data;
  }

  return null;
}

/**
 * Updates the last_active timestamp and refreshes the inactivity TTL (rolling session),
 * strictly bounded by the 12-hour absolute expiration ceiling.
 */
export async function touchAdminServerSession(
  sessionId: string,
  ttlSeconds: number = DEFAULT_IDLE_TTL_SECONDS
): Promise<void> {
  if (!sessionId) return;

  const key = `${ADMIN_SESSION_PREFIX}${sessionId}`;
  const now = Date.now();

  try {
    const redis = await getActiveRedisClient();
    if (redis) {
      const existing = await redis.get(key);
      if (existing) {
        const parsed = JSON.parse(existing) as AdminServerSessionData;

        // Check absolute ceiling
        const ageMs = now - parsed.createdAt;
        if (ageMs > MAX_SESSION_ABSOLUTE_MS) {
          await redis.del(key);
          return;
        }

        // Bound remaining TTL to absolute ceiling
        const remainingAbsoluteSeconds = Math.floor((MAX_SESSION_ABSOLUTE_MS - ageMs) / 1000);
        const effectiveTtl = Math.min(ttlSeconds, remainingAbsoluteSeconds);

        if (effectiveTtl <= 0) {
          await redis.del(key);
          return;
        }

        parsed.lastActive = now;
        await redis.set(key, JSON.stringify(parsed), 'EX', effectiveTtl);
        return;
      }
    }
  } catch (err: any) {
    console.warn('[AdminSessionStore] Redis touch failed:', err.message);
  }

  const memItem = localAdminMemoryStore.get(sessionId);
  if (memItem && memItem.expiresAt > now && memItem.absoluteExpiresAt > now) {
    memItem.data.lastActive = now;
    const remainingAbsoluteSeconds = Math.max(1, Math.floor((memItem.absoluteExpiresAt - now) / 1000));
    memItem.expiresAt = now + Math.min(ttlSeconds, remainingAbsoluteSeconds) * 1000;
  }
}

/**
 * Deletes an admin session from server-side storage (logout or revocation).
 */
export async function deleteAdminServerSession(sessionId: string): Promise<void> {
  if (!sessionId) return;

  const key = `${ADMIN_SESSION_PREFIX}${sessionId}`;
  try {
    const redis = await getActiveRedisClient();
    if (redis) {
      await redis.del(key);
    }
  } catch {}

  localAdminMemoryStore.delete(sessionId);
}
