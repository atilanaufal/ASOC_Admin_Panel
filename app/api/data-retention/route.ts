import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getMongoClient } from '@/lib/mongodb';
import { getMysqlPool } from '@/lib/mysql';
import { formatBytes } from '@/lib/tenant-utils';
import { getRemoteVmConfig } from '@/lib/remote';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runRemoteScript(commandStr: string): Promise<{ stdout: string; stderr: string; success: boolean }> {
  try {
    const { host: vmHost, user: vmUser } = getRemoteVmConfig();
    const remoteCmd = `ssh -o BatchMode=yes -o ConnectTimeout=8 ${vmUser}@${vmHost} "${commandStr.replace(/"/g, '\\"')}"`;
    const { stdout, stderr } = await execAsync(remoteCmd, { timeout: 60000 });
    return { stdout: stdout.trim(), stderr: stderr.trim(), success: true };
  } catch (err: any) {
    return { stdout: (err.stdout || '').trim(), stderr: (err.stderr || err.message || '').trim(), success: false };
  }
}

export async function GET(_request: NextRequest) {
  try {
    const pool = getMysqlPool();
    const [tenantsRows]: any = await pool.query(
      'SELECT id, tenant_code, campus_name, database_name, redis_prefix FROM tenants WHERE is_active = 1 ORDER BY id ASC'
    );

    // 1. Fetch live ground-truth status from remote set_ttl.py script on 10.20.100.86
    let scriptStatusList: any[] = [];
    try {
      const res = await runRemoteScript('/opt/venv/bin/python /opt/multi-tenant/scripts/set_ttl.py --status --json');
      if (res.success && res.stdout) {
        const jsonStart = res.stdout.indexOf('[');
        if (jsonStart !== -1) {
          scriptStatusList = JSON.parse(res.stdout.slice(jsonStart));
        }
      }
    } catch (scriptErr) {
      console.warn('Failed to query remote set_ttl.py status:', scriptErr);
    }

    // Map script status by tenant_code for fast lookup
    const scriptMap = new Map<string, any>();
    for (const item of scriptStatusList) {
      if (item.tenant_code) {
        scriptMap.set(item.tenant_code.toUpperCase(), item);
      }
    }

    let mongoClient: any = null;
    try {
      mongoClient = await getMongoClient();
    } catch {}

    const tenantRetentionList = [];

    for (const t of tenantsRows) {
      const dbName = t.database_name;
      const code = t.tenant_code?.toUpperCase();
      const statusFromScript = scriptMap.get(code);

      let incidentCount = 0;
      let vulnCount = 0;
      let diskBytes = 0;

      // Remote script values (ground truth)
      // Default: Mongo 30 days (2,592,000s), Redis 7 days (604,800s)
      let mongoTtlDays = 30;
      let redisTtlSeconds = 604800; // 7 days (168 hours)
      let redisKeysCount = statusFromScript?.redis_keys_count ?? 0;

      if (statusFromScript) {
        const mongoIncidentTtl = statusFromScript.mongo_ttl?.incident;
        if (typeof mongoIncidentTtl === 'number' && mongoIncidentTtl > 0) {
          mongoTtlDays = Math.round(mongoIncidentTtl / 86400);
        }
        if (typeof statusFromScript.redis_avg_ttl_seconds === 'number' && statusFromScript.redis_avg_ttl_seconds > 0) {
          redisTtlSeconds = statusFromScript.redis_avg_ttl_seconds;
        }
      }

      if (mongoClient && dbName) {
        try {
          const db = mongoClient.db(dbName);
          incidentCount = await db.collection('incident').countDocuments();
          vulnCount = await db.collection('vulnerability').countDocuments();
          const stats = await db.stats();
          diskBytes = stats.storageSize || stats.dataSize || 0;

          // If script status not found, inspect collection index directly
          if (!statusFromScript) {
            const indexes = await db.collection('incident').indexes();
            const ttlIdx = indexes.find((idx: any) => idx.expireAfterSeconds !== undefined);
            if (ttlIdx && ttlIdx.expireAfterSeconds) {
              mongoTtlDays = Math.round(ttlIdx.expireAfterSeconds / 86400);
            }
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
        redisTtlSeconds,
        policyStatus: 'ACTIVE',
      });
    }

    // Default global retention policy matching /opt/multi-tenant/scripts/set_ttl.py
    const globalPolicy = {
      mongoTtlDays: 30, // 30 Days
      redisTtlSeconds: 604800, // 7 Days (168 Hours)
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
      redisTtlSeconds = 604800, // 7 days default
    } = body;

    const pool = getMysqlPool();

    // 1. If reset-default requested, invoke set_ttl.py with --reset-default
    if (action === 'reset-default') {
      const resetCmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/set_ttl.py --tenant all --reset-default --json`;
      const res = await runRemoteScript(resetCmd);

      // Reset default variables in script files
      await runRemoteScript(
        `echo 032005 | sudo -S sed -i 's/^DEFAULT_MONGO_DAYS = .*/DEFAULT_MONGO_DAYS = 30/' /opt/multi-tenant/scripts/set_ttl.py /opt/multi-tenant/scripts/configure_ttl.py; ` +
        `echo 032005 | sudo -S sed -i 's/^DEFAULT_REDIS_DAYS = .*/DEFAULT_REDIS_DAYS = 7/' /opt/multi-tenant/scripts/set_ttl.py /opt/multi-tenant/scripts/configure_ttl.py`
      );

      return NextResponse.json({
        success: res.success,
        message: 'Successfully reset retention policy to standard default (MongoDB: 30 Days, Redis: 7 Days / 168 Hours).',
      });
    }

    // 2. Fetch tenant code if specific tenant
    let targetCode = 'all';
    if (tenantId !== 'all') {
      const [rows]: any = await pool.query('SELECT tenant_code FROM tenants WHERE id = ? LIMIT 1', [tenantId]);
      if (rows.length > 0) {
        targetCode = rows[0].tenant_code;
      }
    }

    const mongoDays = Number(mongoTtlDays);
    const redisDays = Number((Number(redisTtlSeconds) / 86400).toFixed(2));

    // Execute /opt/multi-tenant/scripts/set_ttl.py directly on 10.20.100.86
    const cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/set_ttl.py --tenant ${targetCode} --mongo-days ${mongoDays} --redis-days ${redisDays} --json`;
    const res = await runRemoteScript(cmd);

    // If applying to all tenants, update defaults directly in script files on the remote server
    if (targetCode === 'all') {
      await runRemoteScript(
        `echo 032005 | sudo -S sed -i 's/^DEFAULT_MONGO_DAYS = .*/DEFAULT_MONGO_DAYS = ${mongoDays}/' /opt/multi-tenant/scripts/set_ttl.py /opt/multi-tenant/scripts/configure_ttl.py; ` +
        `echo 032005 | sudo -S sed -i 's/^DEFAULT_REDIS_DAYS = .*/DEFAULT_REDIS_DAYS = ${redisDays}/' /opt/multi-tenant/scripts/set_ttl.py /opt/multi-tenant/scripts/configure_ttl.py`
      );
    }

    let parsedJson = null;
    if (res.success && res.stdout) {
      const jsonStart = res.stdout.indexOf('[');
      if (jsonStart !== -1) {
        try {
          parsedJson = JSON.parse(res.stdout.slice(jsonStart));
        } catch {}
      }
    }

    return NextResponse.json({
      success: res.success,
      message: res.success
        ? `Successfully applied retention policy on server: MongoDB TTL ${mongoDays} Days, Redis TTL ${redisDays} Days (${redisTtlSeconds}s) for [${targetCode.toUpperCase()}].`
        : `Execution warning: ${res.stderr || 'Check server logs'}`,
      updatedStatus: parsedJson,
    });
  } catch (err: any) {
    console.error('API /api/data-retention POST Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to save data retention configuration.' },
      { status: 500 }
    );
  }
}
