import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { fetchAndStoreHistoricalData } from '@/lib/stockDataService';
import StockMaster from '@/models/StockMaster';
import StockData from '@/models/StockData';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * API endpoint to fetch and store 5-year historical OHLC data for all stocks in StockMaster
 * GET /api/fetch-5year-data
 * 
 * This will:
 * - Fetch 5 years of historical data for all stocks in stockmasters
 * - Store in stockdatas collection (duplicates prevented by unique index on isin + date)
 * - Process in batches to avoid rate limiting
 * - Skip stocks that already have 5-year data
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    await connectDB();
    
    console.log('\n🔄 ========================================');
    console.log('🔄 Starting 5-year historical data fetch for all stocks...');
    console.log(`🕐 Time: ${new Date().toLocaleString()}`);
    console.log('🔄 ========================================\n');
    
    // Get all stocks from StockMaster
    const allStocks = await StockMaster.find({}).select('isin').lean();
    const uniqueIsins = [...new Set(allStocks.map((s: any) => s.isin).filter(Boolean))];
    
    console.log(`📊 Found ${uniqueIsins.length} stocks in StockMaster to process`);
    
    // Check which stocks already have 5-year data
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    
    console.log(`\n📋 Checking which stocks already have 5-year data (since ${fiveYearsAgo.toISOString().split('T')[0]})...`);
    
    // Use aggregation to check which ISINs have sufficient data (>= 1000 records = ~5 years)
    const stocksWithData = await StockData.aggregate([
      {
        $match: {
          isin: { $in: uniqueIsins },
          date: { $gte: fiveYearsAgo }
        }
      },
      {
        $group: {
          _id: '$isin',
          count: { $sum: 1 },
          earliestDate: { $min: '$date' }
        }
      },
      {
        $match: {
          count: { $gte: 1000 } // At least 1000 records = ~5 years of trading days
        }
      }
    ]).exec();
    
    const isinsWith5YearData = new Set(stocksWithData.map((s: any) => s._id));
    const isinsNeeding5YearData = uniqueIsins.filter(isin => !isinsWith5YearData.has(isin));
    
    console.log(`✅ ${isinsWith5YearData.size} stocks already have 5-year data`);
    console.log(`📦 ${isinsNeeding5YearData.length} stocks need 5-year data fetch`);
    
    if (isinsNeeding5YearData.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All stocks already have 5-year historical data',
        summary: {
          totalStocks: uniqueIsins.length,
          stocksWith5YearData: isinsWith5YearData.size,
          stocksNeedingData: 0,
          totalDocumentsFetched: 0,
        },
      });
    }
    
    // Process stocks in batches
    const BATCH_SIZE = 10; // Smaller batch for 5-year fetches (they take longer)
    const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds between batches
    const DELAY_BETWEEN_STOCKS = 500; // 500ms between stocks
    
    let totalFetched = 0;
    let stocksProcessed = 0;
    let stocksSkipped = 0;
    const errors: string[] = [];
    const results: any[] = [];
    
    console.log(`\n🚀 Processing ${isinsNeeding5YearData.length} stocks in batches of ${BATCH_SIZE}...`);
    console.log(`⏰ Estimated time: ~${Math.ceil((isinsNeeding5YearData.length / BATCH_SIZE) * (DELAY_BETWEEN_BATCHES / 1000 / 60))} minutes\n`);
    
    // Process in batches
    for (let i = 0; i < isinsNeeding5YearData.length; i += BATCH_SIZE) {
      const batch = isinsNeeding5YearData.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(isinsNeeding5YearData.length / BATCH_SIZE);
      
      console.log(`\n📦 Batch ${batchNumber}/${totalBatches} (Processing ${batch.length} stocks)...`);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (isin) => {
        try {
          // Fetch 5-year data (forceFullUpdate = true)
          const count = await fetchAndStoreHistoricalData(isin, true);
          return { isin, count, success: true };
        } catch (error: any) {
          console.error(`   ❌ Error fetching 5-year data for ${isin}:`, error.message);
          return { isin, count: 0, success: false, error: error.message };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      // Process results
      for (const result of batchResults) {
        if (result.success && result.count > 0) {
          totalFetched += result.count;
          stocksProcessed++;
          results.push({
            isin: result.isin,
            status: 'success',
            documentsFetched: result.count,
          });
        } else if (result.success && result.count === 0) {
          stocksSkipped++;
          results.push({
            isin: result.isin,
            status: 'skipped',
            reason: 'No data available',
          });
        } else {
          errors.push(`${result.isin}: ${result.error || 'Unknown error'}`);
          results.push({
            isin: result.isin,
            status: 'error',
            error: result.error,
          });
        }
      }
      
      console.log(`   ✅ Batch ${batchNumber} completed: ${batchResults.filter(r => r.success && r.count > 0).length} successful, ${batchResults.filter(r => !r.success).length} failed`);
      console.log(`   📊 Progress: ${Math.min(i + BATCH_SIZE, isinsNeeding5YearData.length)}/${isinsNeeding5YearData.length} stocks processed`);
      console.log(`   📊 Total documents fetched so far: ${totalFetched}`);
      
      // Delay between batches (except after last batch)
      if (i + BATCH_SIZE < isinsNeeding5YearData.length) {
        console.log(`   ⏸️  Waiting ${DELAY_BETWEEN_BATCHES / 1000} seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000 / 60).toFixed(2);
    
    console.log('\n✅ ========================================');
    console.log('✅ 5-year data fetch completed!');
    console.log(`✅ Total stocks processed: ${stocksProcessed}/${isinsNeeding5YearData.length}`);
    console.log(`✅ Total documents fetched: ${totalFetched}`);
    console.log(`✅ Stocks skipped: ${stocksSkipped}`);
    console.log(`✅ Errors: ${errors.length}`);
    console.log(`⏱️  Total duration: ${duration} minutes`);
    console.log('✅ ========================================\n');
    
    return NextResponse.json({
      success: true,
      message: '5-year historical data fetch completed',
      summary: {
        totalStocks: uniqueIsins.length,
        stocksWith5YearData: isinsWith5YearData.size,
        stocksNeedingData: isinsNeeding5YearData.length,
        stocksProcessed: stocksProcessed,
        stocksSkipped: stocksSkipped,
        stocksFailed: errors.length,
        totalDocumentsFetched: totalFetched,
        durationMinutes: parseFloat(duration),
      },
      results: results.slice(0, 100), // Return first 100 results to avoid huge response
      errors: errors.slice(0, 50), // Return first 50 errors
    });
    
  } catch (error: any) {
    console.error('\n❌ ========================================');
    console.error('❌ 5-year data fetch failed:', error.message);
    console.error('❌ ========================================\n');
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch 5-year historical data',
      },
      { status: 500 }
    );
  }
}

