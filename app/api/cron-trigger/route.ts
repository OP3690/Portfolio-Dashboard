import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { fetchAndStoreHistoricalData } from '@/lib/stockDataService';
import StockMaster from '@/models/StockMaster';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * API endpoint to trigger daily stock data refresh
 * This endpoint mimics the cron job behavior:
 * - Processes stocks in batches of 250
 * - 10-minute pauses between batches
 * - Fetches last 3 days including today
 * 
 * Designed to be called by external cron services like cron-job.org
 * 
 * GET /api/cron-trigger?secret=YOUR_SECRET_KEY
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
    
    const BATCH_SIZE = 250;
    const PAUSE_MINUTES = 10;
    const PAUSE_MS = PAUSE_MINUTES * 60 * 1000;
    
    console.log('\n🔄 ========================================');
    console.log('🔄 Cron trigger: Starting daily stock data refresh...');
    console.log(`🕐 Time: ${new Date().toLocaleString()}`);
    console.log('🔄 ========================================\n');
    
    // Get ALL stocks from StockMaster
    const allStocks = await StockMaster.find({}).select('isin').lean();
    const uniqueIsins = [...new Set(allStocks.map((s: any) => s.isin).filter(Boolean))];
    
    console.log(`📊 Found ${uniqueIsins.length} stocks in StockMaster to process`);
    console.log(`📦 Will process in batches of ${BATCH_SIZE} stocks with ${PAUSE_MINUTES}-minute pauses`);
    
    let totalFetched = 0;
    let stocksProcessed = 0;
    const errors: string[] = [];
    
    // Process stocks in batches
    const totalBatches = Math.ceil(uniqueIsins.length / BATCH_SIZE);
    
    // Return immediately with "started" status, then process in background
    // This prevents timeout issues with external cron services
    const processBatches = async () => {
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
            // Fetch last 3 days including today ONLY (forceFullUpdate = false)
            // This ensures we only fetch and update today + last 2 days, not full 5 years
            // Duplicate prevention: StockData has unique index on (isin, date) - duplicates automatically prevented
            const count = await fetchAndStoreHistoricalData(isin, false);
            totalFetched += count;
            stocksProcessed++;
            
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
      
      const endTime = Date.now();
      const totalDuration = ((endTime - startTime) / 1000 / 60).toFixed(2);
      
      console.log('\n✅ ========================================');
      console.log('✅ Cron trigger: Refresh completed!');
      console.log(`✅ Total stocks processed: ${stocksProcessed}/${uniqueIsins.length}`);
      console.log(`   - All stocks: 3-day refresh (including today)`);
      console.log(`✅ Total records fetched: ${totalFetched}`);
      console.log(`📦 Total batches processed: ${totalBatches}`);
      console.log(`⏱️  Total duration: ${totalDuration} minutes`);
      if (errors.length > 0) {
        console.log(`⚠️  Errors: ${errors.length}`);
        errors.slice(0, 10).forEach(err => console.log(`   - ${err}`));
        if (errors.length > 10) {
          console.log(`   ... and ${errors.length - 10} more errors`);
        }
      }
      console.log(`🕐 Completed at: ${new Date().toLocaleString()}`);
      console.log('✅ ========================================\n');
    };
    
    // Start processing in background (don't await)
    processBatches().catch((error) => {
      console.error('\n❌ ========================================');
      console.error('❌ Cron trigger: Background processing failed:', error.message);
      console.error('❌ ========================================\n');
    });
    
    // Return immediately
    return NextResponse.json({
      success: true,
      message: 'Stock data refresh started in background',
      details: {
        totalStocks: uniqueIsins.length,
        batchSize: BATCH_SIZE,
        totalBatches: totalBatches,
        pauseMinutes: PAUSE_MINUTES,
        startedAt: new Date().toISOString(),
      },
    });
    
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

