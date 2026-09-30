import './env-loader';
import { getWazuhTokenWithFailover, queryWazuhApiWithFailover } from './cluster-failover';

/**
 * Retrieves valid Wazuh JWT token with automatic multi-node cluster failover.
 */
export async function getWazuhToken(): Promise<string> {
  const authInfo = await getWazuhTokenWithFailover();
  if (!authInfo?.token) {
    throw new Error('All Wazuh nodes authentication failed or no nodes configured');
  }
  return authInfo.token;
}

/**
 * Unified Wazuh API request router with automatic cluster failover and retries.
 */
export async function wazuhRequest<T = any>(endpoint: string, options: { method?: string; body?: any } = {}): Promise<T> {
  const data = await queryWazuhApiWithFailover<T>(
    endpoint,
    options.method || 'GET',
    options.body,
    8000
  );
  if (!data) {
    throw new Error(`Wazuh API request failed across all nodes for ${endpoint}`);
  }
  return data;
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
      message: res.data?.affected_items?.[0] || `Agent ${cleanAgentId} successfully added to group ${cleanGroupId}.`,
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
      message: res.data?.affected_items?.[0] || `Agent ${cleanAgentId} successfully removed from group ${cleanGroupId}.`,
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

