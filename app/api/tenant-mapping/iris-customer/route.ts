import { NextRequest, NextResponse } from "next/server";
import { getMysqlPool } from "@/lib/mysql";
import { queryIrisSingle } from "@/lib/cluster-failover";
import { requireSession, requireSuperadmin } from "@/lib/session";

export async function GET(_request: NextRequest) {
  try {
    const auth = await requireSession(_request);
    if (auth.errorResponse) return auth.errorResponse;

    const pool = getMysqlPool();

    // 1. Fetch tenants
    const [tenantsRows]: any = await pool.query(
      "SELECT id, tenant_code, campus_name, database_name, is_active FROM tenants ORDER BY id ASC"
    );

    // 2. Fetch current tenant_iris_customers mappings
    const [mappings]: any = await pool.query(
      "SELECT id, tenant_id, iris_customer_id, iris_customer_name, iris_customer_desc, created_at FROM tenant_iris_customers"
    );

    // 3. Fetch customers from IRIS API directly (single dedicated node 10.20.100.133)
    let availableCustomers: { id: number; name: string; desc: string }[] = [];
    try {
      const res = await queryIrisSingle<any>("/manage/customers/list", {}, 8000);
      if (res && res.data && Array.isArray(res.data)) {
        availableCustomers = res.data.map((c: any) => ({
          id: c.customer_id,
          name: c.customer_name,
          desc: c.customer_description || "-",
        }));
      }
    } catch (e) {
      console.warn("Could not fetch IRIS customers:", e);
    }

    const mappingByTenantId: Record<number, any> = {};
    for (const m of mappings) {
      mappingByTenantId[m.tenant_id] = m;
    }

    const tenantList = (tenantsRows || []).map((t: any) => {
      const mapping = mappingByTenantId[t.id];
      const hasCid = Boolean(mapping && mapping.iris_customer_id);

      return {
        id: t.id,
        tenantCode: t.tenant_code,
        campusName: t.campus_name,
        databaseName: t.database_name,
        isActive: Boolean(t.is_active),
        irisCustomerId: mapping ? mapping.iris_customer_id : null,
        irisCustomerName: mapping ? mapping.iris_customer_name : null,
        irisCustomerDesc: mapping ? mapping.iris_customer_desc : null,
        hasMapping: hasCid,
        isMapped: hasCid,
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
        irisOnline: availableCustomers.length > 0,
      },
      tenants: tenantList,
      availableCustomers,
    });
  } catch (error: any) {
    console.error("IRIS Customer Mapping GET Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load IRIS mapping data" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperadmin(request);
    if (auth.errorResponse) return auth.errorResponse;

    const pool = getMysqlPool();
    const body = await request.json();
    const { tenantId, irisCustomerId, irisCustomerName, irisCustomerDesc } = body;

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

    if (!irisCustomerId) {
      // DELETE mapping
      await pool.query(
        "DELETE FROM tenant_iris_customers WHERE tenant_id = ?",
        [tenantId]
      );
      return NextResponse.json({
        success: true,
        message: "IRIS customer mapping removed successfully",
      });
    }

    // Enforce 1-to-1 mapping policy: an IRIS customer cannot be mapped to multiple tenants
    const [conflictRows]: any = await pool.query(
      `SELECT tic.tenant_id, t.tenant_code, t.campus_name 
       FROM tenant_iris_customers tic 
       JOIN tenants t ON tic.tenant_id = t.id 
       WHERE tic.iris_customer_id = ? AND tic.tenant_id != ?`,
      [irisCustomerId, tenantId]
    );

    if (conflictRows && conflictRows.length > 0) {
      const conflict = conflictRows[0];
      return NextResponse.json(
        {
          success: false,
          error: `IRIS Customer #${irisCustomerId} (${irisCustomerName || 'Customer'}) is already mapped to tenant "${conflict.tenant_code}" (${conflict.campus_name}). Each customer can only be mapped to one tenant.`,
        },
        { status: 400 }
      );
    }

    // INSERT or UPDATE
    await pool.query(
      `INSERT INTO tenant_iris_customers (tenant_id, iris_customer_id, iris_customer_name, iris_customer_desc, created_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE 
         iris_customer_id = VALUES(iris_customer_id),
         iris_customer_name = VALUES(iris_customer_name),
         iris_customer_desc = VALUES(iris_customer_desc),
         created_at = NOW()`,
      [tenantId, irisCustomerId, irisCustomerName || "", irisCustomerDesc || ""]
    );

    return NextResponse.json({
      success: true,
      message: "IRIS customer mapping saved successfully",
    });
  } catch (error: any) {
    console.error("IRIS Customer Mapping POST Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save IRIS customer mapping" },
      { status: 500 }
    );
  }
}
