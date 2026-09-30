import { NextResponse } from 'next/server';
import type { SessionUser } from './session-core';

/**
 * Serializes SessionUser for client-facing auth endpoints (/api/auth/me, /api/auth/login).
 * Strictly suppresses internal database names, Redis prefixes, and storage metadata (ASOC-F3).
 */
export interface PublicUserDto {
  id: number | string;
  username: string;
  role: 'superadmin' | 'admin';
  tenantId: number;
  tenantCode: string;
  campusName: string;
}

export function serializeSessionUser(user: SessionUser): PublicUserDto {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    tenantId: user.tenantId,
    tenantCode: user.tenantCode,
    campusName: user.campusName,
  };
}

/**
 * Serializes user items for user management endpoints (/api/users, /api/users/[id]).
 * Explicit allowlist: strictly omits database_name, redis_prefix, password_hash, salt.
 */
export interface PublicUserItemDto {
  id: number | string;
  tenant_id: number;
  username: string;
  role: string;
  created_at: string | Date;
  tenant_code?: string;
  campus_name?: string;
  tenant_is_active?: number | boolean;
}

export function serializeUserItem(u: any): PublicUserItemDto {
  return {
    id: u.id,
    tenant_id: u.tenant_id ?? u.tenantId ?? 0,
    username: u.username || u.name || '',
    role: u.role || 'user',
    created_at: u.created_at || u.createdAt || new Date().toISOString(),
    tenant_code: u.tenant_code || u.tenantCode || undefined,
    campus_name: u.campus_name || u.campusName || undefined,
    tenant_is_active: u.tenant_is_active ?? u.is_active ?? 1,
  };
}

/**
 * Standardized safe error handler for API routes.
 * Logs full technical details server-side, but returns clean, non-leaking generic error
 * messages to the client on 500 errors to prevent CWE-209 information disclosure.
 */
export function safeErrorResponse(
  error: any,
  fallbackMessage: string = 'Internal server error occurred.',
  status: number = 500
): NextResponse {
  // Always log full error server-side for observability
  console.error(`[API Error - ${status}]:`, error);

  const isProd = process.env.NODE_ENV === 'production';

  // For 500 server errors in production, suppress stack traces, DB strings, and internal paths
  if (status >= 500 && isProd) {
    return NextResponse.json(
      {
        success: false,
        error: fallbackMessage || 'An unexpected internal error occurred. Please contact administrator.',
      },
      { status }
    );
  }

  // Sanitize message from sensitive leak patterns (passwords, connection URIs, filesystem paths)
  let rawMsg = error instanceof Error ? error.message : String(error || fallbackMessage);
  
  // Strip potential database connection strings or passwords
  rawMsg = rawMsg.replace(/mongodb:\/\/[^@]+@/gi, 'mongodb://***:***@');
  rawMsg = rawMsg.replace(/mysql:\/\/[^@]+@/gi, 'mysql://***:***@');
  rawMsg = rawMsg.replace(/password=[^\s;&]+/gi, 'password=***');
  rawMsg = rawMsg.replace(/\/home\/[^\s:]+/gi, '[path]');
  rawMsg = rawMsg.replace(/\/mnt\/[^\s:]+/gi, '[path]');

  return NextResponse.json(
    {
      success: false,
      error: rawMsg || fallbackMessage,
    },
    { status }
  );
}
