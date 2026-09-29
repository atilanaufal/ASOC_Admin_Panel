import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getMysqlPool } from "@/lib/mysql";
import { getMongoClient } from "@/lib/mongodb";
import { getActiveRedisClient } from "@/lib/redis";
import { runRemoteScript } from "@/lib/remote";
import {
  auditAlertsNative,
  auditVulnsNative,
  auditRedisNative,
  auditIrisNative,
  type TenantMeta,
  type DateRange,
} from "@/lib/native-audit";

function getDatesList(startStr: string, endStr: string): string[] {
  const dates: string[] = [];
  const curr = new Date(startStr);
  const stop = new Date(endStr);
  while (curr <= stop) {
    dates.push(curr.toISOString().slice(0, 10));
    curr.setDate(curr.getDate() + 1);
  }
  return dates.length > 0 ? dates : [startStr];
}

function getDateRangeForPeriod(
  period: string,
  customStart?: string | null,
  customEnd?: string | null
): DateRange {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const p = (period || "today").toLowerCase();

  if (p === "custom") {
    const s = customStart || todayStr;
    const e = customEnd || todayStr;
    return { start: s, end: e, dates: getDatesList(s, e) };
  }

  if (p === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yStr = y.toISOString().slice(0, 10);
    return { start: yStr, end: yStr, dates: [yStr] };
  }

  if (p === "this_week") {
    const dayOfWeek = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(monday.getDate() - (dayOfWeek - 1));
    const mStr = monday.toISOString().slice(0, 10);
    return { start: mStr, end: todayStr, dates: getDatesList(mStr, todayStr) };
  }

  if (p === "last_week" || p === "last_7_days") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    const dStr = d.toISOString().slice(0, 10);
    return { start: dStr, end: todayStr, dates: getDatesList(dStr, todayStr) };
  }

  if (p === "this_month") {
    const fStr = `${todayStr.slice(0, 7)}-01`;
    return { start: fStr, end: todayStr, dates: getDatesList(fStr, todayStr) };
  }

  if (p === "last_month" || p === "last_30_days") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    const dStr = d.toISOString().slice(0, 10);
    return { start: dStr, end: todayStr, dates: getDatesList(dStr, todayStr) };
  }

  return { start: todayStr, end: todayStr, dates: [todayStr] };
}

function computeNextRun(schedule: string): string {
  const now = new Date();
  switch (schedule) {
    case "*/1 * * * *":
      return new Date(now.getTime() + 60 * 1000).toISOString();
    case "*/5 * * * *":
      return new Date(now.getTime() + 5 * 60 * 1000).toISOString();
    case "*/15 * * * *":
      return new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    case "0 0 * * *": {
      const tomorrow = new Date(now);
      tomorrow.setHours(24, 0, 0, 0);
      return tomorrow.toISOString();
    }
    case "0 * * * *":
    default:
      return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tab = (searchParams.get("tab") || "alerts").toLowerCase();
    const period = searchParams.get("period") || "today";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const tenantParam = searchParams.get("tenant") || "all";

    const dateRange = getDateRangeForPeriod(period, startDate, endDate);

    // 1. Fetch tenants from MySQL
    const pool = getMysqlPool();
    const [tRows] = await pool.query<any[]>(`
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
      LEFT JOIN tenant_wazuh_groups wg ON t.id = wg.tenant_id
      LEFT JOIN tenant_iris_customers ic ON t.id = ic.tenant_id
      WHERE t.is_active = 1
      ORDER BY t.tenant_code ASC
    `);

    // 2. Fetch tenant agents
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

    const tenantMap = new Map<string, TenantMeta>();
    for (const r of tRows) {
      if (!tenantMap.has(r.tenant_code)) {
        const ag = agentsByTenant[r.id] || { ids: [], names: [] };
        tenantMap.set(r.tenant_code, {
          id: r.id,
          tenantCode: r.tenant_code,
          tenantName: r.campus_name || r.tenant_code,
          campusName: r.campus_name,
          databaseName: r.database_name,
          redisPrefix: r.redis_prefix || `${r.database_name}:`,
          wazuhGroups: [],
          filterAgentIds: ag.ids,
          filterAgentNames: ag.names,
          irisCustomerId: r.iris_customer_id || null,
          irisCustomerName: r.iris_customer_name || "-",
          totalMongoIncidents: 0,
          totalIndexerIncidents: 0,
          totalMongoVulns: 0,
          totalIndexerVulns: 0,
          totalMongoReports: 0,
          redisKeysCount: 0,
          redisSummaryPresent: false,
          dateBreakdown: [],
          dateBreakdownAlerts: [],
          dateBreakdownVulns: [],
        });
      }
      if (r.wazuh_group_name && !tenantMap.get(r.tenant_code)!.wazuhGroups.includes(r.wazuh_group_name)) {
        tenantMap.get(r.tenant_code)!.wazuhGroups.push(r.wazuh_group_name);
      }
    }

    let tenantsList = Array.from(tenantMap.values());
    const allTenantsList = tenantsList.map((t) => ({
      id: t.id,
      tenantCode: t.tenantCode,
      tenantName: t.tenantName,
      campusName: t.campusName,
    }));

    let mongoClient = null;
    let redisClient = null;
    try {
      mongoClient = await getMongoClient();
    } catch {}
    try {
      redisClient = await getActiveRedisClient();
    } catch {}

    let irisAudit: any = null;
    let cronConfig: any = null;

    // Fast native audits
    if (tab === "alerts" || tab === "all") {
      tenantsList = await auditAlertsNative(tenantsList, dateRange, mongoClient);
    }

    if (tab === "vulnerabilities") {
      tenantsList = await auditVulnsNative(tenantsList, dateRange, mongoClient);
    }

    if (tab === "redis") {
      tenantsList = await auditRedisNative(tenantsList, dateRange.dates, mongoClient, redisClient);
    }

    if (tab === "iris") {
      irisAudit = await auditIrisNative(tenantsList, dateRange, mongoClient);
    }

    if (tab === "cronjob" || tab === "all") {
      try {
        const [cronRows] = await pool.query<any[]>(
          "SELECT value_data FROM system_settings WHERE key_name = ?",
          ["cron_sync_config"]
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

        const crontabRes = await runRemoteScript("sudo crontab -l", 5000);
        let status = "Inactive";
        if (crontabRes.success && crontabRes.stdout) {
          const hasCron = crontabRes.stdout.split("\n").some((l: string) =>
            !l.trim().startsWith("#") && l.includes("cron_hourly_sync.sh")
          );
          status = hasCron ? "Active" : "Disabled";
          if (!hasCron) enabled = false;
        }

        cronConfig = {
          enabled,
          schedule,
          status,
          nextRun: nextRunAt,
          lastRun: lastRunAt,
        };
      } catch (err) {
        console.error("Failed to load cron config:", err);
      }
    }

    let cronLogs = "";
    if (tab === "cronjob") {
      const logRes = await runRemoteScript('tail -n 60 /var/log/multi-tenant-sync.log 2>/dev/null || echo "No log found"', 5000);
      if (logRes.success) {
        cronLogs = logRes.stdout;
      }
    }

    return NextResponse.json({
      success: true,
      tab,
      period,
      allTenants: allTenantsList,
      auditResults: tenantsList,
      irisAudit,
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
    const body = await req.json();
    const { action, pipeline, checkScript, tenant = "all", period = "today", startDate, endDate, enabled, schedule } = body;
    const targetTenant = tenant === "all" ? "all" : tenant;

    function toScriptPeriod(p: string, s?: string, e?: string, isRedis = false): string {
      const low = (p || "today").toLowerCase();
      if (low === "custom" && s && e) return `${s}..${e}`;
      if (low === "last_7_days") return "last_week";
      if (low === "last_30_days" || low === "last_month") return isRedis ? "last_week" : "last_month";
      if (low === "this_month" && isRedis) return "this_week";
      return low;
    }

    const scriptPeriod = toScriptPeriod(period, startDate, endDate);

    if (action === "run-check") {
      let cmd = "";
      if (checkScript === "alerts" || checkScript === "check-alerts") {
        cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/check_alerts_indexer_mongo.py --tenant ${targetTenant} --mode ${scriptPeriod} --json`;
      } else if (checkScript === "vulnerabilities" || checkScript === "check-vulnerabilities") {
        cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/check_vulnerability_indexer_mongo.py --tenant ${targetTenant} --mode ${scriptPeriod} --json`;
      } else if (checkScript === "redis" || checkScript === "check-redis") {
        cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/check_mongo_redis_multitenant_sync.py --tenant ${targetTenant} --period ${toScriptPeriod(period, startDate, endDate, true)} --json`;
      } else if (checkScript === "iris" || checkScript === "check-iris") {
        cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/check_iris_reports.py --tenant ${targetTenant} --period ${scriptPeriod} --json`;
      } else {
        return NextResponse.json({ success: false, error: `Unknown check script: ${checkScript}` }, { status: 400 });
      }

      const res = await runRemoteScript(cmd, 120000);
      if (!res.success) {
        return NextResponse.json({ success: false, error: res.stderr || "Verification script failed" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Audit verification executed successfully for ${targetTenant.toUpperCase()} (${period.toUpperCase()}).`,
        stdout: res.stdout,
      });
    }

    if (action === "run-sync") {
      let cmd = "";
      if (pipeline === "indexer-mongo-alerts" || pipeline === "alerts") {
        cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/sync_alerts_indexer_mongo.py --tenant ${targetTenant} --period ${scriptPeriod}`;
      } else if (pipeline === "vulnerabilities") {
        cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/sync_vulnerability_indexer_mongo.py --tenant ${targetTenant} --period ${scriptPeriod}`;
      } else if (pipeline === "mongo-redis" || pipeline === "redis") {
        cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/sync_mongo_redis_multitenant.py --tenant ${targetTenant} --period ${toScriptPeriod(period, startDate, endDate, true)}`;
      } else if (pipeline === "iris-mongo" || pipeline === "iris") {
        cmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/sync_iris_reports.py --tenant ${targetTenant} --period ${scriptPeriod} --force`;
      } else if (pipeline === "all") {
        cmd = `sudo /opt/multi-tenant/scripts/cron_hourly_sync.sh ${scriptPeriod} ${targetTenant}`;
      } else {
        return NextResponse.json({ success: false, error: `Unknown sync pipeline: ${pipeline}` }, { status: 400 });
      }

      const res = await runRemoteScript(cmd, 180000);
      if (!res.success) {
        return NextResponse.json({ success: false, error: res.stderr || "Sync execution failed" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Synchronization pipeline [${pipeline}] completed successfully for ${targetTenant.toUpperCase()}.`,
        stdout: res.stdout,
      });
    }

    if (action === "update-cron") {
      const sched = schedule || "0 * * * *";
      const isEnabled = Boolean(enabled);
      const pool = getMysqlPool();

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
        return NextResponse.json({ success: false, error: writeCron.stderr || "Failed to update system crontab" }, { status: 500 });
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
