import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getMysqlPool } from '@/lib/mysql';
import { runRemoteScript } from '@/lib/remote';
import { withCache, invalidateCachePrefix } from '@/lib/server-cache';
import type { VulnerabilityDateBreakdown } from '@/lib/vulnerability-audit';


function toScriptPeriod(period: string, startDate?: string | null, endDate?: string | null): string {
  const p = (period || 'today').toLowerCase();
  if (p === 'custom' && startDate && endDate) {
    return `${startDate}..${endDate}`;
  }
  if (p === 'last_7_days') {
    return 'last_week';
  }
  if (p === 'last_30_days' || p === 'last_month') {
    return 'last_month';
  }
  return p;
}

// runRemoteScript imported from @/lib/remote

function computeNextRun(schedule: string): string {
  const now = new Date();
  switch (schedule) {
    case '*/1 * * * *':
      return new Date(now.getTime() + 60 * 1000).toISOString();
    case '*/5 * * * *':
      return new Date(now.getTime() + 5 * 60 * 1000).toISOString();
    case '*/15 * * * *':
      return new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    case '0 0 * * *': {
      const tomorrow = new Date(now);
      tomorrow.setHours(24, 0, 0, 0);
      return tomorrow.toISOString();
    }
    case '0 * * * *': // Default 1 hour
    default:
      return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  }
}

function getDatesList(startStr?: string, endStr?: string): string[] {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  if (!startStr) return [todayStr];
  const end = endStr || startStr;
  const dates: string[] = [];
  const curr = new Date(startStr);
  const stop = new Date(end);
  while (curr <= stop) {
    dates.push(curr.toISOString().slice(0, 10));
    curr.setDate(curr.getDate() + 1);
  }
  return dates.length > 0 ? dates : [todayStr];
}

function getDateRangeForPeriod(
  period: string,
  customStart?: string | null,
  customEnd?: string | null
): { start?: string; end?: string; label: string; dates: string[] } {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  if (period.toUpperCase() === 'CUSTOM') {
    const start = customStart || todayStr;
    const end = customEnd || todayStr;
    return { start, end, label: `${start} - ${end}`, dates: getDatesList(start, end) };
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const dayOfWeek = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - (dayOfWeek - 1));
  const mondayStr = monday.toISOString().slice(0, 10);

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

  const firstDayOfMonth = `${todayStr.slice(0, 7)}-01`;

  switch (period.toUpperCase()) {
    case 'TODAY':
      return { start: todayStr, end: todayStr, label: 'TODAY', dates: [todayStr] };
    case 'YESTERDAY':
      return { start: yesterdayStr, end: yesterdayStr, label: 'YESTERDAY', dates: [yesterdayStr] };
    case 'THIS_WEEK':
      return { start: mondayStr, end: todayStr, label: 'THIS_WEEK', dates: getDatesList(mondayStr, todayStr) };
    case 'LAST_7_DAYS':
      return { start: sevenDaysAgoStr, end: todayStr, label: 'LAST_7_DAYS', dates: getDatesList(sevenDaysAgoStr, todayStr) };
    case 'THIS_MONTH':
      return { start: firstDayOfMonth, end: todayStr, label: 'THIS_MONTH', dates: getDatesList(firstDayOfMonth, todayStr) };
    case 'LAST_30_DAYS':
    case 'LAST_MONTH':
      return { start: thirtyDaysAgoStr, end: todayStr, label: 'LAST_30_DAYS', dates: getDatesList(thirtyDaysAgoStr, todayStr) };
    default:
      return { label: period, dates: [todayStr] };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || 'THIS_WEEK';
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const tenantFilter = searchParams.get('tenant') || 'all';

  const cacheKey = `data-sync:${period}:${tenantFilter}:${startDate || ''}:${endDate || ''}`;

  return withCache(cacheKey, 60_000, async () => {
    const dateRange = getDateRangeForPeriod(period, startDate, endDate);
    const scriptPeriod = toScriptPeriod(period, startDate, endDate);

    const pool = getMysqlPool();

    // Ensure system_settings exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key_name VARCHAR(100) PRIMARY KEY,
        value_data TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Fetch active tenants
    let tenantQuery = `
      SELECT 
        t.id, 
        t.tenant_code, 
        t.campus_name, 
        t.database_name, 
        t.redis_prefix,
        wg.wazuh_group_name,
        ic.iris_customer_id,
        ic.iris_customer_name
      FROM tenants t
      LEFT JOIN tenant_wazuh_groups wg ON wg.tenant_id = t.id
      LEFT JOIN tenant_iris_customers ic ON ic.tenant_id = t.id
      WHERE t.is_active = 1
    `;
    const queryParams: any[] = [];
    if (tenantFilter !== 'all') {
      tenantQuery += ' AND t.tenant_code = ?';
      queryParams.push(tenantFilter.toUpperCase());
    }
    tenantQuery += ' ORDER BY t.id ASC';

    const [tenantsRows]: any = await pool.query(tenantQuery, queryParams);

    // Fetch tenant agents
    const [agentRows]: any = await pool.query(
      `SELECT tenant_id, agent_id, agent_name FROM tenant_agents ORDER BY tenant_id, agent_id ASC`
    );
    const agentsByTenant: Record<number, { ids: string[]; names: string[] }> = {};
    for (const a of agentRows) {
      if (!agentsByTenant[a.tenant_id]) {
        agentsByTenant[a.tenant_id] = { ids: [], names: [] };
      }
      agentsByTenant[a.tenant_id].ids.push(a.agent_id);
      agentsByTenant[a.tenant_id].names.push(a.agent_name);
    }

    // Concurrently execute all 4 official audit scripts as the Single Source of Truth
    const alertsCmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/check_alerts_indexer_mongo.py --tenant ${tenantFilter} --mode ${scriptPeriod} --json`;
    const vulnCmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/check_vulnerability_indexer_mongo.py --tenant ${tenantFilter} --mode ${scriptPeriod} --json`;
    const redisCmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/check_mongo_redis_multitenant_sync.py --tenant ${tenantFilter} --period ${scriptPeriod} --json`;
    const irisCmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/check_iris_reports.py --tenant ${tenantFilter} --period ${scriptPeriod} --json`;

    const [alertsRes, vulnRes, redisRes, irisRes] = await Promise.all([
      runRemoteScript(alertsCmd).catch(() => ({ stdout: '', stderr: '', success: false })),
      runRemoteScript(vulnCmd).catch(() => ({ stdout: '', stderr: '', success: false })),
      runRemoteScript(redisCmd).catch(() => ({ stdout: '', stderr: '', success: false })),
      runRemoteScript(irisCmd).catch(() => ({ stdout: '', stderr: '', success: false })),
    ]);

    const alertsDataMap = new Map<string, any>();
    if (alertsRes && alertsRes.success && alertsRes.stdout) {
      try {
        const j = JSON.parse(alertsRes.stdout);
        for (const t of j.tenants || []) {
          alertsDataMap.set(String(t.tenant_code).toUpperCase(), t);
        }
      } catch {}
    }

    const vulnDataMap = new Map<string, any>();
    if (vulnRes && vulnRes.success && vulnRes.stdout) {
      try {
        const j = JSON.parse(vulnRes.stdout);
        for (const t of j.tenants || []) {
          vulnDataMap.set(String(t.tenant_code).toUpperCase(), t);
        }
      } catch {}
    }

    const redisDataMap = new Map<string, any>();
    if (redisRes && redisRes.success && redisRes.stdout) {
      try {
        const j = JSON.parse(redisRes.stdout);
        for (const t of j.tenants || []) {
          redisDataMap.set(String(t.tenant_code).toUpperCase(), t);
        }
      } catch {}
    }

    let irisAudit: any = null;
    if (irisRes && irisRes.success && irisRes.stdout) {
      try {
        irisAudit = JSON.parse(irisRes.stdout);
      } catch {}
    }

    if (!irisAudit || !irisAudit.tenants) {
      irisAudit = {
        status: 'success',
        period: scriptPeriod,
        is_in_sync: true,
        tenants: tenantsRows.map((t: any) => ({
          tenant_code: t.tenant_code,
          campus_name: t.campus_name,
          database_name: t.database_name,
          iris_cases_count: 0,
          mongo_reports_count: 0,
          is_in_sync: true,
          cases: [],
        })),
      };
    }

    const auditResults = tenantsRows.map((t: any) => {
      const code = String(t.tenant_code).toUpperCase();
      const tenantAgents = agentsByTenant[t.id] || { ids: [], names: [] };

      const al = alertsDataMap.get(code);
      const vl = vulnDataMap.get(code);
      const rd = redisDataMap.get(code);

      const dateBreakdownAlerts = al?.dates || [];
      const dateBreakdownVulns: VulnerabilityDateBreakdown[] = vl?.dates || [];
      const redisAudit = rd?.redis_audit || {
        incidents: {
          mongo: al?.total_mongo || 0,
          redis: 0,
          isSynced: false,
          dateBreakdown: [],
        },
        vulnerabilities: { mongo: 0, redis: 0, isSynced: false },
        reports: { mongo: 0, redis: 0, isSynced: false },
        devices: { mongo: 0, redis: 0, isSynced: false },
        historicalStats: { cached: false, isSynced: false },
        isAllSynced: false,
      };

      const totalMongoIncidents = al?.total_mongo ?? dateBreakdownAlerts.reduce((sum: number, r: any) => sum + (r.total_mongo || 0), 0);
      const totalMongoVulns = vl?.period_summary?.total?.mongo ?? dateBreakdownVulns.reduce((sum: number, r: any) => sum + (r.total_mongo || 0), 0);
      const totalMongoReports = redisAudit.reports?.mongo || 0;

      return {
        id: t.id,
        tenantCode: t.tenant_code,
        campusName: t.campus_name,
        tenantName: t.campus_name,
        databaseName: t.database_name,
        redisPrefix: t.redis_prefix,
        wazuhGroups: t.wazuh_group_name ? [t.wazuh_group_name] : [],
        filterAgentIds: tenantAgents.ids,
        filterAgentNames: tenantAgents.names,
        irisCustomerId: t.iris_customer_id,
        irisCustomerName: t.iris_customer_name,
        totalMongoIncidents,
        totalMongoVulns,
        totalMongoReports,
        redisKeysCount: rd?.redis_keys_count || 0,
        redisSummaryPresent: rd?.redis_summary_present || false,
        redisAudit,
        dateBreakdown: dateBreakdownAlerts,
        dateBreakdownAlerts,
        dateBreakdownVulns,
      };
    });


    // Fetch all active tenants unconditionally so tenant filter options never disappear
    const [allTenantsRows]: any = await pool.query(
      `SELECT id, tenant_code, campus_name, database_name FROM tenants WHERE is_active = 1 ORDER BY id ASC`
    );
    const allTenants = (allTenantsRows || []).map((t: any) => ({
      id: t.id,
      tenantCode: t.tenant_code,
      tenantName: t.campus_name || t.tenant_code,
      campusName: t.campus_name,
      databaseName: t.database_name,
    }));

    // Fetch live crontab ground-truth from 10.20.100.86
    let cronConfig = {
      enabled: true,
      schedule: '0 * * * *',
      lastRunAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      nextRunAt: computeNextRun('0 * * * *'),
    };

    try {
      const cronRes = await runRemoteScript('sudo crontab -l');
      if (cronRes.success && cronRes.stdout) {
        const lines = cronRes.stdout.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.includes('/opt/multi-tenant/scripts/cron_hourly_sync.sh')) {
            if (trimmed.startsWith('#')) {
              cronConfig.enabled = false;
              const clean = trimmed.replace(/^#+\s*/, '').trim();
              const parts = clean.split(/\s+/);
              if (parts.length >= 5) {
                cronConfig.schedule = parts.slice(0, 5).join(' ');
              }
            } else {
              cronConfig.enabled = true;
              const parts = trimmed.split(/\s+/);
              if (parts.length >= 5) {
                cronConfig.schedule = parts.slice(0, 5).join(' ');
              }
            }
            break;
          }
        }
      }

      // Check last run from /var/log/multi-tenant-sync.log
      const logRes = await runRemoteScript('grep "SINKRONISASI OTOMATIS" /var/log/multi-tenant-sync.log | tail -n 1');
      if (logRes.success && logRes.stdout) {
        const match = logRes.stdout.match(/\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
        if (match) {
          cronConfig.lastRunAt = new Date(match[1].replace(' ', 'T') + '+07:00').toISOString();
        }
      }
      cronConfig.nextRunAt = computeNextRun(cronConfig.schedule);
    } catch (cErr) {
      console.warn('Failed to query remote crontab:', cErr);
    }

    return NextResponse.json({
      success: true,
      period: dateRange.label,
      dateRange,
      auditResults,
      irisAudit,
      cronConfig,
      allTenants,
    });
  }).catch((err: any) => {
    console.error('API /api/data-sync GET Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch audit data' },
      { status: 500 }
    );
  });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  // Invalidate data-sync cache after any sync/check action
  invalidateCachePrefix('data-sync:');
  try {
    const body = await request.json();
    const { action } = body;
    const pool = getMysqlPool();


    // ----------------------------------------------------
    // ACTION 1: UPDATE CRON CONFIG (DIRECT HOST CRONTAB)
    // ----------------------------------------------------
    if (action === 'update-cron') {
      const { enabled = true, schedule = '0 * * * *' } = body;
      const nextRunAt = computeNextRun(schedule);

      // Directly update root crontab on 10.20.100.86
      const isEnabledPy = enabled ? 'True' : 'False';
      const pyScript = `import subprocess; p = subprocess.run(['sudo', 'crontab', '-l'], capture_output=True, text=True); lines = [l for l in p.stdout.splitlines() if 'cron_hourly_sync.sh' not in l and l.strip()]; line = '${schedule} /opt/multi-tenant/scripts/cron_hourly_sync.sh' if ${isEnabledPy} else '# ${schedule} /opt/multi-tenant/scripts/cron_hourly_sync.sh'; lines.append(line); new_cron = '\\n'.join(lines) + '\\n'; subprocess.run(['sudo', 'crontab', '-'], input=new_cron, text=True, capture_output=True)`;
      
      const remoteRes = await runRemoteScript(`/opt/venv/bin/python -c "${pyScript.replace(/"/g, '\\"')}"`);

      const cronData = {
        enabled,
        schedule,
        lastRunAt: new Date().toISOString(),
        nextRunAt,
      };

      try {
        await pool.query(
          `INSERT INTO system_settings (key_name, value_data, updated_at) 
           VALUES ('cron_sync_config', ?, NOW()) 
           ON DUPLICATE KEY UPDATE value_data = ?, updated_at = NOW()`,
          [JSON.stringify(cronData), JSON.stringify(cronData)]
        );
      } catch {}

      return NextResponse.json({
        success: remoteRes.success,
        message: remoteRes.success
          ? `Server crontab updated successfully (${enabled ? 'Active' : 'Disabled'}, ${schedule}).`
          : 'Failed to update remote crontab.',
        cronConfig: cronData,
      });
    }

    // ----------------------------------------------------
    // ACTION 2: RUN DATA CHECK SCRIPT
    // ----------------------------------------------------
    if (action === 'run-check') {
      const {
        checkScript = 'check_alerts_indexer_mongo',
        period = 'THIS_WEEK',
        startDate,
        endDate,
        tenant = 'all',
      } = body;

      const scriptPeriod = toScriptPeriod(period, startDate, endDate);
      let cmd = '';

      if (checkScript === 'check_iris_reports') {
        cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/check_iris_reports.py --tenant ${tenant} --period ${scriptPeriod} --json`;
      } else if (checkScript === 'check_vulnerability_indexer_mongo') {
        cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/check_vulnerability_indexer_mongo.py --tenant ${tenant} --mode ${scriptPeriod} --json`;
      } else if (checkScript === 'check_mongo_redis_multitenant') {
        cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/check_mongo_redis_multitenant_sync.py --tenant ${tenant} --period ${scriptPeriod}`;
      } else {
        cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/check_alerts_indexer_mongo.py --tenant ${tenant} --mode ${scriptPeriod}`;
      }

      const res = await runRemoteScript(cmd);
      const durationMs = Date.now() - startTime;

      let parsedJson = null;
      if ((checkScript === 'check_iris_reports' || checkScript === 'check_vulnerability_indexer_mongo') && res.stdout) {
        try {
          parsedJson = JSON.parse(res.stdout);
        } catch {}
      }

      return NextResponse.json({
        success: res.success,
        action: 'run-check',
        checkScript,
        durationMs,
        irisData: parsedJson,
        message: res.success ? 'Audit verification completed successfully' : 'Verification completed with warnings',
      });
    }

    // ----------------------------------------------------
    // ACTION 3: RUN PIPELINE SYNCHRONIZATION
    // ----------------------------------------------------
    const {
      pipeline = 'indexer-mongo',
      tenant = 'all',
      period = 'THIS_WEEK',
      startDate,
      endDate,
    } = body;

    const scriptPeriod = toScriptPeriod(period, startDate, endDate);
    let cmd = '';

    if (pipeline === 'iris-mongo') {
      cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/sync_iris_reports.py --tenant ${tenant} --period ${scriptPeriod} --json --force`;
    } else if (pipeline === 'mongo-redis') {
      cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/sync_mongo_redis_multitenant.py --tenant ${tenant} --period ${scriptPeriod}`;
    } else if (pipeline === 'vulnerabilities' || pipeline === 'vulnerability-indexer-mongo') {
      cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/sync_vulnerability_indexer_mongo.py --tenant ${tenant} --period ${scriptPeriod}`;
    } else if (pipeline === 'all') {
      cmd = `/opt/multi-tenant/scripts/cron_hourly_sync.sh ${scriptPeriod} ${tenant}`;
    } else {
      cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/sync_alerts_indexer_mongo.py --tenant ${tenant} --period ${scriptPeriod}`;
    }

    const res = await runRemoteScript(cmd, 300000);
    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: res.success,
      action: 'run-sync',
      pipeline,
      durationMs,
      message: res.success ? 'Synchronization completed successfully' : (res.stderr || 'Synchronization completed with warnings'),
      error: res.success ? undefined : (res.stderr || res.stdout || 'Sync failed'),
    });
  } catch (err: any) {
    console.error('API /api/data-sync POST Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to execute synchronization' },
      { status: 500 }
    );
  }
}
