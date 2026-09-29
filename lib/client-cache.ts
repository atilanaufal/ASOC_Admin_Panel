// Client-side in-memory singleton cache
// Preserves page state during Next.js SPA navigation across pages
// Cleared automatically on browser hard refresh (F5)

const memoryStore: Record<string, any> = {};

export function getClientCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  return (memoryStore[key] as T) ?? null;
}

export function setClientCache<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  memoryStore[key] = data;
}

export function clearClientCache(key?: string): void {
  if (typeof window === 'undefined') return;
  if (key) {
    delete memoryStore[key];
  } else {
    for (const k of Object.keys(memoryStore)) {
      delete memoryStore[k];
    }
  }
}
