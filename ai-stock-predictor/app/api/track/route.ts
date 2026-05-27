/**
 * POST /api/track
 * Updates daily tracking for all active predictions
 *
 * This endpoint can be triggered via Vercel Cron Jobs by adding to vercel.json:
 * {
 *   "crons": [
 *     {
 *       "path": "/api/track",
 *       "schedule": "0 11 * * 1-5"   // 11:00 AM UTC weekdays (4:30 PM IST after market close)
 *     }
 *   ]
 * }
 */

import { NextResponse } from 'next/server';
import { updateDailyTracking } from '@/lib/services/tracker';

export async function POST() {
  try {
    console.log('Starting daily tracking update...');
    const result = await updateDailyTracking();

    return NextResponse.json({
      success: true,
      updated: result.updatedCount,
      evaluations: result.evaluatedCount,
      expired: result.expiredCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Tracking error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during tracking',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { message: 'Use POST to trigger tracking update' },
    { status: 405 }
  );
}
