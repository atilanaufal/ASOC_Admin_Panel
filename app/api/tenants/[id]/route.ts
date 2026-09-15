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
        { success: false, error: 'ID Tenant tidak valid.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { campusName, status, picName, picEmail, picPhone } = body;

    const result = await updateTenant(tenantId, {
      campusName,
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
        details: { tenantId, campusName, status, picName, picEmail },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (err: any) {
    console.error('API /api/tenants/[id] PUT Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal memperbarui data tenant' },
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
        { success: false, error: 'ID Tenant tidak valid.' },
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
      { success: false, error: err.message || 'Gagal menghapus tenant' },
      { status: 500 }
    );
  }
}
