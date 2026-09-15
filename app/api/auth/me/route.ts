import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const authSession = request.cookies.get('auth_session')?.value;
    if (!authSession) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    const decoded = decodeURIComponent(authSession);
    const user = JSON.parse(decoded);

    if (user.role !== 'superadmin' && user.role !== 'admin') {
      return NextResponse.json({ authenticated: false, user: null, error: 'Bukan Superadmin' }, { status: 403 });
    }

    return NextResponse.json({
      authenticated: true,
      user,
    });
  } catch {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }
}
