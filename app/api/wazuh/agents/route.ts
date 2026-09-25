import { NextRequest, NextResponse } from 'next/server';
import { fetchWazuhAgents, WazuhAgent } from '@/lib/wazuh';
import { getMysqlPool } from '@/lib/mysql';

export interface MappedAgentItem {
  id: string;
  name: string;
  ip: string;
  status: 'active' | 'disconnected' | 'never_connected' | 'pending' | string;
  version: string;
  os: {
    name?: string;
    platform?: string;
    version?: string;
  };
  groups: string[];
  lastKeepAlive: string;
  assignedTenant: {
    tenantCode: string;
    campusName: string;
    databaseName: string;
  } | null;
  isMapped: boolean;
}

export async function GET(_request: NextRequest) {
  try {
    const [rawAgents, tenantsRows, wazuhGroupRows, tenantAgentRows] = await Promise.all([
      fetchWazuhAgents(500, 0),
      (async () => {
        try {
          const pool = getMysqlPool();
          const [rows]: any = await pool.query(
            'SELECT id, tenant_code, campus_name, database_name, redis_prefix FROM tenants WHERE is_active = 1'
          );
          return Array.isArray(rows) ? rows : [];
        } catch (dbErr) {
          console.error('Error querying tenants for agent mapping:', dbErr);
          return [];
        }
      })(),
      (async () => {
        try {
          const pool = getMysqlPool();
          const [rows]: any = await pool.query(
            'SELECT tenant_id, wazuh_group_name FROM tenant_wazuh_groups'
          );
          return Array.isArray(rows) ? rows : [];
        } catch (dbErr) {
          console.error('Error querying tenant_wazuh_groups:', dbErr);
          return [];
        }
      })(),
      (async () => {
        try {
          const pool = getMysqlPool();
          const [rows]: any = await pool.query(
            'SELECT tenant_id, agent_id, agent_name FROM tenant_agents'
          );
          return Array.isArray(rows) ? rows : [];
        } catch (dbErr) {
          console.error('Error querying tenant_agents:', dbErr);
          return [];
        }
      })(),
    ]);

    // Fast lookup maps
    const tenantById: Record<number, any> = {};
    const tenantMap: Record<string, any> = {};
    for (const t of tenantsRows) {
      tenantById[t.id] = t;
      if (t.database_name) tenantMap[t.database_name.toLowerCase()] = t;
      if (t.tenant_code) tenantMap[t.tenant_code.toLowerCase()] = t;
      if (t.campus_name) {
        const cLower = t.campus_name.toLowerCase().trim();
        tenantMap[cLower] = t;
        tenantMap[cLower.replace(/\s+/g, '')] = t;
        tenantMap[cLower.replace(/\s+/g, '_')] = t;
      }
    }

    // Map Wazuh group name -> tenant
    const groupToTenant: Record<string, any> = {};
    for (const wg of wazuhGroupRows) {
      const t = tenantById[wg.tenant_id];
      if (t && wg.wazuh_group_name) {
        const gName = wg.wazuh_group_name.toLowerCase().trim();
        groupToTenant[gName] = t;
        groupToTenant[gName.replace(/\s+/g, '')] = t;
        groupToTenant[gName.replace(/\s+/g, '_')] = t;
      }
    }

    // Map explicit agent_id -> tenant
    const agentIdToTenant: Record<string, any> = {};
    for (const ta of tenantAgentRows) {
      const t = tenantById[ta.tenant_id];
      if (t && ta.agent_id) {
        agentIdToTenant[String(ta.agent_id)] = t;
        agentIdToTenant[String(ta.agent_id).padStart(3, '0')] = t;
        const numId = Number(ta.agent_id);
        if (!isNaN(numId)) agentIdToTenant[String(numId)] = t;
      }
    }

    // Filter out Wazuh Manager (ID 000 or 0)
    const realEndpointAgents = rawAgents.filter(
      (agent: WazuhAgent) => agent.id !== '000' && agent.id !== '0' && agent.name.toLowerCase() !== 'wazuh-manager'
    );

    let activeCount = 0;
    let disconnectedCount = 0;
    let unassignedCount = 0;

    const mappedAgents: MappedAgentItem[] = realEndpointAgents.map((agent: WazuhAgent) => {
      const groups = Array.isArray(agent.group) ? agent.group : agent.group ? [agent.group] : ['default'];
      
      // 1. Check direct agent_id mapping from tenant_agents table
      let matchedTenant: any =
        agentIdToTenant[agent.id] ||
        agentIdToTenant[String(agent.id).padStart(3, '0')] ||
        agentIdToTenant[String(Number(agent.id))];

      // 2. Check group-based mapping from tenant_wazuh_groups table
      if (!matchedTenant) {
        for (const g of groups) {
          const cleanG = g.toLowerCase().trim();
          if (groupToTenant[cleanG] || groupToTenant[cleanG.replace(/\s+/g, '')]) {
            matchedTenant = groupToTenant[cleanG] || groupToTenant[cleanG.replace(/\s+/g, '')];
            break;
          }
        }
      }

      // 3. Check fallback tenant code / database name matching
      if (!matchedTenant) {
        for (const g of groups) {
          const cleanG = g.toLowerCase().trim();
          if (tenantMap[cleanG] || tenantMap[cleanG.replace(/\s+/g, '')]) {
            matchedTenant = tenantMap[cleanG] || tenantMap[cleanG.replace(/\s+/g, '')];
            break;
          }
        }
      }

      // 4. Name heuristic match
      if (!matchedTenant) {
        const lowerName = agent.name.toLowerCase();
        for (const [key, t] of Object.entries(tenantMap)) {
          if (key.length >= 3 && lowerName.includes(key)) {
            matchedTenant = t;
            break;
          }
        }
      }

      const isMapped = Boolean(matchedTenant);

      const status = agent.status || 'disconnected';
      if (status === 'active') activeCount++;
      else disconnectedCount++;

      if (!isMapped) unassignedCount++;

      return {
        id: agent.id,
        name: agent.name || `Agent ${agent.id}`,
        ip: agent.ip || '-',
        status,
        version: agent.version || 'Wazuh v4.14.6',
        os: agent.os || { name: 'Unknown', platform: 'linux', version: '-' },
        groups,
        lastKeepAlive: agent.lastKeepAlive || '-',
        assignedTenant: matchedTenant
          ? {
              tenantCode: matchedTenant.tenant_code,
              campusName: matchedTenant.campus_name,
              databaseName: matchedTenant.database_name,
            }
          : null,
        isMapped,
      };
    });


    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        total: mappedAgents.length,
        active: activeCount,
        disconnected: disconnectedCount,
        unassigned: unassignedCount,
      },
      agents: mappedAgents,
      tenants: tenantsRows.map((t: any) => ({
        id: t.id,
        tenantCode: t.tenant_code,
        campusName: t.campus_name,
        databaseName: t.database_name,
      })),
    });
  } catch (err: any) {
    console.error('API /api/wazuh/agents GET Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to load Wazuh agent inventory' },
      { status: 500 }
    );
  }
}
