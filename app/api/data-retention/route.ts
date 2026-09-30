import { NextRequest, NextResponse } from 'next/server';
import { getMongoClient } from '@/lib/mongodb';
import { getMysqlPool } from '@/lib/mysql';
import { getActiveRedisClient } from '@/lib/redis';

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export async function GET(_request: NextRequest) {
  try {
    const pool = getMysqlPool();
    const [tenantsRows]: any = await pool.query(
      'SELECT id, tenant_code, campus_name, database_name, redis_prefix FROM tenants WHERE is_active = 1 ORDER BY id ASC'
    );

    let mongoClient: any = null;
    try {
      mongoClient = await getMongoClient();
    } catch {}

    const redis = await getActiveRedisClient();
    const tenantRetentionList = [];

    for (const t of tenantsRows) {
      const dbName = t.database_name;
      const cleanPrefix = (t.redis_prefix || `${t.database_name}:`).replace(/:\*$/, '').replace(/:$/, '');

      let incidentCount = 0;
      let vulnCount = 0;
      let diskBytes = 0;
      let mongoTtlDays = 30;
      let redisKeysCount = 0;
      let redisAvgTtlSeconds = 604800; // 7 days

      if (redis) {
        try {
          const keys = await redis.keys(`${cleanPrefix}*`);
          redisKeysCount = keys.length;
          if (keys.length > 0) {
            const sampleKeys = keys.slice(0, 15);
            const ttls = await Promise.all(sampleKeys.map((k) => redis.ttl(k)));
            const validTtls = ttls.filter((val) => val > 0);
            if (validTtls.length > 0) {
              redisAvgTtlSeconds = Math.round(validTtls.reduce((a, b) => a + b, 0) / validTtls.length);
            }
          }
        } catch {}
      }

      if (mongoClient && dbName) {
        try {
          const db = mongoClient.db(dbName);
          incidentCount = await db.collection('incident').countDocuments();
          vulnCount = await db.collection('vulnerability').countDocuments();
          const stats = await db.stats();
          diskBytes = stats.storageSize || stats.dataSize || 0;

          const indexes = await db.collection('incident').indexes();
          const ttlIdx = indexes.find((idx: any) => idx.expireAfterSeconds !== undefined);
          if (ttlIdx && ttlIdx.expireAfterSeconds) {
            mongoTtlDays = Math.round(ttlIdx.expireAfterSeconds / 86400);
          }
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
        redisTtlDays: Math.round(redisAvgTtlSeconds / 86400) || 7,
        redisTtlSeconds: redisAvgTtlSeconds,
        policyStatus: 'ACTIVE',
      });
    }

    // Dynamically calculate effective TTL policy from active tenant databases
    let effectiveMongoTtl = 30;
    let effectiveRedisTtl = 7;
    if (tenantRetentionList.length > 0) {
      const mongoFreq: Record<number, number> = {};
      const redisFreq: Record<number, number> = {};
      for (const t of tenantRetentionList) {
        if (t.mongoTtlDays) {
          mongoFreq[t.mongoTtlDays] = (mongoFreq[t.mongoTtlDays] || 0) + 1;
        }
        if (t.redisTtlDays) {
          redisFreq[t.redisTtlDays] = (redisFreq[t.redisTtlDays] || 0) + 1;
        }
      }
      const mongoKeys = Object.keys(mongoFreq);
      if (mongoKeys.length > 0) {
        effectiveMongoTtl = Number(mongoKeys.reduce((a, b) => (mongoFreq[Number(a)] >= mongoFreq[Number(b)] ? a : b)));
      }
      const redisKeys = Object.keys(redisFreq);
      if (redisKeys.length > 0) {
        effectiveRedisTtl = Number(redisKeys.reduce((a, b) => (redisFreq[Number(a)] >= redisFreq[Number(b)] ? a : b)));
      }
    }

    const globalPolicy = {
      mongoTtlDays: effectiveMongoTtl,
      redisTtlDays: effectiveRedisTtl,
      redisTtlSeconds: effectiveRedisTtl * 86400,
      targetCollections: ['incident', 'vulnerability', 'reports', 'historical_statistics'],
    };

    return NextResponse.json({
      success: true,
      globalPolicy,
      tenants: tenantRetentionList,
    });
  } catch (err: any) {
    console.error('API /api/data-retention GET Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to load data retention configuration' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tenantId = 'all',
      action,
      mongoTtlDays = 30,
      redisTtlSeconds = 604800,
    } = body;

    const pool = getMysqlPool();
    let query = 'SELECT id, tenant_code, campus_name, database_name, redis_prefix FROM tenants WHERE is_active = 1';
    const params: any[] = [];
    if (tenantId !== 'all') {
      query += ' AND id = ?';
      params.push(tenantId);
    }
    const [targetTenants]: any = await pool.query(query, params);

    const mongoClient = await getMongoClient();
    const redis = await getActiveRedisClient();

    const targetMongoDays = action === 'reset-default' ? 30 : Number(mongoTtlDays);
    const targetRedisDays = action === 'reset-default' ? 7 : (body.redisDays !== undefined ? Number(body.redisDays) : Math.round(Number(redisTtlSeconds) / 86400));
    const targetMongoSec = targetMongoDays * 86400;
    const targetHistSec = targetMongoDays * 2 * 86400;
    const targetRedisSec = targetRedisDays * 86400;

    // 1. Update MongoDB TTL Indexes
    for (const t of targetTenants) {
      if (!t.database_name) continue;
      const db = mongoClient.db(t.database_name);

      const configs = [
        { col: 'incident', field: 'first_observed', idx: 'first_observed_ttl', sec: targetMongoSec },
        { col: 'vulnerability', field: 'detected_at', idx: 'detected_at_ttl', sec: targetMongoSec },
        { col: 'reports', field: 'date_generated', idx: 'date_generated_ttl', sec: targetMongoSec },
        { col: 'historical_statistics', field: 'created_at', idx: 'created_at_ttl', sec: targetHistSec },
      ];

      for (const cfg of configs) {
        try {
          const col = db.collection(cfg.col);
          const indexes = await col.indexes().catch(() => []);
          const existing = indexes.find((i: any) => i.name === cfg.idx || (i.key && i.key[cfg.field] === 1 && i.expireAfterSeconds !== undefined));

          if (existing && existing.expireAfterSeconds === cfg.sec) {
            continue;
          }

          try {
            await db.command({
              collMod: cfg.col,
              index: {
                keyPattern: { [cfg.field]: 1 },
                expireAfterSeconds: cfg.sec,
              },
            });
          } catch {
            if (existing) {
              if (existing.name) await col.dropIndex(existing.name);
            }
            await col.createIndex({ [cfg.field]: 1 }, { expireAfterSeconds: cfg.sec, name: cfg.idx });
          }
        } catch (err: any) {
          console.warn(`Failed to update TTL for ${t.database_name}.${cfg.col}:`, err.message);
        }
      }
    }

    // 2. Update Redis TTLs
    if (redis) {
      for (const t of targetTenants) {
        const cleanPrefix = (t.redis_prefix || `${t.database_name}:`).replace(/:\*$/, '').replace(/:$/, '');
        try {
          const keys = await redis.keys(`${cleanPrefix}*`);
          if (keys.length > 0) {
            const pipeline = redis.pipeline();
            for (const k of keys) {
              pipeline.expire(k, targetRedisSec);
            }
            await pipeline.exec();
          }
        } catch (err: any) {
          console.warn(`Failed to update Redis TTL for prefix ${cleanPrefix}:`, err.message);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Native TTL policy applied: MongoDB ${targetMongoDays} Days, Redis ${targetRedisDays} Days (${targetRedisSec}s) for [${tenantId === 'all' ? 'ALL TENANTS' : targetTenants[0]?.tenant_code}].`,
    });
  } catch (err: any) {
    console.error('API /api/data-retention POST Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to apply data retention policy.' },
      { status: 500 }
    );
  }
}
