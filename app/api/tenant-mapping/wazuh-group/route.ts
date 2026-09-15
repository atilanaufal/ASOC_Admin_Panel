import { NextRequest, NextResponse } from 'next/server';
import { getMysqlPool } from '@/lib/mysql';
import { getWazuhGroups } from '@/lib/wazuh';

export async function GET(_request: NextRequest) {
  try {
    const pool = getMysqlPool();

    // 1. Fetch tenants
    const [tenantsRows]: any = await pool.query(
      'SELECT id, tenant_code, campus_name, database_name, is_active FROM tenants ORDER BY id ASC'
    );

    // 2. Fetch current tenant_wazuh_groups mappings
    const [mappings]: any = await pool.query(
      'SELECT id, tenant_id, wazuh_group_name, created_at FROM tenant_wazuh_groups'
    );

    // 3. Fetch Wazuh groups from Wazuh REST API (:55000)
    let wazuhGroups: { name: string; count: number }[] = [];
    try {
      wazuhGroups = await getWazuhGroups();
    } catch (wazuhErr) {
      console.warn('Could not fetch groups from Wazuh API:', wazuhErr);
    }

    const groupCountMap: Record<string, number> = {};
    for (const g of wazuhGroups) {
      groupCountMap[g.name] = g.count;
    }

    const mappingByTenantId: Record<number, any> = {};
    for (const m of mappings) {
      mappingByTenantId[m.tenant_id] = m;
    }

    const tenantList = (tenantsRows || []).map((t: any) => {
      const mapping = mappingByTenantId[t.id];
      const groupName = mapping ? mapping.wazuh_group_name : null;
      const agentCount = groupName ? (groupCountMap[groupName] ?? 0) : 0;

      return {
        id: t.id,
        tenantCode: t.tenant_code,
        campusName: t.campus_name,
        databaseName: t.database_name,
        isActive: Boolean(t.is_active),
        wazuhGroup: groupName,
        agentCount,
        isMapped: Boolean(groupName),
        mappingId: mapping?.id || null,
      };
    });

    const mappedCount = tenantList.filter((t: any) => t.isMapped).length;

    return NextResponse.json({
      success: true,
      summary: {
        totalTenants: tenantList.length,
        mappedTenants: mappedCount,
        unmappedTenants: tenantList.length - mappedCount,
        totalWazuhGroups: wazuhGroups.length,
      },
      tenants: tenantList,
      availableGroups: wazuhGroups,
    });
  } catch (err: any) {
    console.error('API /api/tenant-mapping/wazuh-group GET Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal memuat pemetaan Wazuh Group' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, wazuhGroupName } = body;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant ID wajib diisi.' },
        { status: 400 }
      );
    }

    const pool = getMysqlPool();
    const cleanGroup = (wazuhGroupName || '').trim();

    if (!cleanGroup) {
      // Unassign mapping
      await pool.query('DELETE FROM tenant_wazuh_groups WHERE tenant_id = ?', [tenantId]);
      return NextResponse.json({
        success: true,
        message: 'Pemetaan grup Wazuh berhasil dihapus untuk tenant tersebut.',
      });
    }

    // Check if group is currently mapped to another tenant
    const [existing]: any = await pool.query(
      'SELECT id, tenant_id FROM tenant_wazuh_groups WHERE wazuh_group_name = ?',
      [cleanGroup]
    );

    if (existing.length > 0 && existing[0].tenant_id !== Number(tenantId)) {
      // Reassign group from old tenant to new tenant
      await pool.query(
        'UPDATE tenant_wazuh_groups SET tenant_id = ? WHERE id = ?',
        [tenantId, existing[0].id]
      );
    } else {
      // Delete any prior group for this tenant, then insert or update
      await pool.query('DELETE FROM tenant_wazuh_groups WHERE tenant_id = ?', [tenantId]);
      await pool.query(
        'INSERT INTO tenant_wazuh_groups (tenant_id, wazuh_group_name) VALUES (?, ?)',
        [tenantId, cleanGroup]
      );
    }

    return NextResponse.json({
      success: true,
      message: `Berhasil memetakan tenant ke grup Wazuh "${cleanGroup}".`,
    });
  } catch (err: any) {
    console.error('API /api/tenant-mapping/wazuh-group POST Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal memperbarui pemetaan grup Wazuh.' },
      { status: 500 }
    );
  }
}
