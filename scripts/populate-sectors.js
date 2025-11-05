/**
 * Script to populate sector data for all stocks in StockMaster
 * 
 * Strategy (in order of priority):
 * 1. Kaggle NSE Stock Sector Dataset (most comprehensive, no API calls) - Optional
 * 2. Holdings collection (fast, no API calls)
 * 3. NSE API (official source, requires symbol) - https://www.nseindia.com/api/quote-equity?symbol=SYMBOL
 * 4. Yahoo Finance API (fallback, if symbol and exchange are available)
 * 
 * Usage: 
 * 1. (Optional) Download Kaggle NSE Stock Sector Dataset CSV and place in: data/nse-stock-sector-dataset.csv
 * 2. Run: node scripts/populate-sectors.js
 * 
 * Note: The script will use NSE API for stocks with symbols listed on NSE.
 * If Kaggle dataset is not found, the script will still work using Holdings,
 * NSE API, and Yahoo Finance as fallbacks.
 */

const mongoose = require('mongoose');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

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

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://root:zUQfjzImQWoof7xs@cluster0.cyu0ctf.mongodb.net/OP_Portfolio_Dashboard?retryWrites=true&w=majority&appName=Cluster0';

// Schema definitions
const StockMasterSchema = new mongoose.Schema({
  isin: { type: String, required: true, unique: true, index: true },
  stockName: { type: String, required: true },
  symbol: { type: String },
  exchange: { type: String },
  sector: { type: String },
  lastUpdated: { type: Date, default: Date.now },
}, { collection: 'stockmasters' });

const HoldingSchema = new mongoose.Schema({
  stockName: { type: String, required: true },
  sectorName: { type: String, required: true },
  isin: { type: String, required: true, index: true },
  // ... other fields
}, { collection: 'holdings' });

const StockMaster = mongoose.models.StockMaster || mongoose.model('StockMaster', StockMasterSchema);
const Holding = mongoose.models.Holding || mongoose.model('Holding', HoldingSchema);

// Configuration
const BATCH_SIZE = 10; // Process 10 stocks at a time
const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds between batches
const DELAY_BETWEEN_STOCKS = 500; // 500ms between stocks in a batch
const MAX_RETRIES = 2;

// Path to Kaggle dataset CSV file (user should download and place it here)
const KAGGLE_DATASET_PATH = path.join(__dirname, '..', 'data', 'nse-stock-sector-dataset.csv');

/**
 * Load Kaggle NSE Stock Sector Dataset from CSV
 * Expected CSV format: ISIN, Sector (or similar columns)
 */
async function loadKaggleDataset() {
  const sectorMap = new Map();
  
  if (!fs.existsSync(KAGGLE_DATASET_PATH)) {
    console.log(`⚠️  Kaggle dataset not found at: ${KAGGLE_DATASET_PATH}`);
    console.log(`   Please download the Kaggle NSE Stock Sector Dataset and place it at:`);
    console.log(`   ${KAGGLE_DATASET_PATH}`);
    console.log(`   Or update KAGGLE_DATASET_PATH in the script.\n`);
    return sectorMap;
  }

  return new Promise((resolve, reject) => {
    const results = [];
    
    fs.createReadStream(KAGGLE_DATASET_PATH)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        console.log(`📊 Loaded ${results.length} records from Kaggle dataset`);
        
        // Try to detect column names (case-insensitive)
        const firstRow = results[0] || {};
        const isinColumn = Object.keys(firstRow).find(key => 
          key.toLowerCase().includes('isin') || key.toLowerCase() === 'isin'
        );
        const sectorColumn = Object.keys(firstRow).find(key => 
          key.toLowerCase().includes('sector') || key.toLowerCase() === 'sector'
        );
        
        if (!isinColumn || !sectorColumn) {
          console.log(`⚠️  Could not find ISIN or Sector columns in CSV.`);
          console.log(`   Found columns: ${Object.keys(firstRow).join(', ')}`);
          console.log(`   Please ensure CSV has columns with 'isin' and 'sector' in their names.\n`);
          resolve(sectorMap);
          return;
        }
        
        console.log(`   Using columns: ${isinColumn} -> ${sectorColumn}\n`);
        
        // Build ISIN to Sector map
        results.forEach(row => {
          const isin = String(row[isinColumn] || '').trim().toUpperCase();
          const sector = String(row[sectorColumn] || '').trim();
          
          if (isin && sector && isin.length >= 10) {
            // Normalize ISIN (remove any spaces, ensure uppercase)
            const normalizedIsin = isin.replace(/\s+/g, '');
            sectorMap.set(normalizedIsin, sector);
          }
        });
        
        console.log(`✅ Built sector map with ${sectorMap.size} ISINs\n`);
        resolve(sectorMap);
      })
      .on('error', (error) => {
        console.error(`❌ Error reading Kaggle dataset:`, error.message);
        resolve(sectorMap); // Return empty map on error, don't fail
      });
  });
}

/**
 * Get sector from Kaggle dataset
 */
function getSectorFromKaggle(isin, kaggleSectorMap) {
  if (!kaggleSectorMap || kaggleSectorMap.size === 0) {
    return null;
  }
  
  // Normalize ISIN for lookup
  const normalizedIsin = String(isin || '').trim().toUpperCase().replace(/\s+/g, '');
  return kaggleSectorMap.get(normalizedIsin) || null;
}

/**
 * Fetch sector from NSE API
 * API: https://www.nseindia.com/api/quote-equity?symbol=SYMBOL
 */
async function fetchSectorFromNSE(symbol) {
  try {
    if (!symbol) {
      return null;
    }

    // NSE API endpoint
    const nseUrl = `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`;
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': `https://www.nseindia.com/quote-equity?symbol=${encodeURIComponent(symbol)}`,
      'Origin': 'https://www.nseindia.com',
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    };
    
    const response = await axios.get(nseUrl, {
      timeout: 10000,
      headers: headers,
      maxRedirects: 5,
      validateStatus: (status) => status < 500, // Don't throw on 401/403
    });

    if (response.status === 200 && response.data) {
      const data = response.data;
      
      // Try multiple fields for sector information (priority order)
      // 1. industryInfo.sector (most specific)
      // 2. industryInfo.industry
      // 3. info.industry
      // 4. industryInfo.basicIndustry
      
      let sector = null;
      
      if (data.industryInfo?.sector) {
        sector = data.industryInfo.sector.trim();
      } else if (data.industryInfo?.industry) {
        sector = data.industryInfo.industry.trim();
      } else if (data.info?.industry) {
        sector = data.info.industry.trim();
      } else if (data.industryInfo?.basicIndustry) {
        sector = data.industryInfo.basicIndustry.trim();
      }
      
      if (sector && sector.length > 0) {
        return sector;
      }
    } else if (response.status === 401 || response.status === 403) {
      console.debug(`⚠️  NSE API access denied (${response.status}) for ${symbol} - may need session cookies`);
    }
  } catch (error) {
    // Silently fail - we'll try other methods
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.debug(`⚠️  NSE API blocked (${error.response.status}) for ${symbol}`);
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      // Network issues, skip silently
    }
  }
  
  return null;
}

/**
 * Fetch sector from Yahoo Finance API
 */
async function fetchSectorFromYahoo(symbol, exchange) {
  try {
    if (!symbol || !exchange) {
      return null;
    }

    const yahooExchange = exchange.toUpperCase() === 'BSE' ? 'BO' : 'NS';
    const yahooSymbol = `${symbol}.${yahooExchange}`;
    
    const summaryUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${yahooSymbol}?modules=summaryProfile`;
    
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
      timeout: 10000,
      headers: headers,
      maxRedirects: 5,
      validateStatus: (status) => status < 500, // Don't throw on 401
    });

    if (response.status === 200 && response.data?.quoteSummary?.result?.[0]) {
      const result = response.data.quoteSummary.result[0];
      const summaryProfile = result.summaryProfile || {};
      
      // Yahoo Finance provides 'sector' field in summaryProfile
      const sector = summaryProfile.sector;
      if (sector && typeof sector === 'string' && sector.trim().length > 0) {
        return sector.trim();
      }
    }
  } catch (error) {
    // Silently fail - we'll try other methods
    if (error.response?.status === 401) {
      console.debug(`⚠️  Yahoo Finance API blocked (401) for ${symbol}.${exchange}`);
    }
  }
  
  return null;
}

/**
 * Get sector from Holdings collection
 */
async function getSectorFromHoldings(isin) {
  try {
    const holding = await Holding.findOne({ isin }).select('sectorName').lean();
    if (holding && holding.sectorName && typeof holding.sectorName === 'string' && holding.sectorName.trim().length > 0) {
      return holding.sectorName.trim();
    }
  } catch (error) {
    console.error(`Error fetching sector from Holdings for ${isin}:`, error.message);
  }
  
  return null;
}

/**
 * Process a single stock to find and update its sector
 */
async function processStock(stock, stats, kaggleSectorMap) {
  try {
    // Skip if already has sector
    if (stock.sector && stock.sector.trim().length > 0 && stock.sector !== 'Unknown') {
      stats.skipped++;
      return { updated: false, reason: 'Already has sector' };
    }

    let sector = null;
    let source = '';

    // Method 1: Try Kaggle dataset first (most comprehensive, no API calls)
    sector = getSectorFromKaggle(stock.isin, kaggleSectorMap);
    if (sector) {
      source = 'Kaggle Dataset';
    }

    // Method 2: Try Holdings collection (fast, no API calls)
    if (!sector) {
      sector = await getSectorFromHoldings(stock.isin);
      if (sector) {
        source = 'Holdings';
      }
    }

    // Method 3: Try NSE API (official source, requires symbol)
    if (!sector && stock.symbol && stock.exchange === 'NSE') {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        sector = await fetchSectorFromNSE(stock.symbol);
        if (sector) {
          source = 'NSE API';
          break;
        }
        // Wait before retry
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // Method 4: Try Yahoo Finance API as last resort if we have symbol/exchange
    if (!sector && stock.symbol && stock.exchange) {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        sector = await fetchSectorFromYahoo(stock.symbol, stock.exchange);
        if (sector) {
          source = 'Yahoo Finance';
          break;
        }
        // Wait before retry
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // Update StockMaster if we found a sector
    if (sector) {
      await StockMaster.updateOne(
        { isin: stock.isin },
        { $set: { sector, lastUpdated: new Date() } }
      );
      stats.updated++;
      console.log(`✅ [${stats.updated}] ${stock.stockName} (${stock.isin}): ${sector} [${source}]`);
      return { updated: true, sector, source };
    } else {
      stats.failed++;
      console.log(`❌ [${stats.failed}] ${stock.stockName} (${stock.isin}): No sector found`);
      return { updated: false, reason: 'No sector found' };
    }
  } catch (error) {
    stats.errors++;
    console.error(`⚠️  Error processing ${stock.stockName} (${stock.isin}):`, error.message);
    return { updated: false, reason: `Error: ${error.message}` };
  }
}

/**
 * Process stocks in batches
 */
async function processBatch(stocks, stats, kaggleSectorMap) {
  const promises = stocks.map(stock => processStock(stock, stats, kaggleSectorMap));
  await Promise.all(promises);
  
  // Wait between stocks in batch
  if (stocks.length > 1) {
    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_STOCKS));
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Load Kaggle dataset first
    console.log('📥 Loading Kaggle NSE Stock Sector Dataset...');
    const kaggleSectorMap = await loadKaggleDataset();

    // Get all stocks that need sector data
    console.log('📊 Fetching stocks without sector data...');
    const stocksNeedingSector = await StockMaster.find({
      $or: [
        { sector: { $exists: false } },
        { sector: null },
        { sector: '' },
        { sector: 'Unknown' }
      ]
    })
      .select('isin stockName symbol exchange sector')
      .lean();

    const totalStocks = stocksNeedingSector.length;
    console.log(`📈 Found ${totalStocks} stocks without sector data\n`);

    if (totalStocks === 0) {
      console.log('✅ All stocks already have sector data!');
      await mongoose.disconnect();
      return;
    }

    // Also get total count for progress tracking
    const totalStocksInDB = await StockMaster.countDocuments();
    console.log(`📊 Total stocks in database: ${totalStocksInDB}`);
    console.log(`📊 Stocks needing sector: ${totalStocks} (${((totalStocks / totalStocksInDB) * 100).toFixed(1)}%)\n`);

    // Statistics
    const stats = {
      total: totalStocks,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: 0
    };

    // Process stocks in batches
    console.log(`🚀 Starting to process ${totalStocks} stocks in batches of ${BATCH_SIZE}...\n`);
    const startTime = Date.now();

    for (let i = 0; i < stocksNeedingSector.length; i += BATCH_SIZE) {
      const batch = stocksNeedingSector.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(totalStocks / BATCH_SIZE);
      
      console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} stocks)...`);
      
      await processBatch(batch, stats, kaggleSectorMap);
      
      // Progress update
      const processed = Math.min(i + BATCH_SIZE, totalStocks);
      const progress = ((processed / totalStocks) * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const avgTimePerStock = elapsed / processed;
      const remaining = totalStocks - processed;
      const estimatedTimeRemaining = (remaining * avgTimePerStock).toFixed(0);
      
      console.log(`\n📊 Progress: ${processed}/${totalStocks} (${progress}%)`);
      console.log(`   ✅ Updated: ${stats.updated} | ❌ Failed: ${stats.failed} | ⚠️  Errors: ${stats.errors}`);
      console.log(`   ⏱️  Elapsed: ${elapsed}s | Estimated remaining: ${estimatedTimeRemaining}s`);
      
      // Wait between batches (except for the last batch)
      if (i + BATCH_SIZE < totalStocks) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }

    // Final summary
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total stocks processed: ${stats.total}`);
    console.log(`✅ Successfully updated: ${stats.updated} (${((stats.updated / stats.total) * 100).toFixed(1)}%)`);
    console.log(`⏭️  Skipped (already had sector): ${stats.skipped}`);
    console.log(`❌ Failed to find sector: ${stats.failed} (${((stats.failed / stats.total) * 100).toFixed(1)}%)`);
    console.log(`⚠️  Errors: ${stats.errors}`);
    console.log(`⏱️  Total time: ${totalTime}s`);
    console.log('='.repeat(60) + '\n');

    // Check how many stocks still need sector data
    const remainingCount = await StockMaster.countDocuments({
      $or: [
        { sector: { $exists: false } },
        { sector: null },
        { sector: '' },
        { sector: 'Unknown' }
      ]
    });
    
    if (remainingCount > 0) {
      console.log(`⚠️  ${remainingCount} stocks still don't have sector data.`);
      console.log('   These stocks may not have symbol/exchange data or may not be available on Yahoo Finance.\n');
    } else {
      console.log('✅ All stocks now have sector data!\n');
    }

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
main();

