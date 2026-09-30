import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  CLIENT_USER_COOKIE_NAME,
  MAX_SESSION_IDLE_MS,
  SessionUser,
  getSessionSecret,
  signSessionPayload,
  verifySessionToken,
  getCookieOptions,
  getClientCookieOptions,
} from './session-core';

export {
  SESSION_COOKIE_NAME,
  CLIENT_USER_COOKIE_NAME,
  MAX_SESSION_IDLE_MS,
  getSessionSecret,
  signSessionPayload,
  verifySessionToken,
  getCookieOptions,
  getClientCookieOptions,
};
export type { SessionUser };

/**
 * Revokes a session ID in Redis.
 */
export async function revokeSession(sessionId: string, expiresAt: number): Promise<void> {
  try {
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
 * Also checks Redis revocation.
 */
export async function getSessionUser(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = await verifySessionToken(token);
  if (!user) return null;

  // Check Redis revocation
  try {
    const { getActiveRedisClient } = await import('./redis');
    const redis = await getActiveRedisClient();
    if (redis) {
      const isRevoked = await redis.get(`session:revoked:${user.sessionId}`);
      if (isRevoked) return null;
    }
  } catch {}

  return user;
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
