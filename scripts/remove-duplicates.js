/**
 * Remove duplicate stock data records
 * Ensures unique records per (isin, date) combination
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
    
    // First, check for duplicates
    console.log('🔍 Checking for duplicate records...');
    
    // Find duplicates using aggregation
    const duplicates = await StockData.aggregate([
      {
        $group: {
          _id: { isin: "$isin", date: "$date" },
          count: { $sum: 1 },
          ids: { $push: "$_id" }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);
    
    console.log(`📊 Found ${duplicates.length} duplicate groups\n`);
    
    if (duplicates.length === 0) {
      console.log('✅ No duplicates found!');
      await mongoose.disconnect();
      process.exit(0);
    }
    
    let totalDuplicates = 0;
    let removed = 0;
    
    console.log('🗑️  Removing duplicates (keeping the most recent record)...\n');
    
    // Process duplicates in batches
    for (let i = 0; i < duplicates.length; i++) {
      const dup = duplicates[i];
      totalDuplicates += dup.count - 1; // Number of extra records
      
      // Keep the most recent one, delete others
      const ids = dup.ids;
      if (ids.length > 1) {
        // Get all records for this isin/date combination
        const records = await StockData.find({
          isin: dup._id.isin,
          date: dup._id.date
        }).sort({ lastUpdated: -1 }); // Sort by lastUpdated descending
        
        // Keep the first (most recent), delete the rest
        if (records.length > 1) {
          const idsToDelete = records.slice(1).map(r => r._id);
          const result = await StockData.deleteMany({ _id: { $in: idsToDelete } });
          removed += result.deletedCount || 0;
        }
      }
      
      if ((i + 1) % 100 === 0) {
        console.log(`   Processed ${i + 1}/${duplicates.length} duplicate groups (removed ${removed} duplicates so far)`);
      }
    }
    
    console.log(`\n✅ Duplicate removal complete!`);
    console.log(`   - Duplicate groups found: ${duplicates.length}`);
    console.log(`   - Duplicate records removed: ${removed}`);
    console.log(`   - Estimated space freed: ~${(removed * 2 / 1024).toFixed(2)} MB`);
    
    // Verify final count
    const finalCount = await StockData.countDocuments();
    console.log(`   - Final record count: ${finalCount.toLocaleString()}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

main().catch(console.error);

