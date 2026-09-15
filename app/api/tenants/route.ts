import { NextRequest, NextResponse } from 'next/server';
import { listTenantsWithStorageMetrics, provisionTenant } from '@/lib/tenants';

export async function GET(_request: NextRequest) {
  try {
    const tenants = await listTenantsWithStorageMetrics();

    // Summary calculations
    const totalTenants = tenants.length;
    const activeTenants = tenants.filter((t) => t.status === 'ACTIVE' || t.is_active).length;
    const suspendedTenants = totalTenants - activeTenants;
    const totalStorageBytes = tenants.reduce((acc, t) => acc + (t.storage?.storageSizeBytes || 0), 0);
    const totalDataBytes = tenants.reduce((acc, t) => acc + (t.storage?.dataSizeBytes || 0), 0);
    const totalRedisKeys = tenants.reduce((acc, t) => acc + (t.redisKeyCount || 0), 0);
    const totalUsers = tenants.reduce((acc, t) => acc + (t.userCount || 0), 0);

    return NextResponse.json({
      success: true,
      summary: {
        totalTenants,
        activeTenants,
        suspendedTenants,
        totalStorageBytes,
        totalDataBytes,
        totalRedisKeys,
        totalUsers,
      },
      tenants,
    });
  } catch (err: any) {
    console.error('API /api/tenants GET Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal memuat data tenant' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tenantCode,
      campusName,
      picName,
      picEmail,
      picPhone,
      createInitialAdmin,
      adminPassword,
    } = body;

    if (!tenantCode || !campusName) {
      return NextResponse.json(
        { success: false, error: 'Kode Kampus dan Nama Kampus wajib diisi.' },
        { status: 400 }
      );
    }

    if (createInitialAdmin && !adminPassword) {
      return NextResponse.json(
        { success: false, error: 'Password Admin awal wajib diisi jika opsi admin dicentang.' },
        { status: 400 }
      );
    }

    const result = await provisionTenant({
      tenantCode,
      campusName,
      picName,
      picEmail,
      picPhone,
      createInitialAdmin,
      adminPassword,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    // Record audit log
    try {
      const { logAdminActivity } = await import('@/lib/audit-logger');
      await logAdminActivity({
        req: request,
        actionType: 'TENANT_CREATE',
        targetResource: `tenant:${result.tenant?.tenantCode}`,
        status: 'SUCCESS',
        details: {
          tenantCode: result.tenant?.tenantCode,
          campusName: result.tenant?.campusName,
          databaseName: result.tenant?.databaseName,
        },
      });
    } catch {}

    return NextResponse.json(
      {
        success: true,
        message: `Tenant ${result.tenant?.campusName} dan database fisik '${result.tenant?.databaseName}' berhasil diprovisi 100%.`,
        tenant: result.tenant,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('API /api/tenants POST Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal memproses automated provisioning' },
      { status: 500 }
    );
  }
}
