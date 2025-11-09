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
    console.log('📥 POST /api/fetch-historical-data - Starting request...');
    
    const connection = await connectDB();
    const dbName = connection.connection.db?.databaseName || 'unknown';
    console.log(`🔗 Connected to database: ${dbName}`);
    console.log(`🌐 Connection host: ${connection.connection.host}`);
    console.log(`📝 Connection name: ${connection.connection.name}`);

    let body: any = {};
    try {
      body = await request.json();
    } catch (jsonError: any) {
      console.warn('⚠️  Failed to parse request body, using empty object:', jsonError.message);
      body = {};
    }
    
    const { isin, isins, fetchHoldings, refreshLatest } = body;
    console.log(`📋 Request body:`, { isin: !!isin, isins: !!isins, isinsLength: Array.isArray(isins) ? isins.length : 0, fetchHoldings, refreshLatest });
    
    // Handle daily refresh (last 3 days including today)
    if (refreshLatest === true) {
      console.log('🔄 Starting refreshLatest operation...');
      
      try {
        const Holding = (await import('@/models/Holding')).default;
        const StockData = (await import('@/models/StockData')).default;
        const searchParams = request.nextUrl.searchParams;
        const clientId = searchParams.get('clientId') || '994826';
        const refreshAllStocks = searchParams.get('refreshAllStocks') === 'true'; // New parameter to control if we refresh all stocks
        
        console.log(`📋 Client ID: ${clientId}`);
        console.log(`📋 Refresh All Stocks: ${refreshAllStocks}`);
        
        // Get holdings ISINs (priority 1)
        let holdings: any[] = [];
        try {
          holdings = await Holding.find({ clientId }).select('isin').lean();
          console.log(`✅ Fetched ${holdings.length} holdings`);
        } catch (holdingsError: any) {
          console.error('❌ Error fetching holdings:', holdingsError.message);
          throw new Error(`Failed to fetch holdings: ${holdingsError.message}`);
        }
        
        const holdingsIsins = new Set([...new Set(holdings.map((h: any) => h.isin).filter(Boolean))]);
        const priorityIsins = Array.from(holdingsIsins);
        
        let uniqueIsins: string[] = [...priorityIsins];
        
        // Only get ALL stocks if explicitly requested (for cron job or manual trigger)
        if (refreshAllStocks) {
          const StockMaster = (await import('@/models/StockMaster')).default;
          let allStocks: any[] = [];
          try {
            allStocks = await StockMaster.find({}).select('isin').lean();
            console.log(`✅ Fetched ${allStocks.length} stocks from StockMaster`);
          } catch (stocksError: any) {
            console.error('❌ Error fetching stocks from StockMaster:', stocksError.message);
            // Continue with just holdings if StockMaster fetch fails
            allStocks = [];
          }
          
          const allStockIsins = new Set([...new Set(allStocks.map((s: any) => s.isin).filter(Boolean))]);
          const otherIsins = Array.from(allStockIsins).filter(isin => !holdingsIsins.has(isin));
          uniqueIsins = [...priorityIsins, ...otherIsins];
          
          console.log(`🔄 Refreshing latest 3 days of data for ALL stocks:`);
          console.log(`   - Priority (Holdings): ${priorityIsins.length} stocks`);
          console.log(`   - Additional (All Stocks): ${otherIsins.length} stocks`);
          console.log(`   - Total: ${uniqueIsins.length} stocks`);
        } else {
          // Only refresh holdings (much faster!)
          console.log(`🔄 Refreshing latest 3 days of data for HOLDINGS ONLY:`);
          console.log(`   - Holdings: ${priorityIsins.length} stocks`);
        }
      
      // OPTIMIZED: Use MongoDB aggregation to check ALL ISINs at once for today's data
      // Account for timezone: IST is UTC+5:30, so data stored at 18:30 UTC on Nov 4 = 00:00 IST on Nov 5
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterdayEvening = new Date(today);
      yesterdayEvening.setDate(yesterdayEvening.getDate() - 1);
      yesterdayEvening.setUTCHours(18, 30, 0, 0); // 18:30 UTC = 00:00 IST next day
      
      const todayEnd = new Date(today);
      todayEnd.setUTCHours(23, 59, 59, 999);
      
      let todayDataResults: any[] = [];
      let foundInDB = 0;
      
      try {
        // Get all ISINs with today's data in ONE query using aggregation
        // Check from yesterday 18:30 UTC onwards to catch today's data
        if (uniqueIsins.length > 0) {
          todayDataResults = await StockData.aggregate([
            {
              $match: {
                isin: { $in: uniqueIsins },
                date: { $gte: yesterdayEvening, $lte: todayEnd },
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
          ]).allowDiskUse(true);
        }
      } catch (aggregateError: any) {
        console.error('❌ Error in aggregation query for today\'s data:', aggregateError.message);
        // Continue with empty results - will fetch all stocks
        todayDataResults = [];
      }
      
      const isinsWithTodayData = new Set(todayDataResults.map(r => r._id));
      const isinsNeedingFetch = uniqueIsins.filter(isin => !isinsWithTodayData.has(isin));
      foundInDB = isinsWithTodayData.size;
      
      console.log(`✅ Found ${foundInDB} stocks with TODAY's data in database (via aggregation), ${isinsNeedingFetch.length} need fetching from API`);
      
        // Only process holdings if refreshAllStocks is false, otherwise process all
        let isinsToProcess: string[] = [];
        if (refreshAllStocks) {
          // Separate holdings (priority) from other stocks
          const holdingsNeedingFetch = isinsNeedingFetch.filter(isin => holdingsIsins.has(isin));
          const otherStocksNeedingFetch = isinsNeedingFetch.filter(isin => !holdingsIsins.has(isin));
          
          console.log(`   - Priority (Holdings) needing fetch: ${holdingsNeedingFetch.length}`);
          console.log(`   - Additional stocks needing fetch: ${otherStocksNeedingFetch.length}`);
          
          // Process holdings first (priority), then other stocks
          isinsToProcess = [...holdingsNeedingFetch, ...otherStocksNeedingFetch];
        } else {
          // Only process holdings (much faster!)
          isinsToProcess = isinsNeedingFetch.filter(isin => holdingsIsins.has(isin));
          console.log(`   - Holdings needing fetch: ${isinsToProcess.length}`);
        }
        
        // Only fetch missing ones - process in parallel batches to be faster
        let totalFetched = 0;
        let stocksProcessed = 0;
        let stocksWith5YearData = 0;
        let stocksFetched5Year = 0;
        const errors: string[] = [];
        
        if (isinsToProcess.length > 0) {
        // OPTIMIZED: Use MongoDB aggregation to check which stocks have 5-year data (parallel batch check)
        // Check counts of records per ISIN - if >= 1000 records, assume 5-year data exists
        let dataCountResults: any[] = [];
        try {
          if (isinsToProcess.length > 0) {
            dataCountResults = await StockData.aggregate([
              {
                $match: {
                  isin: { $in: isinsToProcess }
                }
              },
              {
                $group: {
                  _id: '$isin',
                  count: { $sum: 1 }
                }
              }
            ]).allowDiskUse(true);
          }
        } catch (countAggregateError: any) {
          console.error('❌ Error in aggregation query for data counts:', countAggregateError.message);
          // Continue with empty results - will treat all as needing 5-year data
          dataCountResults = [];
        }
        
        const isinCountMap = new Map(dataCountResults.map(r => [r._id, r.count]));
        const STOCK_DATA_THRESHOLD = 1000; // ~5 years of trading days
        
        const stocksNeeding5Year: string[] = [];
        const stocksNeedingRefresh: string[] = [];
        
        for (const isin of isinsToProcess) {
          const count = isinCountMap.get(isin) || 0;
          if (count >= STOCK_DATA_THRESHOLD) {
            stocksNeedingRefresh.push(isin);
          } else {
            stocksNeeding5Year.push(isin);
          }
        }
        
        console.log(`📊 ${stocksNeeding5Year.length} stocks need 5-year data, ${stocksNeedingRefresh.length} need refresh (via aggregation)`);
        
        // Process stocks needing refresh in LARGER parallel batches (faster)
        // PRIORITY: Use NSE API first for current prices
        const REFRESH_BATCH_SIZE = 50; // Increased batch size for faster processing (NSE API is fast)
        let fetchCurrentPriceFromNSE: any = null;
        try {
          const stockServiceModule = await import('@/lib/stockDataService');
          fetchCurrentPriceFromNSE = stockServiceModule.fetchCurrentPriceFromNSE;
        } catch (importError: any) {
          console.warn('⚠️  Failed to import fetchCurrentPriceFromNSE, will use Yahoo Finance only:', importError.message);
        }
        
        // StockData is already imported at the top of the refreshLatest block
        
        console.log(`⚡ Processing ${stocksNeedingRefresh.length} stocks needing refresh in batches of ${REFRESH_BATCH_SIZE}...`);
        
        for (let i = 0; i < stocksNeedingRefresh.length; i += REFRESH_BATCH_SIZE) {
          const batch = stocksNeedingRefresh.slice(i, i + REFRESH_BATCH_SIZE);
          const batchStartTime = Date.now();
          console.log(`   Batch ${Math.floor(i / REFRESH_BATCH_SIZE) + 1}/${Math.ceil(stocksNeedingRefresh.length / REFRESH_BATCH_SIZE)}: Processing ${batch.length} stocks...`);
          
          // Pre-fetch all StockMaster data for this batch to avoid repeated queries
          const StockMaster = (await import('@/models/StockMaster')).default;
          const stockMasterMap = new Map<string, any>();
          try {
            const batchStocks = await StockMaster.find({ isin: { $in: batch } }).select('isin symbol exchange stockName').lean();
            batchStocks.forEach((s: any) => {
              stockMasterMap.set(s.isin, s);
            });
          } catch (stockMasterError: any) {
            console.warn(`⚠️  Failed to pre-fetch StockMaster data: ${stockMasterError.message}`);
          }
          
          const batchPromises = batch.map(async (holdingIsin) => {
            try {
              // PRIORITY: Try NSE API first for NSE stocks (much faster than Yahoo Finance)
              const stockDoc = stockMasterMap.get(holdingIsin);
              
              if (stockDoc && stockDoc.symbol && stockDoc.exchange === 'NSE' && fetchCurrentPriceFromNSE) {
                try {
                  // Add timeout for NSE API call (5 seconds max - NSE is usually fast)
                  const nseTimeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('NSE API timeout')), 5000)
                  );
                  
                  const nsePriceData = await Promise.race([
                    fetchCurrentPriceFromNSE(stockDoc.symbol),
                    nseTimeoutPromise
                  ]) as any;
                  
                  if (nsePriceData && nsePriceData.price && isFinite(nsePriceData.price)) {
                    // Always use today's date (not the date from NSE metadata, which might be yesterday)
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    console.log(`✅ NSE API: ${stockDoc.symbol} (${holdingIsin}) - Price: ₹${nsePriceData.price}`);
                    
                    await StockData.findOneAndUpdate(
                      {
                        isin: holdingIsin,
                        date: today
                      },
                      {
                        isin: holdingIsin,
                        stockName: stockDoc.stockName || '',
                        symbol: stockDoc.symbol,
                        exchange: stockDoc.exchange,
                        date: today,
                        open: nsePriceData.price,
                        high: nsePriceData.price,
                        low: nsePriceData.price,
                        close: nsePriceData.price,
                        currentPrice: nsePriceData.price,
                        volume: 0,
                        lastUpdated: new Date()
                      },
                      { upsert: true, new: true }
                    );
                    
                    return { success: true, count: 1, isin: holdingIsin, source: 'NSE', price: nsePriceData.price };
                  } else {
                    console.log(`⚠️  NSE API: ${stockDoc.symbol} (${holdingIsin}) - No valid price returned, falling back to Yahoo Finance`);
                  }
                } catch (nseError: any) {
                  // Log error for debugging but continue with fallback
                  if (nseError.message !== 'NSE API timeout') {
                    console.log(`⚠️  NSE API failed for ${stockDoc.symbol} (${holdingIsin}): ${nseError.message}, falling back to Yahoo Finance`);
                  }
                }
              }
              
              // Fallback: Use Yahoo Finance for historical data (only if NSE failed or not NSE stock)
              const count = await fetchAndStoreHistoricalData(holdingIsin, false);
              return { success: true, count, isin: holdingIsin, source: 'Yahoo' };
            } catch (error: any) {
              return { success: false, error: error.message, isin: holdingIsin };
            }
          });
          
          const batchResults = await Promise.all(batchPromises);
          const nseCount = batchResults.filter(r => r.source === 'NSE').length;
          const yahooCount = batchResults.filter(r => r.source === 'Yahoo').length;
          
          batchResults.forEach(result => {
            if (result.success) {
              stocksWith5YearData++;
              totalFetched += result.count || 0;
              stocksProcessed++;
            } else {
              errors.push(`${result.isin}: ${result.error || 'Unknown error'}`);
            }
          });
          
          const batchTime = ((Date.now() - batchStartTime) / 1000).toFixed(1);
          console.log(`   ✅ Batch ${Math.floor(i / REFRESH_BATCH_SIZE) + 1} completed in ${batchTime}s (${nseCount} NSE, ${yahooCount} Yahoo)`);
          
          // No delay between batches - NSE API is fast and can handle parallel requests
        }
        
        // Process stocks needing 5-year data
        if (stocksNeeding5Year.length > 0) {
          if (refreshAllStocks) {
            // Fetch full 5-year data
            console.log(`📊 Fetching 5-year data for ${stocksNeeding5Year.length} stocks...`);
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
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }
          } else {
            // For regular refresh, still fetch today's price for stocks with no data
            // This ensures holdings always have current prices even if they don't have historical data
            console.log(`📊 Fetching today's price for ${stocksNeeding5Year.length} stocks with no data (refreshAllStocks=false, fetching last 3 days only)...`);
            
            // Pre-fetch StockMaster data
            const StockMaster = (await import('@/models/StockMaster')).default;
            const stockMasterMap = new Map<string, any>();
            try {
              const batchStocks = await StockMaster.find({ isin: { $in: stocksNeeding5Year } })
                .select('isin symbol exchange stockName')
                .lean();
              batchStocks.forEach((s: any) => {
                stockMasterMap.set(s.isin, s);
              });
            } catch (stockMasterError: any) {
              console.warn(`⚠️  Failed to pre-fetch StockMaster data: ${stockMasterError.message}`);
            }
            
            // Process in batches with NSE API priority
            const NO_DATA_BATCH_SIZE = 50;
            for (let i = 0; i < stocksNeeding5Year.length; i += NO_DATA_BATCH_SIZE) {
              const batch = stocksNeeding5Year.slice(i, i + NO_DATA_BATCH_SIZE);
              const batchStartTime = Date.now();
              console.log(`   Batch ${Math.floor(i / NO_DATA_BATCH_SIZE) + 1}/${Math.ceil(stocksNeeding5Year.length / NO_DATA_BATCH_SIZE)}: Processing ${batch.length} stocks with no data...`);
              
              const batchPromises = batch.map(async (holdingIsin) => {
                try {
                  // PRIORITY: Try NSE API first for NSE stocks
                  const stockDoc = stockMasterMap.get(holdingIsin);
                  
                  if (stockDoc && stockDoc.symbol && stockDoc.exchange === 'NSE' && fetchCurrentPriceFromNSE) {
                    try {
                      const nseTimeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('NSE API timeout')), 5000)
                      );
                      
                      const nsePriceData = await Promise.race([
                        fetchCurrentPriceFromNSE(stockDoc.symbol),
                        nseTimeoutPromise
                      ]) as any;
                      
                      if (nsePriceData && nsePriceData.price && isFinite(nsePriceData.price)) {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        
                        console.log(`✅ NSE API: ${stockDoc.symbol} (${holdingIsin}) - Price: ₹${nsePriceData.price}`);
                        
                        await StockData.findOneAndUpdate(
                          {
                            isin: holdingIsin,
                            date: today
                          },
                          {
                            isin: holdingIsin,
                            stockName: stockDoc.stockName || '',
                            symbol: stockDoc.symbol,
                            exchange: stockDoc.exchange,
                            date: today,
                            open: nsePriceData.price,
                            high: nsePriceData.price,
                            low: nsePriceData.price,
                            close: nsePriceData.price,
                            currentPrice: nsePriceData.price,
                            volume: 0,
                            lastUpdated: new Date()
                          },
                          { upsert: true, new: true }
                        );
                        
                        return { success: true, count: 1, isin: holdingIsin, source: 'NSE', price: nsePriceData.price };
                      }
                    } catch (nseError: any) {
                      if (nseError.message !== 'NSE API timeout') {
                        console.log(`⚠️  NSE API failed for ${stockDoc.symbol} (${holdingIsin}): ${nseError.message}, falling back to Yahoo Finance`);
                      }
                    }
                  }
                  
                  // Fallback: Use fetchAndStoreHistoricalData (fetches last 3 days)
                  const count = await fetchAndStoreHistoricalData(holdingIsin, false);
                  return { success: true, count, isin: holdingIsin, source: 'Yahoo' };
                } catch (error: any) {
                  return { success: false, error: error.message, isin: holdingIsin };
                }
              });
              
              const batchResults = await Promise.all(batchPromises);
              const nseCount = batchResults.filter(r => r.source === 'NSE').length;
              const yahooCount = batchResults.filter(r => r.source === 'Yahoo').length;
              
              batchResults.forEach(result => {
                if (result.success) {
                  stocksWith5YearData++;
                  totalFetched += result.count || 0;
                  stocksProcessed++;
                } else {
                  errors.push(`${result.isin}: ${result.error || 'Unknown error'}`);
                }
              });
              
              const batchTime = ((Date.now() - batchStartTime) / 1000).toFixed(1);
              console.log(`   ✅ Batch ${Math.floor(i / NO_DATA_BATCH_SIZE) + 1} completed in ${batchTime}s (${nseCount} NSE, ${yahooCount} Yahoo)`);
            }
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
        } catch (updateError: any) {
          // Continue even if timestamp update fails
          console.warn('⚠️  Failed to update lastUpdated timestamp:', updateError.message);
        }
        
        // Cleanup old data (older than 2 years) to maintain database size
        console.log('\n🧹 Starting automatic cleanup of old stock data (older than 2 years)...');
        let cleanupResult: any = null;
        try {
          const { cleanupOldStockData } = await import('@/lib/cleanupOldStockData');
          cleanupResult = await cleanupOldStockData();
          if (cleanupResult.success) {
            console.log(`✅ Cleanup completed: Deleted ${cleanupResult.deletedCount.toLocaleString()} old records`);
          } else {
            console.warn(`⚠️  Cleanup had issues: ${cleanupResult.error || 'Unknown error'}`);
          }
        } catch (cleanupError: any) {
          console.warn(`⚠️  Cleanup failed (non-critical): ${cleanupError.message}`);
          // Don't fail the entire refresh if cleanup fails
        }
        
        // Create message
        let message = `Found ${foundInDB} stocks already up-to-date in database.`;
        if (stocksProcessed > 0) {
          message += ` Refreshed ${stocksProcessed} stocks (${totalFetched} records).`;
        } else {
          message += ` All stocks are up-to-date!`;
        }
        if (cleanupResult && cleanupResult.success && cleanupResult.deletedCount > 0) {
          message += ` Cleaned up ${cleanupResult.deletedCount.toLocaleString()} old records (older than 2 years).`;
        }
        
        console.log('✅ Returning success response for refreshLatest');
        return NextResponse.json({
          success: true,
          message,
          stocksProcessed,
          stocksWith5YearData,
          stocksFetched5Year,
          foundInDatabase: foundInDB,
          totalRecords: totalFetched,
          refreshTime: refreshTime.toISOString(),
          cleanup: cleanupResult ? {
            deletedCount: cleanupResult.deletedCount,
            cutoffDate: cleanupResult.cutoffDate?.toISOString(),
          } : undefined,
          errors: errors.length > 0 ? errors : undefined,
        });
      } catch (refreshError: any) {
        console.error('❌ Error in refreshLatest block:', refreshError);
        throw refreshError; // Re-throw to be caught by outer catch
      }
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
      
      // PRIORITY: Use NSE API first for current prices (faster for NSE stocks)
      let fetchedCount = 0;
      const BATCH_SIZE = 10; // Can process more in parallel with NSE API
      let fetchCurrentPriceFromNSE: any = null;
      try {
        const stockServiceModule = await import('@/lib/stockDataService');
        fetchCurrentPriceFromNSE = stockServiceModule.fetchCurrentPriceFromNSE;
      } catch (importError: any) {
        console.warn('⚠️  Failed to import fetchCurrentPriceFromNSE, will use Yahoo Finance only:', importError.message);
      }
      
      for (let i = 0; i < isinsNeedingFetch.length; i += BATCH_SIZE) {
        const batch = isinsNeedingFetch.slice(i, i + BATCH_SIZE);
        console.log(`🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(isinsNeedingFetch.length / BATCH_SIZE)} (${batch.length} stocks)...`);
        
        // PRIORITY: Try NSE API first for current prices (parallel processing)
        await Promise.all(batch.map(async (isin) => {
          try {
            const stock = await StockMaster.findOne({ isin }).lean();
            const stockDoc = stock as any;
            
            // Try NSE API first if it's an NSE stock
            if (stockDoc && stockDoc.symbol && stockDoc.exchange === 'NSE' && fetchCurrentPriceFromNSE) {
              try {
                // Add timeout for NSE API call (5 seconds max)
                const nseTimeoutPromise = new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('NSE API timeout')), 5000)
                );
                
                const nsePriceData = await Promise.race([
                  fetchCurrentPriceFromNSE(stockDoc.symbol),
                  nseTimeoutPromise
                ]) as any;
                
                if (nsePriceData && nsePriceData.price && isFinite(nsePriceData.price)) {
                  // Always use today's date (not the date from NSE metadata, which might be yesterday)
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  
                  await StockData.findOneAndUpdate(
                    {
                      isin,
                      date: today
                    },
                    {
                      isin,
                      stockName: stockDoc.stockName || '',
                      symbol: stockDoc.symbol,
                      exchange: stockDoc.exchange,
                      date: today,
                      open: nsePriceData.price,
                      high: nsePriceData.price,
                      low: nsePriceData.price,
                      close: nsePriceData.price,
                      currentPrice: nsePriceData.price,
                      volume: 0,
                      lastUpdated: new Date()
                    },
                    { upsert: true, new: true }
                  );
                  
                  fetchedCount++;
                  console.log(`✅ [NSE] ${stockDoc.symbol} (${isin}): ₹${nsePriceData.price}`);
                  return; // Success, skip Yahoo Finance
                }
              } catch (nseError: any) {
                // Silently fail and fall back to Yahoo Finance
                console.debug(`⚠️  NSE API failed for ${stockDoc.symbol}: ${nseError.message || 'Unknown error'}`);
              }
            }
            
            // Fallback: Use Yahoo Finance for historical data or if NSE failed
            const count = await fetchAndStoreHistoricalData(isin, false);
            fetchedCount += count;
          } catch (error: any) {
            console.error(`Error fetching ${isin}:`, error?.message);
          }
        }));
        
        // Delay between batches (reduced since NSE is faster)
        if (i + BATCH_SIZE < isinsNeedingFetch.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
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
      // Check if stock has complete 5-year data, if not, fetch full 5 years
      const hasComplete = await hasComplete5YearData(isin);
      const forceFullUpdate = !hasComplete; // Force full update if data is incomplete
      
      console.log(`📊 Stock ${isin} has complete 5-year data: ${hasComplete}, forceFullUpdate: ${forceFullUpdate}`);
      
      const count = await fetchAndStoreHistoricalData(isin, forceFullUpdate);
      return NextResponse.json({
        success: true,
        message: `Fetched ${count} records for ISIN ${isin}${forceFullUpdate ? ' (full 5-year fetch)' : ' (last 3 days refresh)'}`,
        count,
        forceFullUpdate,
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
    const errorDetails = {
      message: error?.message || 'Unknown error',
      name: error?.name || 'Error',
      code: error?.code,
      stack: error?.stack,
    };
    
    console.error('='.repeat(60));
    console.error('fetch-historical-data API ERROR - Full Details:');
    console.error('='.repeat(60));
    console.error('Error message:', errorDetails.message);
    console.error('Error name:', errorDetails.name);
    console.error('Error code:', errorDetails.code);
    if (errorDetails.stack) {
      console.error('Error stack:', errorDetails.stack.substring(0, 1000));
    }
    console.error('='.repeat(60));
    
    try {
      return NextResponse.json(
        { 
          success: false,
          error: errorDetails.message || 'Failed to fetch historical data',
          errorName: errorDetails.name,
          errorCode: errorDetails.code,
          details: process.env.NODE_ENV === 'development' ? errorDetails.stack?.substring(0, 1000) : undefined,
        },
        { status: 500 }
      );
    } catch (jsonError: any) {
      console.error('Failed to create error response JSON:', jsonError);
      return new NextResponse(
        JSON.stringify({ 
          success: false,
          error: 'Internal server error',
          timestamp: new Date().toISOString(),
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
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

