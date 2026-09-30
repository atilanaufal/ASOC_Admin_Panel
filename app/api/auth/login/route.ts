import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { syncSuperadminToBetterAuth } from '@/lib/auth';
import {
  signSessionPayload,
  SESSION_COOKIE_NAME,
  CLIENT_USER_COOKIE_NAME,
  getCookieOptions,
  getClientCookieOptions,
} from '@/lib/session';
import { checkRateLimit, resetRateLimit } from '@/lib/rate-limiter';
import { extractClientIp } from '@/lib/audit-logger';

export async function POST(request: NextRequest) {
  const clientIp = extractClientIp(request);

  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and Password are required.' },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim();

    // 1. Rate Limiting Protection (Brute Force Defense)
    const rateLimitKey = `login:${clientIp}:${cleanUsername}`;
    const rateCheck = await checkRateLimit(rateLimitKey, 5, 300); // 5 attempts per 5 mins
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many failed login attempts. Account temporarily locked for security. Please try again in ${rateCheck.retryAfterSec || 300} seconds.`,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rateCheck.retryAfterSec || 300) },
        }
      );
    }

    // 2. Verify superadmin / admin credentials against MySQL
    const result = await syncSuperadminToBetterAuth(cleanUsername, password);

    if (!result.success || !result.user) {
      // Record failed audit log
      try {
        const { logAdminActivity } = await import('@/lib/audit-logger');
        await logAdminActivity({
          req: request,
          adminUsername: cleanUsername,
          actionType: 'AUTH_LOGIN',
          targetResource: 'portal:auth',
          status: 'FAILED',
          details: { reason: result.error || 'Invalid credentials' },
        });
      } catch {}

      return NextResponse.json(
        { success: false, error: 'Invalid username or password.' },
        { status: 401 }
      );
    }

    // Reset rate limit on successful credentials
    await resetRateLimit(rateLimitKey);

    const user = result.user;
    const sessionRole = user.role === 'superadmin' ? 'superadmin' : 'admin';

    // 3. Prepare cryptographic session payload
    const sessionData = {
      id: user.id,
      username: user.username,
      role: sessionRole as 'superadmin' | 'admin',
      tenantId: user.tenant_id || 0,
      tenantCode: user.tenant_code || (sessionRole === 'superadmin' ? 'MASTER' : 'UNKNOWN'),
      campusName: user.campus_name || 'ASOC Central Management',
      databaseName: user.database_name || '-',
      redisPrefix: user.redis_prefix || 'asoc_master',
    };

    // 4. Generate Cryptographically Signed Token (HMAC-SHA256)
    const signedToken = await signSessionPayload(sessionData);

    const response = NextResponse.json({
      success: true,
      message: `${sessionRole === 'superadmin' ? 'Superadmin' : 'Admin'} login successful.`,
      user: sessionData,
    });

    // 5. Set HttpOnly, Secure, SameSite=Lax signed session cookie
    const cookieOpts = getCookieOptions(request);
    response.cookies.set(SESSION_COOKIE_NAME, signedToken, cookieOpts);

    // 6. Set companion safe non-sensitive cookie for client UI hydration
    const clientOpts = getClientCookieOptions(request);
    response.cookies.set(
      CLIENT_USER_COOKIE_NAME,
      encodeURIComponent(
        JSON.stringify({
          username: sessionData.username,
          role: sessionData.role,
          campusName: sessionData.campusName,
          tenantCode: sessionData.tenantCode,
        })
      ),
      clientOpts
    );

    // Clean up any legacy untrusted cookies
    response.cookies.delete('asoc_admin_token');
    response.cookies.delete('auth_session');

    // 7. Record success audit log
    try {
      const { logAdminActivity } = await import('@/lib/audit-logger');
      await logAdminActivity({
        req: request,
        adminId: user.id,
        adminUsername: user.username,
        actionType: 'AUTH_LOGIN',
        targetResource: 'portal:auth',
        status: 'SUCCESS',
      });
    } catch {}

    return response;
  } catch (error: any) {
    console.error('Superadmin Login API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Authentication service temporarily unavailable.' },
      { status: 500 }
    );
  }
}
