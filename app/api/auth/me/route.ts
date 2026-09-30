import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { serializeSessionUser, safeErrorResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json(
        { authenticated: false, user: null, error: 'Unauthorized. Invalid or expired session.' },
        { status: 401 }
      );
    }

    if (user.role !== 'superadmin' && user.role !== 'admin') {
      return NextResponse.json(
        { authenticated: false, user: null, error: 'Unauthorized role.' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      user: serializeSessionUser(user),
    });
  } catch (error: any) {
    return safeErrorResponse(error, 'Authentication service temporarily unavailable.', 500);
  }
}
