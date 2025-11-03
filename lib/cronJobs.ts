import cron from 'node-cron';
import connectDB from './mongodb';
import { fetchAndStoreHistoricalData, hasComplete5YearData } from './stockDataService';
import Holding from '@/models/Holding';
import StockMaster from '@/models/StockMaster';

/**
 * Daily cron job to refresh stock data at 11:35 PM
 * Fetches last 3 days of data including today for ALL stocks in StockMaster
 * For stocks without 5-year data, fetches full 5 years on first run
 */
export function setupDailyStockDataRefresh() {
  // Schedule: 11:35 PM every day (23:35)
  // Cron format: minute hour * * * (day of month, month, day of week)
  const cronSchedule = '35 23 * * *';
  
  console.log('📅 Setting up daily stock data refresh cron job...');
  console.log(`⏰ Schedule: Daily at 11:35 PM (${cronSchedule})`);
  console.log(`📊 Scope: ALL stocks in StockMaster (5-year initial fetch, then daily 3-day refresh)`);
  
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
      
      // Separate stocks that need 5-year data vs refresh
      const stocksNeeding5Year: string[] = [];
      const stocksNeedingRefresh: string[] = [];
      
      for (const isin of uniqueIsins) {
        const has5YearData = await hasComplete5YearData(isin);
        if (!has5YearData) {
          stocksNeeding5Year.push(isin);
        } else {
          stocksNeedingRefresh.push(isin);
        }
      }
      
      console.log(`📊 ${stocksNeeding5Year.length} stocks need 5-year initial fetch`);
      console.log(`📊 ${stocksNeedingRefresh.length} stocks will get 3-day refresh (including today)`);
      
      let totalFetched = 0;
      let stocksProcessed = 0;
      let stocksFetched5Year = 0;
      let stocksRefreshed = 0;
      const errors: string[] = [];
      
      // First, process stocks needing 5-year data (slower, longer delay)
      for (let i = 0; i < stocksNeeding5Year.length; i++) {
        const isin = stocksNeeding5Year[i];
        try {
          const count = await fetchAndStoreHistoricalData(isin, true); // forceFullUpdate = true
          totalFetched += count;
          stocksProcessed++;
          stocksFetched5Year++;
          
          // Log progress every 5 stocks for 5-year fetches (they're slower)
          if ((i + 1) % 5 === 0) {
            console.log(`📦 Progress (5-year fetch): ${i + 1}/${stocksNeeding5Year.length} stocks processed`);
          }
        } catch (error: any) {
          console.error(`❌ Error fetching 5-year data for ${isin}:`, error.message);
          errors.push(`${isin}: ${error.message || 'Unknown error'}`);
        }
        
        // Longer delay for 5-year fetches to avoid rate limiting
        if (i < stocksNeeding5Year.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second
        }
      }
      
      // Then, refresh stocks with existing data (faster, shorter delay)
      for (let i = 0; i < stocksNeedingRefresh.length; i++) {
        const isin = stocksNeedingRefresh[i];
        try {
          // Fetch last 3 days including today (forceFullUpdate = false)
          const count = await fetchAndStoreHistoricalData(isin, false);
          totalFetched += count;
          stocksProcessed++;
          stocksRefreshed++;
          
          // Log progress every 50 stocks for refreshes (they're faster)
          if ((i + 1) % 50 === 0) {
            console.log(`🔄 Progress (refresh): ${i + 1}/${stocksNeedingRefresh.length} stocks processed (${totalFetched} records)`);
          }
        } catch (error: any) {
          console.error(`❌ Error refreshing ${isin}:`, error.message);
          errors.push(`${isin}: ${error.message || 'Unknown error'}`);
        }
        
        // Shorter delay for refreshes
        if (i < stocksNeedingRefresh.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300)); // 300ms
        }
      }
      
      console.log('\n✅ ========================================');
      console.log('✅ Scheduled refresh completed!');
      console.log(`✅ Total stocks processed: ${stocksProcessed}/${uniqueIsins.length}`);
      console.log(`   - ${stocksFetched5Year} stocks: Initial 5-year fetch`);
      console.log(`   - ${stocksRefreshed} stocks: 3-day refresh (including today)`);
      console.log(`✅ Total records fetched: ${totalFetched}`);
      if (errors.length > 0) {
        console.log(`⚠️  Errors: ${errors.length}`);
        errors.slice(0, 5).forEach(err => console.log(`   - ${err}`));
        if (errors.length > 5) {
          console.log(`   ... and ${errors.length - 5} more errors`);
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

