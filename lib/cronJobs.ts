import cron from 'node-cron';
import { NextRequest } from 'next/server';

/**
 * Daily cron job to refresh stock data at 7:00 PM IST
 * Uses the new refresh logic with NSE API support
 * 
 * NOTE: This only works on always-on servers (not serverless like Vercel)
 * For serverless deployments, use Vercel Cron or external cron service (cron-job.org)
 * that calls /api/cron-trigger endpoint
 */
export function setupDailyStockDataRefresh() {
  // Schedule: 7:00 PM IST every day (19:00 IST = 13:30 UTC)
  // Cron format: minute hour * * * (day of month, month, day of week)
  // Using IST timezone, so 19:00 IST = 19:00 local time in IST
  const cronSchedule = '0 19 * * *';
  
  console.log('📅 Setting up daily stock data refresh cron job...');
  console.log(`⏰ Schedule: Daily at 7:00 PM IST (${cronSchedule})`);
  console.log(`📊 Scope: ALL stocks (last 3 days including today)`);
  console.log(`🌐 Uses: NSE API (with session cookies) + Yahoo Finance fallback`);
  console.log(`⚠️  Note: This only works on always-on servers. For serverless, use /api/cron-trigger`);
  
  cron.schedule(cronSchedule, async () => {
    console.log('\n🔄 ========================================');
    console.log('🔄 Starting scheduled daily stock data refresh...');
    console.log(`🕐 Time: ${new Date().toLocaleString()}`);
    console.log('🔄 Using new refresh logic with NSE API support');
    console.log('🔄 ========================================\n');
    
    try {
      // Call the refresh handler directly
      const refreshModule = await import('../app/api/fetch-historical-data/route');
      const refreshHandler = refreshModule.POST;
      
      // Create a request with refreshLatest and refreshAllStocks
      const url = new URL('http://localhost:3000/api/fetch-historical-data');
      url.searchParams.set('refreshAllStocks', 'true');
      const directRequest = new NextRequest(url, {
        method: 'POST',
        body: JSON.stringify({ refreshLatest: true }),
        headers: { 'Content-Type': 'application/json' },
      });
      
      const result = await refreshHandler(directRequest);
      const resultData = await result.json();
      
      if (resultData.success) {
        console.log('\n✅ ========================================');
        console.log('✅ Scheduled refresh completed!');
        console.log(`✅ Message: ${resultData.message || 'Success'}`);
        console.log(`✅ Stocks processed: ${resultData.stocksProcessed || 0}`);
        console.log(`✅ Records fetched: ${resultData.totalRecords || 0}`);
        console.log(`🕐 Completed at: ${new Date().toLocaleString()}`);
        console.log('✅ ========================================\n');
      } else {
        console.error('\n❌ ========================================');
        console.error('❌ Scheduled refresh failed');
        console.error(`❌ Error: ${resultData.error || 'Unknown error'}`);
        console.error('❌ ========================================\n');
      }
      
    } catch (error: any) {
      console.error('\n❌ ========================================');
      console.error('❌ Scheduled refresh failed:', error.message);
      console.error('❌ ========================================\n');
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata" // Indian Standard Time
  });
  
  console.log('✅ Daily stock data refresh cron job scheduled successfully!');
  console.log('💡 For serverless deployments, set up Vercel Cron or use cron-job.org to call /api/cron-trigger');
}

