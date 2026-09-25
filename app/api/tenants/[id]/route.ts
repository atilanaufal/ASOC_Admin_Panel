import { NextRequest, NextResponse } from 'next/server';
import { updateTenant, deleteTenant } from '@/lib/tenants';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tenantId = parseInt(id, 10);

    if (isNaN(tenantId) || tenantId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid Tenant ID.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { campusName, databaseName, status, picName, picEmail, picPhone } = body;

    const result = await updateTenant(tenantId, {
      campusName,
      databaseName,
      status,
      picName,
      picEmail,
      picPhone,
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
        actionType: status ? 'TENANT_STATUS_TOGGLE' : 'TENANT_UPDATE',
        targetResource: `tenant:id:${tenantId}`,
        status: 'SUCCESS',
        details: { tenantId, campusName, databaseName, status },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (err: any) {
    console.error('API /api/tenants/[id] PUT Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to update tenant data' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tenantId = parseInt(id, 10);

    if (isNaN(tenantId) || tenantId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid Tenant ID.' },
        { status: 400 }
      );
    }

    // Role Enforcement: Only Superadmin can delete tenants and databases
    const authSession = request.cookies.get('auth_session')?.value;
    let currentUser: any = null;
    if (authSession) {
      try {
        currentUser = JSON.parse(decodeURIComponent(authSession));
      } catch {}
    }

    if (currentUser?.role !== 'superadmin') {
      return NextResponse.json(
        {
          success: false,
          error: 'Access denied: Only Superadmin has permission to delete tenants and databases.',
        },
        { status: 403 }
      );
    }

    const result = await deleteTenant(tenantId);

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
        adminUsername: currentUser?.username || 'superadmin',
        actionType: 'TENANT_DELETE',
        targetResource: `tenant:id:${tenantId}`,
        status: 'SUCCESS',
        details: { tenantId },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (err: any) {
    console.error('API /api/tenants/[id] DELETE Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to delete tenant' },
      { status: 500 }
    );
  }
}
