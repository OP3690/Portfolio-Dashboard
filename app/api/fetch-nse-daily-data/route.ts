import { NextRequest, NextResponse } from 'next/server';
import { processAllStocksNSEDailyData } from '@/lib/nseDailyDataService';

export const dynamic = 'force-dynamic';

/**
 * API endpoint to trigger NSE daily data fetch for all stocks
 * This can be called manually or via cron service
 * 
 * GET /api/fetch-nse-daily-data
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    console.log('\n🔄 ========================================');
    console.log('🔄 Manual trigger: Starting NSE daily data fetch...');
    console.log(`🕐 Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
    console.log('🔄 ========================================\n');
    
    const result = await processAllStocksNSEDailyData();
    
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    
    console.log('\n✅ ========================================');
    console.log('✅ NSE daily data fetch completed!');
    console.log(`✅ Duration: ${duration} minutes`);
    console.log(`✅ Total stocks: ${result.total}`);
    console.log(`✅ Processed: ${result.processed}`);
    console.log(`✅ Failed: ${result.failed}`);
    console.log('✅ ========================================\n');
    
    return NextResponse.json({
      success: true,
      message: `Processed ${result.processed}/${result.total} stocks`,
      total: result.total,
      processed: result.processed,
      failed: result.failed,
      errors: result.errors.slice(0, 10), // Limit errors in response
      duration: `${duration} minutes`,
    });
  } catch (error: any) {
    console.error('\n❌ ========================================');
    console.error('❌ NSE daily data fetch failed:', error.message);
    console.error('❌ ========================================\n');
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch NSE daily data',
      },
      { status: 500 }
    );
  }
}

