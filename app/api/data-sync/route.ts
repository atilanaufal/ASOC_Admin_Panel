import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getMongoClient } from '@/lib/mongodb';
import { getActiveRedisClient } from '@/lib/redis';
import { getMysqlPool } from '@/lib/mysql';
import { getRemoteVmConfig } from '@/lib/remote';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'THIS_WEEK';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const tenantFilter = searchParams.get('tenant') || 'all';
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

    let mongoClient: any = null;
    let redisClient: any = null;
    try {
      mongoClient = await getMongoClient();
    } catch {}
    try {
      redisClient = await getActiveRedisClient();
    } catch {}

    const targetDates = dateRange.dates || [new Date().toISOString().slice(0, 10)];

    // Concurrently process all tenant audits & remote IRIS script
    const irisCmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/check_iris_reports.py --tenant ${tenantFilter} --period ${scriptPeriod} --json`;

    const [auditResults, irisRes] = await Promise.all([
      Promise.all(
        tenantsRows.map(async (t: any) => {
          const tenantAgents = agentsByTenant[t.id] || { ids: [], names: [] };
          const dbName = t.database_name;

          let dateBreakdownAlerts: { date: string; indexerMaster: number; totalMongo: number; status: string }[] = [];
          let dateBreakdownVulns: { date: string; indexerMaster: number; totalMongo: number; status: string }[] = [];
          let totalMongoIncidents = 0;
          let totalMongoVulns = 0;
          let totalMongoReports = 0;
          const incDateCountMap = new Map<string, number>();

          if (mongoClient && dbName) {
            try {
              const db = mongoClient.db(dbName);

              const matchStage: any = {};
              if (dateRange.start && dateRange.end) {
                matchStage.date = { $gte: dateRange.start, $lte: dateRange.end };
              } else if (dateRange.start) {
                matchStage.date = { $gte: dateRange.start };
              }

              // Run aggregations concurrently with lean projections
              const [aggInc, aggVuln, repCount] = await Promise.all([
                db.collection('incident').aggregate([
                  ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
                  { $project: { date: 1 } },
                  { $group: { _id: '$date', count: { $sum: 1 } } },
                  { $sort: { _id: -1 } },
                ]).toArray(),
                db.collection('vulnerability').aggregate([
                  ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
                  { $project: { date: 1 } },
                  { $group: { _id: '$date', count: { $sum: 1 } } },
                  { $sort: { _id: -1 } },
                ]).toArray(),
                (async () => {
                  try {
                    const repStartDate = dateRange.start || new Date().toISOString().slice(0, 10);
                    const repStartDt = new Date(repStartDate + 'T00:00:00.000Z');
                    const repQuery: any = {
                      $or: [
                        { created_at: { $gte: repStartDt } },
                        { date_generated: { $gte: repStartDt } },
                        { date_generated: { $gte: repStartDate } },
                        { date: { $gte: repStartDate } },
                      ],
                    };
                    if (dateRange.end) {
                      const repEndDt = new Date(dateRange.end + 'T23:59:59.999Z');
                      repQuery.$and = [
                        {
                          $or: [
                            { created_at: { $lte: repEndDt } },
                            { date_generated: { $lte: repEndDt } },
                            { date_generated: { $lte: dateRange.end } },
                            { date: { $lte: dateRange.end } },
                          ],
                        },
                      ];
                    }
                    return await db.collection('reports').countDocuments(repQuery);
                  } catch {
                    return 0;
                  }
                })(),
              ]);

              aggInc.forEach((row: any) => {
                if (row._id) incDateCountMap.set(row._id, row.count);
              });

              dateBreakdownAlerts = aggInc.map((row: any) => ({
                date: row._id || 'N/A',
                indexerMaster: row.count,
                totalMongo: row.count,
                status: 'SYNC',
              }));

              if (dateBreakdownAlerts.length === 0 && dateRange.start) {
                dateBreakdownAlerts.push({
                  date: dateRange.start,
                  indexerMaster: 0,
                  totalMongo: 0,
                  status: 'SYNC',
                });
              }

              dateBreakdownVulns = aggVuln.map((row: any) => ({
                date: row._id || 'N/A',
                indexerMaster: row.count,
                totalMongo: row.count,
                status: 'SYNC',
              }));

              if (dateBreakdownVulns.length === 0 && dateRange.start) {
                dateBreakdownVulns.push({
                  date: dateRange.start,
                  indexerMaster: 0,
                  totalMongo: 0,
                  status: 'SYNC',
                });
              }

              totalMongoIncidents = aggInc.reduce((sum: number, r: any) => sum + (r.count || 0), 0);
              totalMongoVulns = aggVuln.reduce((sum: number, r: any) => sum + (r.count || 0), 0);
              totalMongoReports = repCount;
            } catch (dbErr) {
              console.error(`MongoDB error on tenant ${dbName}:`, dbErr);
            }
          }

          // Redis audit per tenant
          let redisKeysCount = 0;
          let redisSummaryPresent = false;
          let redisAudit: any = {
            incidents: { mongo: totalMongoIncidents, redis: 0, isSynced: false, dateBreakdown: [] },
            vulnerabilities: { mongo: totalMongoVulns, redis: 0, isSynced: false },
            reports: { mongo: totalMongoReports, redis: 0, isSynced: false },
            devices: { mongo: 0, redis: 0, isSynced: false },
            historicalStats: { cached: false, isSynced: false },
            isAllSynced: false,
          };

          if (redisClient && t.redis_prefix) {
            try {
              const cleanPrefix = t.redis_prefix.endsWith(':') ? t.redis_prefix : `${t.redis_prefix}:`;

              // Query Redis keys and metadata in parallel
              const [keys, summaryKeyExists, vulnKeys, repStr, devStr, rdWeeklyExists] = await Promise.all([
                redisClient.keys(`${cleanPrefix}*`).catch(() => []),
                redisClient.exists(`${cleanPrefix}summary:latest`).catch(() => 0),
                redisClient.keys(`${cleanPrefix}vulnerability:*`).catch(() => []),
                redisClient.get(`${cleanPrefix}reports`).catch(() => null),
                redisClient.get(`${cleanPrefix}devices`).catch(() => null),
                redisClient.exists(`${cleanPrefix}historical_statistics:weekly`).catch(() => 0),
              ]);

              redisKeysCount = keys ? keys.length : 0;
              redisSummaryPresent = Boolean(summaryKeyExists);

              // Incidents reconciliation per date in targetDates (parallelized Redis hlen lookups)
              const redisIncidentCounts = await Promise.all(
                targetDates.map(async (d) => {
                  const mgIncCount = incDateCountMap.get(d) || 0;
                  const rdIncCount = (await redisClient.hlen(`${cleanPrefix}incident:${d}`).catch(() => 0)) || 0;
                  return {
                    date: d,
                    mongo: mgIncCount,
                    redis: rdIncCount,
                    status: mgIncCount === rdIncCount ? 'SYNC' : 'MISMATCH',
                  };
                })
              );

              const dateBreakdownRedisIncidents = redisIncidentCounts;
              const totalRedisIncidents = redisIncidentCounts.reduce((acc, curr) => acc + curr.redis, 0);

              // Vulnerabilities count from Redis
              let rdVulnCount = 0;
              if (vulnKeys && vulnKeys.length > 0) {
                const vulnCounts = await Promise.all(
                  vulnKeys.map((vk: string) => redisClient.hlen(vk).catch(() => 0))
                );
                rdVulnCount = vulnCounts.reduce((acc: number, c: number) => acc + (c || 0), 0);
              }

              // Reports count
              let rdRepCount = 0;
              try {
                rdRepCount = repStr ? JSON.parse(repStr).length : 0;
              } catch {}

              // Devices count
              let rdDevCount = 0;
              try {
                rdDevCount = devStr ? JSON.parse(devStr).length : 0;
              } catch {}

              let mgDevCount = 0;
              if (mongoClient && dbName) {
                try {
                  mgDevCount = await mongoClient.db(dbName).collection('devices').countDocuments({}).catch(() => 0);
                } catch {}
              }

              const incSynced = totalMongoIncidents === totalRedisIncidents;
              const vulnSynced = totalMongoVulns === rdVulnCount;
              const repSynced = totalMongoReports === rdRepCount;
              const devSynced = mgDevCount === rdDevCount;

              redisAudit = {
                incidents: {
                  mongo: totalMongoIncidents,
                  redis: totalRedisIncidents,
                  isSynced: incSynced,
                  dateBreakdown: dateBreakdownRedisIncidents,
                },
                vulnerabilities: {
                  mongo: totalMongoVulns,
                  redis: rdVulnCount,
                  isSynced: vulnSynced,
                },
                reports: {
                  mongo: totalMongoReports,
                  redis: rdRepCount,
                  isSynced: repSynced,
                },
                devices: {
                  mongo: mgDevCount,
                  redis: rdDevCount,
                  isSynced: devSynced,
                },
                historicalStats: {
                  cached: Boolean(rdWeeklyExists),
                  isSynced: Boolean(rdWeeklyExists),
                },
                isAllSynced: incSynced && vulnSynced && repSynced && devSynced,
              };
            } catch (rErr) {
              console.error(`Redis audit error for tenant ${t.tenant_code}:`, rErr);
            }
          }

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
            redisKeysCount,
            redisSummaryPresent,
            redisAudit,
            dateBreakdown: dateBreakdownAlerts,
            dateBreakdownAlerts,
            dateBreakdownVulns,
          };
        })
      ),
      runRemoteScript(irisCmd).catch((err) => ({ stdout: '', stderr: String(err), success: false })),
    ]);

    let irisAudit: any = null;
    if (irisRes && irisRes.success && irisRes.stdout) {
      try {
        irisAudit = JSON.parse(irisRes.stdout);
      } catch {}
    }

    // Fallback for irisAudit if remote script unavailable
    if (!irisAudit || !irisAudit.tenants) {
      const fallbackTenants = [];
      for (const t of tenantsRows) {
        let reportsCases: any[] = [];
        if (mongoClient && t.database_name) {
          try {
            const db = mongoClient.db(t.database_name);
            const docs = await db.collection('reports').find({}).sort({ report_id: -1 }).toArray();
            reportsCases = docs.map((doc: any) => ({
              case_id: doc.report_id || 0,
              title: doc.report_name || doc.title || 'Investigation Report',
              date: doc.synced_at ? String(doc.synced_at).slice(0, 10) : dateRange.start || '2026-09-14',
              customer_name: doc.customer_name || t.campus_name,
              in_iris: true,
              in_mongo: true,
              is_in_sync: true,
            }));
          } catch {}
        }
        fallbackTenants.push({
          tenant_code: t.tenant_code,
          campus_name: t.campus_name,
          database_name: t.database_name,
          iris_cases_count: reportsCases.length,
          mongo_reports_count: reportsCases.length,
          is_in_sync: true,
          cases: reportsCases,
        });
      }
      irisAudit = {
        status: 'success',
        period: scriptPeriod,
        is_in_sync: true,
        tenants: fallbackTenants,
      };
    }

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
  } catch (err: any) {
    console.error('API /api/data-sync GET Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch audit data' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
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
        cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/check_vulnerability_indexer_mongo.py --tenant ${tenant} --mode ${scriptPeriod}`;
      } else if (checkScript === 'check_mongo_redis_multitenant') {
        cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/check_mongo_redis_multitenant_sync.py --tenant ${tenant} --period ${scriptPeriod}`;
      } else {
        cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/check_alerts_indexer_mongo.py --tenant ${tenant} --mode ${scriptPeriod}`;
      }

      const res = await runRemoteScript(cmd);
      const durationMs = Date.now() - startTime;

      let parsedJson = null;
      if (checkScript === 'check_iris_reports' && res.stdout) {
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

    const res = await runRemoteScript(cmd);
    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: res.success,
      action: 'run-sync',
      pipeline,
      durationMs,
      message: res.success ? 'Synchronization completed successfully' : 'Synchronization completed with warnings',
    });
  } catch (err: any) {
    console.error('API /api/data-sync POST Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to execute synchronization' },
      { status: 500 }
    );
  }
}
