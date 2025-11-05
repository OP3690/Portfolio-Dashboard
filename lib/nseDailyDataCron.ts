import cron from 'node-cron';
import connectDB from './mongodb';
import { processAllStocksNSEDailyData } from './nseDailyDataService';

/**
 * Daily cron job to fetch and store NSE daily data at 5:00 PM IST
 * Fetches daily volume data and updates stock-level fields for ALL NSE stocks
 */
export function setupNSEDailyDataCron() {
  // Schedule: 5:00 PM every day (17:00 IST)
  // Cron format: minute hour * * * (day of month, month, day of week)
  const cronSchedule = '0 17 * * *';
  
  console.log('📅 Setting up NSE daily data cron job...');
  console.log(`⏰ Schedule: Daily at 5:00 PM IST (${cronSchedule})`);
  console.log(`📊 Scope: ALL NSE stocks in StockMaster`);
  console.log(`📋 Daily fields: totalTradedVolume, totalBuyQuantity, totalSellQuantity`);
  console.log(`📋 Stock updates: industry, isFNOSec, pdSectorInd, pdSectorPe, pdSymbolPe`);
  
  cron.schedule(cronSchedule, async () => {
    console.log('\n🔄 ========================================');
    console.log('🔄 Starting scheduled NSE daily data fetch...');
    console.log(`🕐 Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
    console.log('🔄 ========================================\n');
    
    try {
      await connectDB();
      
      const result = await processAllStocksNSEDailyData();
      
      console.log('\n✅ ========================================');
      console.log('✅ NSE daily data fetch completed!');
      console.log(`✅ Total stocks: ${result.total}`);
      console.log(`✅ Processed: ${result.processed}`);
      console.log(`✅ Failed: ${result.failed}`);
      if (result.errors.length > 0) {
        console.log(`⚠️  Errors: ${result.errors.length}`);
        result.errors.slice(0, 10).forEach(err => console.log(`   - ${err}`));
        if (result.errors.length > 10) {
          console.log(`   ... and ${result.errors.length - 10} more errors`);
        }
      }
      console.log(`🕐 Completed at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
      console.log('✅ ========================================\n');
      
    } catch (error: any) {
      console.error('\n❌ ========================================');
      console.error('❌ NSE daily data fetch failed:', error.message);
      console.error('❌ ========================================\n');
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata" // Indian Standard Time
  });
  
  console.log('✅ NSE daily data cron job scheduled successfully!');
}

