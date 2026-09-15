import https from 'https';
import http from 'http';
import { URL } from 'url';

function getWazuhConfig() {
  return {
    url: process.env.WAZUH_API_URL || '',
    user: process.env.WAZUH_API_USER || '',
    password: process.env.WAZUH_API_PASSWORD || '',
  };
}

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

function httpRequest<T = any>(
  targetUrl: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
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

    if (options.body) {
      const payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      req.write(payload);
    }

    req.end();
  });
}

export async function getWazuhToken(): Promise<string> {
  const { url, user, password } = getWazuhConfig();
  if (!url) {
    throw new Error('WAZUH_API_URL tidak terdefinisi');
  }

  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const authHeader = 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
  const res = await httpRequest<{ data?: { token?: string }; error?: number }>(
    `${url}/security/user/authenticate`,
    {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      timeoutMs: 4000,
    }
  );

  if (res.statusCode >= 400) {
    throw new Error(`Wazuh auth failed: HTTP ${res.statusCode}`);
  }

  if (res.data?.data?.token) {
    cachedToken = res.data.data.token;
    tokenExpiresAt = Date.now() + 14 * 60 * 1000;
    return cachedToken as string;
  }

  throw new Error('No token in Wazuh auth response');
}

export async function wazuhRequest<T = any>(endpoint: string, options: { method?: string; body?: any } = {}): Promise<T> {
  const { url: baseUrl } = getWazuhConfig();
  const token = await getWazuhToken();
  const url = `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const res = await httpRequest<T>(url, {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: options.body,
    timeoutMs: 5000,
  });

  if (res.statusCode >= 400) {
    throw new Error(`Wazuh API request error: HTTP ${res.statusCode}`);
  }

  return res.data;
}

export async function pingWazuh(): Promise<{ ok: boolean; latencyMs: number; error?: string; version?: string }> {
  const start = Date.now();
  try {
    const data = await wazuhRequest<any>('/manager/info');
    const latencyMs = Date.now() - start;
    const version = data?.data?.affected_items?.[0]?.version || '4.x';
    return { ok: true, latencyMs, version };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

export interface WazuhAgent {
  id: string;
  name: string;
  ip?: string;
  status: 'active' | 'disconnected' | 'never_connected' | 'pending' | string;
  node_name?: string;
  version?: string;
  os?: {
    name?: string;
    platform?: string;
    version?: string;
  };
  group?: string[];
  lastKeepAlive?: string;
  dateAdd?: string;
}

export async function fetchWazuhAgents(limit: number = 500, offset: number = 0): Promise<WazuhAgent[]> {
  try {
    const res = await wazuhRequest<any>(`/agents?limit=${limit}&offset=${offset}`);
    const items: WazuhAgent[] = res.data?.affected_items || [];
    return items.filter((a) => a.id !== '000' && a.id !== '0' && a.name.toLowerCase() !== 'wazuh-manager');
  } catch (err) {
    console.error('Error in fetchWazuhAgents:', err);
    return [];
  }
}

export async function getWazuhAgents(limit: number = 500, offset: number = 0): Promise<{ agents: WazuhAgent[]; total: number }> {
  try {
    const res = await wazuhRequest<any>(`/agents?limit=${limit}&offset=${offset}`);
    const rawItems: WazuhAgent[] = res.data?.affected_items || [];
    const filtered = rawItems.filter((a) => a.id !== '000' && a.id !== '0' && a.name.toLowerCase() !== 'wazuh-manager');
    return {
      agents: filtered,
      total: filtered.length,
    };
  } catch (err) {
    console.error('Error fetching Wazuh agents:', err);
    return { agents: [], total: 0 };
  }
}

export async function getWazuhAgentSummary(): Promise<{ active: number; disconnected: number; never_connected: number; pending: number; total: number }> {
  try {
    const res = await wazuhRequest<any>('/agents/summary/status');
    const status = res.data?.connection_status || {};
    return {
      active: status.active || 0,
      disconnected: status.disconnected || 0,
      never_connected: status.never_connected || 0,
      pending: status.pending || 0,
      total: status.total || (status.active || 0) + (status.disconnected || 0) + (status.never_connected || 0) + (status.pending || 0),
    };
  } catch (err) {
    console.error('Error fetching Wazuh agent summary:', err);
    return { active: 0, disconnected: 0, never_connected: 0, pending: 0, total: 0 };
  }
}

/**
 * Assigns an agent to a specific group in Wazuh Manager.
 */
export async function setAgentGroup(agentId: string, groupId: string): Promise<{ success: boolean; message?: string }> {
  try {
    const cleanAgentId = String(agentId).padStart(3, '0');
    const cleanGroupId = groupId.trim();
    const res = await wazuhRequest<any>(`/agents/${cleanAgentId}/group/${cleanGroupId}`, {
      method: 'PUT',
    });
    return {
      success: true,
      message: res.data?.affected_items?.[0] || `Agen ${cleanAgentId} berhasil dimasukkan ke grup ${cleanGroupId}.`,
    };
  } catch (err: any) {
    console.error(`Error setting agent ${agentId} group to ${groupId}:`, err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Removes an agent from a group in Wazuh Manager.
 */
export async function removeAgentFromGroup(agentId: string, groupId: string): Promise<{ success: boolean; message?: string }> {
  try {
    const cleanAgentId = String(agentId).padStart(3, '0');
    const cleanGroupId = groupId.trim();
    const res = await wazuhRequest<any>(`/agents/${cleanAgentId}/group/${cleanGroupId}`, {
      method: 'DELETE',
    });
    return {
      success: true,
      message: res.data?.affected_items?.[0] || `Agen ${cleanAgentId} berhasil dikeluarkan dari grup ${cleanGroupId}.`,
    };
  } catch (err: any) {
    console.error(`Error removing agent ${agentId} from group ${groupId}:`, err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Retrieves all groups defined in Wazuh Manager.
 */
export async function getWazuhGroups(): Promise<{ name: string; count: number }[]> {
  try {
    const res = await wazuhRequest<any>('/groups');
    return (res.data?.affected_items || []).map((item: any) => ({
      name: item.name,
      count: item.count ?? 0,
    }));
  } catch (err) {
    console.error('Error fetching Wazuh groups:', err);
    return [];
  }
}

