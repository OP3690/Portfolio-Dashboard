import cron from 'node-cron';
import connectDB from './mongodb';
import { fetchAndStoreHistoricalData, hasComplete5YearData } from './stockDataService';
import Holding from '@/models/Holding';
import StockMaster from '@/models/StockMaster';

/**
 * Daily cron job to refresh stock data at 7:00 PM
 * Fetches last 3 days of data including today for ALL stocks in StockMaster
 * Processes in batches of 250 stocks with 10-minute pauses between batches
 */
export function setupDailyStockDataRefresh() {
  // Schedule: 7:00 PM every day (19:00)
  // Cron format: minute hour * * * (day of month, month, day of week)
  const cronSchedule = '0 19 * * *';
  const BATCH_SIZE = 250;
  const PAUSE_MINUTES = 10;
  const PAUSE_MS = PAUSE_MINUTES * 60 * 1000; // 10 minutes in milliseconds
  
  console.log('📅 Setting up daily stock data refresh cron job...');
  console.log(`⏰ Schedule: Daily at 7:00 PM (${cronSchedule})`);
  console.log(`📊 Scope: ALL stocks in StockMaster (last 3 days including today)`);
  console.log(`📦 Batch size: ${BATCH_SIZE} stocks per batch`);
  console.log(`⏸️  Pause: ${PAUSE_MINUTES} minutes between batches`);
  
  cron.schedule(cronSchedule, async () => {
    console.log('\n🔄 ========================================');
    console.log('🔄 Starting scheduled daily stock data refresh...');
    console.log(`🕐 Time: ${new Date().toLocaleString()}`);
    console.log('🔄 ========================================\n');
    
    try {
      await connectDB();
      
      // Get ALL stocks from StockMaster (not just holdings)
      const allStocks = await StockMaster.find({}).select('isin').lean();
      const uniqueIsins = [...new Set(allStocks.map((s: any) => s.isin).filter(Boolean))];
      
      console.log(`📊 Found ${uniqueIsins.length} stocks in StockMaster to process`);
      console.log(`📦 Will process in batches of ${BATCH_SIZE} stocks with ${PAUSE_MINUTES}-minute pauses`);
      
      let totalFetched = 0;
      let stocksProcessed = 0;
      let stocksRefreshed = 0;
      const errors: string[] = [];
      
      // Process stocks in batches
      const totalBatches = Math.ceil(uniqueIsins.length / BATCH_SIZE);
      
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * BATCH_SIZE;
        const endIndex = Math.min(startIndex + BATCH_SIZE, uniqueIsins.length);
        const batchIsins = uniqueIsins.slice(startIndex, endIndex);
        
        console.log(`\n📦 Processing batch ${batchIndex + 1}/${totalBatches} (stocks ${startIndex + 1}-${endIndex} of ${uniqueIsins.length})...`);
        const batchStartTime = Date.now();
        
        // Process stocks in current batch
        for (let i = 0; i < batchIsins.length; i++) {
          const isin = batchIsins[i];
          try {
            // Fetch last 3 days including today (forceFullUpdate = false)
            const count = await fetchAndStoreHistoricalData(isin, false);
            totalFetched += count;
            stocksProcessed++;
            stocksRefreshed++;
            
            // Log progress every 50 stocks within the batch
            if ((i + 1) % 50 === 0) {
              console.log(`   ⏳ Batch ${batchIndex + 1}: ${i + 1}/${batchIsins.length} stocks processed (${totalFetched} total records)`);
            }
          } catch (error: any) {
            console.error(`❌ Error refreshing ${isin}:`, error.message);
            errors.push(`${isin}: ${error.message || 'Unknown error'}`);
          }
          
          // Small delay between stocks to avoid rate limiting
          if (i < batchIsins.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300)); // 300ms
          }
        }
        
        const batchEndTime = Date.now();
        const batchDuration = ((batchEndTime - batchStartTime) / 1000 / 60).toFixed(2);
        console.log(`✅ Batch ${batchIndex + 1}/${totalBatches} completed in ${batchDuration} minutes`);
        console.log(`   - Processed: ${batchIsins.length} stocks`);
        console.log(`   - Total processed so far: ${stocksProcessed}/${uniqueIsins.length}`);
        
        // Pause 10 minutes before next batch (except after last batch)
        if (batchIndex < totalBatches - 1) {
          console.log(`\n⏸️  Pausing for ${PAUSE_MINUTES} minutes before next batch...`);
          console.log(`   Next batch will start at: ${new Date(Date.now() + PAUSE_MS).toLocaleString()}`);
          await new Promise(resolve => setTimeout(resolve, PAUSE_MS));
        }
      }
      
      console.log('\n✅ ========================================');
      console.log('✅ Scheduled refresh completed!');
      console.log(`✅ Total stocks processed: ${stocksProcessed}/${uniqueIsins.length}`);
      console.log(`   - All stocks: 3-day refresh (including today)`);
      console.log(`✅ Total records fetched: ${totalFetched}`);
      console.log(`📦 Total batches processed: ${totalBatches}`);
      if (errors.length > 0) {
        console.log(`⚠️  Errors: ${errors.length}`);
        errors.slice(0, 10).forEach(err => console.log(`   - ${err}`));
        if (errors.length > 10) {
          console.log(`   ... and ${errors.length - 10} more errors`);
        }
      }
      console.log(`🕐 Completed at: ${new Date().toLocaleString()}`);
      console.log('✅ ========================================\n');
      
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
}

