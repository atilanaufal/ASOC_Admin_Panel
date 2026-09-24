import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const MAX_SESSION_IDLE_MS = 30 * 60 * 1000; // 30 menit batas waktu inaktivitas

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Ambil origin asli dari header reverse proxy
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '10.20.100.86:3001';
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const baseUrl = `${proto}://${host}`;

  const authSessionCookie = request.cookies.get('auth_session')?.value;
  const betterAuthToken =
    request.cookies.get('better-auth.session_token')?.value ||
    request.cookies.get('__Secure-better-auth.session_token')?.value;

  let isAdmin = false;
  let hasValidSession = false;
  let sessionExpired = false;
  let parsedUser: any = null;

  if (authSessionCookie) {
    try {
      const decoded = decodeURIComponent(authSessionCookie);
      parsedUser = JSON.parse(decoded);
      if (parsedUser && (parsedUser.role === 'admin' || parsedUser.role === 'superadmin')) {
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
      }
    } catch {
      hasValidSession = false;
    }
  } else if (betterAuthToken) {
    hasValidSession = true;
    isAdmin = true;
  }

  // 1. Jika rute login
  if (pathname === '/login') {
    if (hasValidSession && isAdmin) {
      return NextResponse.redirect(new URL('/database-status', baseUrl));
    }
    return NextResponse.next();
  }

  // 2. Proteksi rute admin & api
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
              ? 'Session expired. Sesi Anda telah berakhir (30 menit inaktivitas).'
              : 'Unauthorized. Akses ditolak.',
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
          apiRes.cookies.set('auth_session', encodeURIComponent(JSON.stringify(parsedUser)), {
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
      } else if (authSessionCookie && !isAdmin) {
        loginUrl.searchParams.set('error', 'tenant_forbidden');
      } else {
        loginUrl.searchParams.set('from', pathname);
      }

      const res = NextResponse.redirect(loginUrl);
      res.cookies.delete('auth_session');
      res.cookies.delete('better-auth.session_token');
      return res;
    }

    if (parsedUser) {
      try {
        parsedUser.lastActive = Date.now();
        const isSecure = process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false' && (request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https'));
        const nextRes = NextResponse.next();
        nextRes.cookies.set('auth_session', encodeURIComponent(JSON.stringify(parsedUser)), {
          path: '/',
          httpOnly: false,
          secure: isSecure,
          sameSite: 'lax',
          maxAge: 1800,
        });
        if (betterAuthToken) {
          nextRes.cookies.set('better-auth.session_token', betterAuthToken, {
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
