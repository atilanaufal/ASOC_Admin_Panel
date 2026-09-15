import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Read session cookie
  const authSessionCookie = request.cookies.get('auth_session')?.value;
  const betterAuthToken =
    request.cookies.get('better-auth.session_token')?.value ||
    request.cookies.get('__Secure-better-auth.session_token')?.value;

  let isSuperadmin = false;
  let hasValidSession = false;

  if (authSessionCookie) {
    try {
      const decoded = decodeURIComponent(authSessionCookie);
      const user = JSON.parse(decoded);
      if (user && (user.role === 'superadmin' || user.role === 'admin')) {
        isSuperadmin = true;
        hasValidSession = true;
      }
    } catch {
      hasValidSession = false;
    }
  } else if (betterAuthToken) {
    // If better auth token exists
    hasValidSession = true;
    isSuperadmin = true; // By default Better-Auth on this portal issues superadmin sessions
  }

  // 1. If user is at `/login`
  if (pathname === '/login') {
    if (hasValidSession && isSuperadmin) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // 2. Protect Admin UI Routes
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/api/auth');
  const isPublicAsset =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/);

  if (!isAuthRoute && !isPublicAsset) {
    // API route protection
    if (pathname.startsWith('/api/')) {
      if (!hasValidSession || !isSuperadmin) {
        return NextResponse.json(
          {
            success: false,
            error: 'Unauthorized. Akses ditolak. Hanya Superadmin yang diizinkan.',
          },
          { status: 401 }
        );
      }
      return NextResponse.next();
    }

    // Admin pages protection
    if (!hasValidSession || !isSuperadmin) {
      const loginUrl = new URL('/login', request.url);
      if (authSessionCookie && !isSuperadmin) {
        loginUrl.searchParams.set('error', 'tenant_forbidden');
      } else {
        loginUrl.searchParams.set('from', pathname);
      }
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
