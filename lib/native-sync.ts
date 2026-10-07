import { MongoClient } from "mongodb";
import { queryIndexerWithFailover, queryIrisSingle, queryWazuhApiWithFailover } from "./cluster-failover";
import { getActiveRedisClient } from "./redis";

export interface SyncTarget {
  tenantCode: string;
  campusName: string;
  databaseName: string;
  redisPrefix: string;
  wazuhGroups: string[];
  filterAgentIds: string[];
  filterAgentNames: string[];
  irisCustomerId?: number | null;
  irisCustomerName?: string;
}

const REDIS_TTL_SECONDS = 7 * 24 * 3600;

function parseDateIso(tsStr?: string, defaultDate: string = ""): Date {
  if (!tsStr) {
    return new Date(`${defaultDate}T00:00:00.000+07:00`);
  }
  try {
    const d = new Date(tsStr);
    if (!isNaN(d.getTime())) return d;
  } catch {}
  return new Date(`${defaultDate}T00:00:00.000+07:00`);
}

function cleanDoc(doc: any): any {
  if (!doc || typeof doc !== "object") return doc;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k === "_id") {
      out["_id"] = String(v);
      out["id"] = String(v);
    } else if (v instanceof Date) {
      out[k] = v.toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

// -------------------------------------------------------------
// 1. NATIVE SYNC ALERTS (Indexer -> MongoDB)
// -------------------------------------------------------------
export async function syncAlertsNative(
  tenants: SyncTarget[],
  dates: string[],
  mongoClient: MongoClient
): Promise<{ success: boolean; details: any[]; totalIngested: number }> {
  const redis = await getActiveRedisClient();
  let totalIngested = 0;
  const details: any[] = [];

  for (const t of tenants) {
    const agentIds = t.filterAgentIds || [];
    const agentNames = t.filterAgentNames || [];
    const db = mongoClient.db(t.databaseName);
    const coll = db.collection("incident");
    const cleanPrefix = (t.redisPrefix || `${t.databaseName}:`).replace(/:\*$/, "").replace(/:$/, "");

    if (agentIds.length === 0 && agentNames.length === 0) {
      details.push({ tenant: t.tenantCode, status: "skipped", reason: "no_agents" });
      continue;
    }

    let tenantIngested = 0;

    for (const d of dates) {
      await coll.deleteMany({ date: d });
      if (redis) {
        await redis.del(`${cleanPrefix}:incident:${d}`).catch(() => {});
      }

      const shouldMatch: any[] = [];
      if (agentIds.length > 0) shouldMatch.push({ terms: { "agent.id": agentIds } });
      if (agentNames.length > 0) shouldMatch.push({ terms: { "agent.name": agentNames } });

      const queryBool = {
        bool: {
          must: [
            { range: { "rule.level": { gte: 7 } } },
            { range: { timestamp: { gte: `${d}T00:00:00.000+07:00`, lte: `${d}T23:59:59.999+07:00` } } },
            { bool: { should: shouldMatch, minimum_should_match: 1 } },
          ],
        },
      };

      let searchAfter: any = null;
      const batchDocs: any[] = [];

      while (true) {
        const body: any = {
          size: 1000,
          query: queryBool,
          sort: [{ timestamp: { order: "asc" } }, { _id: { order: "asc" } }],
          _source: ["rule", "agent", "data", "full_log", "log", "timestamp", "@timestamp", "syscheck", "location"],
        };
        if (searchAfter) body.search_after = searchAfter;

        const res = await queryIndexerWithFailover<any>("/wazuh-alerts-*/_search", body, "POST", 30000);
        const hits = res?.hits?.hits || [];
        if (hits.length === 0) break;

        for (const h of hits) {
          const src = h._source || {};
          const rule = src.rule || {};
          const agent = src.agent || {};
          const data = src.data || {};

          const rk = String(rule.id || "");
          const ak = String(agent.id || "");
          const severity = rule.level ?? 7;
          const description = rule.description || "";
          const host = agent.name || "";
          const agentIp = agent.ip || "";
          const fullLog = src.full_log || src.log || "";
          const firstDt = parseDateIso(src.timestamp || src["@timestamp"], d);

          let incidentType = rule.groups || [];
          if (!Array.isArray(incidentType)) incidentType = incidentType ? [incidentType] : [];

          const mitre = rule.mitre || {};
          const mitreId = Array.isArray(mitre.id) ? mitre.id : mitre.id ? [mitre.id] : [];
          const mitreTactic = Array.isArray(mitre.tactic) ? mitre.tactic : mitre.tactic ? [mitre.tactic] : [];
          const mitreTechnique = Array.isArray(mitre.technique) ? mitre.technique : mitre.technique ? [mitre.technique] : [];

          const doc = {
            date: d,
            first_observed: firstDt,
            severity,
            rule_id: rk,
            description,
            host,
            agent_id: ak,
            agent_ip: agentIp,
            incident_type: incidentType,
            ip_source: data.srcip || "",
            ip_destination: data.dstip || "",
            mitre_id: mitreId,
            mitre_tactic: mitreTactic,
            mitre_technique: mitreTechnique,
            affected_file: src.syscheck?.path || src.location || "",
            full_logs: fullLog ? [fullLog] : [],
          };

          batchDocs.push(doc);
          tenantIngested++;
        }

        if (batchDocs.length >= 1000) {
          await coll.insertMany(batchDocs, { ordered: false });
          batchDocs.length = 0;
        }

        searchAfter = hits[hits.length - 1].sort;
        if (hits.length < 1000 || !searchAfter) break;
      }

      if (batchDocs.length > 0) {
        await coll.insertMany(batchDocs, { ordered: false });
      }
    }

    totalIngested += tenantIngested;
    details.push({ tenant: t.tenantCode, status: "success", ingested: tenantIngested });
  }

  return { success: true, details, totalIngested };
}

// -------------------------------------------------------------
// 2. NATIVE SYNC VULNERABILITIES (Indexer -> MongoDB)
// -------------------------------------------------------------
export async function syncVulnsNative(
  tenants: SyncTarget[],
  dates: string[],
  mongoClient: MongoClient
): Promise<{ success: boolean; details: any[]; totalIngested: number }> {
  let totalIngested = 0;
  const details: any[] = [];
  const allowedSeverities = ["Medium", "High", "Critical", "medium", "high", "critical"];

  for (const t of tenants) {
    const agentIds = t.filterAgentIds || [];
    const agentNames = t.filterAgentNames || [];
    const db = mongoClient.db(t.databaseName);
    const coll = db.collection("vulnerability");

    if (agentIds.length === 0 && agentNames.length === 0) {
      details.push({ tenant: t.tenantCode, status: "skipped", reason: "no_agents" });
      continue;
    }

    let tenantIngested = 0;

    for (const d of dates) {
      await coll.deleteMany({ date: d });

      const shouldMatchAgents: any[] = [];
      if (agentIds.length > 0) shouldMatchAgents.push({ terms: { "agent.id": agentIds } });
      if (agentNames.length > 0) shouldMatchAgents.push({ terms: { "agent.name": agentNames } });

      const queryBool = {
        bool: {
          must: [
            { range: { timestamp: { gte: `${d}T00:00:00.000+07:00`, lte: `${d}T23:59:59.999+07:00` } } },
            {
              bool: {
                should: [
                  { term: { "rule.groups": "vulnerability-detector" } },
                  { exists: { field: "data.vulnerability.cve" } },
                ],
                minimum_should_match: 1,
              },
            },
            {
              bool: {
                should: [
                  { terms: { "data.vulnerability.severity": allowedSeverities } },
                  { terms: { "vulnerability.severity": allowedSeverities } },
                ],
                minimum_should_match: 1,
              },
            },
            {
              bool: {
                should: shouldMatchAgents,
                minimum_should_match: 1,
              },
            },
          ],
        },
      };

      let searchAfter: any = null;
      const batchDocs: any[] = [];

      while (true) {
        const body: any = {
          size: 1000,
          query: queryBool,
          sort: [{ timestamp: { order: "asc" } }, { _id: { order: "asc" } }],
          _source: ["data.vulnerability", "vulnerability", "agent", "timestamp", "@timestamp"],
        };
        if (searchAfter) body.search_after = searchAfter;

        const res = await queryIndexerWithFailover<any>("/wazuh-alerts-*/_search", body, "POST", 30000);
        const hits = res?.hits?.hits || [];
        if (hits.length === 0) break;

        for (const h of hits) {
          const src = h._source || {};
          const vulnInfo = src.data?.vulnerability || src.vulnerability || {};
          const agentObj = src.agent || {};

          const cve = vulnInfo.cve;
          if (!cve) continue;

          const vPkg = vulnInfo.package || {};
          const pkgName = (typeof vPkg === "object" ? vPkg.name : "") || vulnInfo.title || "";
          const pkgVer = typeof vPkg === "object" ? vPkg.version || "" : "";
          const seenDt = parseDateIso(src.timestamp || src["@timestamp"], d);

          const statusVal = vulnInfo.status || "Active";
          const rawSev = vulnInfo.severity || "";
          const sevVal = rawSev ? rawSev.charAt(0).toUpperCase() + rawSev.slice(1).toLowerCase() : "";

          const doc = {
            date: d,
            cve,
            vulnerability: pkgName,
            severity: sevVal,
            status: statusVal,
            agent_id: String(agentObj.id || ""),
            description: vulnInfo.rationale || vulnInfo.title || "",
            version: pkgVer,
            agent: agentObj.name || "",
            ip: agentObj.ip || "",
            detected_at: seenDt,
          };

          batchDocs.push(doc);
          tenantIngested++;
        }

        if (batchDocs.length >= 1000) {
          await coll.insertMany(batchDocs, { ordered: false });
          batchDocs.length = 0;
        }

        searchAfter = hits[hits.length - 1].sort;
        if (hits.length < 1000 || !searchAfter) break;
      }

      if (batchDocs.length > 0) {
        await coll.insertMany(batchDocs, { ordered: false });
      }
    }

    totalIngested += tenantIngested;
    details.push({ tenant: t.tenantCode, status: "success", ingested: tenantIngested });
  }

  return { success: true, details, totalIngested };
}

// -------------------------------------------------------------
// 3. NATIVE SYNC REDIS CACHE (MongoDB -> Redis)
// -------------------------------------------------------------
export async function syncRedisNative(
  tenants: SyncTarget[],
  dates: string[],
  mongoClient: MongoClient
): Promise<{ success: boolean; details: any[] }> {
  const redis = await getActiveRedisClient();
  if (!redis) {
    throw new Error("Redis client unreachable for native sync");
  }

  const details: any[] = [];
  const nowUtc = new Date();
  const todayUtcStr = nowUtc.toISOString().slice(0, 10);
  const dayOfWeek = nowUtc.getUTCDay() || 7;
  const mondayUtc = new Date(nowUtc);
  mondayUtc.setUTCDate(mondayUtc.getUTCDate() - (dayOfWeek - 1));
  const mondayStr = mondayUtc.toISOString().slice(0, 10);
  const mondayDt = new Date(`${mondayStr}T00:00:00.000Z`);

  for (const t of tenants) {
    const db = mongoClient.db(t.databaseName);
    const cleanPrefix = (t.redisPrefix || `${t.databaseName}:`).replace(/:\*$/, "").replace(/:$/, "");
    const prefix = cleanPrefix.replace(/:$/, "");

    // 1. Clear old incident keys for target dates
    for (const d of dates) {
      await redis.del(`${cleanPrefix}:incident:${d}`).catch(() => {});
    }

    // 2. Stream incidents to Redis
    const incDocs = await db.collection("incident").find({ date: { $in: dates } }).toArray();
    if (incDocs.length > 0) {
      const pipeline = redis.pipeline();
      const byDate: Record<string, any[]> = {};
      for (const doc of incDocs) {
        if (!byDate[doc.date]) byDate[doc.date] = [];
        byDate[doc.date].push(doc);
      }

      for (const [dateStr, docs] of Object.entries(byDate)) {
        const rkey = `${cleanPrefix}:incident:${dateStr}`;
        const mapObj: Record<string, string> = {};
        for (const doc of docs) {
          const field = String(doc._id || `${doc.rule_id}:${doc.agent_id}`);
          mapObj[field] = JSON.stringify(cleanDoc(doc));
        }
        if (Object.keys(mapObj).length > 0) {
          pipeline.hmset(rkey, mapObj);
          pipeline.expire(rkey, REDIS_TTL_SECONDS);
        }
      }
      await pipeline.exec();
    }

    // 3. Clear and sync vulnerabilities
    const isWeeklySync = dates.length > 1 && dates[0] <= mondayStr;
    const targetDatesSet = new Set(dates);
    const startStr = dates[0] || todayUtcStr;
    const endStr = dates[dates.length - 1] || todayUtcStr;
    const startDt = new Date(`${startStr}T00:00:00.000Z`);
    const endDt = new Date(`${endStr}T23:59:59.999Z`);

    if (isWeeklySync) {
      const oldVulnKeys = await redis.keys(`${cleanPrefix}:vulnerability:*`).catch(() => []);
      if (oldVulnKeys.length > 0) {
        await redis.del(...oldVulnKeys).catch(() => {});
      }
    } else {
      const existingVulnKeys = await redis.keys(`${cleanPrefix}:vulnerability:*`).catch(() => []);
      for (const vk of existingVulnKeys) {
        const hvals = await redis.hgetall(vk).catch(() => ({}));
        const toDel: string[] = [];
        for (const [fId, raw] of Object.entries(hvals)) {
          try {
            const dDoc = JSON.parse(raw as string);
            const dStr = dDoc.date || (dDoc.detected_at ? String(dDoc.detected_at).slice(0, 10) : null);
            if (dStr && targetDatesSet.has(dStr)) {
              toDel.push(fId);
            }
          } catch {}
        }
        if (toDel.length > 0) {
          await redis.hdel(vk, ...toDel).catch(() => {});
        }
      }
    }

    const vulnQuery = isWeeklySync
      ? {
          $or: [
            { date: { $gte: mondayStr } },
            { detected_at: { $gte: mondayDt } },
            { detected_at: { $gte: mondayStr } },
            { last_seen: { $gte: mondayStr } },
          ],
        }
      : {
          $or: [
            { date: { $in: dates } },
            { detected_at: { $gte: startDt, $lte: endDt } },
            { detected_at: { $gte: startStr, $lte: `${endStr}T23:59:59.999Z` } },
            { last_seen: { $gte: startStr, $lte: `${endStr}T23:59:59.999Z` } },
          ],
        };

    const vulnDocs = await db.collection("vulnerability").find(vulnQuery).toArray();
    if (vulnDocs.length > 0) {
      const pipeline = redis.pipeline();
      const byCve: Record<string, Record<string, string>> = {};
      for (const v of vulnDocs) {
        const cve = v.cve || "unknown";
        const rkey = `${cleanPrefix}:vulnerability:${cve}`;
        if (!byCve[rkey]) byCve[rkey] = {};
        const field = `${v.agent_id || "unknown"}:${v.vulnerability || "pkg"}:${v.status || "status"}`;
        byCve[rkey][field] = JSON.stringify(cleanDoc(v));
      }
      for (const [rkey, fields] of Object.entries(byCve)) {
        pipeline.hmset(rkey, fields);
        pipeline.expire(rkey, REDIS_TTL_SECONDS);
      }
      await pipeline.exec();
    }

    // 4. Sync devices
    const devDocs = await db.collection("devices").find({}).toArray();
    const cleanDevs = devDocs.map(cleanDoc);
    await redis.set(`${prefix}:devices`, JSON.stringify(cleanDevs), "EX", REDIS_TTL_SECONDS);

    const devSum = await db.collection("device_summary").findOne({});
    if (devSum) {
      await redis.set(`${prefix}:devices:summary`, JSON.stringify(cleanDoc(devSum)), "EX", REDIS_TTL_SECONDS);
    }

    // 5. Sync reports
    const repQuery = isWeeklySync
      ? {
          $or: [
            { created_at: { $gte: mondayDt } },
            { date_generated: { $gte: mondayDt } },
            { date_generated: { $gte: mondayStr } },
            { date: { $gte: mondayStr } },
          ],
        }
      : {
          $or: [
            { created_at: { $gte: startDt, $lte: endDt } },
            { date_generated: { $gte: startDt, $lte: endDt } },
            { date_generated: { $gte: startStr, $lte: `${endStr}T23:59:59.999Z` } },
            { date: { $in: dates } },
          ],
        };

    const repDocs = await db.collection("reports").find(repQuery).toArray();
    const cleanReps = repDocs.map(cleanDoc);
    let finalReps = cleanReps;
    if (!isWeeklySync) {
      const repRaw = await redis.get(`${prefix}:reports`).catch(() => null);
      let existingReps: any[] = [];
      if (repRaw) {
        try {
          const parsed = JSON.parse(repRaw);
          if (Array.isArray(parsed)) {
            existingReps = parsed.filter((rp: any) => {
              const rpD = (rp.date_generated || rp.created_at || rp.date || "").slice(0, 10);
              return !targetDatesSet.has(rpD);
            });
          }
        } catch {}
      }
      finalReps = [...existingReps, ...cleanReps];
    }
    await redis.set(`${prefix}:reports`, JSON.stringify(finalReps), "EX", REDIS_TTL_SECONDS);
    await redis.set(`${prefix}:reports:list`, JSON.stringify(finalReps), "EX", REDIS_TTL_SECONDS);

    // 6. Sync weekly historical statistics
    const cutoff14d = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const histDocs = await db.collection("historical_statistics").find({ date: { $gte: cutoff14d } }).sort({ date: 1 }).toArray();

    const thisWeekDocs = histDocs.filter(d => (d.date || "") >= mondayStr);
    const critW = thisWeekDocs.reduce((acc, d) => acc + (d.critical || 0), 0);
    const highW = thisWeekDocs.reduce((acc, d) => acc + (d.high || 0), 0);
    const medW = thisWeekDocs.reduce((acc, d) => acc + (d.medium || 0), 0);
    const lowW = thisWeekDocs.reduce((acc, d) => acc + (d.low || 0), 0);
    const totW = thisWeekDocs.reduce((acc, d) => acc + (d.totalSeverity || (d.critical || 0) + (d.high || 0) + (d.medium || 0) + (d.low || 0)), 0);
    const avgRisk = thisWeekDocs.length > 0 ? Number((thisWeekDocs.reduce((acc, d) => acc + (d.riskScore || 0), 0) / thisWeekDocs.length).toFixed(1)) : 0;

    const weeklySummary = {
      tenant_code: t.tenantCode,
      campus_name: t.campusName,
      database_name: t.databaseName,
      week_start: mondayStr,
      week_end: todayUtcStr,
      critical: critW,
      high: highW,
      medium: medW,
      low: lowW,
      total: totW,
      risk_score: avgRisk,
      daily: thisWeekDocs.map(cleanDoc),
      updated_at: nowUtc.toISOString(),
    };
    await redis.set(`${cleanPrefix}:historical_statistics:weekly`, JSON.stringify(weeklySummary), "EX", REDIS_TTL_SECONDS);

    details.push({
      tenant: t.tenantCode,
      incidents: incDocs.length,
      vulns: vulnDocs.length,
      devices: devDocs.length,
      reports: repDocs.length,
    });
  }

  return { success: true, details };
}

const RE_REC_HEADING = /^[ \t]*(?:#{1,6}\s*(?:\*{1,2})?|\*{2}\s*)(?:[0-9]+[.)\\]*\s*)?[^\n]*(?:rekomendasi|recommended\s*action).*$/im;
const RE_NEXT_HEADING = /\n[ \t]*(?:#{1,6}\s+|(?:\*{1,2})?\s*[0-9]+[.)\\]*\s*(?:\*{1,2})?[A-Z]{2,}|\*{1,2}[0-9.]*\s*[A-Z\s0-9]{2,}\*{1,2}|—\s*end of document)/m;
const RE_TABLE_SEP = /^\|(?:\s*:?-+:?\s*\|)+$/;
const RE_ROW_2COL = /^\|\s*(\d+)[.)]?\s*\|\s*(.*)\|\s*$/;
const RE_ROW_3COL = /^\|\s*(\d+)[.)]?\s*\|\s*([^|]+)\s*\|\s*(.*)\|\s*$/;

export function extractRecommendedAction(description?: string): string | null {
  if (!description) return null;
  const m = RE_REC_HEADING.exec(description);
  if (!m) return null;

  const rest = description.slice(m.index + m[0].length);
  const nextM = RE_NEXT_HEADING.exec(rest);
  const section = (nextM ? rest.slice(0, nextM.index) : rest).trim();
  if (!section) return null;

  const lines = section.split('\n').map((l) => l.trim()).filter(Boolean);
  const tableLines = lines.filter((l) => l.startsWith('|') && l.endsWith('|'));

  if (tableLines.length >= 2) {
    const hLine = tableLines[0].toLowerCase();
    const hasTeam = hLine.includes('tim') || hLine.includes('team');
    const items: string[] = [];

    for (const l of tableLines.slice(1)) {
      if (RE_TABLE_SEP.test(l)) continue;
      if (hasTeam) {
        const rowM = RE_ROW_3COL.exec(l);
        if (rowM) {
          const num = rowM[1].trim();
          const team = rowM[2].trim();
          const action = rowM[3].trim();
          if (team && action) items.push(`${num}. ${team} - ${action}`);
          else if (action) items.push(`${num}. ${action}`);
          else if (team) items.push(`${num}. ${team}`);
        } else {
          const rowM2 = RE_ROW_2COL.exec(l);
          if (rowM2) {
            items.push(`${rowM2[1].trim()}. ${rowM2[2].trim()}`);
          }
        }
      } else {
        const rowM = RE_ROW_2COL.exec(l);
        if (rowM) {
          items.push(`${rowM[1].trim()}. ${rowM[2].trim()}`);
        }
      }
    }

    if (items.length > 0) {
      return items.join('\n');
    }
  }

  return section;
}

// -------------------------------------------------------------
// 4. NATIVE SYNC IRIS REPORTS (IRIS HTTP -> MongoDB)
// -------------------------------------------------------------
export async function syncIrisNative(
  tenants: SyncTarget[],
  startDate: string,
  endDate: string,
  mongoClient: MongoClient
): Promise<{ success: boolean; details: any[]; totalIngested: number }> {
  const res = await queryIrisSingle("/manage/cases/filter", {
    start_open_date: startDate,
    end_open_date: endDate,
    per_page: 200,
    order_by: "case_id",
    sort_dir: "asc",
  });

  const allCases = res?.data?.cases || [];
  let totalIngested = 0;
  const details: any[] = [];
  const nowIso = new Date().toISOString();

  for (const t of tenants) {
    const db = mongoClient.db(t.databaseName);
    const coll = db.collection("reports");

    const matched = allCases.filter((c: any) => {
      const clientObj = c.client || {};
      const cid = clientObj.customer_id;
      if (t.irisCustomerId && cid && Number(cid) === Number(t.irisCustomerId)) return true;

      const cname = (clientObj.customer_name || clientObj.name || "").trim().toLowerCase();
      if (t.irisCustomerName && t.irisCustomerName !== "-" && cname === t.irisCustomerName.trim().toLowerCase()) return true;
      if (t.campusName && cname === t.campusName.trim().toLowerCase()) return true;
      if (t.tenantCode && cname.includes(t.tenantCode.toLowerCase())) return true;
      return false;
    });

    for (const c of matched) {
      const caseId = c.case_id;
      const rawName = c.name || "Untitled Case";
      const reportName = rawName.replace(/^#\d+\s*[-:]*\s*/, "");
      const sev = c.severity?.severity_name || c.severity || "Medium";
      const dtGen = c.open_date ? new Date(c.open_date) : new Date(`${startDate}T00:00:00.000Z`);

      const doc = {
        report_id: caseId,
        report_uuid: String(c.case_uuid || ""),
        soc_id: String(c.soc_id || ""),
        report_name: reportName,
        customer_name: c.client?.customer_name || t.campusName || "-",
        severity: sev,
        date_generated: dtGen,
        summary: c.description || "",
        recommended_action: extractRecommendedAction(c.description || ""),
        synced_at: nowIso,
      };

      await coll.replaceOne({ report_id: caseId }, doc, { upsert: true });
    }

    totalIngested += matched.length;
    details.push({ tenant: t.tenantCode, casesCount: matched.length });
  }

  return { success: true, details, totalIngested };
}

// -------------------------------------------------------------
// 5. NATIVE SYNC WAZUH AGENTS (Wazuh API -> MongoDB & Redis)
// -------------------------------------------------------------
export async function syncAgentsNative(
  tenants: SyncTarget[],
  mongoClient: MongoClient
): Promise<{ success: boolean; details: any[]; totalAgents: number }> {
  const res = await queryWazuhApiWithFailover<any>("/agents?limit=500", "GET");
  const allAgents = res?.data?.affected_items || [];
  const redis = await getActiveRedisClient();

  let totalAgents = 0;
  const details: any[] = [];

  for (const t of tenants) {
    const db = mongoClient.db(t.databaseName);
    const cleanPrefix = (t.redisPrefix || `${t.databaseName}:`).replace(/:\*$/, "").replace(/:$/, "");
    const prefix = cleanPrefix.replace(/:$/, "");
    const tGroups = (t.wazuhGroups || []).map(g => g.toLowerCase().trim());

    const matchedAgents = allAgents.filter((ag: any) => {
      const grps = Array.isArray(ag.group) ? ag.group : ag.group ? [ag.group] : [];
      return grps.some((g: string) => tGroups.includes(String(g).toLowerCase().trim()));
    });

    const devDocs = matchedAgents.map((ag: any) => {
      const rawStatus = String(ag.status || "").toLowerCase();
      const status = rawStatus === "active" || rawStatus === "online" ? "online" : "disconnected";

      return {
        id: String(ag.id || ""),
        name: ag.name || `agent-${ag.id}`,
        ip: ag.ip || "-",
        status,
        version: ag.version || "Wazuh v4.14.3",
        os: ag.os || { name: "Linux", platform: "linux", version: "" },
        group: ag.group || tGroups,
        last_keepalive: ag.lastKeepAlive || ag.last_keepalive || "-",
      };
    });

    const collDev = db.collection("devices");
    await collDev.deleteMany({});
    if (devDocs.length > 0) {
      await collDev.insertMany(devDocs);
    }

    const activeCnt = devDocs.filter((d: any) => d.status === "online").length;
    const summaryDoc = {
      total: devDocs.length,
      active: activeCnt,
      disconnected: devDocs.length - activeCnt,
      updated_at: new Date().toISOString(),
    };
    await db.collection("device_summary").replaceOne({}, summaryDoc, { upsert: true });

    if (redis) {
      const cleanDevs = devDocs.map(cleanDoc);
      await redis.set(`${prefix}:devices`, JSON.stringify(cleanDevs), "EX", REDIS_TTL_SECONDS);
      await redis.set(`${prefix}:devices:summary`, JSON.stringify(summaryDoc), "EX", REDIS_TTL_SECONDS);
    }

    totalAgents += devDocs.length;
    details.push({ tenant: t.tenantCode, totalAgents: devDocs.length, active: activeCnt });
  }

  return { success: true, details, totalAgents };
}
