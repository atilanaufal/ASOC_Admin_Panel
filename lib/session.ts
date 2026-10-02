import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  CLIENT_USER_COOKIE_NAME,
  MAX_SESSION_IDLE_MS,
  MAX_SESSION_ABSOLUTE_MS,
  SessionUser,
  getSessionSecret,
  signSessionPayload,
  verifySessionToken,
  getCookieOptions,
  getClientCookieOptions,
} from './session-core';
import {
  createAdminServerSession,
  getAdminServerSession,
  touchAdminServerSession,
  deleteAdminServerSession,
} from './admin-session-store';

export {
  SESSION_COOKIE_NAME,
  CLIENT_USER_COOKIE_NAME,
  MAX_SESSION_IDLE_MS,
  MAX_SESSION_ABSOLUTE_MS,
  getSessionSecret,
  signSessionPayload,
  verifySessionToken,
  getCookieOptions,
  getClientCookieOptions,
  createAdminServerSession,
  getAdminServerSession,
  touchAdminServerSession,
  deleteAdminServerSession,
};
export type { SessionUser };

/**
 * Revokes a session ID in Redis and server session store.
 */
export async function revokeSession(sessionId: string, expiresAt: number): Promise<void> {
  try {
    await deleteAdminServerSession(sessionId);
    const { getActiveRedisClient } = await import('./redis');
    const redis = await getActiveRedisClient();
    if (redis) {
      const ttlSec = Math.max(Math.ceil((expiresAt - Date.now()) / 1000), 60);
      await redis.set(`session:revoked:${sessionId}`, '1', 'EX', ttlSec);
    }
  } catch (err: any) {
    console.warn('Could not register session revocation in Redis:', err.message);
  }
}

/**
 * Extracts and verifies the current session user from an HTTP request.
 * - Cryptographically verifies HMAC token.
 * - Enforces server-side session registry liveness (Redis).
 * - Enforces 30-min idle timeout and 12-hour absolute ceiling.
 * - Enforces role is authoritative admin/superadmin.
 */
export async function getSessionUser(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = await verifySessionToken(token);
  if (!user) return null;

  // Check Redis revocation list
  try {
    const { getActiveRedisClient } = await import('./redis');
    const redis = await getActiveRedisClient();
    if (redis) {
      const isRevoked = await redis.get(`session:revoked:${user.sessionId}`);
      if (isRevoked) return null;
    }
  } catch {}

  // Check authoritative server-side session store
  const serverSession = await getAdminServerSession(user.sessionId);
  if (!serverSession) {
    // Session expired or revoked in server-side registry
    return null;
  }

  // Refresh server-side session activity timestamp
  touchAdminServerSession(user.sessionId).catch(() => {});

  // Server-side authoritative role must be admin or superadmin
  if (serverSession.role !== 'superadmin' && serverSession.role !== 'admin') {
    return null;
  }

  return {
    ...user,
    role: serverSession.role,
    tenantId: serverSession.tenantId,
    tenantCode: serverSession.tenantCode,
    campusName: serverSession.campusName,
    expiresAt: serverSession.expiresAt || user.expiresAt,
  };
}

/**
 * Guard: Enforces authenticated session.
 */
export async function requireSession(request: NextRequest): Promise<{ user: SessionUser; errorResponse?: never } | { user?: never; errorResponse: NextResponse }> {
  const user = await getSessionUser(request);
  if (!user) {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: 'Unauthorized. Invalid, tampered, or expired session. Please sign in again.' },
        { status: 401 }
      ),
    };
  }
  return { user };
}

/**
 * Guard: Enforces Superadmin role.
 */
export async function requireSuperadmin(request: NextRequest): Promise<{ user: SessionUser; errorResponse?: never } | { user?: never; errorResponse: NextResponse }> {
  const auth = await requireSession(request);
  if (auth.errorResponse) return auth;

  if (auth.user.role !== 'superadmin') {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: 'Forbidden. This action requires platform Superadmin privileges.' },
        { status: 403 }
      ),
    };
  }
  return { user: auth.user };
}

/**
 * Guard: Enforces Tenant Scope (BOLA & IDOR protection).
 */
export async function requireTenantScope(
  request: NextRequest,
  targetTenantId?: number | string | null,
  targetTenantCode?: string | null
): Promise<{ user: SessionUser; errorResponse?: never } | { user?: never; errorResponse: NextResponse }> {
  const auth = await requireSession(request);
  if (auth.errorResponse) return auth;

  const { user } = auth;
  if (user.role === 'superadmin') {
    return { user };
  }

  // Tenant Admin boundary checks
  if (targetTenantId !== undefined && targetTenantId !== null) {
    const numericTarget = Number(targetTenantId);
    if (!isNaN(numericTarget) && numericTarget > 0 && numericTarget !== user.tenantId) {
      return {
        errorResponse: NextResponse.json(
          {
            success: false,
            error: `Forbidden. Cross-tenant access violation: you are not authorized to access Tenant ID ${targetTenantId}.`,
          },
          { status: 403 }
        ),
      };
    }
  }

  if (targetTenantCode) {
    const cleanTarget = targetTenantCode.trim().toUpperCase();
    const cleanUserCode = (user.tenantCode || '').trim().toUpperCase();
    if (cleanTarget !== 'ALL' && cleanTarget !== cleanUserCode) {
      return {
        errorResponse: NextResponse.json(
          {
            success: false,
            error: `Forbidden. Cross-tenant access violation: you are not authorized to access Tenant '${targetTenantCode}'.`,
          },
          { status: 403 }
        ),
      };
    }
  }

  return { user };
}
