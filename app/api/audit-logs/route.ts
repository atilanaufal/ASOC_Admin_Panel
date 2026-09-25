import { NextRequest, NextResponse } from 'next/server';
import { queryAuditLogs } from '@/lib/audit-logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const search = searchParams.get('search') || '';
    const actionType = searchParams.get('actionType') || searchParams.get('action') || 'all';
    const status = searchParams.get('status') || 'all';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const format = searchParams.get('format') || 'json';

    // If CSV export is requested, fetch all matching records up to 1000
    const fetchLimit = format === 'csv' ? 1000 : limit;

    const data = await queryAuditLogs({
      page,
      limit: fetchLimit,
      search,
      actionType,
      status,
      startDate,
      endDate,
    });

    if (format === 'csv') {
      const csvHeader = 'ID,Timestamp,Admin,IP Address,Action Type,Target Resource,Status,Details\n';
      const csvRows = data.logs.map((log: any) => {
        const cleanTimestamp = `"${log.timestamp || ''}"`;
        const cleanAdmin = `"${log.adminUsername || ''}"`;
        const cleanIp = `"${log.ipAddress || ''}"`;
        const cleanAction = `"${log.actionType || ''}"`;
        const cleanTarget = `"${log.targetResource || ''}"`;
        const cleanStatus = `"${log.status || ''}"`;
        const cleanDetails = `"${JSON.stringify(log.details || {}).replace(/"/g, '""')}"`;
        return `${log.id},${cleanTimestamp},${cleanAdmin},${cleanIp},${cleanAction},${cleanTarget},${cleanStatus},${cleanDetails}`;
      });

      const csvContent = csvHeader + csvRows.join('\n');
      const filename = `admin-audit-logs-${new Date().toISOString().split('T')[0]}.csv`;

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...data,
    });
  } catch (err: any) {
    console.error('API /api/audit-logs GET Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to load audit history logs' },
      { status: 500 }
    );
  }
}
