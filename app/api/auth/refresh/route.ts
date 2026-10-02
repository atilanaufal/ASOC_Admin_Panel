import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  CLIENT_USER_COOKIE_NAME,
  getSessionUser,
  signSessionPayload,
  getCookieOptions,
  getClientCookieOptions,
} from '@/lib/session';
import { serializeSessionUser, safeErrorResponse } from '@/lib/api-response';

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Invalid or expired session.' },
        { status: 401 }
      );
    }

    // Generate refreshed token with new 15-minute sliding window
    const refreshedToken = await signSessionPayload(user);
    const cookieOpts = getCookieOptions(request);
    const clientOpts = getClientCookieOptions(request);

    const response = NextResponse.json({
      success: true,
      user: serializeSessionUser(user),
    });

    response.cookies.set(SESSION_COOKIE_NAME, refreshedToken, cookieOpts);
    response.cookies.set(
      CLIENT_USER_COOKIE_NAME,
      encodeURIComponent(
        JSON.stringify({
          username: user.username,
          role: user.role,
          campusName: user.campusName,
          tenantCode: user.tenantCode,
        })
      ),
      clientOpts
    );

    return response;
  } catch (error: any) {
    return safeErrorResponse(error, 'Failed to refresh session.', 500);
  }
}
