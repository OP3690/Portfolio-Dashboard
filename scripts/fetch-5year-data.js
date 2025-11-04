/**
 * One-time script to fetch and store 5 years of historical OHLC data for all stocks
 * Run with: node scripts/fetch-5year-data.js
 * 
 * This script:
 * - Connects to MongoDB
 * - Gets all stocks from StockMaster
 * - Checks which stocks already have 5-year data
 * - Fetches 5 years of historical data for stocks that need it
 * - Stores data in stockdatas collection (duplicates prevented by unique index)
 * - Processes in batches to avoid rate limiting
 */

const mongoose = require('mongoose');
const axios = require('axios');
const { subDays, format } = require('date-fns');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
try {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([^=:#]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    });
    console.log('✅ Loaded environment variables from .env.local');
  }
} catch (e) {
  console.warn('⚠️  Could not load .env.local, using system environment variables');
}

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://root:zUQfjzImQWoof7xs@cluster0.cyu0ctf.mongodb.net/OP_Portfolio_Dashboard?retryWrites=true&w=majority&appName=Cluster0';

// Mongoose schemas
const StockMasterSchema = new mongoose.Schema({
  isin: String,
  stockName: String,
  symbol: String,
  exchange: String,
  sector: String,
  lastUpdated: Date,
}, { collection: 'stockmasters' });

const StockDataSchema = new mongoose.Schema({
  isin: { type: String, required: true, index: true },
  stockName: { type: String, required: true },
  symbol: String,
  exchange: String,
  date: { type: Date, required: true },
  open: Number,
  high: Number,
  low: Number,
  close: Number,
  volume: Number,
  currentPrice: Number,
  fiftyTwoWeekHigh: Number,
  fiftyTwoWeekLow: Number,
  averageVolume: Number,
  regularMarketVolume: Number,
  trailingPE: Number,
  forwardPE: Number,
  priceToBook: Number,
  marketCap: Number,
  dividendYield: Number,
  lastUpdated: Date,
}, { collection: 'stockdatas' });

// Ensure unique index on (isin, date) to prevent duplicates
StockDataSchema.index({ isin: 1, date: 1 }, { unique: true });

const StockMaster = mongoose.models.StockMaster || mongoose.model('StockMaster', StockMasterSchema);
const StockData = mongoose.models.StockData || mongoose.model('StockData', StockDataSchema);

// Configuration
const BATCH_SIZE = 5; // Process 5 stocks at a time (5-year fetches take longer)
const DELAY_BETWEEN_BATCHES = 3000; // 3 seconds between batches
const DELAY_BETWEEN_STOCKS = 500; // 500ms between stocks in a batch

/**
 * Fetch stock fundamentals from Yahoo Finance
 */
async function fetchStockFundamentals(symbol, exchange) {
  try {
    const yahooExchange = exchange.toUpperCase() === 'BSE' ? 'BO' : 'NS';
    const yahooSymbol = `${symbol}.${yahooExchange}`;
    
    const summaryUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${yahooSymbol}?modules=summaryProfile,defaultKeyStatistics,price,summaryDetail`;
    
    const response = await axios.get(summaryUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (response.data?.quoteSummary?.result?.[0]) {
      const result = response.data.quoteSummary.result[0];
      const keyStats = result.defaultKeyStatistics || {};
      const priceData = result.price || {};
      const summaryDetail = result.summaryDetail || {};
      
      return {
        trailingPE: keyStats.trailingPE?.raw || keyStats.trailingPE,
        forwardPE: keyStats.forwardPE?.raw || keyStats.forwardPE,
        priceToBook: keyStats.priceToBook?.raw || keyStats.priceToBook,
        marketCap: keyStats.marketCap?.raw || keyStats.marketCap,
        dividendYield: summaryDetail.dividendYield?.raw || summaryDetail.dividendYield,
        fiftyTwoWeekHigh: priceData.fiftyTwoWeekHigh?.raw || priceData.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: priceData.fiftyTwoWeekLow?.raw || priceData.fiftyTwoWeekLow,
        averageVolume: summaryDetail.averageVolume?.raw || summaryDetail.averageVolume || keyStats.averageDailyVolume10Day?.raw || keyStats.averageDailyVolume10Day,
        regularMarketVolume: priceData.regularMarketVolume?.raw || priceData.regularMarketVolume,
        currentPrice: priceData.regularMarketPrice?.raw || priceData.regularMarketPrice || priceData.preMarketPrice?.raw || priceData.preMarketPrice,
      };
    }
  } catch (error) {
    // Silently fail - fundamentals are optional
  }
  
  return {};
}

/**
 * Fetch historical OHLC data from Yahoo Finance
 */
async function fetchHistoricalData(symbol, exchange, fromDate, toDate) {
  try {
    const yahooExchange = exchange.toUpperCase() === 'BSE' ? 'BO' : 'NS';
    const yahooSymbol = `${symbol}.${yahooExchange}`;
    const fromTimestamp = Math.floor(fromDate.getTime() / 1000);
    const toTimestamp = Math.floor(toDate.getTime() / 1000);
    
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?period1=${fromTimestamp}&period2=${toTimestamp}&interval=1d`;
    
    // Fetch fundamentals once (for the latest record)
    let fundamentals = {};
    try {
      fundamentals = await fetchStockFundamentals(symbol, exchange);
    } catch (error) {
      // Silently continue - fundamentals fetch might fail
    }
    
    const response = await axios.get(yahooUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (response.data?.chart?.result?.[0]) {
      const result = response.data.chart.result[0];
      const timestamps = result.timestamp || [];
      const quotes = result.indicators?.quote?.[0] || {};
      
      // Calculate 52-week high/low from historical data
      let calculated52WHigh, calculated52WLow;
      if (timestamps.length > 0) {
        const oneYearAgo = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);
        const recentHighs = [];
        const recentLows = [];
        
        for (let i = 0; i < timestamps.length; i++) {
          const timestamp = timestamps[i];
          if (timestamp >= oneYearAgo) {
            if (quotes.high?.[i] && quotes.high[i] > 0) recentHighs.push(quotes.high[i]);
            if (quotes.low?.[i] && quotes.low[i] > 0) recentLows.push(quotes.low[i]);
          }
        }
        
        if (recentHighs.length > 0) calculated52WHigh = Math.max(...recentHighs);
        if (recentLows.length > 0) calculated52WLow = Math.min(...recentLows);
      }
      
      // Use fundamentals 52W high/low if available, otherwise use calculated
      const effective52WHigh = fundamentals.fiftyTwoWeekHigh || calculated52WHigh;
      const effective52WLow = fundamentals.fiftyTwoWeekLow || calculated52WLow;
      
      // Calculate average volume from historical data
      const volumes = quotes.volume ? quotes.volume.filter(v => v && v > 0) : [];
      const calculatedAvgVolume = volumes.length > 0 
        ? volumes.reduce((a, b) => a + b, 0) / volumes.length 
        : undefined;
      const effectiveAvgVolume = fundamentals.averageVolume || calculatedAvgVolume;
      
      const data = [];
      for (let i = 0; i < timestamps.length; i++) {
        const closePrice = quotes.close?.[i];
        if (closePrice && closePrice > 0) {
          const isLatestDate = i === timestamps.length - 1;
          const currentVolume = quotes.volume?.[i] || 0;
          
          data.push({
            date: new Date(timestamps[i] * 1000),
            open: quotes.open?.[i] || closePrice,
            high: quotes.high?.[i] || closePrice,
            low: quotes.low?.[i] || closePrice,
            close: closePrice,
            volume: currentVolume,
            currentPrice: closePrice,
            fiftyTwoWeekHigh: effective52WHigh,
            fiftyTwoWeekLow: effective52WLow,
            averageVolume: effectiveAvgVolume,
            regularMarketVolume: isLatestDate ? currentVolume : undefined,
            trailingPE: fundamentals.trailingPE,
            forwardPE: fundamentals.forwardPE,
            priceToBook: fundamentals.priceToBook,
            marketCap: fundamentals.marketCap,
            dividendYield: fundamentals.dividendYield,
          });
        }
      }
      
      return data;
    }
  } catch (error) {
    console.error(`   ❌ Error fetching historical data for ${symbol}.${exchange}:`, error.message);
    // Try alternate exchange if no data found
    if (exchange === 'NSE') {
      try {
        console.log(`   🔄 Trying BSE for ${symbol}...`);
        return await fetchHistoricalData(symbol, 'BSE', fromDate, toDate);
      } catch (altError) {
        // Both exchanges failed
      }
    }
  }
  
  return [];
}

/**
 * Fetch and store 5-year historical data for a stock
 */
async function fetchAndStore5YearData(isin, stockName, symbol, exchange) {
  try {
    const toDate = new Date();
    const fromDate = subDays(toDate, 365 * 5); // 5 years ago
    
    console.log(`   📊 Fetching 5-year data for ${isin} (${symbol}.${exchange === 'BSE' ? 'BO' : 'NS'})...`);
    
    // Fetch historical data
    const ohlcData = await fetchHistoricalData(symbol, exchange, fromDate, toDate);
    
    if (ohlcData.length === 0) {
      console.log(`   ⚠️  No data retrieved for ${isin} (${symbol}.${exchange === 'BSE' ? 'BO' : 'NS'})`);
      return 0;
    }
    
    // Get the latest available fundamentals from database to propagate to historical dates
    const latestExistingData = await StockData.findOne({ 
      isin, 
      $or: [
        { trailingPE: { $exists: true, $ne: null } },
        { marketCap: { $exists: true, $ne: null } },
        { fiftyTwoWeekHigh: { $exists: true, $ne: null } }
      ]
    })
      .sort({ date: -1 })
      .lean();
    
    // Find the latest date in fetched data that has fundamentals
    const latestFetchedData = ohlcData.length > 0 ? ohlcData[ohlcData.length - 1] : null;
    
    // Use fetched values if available, otherwise use latest from database
    const effectiveFundamentals = {
      trailingPE: latestFetchedData?.trailingPE || latestExistingData?.trailingPE,
      forwardPE: latestFetchedData?.forwardPE || latestExistingData?.forwardPE,
      priceToBook: latestFetchedData?.priceToBook || latestExistingData?.priceToBook,
      marketCap: latestFetchedData?.marketCap || latestExistingData?.marketCap,
      dividendYield: latestFetchedData?.dividendYield || latestExistingData?.dividendYield,
      fiftyTwoWeekHigh: latestFetchedData?.fiftyTwoWeekHigh || latestExistingData?.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: latestFetchedData?.fiftyTwoWeekLow || latestExistingData?.fiftyTwoWeekLow,
      averageVolume: latestFetchedData?.averageVolume || latestExistingData?.averageVolume,
      regularMarketVolume: latestFetchedData?.regularMarketVolume || latestExistingData?.regularMarketVolume,
    };
    
    let storedCount = 0;
    
    for (const data of ohlcData) {
      try {
        // Normalize date to start of day
        const normalizedDate = new Date(data.date);
        normalizedDate.setHours(0, 0, 0, 0);
        
        // Build update object
        const updateData = {
          isin,
          stockName,
          symbol,
          exchange: exchange || 'NSE',
          date: normalizedDate,
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          volume: data.volume,
          currentPrice: data.currentPrice !== undefined ? data.currentPrice : data.close,
          lastUpdated: new Date(),
        };
        
        // Add fundamentals if available
        if (data.fiftyTwoWeekHigh !== undefined && data.fiftyTwoWeekHigh !== null) {
          updateData.fiftyTwoWeekHigh = data.fiftyTwoWeekHigh;
        } else if (effectiveFundamentals.fiftyTwoWeekHigh !== undefined && effectiveFundamentals.fiftyTwoWeekHigh !== null) {
          updateData.fiftyTwoWeekHigh = effectiveFundamentals.fiftyTwoWeekHigh;
        }
        
        if (data.fiftyTwoWeekLow !== undefined && data.fiftyTwoWeekLow !== null) {
          updateData.fiftyTwoWeekLow = data.fiftyTwoWeekLow;
        } else if (effectiveFundamentals.fiftyTwoWeekLow !== undefined && effectiveFundamentals.fiftyTwoWeekLow !== null) {
          updateData.fiftyTwoWeekLow = effectiveFundamentals.fiftyTwoWeekLow;
        }
        
        if (data.averageVolume !== undefined && data.averageVolume !== null) {
          updateData.averageVolume = data.averageVolume;
        } else if (effectiveFundamentals.averageVolume !== undefined && effectiveFundamentals.averageVolume !== null) {
          updateData.averageVolume = effectiveFundamentals.averageVolume;
        }
        
        if (data.regularMarketVolume !== undefined && data.regularMarketVolume !== null) {
          updateData.regularMarketVolume = data.regularMarketVolume;
        } else if (effectiveFundamentals.regularMarketVolume !== undefined && effectiveFundamentals.regularMarketVolume !== null) {
          updateData.regularMarketVolume = effectiveFundamentals.regularMarketVolume;
        }
        
        if (data.trailingPE !== undefined && data.trailingPE !== null) {
          updateData.trailingPE = data.trailingPE;
        } else if (effectiveFundamentals.trailingPE !== undefined && effectiveFundamentals.trailingPE !== null) {
          updateData.trailingPE = effectiveFundamentals.trailingPE;
        }
        
        if (data.forwardPE !== undefined && data.forwardPE !== null) {
          updateData.forwardPE = data.forwardPE;
        } else if (effectiveFundamentals.forwardPE !== undefined && effectiveFundamentals.forwardPE !== null) {
          updateData.forwardPE = effectiveFundamentals.forwardPE;
        }
        
        if (data.priceToBook !== undefined && data.priceToBook !== null) {
          updateData.priceToBook = data.priceToBook;
        } else if (effectiveFundamentals.priceToBook !== undefined && effectiveFundamentals.priceToBook !== null) {
          updateData.priceToBook = effectiveFundamentals.priceToBook;
        }
        
        if (data.marketCap !== undefined && data.marketCap !== null) {
          updateData.marketCap = data.marketCap;
        } else if (effectiveFundamentals.marketCap !== undefined && effectiveFundamentals.marketCap !== null) {
          updateData.marketCap = effectiveFundamentals.marketCap;
        }
        
        if (data.dividendYield !== undefined && data.dividendYield !== null) {
          updateData.dividendYield = data.dividendYield;
        } else if (effectiveFundamentals.dividendYield !== undefined && effectiveFundamentals.dividendYield !== null) {
          updateData.dividendYield = effectiveFundamentals.dividendYield;
        }
        
        // Upsert (update if exists, insert if not) - unique index prevents duplicates
        await StockData.findOneAndUpdate(
          { isin, date: normalizedDate },
          { $set: updateData },
          { upsert: true, new: true }
        );
        storedCount++;
      } catch (err) {
        if (err.code !== 11000) { // Skip duplicate key errors (shouldn't happen due to unique index, but just in case)
          console.error(`   ❌ Error storing data for ${isin} on ${format(data.date, 'yyyy-MM-dd')}:`, err.message);
        }
      }
    }
    
    console.log(`   ✅ Stored ${storedCount} records for ${isin} (${symbol})`);
    return storedCount;
  } catch (error) {
    console.error(`   ❌ Error in fetchAndStore5YearData for ${isin}:`, error.message);
    return 0;
  }
}

/**
 * Main function
 */
async function main() {
  const startTime = Date.now();
  
  try {
    console.log('\n🔄 ========================================');
    console.log('🔄 Starting 5-year historical data fetch for all stocks...');
    console.log(`🕐 Time: ${new Date().toLocaleString()}`);
    console.log('🔄 ========================================\n');
    
    // Connect to MongoDB
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Get all stocks from StockMaster
    console.log('📊 Fetching all stocks from StockMaster...');
    const allStocks = await StockMaster.find({}).select('isin stockName symbol exchange').lean();
    const uniqueIsins = [...new Set(allStocks.map(s => s.isin).filter(Boolean))];
    const stocksMap = new Map();
    allStocks.forEach(s => {
      if (s.isin && !stocksMap.has(s.isin)) {
        stocksMap.set(s.isin, s);
      }
    });
    
    console.log(`✅ Found ${uniqueIsins.length} unique stocks in StockMaster\n`);
    
    // Check which stocks already have 5-year data
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    
    console.log(`📋 Checking which stocks already have 5-year data (since ${format(fiveYearsAgo, 'yyyy-MM-dd')})...`);
    
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
    ]);
    
    const isinsWith5YearData = new Set(stocksWithData.map(s => s._id));
    const isinsNeeding5YearData = uniqueIsins.filter(isin => !isinsWith5YearData.has(isin));
    
    console.log(`✅ ${isinsWith5YearData.size} stocks already have 5-year data`);
    console.log(`📦 ${isinsNeeding5YearData.length} stocks need 5-year data fetch\n`);
    
    if (isinsNeeding5YearData.length === 0) {
      console.log('✅ All stocks already have 5-year historical data!\n');
      await mongoose.disconnect();
      return;
    }
    
    // Process stocks in batches
    let totalFetched = 0;
    let stocksProcessed = 0;
    let stocksSkipped = 0;
    const errors = [];
    
    console.log(`🚀 Processing ${isinsNeeding5YearData.length} stocks in batches of ${BATCH_SIZE}...`);
    const estimatedMinutes = Math.ceil((isinsNeeding5YearData.length / BATCH_SIZE) * (DELAY_BETWEEN_BATCHES / 1000 / 60));
    console.log(`⏰ Estimated time: ~${estimatedMinutes} minutes\n`);
    
    // Process in batches
    for (let i = 0; i < isinsNeeding5YearData.length; i += BATCH_SIZE) {
      const batch = isinsNeeding5YearData.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(isinsNeeding5YearData.length / BATCH_SIZE);
      
      console.log(`\n📦 Batch ${batchNumber}/${totalBatches} (Processing ${batch.length} stocks)...`);
      const batchStartTime = Date.now();
      
      // Process batch in parallel
      const batchPromises = batch.map(async (isin) => {
        const stock = stocksMap.get(isin);
        if (!stock) {
          console.log(`   ⚠️  Stock info not found for ${isin}, skipping...`);
          return { isin, count: 0, success: false, error: 'Stock info not found' };
        }
        
        const stockName = stock.stockName || 'Unknown';
        const symbol = stock.symbol || '';
        const exchange = stock.exchange || 'NSE';
        
        if (!symbol) {
          console.log(`   ⚠️  No symbol found for ${isin} (${stockName}), skipping...`);
          return { isin, count: 0, success: false, error: 'No symbol found' };
        }
        
        try {
          const count = await fetchAndStore5YearData(isin, stockName, symbol, exchange);
          if (count > 0) {
            return { isin, count, success: true };
          } else {
            return { isin, count: 0, success: true, error: 'No data available' };
          }
        } catch (error) {
          return { isin, count: 0, success: false, error: error.message };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      // Process results
      for (const result of batchResults) {
        if (result.success && result.count > 0) {
          totalFetched += result.count;
          stocksProcessed++;
        } else if (result.success && result.count === 0) {
          stocksSkipped++;
        } else {
          errors.push(`${result.isin}: ${result.error || 'Unknown error'}`);
        }
      }
      
      const batchEndTime = Date.now();
      const batchDuration = ((batchEndTime - batchStartTime) / 1000 / 60).toFixed(2);
      
      console.log(`   ✅ Batch ${batchNumber} completed in ${batchDuration} minutes`);
      console.log(`   📊 Progress: ${Math.min(i + BATCH_SIZE, isinsNeeding5YearData.length)}/${isinsNeeding5YearData.length} stocks processed`);
      console.log(`   📊 Total documents fetched so far: ${totalFetched.toLocaleString()}`);
      
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
    console.log(`✅ Total documents fetched: ${totalFetched.toLocaleString()}`);
    console.log(`✅ Stocks skipped: ${stocksSkipped}`);
    console.log(`✅ Errors: ${errors.length}`);
    if (errors.length > 0 && errors.length <= 10) {
      console.log(`\n❌ Errors:`);
      errors.forEach(err => console.log(`   - ${err}`));
    } else if (errors.length > 10) {
      console.log(`\n❌ First 10 errors:`);
      errors.slice(0, 10).forEach(err => console.log(`   - ${err}`));
      console.log(`   ... and ${errors.length - 10} more errors`);
    }
    console.log(`⏱️  Total duration: ${duration} minutes`);
    console.log('✅ ========================================\n');
    
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    
  } catch (error) {
    console.error('\n❌ ========================================');
    console.error('❌ Script failed:', error.message);
    console.error('❌ ========================================\n');
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
main();

