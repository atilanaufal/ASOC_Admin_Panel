import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  CLIENT_USER_COOKIE_NAME,
  verifySessionToken,
  signSessionPayload,
  getCookieOptions,
  getClientCookieOptions,
} from '@/lib/session-core';

function attachSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('X-DNS-Prefetch-Control', 'on');
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.headers.set('X-XSS-Protection', '1; mode=block');
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=()');
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  res.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests;"
  );
  return res;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Retrieve origin from reverse proxy headers
  const defaultHost = (process.env.HOSTNAME ? `${process.env.HOSTNAME}:${process.env.PORT || '3001'}` : null) || 'localhost:3001';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || defaultHost;
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const baseUrl = `${proto}://${host}`;

  // Dedicated Admin Panel cryptographically signed cookie
  const adminSessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  // Verify cryptographic signature (HMAC-SHA256)
  const sessionUser = await verifySessionToken(adminSessionCookie);
  const hasValidSession = Boolean(sessionUser);
  const isAdmin = Boolean(sessionUser && (sessionUser.role === 'superadmin' || sessionUser.role === 'admin'));

  // 1. If accessing login route
  if (pathname === '/login') {
    const errorParam = request.nextUrl.searchParams.get('error');
    if (errorParam) {
      const res = NextResponse.next();
      res.cookies.delete(SESSION_COOKIE_NAME);
      res.cookies.delete(CLIENT_USER_COOKIE_NAME);
      res.cookies.delete('asoc_admin_token');
      res.cookies.delete('auth_session');
      return attachSecurityHeaders(res);
    }

    if (hasValidSession && isAdmin) {
      return attachSecurityHeaders(NextResponse.redirect(new URL('/database-status', baseUrl)));
    }

    const res = NextResponse.next();
    if (adminSessionCookie && !hasValidSession) {
      res.cookies.delete(SESSION_COOKIE_NAME);
      res.cookies.delete(CLIENT_USER_COOKIE_NAME);
    }
    return attachSecurityHeaders(res);
  }

  // 2. Protect admin routes & API
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/api/auth');
  const isPublicAsset =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(png|jpg|jpeg|gif|webp)$/);

  if (!isAuthRoute && !isPublicAsset) {
    // API Route Protection
    if (pathname.startsWith('/api/')) {
      if (!hasValidSession || !isAdmin) {
        return attachSecurityHeaders(
          NextResponse.json(
            {
              success: false,
              error: 'Unauthorized. Invalid, tampered, or expired session. Access denied.',
            },
            { status: 401 }
          )
        );
      }

      // Slide session on active API usage
      const apiRes = NextResponse.next();
      try {
        const refreshedToken = await signSessionPayload(sessionUser!);
        const cookieOpts = getCookieOptions(request);
        apiRes.cookies.set(SESSION_COOKIE_NAME, refreshedToken, cookieOpts);
      } catch {}
      return attachSecurityHeaders(apiRes);
    }

    // Page Route Protection
    if (!hasValidSession || !isAdmin) {
      const loginUrl = new URL('/login', baseUrl);
      loginUrl.searchParams.set('error', 'unauthorized');
      loginUrl.searchParams.set('from', pathname);

      const res = NextResponse.redirect(loginUrl);
      res.cookies.delete(SESSION_COOKIE_NAME);
      res.cookies.delete(CLIENT_USER_COOKIE_NAME);
      res.cookies.delete('asoc_admin_token');
      res.cookies.delete('auth_session');
      return attachSecurityHeaders(res);
    }

    // Slide session on page navigation
    const nextRes = NextResponse.next();
    try {
      const refreshedToken = await signSessionPayload(sessionUser!);
      const cookieOpts = getCookieOptions(request);
      nextRes.cookies.set(SESSION_COOKIE_NAME, refreshedToken, cookieOpts);

      // Also refresh safe client cookie for UI display
      const clientOpts = getClientCookieOptions(request);
      nextRes.cookies.set(
        CLIENT_USER_COOKIE_NAME,
        encodeURIComponent(
          JSON.stringify({
            username: sessionUser!.username,
            role: sessionUser!.role,
            campusName: sessionUser!.campusName,
            tenantCode: sessionUser!.tenantCode,
          })
        ),
        clientOpts
      );
    } catch {}
    return attachSecurityHeaders(nextRes);
  }

  return attachSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
