import type { MongoClient, Db } from "mongodb";
import { queryIndexerWithFailover, queryIrisSingle } from "./cluster-failover";

export interface DateRange {
  start?: string;
  end?: string;
  dates: string[];
}

export interface TenantMeta {
  id: number;
  tenantCode: string;
  tenantName: string;
  campusName?: string;
  databaseName: string;
  redisPrefix: string;
  wazuhGroups: string[];
  filterAgentIds: string[];
  filterAgentNames: string[];
  irisCustomerId: number | null;
  irisCustomerName: string;
  totalMongoIncidents: number;
  totalIndexerIncidents: number;
  totalMongoVulns: number;
  totalIndexerVulns: number;
  totalMongoReports: number;
  redisKeysCount: number;
  redisSummaryPresent: boolean;
  redisAudit?: any;
  dateBreakdown: any[];
  dateBreakdownAlerts?: any[];
  dateBreakdownVulns?: any[];
}

// ==========================================
// 1. ALERTS NATIVE AUDIT
// ==========================================
export async function auditAlertsNative(
  tenants: TenantMeta[],
  dateRange: DateRange,
  mongoClient: MongoClient | null
): Promise<TenantMeta[]> {
  const startDate = dateRange.start || new Date().toISOString().slice(0, 10);
  const endDate = dateRange.end || startDate;
  const targetDates = dateRange.dates || [startDate];

  return Promise.all(
    tenants.map(async (t) => {
      const agentIds = t.filterAgentIds || [];
      const agentNames = t.filterAgentNames || [];
      const dbName = t.databaseName;

      let osDateMap: Record<string, number> = {};
      let mgDateMap: Record<string, number> = {};

      const tasks: Promise<any>[] = [];

      if (agentIds.length > 0 || agentNames.length > 0) {
        const shouldTerms: any[] = [];
        if (agentIds.length > 0) shouldTerms.push({ terms: { "agent.id": agentIds } });
        if (agentNames.length > 0) shouldTerms.push({ terms: { "agent.name": agentNames } });

        const q = {
          size: 0,
          query: {
            bool: {
              must: [
                { range: { "rule.level": { gte: 7 } } },
                { range: { timestamp: { gte: `${startDate}T00:00:00.000+07:00`, lte: `${endDate}T23:59:59.999+07:00` } } },
                { bool: { should: shouldTerms, minimum_should_match: 1 } },
              ],
            },
          },
          aggs: {
            by_date: {
              date_histogram: {
                field: "timestamp",
                calendar_interval: "day",
                time_zone: "+07:00",
                format: "yyyy-MM-dd",
              },
            },
          },
        };

        tasks.push(
          queryIndexerWithFailover("/wazuh-alerts-*/_search", q, "POST", 15000)
            .then((res) => {
              const buckets = res?.aggregations?.by_date?.buckets || [];
              for (const b of buckets) {
                osDateMap[b.key_as_string] = b.doc_count || 0;
              }
            })
            .catch(() => {})
        );
      }

      if (mongoClient && dbName) {
        tasks.push(
          (async () => {
            try {
              const db = mongoClient.db(dbName);
              const agg = await db.collection("incident").aggregate([
                { $match: { date: { $gte: startDate, $lte: endDate } } },
                { $group: { _id: "$date", count: { $sum: 1 } } },
              ]).toArray();
              for (const row of agg) {
                if (row._id) mgDateMap[row._id] = row.count || 0;
              }
            } catch {}
          })()
        );
      }

      await Promise.all(tasks);

      let totOs = 0;
      let totMg = 0;
      const breakdown = targetDates.map((d) => {
        const osCount = osDateMap[d] || 0;
        const mgCount = mgDateMap[d] || 0;
        totOs += osCount;
        totMg += mgCount;
        const isSync = osCount === mgCount;
        return {
          date: d,
          indexerMaster: osCount,
          totalMongo: mgCount,
          diff: Math.abs(osCount - mgCount),
          status: isSync ? "SYNC" : "MISMATCH",
        };
      });

      return {
        ...t,
        totalIndexerIncidents: totOs,
        totalMongoIncidents: totMg,
        dateBreakdownAlerts: breakdown,
        dateBreakdown: breakdown,
      };
    })
  );
}

// ==========================================
// 2. VULNERABILITIES NATIVE AUDIT
// ==========================================
export async function auditVulnsNative(
  tenants: TenantMeta[],
  dateRange: DateRange,
  mongoClient: MongoClient | null
): Promise<TenantMeta[]> {
  const startDate = dateRange.start || new Date().toISOString().slice(0, 10);
  const endDate = dateRange.end || startDate;
  const targetDates = dateRange.dates || [startDate];

  return Promise.all(
    tenants.map(async (t) => {
      const agentIds = t.filterAgentIds || [];
      const agentNames = t.filterAgentNames || [];
      const dbName = t.databaseName;

      let osVulnStats: Record<string, { Active: Record<string, number>; Solved: Record<string, number> }> = {};
      let mgVulnAgg: any[] = [];

      const tasks: Promise<any>[] = [];

      if (agentIds.length > 0 || agentNames.length > 0) {
        const q = {
          size: 0,
          query: {
            bool: {
              must: [
                { range: { timestamp: { gte: `${startDate}T00:00:00.000+07:00`, lte: `${endDate}T23:59:59.999+07:00` } } },
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
                      { terms: { "data.vulnerability.severity": ["Medium", "High", "Critical", "medium", "high", "critical"] } },
                      { terms: { "vulnerability.severity": ["Medium", "High", "Critical", "medium", "high", "critical"] } },
                    ],
                    minimum_should_match: 1,
                  },
                },
                {
                  bool: {
                    should: [
                      { terms: { "agent.id": agentIds } },
                      { terms: { "agent.name": agentNames } },
                    ],
                    minimum_should_match: 1,
                  },
                },
              ],
            },
          },
          aggs: {
            by_date: {
              date_histogram: {
                field: "timestamp",
                calendar_interval: "day",
                time_zone: "+07:00",
                format: "yyyy-MM-dd",
              },
              aggs: {
                by_status: {
                  terms: { field: "data.vulnerability.status", size: 10 },
                  aggs: {
                    by_sev: {
                      terms: { field: "data.vulnerability.severity", size: 10 },
                    },
                  },
                },
              },
            },
          },
        };

        tasks.push(
          queryIndexerWithFailover("/wazuh-alerts-*/_search", q, "POST", 15000)
            .then((res) => {
              const buckets = res?.aggregations?.by_date?.buckets || [];
              for (const b of buckets) {
                const d = b.key_as_string;
                osVulnStats[d] = { Active: {}, Solved: {} };
                for (const sb of b.by_status?.buckets || []) {
                  const rawStatus = sb.key.charAt(0).toUpperCase() + sb.key.slice(1).toLowerCase();
                  if (rawStatus === "Active" || rawStatus === "Solved") {
                    const statusKey = rawStatus as "Active" | "Solved";
                    for (const vb of sb.by_sev?.buckets || []) {
                      const sv = vb.key.charAt(0).toUpperCase() + vb.key.slice(1).toLowerCase();
                      osVulnStats[d][statusKey][sv] = vb.doc_count || 0;
                    }
                  }
                }
              }
            })
            .catch(() => {})
        );
      }

      if (mongoClient && dbName) {
        tasks.push(
          (async () => {
            try {
              const db = mongoClient.db(dbName);
              mgVulnAgg = await db.collection("vulnerability").aggregate([
                {
                  $match: {
                    date: { $gte: startDate, $lte: endDate },
                    severity: { $in: ["Critical", "High", "Medium", "critical", "high", "medium"] },
                  },
                },
                {
                  $project: {
                    date: 1,
                    severity: {
                      $concat: [
                        { $toUpper: { $substrCP: ["$severity", 0, 1] } },
                        { $toLower: { $substrCP: ["$severity", 1, { $strLenCP: "$severity" }] } },
                      ],
                    },
                    status: {
                      $concat: [
                        { $toUpper: { $substrCP: ["$status", 0, 1] } },
                        { $toLower: { $substrCP: ["$status", 1, { $strLenCP: "$status" }] } },
                      ],
                    },
                  },
                },
                {
                  $group: {
                    _id: { date: "$date", status: "$status", severity: "$severity" },
                    count: { $sum: 1 },
                  },
                },
              ]).toArray();
            } catch {}
          })()
        );
      }

      await Promise.all(tasks);

      const SEVERITY_ORDER = ["Critical", "High", "Medium"];
      const STATUS_ORDER = ["Active", "Solved"];
      const breakdown = targetDates.map((date) => {
        const details: any[] = [];
        let dateIdxTotal = 0;
        let dateMgTotal = 0;

        const subActive = { indexer: 0, mongo: 0, diff: 0, statusText: "SYNC" };
        const subSolved = { indexer: 0, mongo: 0, diff: 0, statusText: "SYNC" };

        for (const st of STATUS_ORDER) {
          for (const sev of SEVERITY_ORDER) {
            const idxCount = osVulnStats[date]?.[st as "Active" | "Solved"]?.[sev] || 0;
            const mgRow = mgVulnAgg.find(
              (r) => r._id?.date === date && r._id?.status === st && r._id?.severity === sev
            );
            const mgCount = mgRow?.count || 0;
            const diff = idxCount - mgCount;

            dateIdxTotal += idxCount;
            dateMgTotal += mgCount;

            if (st === "Active") {
              subActive.indexer += idxCount;
              subActive.mongo += mgCount;
            } else {
              subSolved.indexer += idxCount;
              subSolved.mongo += mgCount;
            }

            details.push({
              severity: sev,
              status: st,
              indexer: idxCount,
              mongo: mgCount,
              diff,
              statusText: diff === 0 ? "[OK] IN SYNC" : "[DIFF] OUT OF SYNC",
            });
          }
        }

        subActive.diff = subActive.indexer - subActive.mongo;
        subActive.statusText = subActive.diff === 0 ? "SYNC" : "DIFF";
        subSolved.diff = subSolved.indexer - subSolved.mongo;
        subSolved.statusText = subSolved.diff === 0 ? "SYNC" : "DIFF";

        const diffTot = dateIdxTotal - dateMgTotal;

        return {
          date,
          indexerMaster: dateIdxTotal,
          totalMongo: dateMgTotal,
          diff: diffTot,
          status: diffTot === 0 ? "SYNC" : "MISMATCH",
          details,
          subtotals: { active: subActive, solved: subSolved },
          total: {
            indexer: dateIdxTotal,
            mongo: dateMgTotal,
            diff: diffTot,
            statusText: diffTot === 0 ? "SYNC" : "DIFF",
          },
        };
      });

      const totalIdx = breakdown.reduce((s, r) => s + r.indexerMaster, 0);
      const totalMg = breakdown.reduce((s, r) => s + r.totalMongo, 0);

      return {
        ...t,
        totalIndexerVulns: totalIdx,
        totalMongoVulns: totalMg,
        dateBreakdownVulns: breakdown,
      };
    })
  );
}

// ==========================================
// 3. REDIS NATIVE AUDIT
// ==========================================
export async function auditRedisNative(
  tenants: TenantMeta[],
  targetDates: string[],
  mongoClient: MongoClient | null,
  redisClient: any
): Promise<TenantMeta[]> {
  if (!redisClient) return tenants;

  // Strict Redis L1 Cache Cap: Redis strictly caps at THIS WEEK (Monday s/d Today) or TODAY
  const nowUtc = new Date();
  const nowWib = new Date(nowUtc.getTime() + 7 * 60 * 60 * 1000);
  const dayOfWeek = nowWib.getUTCDay() || 7;
  const mondayDate = new Date(nowWib);
  mondayDate.setUTCDate(mondayDate.getUTCDate() - (dayOfWeek - 1));
  const mondayStr = mondayDate.toISOString().slice(0, 10);
  const todayStr = nowWib.toISOString().slice(0, 10);

  // Generate valid week dates
  const weekDates: string[] = [];
  const cur = new Date(mondayDate);
  while (cur <= nowWib) {
    weekDates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const yesterdayDate = new Date(nowWib.getTime() - 86400000);
  const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

  let effectiveDates: string[] = [];
  if (targetDates && targetDates.length === 1) {
    if (targetDates[0] === todayStr) {
      effectiveDates = [todayStr];
    } else if (targetDates[0] === yesterdayStr) {
      effectiveDates = [yesterdayStr];
    } else {
      effectiveDates = [todayStr];
    }
  } else {
    const filtered = (targetDates || []).filter(d => d >= mondayStr && d <= todayStr);
    effectiveDates = filtered.length > 0 ? filtered : weekDates;
  }

  return Promise.all(
    tenants.map(async (t) => {
      const cleanPrefix = (t.redisPrefix || `${t.databaseName}:`).replace(/\*$/, "");
      const prefix = cleanPrefix.replace(/:$/, "");
      const dbName = t.databaseName;

      try {
        const [keys, summaryExists, weeklyExists] = await Promise.all([
          redisClient.keys(`${cleanPrefix}*`).catch(() => []),
          redisClient.exists(`${cleanPrefix}summary:latest`).catch(() => 0),
          redisClient.exists(`${cleanPrefix}historical_statistics:weekly`).catch(() => 0),
        ]);

        const redisKeysCount = keys ? keys.length : 0;
        const redisSummaryPresent = Boolean(summaryExists);

        // 1. Incidents per target date
        let totMgInc = 0;
        let totRdInc = 0;
        const incidentBreakdown = await Promise.all(
          effectiveDates.map(async (d) => {
            const rdCount = (await redisClient.hlen(`${cleanPrefix}incident:${d}`).catch(() => 0)) || 0;
            let mgCount = 0;
            if (mongoClient && dbName) {
              try {
                mgCount = await mongoClient.db(dbName).collection("incident").countDocuments({ date: d });
              } catch {}
            }
            totMgInc += mgCount;
            totRdInc += rdCount;
            return {
              date: d,
              mongo: mgCount,
              redis: rdCount,
              status: mgCount === rdCount ? "SYNC" : "MISMATCH",
            };
          })
        );

        // 2. Vulnerabilities from Redis (filtered by effectiveDates)
        const vulnKeys = await redisClient.keys(`${cleanPrefix}vulnerability:*`).catch(() => []);
        let rdVulnCount = 0;
        const effectiveDatesSet = new Set(effectiveDates);
        const rdVulnDateCountMap = new Map<string, number>();
        if (vulnKeys && vulnKeys.length > 0) {
          const vulnData = await Promise.all(
            vulnKeys.map(async (vk: string) => {
              const hvals = await redisClient.hgetall(vk).catch(() => ({}));
              return Object.values(hvals);
            })
          );
          for (const items of vulnData) {
            for (const raw of items as string[]) {
              try {
                const doc = JSON.parse(raw);
                const d = doc.date || (doc.detected_at ? String(doc.detected_at).slice(0, 10) : "");
                if (d) {
                  rdVulnDateCountMap.set(d, (rdVulnDateCountMap.get(d) || 0) + 1);
                  if (effectiveDatesSet.has(d)) {
                    rdVulnCount++;
                  }
                }
              } catch {}
            }
          }
        }

        // 3. Devices (check both ${prefix}:devices and ${prefix}:devices:all)
        let rdDevCount = 0;
        const devRaw = (await redisClient.get(`${prefix}:devices`).catch(() => null)) ||
                       (await redisClient.get(`${prefix}:devices:all`).catch(() => null));
        if (devRaw) {
          try {
            const parsed = JSON.parse(devRaw);
            rdDevCount = Array.isArray(parsed) ? parsed.length : 0;
          } catch {}
        }

        // 4. Reports (filtered by effectiveDates)
        let rdRepCount = 0;
        const rdRepDateCountMap = new Map<string, number>();
        const repRaw = (await redisClient.get(`${prefix}:reports`).catch(() => null)) ||
                       (await redisClient.get(`${prefix}:reports:latest`).catch(() => null)) ||
                       (await redisClient.get(`${prefix}:reports:list`).catch(() => null));
        if (repRaw) {
          try {
            const parsed = JSON.parse(repRaw);
            if (Array.isArray(parsed)) {
              for (const rep of parsed) {
                const d = (rep.date_generated || rep.created_at || rep.date || "").slice(0, 10);
                if (d) {
                  rdRepDateCountMap.set(d, (rdRepDateCountMap.get(d) || 0) + 1);
                  if (effectiveDatesSet.has(d)) {
                    rdRepCount++;
                  }
                }
              }
            }
          } catch {}
        }

        let mgVulnCount = 0;
        let mgDevCount = 0;
        let mgRepCount = 0;
        const mgVulnDateCountMap = new Map<string, number>();
        const mgRepDateCountMap = new Map<string, number>();

        if (mongoClient && dbName) {
          try {
            const db = mongoClient.db(dbName);
            const startStr = effectiveDates[0];
            const endStr = effectiveDates[effectiveDates.length - 1];
            const startDt = new Date(`${startStr}T00:00:00.000Z`);
            const endDt = new Date(`${endStr}T23:59:59.999Z`);

            const vulnQuery = {
              $or: [
                { date: { $in: effectiveDates } },
                { detected_at: { $gte: startDt, $lte: endDt } },
                { detected_at: { $gte: startStr, $lte: `${endStr}T23:59:59.999Z` } },
                { last_seen: { $gte: startStr, $lte: `${endStr}T23:59:59.999Z` } },
              ],
            };

            const repQuery = {
              $or: [
                { created_at: { $gte: startDt, $lte: endDt } },
                { date_generated: { $gte: startDt, $lte: endDt } },
                { date_generated: { $gte: startStr, $lte: `${endStr}T23:59:59.999Z` } },
                { date: { $in: effectiveDates } },
              ],
            };

            const [devC, vulnC, repDocs, aggV] = await Promise.all([
              db.collection("devices").countDocuments({}).catch(() => 0),
              db.collection("vulnerability").countDocuments(vulnQuery).catch(() => 0),
              db.collection("reports").find(repQuery, { projection: { date_generated: 1, created_at: 1, date: 1 } }).toArray().catch(() => []),
              db.collection("vulnerability").aggregate([
                { $match: { date: { $in: effectiveDates } } },
                { $group: { _id: "$date", count: { $sum: 1 } } },
              ]).toArray().catch(() => []),
            ]);
            mgDevCount = devC;
            mgVulnCount = vulnC;
            mgRepCount = repDocs.length;

            for (const r of aggV) {
              if (r._id) mgVulnDateCountMap.set(r._id, r.count);
            }
            for (const r of repDocs) {
              const dStr = (r.date_generated ? new Date(r.date_generated).toISOString().slice(0, 10) : (r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : (r.date || ""))).slice(0, 10);
              if (dStr) mgRepDateCountMap.set(dStr, (mgRepDateCountMap.get(dStr) || 0) + 1);
            }
          } catch {}
        }

        const vulnBreakdown = effectiveDates.map((d) => {
          const mgV = mgVulnDateCountMap.get(d) || 0;
          const rdV = rdVulnDateCountMap.get(d) || 0;
          return {
            date: d,
            mongo: mgV,
            redis: rdV,
            status: mgV === rdV ? "SYNC" : "MISMATCH",
          };
        });

        const repBreakdown = effectiveDates.map((d) => {
          const mgR = mgRepDateCountMap.get(d) || 0;
          const rdR = rdRepDateCountMap.get(d) || 0;
          return {
            date: d,
            mongo: mgR,
            redis: rdR,
            status: mgR === rdR ? "SYNC" : "MISMATCH",
          };
        });

        const incSynced = totMgInc === totRdInc;
        const vulnSynced = mgVulnCount === rdVulnCount;
        const repSynced = mgRepCount === rdRepCount;
        const devSynced = mgDevCount === rdDevCount;

        const redisAudit = {
          incidents: {
            mongo: totMgInc,
            redis: totRdInc,
            isSynced: incSynced,
            dateBreakdown: incidentBreakdown,
          },
          vulnerabilities: {
            mongo: mgVulnCount,
            redis: rdVulnCount,
            isSynced: vulnSynced,
            dateBreakdown: vulnBreakdown,
          },
          reports: {
            mongo: mgRepCount,
            redis: rdRepCount,
            isSynced: repSynced,
            dateBreakdown: repBreakdown,
          },
          devices: {
            mongo: mgDevCount,
            redis: rdDevCount,
            isSynced: devSynced,
          },
          historicalStats: {
            cached: Boolean(weeklyExists),
            isSynced: Boolean(weeklyExists),
          },
          isAllSynced: incSynced && vulnSynced && repSynced && devSynced,
        };

        return {
          ...t,
          redisPrefix: `${cleanPrefix}:`,
          redisKeysCount,
          redisSummaryPresent,
          redisAudit,
        };
      } catch (err) {
        console.error(`Redis audit error for ${t.tenantCode}:`, err);
        return t;
      }
    })
  );
}

// ==========================================
// 4. IRIS NATIVE AUDIT
// ==========================================
export async function auditIrisNative(
  tenants: TenantMeta[],
  dateRange: DateRange,
  mongoClient: MongoClient | null
): Promise<{ is_in_sync: boolean; execution_time_ms: number; tenants: any[] }> {
  const t0 = Date.now();
  const startDate = dateRange.start || new Date().toISOString().slice(0, 10);
  const endDate = dateRange.end || startDate;

  // Single IRIS Server (10.20.100.133)
  const irisRes = await queryIrisSingle("/manage/cases/filter", {
    start_open_date: startDate,
    end_open_date: endDate,
    per_page: 100,
    order_by: "case_id",
    sort_dir: "asc",
  });

  const allCases = irisRes?.data?.cases || [];

  let overallInSync = true;
  const irisTenants = await Promise.all(
    tenants.map(async (t) => {
      const dbName = t.databaseName;
      let mgReportsCount = 0;
      let dbCases: any[] = [];

      if (mongoClient && dbName) {
        try {
          const db = mongoClient.db(dbName);
          const dtStart = `${startDate} 00:00:00`;
          const dtEnd = `${endDate} 23:59:59`;
          const dtStartIso = new Date(`${startDate}T00:00:00.000Z`);
          const dtEndIso = new Date(`${endDate}T23:59:59.999Z`);

          const mongoQuery = {
            $or: [
              { date_generated: { $gte: dtStart, $lte: dtEnd } },
              { date_generated: { $gte: dtStartIso, $lte: dtEndIso } },
              { date: { $gte: startDate, $lte: endDate } },
              { created_at: { $gte: dtStartIso, $lte: dtEndIso } },
            ],
          };

          const docs = await db.collection("reports").find(mongoQuery).sort({ report_id: -1 }).toArray();
          mgReportsCount = docs.length;
          dbCases = docs;
        } catch {}
      }

      // Match IRIS cases to this tenant
      const matchedCases = allCases.filter((c: any) => {
        const clientObj = c.client || {};
        const cid = clientObj.customer_id;
        if (t.irisCustomerId && cid && Number(cid) === Number(t.irisCustomerId)) return true;

        const cname = (clientObj.customer_name || clientObj.name || "").trim().toLowerCase();
        if (t.irisCustomerName && t.irisCustomerName !== "-" && cname === t.irisCustomerName.trim().toLowerCase()) return true;
        if (t.campusName && cname === t.campusName.trim().toLowerCase()) return true;
        if (t.tenantCode && cname.includes(t.tenantCode.toLowerCase())) return true;
        return false;
      });

      const formattedCases = matchedCases.map((c: any) => {
        const inMongo = dbCases.some((doc) => {
          const keyId = doc.report_id || doc.case_id;
          return (keyId && Number(keyId) === Number(c.case_id)) || doc.title === c.name;
        });
        return {
          case_id: c.case_id,
          title: c.name || "Incident Report",
          date: c.open_date || startDate,
          customer_name: c.client?.customer_name || t.campusName || "-",
          in_iris: true,
          in_mongo: inMongo,
          is_in_sync: inMongo,
        };
      });

      const isInSync = matchedCases.length === mgReportsCount;
      if (!isInSync) overallInSync = false;

      return {
        tenant_code: t.tenantCode,
        tenant_name: t.tenantName,
        campus_name: t.campusName,
        database_name: t.databaseName,
        iris_cases_count: matchedCases.length,
        mongo_reports_count: mgReportsCount,
        is_in_sync: isInSync,
        cases: formattedCases,
      };
    })
  );

  return {
    is_in_sync: overallInSync,
    execution_time_ms: Date.now() - t0,
    tenants: irisTenants,
  };
}
