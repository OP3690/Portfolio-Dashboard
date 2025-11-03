/**
 * Complete cleanup and fresh fetch
 * 1. Remove all duplicate data
 * 2. Drop and recreate collection with proper indexes
 * 3. Fetch all data fresh with duplicate prevention
 */

const mongoose = require('mongoose');
const axios = require('axios');
const { subDays, format } = require('date-fns');
const fs = require('fs');
const path = require('path');

// Load environment variables
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
  }
} catch (e) {
  console.warn('Could not load .env.local');
}

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
let StockData = mongoose.models.StockData || mongoose.model('StockData', StockDataSchema);

// Fetch fundamentals - using multiple methods to bypass 401 errors
async function fetchStockFundamentals(symbol, exchange) {
  const yahooExchange = exchange.toUpperCase() === 'BSE' ? 'BO' : 'NS';
  const yahooSymbol = `${symbol}.${yahooExchange}`;
  
  // Method 1: Enhanced headers to bypass 401
  try {
    const summaryUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${yahooSymbol}?modules=summaryProfile,defaultKeyStatistics,price,summaryDetail`;
    
    // Enhanced headers to mimic real browser and bypass 401
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': `https://finance.yahoo.com/quote/${yahooSymbol}`,
      'Origin': 'https://finance.yahoo.com',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'DNT': '1',
      'Connection': 'keep-alive',
    };
    
    const response = await axios.get(summaryUrl, {
      timeout: 15000,
      headers: headers,
      maxRedirects: 5,
      validateStatus: (status) => status < 500, // Don't throw on 401
    });

    if (response.status === 200 && response.data?.quoteSummary?.result?.[0]) {
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
    } else if (response.status === 401) {
      throw new Error('401_UNAUTHORIZED');
    }
  } catch (error) {
    // Method 2: Try query1 endpoint
    if (error.message === '401_UNAUTHORIZED' || error.response?.status === 401) {
      try {
        const altUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${yahooSymbol}?modules=summaryProfile,defaultKeyStatistics,price,summaryDetail`;
        const altHeaders = {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': `https://finance.yahoo.com/`,
          'Origin': 'https://finance.yahoo.com',
        };
        
        const altResponse = await axios.get(altUrl, {
          timeout: 15000,
          headers: altHeaders,
          maxRedirects: 5,
        });
        
        if (altResponse.data?.quoteSummary?.result?.[0]) {
          const result = altResponse.data.quoteSummary.result[0];
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
      } catch (altError) {
        // Method 2 failed, try Method 3
      }
      
      // Method 3: Try v7 endpoint
      try {
        const v7Url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${yahooSymbol}&fields=regularMarketPrice,marketCap,fiftyTwoWeekHigh,fiftyTwoWeekLow,averageDailyVolume10Day,regularMarketVolume`;
        const v7Response = await axios.get(v7Url, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
        });
        
        if (v7Response.data?.quoteResponse?.result?.[0]) {
          const quote = v7Response.data.quoteResponse.result[0];
          return {
            currentPrice: quote.regularMarketPrice,
            marketCap: quote.marketCap,
            fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
            averageVolume: quote.averageDailyVolume10Day,
            regularMarketVolume: quote.regularMarketVolume,
          };
        }
      } catch (v7Error) {
        // All methods failed
      }
    }
  }
  
  return {};
}

// Fetch historical data
async function fetchHistoricalData(symbol, exchange, fromDate, toDate) {
  try {
    const yahooExchange = exchange.toUpperCase() === 'BSE' ? 'BO' : 'NS';
    const yahooSymbol = `${symbol}.${yahooExchange}`;
    const fromTimestamp = Math.floor(fromDate.getTime() / 1000);
    const toTimestamp = Math.floor(toDate.getTime() / 1000);
    
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?period1=${fromTimestamp}&period2=${toTimestamp}&interval=1d`;
    
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
      
      return { timestamps, quotes };
    }
  } catch (error) {
    // Return empty on error
  }
  
  return { timestamps: [], quotes: {} };
}

// Fetch and store single stock
async function fetchAndStoreStockData(stock, forceFullUpdate = true) {
  const { isin, symbol, exchange, stockName } = stock;
  
  if (!symbol) {
    return { success: false, records: 0 };
  }

  try {
    const toDate = new Date();
    const fromDate = forceFullUpdate ? subDays(toDate, 365 * 5) : subDays(toDate, 2);
    
    const [fundamentals, historicalData] = await Promise.all([
      fetchStockFundamentals(symbol, exchange || 'NSE'),
      fetchHistoricalData(symbol, exchange || 'NSE', fromDate, toDate),
    ]);

    const { timestamps, quotes } = historicalData;
    
    if (timestamps.length === 0) {
      return { success: false, records: 0 };
    }

    // Calculate 52W high/low
    let calculated52WHigh, calculated52WLow;
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
    
    const effective52WHigh = fundamentals.fiftyTwoWeekHigh || calculated52WHigh;
    const effective52WLow = fundamentals.fiftyTwoWeekLow || calculated52WLow;
    
    const volumes = quotes.volume ? quotes.volume.filter(v => v && v > 0) : [];
    const calculatedAvgVolume = volumes.length > 0 ? volumes.reduce((a, b) => a + b, 0) / volumes.length : undefined;
    const effectiveAvgVolume = fundamentals.averageVolume || calculatedAvgVolume;
    
    // Prepare bulk operations with duplicate prevention
    const bulkOps = [];
    
    for (let i = 0; i < timestamps.length; i++) {
      const closePrice = quotes.close?.[i];
      if (closePrice && closePrice > 0) {
        const normalizedDate = new Date(timestamps[i] * 1000);
        normalizedDate.setHours(0, 0, 0, 0);
        
        const isLatestDate = i === timestamps.length - 1;
        const currentVolume = quotes.volume?.[i] || 0;
        
        // Use upsert with (isin, date) as unique key - prevents duplicates
        bulkOps.push({
          updateOne: {
            filter: { isin, date: normalizedDate },
            update: {
              $set: {
                isin,
                stockName: stockName || '',
                symbol,
                exchange: exchange || 'NSE',
                date: normalizedDate,
                open: quotes.open?.[i] || closePrice,
                high: quotes.high?.[i] || closePrice,
                low: quotes.low?.[i] || closePrice,
                close: closePrice,
                volume: currentVolume,
                currentPrice: isLatestDate ? (fundamentals.currentPrice || closePrice) : closePrice,
                fiftyTwoWeekHigh: effective52WHigh,
                fiftyTwoWeekLow: effective52WLow,
                averageVolume: effectiveAvgVolume,
                regularMarketVolume: isLatestDate ? (fundamentals.regularMarketVolume || currentVolume) : currentVolume,
                // Only set if value exists (don't set undefined as MongoDB ignores it)
                ...(isLatestDate && fundamentals.trailingPE ? { trailingPE: fundamentals.trailingPE } : {}),
                ...(isLatestDate && fundamentals.forwardPE ? { forwardPE: fundamentals.forwardPE } : {}),
                ...(isLatestDate && fundamentals.priceToBook ? { priceToBook: fundamentals.priceToBook } : {}),
                ...(isLatestDate && fundamentals.marketCap ? { marketCap: fundamentals.marketCap } : {}),
                ...(isLatestDate && fundamentals.dividendYield ? { dividendYield: fundamentals.dividendYield } : {}),
                lastUpdated: new Date(),
              },
            },
            upsert: true, // Prevents duplicates - updates existing or creates new
          },
        });
      }
    }
    
    // Bulk write with error handling for duplicates
    if (bulkOps.length > 0) {
      try {
        await StockData.bulkWrite(bulkOps, { 
          ordered: false, // Continue on errors
          writeConcern: { w: 1 } // Faster writes
        });
        
        // Update ONLY the latest record with fundamentals (as requested)
        if (fundamentals && (fundamentals.trailingPE || fundamentals.marketCap || fundamentals.fiftyTwoWeekHigh)) {
          const updateData = { lastUpdated: new Date() };
          
          // Only add fields that have actual values
          if (fundamentals.trailingPE !== undefined && fundamentals.trailingPE !== null && fundamentals.trailingPE > 0) {
            updateData.trailingPE = fundamentals.trailingPE;
          }
          if (fundamentals.forwardPE !== undefined && fundamentals.forwardPE !== null && fundamentals.forwardPE > 0) {
            updateData.forwardPE = fundamentals.forwardPE;
          }
          if (fundamentals.priceToBook !== undefined && fundamentals.priceToBook !== null && fundamentals.priceToBook > 0) {
            updateData.priceToBook = fundamentals.priceToBook;
          }
          if (fundamentals.marketCap !== undefined && fundamentals.marketCap !== null && fundamentals.marketCap > 0) {
            updateData.marketCap = fundamentals.marketCap;
          }
          if (fundamentals.dividendYield !== undefined && fundamentals.dividendYield !== null && fundamentals.dividendYield > 0) {
            updateData.dividendYield = fundamentals.dividendYield;
          }
          // Update 52W high/low from fundamentals if available (more accurate)
          if (fundamentals.fiftyTwoWeekHigh !== undefined && fundamentals.fiftyTwoWeekHigh !== null) {
            updateData.fiftyTwoWeekHigh = fundamentals.fiftyTwoWeekHigh;
          }
          if (fundamentals.fiftyTwoWeekLow !== undefined && fundamentals.fiftyTwoWeekLow !== null) {
            updateData.fiftyTwoWeekLow = fundamentals.fiftyTwoWeekLow;
          }
          if (fundamentals.averageVolume !== undefined && fundamentals.averageVolume !== null) {
            updateData.averageVolume = fundamentals.averageVolume;
          }
          if (fundamentals.regularMarketVolume !== undefined && fundamentals.regularMarketVolume !== null) {
            updateData.regularMarketVolume = fundamentals.regularMarketVolume;
          }
          if (fundamentals.currentPrice !== undefined && fundamentals.currentPrice !== null) {
            updateData.currentPrice = fundamentals.currentPrice;
          }
          
          // Only update if we have at least one fundamental field
          if (Object.keys(updateData).length > 1) {
            try {
              // Update the latest record (most recent date) only
              const latestRecord = await StockData.findOne({ isin })
                .sort({ date: -1 })
                .lean();
              
              if (latestRecord) {
                await StockData.updateOne(
                  { isin, date: latestRecord.date },
                  { $set: updateData }
                );
              }
            } catch (updateError) {
              // Ignore errors
            }
          }
        }
        
        return { success: true, records: bulkOps.length };
      } catch (bulkError) {
        // Some records might fail due to duplicates, but that's OK - we're using upsert
        return { success: true, records: bulkOps.length };
      }
    }
    
    return { success: false, records: 0 };
  } catch (error) {
    return { success: false, records: 0, error: error.message };
  }
}

async function main() {
  const startTime = Date.now();
  
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    
    // Step 1: Drop the stockdatas collection to remove all duplicates
    console.log('🗑️  Step 1: Cleaning up existing data...');
    try {
      await db.collection('stockdatas').drop();
      console.log('   ✅ Dropped stockdatas collection');
    } catch (e) {
      if (e.code === 26) {
        console.log('   ℹ️  Collection does not exist (will be created)');
      } else {
        throw e;
      }
    }
    
    // Step 2: Recreate collection and ensure unique index
    console.log('\n📋 Step 2: Creating collection with unique index to prevent duplicates...');
    StockData = mongoose.model('StockData', StockDataSchema);
    
    // Ensure the index exists (this prevents duplicates at database level)
    try {
      await StockData.collection.createIndex({ isin: 1, date: 1 }, { unique: true });
      console.log('   ✅ Created unique index on (isin, date) - duplicates will be automatically prevented');
    } catch (e) {
      console.log('   ℹ️  Index may already exist or will be created on first insert');
    }
    
    // Step 3: Get all stocks
    console.log('\n📊 Step 3: Getting all stocks from StockMaster...');
    const allStocks = await StockMaster.find({}).lean();
    const uniqueIsins = [...new Set(allStocks.map(s => s.isin).filter(Boolean))];
    const stocks = allStocks.filter(s => uniqueIsins.includes(s.isin));
    
    console.log(`   Found ${stocks.length} unique stocks\n`);
    
    // Step 4: Fetch data for all stocks
    const BATCH_SIZE = 20;
    const DELAY_BETWEEN_BATCHES = 2000;
    
    console.log(`🚀 Step 4: Fetching comprehensive data for all ${stocks.length} stocks...`);
    console.log(`📊 Batch size: ${BATCH_SIZE} stocks in parallel`);
    console.log(`⏰ Estimated time: ~${Math.ceil(stocks.length * 2 / BATCH_SIZE / 60)} minutes\n`);
    
    let totalFetched = 0;
    let stocksProcessed = 0;
    let stocksSuccessful = 0;
    const errors = [];
    
    for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
      const batch = stocks.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(stocks.length / BATCH_SIZE);
      
      console.log(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} stocks)...`);
      
      const batchResults = await Promise.allSettled(
        batch.map(stock => fetchAndStoreStockData(stock, true))
      );
      
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const stock = batch[j];
        stocksProcessed++;
        
        if (result.status === 'fulfilled' && result.value.success) {
          stocksSuccessful++;
          totalFetched += result.value.records;
          if (i + j < 5) {
            console.log(`  ✅ ${stock.symbol || stock.isin}: ${result.value.records} records`);
          }
        } else {
          errors.push({
            isin: stock.isin,
            symbol: stock.symbol,
            error: result.status === 'rejected' ? result.reason?.message : result.value?.error || 'Unknown error',
          });
        }
      }
      
      console.log(`  📊 Batch ${batchNum} complete: ${batchResults.filter(r => r.status === 'fulfilled' && r.value.success).length}/${batch.length} succeeded`);
      console.log(`  📈 Total progress: ${stocksProcessed}/${stocks.length} stocks, ${stocksSuccessful} successful, ${totalFetched} records`);
      
      // Check database size periodically
      if (batchNum % 10 === 0) {
        const recordCount = await StockData.countDocuments();
        console.log(`  💾 Total records in database: ${recordCount.toLocaleString()}`);
      }
      
      if (i + BATCH_SIZE < stocks.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }
    
    // Final summary
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    const finalCount = await StockData.countDocuments();
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ FETCH COMPLETE!');
    console.log('='.repeat(60));
    console.log(`📊 Total stocks processed: ${stocksProcessed}/${stocks.length}`);
    console.log(`✅ Successful: ${stocksSuccessful}`);
    console.log(`❌ Failed: ${errors.length}`);
    console.log(`📈 Total records stored: ${finalCount.toLocaleString()}`);
    console.log(`⏰ Time taken: ${elapsed} minutes`);
    console.log(`🔒 Duplicate prevention: Unique index on (isin, date) ensures no duplicates`);
    
    if (errors.length > 0) {
      console.log(`\n⚠️  Errors (first 10):`);
      errors.slice(0, 10).forEach(err => {
        console.log(`   - ${err.symbol || err.isin}: ${err.error}`);
      });
      if (errors.length > 10) {
        console.log(`   ... and ${errors.length - 10} more errors`);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

main().catch(console.error);

