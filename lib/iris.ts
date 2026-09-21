import './env-loader';
import https from 'https';
import http from 'http';
import { URL } from 'url';

function getIrisUrl(): string {
  return process.env.IRIS_API_URL || process.env.IRIS_BASE_URL || '';
}

function getOpenSearchUrl(): string {
  return process.env.OPENSEARCH_URL || process.env.INDEXER_HOST || '';
}

function getIrisApiKey(): string {
  return process.env.IRIS_API_KEY || '';
}

function httpRequest<T = any>(
  targetUrl: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
  } = {}
): Promise<{ statusCode: number; data: T }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqOptions: https.RequestOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      rejectUnauthorized: false,
      timeout: options.timeoutMs || 5000,
    };

    const req = lib.request(reqOptions, (res) => {
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsedData = body ? JSON.parse(body) : ({} as any);
          resolve({ statusCode: res.statusCode || 200, data: parsedData });
        } catch {
          resolve({ statusCode: res.statusCode || 200, data: body as any });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Request to ${targetUrl} timed out`));
    });

    req.end();
  });
}

export interface IrisCustomerItem {
  id: number;
  name: string;
  desc: string;
}

export async function getIrisCustomers(): Promise<IrisCustomerItem[]> {
  const url = getIrisUrl();
  const key = getIrisApiKey();
  if (!url) return [];

  const headers: Record<string, string> = {};
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  }

  const listUrl = `${url.replace(/\/$/, '')}/manage/customers/list`;
  try {
    const res = await httpRequest<{ status?: string; data?: any[] }>(listUrl, {
      method: 'GET',
      headers,
      timeoutMs: 5000,
    });

    if (res.statusCode === 200 && Array.isArray(res.data?.data)) {
      return res.data.data
        .filter((c: any) => c.customer_id && c.customer_name)
        .map((c: any) => ({
          id: Number(c.customer_id),
          name: String(c.customer_name),
          desc: String(c.customer_description || '-'),
        }));
    }
  } catch (err) {
    console.warn('Failed to fetch IRIS customers via /manage/customers/list:', err);
  }

  return [];
}

export async function pingIris(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const url = getIrisUrl();
  if (!url) return { ok: false, latencyMs: 0, error: 'IRIS_API_URL not configured' };
  const start = Date.now();
  try {
    const res = await httpRequest(url, { timeoutMs: 3000 });
    const latencyMs = Date.now() - start;
    return { ok: res.statusCode < 500, latencyMs };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

export async function pingOpenSearch(): Promise<{ ok: boolean; latencyMs: number; error?: string; version?: string }> {
  const url = getOpenSearchUrl();
  if (!url) return { ok: false, latencyMs: 0, error: 'OPENSEARCH_URL not configured' };
  const start = Date.now();
  try {
    const res = await httpRequest<any>(url, { timeoutMs: 3000 });
    const latencyMs = Date.now() - start;
    // 200 OK or 401 Unauthorized means port is responsive and service is running
    if (res.statusCode < 500) {
      const version = res.data?.version?.number || '2.x';
      return { ok: true, latencyMs, version };
    }
    return { ok: false, latencyMs, error: `HTTP ${res.statusCode}` };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}
