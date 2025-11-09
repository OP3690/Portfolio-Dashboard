import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import StockData from '@/models/StockData';
import StockMaster from '@/models/StockMaster';
import { fetchAndStoreHistoricalData } from '@/lib/stockDataService';

export const dynamic = 'force-dynamic';

/**
 * API endpoint to identify and fetch data for stocks with incomplete data (1-2 records only)
 * GET /api/fetch-incomplete-stocks
 * 
 * This will:
 * 1. Find all stocks in StockMaster
 * 2. Identify stocks with <= 2 records in StockData
 * 3. Fetch full 5-year data for those stocks
 * 4. Process in batches to avoid rate limiting
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    console.log('\n🔍 ========================================');
    console.log('🔍 Identifying stocks with incomplete data (1-2 records)...');
    console.log(`🕐 Time: ${new Date().toLocaleString()}`);
    console.log('🔍 ========================================\n');
    
    // Get all stocks from StockMaster
    const allStocks = await StockMaster.find({}).select('isin symbol stockName exchange').lean();
    const uniqueIsins = [...new Set(allStocks.map((s: any) => s.isin).filter(Boolean))];
    
    console.log(`📊 Found ${uniqueIsins.length} stocks in StockMaster`);
    
    // Count records for each stock
    console.log('\n📊 Counting records for each stock...');
    const recordCounts = await StockData.aggregate([
      {
        $match: {
          isin: { $in: uniqueIsins }
        }
      },
      {
        $group: {
          _id: '$isin',
          count: { $sum: 1 }
        }
      }
    ]).allowDiskUse(true);
    
    const isinCountMap = new Map(recordCounts.map((r: any) => [r._id, r.count]));
    
    // Find stocks with <= 2 records
    const incompleteStocks: Array<{ isin: string; count: number; symbol?: string; stockName?: string }> = [];
    
    for (const stock of allStocks) {
      const isin = (stock as any).isin;
      if (!isin) continue;
      
      const count = isinCountMap.get(isin) || 0;
      if (count <= 2) {
        incompleteStocks.push({
          isin,
          count,
          symbol: (stock as any).symbol,
          stockName: (stock as any).stockName
        });
      }
    }
    
    console.log(`\n⚠️  Found ${incompleteStocks.length} stocks with <= 2 records:`);
    incompleteStocks.slice(0, 20).forEach(stock => {
      console.log(`   - ${stock.isin} (${stock.symbol || 'N/A'}): ${stock.count} records`);
    });
    if (incompleteStocks.length > 20) {
      console.log(`   ... and ${incompleteStocks.length - 20} more`);
    }
    
    if (incompleteStocks.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No stocks with incomplete data found. All stocks have sufficient data.',
        incompleteCount: 0,
        processed: 0
      });
    }
    
    // Process in batches
    const BATCH_SIZE = 10;
    let processed = 0;
    let totalFetched = 0;
    const errors: Array<{ isin: string; error: string }> = [];
    
    console.log(`\n🚀 Starting to fetch full 5-year data for ${incompleteStocks.length} stocks...`);
    console.log(`📦 Processing in batches of ${BATCH_SIZE} stocks\n`);
    
    for (let i = 0; i < incompleteStocks.length; i += BATCH_SIZE) {
      const batch = incompleteStocks.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(incompleteStocks.length / BATCH_SIZE);
      
      console.log(`\n📦 Batch ${batchNum}/${totalBatches}: Processing ${batch.length} stocks...`);
      
      const batchPromises = batch.map(async (stock) => {
        try {
          console.log(`   🔄 Fetching ${stock.isin} (${stock.symbol || 'N/A'}) - Currently has ${stock.count} records...`);
          const count = await fetchAndStoreHistoricalData(stock.isin, true); // Force full 5-year fetch
          console.log(`   ✅ ${stock.isin}: Fetched ${count} records`);
          return { success: true, isin: stock.isin, count };
        } catch (error: any) {
          console.error(`   ❌ ${stock.isin}: Error - ${error.message}`);
          return { success: false, isin: stock.isin, error: error.message };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      for (const result of batchResults) {
        if (result.success) {
          processed++;
          totalFetched += result.count || 0;
        } else {
          errors.push({ isin: result.isin || 'unknown', error: result.error || 'Unknown error' });
        }
      }
      
      console.log(`   ✅ Batch ${batchNum} complete: ${batchResults.filter(r => r.success).length}/${batch.length} succeeded`);
      console.log(`   📊 Progress: ${processed}/${incompleteStocks.length} stocks processed, ${totalFetched} total records fetched`);
      
      // Delay between batches to avoid rate limiting (2 seconds)
      if (i + BATCH_SIZE < incompleteStocks.length) {
        console.log(`   ⏳ Waiting 2 seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log('\n✅ ========================================');
    console.log('✅ Process complete!');
    console.log(`✅ Processed: ${processed}/${incompleteStocks.length} stocks`);
    console.log(`✅ Total records fetched: ${totalFetched}`);
    console.log(`❌ Errors: ${errors.length}`);
    console.log('✅ ========================================\n');
    
    return NextResponse.json({
      success: true,
      message: `Fetched data for ${processed}/${incompleteStocks.length} stocks with incomplete data`,
      incompleteCount: incompleteStocks.length,
      processed,
      totalRecordsFetched: totalFetched,
      errors: errors.length > 0 ? errors : undefined,
      incompleteStocks: incompleteStocks.map(s => ({
        isin: s.isin,
        symbol: s.symbol,
        stockName: s.stockName,
        previousCount: s.count
      }))
    });
    
  } catch (error: any) {
    console.error('❌ Error in fetch-incomplete-stocks:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to fetch incomplete stocks data' 
      },
      { status: 500 }
    );
  }
}

