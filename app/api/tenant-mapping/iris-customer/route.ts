import { NextRequest, NextResponse } from 'next/server';
import { getMysqlPool } from '@/lib/mysql';
import { pingIris, getIrisCustomers } from '@/lib/iris';

export async function GET(_request: NextRequest) {
  try {
    const pool = getMysqlPool();

    // 1. Fetch tenants
    const [tenantsRows]: any = await pool.query(
      'SELECT id, tenant_code, campus_name, database_name, is_active FROM tenants ORDER BY id ASC'
    );

    // 2. Fetch current tenant_iris_customers mappings
    const [mappings]: any = await pool.query(
      'SELECT id, tenant_id, iris_customer_id, iris_customer_name, iris_customer_desc, created_at FROM tenant_iris_customers'
    );

    // 3. Fetch customers from IRIS API
    let availableCustomers: { id: number; name: string; desc: string }[] = [];
    try {
      availableCustomers = await getIrisCustomers();
    } catch (e) {
      console.warn('Could not fetch IRIS customers:', e);
    }

    // 4. Check IRIS API status
    let irisHealth = { ok: false, latencyMs: 0 };
    try {
      irisHealth = await pingIris();
    } catch (e) {
      console.warn('IRIS ping failed:', e);
    }

    const mappingByTenantId: Record<number, any> = {};
    for (const m of mappings) {
      mappingByTenantId[m.tenant_id] = m;
    }

    const tenantList = (tenantsRows || []).map((t: any) => {
      const mapping = mappingByTenantId[t.id];

      return {
        id: t.id,
        tenantCode: t.tenant_code,
        campusName: t.campus_name,
        databaseName: t.database_name,
        isActive: Boolean(t.is_active),
        irisCustomerId: mapping ? mapping.iris_customer_id : null,
        irisCustomerName: mapping ? mapping.iris_customer_name : null,
        irisCustomerDesc: mapping ? mapping.iris_customer_desc : null,
        isMapped: Boolean(mapping && mapping.iris_customer_id),
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
        totalIrisCustomers: availableCustomers.length,
        irisHealth,
      },
      tenants: tenantList,
      availableCustomers,
    });
  } catch (err: any) {
    console.error('API /api/tenant-mapping/iris-customer GET Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal memuat pemetaan IRIS Customer' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, irisCustomerId, irisCustomerName, irisCustomerDesc } = body;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant ID wajib diisi.' },
        { status: 400 }
      );
    }

    const pool = getMysqlPool();

    if (!irisCustomerId) {
      // Unassign mapping
      await pool.query('DELETE FROM tenant_iris_customers WHERE tenant_id = ?', [tenantId]);
      return NextResponse.json({
        success: true,
        message: 'Pemetaan customer IRIS berhasil dihapus untuk tenant tersebut.',
      });
    }

    const cId = Number(irisCustomerId);
    if (isNaN(cId) || cId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Customer ID harus berupa angka positif.' },
        { status: 400 }
      );
    }

    const cleanName = (irisCustomerName || '').trim();
    const cleanDesc = (irisCustomerDesc || '').trim() || null;

    // Check if iris_customer_id is currently used by another tenant
    const [existing]: any = await pool.query(
      'SELECT id, tenant_id FROM tenant_iris_customers WHERE iris_customer_id = ?',
      [cId]
    );

    if (existing.length > 0 && existing[0].tenant_id !== Number(tenantId)) {
      // Reassign to new tenant
      await pool.query(
        'UPDATE tenant_iris_customers SET tenant_id = ?, iris_customer_name = ?, iris_customer_desc = ? WHERE id = ?',
        [tenantId, cleanName, cleanDesc, existing[0].id]
      );
    } else {
      // Delete any prior mapping for this tenant
      await pool.query('DELETE FROM tenant_iris_customers WHERE tenant_id = ?', [tenantId]);
      // Insert or update on duplicate key (iris_customer_id is UNIQUE KEY)
      await pool.query(
        `INSERT INTO tenant_iris_customers (tenant_id, iris_customer_id, iris_customer_name, iris_customer_desc)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id), iris_customer_name = VALUES(iris_customer_name), iris_customer_desc = VALUES(iris_customer_desc)`,
        [tenantId, cId, cleanName, cleanDesc]
      );
    }

    return NextResponse.json({
      success: true,
      message: `Berhasil memetakan tenant ke IRIS Customer #${cId} (${cleanName}).`,
    });
  } catch (err: any) {
    console.error('API /api/tenant-mapping/iris-customer POST Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal memperbarui pemetaan IRIS Customer.' },
      { status: 500 }
    );
  }
}
