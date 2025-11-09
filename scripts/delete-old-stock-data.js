/**
 * Delete stock data older than 2 years
 * This will free up significant storage space
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
    
    const db = mongoose.connection.db;
    
    // Calculate cutoff date (2 years ago from today)
    const today = new Date();
    const twoYearsAgo = new Date(today);
    twoYearsAgo.setFullYear(today.getFullYear() - 2);
    
    // Set to start of day for clean cutoff
    twoYearsAgo.setHours(0, 0, 0, 0);
    
    console.log('📅 Date Range:');
    console.log(`   Today: ${today.toISOString().split('T')[0]}`);
    console.log(`   Cutoff Date (2 years ago): ${twoYearsAgo.toISOString().split('T')[0]}`);
    console.log(`   Will DELETE all stock data BEFORE: ${twoYearsAgo.toISOString().split('T')[0]}\n`);
    
    // Get current stats
    const totalCount = await StockData.countDocuments();
    console.log(`📊 Current StockData collection:`);
    console.log(`   Total documents: ${totalCount.toLocaleString()}`);
    
    // Count documents to be deleted
    const oldDataCount = await StockData.countDocuments({
      date: { $lt: twoYearsAgo }
    });
    
    const keepCount = totalCount - oldDataCount;
    
    console.log(`   Documents to DELETE (older than 2 years): ${oldDataCount.toLocaleString()}`);
    console.log(`   Documents to KEEP (last 2 years): ${keepCount.toLocaleString()}\n`);
    
    if (oldDataCount === 0) {
      console.log('✅ No old data to delete. All data is within the last 2 years.');
      await mongoose.disconnect();
      process.exit(0);
    }
    
    // Get date range of old data
    const oldestRecord = await StockData.findOne({ date: { $lt: twoYearsAgo } })
      .sort({ date: 1 })
      .select('date stockName')
      .lean();
    
    const newestOldRecord = await StockData.findOne({ date: { $lt: twoYearsAgo } })
      .sort({ date: -1 })
      .select('date stockName')
      .lean();
    
    if (oldestRecord && newestOldRecord) {
      console.log('📅 Old data date range:');
      console.log(`   Oldest record: ${oldestRecord.date.toISOString().split('T')[0]} (${oldestRecord.stockName})`);
      console.log(`   Newest old record: ${newestOldRecord.date.toISOString().split('T')[0]} (${newestOldRecord.stockName})`);
      console.log('');
    }
    
    // Estimate space to free (rough estimate: ~2KB per document)
    const estimatedSpaceMB = (oldDataCount * 2) / 1024;
    console.log(`💾 Estimated space to free: ~${estimatedSpaceMB.toFixed(2)} MB\n`);
    
    // Confirm deletion
    console.log('⚠️  WARNING: This will permanently delete old stock data!');
    console.log('   Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n');
    
    // Wait 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('🗑️  Deleting old stock data...\n');
    
    // Delete in batches to avoid memory issues
    const BATCH_SIZE = 10000;
    let deletedCount = 0;
    let batchNumber = 0;
    
    while (true) {
      // Find a batch of old records
      const batch = await StockData.find({
        date: { $lt: twoYearsAgo }
      })
      .limit(BATCH_SIZE)
      .select('_id')
      .lean();
      
      if (batch.length === 0) {
        break; // No more records to delete
      }
      
      const idsToDelete = batch.map(r => r._id);
      const result = await StockData.deleteMany({ _id: { $in: idsToDelete } });
      deletedCount += result.deletedCount || 0;
      batchNumber++;
      
      console.log(`   Batch ${batchNumber}: Deleted ${result.deletedCount || 0} documents (Total: ${deletedCount.toLocaleString()})`);
      
      // Small delay between batches to avoid overwhelming the database
      if (batch.length === BATCH_SIZE) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`\n✅ Deletion complete!`);
    console.log(`   - Total documents deleted: ${deletedCount.toLocaleString()}`);
    console.log(`   - Estimated space freed: ~${(deletedCount * 2 / 1024).toFixed(2)} MB`);
    
    // Verify final count
    const finalCount = await StockData.countDocuments();
    const finalOldCount = await StockData.countDocuments({ date: { $lt: twoYearsAgo } });
    
    console.log(`\n📊 Final StockData collection:`);
    console.log(`   Total documents: ${finalCount.toLocaleString()}`);
    console.log(`   Documents older than 2 years: ${finalOldCount.toLocaleString()}`);
    
    // Get date range of remaining data
    const oldestRemaining = await StockData.findOne()
      .sort({ date: 1 })
      .select('date stockName')
      .lean();
    
    const newestRemaining = await StockData.findOne()
      .sort({ date: -1 })
      .select('date stockName')
      .lean();
    
    if (oldestRemaining && newestRemaining) {
      console.log(`\n📅 Remaining data date range:`);
      console.log(`   Oldest: ${oldestRemaining.date.toISOString().split('T')[0]} (${oldestRemaining.stockName})`);
      console.log(`   Newest: ${newestRemaining.date.toISOString().split('T')[0]} (${newestRemaining.stockName})`);
    }
    
    // Get updated collection stats
    try {
      const stats = await db.command({ collStats: 'stockdatas' });
      console.log(`\n💾 Updated collection size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Storage size: ${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`);
    } catch (e) {
      // Stats might not be available immediately
      console.log('\n💡 Note: Collection stats may take a few minutes to update in MongoDB Atlas');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

main().catch(console.error);

