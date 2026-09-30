import { NextRequest, NextResponse } from 'next/server';
import { listTenantsWithStorageMetrics, provisionTenant } from '@/lib/tenants';
import { requireSession, requireSuperadmin } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession(request);
    if (auth.errorResponse) return auth.errorResponse;
    const { user: currentUser } = auth;

    const allTenants = await listTenantsWithStorageMetrics();

    // BOLA defense: Tenant Admin only sees their own tenant
    const tenants = currentUser.role === 'superadmin'
      ? allTenants
      : allTenants.filter((t) => t.id === currentUser.tenantId);

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
      { success: false, error: err.message || 'Failed to load tenant data' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Only Superadmin can provision new tenants and allocate databases
    const auth = await requireSuperadmin(request);
    if (auth.errorResponse) return auth.errorResponse;
    const { user: currentUser } = auth;

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
        { success: false, error: 'Tenant code and campus name are required.' },
        { status: 400 }
      );
    }

    if (createInitialAdmin && !adminPassword) {
      return NextResponse.json(
        { success: false, error: 'Initial Admin password is required if admin option is checked.' },
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
        adminId: typeof currentUser.id === 'number' ? currentUser.id : undefined,
        adminUsername: currentUser.username,
        actionType: 'TENANT_PROVISION',
        targetResource: `tenant:${tenantCode}`,
        status: 'SUCCESS',
        details: { tenantCode, campusName },
      });
    } catch {}

    return NextResponse.json(
      {
        success: true,
        message: `Tenant ${campusName} (${tenantCode}) provisioned successfully.`,
        tenant: result.tenant,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('API /api/tenants POST Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to provision tenant' },
      { status: 500 }
    );
  }
}
