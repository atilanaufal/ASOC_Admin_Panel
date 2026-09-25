import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const MAX_SESSION_IDLE_MS = 30 * 60 * 1000; // 30 minutes inactivity timeout

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Retrieve origin from reverse proxy headers
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '10.20.100.86:3001';
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const baseUrl = `${proto}://${host}`;

  // Dedicated Admin Panel cookies to prevent collision with Tenant Portal (port 3000)
  const adminSessionCookie =
    request.cookies.get('asoc_admin_session')?.value ||
    request.cookies.get('auth_session')?.value;
  const adminToken =
    request.cookies.get('asoc_admin_token')?.value ||
    request.cookies.get('better-auth.session_token')?.value ||
    request.cookies.get('__Secure-better-auth.session_token')?.value;

  let isAdmin = false;
  let hasValidSession = false;
  let sessionExpired = false;
  let parsedUser: any = null;

  if (adminSessionCookie) {
    try {
      const decoded = decodeURIComponent(adminSessionCookie);
      parsedUser = JSON.parse(decoded);
      const uRole = String(parsedUser?.role || '').trim().toLowerCase();
      if (parsedUser && (uRole === 'admin' || uRole === 'superadmin')) {
        const now = Date.now();
        const lastActive = parsedUser.lastActive || parsedUser.loginTime || 0;
        if (now - lastActive > MAX_SESSION_IDLE_MS) {
          sessionExpired = true;
          hasValidSession = false;
          isAdmin = false;
        } else {
          isAdmin = true;
          hasValidSession = true;
        }
      } else {
        // Not an admin/superadmin (e.g. tenant session from port 3000)
        hasValidSession = false;
        isAdmin = false;
        parsedUser = null;
      }
    } catch {
      hasValidSession = false;
    }
  } else if (adminToken) {
    hasValidSession = true;
    isAdmin = true;
  }

  // 1. If accessing login route
  if (pathname === '/login') {
    const errorParam = request.nextUrl.searchParams.get('error');
    if (errorParam) {
      const res = NextResponse.next();
      res.cookies.delete('asoc_admin_session');
      res.cookies.delete('asoc_admin_token');
      res.cookies.delete('auth_session');
      return res;
    }

    if (hasValidSession && isAdmin) {
      return NextResponse.redirect(new URL('/database-status', baseUrl));
    }
    const res = NextResponse.next();
    if (adminSessionCookie && !isAdmin) {
      res.cookies.delete('asoc_admin_session');
    }
    return res;
  }

  // 2. Protect admin routes & API
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/api/auth');
  const isPublicAsset =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(png|jpg|jpeg|gif|webp)$/);

  if (!isAuthRoute && !isPublicAsset) {
    if (pathname.startsWith('/api/')) {
      if (!hasValidSession || !isAdmin) {
        return NextResponse.json(
          {
            success: false,
            error: sessionExpired
              ? 'Session expired. Your session has ended due to inactivity.'
              : 'Unauthorized. Access denied.',
            sessionExpired,
          },
          { status: 401 }
        );
      }

      const apiRes = NextResponse.next();
      if (parsedUser) {
        try {
          parsedUser.lastActive = Date.now();
          const isSecure = process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false' && (request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https'));
          apiRes.cookies.set('asoc_admin_session', encodeURIComponent(JSON.stringify(parsedUser)), {
            path: '/',
            httpOnly: false,
            secure: isSecure,
            sameSite: 'lax',
            maxAge: 1800,
          });
        } catch {}
      }
      return apiRes;
    }

    if (!hasValidSession || !isAdmin) {
      const loginUrl = new URL('/login', baseUrl);
      if (sessionExpired) {
        loginUrl.searchParams.set('error', 'session_expired');
      } else {
        loginUrl.searchParams.set('from', pathname);
      }

      const res = NextResponse.redirect(loginUrl);
      res.cookies.delete('asoc_admin_session');
      res.cookies.delete('asoc_admin_token');
      return res;
    }

    if (parsedUser) {
      try {
        parsedUser.lastActive = Date.now();
        const isSecure = process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false' && (request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https'));
        const nextRes = NextResponse.next();
        nextRes.cookies.set('asoc_admin_session', encodeURIComponent(JSON.stringify(parsedUser)), {
          path: '/',
          httpOnly: false,
          secure: isSecure,
          sameSite: 'lax',
          maxAge: 1800,
        });
        if (adminToken) {
          nextRes.cookies.set('asoc_admin_token', adminToken, {
            path: '/',
            httpOnly: false,
            secure: isSecure,
            sameSite: 'lax',
            maxAge: 1800,
          });
        }
        return nextRes;
      } catch {}
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
