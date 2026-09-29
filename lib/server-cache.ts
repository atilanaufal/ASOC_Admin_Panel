/**
 * Simple in-process TTL cache for Next.js API routes.
 * Cache entries are invalidated after `ttlMs` milliseconds.
 * Thread-safe for single-process Node.js; if running multi-instance,
 * replace with Redis-backed cache.
 */

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry>();

/**
 * Return cached value if fresh, otherwise call fetcher, cache result, and return it.
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const hit = _cache.get(key);
  if (hit && Date.now() < hit.expiresAt) {
    return hit.data as T;
  }
  const data = await fetcher();
  _cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

/**
 * Manually invalidate a cache key (e.g. after a POST that changes data).
 */
export function invalidateCache(key: string): void {
  _cache.delete(key);
}

/**
 * Invalidate all keys that start with a given prefix.
 */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) {
      _cache.delete(key);
    }
  }
}
