import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/session';

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
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        tenantId: user.tenantId,
        tenantCode: user.tenantCode,
        campusName: user.campusName,
        databaseName: user.databaseName,
        redisPrefix: user.redisPrefix,
      },
    });
  } catch {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }
}
