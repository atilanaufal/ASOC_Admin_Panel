import "./env-loader";
import https from "https";
import http from "http";

export interface ClusterNodeConfig {
  url: string;
  user?: string;
  pass?: string;
  token?: string;
}

type NodeCircuitState = "HEALTHY" | "UNHEALTHY" | "HALF_OPEN";

interface CircuitStateInfo {
  state: NodeCircuitState;
  nextProbeAt: number;
  consecutiveSuccesses: number;
  lastFailureReason?: string;
}

const httpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

export function getIndexerNodes(): ClusterNodeConfig[] {
  const n1Host = process.env.INDEXER_HOST || process.env.OPENSEARCH_URL || process.env.INDEXER_NODE1_HOST || "";
  const n1User = process.env.INDEXER_USER || process.env.INDEXER_NODE1_USER || "";
  const n1Pass = process.env.INDEXER_PASS || process.env.INDEXER_NODE1_PASS || "";

  const n2Host = process.env.INDEXER_NODE2_HOST || "";
  const n2User = process.env.INDEXER_NODE2_USER || n1User;
  const n2Pass = process.env.INDEXER_NODE2_PASS || n1Pass;

  const n3Host = process.env.INDEXER_NODE3_HOST || "";
  const n3User = process.env.INDEXER_NODE3_USER || n1User;
  const n3Pass = process.env.INDEXER_NODE3_PASS || n1Pass;

  const candidates: ClusterNodeConfig[] = [
    { url: n1Host, user: n1User, pass: n1Pass },
    { url: n2Host, user: n2User, pass: n2Pass },
    { url: n3Host, user: n3User, pass: n3Pass },
  ];

  return candidates.filter(n => Boolean(n.url && n.url.trim().length > 0));
}

function getWazuhNodes(): ClusterNodeConfig[] {
  const n1Url = process.env.WAZUH_NODE1_URL || process.env.WAZUH_API_URL || "";
  const n1User = process.env.WAZUH_NODE1_USER || process.env.WAZUH_API_USER || "";
  const n1Pass = process.env.WAZUH_NODE1_PASS || process.env.WAZUH_API_PASS || process.env.WAZUH_API_PASSWORD || "";

  const n2Url = process.env.WAZUH_NODE2_URL || "";
  const n2User = process.env.WAZUH_NODE2_USER || n1User;
  const n2Pass = process.env.WAZUH_NODE2_PASS || n1Pass;

  const n3Url = process.env.WAZUH_NODE3_URL || "";
  const n3User = process.env.WAZUH_NODE3_USER || n1User;
  const n3Pass = process.env.WAZUH_NODE3_PASS || n1Pass;

  const candidates: ClusterNodeConfig[] = [
    { url: n1Url, user: n1User, pass: n1Pass },
    { url: n2Url, user: n2User, pass: n2Pass },
    { url: n3Url, user: n3User, pass: n3Pass },
  ];

  return candidates.filter(n => Boolean(n.url && n.url.trim().length > 0 && n.pass && n.pass.trim().length > 0));
}

let activeIndexerIndex = 0;
let activeWazuhIndex = 0;
let cachedWazuhToken: { token: string; expiresAt: number; nodeUrl: string; nodeIndex: number } | null = null;

const circuitRegistry: Record<string, CircuitStateInfo> = {};
const COOLDOWN_MS = 15000;
const REQUIRED_PROBE_SUCCESSES = 2;

function getCircuit(url: string): CircuitStateInfo {
  if (!circuitRegistry[url]) {
    circuitRegistry[url] = {
      state: "HEALTHY",
      nextProbeAt: 0,
      consecutiveSuccesses: 0,
    };
  }
  return circuitRegistry[url];
}

function isNodeAvailable(url: string, isPrimary: boolean): boolean {
  const info = getCircuit(url);
  const now = Date.now();

  if (info.state === "HEALTHY") return true;

  if (info.state === "UNHEALTHY") {
    if (now >= info.nextProbeAt) {
      info.state = "HALF_OPEN";
      console.log(`[CIRCUIT-BREAKER] Node ${url} transitioned UNHEALTHY -> HALF_OPEN (probing recovery)`);
      return true;
    }
    return false;
  }

  // HALF_OPEN: allow probe
  return true;
}

function markNodeSuccess(url: string, nodeIndex: number) {
  const info = getCircuit(url);
  if (info.state === "HALF_OPEN") {
    info.consecutiveSuccesses += 1;
    console.log(`[FAILBACK-PROBE] Node ${url} probe ${info.consecutiveSuccesses}/${REQUIRED_PROBE_SUCCESSES} success`);
    if (info.consecutiveSuccesses >= REQUIRED_PROBE_SUCCESSES) {
      info.state = "HEALTHY";
      info.consecutiveSuccesses = 0;
      delete info.lastFailureReason;
      console.log(`[FAILBACK-SUCCESS] Node ${url} (Priority Node ${nodeIndex + 1}) recovered and marked HEALTHY`);
    }
  } else {
    info.state = "HEALTHY";
    info.consecutiveSuccesses = 0;
  }
}

function markNodeFailure(url: string, reason: string, nodeIndex: number) {
  const info = getCircuit(url);
  info.state = "UNHEALTHY";
  info.nextProbeAt = Date.now() + COOLDOWN_MS;
  info.consecutiveSuccesses = 0;
  info.lastFailureReason = reason;
  console.warn(`[FAILOVER] Node ${url} (Priority Node ${nodeIndex + 1}) marked UNHEALTHY. Reason: ${reason}. Cooldown ${COOLDOWN_MS}ms.`);
}

function isNetworkOrServerCrash(status: number): boolean {
  // 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout, 408 Request Timeout
  return status === 502 || status === 503 || status === 504 || status === 408 || status >= 500;
}

export async function queryIndexerWithFailover<T = any>(
  path: string,
  body?: any,
  method: "GET" | "POST" = "POST",
  timeoutMs = 12000
): Promise<T | null> {
  const nodes = getIndexerNodes();
  if (nodes.length === 0) {
    console.error("[Failover] No Indexer nodes configured in environment.");
    return null;
  }

  for (let idx = 0; idx < nodes.length; idx++) {
    const node = nodes[idx];
    if (!isNodeAvailable(node.url, idx === 0)) {
      continue;
    }

    try {
      const parsed = new URL(node.url);
      const isHttps = parsed.protocol === "https:";
      const lib = isHttps ? https : http;
      const authHeader = node.user && node.pass ? "Basic " + Buffer.from(`${node.user}:${node.pass}`).toString("base64") : "";
      const postData = body ? JSON.stringify(body) : "";

      const res = await new Promise<{ status: number; data: string }>((resolve, reject) => {
        const req = lib.request({
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: path.startsWith("/") ? path : `/${path}`,
          method,
          headers: {
            ...(authHeader ? { "Authorization": authHeader } : {}),
            "Content-Type": "application/json",
            ...(postData ? { "Content-Length": Buffer.byteLength(postData) } : {}),
          },
          rejectUnauthorized: false,
          agent: isHttps ? httpsAgent : undefined,
          timeout: timeoutMs,
        }, (res) => {
          let chunks = "";
          res.setEncoding("utf-8");
          res.on("data", c => chunks += c);
          res.on("end", () => resolve({ status: res.statusCode || 500, data: chunks }));
        });

        req.on("error", reject);
        req.on("timeout", () => req.destroy(new Error(`Timeout after ${timeoutMs}ms`)));
        if (postData) req.write(postData);
        req.end();
      });

      if (res.status >= 200 && res.status < 300) {
        activeIndexerIndex = idx;
        markNodeSuccess(node.url, idx);
        return JSON.parse(res.data) as T;
      }

      // If auth failure 401/403, don't trigger failover, log critical config error
      if (res.status === 401 || res.status === 403) {
        console.error(`[Indexer Auth Error] Node ${node.url} returned HTTP ${res.status}. Verify INDEXER_USER / INDEXER_PASS credentials.`);
        return null;
      }

      if (isNetworkOrServerCrash(res.status)) {
        markNodeFailure(node.url, `HTTP ${res.status}`, idx);
      }
    } catch (err: any) {
      markNodeFailure(node.url, err.message || "Network Error", idx);
    }
  }

  console.error("[Failover] All Indexer nodes failed.");
  return null;
}

export async function getWazuhTokenWithFailover(forceRefresh = false): Promise<{ token: string; baseUrl: string } | null> {
  const now = Date.now();
  const nodes = getWazuhNodes();
  if (nodes.length === 0) {
    console.error("[Failover] No Wazuh nodes configured in environment.");
    return null;
  }

  // Token valid on Node 1 (Highest Priority)
  if (!forceRefresh && cachedWazuhToken && cachedWazuhToken.nodeIndex === 0 && cachedWazuhToken.expiresAt > now + 60000) {
    return { token: cachedWazuhToken.token, baseUrl: cachedWazuhToken.nodeUrl };
  }

  // If using secondary/tertiary, check if Node 1 circuit is ready to probe
  if (!forceRefresh && cachedWazuhToken && cachedWazuhToken.nodeIndex > 0) {
    const node1 = nodes[0];
    const node1Circuit = getCircuit(node1.url);
    const node1CanProbe = node1Circuit.state === "HEALTHY" || (node1Circuit.state === "UNHEALTHY" && now >= node1Circuit.nextProbeAt);
    if (!node1CanProbe && cachedWazuhToken.expiresAt > now + 60000) {
      return { token: cachedWazuhToken.token, baseUrl: cachedWazuhToken.nodeUrl };
    }
  }

  // Strict priority traversal: Node 1 -> Node 2 -> Node 3
  for (let idx = 0; idx < nodes.length; idx++) {
    const node = nodes[idx];
    if (!isNodeAvailable(node.url, idx === 0)) {
      continue;
    }

    try {
      const parsed = new URL(node.url);
      const isHttps = parsed.protocol === "https:";
      const lib = isHttps ? https : http;
      const authHeader = "Basic " + Buffer.from(`${node.user}:${node.pass}`).toString("base64");

      const res = await new Promise<{ status: number; data: string }>((resolve, reject) => {
        const req = lib.request({
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: "/security/user/authenticate",
          method: "POST",
          headers: { "Authorization": authHeader },
          rejectUnauthorized: false,
          agent: isHttps ? httpsAgent : undefined,
          timeout: 4000,
        }, (res) => {
          let chunks = "";
          res.setEncoding("utf-8");
          res.on("data", c => chunks += c);
          res.on("end", () => resolve({ status: res.statusCode || 500, data: chunks }));
        });

        req.on("error", reject);
        req.on("timeout", () => req.destroy(new Error("Timeout after 4000ms")));
        req.end();
      });

      if (res.status === 200) {
        const json = JSON.parse(res.data);
        const token = json.data?.token;
        if (token) {
          activeWazuhIndex = idx;
          markNodeSuccess(node.url, idx);
          cachedWazuhToken = { token, expiresAt: now + 14 * 60 * 1000, nodeUrl: node.url, nodeIndex: idx };
          return { token, baseUrl: node.url };
        }
      }

      // Hard stop on 401/403 credentials error (do not failover)
      if (res.status === 401 || res.status === 403) {
        console.error(`[Wazuh Auth Error] Node ${node.url} rejected credentials (HTTP ${res.status}). Check WAZUH_NODE${idx + 1}_USER/PASS in .env.`);
        return null;
      }

      if (isNetworkOrServerCrash(res.status)) {
        markNodeFailure(node.url, `HTTP ${res.status}`, idx);
      }
    } catch (err: any) {
      markNodeFailure(node.url, err.message || "Network Error", idx);
    }
  }

  cachedWazuhToken = null;
  console.error("[Failover] All Wazuh nodes authentication failed.");
  return null;
}

export async function queryWazuhApiWithFailover<T = any>(
  path: string,
  method = "GET",
  body?: any,
  timeoutMs = 10000
): Promise<T | null> {
  const nodes = getWazuhNodes();
  if (nodes.length === 0) return null;

  for (let attempt = 0; attempt < nodes.length; attempt++) {
    const authInfo = await getWazuhTokenWithFailover(attempt > 0);
    if (!authInfo) break;

    try {
      const parsed = new URL(authInfo.baseUrl);
      const isHttps = parsed.protocol === "https:";
      const lib = isHttps ? https : http;
      const postData = body ? JSON.stringify(body) : "";

      const res = await new Promise<{ status: number; data: string }>((resolve, reject) => {
        const req = lib.request({
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: path.startsWith("/") ? path : `/${path}`,
          method,
          headers: {
            "Authorization": `Bearer ${authInfo.token}`,
            "Content-Type": "application/json",
            ...(postData ? { "Content-Length": Buffer.byteLength(postData) } : {}),
          },
          rejectUnauthorized: false,
          agent: isHttps ? httpsAgent : undefined,
          timeout: timeoutMs,
        }, (res) => {
          let chunks = "";
          res.setEncoding("utf-8");
          res.on("data", c => chunks += c);
          res.on("end", () => resolve({ status: res.statusCode || 500, data: chunks }));
        });

        req.on("error", reject);
        req.on("timeout", () => req.destroy(new Error(`Timeout after ${timeoutMs}ms`)));
        if (postData) req.write(postData);
        req.end();
      });

      if (res.status >= 200 && res.status < 300) {
        return JSON.parse(res.data) as T;
      }

      if (res.status === 401) {
        console.warn(`[Failover] Token expired on ${authInfo.baseUrl}. Refreshing...`);
        cachedWazuhToken = null;
        continue;
      }

      if (isNetworkOrServerCrash(res.status)) {
        markNodeFailure(authInfo.baseUrl, `HTTP ${res.status}`, activeWazuhIndex);
        cachedWazuhToken = null;
      }
    } catch (err: any) {
      markNodeFailure(authInfo.baseUrl, err.message || "Network Error", activeWazuhIndex);
      cachedWazuhToken = null;
    }
  }

  return null;
}

export async function getActiveWazuhHost(): Promise<string | null> {
  if (process.env.WAZUH_MANAGER_HOST && process.env.WAZUH_MANAGER_HOST.trim()) {
    return process.env.WAZUH_MANAGER_HOST.trim();
  }

  const auth = await getWazuhTokenWithFailover();
  if (auth && auth.baseUrl) {
    try {
      return new URL(auth.baseUrl).hostname;
    } catch {}
  }

  const nodes = getWazuhNodes();
  for (const node of nodes) {
    try {
      return new URL(node.url).hostname;
    } catch {}
  }

  return null;
}

export async function queryIrisSingle<T = any>(
  path: string,
  params?: Record<string, any>,
  timeoutMs = 15000
): Promise<T | null> {
  const baseUrl = process.env.IRIS_BASE_URL || process.env.IRIS_API_URL || "";
  if (!baseUrl) {
    console.warn("IRIS_API_URL is not configured in environment.");
    return null;
  }
  const token = process.env.IRIS_API_KEY || process.env.IRIS_TOKEN || "";
  if (!token) {
    console.warn("IRIS_API_KEY is not configured in environment.");
    return null;
  }

  try {
    const parsed = new URL(baseUrl);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const queryStr = params ? "?" + new URLSearchParams(params).toString() : "";
    const fullPath = (path.startsWith("/") ? path : `/${path}`) + queryStr;

    const res = await new Promise<{ status: number; data: string }>((resolve, reject) => {
      const req = lib.request({
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: fullPath,
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
        rejectUnauthorized: false,
        agent: isHttps ? httpsAgent : undefined,
        timeout: timeoutMs,
      }, (res) => {
        let chunks = "";
        res.setEncoding("utf-8");
        res.on("data", c => chunks += c);
        res.on("end", () => resolve({ status: res.statusCode || 500, data: chunks }));
      });

      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error("Timeout")));
      req.end();
    });

    if (res.status === 200) {
      return JSON.parse(res.data) as T;
    }
  } catch (err: any) {
    console.warn(`[IRIS Single] query failed: ${err.message}`);
  }

  return null;
}
