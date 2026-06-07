import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * API endpoint to trigger daily stock data refresh
 * Uses the new refresh logic with NSE API support and proper handling of stocks with no data
 * 
 * Designed to be called by external cron services like cron-job.org or Vercel Cron
 * 
 * GET /api/cron-trigger?secret=YOUR_SECRET_KEY
 * 
 * This endpoint calls the /api/fetch-historical-data endpoint with:
 * - refreshLatest: true (refreshes last 3 days including today)
 * - refreshAllStocks: true (processes ALL stocks, not just holdings)
 * 
 * Optional query parameter:
 * - secret: Security key to prevent unauthorized access (recommended)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Optional: Add secret key for security (set in environment variables)
    const searchParams = request.nextUrl.searchParams;
    const providedSecret = searchParams.get('secret');
    const expectedSecret = process.env.CRON_SECRET_KEY;
    
    if (expectedSecret && providedSecret !== expectedSecret) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: Invalid secret key',
        },
        { status: 401 }
      );
    }
    
    await connectDB();
    
    console.log('\n🔄 ========================================');
    console.log('🔄 Cron trigger: Starting daily stock data refresh...');
    console.log(`🕐 Time: ${new Date().toLocaleString()}`);
    console.log('🔄 Using new refresh logic with NSE API support');
    console.log('🔄 Fetching last 3 days for ALL stocks in StockMaster');
    console.log('🔄 ========================================\n');
    
    // Call the refresh handler directly (works in both serverless and traditional servers)
    // This ensures:
    // 1. NSE API is used first (with session cookies)
    // 2. Stocks with no data are properly handled
    // 3. All stocks are refreshed (not just holdings)
    try {
      const refreshModule = await import('../fetch-historical-data/route');
      const refreshHandler = refreshModule.POST;
      
      // Call the refresh handler directly (no need for HTTP request)
      // Only refresh holdings — fetching all stocks fills the 512 MB Atlas free tier
      const mockUrl = new URL('http://localhost/api/fetch-historical-data');

      const directRequest = new NextRequest(mockUrl, {
        method: 'POST',
        body: JSON.stringify({ refreshLatest: true }),
        headers: { 'Content-Type': 'application/json' },
      });
      
      const result = await refreshHandler(directRequest);
      const resultData = await result.json();
      
      const endTime = Date.now();
      const totalDuration = ((endTime - startTime) / 1000 / 60).toFixed(2);
      
      if (resultData.success) {
        console.log('\n✅ ========================================');
        console.log('✅ Cron trigger: Refresh completed!');
        console.log(`✅ Message: ${resultData.message || 'Success'}`);
        console.log(`✅ Stocks processed: ${resultData.stocksProcessed || 0}`);
        console.log(`✅ Records fetched: ${resultData.totalRecords || 0}`);
        console.log(`⏱️  Total duration: ${totalDuration} minutes`);
        console.log(`🕐 Completed at: ${new Date().toLocaleString()}`);
        console.log('✅ ========================================\n');
        
        return NextResponse.json({
          success: true,
          message: resultData.message || 'Stock data refresh completed successfully',
          details: {
            stocksProcessed: resultData.stocksProcessed || 0,
            totalRecords: resultData.totalRecords || 0,
            stocksWith5YearData: resultData.stocksWith5YearData || 0,
            stocksFetched5Year: resultData.stocksFetched5Year || 0,
            foundInDatabase: resultData.foundInDatabase || 0,
            duration: `${totalDuration} minutes`,
            completedAt: new Date().toISOString(),
          },
        });
      } else {
        console.error('\n❌ ========================================');
        console.error('❌ Cron trigger: Refresh failed');
        console.error(`❌ Error: ${resultData.error || 'Unknown error'}`);
        console.error('❌ ========================================\n');
        
        return NextResponse.json(
          {
            success: false,
            error: resultData.error || 'Failed to refresh stock data',
          },
          { status: 500 }
        );
      }
    } catch (directError: any) {
      console.error('\n❌ ========================================');
      console.error('❌ Cron trigger: Failed to call refresh handler');
      console.error(`❌ Error: ${directError.message}`);
      console.error('❌ ========================================\n');
      
      return NextResponse.json(
        {
          success: false,
          error: `Failed to refresh: ${directError.message}`,
        },
        { status: 500 }
      );
    }
    
  } catch (error: any) {
    console.error('\n❌ ========================================');
    console.error('❌ Cron trigger failed:', error.message);
    console.error('❌ ========================================\n');
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to trigger stock data refresh',
      },
      { status: 500 }
    );
  }
}

