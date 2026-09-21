import { NextRequest, NextResponse } from 'next/server';
import { listUsers, createUser } from '@/lib/users';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenant = searchParams.get('tenant') || 'all';
    const role = searchParams.get('role') || 'all';
    const search = searchParams.get('search') || '';

    const users = await listUsers({ tenant, role, search });

    return NextResponse.json({
      success: true,
      count: users.length,
      users,
    });
  } catch (err: any) {
    console.error('API /api/users GET Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal memuat daftar pengguna' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, email, password, role, tenantId } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username dan Password wajib diisi.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password minimal 6 karakter.' },
        { status: 400 }
      );
    }

    const result = await createUser({
      username,
      email,
      password,
      role: role || 'tenant',
      tenantId: role === 'admin' ? null : (Number(tenantId) || 1),
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
        message: `User ${result.user?.username} berhasil dibuat dan disinkronkan ke Better-Auth.`,
        user: result.user,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('API /api/users POST Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal membuat pengguna baru' },
      { status: 500 }
    );
  }
}
