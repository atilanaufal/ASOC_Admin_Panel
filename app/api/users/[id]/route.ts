import { NextRequest, NextResponse } from 'next/server';
import { updateUser, resetUserPassword, deleteUser } from '@/lib/users';
import { requireSession, requireSuperadmin } from '@/lib/session';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Enforce verified cryptographic session
    const auth = await requireSession(request);
    if (auth.errorResponse) return auth.errorResponse;
    const { user: currentUser } = auth;
    const isSuperadmin = currentUser.role === 'superadmin';

    const { id } = await params;
    if (!id || !id.trim()) {
      return NextResponse.json(
        { success: false, error: 'Invalid user ID.' },
        { status: 400 }
      );
    }
    const cleanId = id.trim();
    const userId = /^\d+$/.test(cleanId) ? parseInt(cleanId, 10) : cleanId;

    const body = await request.json();
    const { action, newPassword, role, tenantId } = body;

    const pool = (await import('@/lib/mysql')).getMysqlPool();

    // 2. Fetch target user to verify existence and tenant ownership (BOLA Defense)
    let targetType: 'admin' | 'tenant' | null = null;
    let targetUser: any = null;

    const [adminRows]: any = await pool.query(
      'SELECT id, username, role FROM admin_users WHERE id = ? OR username = ? LIMIT 1',
      [userId, userId]
    );

    if (adminRows && adminRows.length > 0) {
      targetType = 'admin';
      targetUser = adminRows[0];
    } else {
      const [userRows]: any = await pool.query(
        'SELECT id, tenant_id, name AS username, role FROM users WHERE id = ? LIMIT 1',
        [userId]
      );
      if (userRows && userRows.length > 0) {
        targetType = 'tenant';
        targetUser = userRows[0];
      }
    }

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'Target user not found.' },
        { status: 404 }
      );
    }

    // 3. Strict BOLA & Privilege Escalation Checks
    if (!isSuperadmin) {
      // Tenant Admin CANNOT touch platform admins
      if (targetType === 'admin') {
        return NextResponse.json(
          {
            success: false,
            error: 'Access denied: Administrators cannot modify platform administrator accounts.',
          },
          { status: 403 }
        );
      }

      // Tenant Admin CANNOT touch users of other tenants (IDOR / BOLA Prevention)
      if (targetUser.tenant_id !== currentUser.tenantId) {
        return NextResponse.json(
          {
            success: false,
            error: 'Forbidden: You do not have permission to modify users of another tenant.',
          },
          { status: 403 }
        );
      }

      // Tenant Admin CANNOT grant admin or superadmin roles
      if (role && role !== 'user') {
        return NextResponse.json(
          {
            success: false,
            error: 'Access denied: Only Superadmin can grant administrative roles.',
          },
          { status: 403 }
        );
      }

      // Tenant Admin CANNOT move users to another tenant
      if (tenantId !== undefined && Number(tenantId) !== currentUser.tenantId) {
        return NextResponse.json(
          {
            success: false,
            error: 'Access denied: Cannot reassign users to a different tenant.',
          },
          { status: 403 }
        );
      }
    }

    // 4. Action: Reset Password
    if (action === 'reset_password') {
      if (!newPassword || newPassword.length < 6) {
        return NextResponse.json(
          { success: false, error: 'New password must be at least 6 characters.' },
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
          adminId: typeof currentUser.id === 'number' ? currentUser.id : undefined,
          adminUsername: currentUser.username,
          actionType: 'USER_RESET_PASSWORD',
          targetResource: `user:id:${userId}`,
          status: 'SUCCESS',
          details: { userId, targetUsername: targetUser.username },
        });
      } catch {}

      return NextResponse.json({
        success: true,
        message: result.message,
      });
    }

    // 5. Action: Update User Profile
    const finalTenantId = isSuperadmin
      ? (tenantId !== undefined ? Number(tenantId) : undefined)
      : currentUser.tenantId;

    const result = await updateUser(userId, {
      role: isSuperadmin ? role : 'user',
      tenantId: finalTenantId,
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
        actionType: 'USER_UPDATE',
        targetResource: `user:id:${userId}`,
        status: 'SUCCESS',
        details: { userId, role, tenantId: finalTenantId },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (err: any) {
    console.error('API /api/users/[id] PUT Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to update user' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Role Enforcement: Only Superadmin can delete accounts
    const auth = await requireSuperadmin(request);
    if (auth.errorResponse) return auth.errorResponse;
    const { user: currentUser } = auth;

    const { id } = await params;
    if (!id || !id.trim()) {
      return NextResponse.json(
        { success: false, error: 'Invalid user ID.' },
        { status: 400 }
      );
    }
    const cleanId = id.trim();
    const userId = /^\d+$/.test(cleanId) ? parseInt(cleanId, 10) : cleanId;

    const result = await deleteUser(userId, currentUser.username);

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
      { success: false, error: err.message || 'Failed to delete user' },
      { status: 500 }
    );
  }
}
