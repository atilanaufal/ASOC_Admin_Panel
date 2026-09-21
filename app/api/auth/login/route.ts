import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { syncSuperadminToBetterAuth, auth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username/Email dan Password wajib diisi.' },
        { status: 400 }
      );
    }

    // 1. Verify and synchronize superadmin user
    const result = await syncSuperadminToBetterAuth(username.trim(), password);

    if (!result.success || !result.user) {
      return NextResponse.json(
        { success: false, error: result.error || 'Autentikasi gagal.' },
        { status: 401 }
      );
    }

    const user = result.user;

    // 2. Prepare user session payload
    const sessionData = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: 'superadmin',
      tenantId: user.tenant_id || 0,
      tenantCode: user.tenant_code || 'MASTER',
      campusName: user.campus_name || 'ASOC Central Management',
      tenantName: user.campus_name || 'ASOC Central Management',
      loginTime: Date.now(),
      lastActive: Date.now(),
      databaseName: user.database_name || '-',
      redisPrefix: user.redis_prefix || 'asoc_master',
    };

    const response = NextResponse.json({
      success: true,
      message: 'Login Superadmin berhasil.',
      user: sessionData,
    });

    // Log admin activity
    try {
      const { logAdminActivity } = await import('@/lib/audit-logger');
      await logAdminActivity({
        req: request,
        adminId: user.id,
        adminUsername: user.username,
        actionType: 'AUTH_LOGIN',
        targetResource: 'portal:auth',
        status: 'SUCCESS',
        details: { email: user.email, role: 'superadmin' },
      });
    } catch {}

    // 3. Set auth_session cookie for edge middleware & client state
    const isSecure = process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false' && (request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https'));
    response.cookies.set('auth_session', encodeURIComponent(JSON.stringify(sessionData)), {
      path: '/',
      httpOnly: false,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 600,
    });

    // Also set a signed/dedicated token cookie
    response.cookies.set('better-auth.session_token', `superadmin_${user.id}_${Date.now()}`, {
      path: '/',
      httpOnly: false,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 600,
    });

    return response;
  } catch (error: any) {
    console.error('Superadmin Login API Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Terjadi kesalahan internal pada server.' },
      { status: 500 }
    );
  }
}
