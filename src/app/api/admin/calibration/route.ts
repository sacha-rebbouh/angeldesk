import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getCalibrationMetrics } from '@/services/fact-store/calibration';

export async function GET() {
  try {
    await requireAdmin();

    const metrics = await getCalibrationMetrics();

    return NextResponse.json({ data: metrics });
  } catch (error) {
    console.error('Error fetching calibration metrics:', error);
    return NextResponse.json({ error: 'Failed to fetch calibration metrics' }, { status: 500 });
  }
}
