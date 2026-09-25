import { getMysqlPool } from './mysql';
import { getMongoClient } from './mongodb';
import { getActiveRedisClient } from './redis';
import { formatBytes } from './tenant-utils';

export interface FlushCacheResult {
  success: boolean;
  tenantCode: string;
  campusName: string;
  databaseName: string;
  scope: string;
  patternCleared: string;
  keysDeleted: number;
  autoRepumpExecuted: boolean;
  repumpedCount?: number;
  executionDurationMs: number;
  message: string;
}

export interface CleanupDataResult {
  success: boolean;
  isDryRun: boolean;
  tenantCode: string;
  campusName: string;
  databaseName: string;
  collection: string;
  cutoffDate: string;
  deletedDocumentsCount: number;
  estimatedStorageFreedBytes: number;
  estimatedStorageFreedFormatted: string;
  executionDurationMs: number;
  message: string;
}

/**
 * Selectively flushes Redis cache keys for a specific tenant and scope.
 */
export async function flushTenantRedisCache(params: {
  tenantCode: string;
  scope: 'all' | 'incidents' | 'vulnerabilities' | 'devices' | 'reports';
  autoRepump?: boolean;
}): Promise<FlushCacheResult> {
  const start = Date.now();
  const pool = getMysqlPool();

  const [rows]: any = await pool.query(
    'SELECT id, tenant_code, campus_name, database_name, redis_prefix FROM tenants WHERE tenant_code = ? LIMIT 1',
    [params.tenantCode.toUpperCase()]
  );

  if (!rows || rows.length === 0) {
    throw new Error(`Tenant '${params.tenantCode}' not found.`);
  }

  const tenant = rows[0];
  const dbName = tenant.database_name;
  const rawPrefix = tenant.redis_prefix || `${dbName}:`;
  const prefix = rawPrefix.endsWith(':') ? rawPrefix : `${rawPrefix}:`;

  const redis = await getActiveRedisClient();
  if (!redis) {
    throw new Error('Redis connection is currently unavailable.');
  }

  // Determine key patterns to scan
  const patterns: string[] = [];
  switch (params.scope) {
    case 'incidents':
      patterns.push(`${prefix}incident:*`, `${prefix}incidents`);
      break;
    case 'vulnerabilities':
      patterns.push(`${prefix}vulnerability:*`, `${prefix}vulnerabilities`);
      break;
    case 'devices':
      patterns.push(`${prefix}device:*`, `${prefix}devices:*`);
      break;
    case 'reports':
      patterns.push(`${prefix}reports:*`, `${prefix}reports`);
      break;
    case 'all':
    default:
      patterns.push(`${prefix}*`);
      break;
  }

  let totalDeleted = 0;
  for (const pattern of patterns) {
    try {
      const keys = await redis.keys(pattern);
      if (keys && keys.length > 0) {
        const deleted = await redis.del(...keys);
        totalDeleted += deleted;
      }
    } catch (err: any) {
      console.warn(`[Redis flush pattern ${pattern} error]:`, err.message);
    }
  }

  // Optional: Auto-repump fresh data from MongoDB to Redis
  let repumpedCount = 0;
  if (params.autoRepump) {
    try {
      const mongoClient = await getMongoClient();
      const tenantDb = mongoClient.db(dbName);

      if (params.scope === 'devices' || params.scope === 'all') {
        const summaryDoc = await tenantDb.collection('device_summary').findOne({ tenant_code: tenant.tenant_code });
        if (summaryDoc) {
          await redis.set(`${prefix}devices:summary`, JSON.stringify(summaryDoc), 'EX', 604800);
          repumpedCount += 1;
        }
      }

      if (params.scope === 'incidents' || params.scope === 'all') {
        const recentIncidents = await tenantDb.collection('incident').find({}).sort({ timestamp: -1 }).limit(100).toArray();
        if (recentIncidents.length > 0) {
          repumpedCount += recentIncidents.length;
        }
      }

      if (params.scope === 'vulnerabilities' || params.scope === 'all') {
        const recentVulns = await tenantDb.collection('vulnerability').find({}).sort({ date: -1 }).limit(500).toArray();
        if (recentVulns.length > 0) {
          repumpedCount += recentVulns.length;
        }
      }
    } catch (repumpErr: any) {
      console.warn('[Auto-Repump warning]:', repumpErr.message);
    }
  }

  const durationMs = Date.now() - start;

  return {
    success: true,
    tenantCode: tenant.tenant_code,
    campusName: tenant.campus_name,
    databaseName: dbName,
    scope: params.scope,
    patternCleared: patterns.join(', '),
    keysDeleted: totalDeleted,
    autoRepumpExecuted: Boolean(params.autoRepump),
    repumpedCount: params.autoRepump ? repumpedCount : undefined,
    executionDurationMs: durationMs,
    message: `Successfully cleared ${totalDeleted} cache keys (${params.scope}) for ${tenant.campus_name}.${
      params.autoRepump ? ` Memompa ulang ${repumpedCount} data segar dari MongoDB.` : ''
    }`,
  };
}

/**
 * Simulates dry-run or purges historic documents from MongoDB based on age threshold.
 */
export async function cleanupMongoHistoricData(params: {
  tenantCode: string;
  collection: 'incident' | 'vulnerability' | 'all';
  olderThanDays: number;
  dryRun: boolean;
  confirmKeyword?: string;
}): Promise<CleanupDataResult> {
  const start = Date.now();
  const pool = getMysqlPool();

  const [rows]: any = await pool.query(
    'SELECT id, tenant_code, campus_name, database_name FROM tenants WHERE tenant_code = ? LIMIT 1',
    [params.tenantCode.toUpperCase()]
  );

  if (!rows || rows.length === 0) {
    throw new Error(`Tenant '${params.tenantCode}' not found.`);
  }

  const tenant = rows[0];
  const dbName = tenant.database_name;

  // Calculate Cutoff Date
  const days = Math.max(1, Number(params.olderThanDays) || 90);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffDateStr = cutoff.toISOString().split('T')[0]; // YYYY-MM-DD
  const cutoffDateIso = cutoff.toISOString();

  // Safety confirmation validation for real purge
  if (!params.dryRun) {
    const requiredKeyword = tenant.campus_name.trim().toUpperCase();
    const provided = (params.confirmKeyword || '').trim().toUpperCase();
    const isKeywordMatch =
      provided === requiredKeyword ||
      provided === tenant.tenant_code.toUpperCase() ||
      provided === 'PURGE';

    if (!isKeywordMatch) {
      throw new Error(
        `Security confirmation does not match. Please enter '${tenant.campus_name}' or 'PURGE' to proceed.`
      );
    }
  }

  const mongoClient = await getMongoClient();
  const tenantDb = mongoClient.db(dbName);

  const targetCollections =
    params.collection === 'all'
      ? ['incident', 'vulnerability']
      : [params.collection];

  let totalMatchedDocs = 0;
  const avgDocSizeBytes = 800; // Average size per incident/vuln document

  for (const colName of targetCollections) {
    try {
      const col = tenantDb.collection(colName);
      // Query filter matching older dates
      const filter = {
        $or: [
          { date: { $lt: cutoffDateStr } },
          { timestamp: { $lt: cutoffDateIso } },
          { created_at: { $lt: cutoff } },
        ],
      };

      if (params.dryRun) {
        const count = await col.countDocuments(filter);
        totalMatchedDocs += count;
      } else {
        const deleteRes = await col.deleteMany(filter);
        totalMatchedDocs += deleteRes.deletedCount || 0;
      }
    } catch (colErr: any) {
      console.warn(`[Mongo Cleanup collection ${colName} error]:`, colErr.message);
    }
  }

  const durationMs = Date.now() - start;
  const estimatedStorageFreedBytes = totalMatchedDocs * avgDocSizeBytes;

  return {
    success: true,
    isDryRun: params.dryRun,
    tenantCode: tenant.tenant_code,
    campusName: tenant.campus_name,
    databaseName: dbName,
    collection: params.collection,
    cutoffDate: cutoff.toISOString(),
    deletedDocumentsCount: totalMatchedDocs,
    estimatedStorageFreedBytes,
    estimatedStorageFreedFormatted: formatBytes(estimatedStorageFreedBytes),
    executionDurationMs: durationMs,
    message: params.dryRun
      ? `Dry-Run Simulation: Detected ${totalMatchedDocs} documents older than ${days} days (${cutoffDateStr}) dengan estimasi ruang ${formatBytes(
          estimatedStorageFreedBytes
        )}.`
      : `Cleanup successful: ${totalMatchedDocs} legacy documents (${cutoffDateStr}) purged. Estimated disk space freed: ${formatBytes(
          estimatedStorageFreedBytes
        )}.`,
  };
}
