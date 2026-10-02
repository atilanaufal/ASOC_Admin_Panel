import "./env-loader";
import https from "https";
import http from "http";

export interface ClusterNodeConfig {
  url: string;
  user?: string;
  pass?: string;
  token?: string;
}

const httpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

function getIndexerNodes(): ClusterNodeConfig[] {
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
let cachedWazuhToken: { token: string; expiresAt: number; nodeUrl: string } | null = null;

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

  for (let attempt = 0; attempt < nodes.length; attempt++) {
    const idx = (activeIndexerIndex + attempt) % nodes.length;
    const node = nodes[idx];

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
        return JSON.parse(res.data) as T;
      } else {
        console.warn(`[Failover] Indexer node ${node.url} returned HTTP ${res.status}. Trying next node...`);
      }
    } catch (err: any) {
      console.warn(`[Failover] Indexer node ${node.url} failed: ${err.message}. Trying next node...`);
    }
  }

  console.error("[Failover] All Indexer nodes failed.");
  return null;
}

export async function getWazuhTokenWithFailover(forceRefresh = false): Promise<{ token: string; baseUrl: string } | null> {
  const now = Date.now();
  if (!forceRefresh && cachedWazuhToken && cachedWazuhToken.expiresAt > now + 60000) {
    return { token: cachedWazuhToken.token, baseUrl: cachedWazuhToken.nodeUrl };
  }

  const nodes = getWazuhNodes();
  if (nodes.length === 0) {
    console.error("[Failover] No Wazuh nodes configured in environment.");
    return null;
  }

  for (let attempt = 0; attempt < nodes.length; attempt++) {
    const idx = (activeWazuhIndex + attempt) % nodes.length;
    const node = nodes[idx];

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
          timeout: 5000,
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
        const json = JSON.parse(res.data);
        const token = json.data?.token;
        if (token) {
          activeWazuhIndex = idx;
          cachedWazuhToken = { token, expiresAt: now + 14 * 60 * 1000, nodeUrl: node.url };
          return { token, baseUrl: node.url };
        }
      } else {
        console.warn(`[Failover] Wazuh node ${node.url} auth rejected with HTTP ${res.status}.`);
      }
    } catch (err: any) {
      console.warn(`[Failover] Wazuh node ${node.url} auth failed: ${err.message}. Trying next node...`);
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
        req.on("timeout", () => req.destroy(new Error("Timeout")));
        if (postData) req.write(postData);
        req.end();
      });

      if (res.status >= 200 && res.status < 300) {
        return JSON.parse(res.data) as T;
      }

      console.warn(`[Failover] Wazuh node ${authInfo.baseUrl} returned HTTP ${res.status}. Invalidating token and failing over...`);
      cachedWazuhToken = null;
      activeWazuhIndex = (activeWazuhIndex + 1) % nodes.length;
    } catch (err: any) {
      console.warn(`[Failover] Wazuh API request to ${authInfo.baseUrl} failed: ${err.message}. Failing over...`);
      cachedWazuhToken = null;
      activeWazuhIndex = (activeWazuhIndex + 1) % nodes.length;
    }
  }

  return null;
}

export async function getActiveWazuhHost(): Promise<string | null> {
  // If explicitly configured manager host override
  if (process.env.WAZUH_MANAGER_HOST && process.env.WAZUH_MANAGER_HOST.trim()) {
    return process.env.WAZUH_MANAGER_HOST.trim();
  }

  // Live active node discovery from cluster failover
  const auth = await getWazuhTokenWithFailover();
  if (auth && auth.baseUrl) {
    try {
      return new URL(auth.baseUrl).hostname;
    } catch {}
  }

  // Fallback to first configured node URL hostname
  const nodes = getWazuhNodes();
  for (const node of nodes) {
    try {
      return new URL(node.url).hostname;
    } catch {}
  }

  return null;
}

// Single Dedicated IRIS Server (Dedicated Host) - No Failover Needed
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
