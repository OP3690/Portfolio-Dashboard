/**
 * Fast parallel script to fetch and store comprehensive stock data for all stocks
 * Run with: node scripts/fetch-all-stocks.js
 */

const mongoose = require('mongoose');
const axios = require('axios');
const { subDays, format } = require('date-fns');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local manually
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

// Import models
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

StockDataSchema.index({ isin: 1, date: 1 }, { unique: true });

const StockMaster = mongoose.models.StockMaster || mongoose.model('StockMaster', StockMasterSchema);
const StockData = mongoose.models.StockData || mongoose.model('StockData', StockDataSchema);

// Configuration
const BATCH_SIZE = 20; // Process 20 stocks in parallel
const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds between batches
const MAX_RETRIES = 3;

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
    // Try alternative method if first fails
    if (error.response?.status === 401) {
      // Method 2: Try chart endpoint which sometimes works when quoteSummary is blocked
      try {
        const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`;
        const chartResponse = await axios.get(chartUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
        });
        
        // Chart endpoint doesn't provide fundamentals, so return empty
        // But at least we tried
        return {};
      } catch (chartError) {
        // Both methods failed
      }
    }
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
      
      return {
        timestamps,
        quotes,
      };
    }
  } catch (error) {
    // Return empty data on error
  }
  
  return { timestamps: [], quotes: {} };
}

/**
 * Fetch and store data for a single stock
 */
async function fetchAndStoreStockData(stock, forceFullUpdate = true) {
  const { isin, symbol, exchange, stockName } = stock;
  
  if (!symbol) {
    console.log(`⚠️  Skipping ${isin} - No symbol found`);
    return { success: false, records: 0 };
  }

  try {
    const toDate = new Date();
    const fromDate = forceFullUpdate ? subDays(toDate, 365 * 5) : subDays(toDate, 2);
    
    // Fetch fundamentals and historical data in parallel
    const [fundamentals, historicalData] = await Promise.all([
      fetchStockFundamentals(symbol, exchange || 'NSE'),
      fetchHistoricalData(symbol, exchange || 'NSE', fromDate, toDate),
    ]);

    const { timestamps, quotes } = historicalData;
    
    if (timestamps.length === 0) {
      console.log(`⚠️  No data for ${symbol} (${isin})`);
      return { success: false, records: 0 };
    }

    // Calculate 52W high/low from historical data
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
    
    // Calculate average volume
    const volumes = quotes.volume ? quotes.volume.filter(v => v && v > 0) : [];
    const calculatedAvgVolume = volumes.length > 0 ? volumes.reduce((a, b) => a + b, 0) / volumes.length : undefined;
    const effectiveAvgVolume = fundamentals.averageVolume || calculatedAvgVolume;
    
    // Prepare bulk operations
    const bulkOps = [];
    
    for (let i = 0; i < timestamps.length; i++) {
      const closePrice = quotes.close?.[i];
      if (closePrice && closePrice > 0) {
        const normalizedDate = new Date(timestamps[i] * 1000);
        normalizedDate.setHours(0, 0, 0, 0);
        
        const isLatestDate = i === timestamps.length - 1;
        const currentVolume = quotes.volume?.[i] || 0;
        
        // Use upsert to prevent duplicates - this ensures only one record per (isin, date)
        // Build base update data
        const updateData: any = {
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
          currentPrice: closePrice,
          lastUpdated: new Date(),
        };
        
        // Add 52W high/low and volume metrics for all records
        if (effective52WHigh !== undefined && effective52WHigh !== null) updateData.fiftyTwoWeekHigh = effective52WHigh;
        if (effective52WLow !== undefined && effective52WLow !== null) updateData.fiftyTwoWeekLow = effective52WLow;
        if (effectiveAvgVolume !== undefined && effectiveAvgVolume !== null) updateData.averageVolume = effectiveAvgVolume;
        
        // Only add fundamentals (P/E, Market Cap, etc.) for the LATEST record (most recent date)
        if (isLatestDate && fundamentals) {
          if (fundamentals.currentPrice !== undefined && fundamentals.currentPrice !== null) {
            updateData.currentPrice = fundamentals.currentPrice;
          }
          if (fundamentals.regularMarketVolume !== undefined && fundamentals.regularMarketVolume !== null) {
            updateData.regularMarketVolume = fundamentals.regularMarketVolume;
          }
          // Fundamentals - only for latest record
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
        }
        
        bulkOps.push({
          updateOne: {
            filter: { 
              isin: isin,
              date: normalizedDate // Unique combination ensures no duplicates
            },
            update: {
              $set: updateData,
            },
            upsert: true, // This ensures no duplicates - updates if exists, creates if not
          },
        });
      }
    }
    
    // Bulk write to database
    if (bulkOps.length > 0) {
      await StockData.bulkWrite(bulkOps, { ordered: false });
      
      // Update ONLY the latest record with fundamentals (as requested)
      // This propagates fundamentals to the most recent date
      if (fundamentals && (fundamentals.trailingPE || fundamentals.marketCap || fundamentals.fiftyTwoWeekHigh)) {
        const latestDate = new Date();
        latestDate.setHours(23, 59, 59, 999); // End of today
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0); // Start of today
        
        const updateData: any = {
          lastUpdated: new Date(),
        };
        
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
        // Update 52W high/low from fundamentals if available (more accurate than calculated)
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
        
        // Only update if we have at least one fundamental field to update
        if (Object.keys(updateData).length > 1) { // More than just lastUpdated
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
            // Silently continue if update fails
          }
        }
      }
      
      return { success: true, records: bulkOps.length };
    }
    
    return { success: false, records: 0 };
  } catch (error) {
    console.error(`❌ Error processing ${symbol} (${isin}):`, error.message);
    return { success: false, records: 0, error: error.message };
  }
}

/**
 * Main execution function
 */
async function main() {
  const startTime = Date.now();
  
  try {
    // Connect to MongoDB
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Get all stocks
    const allStocks = await StockMaster.find({}).lean();
    const uniqueIsins = [...new Set(allStocks.map(s => s.isin).filter(Boolean))];
    const stocks = allStocks.filter(s => uniqueIsins.includes(s.isin));
    
    console.log(`\n🚀 Starting fast parallel fetch for ${stocks.length} stocks...`);
    console.log(`📊 Batch size: ${BATCH_SIZE} stocks in parallel`);
    console.log(`⏰ Estimated time: ~${Math.ceil(stocks.length * 2 / BATCH_SIZE / 60)} minutes\n`);
    
    let totalFetched = 0;
    let stocksProcessed = 0;
    let stocksSuccessful = 0;
    const errors = [];
    
    // Process in batches
    for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
      const batch = stocks.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(stocks.length / BATCH_SIZE);
      
      console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} stocks)...`);
      
      // Process batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(stock => fetchAndStoreStockData(stock, true))
      );
      
      // Process results
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
      
      // Progress summary
      console.log(`  📊 Batch ${batchNum} complete: ${batchResults.filter(r => r.status === 'fulfilled' && r.value.success).length}/${batch.length} succeeded`);
      console.log(`  📈 Total progress: ${stocksProcessed}/${stocks.length} stocks, ${stocksSuccessful} successful, ${totalFetched} records`);
      
      // Delay between batches (except last batch)
      if (i + BATCH_SIZE < stocks.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }
    
    // Final summary
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    console.log('\n' + '='.repeat(60));
    console.log('✅ FETCH COMPLETE!');
    console.log('='.repeat(60));
    console.log(`📊 Total stocks processed: ${stocksProcessed}/${stocks.length}`);
    console.log(`✅ Successful: ${stocksSuccessful}`);
    console.log(`❌ Failed: ${errors.length}`);
    console.log(`📈 Total records stored: ${totalFetched}`);
    console.log(`⏰ Time taken: ${elapsed} minutes`);
    
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

// Run the script
main().catch(console.error);

