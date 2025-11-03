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
      const searchParams = request.nextUrl.searchParams;
      const clientId = searchParams.get('clientId') || '994826';
      
      const holdings = await Holding.find({ clientId }).select('isin').lean();
      const uniqueIsins = [...new Set(holdings.map((h: any) => h.isin).filter(Boolean))];
      
      console.log(`🔄 Refreshing latest 3 days of data (including PE, MarketCap) for ${uniqueIsins.length} holdings (including today)...`);
      
      let totalFetched = 0;
      let stocksProcessed = 0;
      let stocksWith5YearData = 0;
      let stocksFetched5Year = 0;
      const errors: string[] = [];
      
      // Get stock names for better reporting
      const StockMaster = (await import('@/models/StockMaster')).default;
      
      // Process stocks that need 5-year data first (slower), then refresh others (faster)
      const stocksNeeding5Year: string[] = [];
      const stocksNeedingRefresh: string[] = [];
      
      // Pre-check which stocks need what
      for (const holdingIsin of uniqueIsins) {
        const has5YearData = await hasComplete5YearData(holdingIsin);
        if (!has5YearData) {
          stocksNeeding5Year.push(holdingIsin);
        } else {
          stocksNeedingRefresh.push(holdingIsin);
        }
      }
      
      console.log(`📊 Summary: ${stocksNeeding5Year.length} stocks need 5-year data, ${stocksNeedingRefresh.length} stocks need refresh`);
      
      // Process stocks needing 5-year data first
      for (let i = 0; i < stocksNeeding5Year.length; i++) {
        const holdingIsin = stocksNeeding5Year[i];
        try {
          const stockMaster = await StockMaster.findOne({ isin: holdingIsin }).lean();
          const stockName = stockMaster ? (stockMaster as any).stockName : holdingIsin;
          console.log(`📦 [${i + 1}/${stocksNeeding5Year.length}] Fetching initial 5-year data for ${stockName} (${holdingIsin})...`);
          
          const count = await fetchAndStoreHistoricalData(holdingIsin, true); // forceFullUpdate = true
          stocksFetched5Year++;
          totalFetched += count;
          stocksProcessed++;
          console.log(`✅ Fetched ${count} records (5 years) for ${stockName}`);
        } catch (error: any) {
          console.error(`Error fetching 5-year data for ${holdingIsin}:`, error);
          errors.push(`${holdingIsin}: ${error.message || 'Unknown error'}`);
        }
        
        // Add delay to avoid rate limiting (longer delay for 5-year fetches)
        if (i < stocksNeeding5Year.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second for 5-year fetches
        }
      }
      
      // Then refresh stocks with existing data (faster)
      for (let i = 0; i < stocksNeedingRefresh.length; i++) {
        const holdingIsin = stocksNeedingRefresh[i];
        try {
          const count = await fetchAndStoreHistoricalData(holdingIsin, false); // forceFullUpdate = false
          stocksWith5YearData++;
          totalFetched += count;
          stocksProcessed++;
          if ((i + 1) % 10 === 0) {
            console.log(`🔄 Progress: ${i + 1}/${stocksNeedingRefresh.length} stocks refreshed (last 3 days)`);
          }
        } catch (error: any) {
          console.error(`Error refreshing ${holdingIsin}:`, error);
          errors.push(`${holdingIsin}: ${error.message || 'Unknown error'}`);
        }
        
        // Add delay to avoid rate limiting (shorter delay for refreshes)
        if (i < stocksNeedingRefresh.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms for refreshes
        }
      }
      
      console.log(`✅ Refresh completed: ${stocksProcessed} processed (${stocksWith5YearData} refreshed last 3 days, ${stocksFetched5Year} fetched 5-year data), ${totalFetched} total records`);
      
      // Update lastUpdated timestamp for all holdings to reflect the refresh time
      const refreshTime = new Date();
      try {
        await Holding.updateMany(
          { clientId },
          { $set: { lastUpdated: refreshTime } }
        );
        console.log(`📅 Updated lastUpdated timestamp for holdings to: ${refreshTime.toISOString()}`);
      } catch (updateError) {
        console.error('Error updating holdings timestamp:', updateError);
        // Continue even if timestamp update fails
      }
      
      // Create detailed message
      let message = `Successfully processed ${stocksProcessed} stocks (${totalFetched} records).`;
      if (stocksWith5YearData > 0) {
        message += ` ${stocksWith5YearData} stock(s) refreshed (last 3 days).`;
      }
      if (stocksFetched5Year > 0) {
        message += ` ${stocksFetched5Year} stock(s) fetched initial 5-year data.`;
      }
      
      return NextResponse.json({
        success: true,
        message,
        stocksProcessed,
        stocksWith5YearData,
        stocksFetched5Year,
        totalRecords: totalFetched,
        refreshTime: refreshTime.toISOString(),
        errors: errors.length > 0 ? errors : undefined,
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
    } else if (isins && Array.isArray(isins) && isins.length > 0) {
      // Fetch data for provided array of ISINs (typically for realized stocks missing prices)
      // Always fetch at least last 3 days to get current price, or full 5 years if no data exists
      let totalFetched = 0;
      let stocksProcessed = 0;
      const uniqueIsins = [...new Set(isins)];
      const errors: string[] = [];
      
      console.log(`Starting to fetch data for ${uniqueIsins.length} stocks (for realized stocks)...`);
      
      // Get stock names for better error reporting
      const StockMaster = (await import('@/models/StockMaster')).default;
      
      for (let i = 0; i < uniqueIsins.length; i++) {
        const holdingIsin = uniqueIsins[i];
        try {
          // Get stock name for logging
          const stockMaster = await StockMaster.findOne({ isin: holdingIsin }).lean();
          const stockName = stockMaster ? (stockMaster as any).stockName : holdingIsin;
          console.log(`Processing stock ${i + 1}/${uniqueIsins.length}: ${stockName} (${holdingIsin})`);
          
          // Check if stock has any data
          const StockData = (await import('@/models/StockData')).default;
          const existingDataCount = await StockData.countDocuments({ isin: holdingIsin });
          
          if (existingDataCount === 0) {
            // No data exists - fetch full 5 years
            console.log(`📦 ${stockName} (${holdingIsin}) has no data, fetching full 5 years`);
            const count = await fetchAndStoreHistoricalData(holdingIsin, true);
            if (count === 0) {
              console.warn(`⚠️  ${stockName} (${holdingIsin}) - No data could be fetched. Check if symbol exists in StockMaster or if API has data for this stock.`);
              errors.push(`${stockName} (${holdingIsin}): No data available - symbol may not be found or stock may be delisted`);
            } else {
              totalFetched += count;
              stocksProcessed++;
              console.log(`✅ ${stockName} - Fetched ${count} records`);
            }
          } else {
            // Has some data - fetch last 3 days to ensure we have current price
            console.log(`🔄 ${stockName} (${holdingIsin}) has existing data, fetching last 3 days to update current price`);
            const count = await fetchAndStoreHistoricalData(holdingIsin, false);
            if (count === 0) {
              console.warn(`⚠️  ${stockName} (${holdingIsin}) - Could not fetch latest data.`);
              errors.push(`${stockName} (${holdingIsin}): Could not fetch latest data`);
            } else {
              totalFetched += count;
              stocksProcessed++;
            }
          }
          
          // Progress update every 5 stocks
          if ((i + 1) % 5 === 0) {
            console.log(`Progress: ${i + 1}/${uniqueIsins.length} stocks processed (${stocksProcessed} successful, ${errors.length} errors)`);
          }
        } catch (error: any) {
          console.error(`❌ Error fetching data for ${holdingIsin}:`, error);
          const stockMaster = await StockMaster.findOne({ isin: holdingIsin }).lean().catch(() => null);
          const stockName = stockMaster ? (stockMaster as any).stockName : holdingIsin;
          errors.push(`${stockName} (${holdingIsin}): ${error.message || 'Unknown error'}`);
          // Continue with next stock even if one fails
        }
        
        // Add delay to avoid rate limiting
        if (i < uniqueIsins.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      console.log(`Completed: ${stocksProcessed}/${uniqueIsins.length} stocks processed, ${totalFetched} total records`);
      
      return NextResponse.json({
        success: true,
        message: `Fetched data for ${stocksProcessed}/${uniqueIsins.length} stocks (${totalFetched} total records)`,
        stocksProcessed,
        totalRecords: totalFetched,
        errors: errors.length > 0 ? errors : undefined,
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

