export const SESSION_COOKIE_NAME = 'asoc_admin_session';
export const CLIENT_USER_COOKIE_NAME = 'asoc_admin_user';
export const MAX_SESSION_IDLE_MS = 30 * 60 * 1000; // 30 minutes inactivity timeout

export interface SessionUser {
  id: number | string;
  username: string;
  role: 'superadmin' | 'admin';
  tenantId: number;
  tenantCode: string;
  campusName: string;
  issuedAt: number;
  expiresAt: number;
  sessionId: string;
}

/**
 * Returns the cryptographic HMAC secret.
 * Enforces production safety.
 */
export function getSessionSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL SECURITY ERROR: BETTER_AUTH_SECRET or SESSION_SECRET must be set in production.');
    }
    return 'insecure-development-secret-key-32-chars-long!';
  }
  return secret;
}

/**
 * Web-Crypto based HMAC-SHA256 signature generator.
 * Fully compatible with Node.js and Next.js Edge Runtime.
 */
async function computeHmacSha256(payloadBase64: string, secretKey: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(payloadBase64));
  return Buffer.from(signature).toString('base64url');
}

/**
 * Signs a session payload into a cryptographically secured token.
 * Format: <payloadBase64url>.<signatureBase64url>
 */
export async function signSessionPayload(
  user: Omit<SessionUser, 'issuedAt' | 'expiresAt' | 'sessionId'> &
    Partial<Pick<SessionUser, 'issuedAt' | 'expiresAt' | 'sessionId'>>
): Promise<string> {
  const now = Date.now();
  const issuedAt = user.issuedAt || now;
  const expiresAt = user.expiresAt || (now + MAX_SESSION_IDLE_MS);
  const sessionId = user.sessionId || (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${now}-${Math.random()}`);

  const payload: SessionUser = {
    id: user.id,
    username: user.username,
    role: user.role === 'superadmin' ? 'superadmin' : 'admin',
    tenantId: Number(user.tenantId) || 0,
    tenantCode: user.tenantCode || (user.role === 'superadmin' ? 'MASTER' : 'UNKNOWN'),
    campusName: user.campusName || 'ASOC Management',
    issuedAt,
    expiresAt,
    sessionId,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = await computeHmacSha256(payloadBase64, getSessionSecret());
  return `${payloadBase64}.${signature}`;
}

/**
 * Verifies a token string using constant-time comparison and expiration check.
 * Edge-runtime safe (does not require Redis).
 */
export async function verifySessionToken(tokenString: string | undefined | null): Promise<SessionUser | null> {
  if (!tokenString || typeof tokenString !== 'string') return null;

  const parts = tokenString.split('.');
  if (parts.length !== 2) return null;

  const [payloadBase64, providedSig] = parts;
  if (!payloadBase64 || !providedSig) return null;

  try {
    const expectedSig = await computeHmacSha256(payloadBase64, getSessionSecret());
    
    // Constant-time comparison
    if (providedSig.length !== expectedSig.length) return null;
    let mismatch = 0;
    for (let i = 0; i < providedSig.length; i++) {
      mismatch |= providedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    }
    if (mismatch !== 0) return null;

    const jsonStr = Buffer.from(payloadBase64, 'base64url').toString('utf8');
    const payload: SessionUser = JSON.parse(jsonStr);

    if (!payload.id || !payload.username || !payload.role || !payload.expiresAt || !payload.sessionId) {
      return null;
    }

    const now = Date.now();
    if (now > payload.expiresAt) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Standard cookie configuration for HttpOnly session cookie.
 */
export function getCookieOptions(request?: any) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieSecureEnv = process.env.COOKIE_SECURE;
  
  let isSecure = isProd;
  if (cookieSecureEnv === 'true') isSecure = true;
  if (cookieSecureEnv === 'false') isSecure = false;

  return {
    path: '/',
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax' as const,
    maxAge: 1800, // 30 minutes
  };
}

/**
 * Standard cookie configuration for non-sensitive client UI user cookie.
 */
export function getClientCookieOptions(request?: any) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieSecureEnv = process.env.COOKIE_SECURE;
  
  let isSecure = isProd;
  if (cookieSecureEnv === 'true') isSecure = true;
  if (cookieSecureEnv === 'false') isSecure = false;

  return {
    path: '/',
    httpOnly: false, // Visible to JS for instant UI display
    secure: isSecure,
    sameSite: 'lax' as const,
    maxAge: 1800,
  };
}
