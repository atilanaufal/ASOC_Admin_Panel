import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getMongoClient } from '@/lib/mongodb';
import { getActiveRedisClient } from '@/lib/redis';
import { getMysqlPool } from '@/lib/mysql';
import { formatBytes } from '@/lib/tenant-utils';

export async function GET(_request: NextRequest) {
  try {
    const pool = getMysqlPool();
    const [tenantsRows]: any = await pool.query(
      'SELECT id, tenant_code, campus_name, database_name, redis_prefix FROM tenants WHERE is_active = 1 ORDER BY id ASC'
    );

    let mongoClient: any = null;
    let redisClient: any = null;
    try {
      mongoClient = await getMongoClient();
    } catch {}
    try {
      redisClient = await getActiveRedisClient();
    } catch {}

    // Check system_settings for stored retention policies
    let storedPolicies: Record<string, any> = {};
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key_name VARCHAR(100) PRIMARY KEY,
          value_data TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      const [settingsRows]: any = await pool.query(
        "SELECT key_name, value_data FROM system_settings WHERE key_name LIKE 'retention_%'"
      );
      for (const row of settingsRows) {
        try {
          storedPolicies[row.key_name] = JSON.parse(row.value_data);
        } catch {
          storedPolicies[row.key_name] = row.value_data;
        }
      }
    } catch (e) {
      console.warn('System settings fetch warning:', e);
    }

    const tenantRetentionList = [];

    for (const t of tenantsRows) {
      const dbName = t.database_name;
      let incidentCount = 0;
      let vulnCount = 0;
      let diskBytes = 0;
      let mongoTtlDays = 30; // Default 30 days
      let redisTtlSeconds = 86400; // Default 24 hours

      // Check stored custom policy
      const policyKey = `retention_tenant_${t.id}`;
      if (storedPolicies[policyKey]) {
        mongoTtlDays = storedPolicies[policyKey].mongoTtlDays ?? mongoTtlDays;
        redisTtlSeconds = storedPolicies[policyKey].redisTtlSeconds ?? redisTtlSeconds;
      }

      if (mongoClient && dbName) {
        try {
          const db = mongoClient.db(dbName);
          incidentCount = await db.collection('incident').countDocuments();
          vulnCount = await db.collection('vulnerability').countDocuments();
          const stats = await db.stats();
          diskBytes = stats.storageSize || stats.dataSize || 0;

          // Check if index with expireAfterSeconds exists on incident collection
          const indexes = await db.collection('incident').indexes();
          const ttlIdx = indexes.find((idx: any) => idx.expireAfterSeconds !== undefined);
          if (ttlIdx && ttlIdx.expireAfterSeconds) {
            mongoTtlDays = Math.round(ttlIdx.expireAfterSeconds / 86400);
          }
        } catch {}
      }

      let redisKeysCount = 0;
      if (redisClient && t.redis_prefix) {
        try {
          const cleanPrefix = t.redis_prefix.endsWith(':') ? t.redis_prefix : `${t.redis_prefix}:`;
          const keys = await redisClient.keys(`${cleanPrefix}*`);
          redisKeysCount = keys ? keys.length : 0;
        } catch {}
      }

      tenantRetentionList.push({
        id: t.id,
        tenantCode: t.tenant_code,
        campusName: t.campus_name,
        databaseName: dbName,
        redisPrefix: t.redis_prefix,
        diskBytes,
        diskFormatted: formatBytes(diskBytes),
        incidentCount,
        vulnCount,
        redisKeysCount,
        mongoTtlDays,
        redisTtlSeconds,
        policyStatus: 'ACTIVE',
      });
    }

    return NextResponse.json({
      success: true,
      globalPolicy: storedPolicies['retention_global'] || {
        mongoTtlDays: 30,
        redisTtlSeconds: 86400,
        targetCollections: ['incident', 'vulnerability', 'alerts'],
      },
      tenants: tenantRetentionList,
    });
  } catch (err: any) {
    console.error('API /api/data-retention GET Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal memuat konfigurasi data retention' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tenantId = 'all',
      mongoTtlDays = 30,
      redisTtlSeconds = 86400,
      targetCollections = ['incident', 'vulnerability'],
    } = body;

    const pool = getMysqlPool();
    const mongoClient = await getMongoClient();
    const redisClient = await getActiveRedisClient();

    // Fetch target tenants
    let query = 'SELECT id, tenant_code, database_name, redis_prefix FROM tenants WHERE is_active = 1';
    const params: any[] = [];
    if (tenantId !== 'all') {
      query += ' AND id = ?';
      params.push(tenantId);
    }

    const [tenants]: any = await pool.query(query, params);
    const targetTenants = Array.isArray(tenants) ? tenants : [];

    if (targetTenants.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Tenant tidak ditemukan.' },
        { status: 404 }
      );
    }

    const ttlSeconds = Number(mongoTtlDays) * 86400;
    const cleanRedisTtl = Number(redisTtlSeconds);

    const updatedDatabases: string[] = [];

    // 1. Apply MongoDB TTL Index
    for (const t of targetTenants) {
      const db = mongoClient.db(t.database_name);

      for (const colName of targetCollections) {
        try {
          const col = db.collection(colName);
          const indexes = await col.indexes();
          const existingTtlIdx = indexes.find((idx: any) => idx.name === 'ttl_retention_idx');

          if (existingTtlIdx) {
            // Modify TTL using collMod or drop and recreate
            try {
              await db.command({
                collMod: colName,
                index: {
                  name: 'ttl_retention_idx',
                  expireAfterSeconds: ttlSeconds,
                },
              });
            } catch {
              await col.dropIndex('ttl_retention_idx');
              await col.createIndex({ timestamp: 1 }, { expireAfterSeconds: ttlSeconds, name: 'ttl_retention_idx' });
            }
          } else {
            await col.createIndex({ timestamp: 1 }, { expireAfterSeconds: ttlSeconds, name: 'ttl_retention_idx' });
          }
        } catch (colErr: any) {
          console.warn(`Warning setting TTL on ${t.database_name}.${colName}:`, colErr.message);
        }
      }

      // 2. Apply Redis default TTL to existing tenant keys
      if (redisClient && t.redis_prefix) {
        try {
          const cleanPrefix = t.redis_prefix.endsWith(':') ? t.redis_prefix : `${t.redis_prefix}:`;
          const keys = await redisClient.keys(`${cleanPrefix}*`);
          if (keys && keys.length > 0) {
            const pipeline = redisClient.pipeline();
            for (const k of keys) {
              pipeline.expire(k, cleanRedisTtl);
            }
            await pipeline.exec();
          }
        } catch (rErr: any) {
          console.warn(`Warning applying TTL to Redis keys for ${t.tenant_code}:`, rErr.message);
        }
      }

      updatedDatabases.push(t.database_name);

      // Save policy in system_settings
      const policyKey = tenantId === 'all' ? 'retention_global' : `retention_tenant_${t.id}`;
      const policyValue = JSON.stringify({
        tenantId: t.id,
        mongoTtlDays,
        redisTtlSeconds: cleanRedisTtl,
        targetCollections,
        updatedAt: new Date().toISOString(),
      });

      await pool.query(
        `INSERT INTO system_settings (key_name, value_data) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE value_data = VALUES(value_data)`,
        [policyKey, policyValue]
      );
    }

    return NextResponse.json({
      success: true,
      message: `Kebijakan data retention berhasil diperbarui: MongoDB TTL ${mongoTtlDays} hari (${ttlSeconds} detik) dan Redis L1 TTL ${cleanRedisTtl} detik untuk ${updatedDatabases.length} database tenant.`,
      updatedDatabases,
    });
  } catch (err: any) {
    console.error('API /api/data-retention POST Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal menyimpan konfigurasi data retention.' },
      { status: 500 }
    );
  }
}
