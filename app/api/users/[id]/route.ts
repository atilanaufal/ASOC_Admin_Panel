import { NextRequest, NextResponse } from 'next/server';
import { updateUser, resetUserPassword, deleteUser } from '@/lib/users';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = parseInt(id, 10);

    if (isNaN(userId) || userId <= 0) {
      return NextResponse.json(
        { success: false, error: 'ID Pengguna tidak valid.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { action, newPassword, email, role, tenantId } = body;

    // 1. Action: Reset Password
    if (action === 'reset_password') {
      if (!newPassword || newPassword.length < 6) {
        return NextResponse.json(
          { success: false, error: 'Password baru minimal 6 karakter.' },
          { status: 400 }
        );
      }

      const result = await resetUserPassword(userId, newPassword);
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
          actionType: 'USER_RESET_PASSWORD',
          targetResource: `user:id:${userId}`,
          status: 'SUCCESS',
          details: { userId },
        });
      } catch {}

      return NextResponse.json({
        success: true,
        message: result.message,
      });
    }

    // 2. Action: Update User Profile
    const result = await updateUser(userId, {
      email,
      role,
      tenantId: tenantId ? Number(tenantId) : undefined,
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
        actionType: 'USER_UPDATE',
        targetResource: `user:id:${userId}`,
        status: 'SUCCESS',
        details: { userId, email, role, tenantId },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (err: any) {
    console.error('API /api/users/[id] PUT Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal memperbarui pengguna' },
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
    const userId = parseInt(id, 10);

    if (isNaN(userId) || userId <= 0) {
      return NextResponse.json(
        { success: false, error: 'ID Pengguna tidak valid.' },
        { status: 400 }
      );
    }

    const result = await deleteUser(userId);

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
        actionType: 'USER_DELETE',
        targetResource: `user:id:${userId}`,
        status: 'SUCCESS',
        details: { userId },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (err: any) {
    console.error('API /api/users/[id] DELETE Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal menghapus pengguna' },
      { status: 500 }
    );
  }
}
