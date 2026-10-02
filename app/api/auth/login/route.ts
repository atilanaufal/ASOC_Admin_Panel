import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { syncSuperadminToBetterAuth } from '@/lib/auth';
import {
  signSessionPayload,
  SESSION_COOKIE_NAME,
  CLIENT_USER_COOKIE_NAME,
  MAX_SESSION_IDLE_MS,
  MAX_SESSION_ABSOLUTE_MS,
  createAdminServerSession,
} from '@/lib/session';
import { checkDualLoginRateLimit, resetLoginRateLimit } from '@/lib/rate-limiter';
import { extractClientIp } from '@/lib/audit-logger';

export async function POST(request: NextRequest) {
  const clientIp = extractClientIp(request);

  try {
    // 1. Safe JSON Body Parsing (400 on malformed input)
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Format permintaan tidak valid.' },
        { status: 400 }
      );
    }

    const { username, password } = body || {};

    // 2. Strict Type and Presence Validation
    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      !username.trim() ||
      !password
    ) {
      return NextResponse.json(
        { success: false, error: 'Username dan password wajib diisi.' },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim();

    // 3. Length Capping (Anti CPU DoS on hashing algorithms)
    if (cleanUsername.length > 128 || password.length > 256) {
      return NextResponse.json(
        { success: false, error: 'Panjang input melebihi batas maksimum.' },
        { status: 400 }
      );
    }

    // 4. Dual-Bucket Rate Limiting (IP bucket 30/15m, user hash bucket 10/15m)
    const rateCheck = await checkDualLoginRateLimit(clientIp, cleanUsername, {
      ipLimit: 30,
      userLimit: 10,
      windowSeconds: 15 * 60,
    });

    if (!rateCheck.allowed) {
      const retryAfter = rateCheck.retryAfterSeconds || 900;
      return NextResponse.json(
        {
          success: false,
          error: `Terlalu banyak percobaan login yang gagal. Akun/IP dibatasi sementara demi keamanan. Silakan coba lagi dalam ${retryAfter} detik.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
          },
        }
      );
    }

    // 5. Verify superadmin / admin credentials against MySQL
    // Non-admin roles and nonexistent users are rejected with identical uniform 401
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
          details: { reason: 'Invalid credentials or unauthorized role' },
        });
      } catch {}

      return NextResponse.json(
        { success: false, error: 'Username atau password tidak valid.' },
        { status: 401 }
      );
    }

    // Reset user rate limit bucket on successful credentials
    await resetLoginRateLimit(cleanUsername);

    const user = result.user;
    const sessionRole = (user.role === 'superadmin' ? 'superadmin' : 'admin') as 'superadmin' | 'admin';

    const now = Date.now();
    const sessionId = crypto.randomUUID();
    const expiresAt = now + MAX_SESSION_ABSOLUTE_MS; // 12-hour absolute lifetime ceiling

    // 6. Create authoritative server-side session in Redis (30-min idle TTL, 12-hr absolute ceiling)
    await createAdminServerSession(
      sessionId,
      {
        sessionId,
        userId: user.id,
        username: user.username,
        role: sessionRole,
        tenantId: user.tenant_id || 0,
        tenantCode: user.tenant_code || (sessionRole === 'superadmin' ? 'MASTER' : 'UNKNOWN'),
        campusName: user.campus_name || 'ASOC Central Management',
        createdAt: now,
        lastActive: now,
        expiresAt: expiresAt,
      },
      Math.floor(MAX_SESSION_IDLE_MS / 1000)
    );

    // 7. Generate Cryptographically Signed Token (HMAC-SHA256)
    const sessionData = {
      id: user.id,
      username: user.username,
      role: sessionRole,
      tenantId: user.tenant_id || 0,
      tenantCode: user.tenant_code || (sessionRole === 'superadmin' ? 'MASTER' : 'UNKNOWN'),
      campusName: user.campus_name || 'ASOC Central Management',
      issuedAt: now,
      lastActive: now,
      expiresAt: expiresAt,
      sessionId,
    };

    const signedToken = await signSessionPayload(sessionData);

    const { serializeSessionUser } = await import('@/lib/api-response');

    const response = NextResponse.json({
      success: true,
      message: `${sessionRole === 'superadmin' ? 'Superadmin' : 'Admin'} login successful.`,
      user: serializeSessionUser(sessionData as any),
    });

    // 8. Deterministic Secure flag in production (never spoofable)
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOpts = {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      maxAge: 1800, // 30 minutes
    };
    response.cookies.set(SESSION_COOKIE_NAME, signedToken, cookieOpts);

    // Companion safe non-sensitive cookie for client UI display
    const clientOpts = {
      path: '/',
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax' as const,
      maxAge: 1800,
    };
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

    // 9. Security headers
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('Pragma', 'no-cache');

    // 10. Record success audit log
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
    const { safeErrorResponse } = await import('@/lib/api-response');
    return safeErrorResponse(error, 'Authentication service temporarily unavailable.', 500);
  }
}
