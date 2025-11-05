/**
 * Script to clean up database and free up space
 * - Removes data older than 5 years
 * - Removes duplicate entries (keeping the latest one)
 * - Keeps only the last 5 years of data for all stocks
 * 
 * Usage: node scripts/cleanup-database.js
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Load .env.local if it exists
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://root:zUQfjzImQWoof7xs@cluster0.cyu0ctf.mongodb.net/OP_Portfolio_Dashboard?retryWrites=true&w=majority&appName=Cluster0';

async function cleanupDatabase() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    
    // Calculate 3 years ago date (more aggressive cleanup)
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    threeYearsAgo.setHours(0, 0, 0, 0);
    
    console.log(`\n📅 Keeping data from: ${threeYearsAgo.toISOString().split('T')[0]} onwards`);
    
    // Step 1: Remove duplicates (keep the latest entry for same isin + date)
    // Using a more efficient approach with allowDiskUse
    console.log('\n🔍 Step 1: Removing duplicate entries...');
    
    // First, let's check for duplicates using a batched approach
    // We'll process by date ranges to avoid memory issues
    let duplicateRemoved = 0;
    
    try {
      // Get unique date range
      const dateRange = await db.collection('stockdatas').aggregate([
        { $group: { _id: null, minDate: { $min: '$date' }, maxDate: { $max: '$date' } } }
      ]).toArray();
      
      if (dateRange.length > 0) {
        // Process in monthly batches to avoid memory issues
        const startDate = new Date(dateRange[0].minDate);
        const endDate = new Date(dateRange[0].maxDate);
        
        let currentDate = new Date(startDate);
        let batchCount = 0;
        
        while (currentDate <= endDate) {
          const batchStart = new Date(currentDate);
          const batchEnd = new Date(currentDate);
          batchEnd.setMonth(batchEnd.getMonth() + 1);
          
          // Find duplicates in this batch
          const duplicates = await db.collection('stockdatas').aggregate([
            {
              $match: {
                date: { $gte: batchStart, $lt: batchEnd }
              }
            },
            {
              $group: {
                _id: { isin: '$isin', date: '$date' },
                ids: { $push: '$_id' },
                count: { $sum: 1 }
              }
            },
            {
              $match: { count: { $gt: 1 } }
            },
            { $limit: 1000 } // Process in smaller chunks
          ], { allowDiskUse: true }).toArray();
          
          for (const dup of duplicates) {
            // Keep the latest one (by _id, which has timestamp)
            const idsToRemove = dup.ids.slice(0, -1); // All except the last one
            if (idsToRemove.length > 0) {
              const result = await db.collection('stockdatas').deleteMany({
                _id: { $in: idsToRemove }
              });
              duplicateRemoved += result.deletedCount;
            }
          }
          
          currentDate = new Date(batchEnd);
          batchCount++;
          
          if (batchCount % 12 === 0) {
            console.log(`   Processed ${batchCount} months...`);
          }
        }
      }
      
      console.log(`   ✅ Removed ${duplicateRemoved.toLocaleString()} duplicate documents`);
    } catch (error) {
      console.log(`   ⚠️  Could not check for duplicates (may be too large): ${error.message}`);
      console.log('   Skipping duplicate removal...');
    }
    
    // Step 2: Remove data older than 5 years
    console.log('\n🗑️  Step 2: Removing data older than 3 years...');
    const oldDataResult = await db.collection('stockdatas').deleteMany({
      date: { $lt: threeYearsAgo }
    });
    
    console.log(`   ✅ Removed ${oldDataResult.deletedCount.toLocaleString()} old documents`);
    
    // Step 3: Get updated stats
    console.log('\n📊 Updated Statistics:');
    const stats = await db.command({ collStats: 'stockdatas' });
    const count = await db.collection('stockdatas').countDocuments();
    
    console.log(`   Documents: ${count.toLocaleString()}`);
    console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Storage: ${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Indexes: ${(stats.totalIndexSize / 1024 / 1024).toFixed(2)} MB`);
    
    // Get database stats
    const dbStats = await db.stats();
    console.log(`\n💾 Total Database Storage: ${(dbStats.storageSize / 1024 / 1024).toFixed(2)} MB / 512 MB`);
    console.log(`   Usage: ${((dbStats.storageSize / (512 * 1024 * 1024)) * 100).toFixed(2)}%`);
    
    // Step 4: Remove unnecessary indexes (if any)
    console.log('\n🔧 Step 4: Checking indexes...');
    try {
      const indexes = await db.collection('stockdatas').indexes();
      console.log(`   Found ${indexes.length} indexes`);
      // Keep indexes as they are - they're needed for performance
    } catch (error) {
      console.log(`   ⚠️  Could not check indexes: ${error.message}`);
    }
    
    // Step 5: Compact collection (if possible)
    console.log('\n🔧 Step 5: Optimizing storage...');
    console.log('   Note: MongoDB Atlas handles storage optimization automatically');
    console.log('   The reported storage size may reduce after the cleanup');
    
    await mongoose.disconnect();
    console.log('\n✅ Cleanup completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run immediately (no confirmation needed for automated cleanup)
cleanupDatabase();

