import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const StockDataSchema = new mongoose.Schema({}, { strict: false, collection: 'stockdatas' });
const StockMasterSchema = new mongoose.Schema({}, { strict: false, collection: 'stockmasters' });
const HoldingSchema = new mongoose.Schema({}, { strict: false, collection: 'holdings' });
const TransactionSchema = new mongoose.Schema({}, { strict: false, collection: 'transactions' });
const CorporateInfoSchema = new mongoose.Schema({}, { strict: false, collection: 'corporateinfos' });

const StockData = mongoose.models.StockData || mongoose.model('StockData', StockDataSchema);
const StockMaster = mongoose.models.StockMaster || mongoose.model('StockMaster', StockMasterSchema);
const Holding = mongoose.models.Holding || mongoose.model('Holding', HoldingSchema);
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);
const CorporateInfo = mongoose.models.CorporateInfo || mongoose.model('CorporateInfo', CorporateInfoSchema);

async function checkDuplicates() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');
    
    const db = mongoose.connection.db;
    
    // Get collection stats
    const collections = await db.listCollections().toArray();
    console.log('📊 Collection Statistics:\n');
    
    for (const coll of collections) {
      const stats = await db.collection(coll.name).stats();
      console.log(`${coll.name}:`);
      console.log(`  - Count: ${stats.count.toLocaleString()}`);
      console.log(`  - Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  - Storage Size: ${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  - Indexes Size: ${(stats.totalIndexSize / 1024 / 1024).toFixed(2)} MB`);
      console.log('');
    }
    
    console.log('\n🔍 Checking for duplicates...\n');
    
    // 1. StockData - check for duplicates (isin + date)
    console.log('1. Checking StockData for duplicates (isin + date)...');
    const stockDataDuplicates = await StockData.aggregate([
      {
        $group: {
          _id: { isin: '$isin', date: '$date' },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ], { allowDiskUse: true });
    
    console.log(`   Found: ${stockDataDuplicates.length} duplicate groups`);
    if (stockDataDuplicates.length > 0) {
      const totalDups = stockDataDuplicates.reduce((sum, d) => sum + d.count - 1, 0);
      console.log(`   Total duplicate documents: ${totalDups}`);
    }
    
    // 2. StockMaster - check for duplicates (isin)
    console.log('\n2. Checking StockMaster for duplicates (isin)...');
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
    
    console.log(`   Found: ${stockMasterDuplicates.length} duplicate groups`);
    if (stockMasterDuplicates.length > 0) {
      const totalDups = stockMasterDuplicates.reduce((sum, d) => sum + d.count - 1, 0);
      console.log(`   Total duplicate documents: ${totalDups}`);
    }
    
    // 3. Holdings - check for duplicates
    console.log('\n3. Checking Holdings for duplicates...');
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
    
    console.log(`   Found: ${holdingDuplicates.length} duplicate groups`);
    if (holdingDuplicates.length > 0) {
      const totalDups = holdingDuplicates.reduce((sum, d) => sum + d.count - 1, 0);
      console.log(`   Total duplicate documents: ${totalDups}`);
    }
    
    // 4. Transactions - check for duplicates
    console.log('\n4. Checking Transactions for duplicates...');
    const transactionDuplicates = await Transaction.aggregate([
      {
        $group: {
          _id: {
            clientId: '$clientId',
            isin: '$isin',
            transactionDate: '$transactionDate',
            transactionType: '$transactionType',
            quantity: '$quantity',
            price: '$price'
          },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ], { allowDiskUse: true });
    
    console.log(`   Found: ${transactionDuplicates.length} duplicate groups`);
    if (transactionDuplicates.length > 0) {
      const totalDups = transactionDuplicates.reduce((sum, d) => sum + d.count - 1, 0);
      console.log(`   Total duplicate documents: ${totalDups}`);
    }
    
    // 5. CorporateInfo - check for duplicates (isin)
    console.log('\n5. Checking CorporateInfo for duplicates (isin)...');
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
    
    console.log(`   Found: ${corporateInfoDuplicates.length} duplicate groups`);
    if (corporateInfoDuplicates.length > 0) {
      const totalDups = corporateInfoDuplicates.reduce((sum, d) => sum + d.count - 1, 0);
      console.log(`   Total duplicate documents: ${totalDups}`);
    }
    
    // Summary
    const totalDuplicates = 
      stockDataDuplicates.reduce((sum, d) => sum + d.count - 1, 0) +
      stockMasterDuplicates.reduce((sum, d) => sum + d.count - 1, 0) +
      holdingDuplicates.reduce((sum, d) => sum + d.count - 1, 0) +
      transactionDuplicates.reduce((sum, d) => sum + d.count - 1, 0) +
      corporateInfoDuplicates.reduce((sum, d) => sum + d.count - 1, 0);
    
    console.log('\n📊 Summary:');
    console.log(`   Total duplicate documents across all collections: ${totalDuplicates}`);
    console.log(`   Estimated space to free: ~${(totalDuplicates * 2 / 1024).toFixed(2)} MB`);
    
    await mongoose.disconnect();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkDuplicates();

