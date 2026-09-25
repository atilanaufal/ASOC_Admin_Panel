import { NextRequest, NextResponse } from 'next/server';
import { flushTenantRedisCache } from '@/lib/housekeeping';
import { logAdminActivity } from '@/lib/audit-logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantCode, scope, autoRepump } = body;

    if (!tenantCode) {
      return NextResponse.json(
        { success: false, error: 'Tenant code (tenantCode) is required.' },
        { status: 400 }
      );
    }

    const result = await flushTenantRedisCache({
      tenantCode,
      scope: scope || 'all',
      autoRepump: Boolean(autoRepump),
    });

    // Record audit log
    await logAdminActivity({
      req: request,
      actionType: 'REDIS_CACHE_FLUSH',
      targetResource: `redis:${result.databaseName}:${result.scope}`,
      status: 'SUCCESS',
      details: {
        tenantCode: result.tenantCode,
        campusName: result.campusName,
        scope: result.scope,
        keysDeleted: result.keysDeleted,
        autoRepump: result.autoRepumpExecuted,
        repumpedCount: result.repumpedCount,
        durationMs: result.executionDurationMs,
      },
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('API /api/housekeeping/cache POST Error:', err);

    await logAdminActivity({
      req: request,
      actionType: 'REDIS_CACHE_FLUSH',
      targetResource: 'redis:error',
      status: 'FAILED',
      details: { error: err.message },
    });

    return NextResponse.json(
      { success: false, error: err.message || 'Failed to clear Redis cache' },
      { status: 500 }
    );
  }
}
