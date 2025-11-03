import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { fetchAllStocksHistoricalData, fetchAndStoreHistoricalData, hasComplete5YearData } from '@/lib/stockDataService';
import StockMaster from '@/models/StockMaster';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * API endpoint to fetch and store historical stock data
 * POST /api/fetch-historical-data
 * Body: { isin?: string, fetchHoldings?: boolean } - If isin provided, fetch only that stock. If fetchHoldings is true, fetch for holdings only.
 */
export async function POST(request: NextRequest) {
  try {
    const connection = await connectDB();
    const dbName = connection.connection.db?.databaseName || 'unknown';
    console.log(`🔗 Connected to database: ${dbName}`);
    console.log(`🌐 Connection host: ${connection.connection.host}`);
    console.log(`📝 Connection name: ${connection.connection.name}`);

    const body = await request.json().catch(() => ({}));
    const { isin, isins, fetchHoldings, refreshLatest } = body;
    
    // Handle daily refresh (last 3 days including today)
    if (refreshLatest === true) {
      const Holding = (await import('@/models/Holding')).default;
      const StockData = (await import('@/models/StockData')).default;
      const StockMaster = (await import('@/models/StockMaster')).default;
      const searchParams = request.nextUrl.searchParams;
      const clientId = searchParams.get('clientId') || '994826';
      
      // Get holdings ISINs (priority 1)
      const holdings = await Holding.find({ clientId }).select('isin').lean();
      const holdingsIsins = new Set([...new Set(holdings.map((h: any) => h.isin).filter(Boolean))]);
      
      // Get ALL stocks from StockMaster (for Stock Research)
      const allStocks = await StockMaster.find({}).select('isin').lean();
      const allStockIsins = new Set([...new Set(allStocks.map((s: any) => s.isin).filter(Boolean))]);
      
      // Combine: Holdings first (priority), then rest of stocks
      const priorityIsins = Array.from(holdingsIsins);
      const otherIsins = Array.from(allStockIsins).filter(isin => !holdingsIsins.has(isin));
      const uniqueIsins = [...priorityIsins, ...otherIsins];
      
      console.log(`🔄 Refreshing latest 3 days of data:`);
      console.log(`   - Priority (Holdings): ${priorityIsins.length} stocks`);
      console.log(`   - Additional (All Stocks): ${otherIsins.length} stocks`);
      console.log(`   - Total: ${uniqueIsins.length} stocks`);
      
      // OPTIMIZED: Use MongoDB aggregation to check ALL ISINs at once for today's data
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      
      // Get all ISINs with today's data in ONE query using aggregation
      const todayDataResults: any[] = await StockData.aggregate([
        {
          $match: {
            isin: { $in: uniqueIsins },
            date: { $gte: today, $lte: todayEnd },
            close: { $gt: 0 }
          }
        },
        {
          $group: {
            _id: '$isin',
            latestDate: { $max: '$date' },
            latestClose: { $first: '$close' }
          }
        }
      ]);
      
      const isinsWithTodayData = new Set(todayDataResults.map(r => r._id));
      const isinsNeedingFetch = uniqueIsins.filter(isin => !isinsWithTodayData.has(isin));
      const foundInDB = isinsWithTodayData.size;
      
      console.log(`✅ Found ${foundInDB} stocks with TODAY's data in database (via aggregation), ${isinsNeedingFetch.length} need fetching from API`);
      
      // Separate holdings (priority) from other stocks
      const holdingsNeedingFetch = isinsNeedingFetch.filter(isin => holdingsIsins.has(isin));
      const otherStocksNeedingFetch = isinsNeedingFetch.filter(isin => !holdingsIsins.has(isin));
      
      console.log(`   - Priority (Holdings) needing fetch: ${holdingsNeedingFetch.length}`);
      console.log(`   - Additional stocks needing fetch: ${otherStocksNeedingFetch.length}`);
      
      // Only fetch missing ones - process in parallel batches to be faster
      let totalFetched = 0;
      let stocksProcessed = 0;
      let stocksWith5YearData = 0;
      let stocksFetched5Year = 0;
      const errors: string[] = [];
      
      // Process holdings first (priority), then other stocks
      const isinsNeedingFetchOrdered = [...holdingsNeedingFetch, ...otherStocksNeedingFetch];
      
      if (isinsNeedingFetchOrdered.length > 0) {
        // OPTIMIZED: Use MongoDB aggregation to check which stocks have 5-year data (parallel batch check)
        // Check counts of records per ISIN - if >= 1000 records, assume 5-year data exists
        const dataCountResults: any[] = await StockData.aggregate([
          {
            $match: {
              isin: { $in: isinsNeedingFetchOrdered }
            }
          },
          {
            $group: {
              _id: '$isin',
              count: { $sum: 1 }
            }
          }
        ]);
        
        const isinCountMap = new Map(dataCountResults.map(r => [r._id, r.count]));
        const STOCK_DATA_THRESHOLD = 1000; // ~5 years of trading days
        
        const stocksNeeding5Year: string[] = [];
        const stocksNeedingRefresh: string[] = [];
        
        for (const isin of isinsNeedingFetchOrdered) {
          const count = isinCountMap.get(isin) || 0;
          if (count >= STOCK_DATA_THRESHOLD) {
            stocksNeedingRefresh.push(isin);
          } else {
            stocksNeeding5Year.push(isin);
          }
        }
        
        console.log(`📊 ${stocksNeeding5Year.length} stocks need 5-year data, ${stocksNeedingRefresh.length} need refresh (via aggregation)`);
        
        // Process stocks needing refresh in LARGER parallel batches (faster)
        const REFRESH_BATCH_SIZE = 20; // Increased from 10 to 20
        for (let i = 0; i < stocksNeedingRefresh.length; i += REFRESH_BATCH_SIZE) {
          const batch = stocksNeedingRefresh.slice(i, i + REFRESH_BATCH_SIZE);
          const batchPromises = batch.map(async (holdingIsin) => {
            try {
              const count = await fetchAndStoreHistoricalData(holdingIsin, false);
              return { success: true, count, isin: holdingIsin };
            } catch (error: any) {
              return { success: false, error: error.message, isin: holdingIsin };
            }
          });
          
          const batchResults = await Promise.all(batchPromises);
          batchResults.forEach(result => {
            if (result.success) {
              stocksWith5YearData++;
              totalFetched += result.count || 0;
              stocksProcessed++;
            } else {
              errors.push(`${result.isin}: ${result.error || 'Unknown error'}`);
            }
          });
          
          // Reduced delay between batches (only if not last batch)
          if (i + REFRESH_BATCH_SIZE < stocksNeedingRefresh.length) {
            await new Promise(resolve => setTimeout(resolve, 100)); // Reduced from 200ms to 100ms
          }
        }
        
        // Process stocks needing 5-year data in parallel batches (was sequential)
        const FIVE_YEAR_BATCH_SIZE = 5; // Process 5-year data in smaller batches
        for (let i = 0; i < stocksNeeding5Year.length; i += FIVE_YEAR_BATCH_SIZE) {
          const batch = stocksNeeding5Year.slice(i, i + FIVE_YEAR_BATCH_SIZE);
          const batchPromises = batch.map(async (holdingIsin) => {
            try {
              const count = await fetchAndStoreHistoricalData(holdingIsin, true);
              return { success: true, count, isin: holdingIsin };
            } catch (error: any) {
              return { success: false, error: error.message, isin: holdingIsin };
            }
          });
          
          const batchResults = await Promise.all(batchPromises);
          batchResults.forEach(result => {
            if (result.success) {
              stocksFetched5Year++;
              totalFetched += result.count || 0;
              stocksProcessed++;
            } else {
              errors.push(`${result.isin}: ${result.error || 'Unknown error'}`);
            }
          });
          
          // Delay between batches for 5-year data (longer to avoid rate limits)
          if (i + FIVE_YEAR_BATCH_SIZE < stocksNeeding5Year.length) {
            await new Promise(resolve => setTimeout(resolve, 500)); // Reduced from 800ms per stock to 500ms per batch
          }
        }
      }
      
      console.log(`✅ Refresh completed: ${stocksProcessed} processed (${stocksWith5YearData} refreshed, ${stocksFetched5Year} fetched 5-year), ${totalFetched} records`);
      
      // Update lastUpdated timestamp
      const refreshTime = new Date();
      try {
        await Holding.updateMany(
          { clientId },
          { $set: { lastUpdated: refreshTime } }
        );
      } catch (updateError) {
        // Continue even if timestamp update fails
      }
      
      // Create message
      let message = `Found ${foundInDB} stocks already up-to-date in database.`;
      if (stocksProcessed > 0) {
        message += ` Refreshed ${stocksProcessed} stocks (${totalFetched} records).`;
      } else {
        message += ` All stocks are up-to-date!`;
      }
      
      return NextResponse.json({
        success: true,
        message,
        stocksProcessed,
        stocksWith5YearData,
        stocksFetched5Year,
        foundInDatabase: foundInDB,
        totalRecords: totalFetched,
        refreshTime: refreshTime.toISOString(),
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    // Handle fetching prices for specific ISINs (e.g., from RealizedStocksTable)
    if (isins && Array.isArray(isins) && isins.length > 0) {
      console.log(`📊 Fetching current prices for ${isins.length} ISINs from database first, then API if missing...`);
      
      const StockData = (await import('@/models/StockData')).default;
      const StockMaster = (await import('@/models/StockMaster')).default;
      
      // Check database first for current prices (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const isinsNeedingFetch: string[] = [];
      let foundInDB = 0;
      
      for (const isin of isins) {
        const latestData: any = await StockData.findOne({ 
          isin,
          date: { $gte: sevenDaysAgo }
        })
          .sort({ date: -1 })
          .lean();
        
        if (!latestData || !latestData.close || latestData.close <= 0) {
          isinsNeedingFetch.push(isin);
        } else {
          foundInDB++;
        }
      }
      
      console.log(`✅ Found ${foundInDB} stocks with recent prices in database, ${isinsNeedingFetch.length} need fetching`);
      
      // Only fetch missing ones in batches to avoid timeout
      let fetchedCount = 0;
      const BATCH_SIZE = 5; // Smaller batches to avoid timeout
      
      for (let i = 0; i < isinsNeedingFetch.length; i += BATCH_SIZE) {
        const batch = isinsNeedingFetch.slice(i, i + BATCH_SIZE);
        console.log(`🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(isinsNeedingFetch.length / BATCH_SIZE)} (${batch.length} stocks)...`);
        
        await Promise.all(batch.map(async (isin) => {
          try {
            // Only fetch last 3 days (including today) for missing prices
            const count = await fetchAndStoreHistoricalData(isin, false);
            fetchedCount += count;
          } catch (error: any) {
            console.error(`Error fetching ${isin}:`, error?.message);
          }
        }));
        
        // Delay between batches
        if (i + BATCH_SIZE < isinsNeedingFetch.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      return NextResponse.json({
        success: true,
        message: `Found ${foundInDB} stocks in database, fetched ${fetchedCount} records for ${isinsNeedingFetch.length} missing stocks`,
        stocksProcessed: isinsNeedingFetch.length,
        foundInDatabase: foundInDB,
        totalRecords: fetchedCount,
      });
    }

    if (isin) {
      // Fetch data for specific stock
      const count = await fetchAndStoreHistoricalData(isin);
      return NextResponse.json({
        success: true,
        message: `Fetched ${count} records for ISIN ${isin}`,
        count,
      });
    } else if (fetchHoldings) {
      // Fetch data only for holdings
      const Holding = (await import('@/models/Holding')).default;
      const searchParams = request.nextUrl.searchParams;
      const clientId = searchParams.get('clientId') || '994826';
      const isRefresh = body.refresh === true;
      
      const holdings = await Holding.find({ clientId }).select('isin').lean();
      const uniqueIsins = [...new Set(holdings.map((h: any) => h.isin).filter(Boolean))];
      
      let totalFetched = 0;
      let stocksProcessed = 0;
      const errors: string[] = [];
      
      for (let i = 0; i < uniqueIsins.length; i++) {
        const holdingIsin = uniqueIsins[i];
        try {
          if (isRefresh) {
            const hasComplete = await hasComplete5YearData(holdingIsin);
            if (hasComplete) {
              const count = await fetchAndStoreHistoricalData(holdingIsin, false);
              totalFetched += count;
              stocksProcessed++;
            } else {
              const count = await fetchAndStoreHistoricalData(holdingIsin, true);
              totalFetched += count;
              stocksProcessed++;
            }
          } else {
            const count = await fetchAndStoreHistoricalData(holdingIsin, true);
            totalFetched += count;
            stocksProcessed++;
          }
          
          if ((i + 1) % 5 === 0) {
            console.log(`Progress: ${i + 1}/${uniqueIsins.length} holdings processed`);
          }
        } catch (error: any) {
          console.error(`Error fetching data for ${holdingIsin}:`, error);
          errors.push(`${holdingIsin}: ${error.message || 'Unknown error'}`);
        }
        
        // Add delay to avoid rate limiting
        if (i < uniqueIsins.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      return NextResponse.json({
        success: true,
        message: `Fetched historical data for ${stocksProcessed}/${uniqueIsins.length} holdings (${totalFetched} total records)`,
        stocksProcessed,
        totalRecords: totalFetched,
        errors: errors.length > 0 ? errors : undefined,
      });
    } else if (body.fetchAllStocks === true) {
      // Fetch data for all stocks in StockMaster (this will take a very long time)
      const allStocks = await StockMaster.find({}).select('isin').lean();
      const uniqueIsins = [...new Set(allStocks.map((s: any) => s.isin).filter(Boolean))];
      
      console.log(`🚀 Starting to fetch COMPREHENSIVE 5-year data for all ${uniqueIsins.length} stocks from StockMaster...`);
      console.log(`📊 Database: ${(await connectDB()).connection.db?.databaseName || 'unknown'}`);
      console.log(`📦 Collection name for StockData: ${(await import('@/models/StockData')).default.collection.name}`);
      console.log(`📈 Data types being fetched: OHLC, Volume, PE (trailing/forward), MarketCap, P/B, Dividend Yield, 52W High/Low, Average Volume`);
      console.log(`⏰ Estimated time: ~${Math.ceil(uniqueIsins.length * 1.5 / 60)} minutes at 1.5 sec/stock`);
      
      // Process in background and return immediately
      (async () => {
        let totalFetched = 0;
        let stocksProcessed = 0;
        
        for (let i = 0; i < uniqueIsins.length; i++) {
          const isin = uniqueIsins[i];
          try {
            const count = await fetchAndStoreHistoricalData(isin, true);
            totalFetched += count;
            stocksProcessed++;
            
            if ((i + 1) % 10 === 0) {
              console.log(`📊 Background progress: ${i + 1}/${uniqueIsins.length} stocks processed (${totalFetched} records)`);
              console.log(`💾 Total records stored so far: ${totalFetched}`);
              console.log(`⏱️  Estimated time remaining: ~${Math.ceil((uniqueIsins.length - i - 1) * 1.5 / 60)} minutes`);
            }
            
            // Log every stock for first 5 to show what's being stored
            if (i < 5) {
              console.log(`✅ Stock ${i + 1}/${uniqueIsins.length}: Fetched ${count} records with comprehensive data`);
            }
          } catch (error: any) {
            console.error(`Error fetching data for ${isin}:`, error);
          }
          
          // Add delay to avoid rate limiting (longer delay since we're fetching comprehensive data including fundamentals)
          if (i < uniqueIsins.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 seconds between stocks
          }
        }
        
        console.log(`Background fetch completed: ${stocksProcessed}/${uniqueIsins.length} stocks, ${totalFetched} records`);
      })().catch(console.error);
      
      return NextResponse.json({
        success: true,
        message: `Started fetching historical data for all ${uniqueIsins.length} stocks in the background. This will take a very long time. Check server logs for progress.`,
        totalStocks: uniqueIsins.length,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Please provide isin, isins array, fetchHoldings=true, or fetchAllStocks=true',
      }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Error in fetch-historical-data API:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch historical data' },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check status or trigger fetch for holdings
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get('clientId') || '994826';
    
    // Get holdings to fetch data for
    const Holding = (await import('@/models/Holding')).default;
    const holdings = await Holding.find({ clientId }).select('isin').lean();
    
    const uniqueIsins = [...new Set(holdings.map(h => h.isin))];
    
    // Check how many stocks we have data for
    const stockDataCount = await StockMaster.countDocuments({});
    const dataAvailableCount = await Promise.all(
      uniqueIsins.map(async (isin) => {
        const StockData = (await import('@/models/StockData')).default;
        const count = await StockData.countDocuments({ isin });
        return count > 0;
      })
    ).then(results => results.filter(Boolean).length);

    return NextResponse.json({
      success: true,
      data: {
        totalHoldings: uniqueIsins.length,
        dataAvailableFor: dataAvailableCount,
        totalStocksInMaster: stockDataCount,
        isins: uniqueIsins,
      },
    });
  } catch (error: any) {
    console.error('Error in fetch-historical-data GET:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check status' },
      { status: 500 }
    );
  }
}

