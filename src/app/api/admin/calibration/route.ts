import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getCalibrationMetrics } from '@/services/fact-store/calibration';
import { handleApiError } from "@/lib/api-error";

export async function GET() {
  try {
    await requireAdmin();

    const metrics = await getCalibrationMetrics();

    return NextResponse.json({ data: metrics });
  } catch (error) {
    return handleApiError(error, "fetch calibration metrics");
  }
}
