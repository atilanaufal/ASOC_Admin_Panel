import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  CLIENT_USER_COOKIE_NAME,
  getSessionUser,
  revokeSession,
} from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    // 1. Invalidate session on server-side if session is active
    const user = await getSessionUser(request);
    if (user && user.sessionId) {
      await revokeSession(user.sessionId, user.expiresAt);
    }
  } catch (err: any) {
    console.warn('Session revocation warning:', err.message);
  }

  const response = NextResponse.json({
    success: true,
    message: 'Logout successful.',
  });

  // 2. Delete all admin panel cookies
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete(CLIENT_USER_COOKIE_NAME);
  response.cookies.delete('asoc_admin_token');
  response.cookies.delete('auth_session');
  response.cookies.delete('better-auth.session_token');
  response.cookies.delete('__Secure-better-auth.session_token');

  return response;
}
