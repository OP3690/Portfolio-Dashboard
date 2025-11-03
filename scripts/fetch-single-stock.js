/**
 * Fetch data for a single stock by symbol or ISIN
 */

const mongoose = require('mongoose');
const axios = require('axios');
const { subDays } = require('date-fns');
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

StockDataSchema.index({ isin: 1, date: 1 }, { unique: true });

const StockMaster = mongoose.models.StockMaster || mongoose.model('StockMaster', StockMasterSchema);
const StockData = mongoose.models.StockData || mongoose.model('StockData', StockDataSchema);

// Fetch fundamentals
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
    console.log(`   ⚠️  Could not fetch fundamentals: ${error.message}`);
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
    console.log(`   ⚠️  Could not fetch historical data: ${error.message}`);
  }
  
  return { timestamps: [], quotes: {} };
}

async function main() {
  const stockSymbol = process.argv[2] || '3IINFO-RE';
  
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');
    
    // Find the stock in StockMaster
    console.log(`🔍 Looking for stock: ${stockSymbol}`);
    const stock = await StockMaster.findOne({
      $or: [
        { symbol: stockSymbol },
        { stockName: { $regex: stockSymbol, $options: 'i' } },
        { isin: stockSymbol }
      ]
    }).lean();
    
    if (!stock) {
      console.log(`❌ Stock "${stockSymbol}" not found in StockMaster`);
      console.log('\n💡 Available stocks with similar names:');
      const similar = await StockMaster.find({
        $or: [
          { symbol: { $regex: stockSymbol, $options: 'i' } },
          { stockName: { $regex: stockSymbol, $options: 'i' } }
        ]
      }).limit(10).lean();
      
      similar.forEach(s => {
        console.log(`   - ${s.symbol || s.isin}: ${s.stockName}`);
      });
      
      await mongoose.disconnect();
      process.exit(1);
    }
    
    console.log(`✅ Found: ${stock.stockName} (${stock.symbol}) - ISIN: ${stock.isin}`);
    console.log(`   Exchange: ${stock.exchange || 'NSE'}\n`);
    
    const { isin, symbol, exchange, stockName } = stock;
    
    console.log('📊 Fetching comprehensive stock data...');
    const toDate = new Date();
    const fromDate = subDays(toDate, 365 * 5);
    
    console.log('   - Fetching fundamentals...');
    const fundamentals = await fetchStockFundamentals(symbol, exchange || 'NSE');
    
    console.log('   - Fetching 5-year historical data...');
    const historicalData = await fetchHistoricalData(symbol, exchange || 'NSE', fromDate, toDate);
    
    const { timestamps, quotes } = historicalData;
    
    if (timestamps.length === 0) {
      console.log(`\n❌ No historical data found for ${symbol}`);
      console.log('💡 This might be a delisted stock or the symbol may be incorrect on Yahoo Finance');
      await mongoose.disconnect();
      process.exit(1);
    }
    
    console.log(`   ✅ Retrieved ${timestamps.length} data points`);
    
    if (timestamps.length > 0) {
      console.log(`   📅 Date range: ${new Date(timestamps[0] * 1000).toISOString().split('T')[0]} to ${new Date(timestamps[timestamps.length - 1] * 1000).toISOString().split('T')[0]}`);
      console.log(`   📊 Sample data point:`);
      const firstIdx = 0;
      console.log(`      - Date: ${new Date(timestamps[firstIdx] * 1000).toISOString()}`);
      console.log(`      - Open: ${quotes.open?.[firstIdx] || 'N/A'}`);
      console.log(`      - High: ${quotes.high?.[firstIdx] || 'N/A'}`);
      console.log(`      - Low: ${quotes.low?.[firstIdx] || 'N/A'}`);
      console.log(`      - Close: ${quotes.close?.[firstIdx] || 'N/A'}`);
      console.log(`      - Volume: ${quotes.volume?.[firstIdx] || 'N/A'}\n`);
    } else {
      console.log('\n');
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
    
    // Prepare bulk operations
    const bulkOps = [];
    
    console.log('💾 Storing data to database...');
    for (let i = 0; i < timestamps.length; i++) {
      // Try close, then high, then low, then open as fallback
      const closePrice = quotes.close?.[i] || quotes.high?.[i] || quotes.low?.[i] || quotes.open?.[i];
      if (closePrice && closePrice > 0) {
        const normalizedDate = new Date(timestamps[i] * 1000);
        normalizedDate.setHours(0, 0, 0, 0);
        
        const isLatestDate = i === timestamps.length - 1;
        const currentVolume = quotes.volume?.[i] || 0;
        
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
                trailingPE: isLatestDate ? fundamentals.trailingPE : undefined,
                forwardPE: isLatestDate ? fundamentals.forwardPE : undefined,
                priceToBook: isLatestDate ? fundamentals.priceToBook : undefined,
                marketCap: isLatestDate ? fundamentals.marketCap : undefined,
                dividendYield: isLatestDate ? fundamentals.dividendYield : undefined,
                lastUpdated: new Date(),
              },
            },
            upsert: true,
          },
        });
      }
    }
    
    // Bulk write
    if (bulkOps.length > 0) {
      try {
        await StockData.bulkWrite(bulkOps, { 
          ordered: false,
          writeConcern: { w: 1 }
        });
        
        // Update recent records with fundamentals
        if (fundamentals.trailingPE || fundamentals.marketCap || fundamentals.fiftyTwoWeekHigh) {
          const ninetyDaysAgo = subDays(new Date(), 90);
          const updateData = { lastUpdated: new Date() };
          
          if (fundamentals.trailingPE !== undefined) updateData.trailingPE = fundamentals.trailingPE;
          if (fundamentals.forwardPE !== undefined) updateData.forwardPE = fundamentals.forwardPE;
          if (fundamentals.priceToBook !== undefined) updateData.priceToBook = fundamentals.priceToBook;
          if (fundamentals.marketCap !== undefined) updateData.marketCap = fundamentals.marketCap;
          if (fundamentals.dividendYield !== undefined) updateData.dividendYield = fundamentals.dividendYield;
          if (effective52WHigh !== undefined) updateData.fiftyTwoWeekHigh = effective52WHigh;
          if (effective52WLow !== undefined) updateData.fiftyTwoWeekLow = effective52WLow;
          if (effectiveAvgVolume !== undefined) updateData.averageVolume = effectiveAvgVolume;
          
          await StockData.updateMany(
            { isin, date: { $gte: ninetyDaysAgo } },
            { $set: updateData }
          ).catch(() => {});
        }
        
        console.log(`\n✅ Successfully stored ${bulkOps.length} records for ${stockName} (${symbol})`);
        
        // Verify
        const storedCount = await StockData.countDocuments({ isin });
        console.log(`   📊 Total records in database for this stock: ${storedCount}`);
        
      } catch (bulkError) {
        console.error(`\n❌ Error during bulk write:`, bulkError.message);
      }
    } else {
      console.log(`\n⚠️  No valid data to store`);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

main().catch(console.error);

