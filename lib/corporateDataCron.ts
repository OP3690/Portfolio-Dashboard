import cron from 'node-cron';
import connectDB from './mongodb';
import { processAllStocksCorporateData } from './corporateDataService';

/**
 * Daily cron job to fetch and update corporate data at 11:45 PM IST
 * Updates financial results, shareholding patterns, announcements, etc. for ALL NSE stocks
 */
export function setupCorporateDataCron() {
  // Schedule: 11:45 PM every day (23:45 IST)
  // Cron format: minute hour * * * (day of month, month, day of week)
  const cronSchedule = '45 23 * * *';
  
  console.log('📅 Setting up Corporate Data cron job...');
  console.log(`⏰ Schedule: Daily at 11:45 PM IST (${cronSchedule})`);
  console.log(`📊 Scope: ALL NSE stocks in StockMaster`);
  console.log(`📋 Updates: Financial Results, Shareholding Patterns, Announcements, Corporate Actions, Board Meetings`);
  
  cron.schedule(cronSchedule, async () => {
    console.log('\n🔄 ========================================');
    console.log('🔄 Starting scheduled Corporate Data update...');
    console.log(`🕐 Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
    console.log('🔄 ========================================\n');
    
    try {
      await connectDB();
      
      const result = await processAllStocksCorporateData();
      
      console.log('\n✅ ========================================');
      console.log('✅ Corporate Data update completed!');
      console.log(`✅ Total stocks: ${result.total}`);
      console.log(`✅ Processed: ${result.processed}`);
      console.log(`✅ Created/Updated: ${result.updated}`);
      console.log(`✅ Failed: ${result.failed}`);
      console.log(`✅ Skipped (no data): ${result.skipped}`);
      if (result.errors.length > 0) {
        console.log(`⚠️  Errors: ${result.errors.length}`);
        result.errors.slice(0, 10).forEach((err: string) => console.log(`   - ${err}`));
        if (result.errors.length > 10) {
          console.log(`   ... and ${result.errors.length - 10} more errors`);
        }
      }
      console.log(`🕐 Completed at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
      console.log('✅ ========================================\n');
      
    } catch (error: any) {
      console.error('\n❌ ========================================');
      console.error('❌ Corporate Data update failed:', error.message);
      console.error('❌ ========================================\n');
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata" // Indian Standard Time
  });
  
  console.log('✅ Corporate Data cron job scheduled successfully!');
}

