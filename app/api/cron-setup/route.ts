import { NextRequest, NextResponse } from 'next/server';
import { setupDailyStockDataRefresh } from '@/lib/cronJobs';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// This endpoint initializes the cron job
// Call it once when the server starts or manually trigger it
export async function GET(request: NextRequest) {
  try {
    setupDailyStockDataRefresh();
    return NextResponse.json({
      success: true,
      message: 'Daily stock data refresh cron job has been set up. It will run daily at 7:00 PM IST with 250-stock batches and 10-minute pauses.',
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to setup cron job',
      },
      { status: 500 }
    );
  }
}

