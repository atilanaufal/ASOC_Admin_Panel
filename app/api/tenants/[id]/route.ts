import { NextRequest, NextResponse } from 'next/server';
import { updateTenant, deleteTenant } from '@/lib/tenants';
import { requireSession, requireSuperadmin } from '@/lib/session';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession(request);
    if (auth.errorResponse) return auth.errorResponse;
    const { user: currentUser } = auth;
    const isSuperadmin = currentUser.role === 'superadmin';

    const { id } = await params;
    const tenantId = parseInt(id, 10);

    if (isNaN(tenantId) || tenantId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid Tenant ID.' },
        { status: 400 }
      );
    }

    // BOLA defense: Tenant Admin can only update their own tenant
    if (!isSuperadmin && tenantId !== currentUser.tenantId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: You do not have permission to modify another tenant.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { campusName, databaseName, status, picName, picEmail, picPhone } = body;

    // Privilege Escalation Defense: Only Superadmin can change tenant status or database mapping
    if (!isSuperadmin && (status !== undefined || databaseName !== undefined)) {
      return NextResponse.json(
        { success: false, error: 'Access denied: Only Superadmin can change tenant status or database allocation.' },
        { status: 403 }
      );
    }

    const result = await updateTenant(tenantId, {
      campusName,
      databaseName: isSuperadmin ? databaseName : undefined,
      status: isSuperadmin ? status : undefined,
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
        adminId: typeof currentUser.id === 'number' ? currentUser.id : undefined,
        adminUsername: currentUser.username,
        actionType: status ? 'TENANT_STATUS_TOGGLE' : 'TENANT_UPDATE',
        targetResource: `tenant:id:${tenantId}`,
        status: 'SUCCESS',
        details: { tenantId, campusName, status: isSuperadmin ? status : undefined },
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
    // Only Superadmin can delete tenants and databases
    const auth = await requireSuperadmin(request);
    if (auth.errorResponse) return auth.errorResponse;
    const { user: currentUser } = auth;

    const { id } = await params;
    const tenantId = parseInt(id, 10);

    if (isNaN(tenantId) || tenantId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid Tenant ID.' },
        { status: 400 }
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
        adminId: typeof currentUser.id === 'number' ? currentUser.id : undefined,
        adminUsername: currentUser.username,
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
