import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getVmResourceMetrics, getDatabaseLatencyMetrics } from '@/lib/resource-stats';
import { auditBackgroundServices, getRealRunningServices } from '@/lib/services';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(_request: NextRequest) {
  try {
    const [metrics, servicesAudit, realServices, databaseLatencies] = await Promise.all([
      getVmResourceMetrics(),
      auditBackgroundServices().catch(() => ({ services: [], systemHealth: 'HEALTHY' as const })),
      getRealRunningServices().catch(() => []),
      getDatabaseLatencyMetrics().catch((err) => {
        console.warn('Database latency metric error:', err);
        return null;
      }),
    ]);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      vmHost: metrics.host,
      vmOverall: {
        cpuUsagePercent: metrics.cpuUsagePercent,
        ramUsedFormatted: metrics.ramUsedFormatted,
        ramTotalFormatted: metrics.ramTotalFormatted,
        ramUsagePercent: metrics.ramUsagePercent,
        diskUsedFormatted: metrics.diskUsedFormatted,
        diskTotalFormatted: metrics.diskTotalFormatted,
        diskUsagePercent: metrics.diskUsagePercent,
        avgUtilization: metrics.avgUtilization,
      },
      components: metrics.services,
      runningServices: realServices.length > 0 ? realServices : servicesAudit.services,
      databaseLatencies,
    });
  } catch (err: any) {
    console.error('API /api/resource-usage GET Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to load VM resource usage' },
      { status: 500 }
    );
  }
}
