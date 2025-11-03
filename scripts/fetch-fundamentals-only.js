/**
 * Fetch fundamentals (P/E, Market Cap, etc.) for latest records only
 * Uses multiple methods to bypass 401 errors
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

// Fetch fundamentals with multiple fallback methods
async function fetchStockFundamentals(symbol, exchange) {
  const yahooExchange = exchange.toUpperCase() === 'BSE' ? 'BO' : 'NS';
  const yahooSymbol = `${symbol}.${yahooExchange}`;
  
  // Method 1: Enhanced headers to bypass 401
  try {
    const summaryUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${yahooSymbol}?modules=summaryProfile,defaultKeyStatistics,price,summaryDetail`;
    
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
      validateStatus: (status) => status < 500,
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
      
      // Method 3: Try v7 endpoint (limited data)
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

async function main() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');
    
    // Get all stocks from StockMaster
    const allStocks = await StockMaster.find({ symbol: { $exists: true, $ne: null }, exchange: { $exists: true, $ne: null } }).lean();
    console.log(`📊 Found ${allStocks.length} stocks with symbol/exchange\n`);
    
    // Process stocks in batches
    const BATCH_SIZE = 5; // Smaller batches to avoid rate limiting
    const DELAY_BETWEEN_BATCHES = 3000; // 3 second delay
    let processed = 0;
    let updated = 0;
    let failed = 0;
    
    console.log(`🚀 Fetching fundamentals for latest records only...`);
    console.log(`📊 Processing in batches of ${BATCH_SIZE} stocks\n`);
    
    for (let i = 0; i < allStocks.length; i += BATCH_SIZE) {
      const batch = allStocks.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(allStocks.length / BATCH_SIZE);
      
      console.log(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} stocks)...`);
      
      await Promise.all(batch.map(async (stock, idx) => {
        try {
          if (!stock.symbol || !stock.exchange) return;
          
          // Add small delay between requests in same batch
          if (idx > 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          // Fetch fundamentals
          const fundamentals = await fetchStockFundamentals(stock.symbol, stock.exchange);
          
          // Log first few failures to understand what's happening
          if (!fundamentals || Object.keys(fundamentals).length === 0) {
            if (processed < 5) {
              console.log(`  ⚠️  ${stock.symbol}: No fundamentals returned`);
            }
          }
          
          // Only update if we got fundamental data
          if (fundamentals && (fundamentals.trailingPE || fundamentals.marketCap)) {
            // Get the latest record for this stock
            const latestRecord = await StockData.findOne({ isin: stock.isin })
              .sort({ date: -1 })
              .lean();
            
            if (!latestRecord) {
              failed++;
              return;
            }
            
            // Build update data with only fields that have values
            const updateData = { lastUpdated: new Date() };
            
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
            
            // Only update if we have fundamental fields
            if (Object.keys(updateData).length > 1) {
              await StockData.updateOne(
                { isin: stock.isin, date: latestRecord.date },
                { $set: updateData }
              );
              
              updated++;
              if (updated <= 10) {
                console.log(`  ✅ ${stock.symbol}: PE=${fundamentals.trailingPE || 'N/A'}, MarketCap=${fundamentals.marketCap ? (fundamentals.marketCap / 1000000).toFixed(0) + 'M' : 'N/A'}`);
              }
            } else {
              failed++;
            }
          } else {
            failed++;
          }
          
          processed++;
        } catch (error) {
          failed++;
          // Log first few errors to understand what's happening
          if (failed <= 5) {
            console.log(`  ❌ Error for ${stock.symbol}:`, error.message || error);
          }
        }
      }));
      
      console.log(`  📊 Batch ${batchNum} complete: ${processed}/${allStocks.length} processed, ${updated} updated, ${failed} failed\n`);
      
      if (i + BATCH_SIZE < allStocks.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ FUNDAMENTALS FETCH COMPLETE!');
    console.log('='.repeat(60));
    console.log(`📊 Total stocks processed: ${processed}/${allStocks.length}`);
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

