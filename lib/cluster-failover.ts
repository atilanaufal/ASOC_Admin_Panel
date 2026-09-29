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
  const user = process.env.INDEXER_USER || "readall";
  const pass = process.env.INDEXER_PASS || "q9MFikR4N0Y?a3QmnvYY2L1O.CEBKj+E";
  const nodes: ClusterNodeConfig[] = [
    { url: process.env.INDEXER_NODE1_HOST || process.env.INDEXER_HOST || "https://10.20.100.131:9200", user, pass },
    { url: process.env.INDEXER_NODE2_HOST || "", user, pass },
    { url: process.env.INDEXER_NODE3_HOST || "", user, pass },
  ];
  return nodes.filter(n => Boolean(n.url && n.url.trim().length > 0));
}

function getWazuhNodes(): ClusterNodeConfig[] {
  const user = process.env.WAZUH_NODE1_USER || process.env.WAZUH_API_USER || "wazuh-wui";
  const pass = process.env.WAZUH_NODE1_PASS || process.env.WAZUH_API_PASS || "SecretPassword-123";
  const nodes: ClusterNodeConfig[] = [
    { url: process.env.WAZUH_NODE1_URL || process.env.WAZUH_API_URL || "https://10.20.100.131:55000", user, pass },
    { url: process.env.WAZUH_NODE2_URL || "", user, pass },
    { url: process.env.WAZUH_NODE3_URL || "", user, pass },
  ];
  return nodes.filter(n => Boolean(n.url && n.url.trim().length > 0));
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
  if (nodes.length === 0) return null;

  for (let attempt = 0; attempt < nodes.length; attempt++) {
    const idx = (activeIndexerIndex + attempt) % nodes.length;
    const node = nodes[idx];

    try {
      const parsed = new URL(node.url);
      const isHttps = parsed.protocol === "https:";
      const lib = isHttps ? https : http;
      const authHeader = "Basic " + Buffer.from(`${node.user}:${node.pass}`).toString("base64");
      const postData = body ? JSON.stringify(body) : "";

      const res = await new Promise<{ status: number; data: string }>((resolve, reject) => {
        const req = lib.request({
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: path.startsWith("/") ? path : `/${path}`,
          method,
          headers: {
            "Authorization": authHeader,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
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
      }
    } catch (err: any) {
      console.warn(`[Failover] Indexer node ${node.url} failed: ${err.message}. Trying next node...`);
    }
  }

  return null;
}

export async function getWazuhTokenWithFailover(): Promise<{ token: string; baseUrl: string } | null> {
  const now = Date.now();
  if (cachedWazuhToken && cachedWazuhToken.expiresAt > now + 60000) {
    return { token: cachedWazuhToken.token, baseUrl: cachedWazuhToken.nodeUrl };
  }

  const nodes = getWazuhNodes();
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
      }
    } catch (err: any) {
      console.warn(`[Failover] Wazuh node ${node.url} auth failed: ${err.message}.`);
    }
  }

  return null;
}

export async function queryWazuhApiWithFailover<T = any>(
  path: string,
  method = "GET",
  body?: any,
  timeoutMs = 10000
): Promise<T | null> {
  const authInfo = await getWazuhTokenWithFailover();
  if (!authInfo) return null;

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

    if (res.status === 200) {
      return JSON.parse(res.data) as T;
    }
  } catch (err: any) {
    console.warn(`[Wazuh API] request failed: ${err.message}`);
  }

  return null;
}

// Single Dedicated IRIS Server (10.20.100.133) - No Failover Needed
export async function queryIrisSingle<T = any>(
  path: string,
  params?: Record<string, any>,
  timeoutMs = 15000
): Promise<T | null> {
  const baseUrl = process.env.IRIS_BASE_URL || process.env.IRIS_API_URL || "https://10.20.100.133:443";
  const token = process.env.IRIS_API_KEY || "K0_0XjSgo2BhNYQPw153P3r6mNtLB8r8kKXqO4SXt5v20XXAdq3dpdE9Se74lVmfzlR5QUhtpigxaWPF8Q-hog";

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
