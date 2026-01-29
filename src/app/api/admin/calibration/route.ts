import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getCalibrationMetrics } from '@/services/fact-store/calibration';

export async function GET() {
  try {
    const user = await requireAuth();

    if (user.subscriptionStatus !== 'ENTERPRISE' && user.subscriptionStatus !== 'PRO') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const metrics = await getCalibrationMetrics();

    return NextResponse.json({ data: metrics });
  } catch (error) {
    console.error('Error fetching calibration metrics:', error);
    return NextResponse.json({ error: 'Failed to fetch calibration metrics' }, { status: 500 });
  }
}
