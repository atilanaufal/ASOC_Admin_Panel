import { NextRequest, NextResponse } from 'next/server';
import { auditBackgroundServices } from '@/lib/services';

export async function GET(_request: NextRequest) {
  try {
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
