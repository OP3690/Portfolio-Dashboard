/**
 * POST /api/recalibrate
 * Recalibrates model weights based on historical prediction performance
 */

import { NextResponse } from 'next/server';
import { recalibrateWeights } from '@/lib/services/recalibrator';

export async function POST() {
  try {
    console.log('Starting model recalibration...');
    const result = await recalibrateWeights();

    return NextResponse.json({
      success: true,
      newWeights: result.newWeights,
      version: result.version,
      performanceSummary: result.performance,
      weightChanges: result.weightChanges,
      message: result.message,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Recalibration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during recalibration',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { message: 'Use POST to trigger recalibration' },
    { status: 405 }
  );
}
