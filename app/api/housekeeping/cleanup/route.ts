import { NextRequest, NextResponse } from 'next/server';
import { cleanupMongoHistoricData } from '@/lib/housekeeping';
import { logAdminActivity } from '@/lib/audit-logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantCode, collection, olderThanDays, dryRun, confirmKeyword } = body;

    if (!tenantCode) {
      return NextResponse.json(
        { success: false, error: 'Kode Kampus (tenantCode) wajib diisi.' },
        { status: 400 }
      );
    }

    const isDryRun = dryRun === undefined ? true : Boolean(dryRun);

    const result = await cleanupMongoHistoricData({
      tenantCode,
      collection: collection || 'all',
      olderThanDays: Number(olderThanDays) || 90,
      dryRun: isDryRun,
      confirmKeyword,
    });

    // If actual purge was executed, log audit trail
    if (!isDryRun) {
      await logAdminActivity({
        req: request,
        actionType: 'MONGO_DATA_CLEANUP',
        targetResource: `mongodb:${result.databaseName}:${result.collection}`,
        status: 'SUCCESS',
        details: {
          tenantCode: result.tenantCode,
          campusName: result.campusName,
          collection: result.collection,
          cutoffDate: result.cutoffDate,
          deletedCount: result.deletedDocumentsCount,
          freedBytes: result.estimatedStorageFreedBytes,
          freedFormatted: result.estimatedStorageFreedFormatted,
          durationMs: result.executionDurationMs,
        },
      });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('API /api/housekeeping/cleanup POST Error:', err);

    await logAdminActivity({
      req: request,
      actionType: 'MONGO_DATA_CLEANUP',
      targetResource: 'mongodb:cleanup:error',
      status: 'FAILED',
      details: { error: err.message },
    });

    return NextResponse.json(
      { success: false, error: err.message || 'Gagal memproses pembersihan data MongoDB' },
      { status: 500 }
    );
  }
}
