import { MongoClient, Db } from 'mongodb';

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI tidak terdefinisi di environment');
  }
  return uri;
}

let globalClient: MongoClient | null = null;
let activeClientPromise: Promise<MongoClient> | null = null;
let lastFailureTime = 0;
const RETRY_COOLDOWN_MS = 10000;

async function connectToMongo(uri: string, timeoutMs: number = 15000): Promise<MongoClient> {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: timeoutMs,
    connectTimeoutMS: timeoutMs,
    socketTimeoutMS: 45000,
    maxPoolSize: 20,
    minPoolSize: 1,
    directConnection: true,
  });
  await client.connect();
  return client;
}

export async function getMongoClient(): Promise<MongoClient> {
  const uri = getMongoUri();
  const now = Date.now();
  if (globalClient && now - lastFailureTime > RETRY_COOLDOWN_MS) {
    try {
      await globalClient.db().admin().ping();
      return globalClient;
    } catch {
      globalClient = null;
      activeClientPromise = null;
    }
  }

  if (activeClientPromise) {
    try {
      const client = await activeClientPromise;
      await client.db().admin().ping();
      globalClient = client;
      return client;
    } catch {
      activeClientPromise = null;
      globalClient = null;
    }
  }

  try {
    const client = await connectToMongo(uri, 15000);
    globalClient = client;
    activeClientPromise = Promise.resolve(client);
    lastFailureTime = 0;
    return client;
  } catch (err: any) {
    lastFailureTime = Date.now();
    activeClientPromise = null;
    globalClient = null;
    throw new Error(`MongoDB tidak dapat diakses (${uri}): ${err.message}`);
  }
}

export async function getMongoDb(databaseName?: string): Promise<Db> {
  const client = await getMongoClient();
  const targetDb = databaseName || 'tenant_a';
  return client.db(targetDb);
}

export async function pingMongo(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const client = await getMongoClient();
    await client.db().admin().ping();
    const latencyMs = Date.now() - start;
    return { ok: true, latencyMs };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

export async function listMongoDatabases(): Promise<string[]> {
  try {
    const client = await getMongoClient();
    const result = await client.db().admin().listDatabases();
    return result.databases.map((db) => db.name);
  } catch (err) {
    console.error('Error listing mongo databases:', err);
    return [];
  }
}
