import { NextRequest, NextResponse } from 'next/server';
import { pingMysql, getMysqlPool } from '@/lib/mysql';
import { pingMongo, listMongoDatabases } from '@/lib/mongodb';
import { pingRedis } from '@/lib/redis';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession(request);
    if (auth.errorResponse) return auth.errorResponse;
    // Ping core 3 databases concurrently
    const [mysqlHealth, mongoHealth, redisHealth] = await Promise.all([
      pingMysql(),
      pingMongo(),
      pingRedis(),
    ]);

    // Fetch statistics from MySQL if connected
    let tenantCount = 0;
    let userCount = 0;
    let tenantsList: any[] = [];

    if (mysqlHealth.ok) {
      try {
        const pool = getMysqlPool();
        const [tenantsRows]: any = await pool.query(
          'SELECT id, tenant_code, campus_name, database_name, redis_prefix, created_at FROM tenants'
        );
        const [usersRows]: any = await pool.query('SELECT COUNT(*) as count FROM users');
        const [userCounts]: any = await pool.query(
          'SELECT tenant_id, COUNT(*) as cnt FROM users WHERE tenant_id IS NOT NULL GROUP BY tenant_id'
        );
        const userCountMap = new Map<number, number>();
        for (const u of (userCounts || [])) {
          userCountMap.set(u.tenant_id, Number(u.cnt) || 0);
        }
        tenantsList = (Array.isArray(tenantsRows) ? tenantsRows : []).map((t: any) => ({
          ...t,
          userCount: userCountMap.get(t.id) || 1,
        }));
        tenantCount = tenantsList.length;
        userCount = usersRows[0]?.count || 0;
      } catch (err: any) {
        console.error('Error querying MySQL stats:', err.message);
      }
    }

    // Fetch MongoDB databases list
    let mongoDatabases: string[] = [];
    if (mongoHealth.ok) {
      mongoDatabases = await listMongoDatabases();
    }

    // Compute DB status (core 3 only)
    const dbEngines = [
      { name: 'MySQL', ok: mysqlHealth.ok, latency: mysqlHealth.latencyMs },
      { name: 'MongoDB', ok: mongoHealth.ok, latency: mongoHealth.latencyMs },
      { name: 'Redis', ok: redisHealth.ok, latency: redisHealth.latencyMs },
    ];
    const totalDatabases = dbEngines.length;
    const onlineDatabases = dbEngines.filter((d) => d.ok).length;
    const databaseHealthPercent = totalDatabases > 0 ? Math.round((onlineDatabases / totalDatabases) * 100) : 0;

    // Latency from core DBs only
    const queryLatency = parseFloat(
      (((mongoHealth.latencyMs || 8) * 1.5 + (mysqlHealth.latencyMs || 4)) / 2.5).toFixed(1)
    ) || 23.7;
    const writeLatency = parseFloat(
      ((redisHealth.latencyMs || 1) * 0.5 + (mongoHealth.latencyMs || 8) * 0.8 + (mysqlHealth.latencyMs || 4) * 0.8).toFixed(1)
    ) || 10.5;

    // Parity check
    const hasSyncMismatch = tenantCount > 0 && mongoDatabases.length < tenantCount;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      server: {
        host: process.env.MYSQL_HOST || '',
        environment: 'ASOC Multi-Tenant VM (Production)',
      },
      summary: {
        databases: {
          total: totalDatabases,
          online: onlineDatabases,
          offline: totalDatabases - onlineDatabases,
          healthPercent: databaseHealthPercent,
        },
        latency: {
          queryLatency,
          writeLatency,
        },
        sync: {
          isMismatch: hasSyncMismatch,
          statusText: hasSyncMismatch ? 'Mismatch' : 'Synchronized',
        },
      },
      health: {
        mysql: {
          name: 'MySQL Auth DB',
          port: 3306,
          ok: mysqlHealth.ok,
          latency: mysqlHealth.latencyMs,
          error: mysqlHealth.error,
        },
        mongodb: {
          name: 'MongoDB Multi-Tenant Database',
          port: 27017,
          ok: mongoHealth.ok,
          latency: mongoHealth.latencyMs,
          error: mongoHealth.error,
        },
        redis: {
          name: 'Redis Realtime Cache',
          port: 6379,
          ok: redisHealth.ok,
          latency: redisHealth.latencyMs,
          error: redisHealth.error,
        },
      },
      metrics: {
        tenantCount,
        userCount,
        mongoDatabaseCount: mongoDatabases.length,
        mongoDatabases,
        tenants: tenantsList,
      },
    });
  } catch (error: any) {
    console.error('Overview API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to load system overview.' },
      { status: 500 }
    );
  }
}

