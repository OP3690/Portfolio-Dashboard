/**
 * Cleanup old stock data to free up MongoDB space
 * Removes records older than 3 years (keeps last 3 years of data)
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

const StockData = mongoose.models.StockData || mongoose.model('StockData', StockDataSchema);

async function main() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');
    
    // Calculate 3 years ago date
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    threeYearsAgo.setHours(0, 0, 0, 0);
    
    console.log(`📅 Keeping data from: ${threeYearsAgo.toISOString().split('T')[0]} onwards`);
    console.log(`🗑️  Deleting data older than: ${threeYearsAgo.toISOString().split('T')[0]}\n`);
    
    // Count records to be deleted
    const oldRecordsCount = await StockData.countDocuments({ date: { $lt: threeYearsAgo } });
    const recentRecordsCount = await StockData.countDocuments({ date: { $gte: threeYearsAgo } });
    
    console.log(`📊 Current Status:`);
    console.log(`   - Total records: ${(oldRecordsCount + recentRecordsCount).toLocaleString()}`);
    console.log(`   - Records to keep (≥3 years): ${recentRecordsCount.toLocaleString()}`);
    console.log(`   - Records to delete (<3 years): ${oldRecordsCount.toLocaleString()}`);
    
    if (oldRecordsCount === 0) {
      console.log('\n✅ No old records to delete!');
      await mongoose.disconnect();
      process.exit(0);
    }
    
    // Confirm deletion
    console.log(`\n⚠️  This will delete ${oldRecordsCount.toLocaleString()} old records.`);
    console.log(`   Estimated space freed: ~${(oldRecordsCount * 2 / 1024).toFixed(2)} MB`);
    console.log(`\nPress Ctrl+C to cancel, or wait 5 seconds to continue...`);
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('\n🗑️  Starting deletion...');
    
    // Delete all old records
    console.log('🗑️  Deleting old records...');
    const result = await StockData.deleteMany({
      date: { $lt: threeYearsAgo }
    });
    
    const deleted = result.deletedCount || 0;
    
    console.log(`\n✅ Cleanup Complete!`);
    console.log(`   - Deleted: ${deleted.toLocaleString()} records`);
    console.log(`   - Estimated space freed: ~${(deleted * 2 / 1024).toFixed(2)} MB`);
    console.log(`   - Remaining records: ${recentRecordsCount.toLocaleString()}`);
    
    // Verify final count
    const finalCount = await StockData.countDocuments();
    console.log(`   - Final total: ${finalCount.toLocaleString()} records`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

main().catch(console.error);

