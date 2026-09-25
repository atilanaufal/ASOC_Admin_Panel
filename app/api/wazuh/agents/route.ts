import { NextRequest, NextResponse } from 'next/server';
import { getMongoClient } from '@/lib/mongodb';
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
    const pool = getMysqlPool();
    const [tenantsRows]: any = await pool.query(
      'SELECT id, tenant_code, campus_name, database_name, redis_prefix FROM tenants WHERE is_active = 1 ORDER BY id ASC'
    );
    const tenants = Array.isArray(tenantsRows) ? tenantsRows : [];

    const mongoClient = await getMongoClient();
    const mappedAgents: MappedAgentItem[] = [];

    let activeCount = 0;
    let disconnectedCount = 0;

    for (const t of tenants) {
      if (!t.database_name) continue;
      try {
        const db = mongoClient.db(t.database_name);
        const docs = await db.collection('devices').find({}).toArray();

        for (const doc of docs) {
          const rawStatus = String(doc.status || '').toLowerCase();
          const isActive = rawStatus === 'online' || rawStatus === 'active';
          const status = isActive ? 'active' : 'disconnected';

          if (isActive) activeCount++;
          else disconnectedCount++;

          let osObj: { name?: string; platform?: string; version?: string } = {
            name: 'Linux',
            platform: 'linux',
            version: '',
          };

          if (typeof doc.os === 'string') {
            const raw = doc.os.trim();
            const uMatch = raw.match(/^Ubuntu\s*(.*)$/i);
            const rMatch = raw.match(/^Rocky(?:\s+Linux)?\s*(.*)$/i);
            const dMatch = raw.match(/^Debian\s*(.*)$/i);
            const wMatch = raw.match(/^Windows(?:\s+Server)?\s*(.*)$/i);

            if (uMatch) {
              osObj = { name: 'Ubuntu', platform: 'ubuntu', version: uMatch[1] || '' };
            } else if (rMatch) {
              osObj = { name: 'Rocky Linux', platform: 'centos', version: rMatch[1] || '' };
            } else if (dMatch) {
              osObj = { name: 'Debian', platform: 'debian', version: dMatch[1] || '' };
            } else if (wMatch) {
              osObj = { name: 'Windows', platform: 'windows', version: wMatch[1] || '' };
            } else {
              osObj = { name: raw || 'Linux', platform: 'linux', version: '' };
            }
          } else if (typeof doc.os === 'object' && doc.os !== null) {
            let n = String(doc.os.name || 'Linux').trim();
            let v = String(doc.os.version || '').trim();
            if (v && n.toLowerCase().includes(v.toLowerCase())) {
              n = n.split(v).join('').trim() || n;
            } else if (n.toLowerCase() === v.toLowerCase()) {
              v = '';
            }
            osObj = {
              name: n || 'Linux',
              platform: doc.os.platform || 'linux',
              version: v,
            };
          }

          const groups = Array.isArray(doc.group)
            ? doc.group
            : doc.group
            ? [doc.group]
            : [t.tenant_code];

          mappedAgents.push({
            id: String(doc.id || doc.agent_id || '001'),
            name: doc.name || doc.agent || doc.hostname || `Agent-${doc.id}`,
            ip: doc.ip || doc.agent_ip || '-',
            status,
            version: doc.version || doc.agent_version || 'Wazuh v4.14.3',
            os: osObj,
            groups,
            lastKeepAlive: doc.last_keepalive || doc.lastKeepAlive || '-',
            assignedTenant: {
              tenantCode: t.tenant_code,
              campusName: t.campus_name,
              databaseName: t.database_name,
            },
            isMapped: true,
          });
        }
      } catch (dbErr) {
        console.error(`Error querying devices from MongoDB ${t.database_name}:`, dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        total: mappedAgents.length,
        active: activeCount,
        disconnected: disconnectedCount,
        unassigned: 0,
      },
      agents: mappedAgents,
      tenants: tenants.map((t: any) => ({
        id: t.id,
        tenantCode: t.tenant_code,
        campusName: t.campus_name,
        databaseName: t.database_name,
      })),
    });
  } catch (err: any) {
    console.error('API /api/wazuh/agents GET Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to load agent inventory from MongoDB' },
      { status: 500 }
    );
  }
}
