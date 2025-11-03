/**
 * Check MongoDB database size and collection statistics
 */

const mongoose = require('mongoose');
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
  isin: String,
  stockName: String,
  symbol: String,
  exchange: String,
  date: Date,
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

async function main() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');
    
    const db = mongoose.connection.db;
    
    // Get collection stats using admin command
    const adminDb = db.admin();
    
    let stockDataStats, stockMasterStats, holdingsStats, transactionsStats;
    
    try {
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      
      stockDataStats = { count: await StockData.countDocuments(), size: 0 };
      stockMasterStats = { count: await StockMaster.countDocuments(), size: 0 };
      
      const Holdings = mongoose.models.Holding || mongoose.model('Holding', new mongoose.Schema({}, { collection: 'holdings', strict: false }));
      const Transactions = mongoose.models.Transaction || mongoose.model('Transaction', new mongoose.Schema({}, { collection: 'transactions', strict: false }));
      
      holdingsStats = { count: await Holdings.countDocuments().catch(() => 0), size: 0 };
      transactionsStats = { count: await Transactions.countDocuments().catch(() => 0), size: 0 };
      
      // Try to get stats if possible
      try {
        const allStats = await adminDb.command({ dbStats: 1 });
        const dataSizeMB = allStats.dataSize / 1024 / 1024;
        
        // Estimate size based on document count (rough estimate: ~2KB per StockData doc)
        stockDataStats.size = stockDataStats.count * 2 * 1024; // Estimate 2KB per doc
        stockMasterStats.size = stockMasterStats.count * 0.5 * 1024; // Estimate 0.5KB per doc
        
        console.log(`📊 Database Statistics:`);
        console.log(`   - Total Database Size: ${dataSizeMB.toFixed(2)} MB`);
        console.log(`   - Storage Size: ${(allStats.storageSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   - Index Size: ${(allStats.indexSize / 1024 / 1024).toFixed(2)} MB`);
      } catch (e) {
        // Fallback to estimates
        stockDataStats.size = stockDataStats.count * 2 * 1024;
        stockMasterStats.size = stockMasterStats.count * 0.5 * 1024;
      }
    } catch (e) {
      console.error('Error getting stats:', e.message);
      stockDataStats = { count: 0, size: 0 };
      stockMasterStats = { count: 0, size: 0 };
      holdingsStats = { count: 0, size: 0 };
      transactionsStats = { count: 0, size: 0 };
    }
    
    const totalSizeMB = (stockDataStats.size + stockMasterStats.size + holdingsStats.size + transactionsStats.size) / 1024 / 1024;
    
    console.log('📊 Database Statistics:');
    console.log('='.repeat(60));
    console.log(`📦 StockData Collection:`);
    console.log(`   - Documents: ${stockDataStats.count.toLocaleString()}`);
    console.log(`   - Size: ${(stockDataStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   - Average doc size: ${(stockDataStats.size / stockDataStats.count / 1024).toFixed(2)} KB`);
    
    console.log(`\n📋 StockMaster Collection:`);
    console.log(`   - Documents: ${stockMasterStats.count.toLocaleString()}`);
    console.log(`   - Size: ${(stockMasterStats.size / 1024 / 1024).toFixed(2)} MB`);
    
    console.log(`\n💼 Holdings Collection:`);
    console.log(`   - Documents: ${holdingsStats.count.toLocaleString()}`);
    console.log(`   - Size: ${(holdingsStats.size / 1024 / 1024).toFixed(2)} MB`);
    
    console.log(`\n💰 Transactions Collection:`);
    console.log(`   - Documents: ${transactionsStats.count.toLocaleString()}`);
    console.log(`   - Size: ${(transactionsStats.size / 1024 / 1024).toFixed(2)} MB`);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📈 Total Database Size: ${totalSizeMB.toFixed(2)} MB`);
    console.log(`✅ MongoDB Atlas Flex Plan: 5 GB (5,120 MB)`);
    console.log(`📊 Storage Used: ${((totalSizeMB / 5120) * 100).toFixed(1)}%`);
    console.log(`📦 Remaining Space: ${(5120 - totalSizeMB).toFixed(2)} MB`);
    
    if (totalSizeMB > 5120) {
      const overBy = totalSizeMB - 5120;
      console.log(`\n⚠️  Database is OVER quota by ${overBy.toFixed(2)} MB`);
      console.log(`\n💡 Solutions:`);
      console.log(`   1. Clean up old data (remove records older than 3 years)`);
      console.log(`   2. Delete duplicate or unnecessary records`);
    } else {
      const remaining = 5120 - totalSizeMB;
      const usagePercent = ((totalSizeMB / 5120) * 100).toFixed(1);
      if (usagePercent < 80) {
        console.log(`\n✅ Healthy usage - ${remaining.toFixed(2)} MB available`);
      } else {
        console.log(`\n⚠️  High usage (${usagePercent}%) - ${remaining.toFixed(2)} MB remaining`);
      }
    }
    
    // Show breakdown by date range
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    
    const recentCount = await StockData.countDocuments({ date: { $gte: threeYearsAgo } });
    const oldCount = await StockData.countDocuments({ date: { $lt: threeYearsAgo } });
    
    console.log(`\n📅 Data Breakdown:`);
    console.log(`   - Recent (last 3 years): ${recentCount.toLocaleString()} records`);
    console.log(`   - Old (>3 years): ${oldCount.toLocaleString()} records`);
    
    if (oldCount > 0 && totalSizeMB > 4000) {
      console.log(`\n💡 Consider cleaning up ${oldCount.toLocaleString()} old records if storage becomes tight`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

main().catch(console.error);

