import { NextRequest, NextResponse } from "next/server";
import { getMongoClient } from "@/lib/mongodb";
import { getMysqlPool } from "@/lib/mysql";
import { getActiveRedisClient } from "@/lib/redis";
import { runRemoteScript } from "@/lib/remote";
import {
  DateRange,
  TenantMeta,
  auditAlertsNative,
  auditVulnsNative,
  auditRedisNative,
  auditIrisNative,
} from "@/lib/native-audit";
import {
  SyncTarget,
  syncAlertsNative,
  syncVulnsNative,
  syncRedisNative,
  syncIrisNative,
} from "@/lib/native-sync";
import {
  getHostCronStatus,
  updateHostCron,
  getHostCronLogs,
} from "@/lib/cron-manager-client";
import { requireSession, requireSuperadmin, isPlatformAdmin } from "@/lib/session";

function computeNextRun(cronExpr: string): string {
  const now = new Date();
  const next = new Date(now.getTime());

  try {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length >= 5) {
      const minPart = parts[0];
      const hourPart = parts[1];

      next.setSeconds(0, 0);

      // Handle step minutes: */5, */15, */30
      if (minPart.startsWith("*/")) {
        const step = parseInt(minPart.slice(2), 10);
        if (!isNaN(step) && step > 0) {
          const currentMin = now.getMinutes();
          const remainder = currentMin % step;
          const addMin = step - remainder;
          next.setMinutes(currentMin + addMin);
          return next.toISOString();
        }
      }

      // Handle exact minute: "0", "15", etc.
      const exactMin = parseInt(minPart, 10);
      if (!isNaN(exactMin)) {
        next.setMinutes(exactMin);

        // Check hour part
        const exactHour = parseInt(hourPart, 10);
        if (!isNaN(exactHour)) {
          next.setHours(exactHour);
          if (next <= now) {
            next.setDate(next.getDate() + 1);
          }
          return next.toISOString();
        }

        // Hourly at exactMin
        if (next <= now) {
          next.setHours(next.getHours() + 1);
        }
        return next.toISOString();
      }
    }
  } catch (e) {
    console.error("computeNextRun error:", e);
  }

  // Fallback: 1 hour from now
  next.setHours(next.getHours() + 1);
  return next.toISOString();
}

function parsePeriodToDates(period: string, startDate?: string, endDate?: string): { start: string; end: string; dates: string[] } {
  const p = (period || "today").toLowerCase();
  const now = new Date();
  const offsetMs = 7 * 60 * 60 * 1000;
  const nowWib = new Date(now.getTime() + offsetMs);
  const todayStr = nowWib.toISOString().slice(0, 10);

  if (p === "custom" && startDate && endDate) {
    const s = startDate <= endDate ? startDate : endDate;
    const e = startDate <= endDate ? endDate : startDate;
    const cur = new Date(`${s}T00:00:00Z`);
    const end = new Date(`${e}T00:00:00Z`);
    const dates: string[] = [];
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return { start: s, end: e, dates };
  }

  if (p === "yesterday") {
    const y = new Date(nowWib.getTime() - 86400000).toISOString().slice(0, 10);
    return { start: y, end: y, dates: [y] };
  }

  if (p === "this_week") {
    const dayOfWeek = nowWib.getUTCDay() || 7;
    const mon = new Date(nowWib);
    mon.setUTCDate(mon.getUTCDate() - (dayOfWeek - 1));
    const dates: string[] = [];
    const cur = new Date(mon);
    while (cur <= nowWib) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return { start: dates[0] || todayStr, end: todayStr, dates };
  }

  if (p === "last_week" || p === "last_7_days") {
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      dates.push(new Date(nowWib.getTime() - i * 86400000).toISOString().slice(0, 10));
    }
    return { start: dates[0], end: dates[dates.length - 1], dates };
  }

  if (p === "this_month") {
    const y = nowWib.getUTCFullYear();
    const m = nowWib.getUTCMonth();
    const firstDay = new Date(Date.UTC(y, m, 1));
    const dates: string[] = [];
    const cur = new Date(firstDay);
    while (cur <= nowWib) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return { start: dates[0], end: todayStr, dates };
  }

  if (p === "last_month" || p === "last_30_days") {
    const dates: string[] = [];
    for (let i = 29; i >= 0; i--) {
      dates.push(new Date(nowWib.getTime() - i * 86400000).toISOString().slice(0, 10));
    }
    return { start: dates[0], end: dates[dates.length - 1], dates };
  }

  return { start: todayStr, end: todayStr, dates: [todayStr] };
}

async function getTenantsData(tenantFilter: string = "all"): Promise<TenantMeta[]> {
  const pool = getMysqlPool();
  let query = `
    SELECT t.id, t.tenant_code, t.campus_name, t.database_name, t.redis_prefix,
           GROUP_CONCAT(DISTINCT wg.wazuh_group_name) as wazuh_groups,
           ic.iris_customer_id, ic.iris_customer_name
    FROM tenants t
    LEFT JOIN tenant_wazuh_groups wg ON t.id = wg.tenant_id
    LEFT JOIN tenant_iris_customers ic ON t.id = ic.tenant_id
    WHERE t.is_active = 1
  `;
  const params: any[] = [];
  if (tenantFilter && tenantFilter !== "all") {
    query += " AND (t.tenant_code = ? OR t.database_name = ?)";
    params.push(tenantFilter.toUpperCase(), tenantFilter.toLowerCase());
  }
  query += " GROUP BY t.id, t.tenant_code, t.campus_name, t.database_name, t.redis_prefix, ic.iris_customer_id, ic.iris_customer_name ORDER BY t.id ASC";

  const [tenantsRows] = await pool.query<any[]>(query, params);

  const [agentRows] = await pool.query<any[]>(
    "SELECT tenant_id, agent_id, agent_name FROM tenant_agents ORDER BY tenant_id, agent_id ASC"
  );
  const agentsByTenant: Record<number, { ids: string[]; names: string[] }> = {};
  for (const a of agentRows) {
    if (!agentsByTenant[a.tenant_id]) {
      agentsByTenant[a.tenant_id] = { ids: [], names: [] };
    }
    agentsByTenant[a.tenant_id].ids.push(String(a.agent_id));
    agentsByTenant[a.tenant_id].names.push(String(a.agent_name));
  }

  return tenantsRows.map((r: any) => {
    const wg = r.wazuh_groups ? r.wazuh_groups.split(",").map((s: string) => s.trim()) : [];
    const ag = agentsByTenant[r.id] || { ids: [], names: [] };
    return {
      id: r.id,
      tenantCode: r.tenant_code,
      tenantName: r.campus_name || r.tenant_code,
      campusName: r.campus_name || r.tenant_code,
      databaseName: r.database_name,
      redisPrefix: r.redis_prefix || `${r.database_name}:`,
      wazuhGroups: wg,
      filterAgentIds: ag.ids,
      filterAgentNames: ag.names,
      irisCustomerId: r.iris_customer_id ? Number(r.iris_customer_id) : null,
      irisCustomerName: r.iris_customer_name || "-",
      totalMongoIncidents: 0,
      totalIndexerIncidents: 0,
      totalMongoVulns: 0,
      totalIndexerVulns: 0,
      totalMongoReports: 0,
      redisKeysCount: 0,
      redisSummaryPresent: false,
      dateBreakdown: [],
    };
  });
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.errorResponse) return auth.errorResponse;
    const { user: currentUser } = auth;
    const isSuperadmin = currentUser.role === 'superadmin';

    const { searchParams } = new URL(req.url);
    const tab = searchParams.get("tab") || "alerts";
    const period = searchParams.get("period") || "today";
    let tenant = searchParams.get("tenant") || "all";
    if (!isPlatformAdmin(currentUser) && currentUser.tenantCode && currentUser.tenantCode !== 'MASTER') {
      tenant = currentUser.tenantCode;
    }
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    const dateRange = parsePeriodToDates(period, startDate, endDate);
    const tenantsList = await getTenantsData(tenant);
    const allTenantsList = await getTenantsData("all");

    let mongoClient = null;
    try {
      mongoClient = await getMongoClient();
    } catch (e: any) {
      console.warn("MongoDB connection warning:", e.message);
    }

    const redisClient = await getActiveRedisClient();

    if (tab === "alerts") {
      const results = await auditAlertsNative(tenantsList, dateRange, mongoClient);
      return NextResponse.json({
        success: true,
        tab,
        period,
        allTenants: allTenantsList,
        auditResults: results,
      });
    }

    if (tab === "vulnerabilities") {
      const results = await auditVulnsNative(tenantsList, dateRange, mongoClient);
      return NextResponse.json({
        success: true,
        tab,
        period,
        allTenants: allTenantsList,
        auditResults: results,
      });
    }

    if (tab === "redis") {
      const p = period.toLowerCase();
      const redisPeriod = (p === "today" || p === "yesterday") ? p : "this_week";
      const redisDateRange = parsePeriodToDates(redisPeriod);
      const results = await auditRedisNative(tenantsList, redisDateRange.dates, mongoClient, redisClient);
      return NextResponse.json({
        success: true,
        tab,
        period: redisPeriod.toUpperCase(),
        allTenants: allTenantsList,
        auditResults: results,
      });
    }

    if (tab === "iris") {
      const irisAudit = await auditIrisNative(tenantsList, dateRange, mongoClient);
      return NextResponse.json({
        success: true,
        tab,
        period,
        allTenants: allTenantsList,
        irisAudit,
      });
    }

    // CronJob Tab (Crontab tetap via sudo crontab -l)
    let cronConfig: any = null;
    let cronLogs = "";
    if (tab === "cronjob") {
      try {
        const pool = getMysqlPool();
        const [cronRows] = await pool.query<any[]>(
          "SELECT value_data FROM system_settings WHERE key_name = 'cron_sync_config' LIMIT 1"
        );
        let schedule = "0 * * * *";
        let enabled = true;
        let lastRunAt = "";
        let nextRunAt = computeNextRun(schedule);

        if (cronRows.length > 0 && cronRows[0].value_data) {
          try {
            const parsed = typeof cronRows[0].value_data === "string"
              ? JSON.parse(cronRows[0].value_data)
              : cronRows[0].value_data;
            if (parsed.schedule) schedule = parsed.schedule;
            if (parsed.enabled !== undefined) enabled = Boolean(parsed.enabled);
            if (parsed.lastRunAt) lastRunAt = parsed.lastRunAt;
            if (parsed.nextRunAt) nextRunAt = parsed.nextRunAt;
          } catch {}
        }

        // Try Host Cron Manager (Agent API) first for Dockerized or Native compatibility
        const hostCron = await getHostCronStatus();
        let status = "Inactive";
        if (hostCron.success) {
          status = hostCron.active ? "Active" : "Disabled";
          enabled = hostCron.enabled;
          schedule = hostCron.schedule;
          if (hostCron.lastRun) {
            lastRunAt = hostCron.lastRun;
          }
        } else {
          // Fallback to direct shell check if Agent is not reachable
          const crontabRes = await runRemoteScript("sudo crontab -l", 5000);
          if (crontabRes.success && crontabRes.stdout) {
            const hasCron = crontabRes.stdout.split("\n").some((l: string) =>
              !l.trim().startsWith("#") && l.includes("cron_hourly_sync.sh")
            );
            status = hasCron ? "Active" : "Disabled";
            if (!hasCron) enabled = false;
          }
        }

        // Recompute nextRun if nextRunAt is stale or not a valid ISO date
        let validNextRun = nextRunAt;
        if (!validNextRun || isNaN(new Date(validNextRun).getTime()) || new Date(validNextRun) <= new Date()) {
          validNextRun = computeNextRun(schedule);
        }

        cronConfig = {
          enabled,
          schedule,
          status,
          nextRun: validNextRun,
          lastRun: lastRunAt,
          nextRunAt: validNextRun,
          lastRunAt,
        };
      } catch (err) {
        console.error("Failed to load cron config:", err);
      }

      cronLogs = await getHostCronLogs(60);
      if (!cronLogs || cronLogs.startsWith("Error") || cronLogs.startsWith("Failed")) {
        const logRes = await runRemoteScript('tail -n 60 /var/log/multi-tenant-sync.log 2>/dev/null || echo "No log found"', 5000);
        if (logRes.success) {
          cronLogs = logRes.stdout;
        }
      }
    }

    return NextResponse.json({
      success: true,
      tab,
      period,
      allTenants: allTenantsList,
      auditResults: tenantsList,
      cronConfig,
      cronLogs,
    });
  } catch (err: any) {
    console.error("Data Sync GET Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.errorResponse) return auth.errorResponse;
    const { user: currentUser } = auth;
    const isSuperadmin = currentUser.role === 'superadmin';

    const body = await req.json();
    const { action, pipeline, checkScript, tenant = "all", period = "today", startDate, endDate, enabled, schedule } = body;
    
    // BOLA defense: Tenant-confined user can only sync/check their own tenant
    let targetTenant = tenant === "all" ? "all" : tenant;
    if (!isPlatformAdmin(currentUser) && currentUser.tenantCode && currentUser.tenantCode !== 'MASTER') {
      if (tenant !== "all" && tenant.toUpperCase() !== currentUser.tenantCode.toUpperCase()) {
        return NextResponse.json(
          { success: false, error: `Forbidden: You do not have permission to sync or audit Tenant '${tenant}'.` },
          { status: 403 }
        );
      }
      targetTenant = currentUser.tenantCode;
    }

    const dateRange = parsePeriodToDates(period, startDate, endDate);
    const targetTenants = await getTenantsData(targetTenant);

    let mongoClient = null;
    try {
      mongoClient = await getMongoClient();
    } catch (e: any) {
      console.warn("MongoDB connection warning:", e.message);
    }

    // -----------------------------------------------------------
    // NATIVE CHECK VERIFICATION
    // -----------------------------------------------------------
    if (action === "run-check") {
      const redisClient = await getActiveRedisClient();

      if (checkScript === "alerts" || checkScript === "check-alerts") {
        const results = await auditAlertsNative(targetTenants, dateRange, mongoClient);
        return NextResponse.json({
          success: true,
          message: `Native audit verification completed for ALERTS (${targetTenant.toUpperCase()}, ${period.toUpperCase()}).`,
          auditResults: results,
        });
      }

      if (checkScript === "vulnerabilities" || checkScript === "check-vulnerabilities") {
        const results = await auditVulnsNative(targetTenants, dateRange, mongoClient);
        return NextResponse.json({
          success: true,
          message: `Native audit verification completed for VULNERABILITIES (${targetTenant.toUpperCase()}, ${period.toUpperCase()}).`,
          auditResults: results,
        });
      }

      if (checkScript === "redis" || checkScript === "check-redis") {
        const p = period.toLowerCase();
        const redisPeriod = (p === "today" || p === "yesterday") ? p : "this_week";
        const redisDateRange = parsePeriodToDates(redisPeriod);
        const results = await auditRedisNative(targetTenants, redisDateRange.dates, mongoClient, redisClient);
        return NextResponse.json({
          success: true,
          message: `Native audit verification completed for REDIS (${targetTenant.toUpperCase()}, ${redisPeriod.toUpperCase()}).`,
          auditResults: results,
        });
      }

      if (checkScript === "iris" || checkScript === "check-iris") {
        const irisAudit = await auditIrisNative(targetTenants, dateRange, mongoClient);
        return NextResponse.json({
          success: true,
          message: `Native audit verification completed for IRIS (${targetTenant.toUpperCase()}, ${period.toUpperCase()}).`,
          irisAudit,
        });
      }

      return NextResponse.json({ success: false, error: `Unknown verification target: ${checkScript}` }, { status: 400 });
    }

    // -----------------------------------------------------------
    // NATIVE SYNC PIPELINES
    // -----------------------------------------------------------
    if (action === "run-sync") {
      if (!mongoClient) {
        return NextResponse.json({ success: false, error: "MongoDB is not accessible" }, { status: 500 });
      }

      const syncTargets: SyncTarget[] = targetTenants.map(t => ({
        tenantCode: t.tenantCode,
        campusName: t.campusName || t.tenantCode,
        databaseName: t.databaseName,
        redisPrefix: t.redisPrefix,
        wazuhGroups: t.wazuhGroups,
        filterAgentIds: t.filterAgentIds,
        filterAgentNames: t.filterAgentNames,
        irisCustomerId: t.irisCustomerId,
        irisCustomerName: t.irisCustomerName,
      }));

      if (pipeline === "indexer-mongo-alerts" || pipeline === "alerts") {
        const res = await syncAlertsNative(syncTargets, dateRange.dates, mongoClient);
        return NextResponse.json({
          success: true,
          message: `Native Synchronization [ALERTS] completed: ${res.totalIngested} documents ingested for ${targetTenant.toUpperCase()}.`,
          details: res.details,
        });
      }

      if (pipeline === "vulnerabilities") {
        const res = await syncVulnsNative(syncTargets, dateRange.dates, mongoClient);
        return NextResponse.json({
          success: true,
          message: `Native Synchronization [VULNERABILITIES] completed: ${res.totalIngested} documents ingested for ${targetTenant.toUpperCase()}.`,
          details: res.details,
        });
      }

      if (pipeline === "mongo-redis" || pipeline === "redis") {
        const p = period.toLowerCase();
        const redisPeriod = (p === "today" || p === "yesterday") ? p : "this_week";
        const redisDateRange = parsePeriodToDates(redisPeriod);
        const res = await syncRedisNative(syncTargets, redisDateRange.dates, mongoClient);
        return NextResponse.json({
          success: true,
          message: `Native Synchronization [REDIS CACHE] completed for ${targetTenant.toUpperCase()} (${redisPeriod.toUpperCase()}).`,
          details: res.details,
        });
      }

      if (pipeline === "iris-mongo" || pipeline === "iris") {
        const res = await syncIrisNative(syncTargets, dateRange.start, dateRange.end, mongoClient);
        return NextResponse.json({
          success: true,
          message: `Native Synchronization [IRIS REPORTS] completed: ${res.totalIngested} cases synced for ${targetTenant.toUpperCase()}.`,
          details: res.details,
        });
      }

      if (pipeline === "all") {
        const resAlerts = await syncAlertsNative(syncTargets, dateRange.dates, mongoClient);
        const resVulns = await syncVulnsNative(syncTargets, dateRange.dates, mongoClient);
        const resIris = await syncIrisNative(syncTargets, dateRange.start, dateRange.end, mongoClient);
        const resRedis = await syncRedisNative(syncTargets, dateRange.dates, mongoClient);

        return NextResponse.json({
          success: true,
          message: `Native Full Sync completed for ${targetTenant.toUpperCase()} (Alerts: ${resAlerts.totalIngested}, Vulns: ${resVulns.totalIngested}, Iris: ${resIris.totalIngested}).`,
          details: {
            alerts: resAlerts.details,
            vulns: resVulns.details,
            iris: resIris.details,
            redis: resRedis.details,
          },
        });
      }

      return NextResponse.json({ success: false, error: `Unknown sync pipeline: ${pipeline}` }, { status: 400 });
    }

    // -----------------------------------------------------------
    // UPDATE CRON (Tetap gunakan crontab sistem sesuai instruksi user)
    // -----------------------------------------------------------
    if (action === "update-cron") {
      if (!isSuperadmin) {
        return NextResponse.json(
          { success: false, error: "Access denied: Only Superadmin can modify server crontab schedule." },
          { status: 403 }
        );
      }

      const sched = (schedule || "0 * * * *").trim();

      // Strict Cron Regex Validation to eliminate arbitrary shell/command injection
      const CRON_REGEX = /^(@(annually|yearly|monthly|weekly|daily|hourly|reboot))|(@every\s+[0-9]+(m|h|d))|((((\d+,)+\d+|(\d+(\/|-)\d+)|\d+|\*)\s+){4}((\d+,)+\d+|(\d+(\/|-)\d+)|\d+|\*))$/;
      if (!CRON_REGEX.test(sched) || /[;&|`$\n\r<>]/.test(sched)) {
        return NextResponse.json(
          { success: false, error: "Invalid cron expression format. Format must match standard cron schedule (e.g. '0 * * * *')." },
          { status: 400 }
        );
      }

      const isEnabled = Boolean(enabled);
      const pool = getMysqlPool();

      // Update via Host Cron Manager (Agent API)
      const agentRes = await updateHostCron(sched, isEnabled);
      if (!agentRes.success) {
        // Fallback to direct shell crontab if Agent not reachable
        const readCron = await runRemoteScript("sudo crontab -l 2>/dev/null || true", 10000);
        const lines = (readCron.stdout || "")
          .split("\n")
          .filter((l: string) => !l.includes("cron_hourly_sync.sh") && l.trim().length > 0);

        const cronEntry = isEnabled
          ? `${sched} /opt/multi-tenant/scripts/cron_hourly_sync.sh`
          : `# ${sched} /opt/multi-tenant/scripts/cron_hourly_sync.sh`;
        lines.push(cronEntry);

        const newCrontabContent = lines.join("\n") + "\n";
        const writeCron = await runRemoteScript(`echo -e ${JSON.stringify(newCrontabContent)} | sudo crontab -`, 10000);
        if (!writeCron.success) {
          return NextResponse.json({ success: false, error: agentRes.error || writeCron.stderr || "Failed to update system crontab" }, { status: 500 });
        }
      }

      const now = new Date();
      const configObj = {
        enabled: isEnabled,
        schedule: sched,
        lastRunAt: now.toISOString(),
        nextRunAt: computeNextRun(sched),
      };

      await pool.query(
        `INSERT INTO system_settings (key_name, value_data, updated_at) 
         VALUES (?, ?, NOW()) 
         ON DUPLICATE KEY UPDATE value_data = VALUES(value_data), updated_at = NOW()`,
        ["cron_sync_config", JSON.stringify(configObj)]
      );

      return NextResponse.json({
        success: true,
        message: `Crontab updated successfully (${isEnabled ? "Active" : "Disabled"}, ${sched}).`,
        cronConfig: {
          ...configObj,
          status: isEnabled ? "Active" : "Disabled",
          nextRun: configObj.nextRunAt,
        },
      });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("Data Sync POST Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
