/**
 * Backfill fundamentals (P/E, Market Cap, etc.) for all stocks
 * Fetches fundamentals and updates the latest records for each stock
 */

const mongoose = require('mongoose');
const axios = require('axios');
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

const StockMaster = mongoose.models.StockMaster || mongoose.model('StockMaster', StockMasterSchema);
const StockData = mongoose.models.StockData || mongoose.model('StockData', StockDataSchema);

// Fetch fundamentals from Yahoo Finance
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
    // Return empty on error
  }
  
  return {};
}

async function main() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');
    
    // Get all stocks that have data but no fundamentals
    console.log('📊 Finding stocks without fundamentals...');
    
    // Get unique ISINs from stocks that have data
    const stocksWithData = await StockData.distinct('isin');
    console.log(`   Found ${stocksWithData.length} stocks with data\n`);
    
    // Get stocks from StockMaster to get symbol/exchange
    const stockMasterMap = new Map();
    const allStocks = await StockMaster.find({}).lean();
    allStocks.forEach(stock => {
      if (stock.symbol && stock.exchange) {
        stockMasterMap.set(stock.isin, { symbol: stock.symbol, exchange: stock.exchange, stockName: stock.stockName });
      }
    });
    
    console.log(`   Found ${stockMasterMap.size} stocks in StockMaster with symbol/exchange\n`);
    
    // Check how many already have fundamentals
    const stocksWithFundamentals = await StockData.distinct('isin', {
      trailingPE: { $exists: true, $ne: null, $gt: 0 }
    });
    console.log(`   ${stocksWithFundamentals.length} stocks already have fundamentals\n`);
    
    // Process stocks in batches
    const BATCH_SIZE = 10;
    const DELAY_BETWEEN_BATCHES = 2000;
    let processed = 0;
    let updated = 0;
    let failed = 0;
    
    const stocksToProcess = stocksWithData.filter(isin => 
      !stocksWithFundamentals.includes(isin) && stockMasterMap.has(isin)
    );
    
    console.log(`🚀 Fetching fundamentals for ${stocksToProcess.length} stocks...\n`);
    
    for (let i = 0; i < stocksToProcess.length; i += BATCH_SIZE) {
      const batch = stocksToProcess.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(stocksToProcess.length / BATCH_SIZE);
      
      console.log(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} stocks)...`);
      
      await Promise.all(batch.map(async (isin) => {
        try {
          const stockInfo = stockMasterMap.get(isin);
          if (!stockInfo) return;
          
          const fundamentals = await fetchStockFundamentals(stockInfo.symbol, stockInfo.exchange);
          
          if (fundamentals.trailingPE || fundamentals.marketCap) {
            // Update the latest 90 days of records with fundamentals
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            
            const updateData = { lastUpdated: new Date() };
            if (fundamentals.trailingPE !== undefined) updateData.trailingPE = fundamentals.trailingPE;
            if (fundamentals.forwardPE !== undefined) updateData.forwardPE = fundamentals.forwardPE;
            if (fundamentals.priceToBook !== undefined) updateData.priceToBook = fundamentals.priceToBook;
            if (fundamentals.marketCap !== undefined) updateData.marketCap = fundamentals.marketCap;
            if (fundamentals.dividendYield !== undefined) updateData.dividendYield = fundamentals.dividendYield;
            
            const result = await StockData.updateMany(
              { isin, date: { $gte: ninetyDaysAgo } },
              { $set: updateData }
            );
            
            if (result.modifiedCount > 0) {
              updated++;
              if (updated <= 5) {
                console.log(`  ✅ ${stockInfo.symbol}: Updated ${result.modifiedCount} records with P/E=${fundamentals.trailingPE}`);
              }
            }
          } else {
            failed++;
          }
          
          processed++;
        } catch (error) {
          failed++;
          // Silently continue
        }
      }));
      
      console.log(`  📊 Batch ${batchNum} complete: ${processed}/${stocksToProcess.length} processed, ${updated} updated, ${failed} failed`);
      
      if (i + BATCH_SIZE < stocksToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ FUNDAMENTALS BACKFILL COMPLETE!');
    console.log('='.repeat(60));
    console.log(`📊 Total stocks processed: ${processed}`);
    console.log(`✅ Successfully updated: ${updated}`);
    console.log(`❌ Failed: ${failed}`);
    
    // Verify
    const finalCount = await StockData.countDocuments({
      trailingPE: { $exists: true, $ne: null, $gt: 0 }
    });
    console.log(`📈 Total stocks with fundamentals now: ${finalCount}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

main().catch(console.error);

