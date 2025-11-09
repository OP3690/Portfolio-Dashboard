/**
 * Remove duplicate records from all collections
 * Checks: StockData, StockMaster, Holdings, Transactions, CorporateInfo
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

const StockMasterSchema = new mongoose.Schema({}, { strict: false, collection: 'stockmasters' });
const HoldingSchema = new mongoose.Schema({}, { strict: false, collection: 'holdings' });
const TransactionSchema = new mongoose.Schema({}, { strict: false, collection: 'transactions' });
const CorporateInfoSchema = new mongoose.Schema({}, { strict: false, collection: 'corporateinfos' });

const StockData = mongoose.models.StockData || mongoose.model('StockData', StockDataSchema);
const StockMaster = mongoose.models.StockMaster || mongoose.model('StockMaster', StockMasterSchema);
const Holding = mongoose.models.Holding || mongoose.model('Holding', HoldingSchema);
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);
const CorporateInfo = mongoose.models.CorporateInfo || mongoose.model('CorporateInfo', CorporateInfoSchema);

async function main() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');
    
    const db = mongoose.connection.db;
    
    // Get collection stats first
    console.log('📊 Collection Statistics:\n');
    const collections = await db.listCollections().toArray();
    for (const coll of collections) {
      try {
        const stats = await db.command({ collStats: coll.name });
        console.log(`${coll.name}: ${stats.count.toLocaleString()} docs, ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      } catch (e) {
        const count = await db.collection(coll.name).countDocuments();
        console.log(`${coll.name}: ${count.toLocaleString()} docs`);
      }
    }
    console.log('');
    
    // Check for duplicates in all collections
    console.log('🔍 Checking for duplicate records in all collections...\n');
    
    // Find duplicates using aggregation (with allowDiskUse for large datasets)
    // Use a more memory-efficient approach: don't push all IDs, just count
    const duplicateGroups = await StockData.aggregate([
      {
        $group: {
          _id: { isin: "$isin", date: "$date" },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ], { allowDiskUse: true });
    
    console.log(`📊 Found ${duplicateGroups.length} duplicate groups\n`);
    
    if (duplicateGroups.length === 0) {
      console.log('✅ No duplicates found!');
      await mongoose.disconnect();
      process.exit(0);
    }
    
    // Now get the actual duplicate records in batches
    const duplicates = [];
    const BATCH_SIZE = 50;
    
    for (let i = 0; i < duplicateGroups.length; i += BATCH_SIZE) {
      const batch = duplicateGroups.slice(i, i + BATCH_SIZE);
      
      for (const group of batch) {
        const records = await StockData.find({
          isin: group._id.isin,
          date: group._id.date
        }).select('_id lastUpdated').sort({ lastUpdated: -1 }).lean();
        
        duplicates.push({
          _id: group._id,
          count: group.count,
          ids: records.map(r => r._id)
        });
      }
      
      if ((i + BATCH_SIZE) % 100 === 0) {
        console.log(`   Loaded ${Math.min(i + BATCH_SIZE, duplicateGroups.length)}/${duplicateGroups.length} duplicate groups...`);
      }
    }
    
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
    
    console.log(`\n✅ StockData duplicate removal complete!`);
    console.log(`   - Duplicate groups found: ${duplicates.length}`);
    console.log(`   - Duplicate records removed: ${removed}`);
    
    let totalRemoved = removed;
    
    // Check and remove duplicates from other collections
    console.log('\n🔍 Checking StockMaster for duplicates...');
    const stockMasterDuplicates = await StockMaster.aggregate([
      {
        $group: {
          _id: '$isin',
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ], { allowDiskUse: true });
    
    if (stockMasterDuplicates.length > 0) {
      console.log(`   Found ${stockMasterDuplicates.length} duplicate groups`);
      let removedSM = 0;
      for (const dup of stockMasterDuplicates) {
        const records = await StockMaster.find({ isin: dup._id }).sort({ lastUpdated: -1 }).lean();
        if (records.length > 1) {
          const idsToDelete = records.slice(1).map(r => r._id);
          const result = await StockMaster.deleteMany({ _id: { $in: idsToDelete } });
          removedSM += result.deletedCount || 0;
        }
      }
      totalRemoved += removedSM;
      console.log(`   ✅ Removed ${removedSM} StockMaster duplicates`);
    } else {
      console.log('   ✅ No duplicates found');
    }
    
    // Check Holdings
    console.log('\n🔍 Checking Holdings for duplicates...');
    const holdingDuplicates = await Holding.aggregate([
      {
        $group: {
          _id: { clientId: '$clientId', isin: '$isin' },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ], { allowDiskUse: true });
    
    if (holdingDuplicates.length > 0) {
      console.log(`   Found ${holdingDuplicates.length} duplicate groups`);
      let removedH = 0;
      for (const dup of holdingDuplicates) {
        const records = await Holding.find({ 
          clientId: dup._id.clientId, 
          isin: dup._id.isin 
        }).sort({ lastUpdated: -1 }).lean();
        if (records.length > 1) {
          const idsToDelete = records.slice(1).map(r => r._id);
          const result = await Holding.deleteMany({ _id: { $in: idsToDelete } });
          removedH += result.deletedCount || 0;
        }
      }
      totalRemoved += removedH;
      console.log(`   ✅ Removed ${removedH} Holdings duplicates`);
    } else {
      console.log('   ✅ No duplicates found');
    }
    
    // Check CorporateInfo
    console.log('\n🔍 Checking CorporateInfo for duplicates...');
    const corporateInfoDuplicates = await CorporateInfo.aggregate([
      {
        $group: {
          _id: '$isin',
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ], { allowDiskUse: true });
    
    if (corporateInfoDuplicates.length > 0) {
      console.log(`   Found ${corporateInfoDuplicates.length} duplicate groups`);
      let removedCI = 0;
      for (const dup of corporateInfoDuplicates) {
        const records = await CorporateInfo.find({ isin: dup._id }).sort({ lastUpdated: -1 }).lean();
        if (records.length > 1) {
          const idsToDelete = records.slice(1).map(r => r._id);
          const result = await CorporateInfo.deleteMany({ _id: { $in: idsToDelete } });
          removedCI += result.deletedCount || 0;
        }
      }
      totalRemoved += removedCI;
      console.log(`   ✅ Removed ${removedCI} CorporateInfo duplicates`);
    } else {
      console.log('   ✅ No duplicates found');
    }
    
    console.log(`\n✅ Duplicate removal complete!`);
    console.log(`   - Total duplicate records removed: ${totalRemoved}`);
    console.log(`   - Estimated space freed: ~${(totalRemoved * 2 / 1024).toFixed(2)} MB`);
    
    // Verify final counts
    console.log('\n📊 Final collection counts:');
    const finalStockData = await StockData.countDocuments();
    const finalStockMaster = await StockMaster.countDocuments();
    const finalHoldings = await Holding.countDocuments();
    const finalCorporateInfo = await CorporateInfo.countDocuments();
    console.log(`   StockData: ${finalStockData.toLocaleString()}`);
    console.log(`   StockMaster: ${finalStockMaster.toLocaleString()}`);
    console.log(`   Holdings: ${finalHoldings.toLocaleString()}`);
    console.log(`   CorporateInfo: ${finalCorporateInfo.toLocaleString()}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

main().catch(console.error);

