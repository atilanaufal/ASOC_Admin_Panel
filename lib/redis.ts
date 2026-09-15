import Redis from 'ioredis';

function getRedisConfig() {
  const host = process.env.REDIS_HOST;
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD || undefined;

  return { host, port, password };
}

let redisClient: Redis | null = null;
let lastFailTime = 0;
const FAIL_COOLDOWN_MS = 10000;

function createClientInstance(host: string, port: number, password?: string): Redis {
  const redisOptions: any = {
    host,
    port,
    connectTimeout: 3000,
    commandTimeout: 3000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy(times: number) {
      if (times > 2) return null;
      return Math.min(times * 150, 500);
    },
    lazyConnect: true,
  };

  if (password && typeof password === 'string' && password.trim().length > 0) {
    redisOptions.password = password.trim();
  }

  const client = new Redis(redisOptions);

  client.on('error', (_err) => {
    // Suppress unhandled error crash
  });

  return client;
}

export function getActiveRedisHost(): { host: string; port: number } {
  const cfg = getRedisConfig();
  return { host: cfg.host || '', port: cfg.port };
}

async function testClientConnection(client: Redis): Promise<boolean> {
  try {
    if (client.status === 'wait' || client.status === 'close') {
      await client.connect();
    }
    const pingRes = await client.ping();
    return pingRes === 'PONG';
  } catch {
    return false;
  }
}

export async function getActiveRedisClient(): Promise<Redis | null> {
  const { host, port, password } = getRedisConfig();
  if (!host) return null;

  const now = Date.now();
  if (now - lastFailTime < FAIL_COOLDOWN_MS && !redisClient) {
    return null;
  }

  try {
    if (!redisClient) {
      redisClient = createClientInstance(host, port, password);
    }
    const ok = await testClientConnection(redisClient);
    if (ok) {
      lastFailTime = 0;
      return redisClient;
    } else {
      lastFailTime = now;
      return null;
    }
  } catch {
    lastFailTime = now;
    return null;
  }
}

export async function pingRedis(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const client = await getActiveRedisClient();
    if (!client) {
      return { ok: false, latencyMs: Date.now() - start, error: 'Redis client unreachable' };
    }
    const res = await client.ping();
    return { ok: res === 'PONG', latencyMs: Date.now() - start };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const client = await getActiveRedisClient();
    if (!client) return null;
    const data = await client.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch (err: any) {
    console.warn(`[Redis GET Error - ${key}]:`, err.message);
    return null;
  }
}

export async function setCache(key: string, value: any, ttlSeconds: number = 3600): Promise<boolean> {
  try {
    const client = await getActiveRedisClient();
    if (!client) return false;
    const serialized = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await client.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await client.set(key, serialized);
    }
    return true;
  } catch (err: any) {
    console.warn(`[Redis SET Error - ${key}]:`, err.message);
    return false;
  }
}

export async function delCache(key: string): Promise<boolean> {
  try {
    const client = await getActiveRedisClient();
    if (!client) return false;
    await client.del(key);
    return true;
  } catch {
    return false;
  }
}

export async function scanRedisKeys(pattern: string): Promise<string[]> {
  try {
    const client = await getActiveRedisClient();
    if (!client) return [];
    return await client.keys(pattern);
  } catch {
    return [];
  }
}
