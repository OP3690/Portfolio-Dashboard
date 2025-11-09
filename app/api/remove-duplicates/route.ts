import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import StockData from '@/models/StockData';
import StockMaster from '@/models/StockMaster';
import Holding from '@/models/Holding';
import Transaction from '@/models/Transaction';
import CorporateInfo from '@/models/CorporateInfo';

export const dynamic = 'force-dynamic';

/**
 * API endpoint to identify and remove duplicate data
 * GET /api/remove-duplicates?dryRun=true (default: true, set to false to actually remove)
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const dryRun = searchParams.get('dryRun') !== 'false'; // Default to dry run for safety
    
    console.log('\n🔍 ========================================');
    console.log(`🔍 ${dryRun ? 'DRY RUN: ' : ''}Identifying duplicate data...`);
    console.log(`🕐 Time: ${new Date().toLocaleString()}`);
    console.log('🔍 ========================================\n');
    
    const results: any = {
      dryRun,
      collections: {},
      totalDuplicatesFound: 0,
      totalSpaceToFree: 0,
    };
    
    // 1. Check StockData for duplicates (isin + date should be unique)
    // Use a more memory-efficient approach: find duplicates without loading all IDs
    console.log('📊 Checking StockData collection for duplicates...');
    
    // First, find duplicate groups (without loading all IDs to save memory)
    const stockDataDuplicateGroups = await StockData.aggregate([
      {
        $group: {
          _id: { isin: '$isin', date: '$date' },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]).allowDiskUse(true);
    
    console.log(`   Found ${stockDataDuplicateGroups.length} duplicate groups`);
    
    // Now process each group to get IDs (in batches to avoid memory issues)
    const stockDataDuplicates: any[] = [];
    const BATCH_SIZE = 100;
    
    for (let i = 0; i < stockDataDuplicateGroups.length; i += BATCH_SIZE) {
      const batch = stockDataDuplicateGroups.slice(i, i + BATCH_SIZE);
      
      for (const group of batch) {
        const records = await StockData.find({
          isin: group._id.isin,
          date: group._id.date
        }).select('_id lastUpdated').lean();
        
        stockDataDuplicates.push({
          _id: group._id,
          count: group.count,
          ids: records.map((r: any) => r._id)
        });
      }
      
      if ((i + BATCH_SIZE) % 500 === 0) {
        console.log(`   Processed ${Math.min(i + BATCH_SIZE, stockDataDuplicateGroups.length)}/${stockDataDuplicateGroups.length} groups...`);
      }
    }
    
    const stockDataDuplicateCount = stockDataDuplicates.length;
    const stockDataDuplicateDocs = stockDataDuplicates.reduce((sum, dup) => sum + dup.count - 1, 0);
    
    console.log(`   Found ${stockDataDuplicateCount} duplicate groups (${stockDataDuplicateDocs} duplicate documents)`);
    
    results.collections.StockData = {
      duplicateGroups: stockDataDuplicateCount,
      duplicateDocuments: stockDataDuplicateDocs,
      toRemove: stockDataDuplicateDocs,
    };
    results.totalDuplicatesFound += stockDataDuplicateDocs;
    
    // 2. Check StockMaster for duplicates (isin should be unique)
    console.log('📊 Checking StockMaster collection for duplicates...');
    const stockMasterDuplicates = await StockMaster.aggregate([
      {
        $group: {
          _id: '$isin',
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]).allowDiskUse(true);
    
    const stockMasterDuplicateCount = stockMasterDuplicates.length;
    const stockMasterDuplicateDocs = stockMasterDuplicates.reduce((sum, dup) => sum + dup.count - 1, 0);
    
    console.log(`   Found ${stockMasterDuplicateCount} duplicate groups (${stockMasterDuplicateDocs} duplicate documents)`);
    
    results.collections.StockMaster = {
      duplicateGroups: stockMasterDuplicateCount,
      duplicateDocuments: stockMasterDuplicateDocs,
      toRemove: stockMasterDuplicateDocs,
    };
    results.totalDuplicatesFound += stockMasterDuplicateDocs;
    
    // 3. Check Holdings for duplicates (clientId + isin + transactionDate should be unique, but let's check)
    console.log('📊 Checking Holdings collection for duplicates...');
    const holdingDuplicates = await Holding.aggregate([
      {
        $group: {
          _id: { clientId: '$clientId', isin: '$isin' },
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]).allowDiskUse(true);
    
    const holdingDuplicateCount = holdingDuplicates.length;
    const holdingDuplicateDocs = holdingDuplicates.reduce((sum, dup) => sum + dup.count - 1, 0);
    
    console.log(`   Found ${holdingDuplicateCount} duplicate groups (${holdingDuplicateDocs} duplicate documents)`);
    
    results.collections.Holdings = {
      duplicateGroups: holdingDuplicateCount,
      duplicateDocuments: holdingDuplicateDocs,
      toRemove: holdingDuplicateDocs,
    };
    results.totalDuplicatesFound += holdingDuplicateDocs;
    
    // 4. Check Transactions for duplicates
    console.log('📊 Checking Transactions collection for duplicates...');
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
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]).allowDiskUse(true);
    
    const transactionDuplicateCount = transactionDuplicates.length;
    const transactionDuplicateDocs = transactionDuplicates.reduce((sum, dup) => sum + dup.count - 1, 0);
    
    console.log(`   Found ${transactionDuplicateCount} duplicate groups (${transactionDuplicateDocs} duplicate documents)`);
    
    results.collections.Transactions = {
      duplicateGroups: transactionDuplicateCount,
      duplicateDocuments: transactionDuplicateDocs,
      toRemove: transactionDuplicateDocs,
    };
    results.totalDuplicatesFound += transactionDuplicateDocs;
    
    // 5. Check CorporateInfo for duplicates (isin should be unique)
    console.log('📊 Checking CorporateInfo collection for duplicates...');
    const corporateInfoDuplicates = await CorporateInfo.aggregate([
      {
        $group: {
          _id: '$isin',
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]).allowDiskUse(true);
    
    const corporateInfoDuplicateCount = corporateInfoDuplicates.length;
    const corporateInfoDuplicateDocs = corporateInfoDuplicates.reduce((sum, dup) => sum + dup.count - 1, 0);
    
    console.log(`   Found ${corporateInfoDuplicateCount} duplicate groups (${corporateInfoDuplicateDocs} duplicate documents)`);
    
    results.collections.CorporateInfo = {
      duplicateGroups: corporateInfoDuplicateCount,
      duplicateDocuments: corporateInfoDuplicateDocs,
      toRemove: corporateInfoDuplicateDocs,
    };
    results.totalDuplicatesFound += corporateInfoDuplicateDocs;
    
    // If not dry run, actually remove duplicates
    if (!dryRun) {
      console.log('\n🗑️  ========================================');
      console.log('🗑️  Removing duplicates...');
      console.log('🗑️  ========================================\n');
      
      let removedCount = 0;
      
      // Remove StockData duplicates (keep the first one, remove rest)
      if (stockDataDuplicateDocs > 0) {
        console.log(`🗑️  Removing ${stockDataDuplicateDocs} duplicate StockData documents...`);
        for (const dup of stockDataDuplicates) {
          // Keep the first ID, remove the rest
          const idsToRemove = dup.ids.slice(1);
          const deleteResult = await StockData.deleteMany({ _id: { $in: idsToRemove } });
          removedCount += deleteResult.deletedCount || 0;
        }
        console.log(`   ✅ Removed ${removedCount} StockData duplicates`);
      }
      
      // Remove StockMaster duplicates (keep the first one, remove rest)
      if (stockMasterDuplicateDocs > 0) {
        let removed = 0;
        console.log(`🗑️  Removing ${stockMasterDuplicateDocs} duplicate StockMaster documents...`);
        for (const dup of stockMasterDuplicates) {
          const idsToRemove = dup.ids.slice(1);
          const deleteResult = await StockMaster.deleteMany({ _id: { $in: idsToRemove } });
          removed += deleteResult.deletedCount || 0;
        }
        removedCount += removed;
        console.log(`   ✅ Removed ${removed} StockMaster duplicates`);
      }
      
      // Remove Holdings duplicates (keep the first one, remove rest)
      if (holdingDuplicateDocs > 0) {
        let removed = 0;
        console.log(`🗑️  Removing ${holdingDuplicateDocs} duplicate Holdings documents...`);
        for (const dup of holdingDuplicates) {
          const idsToRemove = dup.ids.slice(1);
          const deleteResult = await Holding.deleteMany({ _id: { $in: idsToRemove } });
          removed += deleteResult.deletedCount || 0;
        }
        removedCount += removed;
        console.log(`   ✅ Removed ${removed} Holdings duplicates`);
      }
      
      // Remove Transaction duplicates (keep the first one, remove rest)
      if (transactionDuplicateDocs > 0) {
        let removed = 0;
        console.log(`🗑️  Removing ${transactionDuplicateDocs} duplicate Transaction documents...`);
        for (const dup of transactionDuplicates) {
          const idsToRemove = dup.ids.slice(1);
          const deleteResult = await Transaction.deleteMany({ _id: { $in: idsToRemove } });
          removed += deleteResult.deletedCount || 0;
        }
        removedCount += removed;
        console.log(`   ✅ Removed ${removed} Transaction duplicates`);
      }
      
      // Remove CorporateInfo duplicates (keep the first one, remove rest)
      if (corporateInfoDuplicateDocs > 0) {
        let removed = 0;
        console.log(`🗑️  Removing ${corporateInfoDuplicateDocs} duplicate CorporateInfo documents...`);
        for (const dup of corporateInfoDuplicates) {
          const idsToRemove = dup.ids.slice(1);
          const deleteResult = await CorporateInfo.deleteMany({ _id: { $in: idsToRemove } });
          removed += deleteResult.deletedCount || 0;
        }
        removedCount += removed;
        console.log(`   ✅ Removed ${removed} CorporateInfo duplicates`);
      }
      
      results.removedCount = removedCount;
      console.log(`\n✅ Total duplicates removed: ${removedCount}`);
    } else {
      console.log('\n⚠️  DRY RUN: No duplicates were actually removed.');
      console.log('   To actually remove duplicates, call: /api/remove-duplicates?dryRun=false');
    }
    
    // Get collection sizes for reference
    const db = (await connectDB()).connection.db;
    if (db) {
      const collections = await db.listCollections().toArray();
      const collectionStats: any = {};
      
      for (const coll of collections) {
        try {
          const stats = await db.command({ collStats: coll.name });
          collectionStats[coll.name] = {
            count: stats.count || 0,
            size: stats.size || 0,
            storageSize: stats.storageSize || 0,
            sizeMB: ((stats.size || 0) / 1024 / 1024).toFixed(2),
            storageSizeMB: ((stats.storageSize || 0) / 1024 / 1024).toFixed(2),
          };
        } catch (e) {
          const count = await db.collection(coll.name).countDocuments();
          collectionStats[coll.name] = {
            count,
            size: 0,
            storageSize: 0,
            sizeMB: '0.00',
            storageSizeMB: '0.00',
          };
        }
      }
      
      results.collectionStats = collectionStats;
    }
    
    console.log('\n✅ ========================================');
    console.log('✅ Duplicate check complete!');
    console.log(`✅ Total duplicates found: ${results.totalDuplicatesFound}`);
    console.log('✅ ========================================\n');
    
    return NextResponse.json({
      success: true,
      ...results,
      message: dryRun 
        ? `Found ${results.totalDuplicatesFound} duplicate documents. Use ?dryRun=false to remove them.`
        : `Removed ${results.removedCount || 0} duplicate documents.`,
    });
    
  } catch (error: any) {
    console.error('❌ Error removing duplicates:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to remove duplicates',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

