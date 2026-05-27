/**
 * POST /api/predict
 * Runs the daily prediction engine to select top 3 NSE stocks
 *
 * This endpoint can be triggered via Vercel Cron Jobs by adding to vercel.json:
 * {
 *   "crons": [
 *     {
 *       "path": "/api/predict",
 *       "schedule": "30 10 * * 1-5"   // 10:30 AM UTC weekdays (4 PM IST)
 *     }
 *   ]
 * }
 */

import { NextResponse } from 'next/server';
import { runDailyPrediction } from '@/lib/services/predictor';

export async function POST() {
  try {
    console.log('Starting daily prediction run...');
    const predictions = await runDailyPrediction();

    return NextResponse.json({
      success: true,
      predictions,
      count: predictions.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Prediction error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during prediction',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { message: 'Use POST to trigger predictions' },
    { status: 405 }
  );
}
