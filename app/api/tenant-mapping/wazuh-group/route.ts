import { NextRequest, NextResponse } from "next/server";
import { getMysqlPool } from "@/lib/mysql";
import { queryWazuhApiWithFailover } from "@/lib/cluster-failover";

export async function GET(_request: NextRequest) {
  try {
    const pool = getMysqlPool();

    // 1. Fetch tenants
    const [tenantsRows]: any = await pool.query(
      "SELECT id, tenant_code, campus_name, database_name, is_active FROM tenants ORDER BY id ASC"
    );

    // 2. Fetch current tenant_wazuh_groups mappings
    const [mappings]: any = await pool.query(
      "SELECT id, tenant_id, wazuh_group_name, created_at FROM tenant_wazuh_groups"
    );

    // 3. Fetch Wazuh groups from Wazuh REST API (:55000) using Cluster Failover
    let wazuhGroups: { name: string; count: number }[] = [];
    try {
      const res = await queryWazuhApiWithFailover<any>("/groups", "GET");
      if (res && res.data && Array.isArray(res.data.affected_items)) {
        wazuhGroups = res.data.affected_items.map((item: any) => ({
          name: item.name,
          count: item.count || 0,
        }));
      }
    } catch (wazuhErr) {
      console.warn("Could not fetch groups from Wazuh API:", wazuhErr);
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
      const mapped = Boolean(mapping && groupName);

      return {
        id: t.id,
        tenantCode: t.tenant_code,
        campusName: t.campus_name,
        databaseName: t.database_name,
        isActive: Boolean(t.is_active),
        wazuhGroup: groupName,
        agentCount,
        hasMapping: mapped,
        isMapped: mapped,
        mappingId: mapping ? mapping.id : null,
        mappedAt: mapping ? mapping.created_at : null,
      };
    });

    const totalTenants = tenantList.length;
    const mappedCount = tenantList.filter((t: any) => t.isMapped).length;
    const unmappedCount = totalTenants - mappedCount;
    const mappingCoverage = totalTenants > 0 ? Math.round((mappedCount / totalTenants) * 100) : 100;

    return NextResponse.json({
      success: true,
      summary: {
        totalTenants,
        mappedCount,
        unmappedCount,
        mappedTenants: mappedCount,
        unmappedTenants: unmappedCount,
        mappingCoverage,
      },
      tenants: tenantList,
      availableGroups: wazuhGroups,
    });
  } catch (error: any) {
    console.error("Wazuh Group Mapping GET Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load mapping data" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const pool = getMysqlPool();
    const body = await request.json();
    const { tenantId, wazuhGroupName } = body;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "tenantId is required" },
        { status: 400 }
      );
    }

    // Verify tenant exists
    const [tenants]: any = await pool.query(
      "SELECT id, tenant_code FROM tenants WHERE id = ?",
      [tenantId]
    );

    if (!tenants || tenants.length === 0) {
      return NextResponse.json(
        { success: false, error: "Tenant not found" },
        { status: 404 }
      );
    }

    if (!wazuhGroupName) {
      // DELETE mapping
      await pool.query("DELETE FROM tenant_wazuh_groups WHERE tenant_id = ?", [
        tenantId,
      ]);
      return NextResponse.json({
        success: true,
        message: "Mapping removed successfully",
      });
    }

    // Enforce 1-to-1 mapping policy: a Wazuh group cannot be mapped to multiple tenants
    const [conflictRows]: any = await pool.query(
      `SELECT twg.tenant_id, t.tenant_code, t.campus_name
       FROM tenant_wazuh_groups twg
       JOIN tenants t ON twg.tenant_id = t.id
       WHERE twg.wazuh_group_name = ? AND twg.tenant_id != ?`,
      [wazuhGroupName, tenantId]
    );

    if (conflictRows && conflictRows.length > 0) {
      const conflict = conflictRows[0];
      return NextResponse.json(
        {
          success: false,
          error: `Group "${wazuhGroupName}" is already mapped to tenant "${conflict.tenant_code}" (${conflict.campus_name}). Each Wazuh group can only be mapped to one tenant.`,
        },
        { status: 400 }
      );
    }

    // INSERT or UPDATE
    await pool.query(
      `INSERT INTO tenant_wazuh_groups (tenant_id, wazuh_group_name, created_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE wazuh_group_name = VALUES(wazuh_group_name), created_at = NOW()`,
      [tenantId, wazuhGroupName]
    );

    return NextResponse.json({
      success: true,
      message: "Mapping saved successfully",
    });
  } catch (error: any) {
    console.error("Wazuh Group Mapping POST Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save mapping" },
      { status: 500 }
    );
  }
}
