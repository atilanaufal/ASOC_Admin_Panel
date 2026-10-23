import { NextRequest, NextResponse } from 'next/server';
import { listUsers, createUser } from '@/lib/users';
import { requireSession, isPlatformAdmin } from '@/lib/session';
import { serializeUserItem, safeErrorResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    // 1. Enforce verified cryptographic session
    const auth = await requireSession(request);
    if (auth.errorResponse) return auth.errorResponse;
    const { user: currentUser } = auth;

    const { searchParams } = new URL(request.url);
    const isSuperadmin = currentUser.role === 'superadmin';

    // BOLA protection: Non-platform admins CANNOT query 'all' tenants or other tenants
    let targetTenant = searchParams.get('tenant') || 'all';
    if (!isPlatformAdmin(currentUser) && currentUser.tenantCode && currentUser.tenantCode !== 'MASTER') {
      targetTenant = currentUser.tenantCode;
    }

    const role = searchParams.get('role') || 'all';
    const search = searchParams.get('search') || '';

    const users = await listUsers({ tenant: targetTenant, role, search });

    // Platform admins see all queried users; tenant-confined users only see their own tenant users
    const filteredUsers = isPlatformAdmin(currentUser)
      ? users
      : users.filter((u) => u.tenant_id === currentUser.tenantId);

    // Explicit DTO allowlist: strictly omit database_name and redis_prefix
    const sanitizedUsers = filteredUsers.map(serializeUserItem);

    return NextResponse.json({
      success: true,
      count: sanitizedUsers.length,
      isSuperadmin,
      users: sanitizedUsers,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Failed to load users list');
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Enforce verified cryptographic session
    const auth = await requireSession(request);
    if (auth.errorResponse) return auth.errorResponse;
    const { user: currentUser } = auth;

    const isSuperadmin = currentUser.role === 'superadmin';

    const body = await request.json();
    const { username, password, role, tenantId } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and Password are required.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters.' },
        { status: 400 }
      );
    }

    // Role Escalation Defense: Only Superadmin can create superadmin or admin accounts
    if ((role === 'superadmin' || role === 'admin') && !isSuperadmin) {
      return NextResponse.json(
        {
          success: false,
          error: 'Access denied: Only Superadmin can create platform administrator accounts.',
        },
        { status: 403 }
      );
    }

    // BOLA Protection: Tenant Admin can only create users inside their own tenant
    let targetTenantId: number | null = null;
    if (role === 'admin' || role === 'superadmin') {
      targetTenantId = null;
    } else {
      if (isPlatformAdmin(currentUser)) {
        targetTenantId = Number(tenantId) || 1;
      } else {
        // Enforce caller's tenant
        targetTenantId = currentUser.tenantId;
      }
    }

    const result = await createUser({
      username: username.trim(),
      password,
      role: role || 'user',
      tenantId: targetTenantId,
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
        actionType: 'USER_CREATE',
        targetResource: `user:${result.user?.username}`,
        status: 'SUCCESS',
        details: {
          id: result.user?.id,
          username: result.user?.username,
          role: result.user?.role,
          tenantId: result.user?.tenant_id,
        },
      });
    } catch {}

    return NextResponse.json(
      {
        success: true,
        message: `User ${result.user?.username} created successfully.`,
        user: serializeUserItem(result.user),
      },
      { status: 201 }
    );
  } catch (err: any) {
    return safeErrorResponse(err, 'Failed to create user');
  }
}
