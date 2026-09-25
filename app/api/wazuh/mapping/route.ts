import { NextRequest, NextResponse } from 'next/server';
import { setAgentGroup } from '@/lib/wazuh';
import { getMysqlPool } from '@/lib/mysql';
import { getMongoClient } from '@/lib/mongodb';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, agentName, tenantCode } = body;

    if (!agentId || !tenantCode) {
      return NextResponse.json(
        { success: false, error: 'Agent ID and Tenant Code are required.' },
        { status: 400 }
      );
    }

    // 1. Fetch tenant detail from MySQL
    const pool = getMysqlPool();
    const [rows]: any = await pool.query(
      'SELECT id, tenant_code, campus_name, database_name FROM tenants WHERE tenant_code = ? OR id = ? LIMIT 1',
      [tenantCode, tenantCode]
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { success: false, error: `Tenant '${tenantCode}' not found in MySQL.` },
        { status: 404 }
      );
    }

    const tenant = rows[0];
    const targetGroup = tenant.database_name;

    // 2. Set agent group in Wazuh Manager
    const wazuhRes = await setAgentGroup(agentId, targetGroup);

    // 3. Upsert into MongoDB devices collection in target tenant database
    let mongoUpdated = false;
    try {
      const mongoClient = await getMongoClient();
      const tenantDb = mongoClient.db(tenant.database_name);
      const devicesCol = tenantDb.collection('devices');
      const summaryCol = tenantDb.collection('device_summary');

      const cleanAgentId = String(agentId).padStart(3, '0');

      await devicesCol.updateOne(
        { id: cleanAgentId },
        {
          $set: {
            id: cleanAgentId,
            name: agentName || `agent-${cleanAgentId}`,
            group: [targetGroup],
            tenant_code: tenant.tenant_code,
            last_updated: new Date(),
          },
        },
        { upsert: true }
      );

      // Recalculate device_summary
      const totalDevices = await devicesCol.countDocuments({});
      const activeDevices = await devicesCol.countDocuments({ status: 'active' });
      const disconnectedDevices = totalDevices - activeDevices;

      await summaryCol.updateOne(
        { tenant_code: tenant.tenant_code },
        {
          $set: {
            tenant_code: tenant.tenant_code,
            campus_name: tenant.campus_name,
            database_name: tenant.database_name,
            total_devices: totalDevices,
            active_devices: activeDevices,
            disconnected_devices: disconnectedDevices,
            last_updated: new Date(),
          },
        },
        { upsert: true }
      );

      mongoUpdated = true;
    } catch (mongoErr: any) {
      console.warn('[MongoDB Devices Sync Warning]:', mongoErr.message);
    }

    // Record audit log
    try {
      const { logAdminActivity } = await import('@/lib/audit-logger');
      await logAdminActivity({
        req: request,
        actionType: 'AGENT_MAPPING_UPDATE',
        targetResource: `wazuh:agent:${agentId}`,
        status: 'SUCCESS',
        details: {
          agentId,
          agentName,
          targetGroup,
          tenantCode: tenant.tenant_code,
          campusName: tenant.campus_name,
        },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `Agen ${agentId} (${agentName || 'Agent'}) successfully mapped to ${tenant.campus_name} (${tenant.tenant_code}).`,
      wazuhGroupUpdated: wazuhRes.success,
      mongoDevicesUpdated: mongoUpdated,
      tenant: {
        tenantCode: tenant.tenant_code,
        campusName: tenant.campus_name,
        databaseName: tenant.database_name,
      },
    });
  } catch (err: any) {
    console.error('API /api/wazuh/mapping POST Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to update agent mapping' },
      { status: 500 }
    );
  }
}
