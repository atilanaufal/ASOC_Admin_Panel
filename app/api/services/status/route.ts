import { NextRequest, NextResponse } from 'next/server';
import { auditBackgroundServices } from '@/lib/services';
import { requireSession } from '@/lib/session';

export async function GET(_request: NextRequest) {
  try {
    const auth = await requireSession(_request);
    if (auth.errorResponse) return auth.errorResponse;

    const result = await auditBackgroundServices();
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('API /api/services/status GET Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to load background services status' },
      { status: 500 }
    );
  }
}
