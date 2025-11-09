/**
 * Utility function to delete stock data older than 2 years
 * This ensures the database always maintains only the last 2 years of data
 */

import StockData from '@/models/StockData';

/**
 * Deletes all stock data records older than 2 years from today
 * @returns Object with deletion statistics
 */
export async function cleanupOldStockData(): Promise<{
  success: boolean;
  deletedCount: number;
  cutoffDate: Date;
  error?: string;
}> {
  try {
    // Calculate cutoff date (2 years ago from today)
    const today = new Date();
    const twoYearsAgo = new Date(today);
    twoYearsAgo.setFullYear(today.getFullYear() - 2);
    twoYearsAgo.setHours(0, 0, 0, 0); // Set to start of day for clean cutoff
    
    console.log(`\n🧹 Starting cleanup of old stock data...`);
    console.log(`   Cutoff date: ${twoYearsAgo.toISOString().split('T')[0]}`);
    console.log(`   Will delete all records BEFORE: ${twoYearsAgo.toISOString().split('T')[0]}`);
    
    // Count records to be deleted
    const oldDataCount = await StockData.countDocuments({
      date: { $lt: twoYearsAgo }
    });
    
    if (oldDataCount === 0) {
      console.log(`   ✅ No old data to delete. All data is within the last 2 years.`);
      return {
        success: true,
        deletedCount: 0,
        cutoffDate: twoYearsAgo,
      };
    }
    
    console.log(`   Found ${oldDataCount.toLocaleString()} records to delete`);
    
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
      
      const idsToDelete = batch.map((r) => (r as any)._id);
      const result = await StockData.deleteMany({ _id: { $in: idsToDelete } });
      deletedCount += result.deletedCount || 0;
      batchNumber++;
      
      if (batchNumber % 10 === 0 || batch.length < BATCH_SIZE) {
        console.log(`   Batch ${batchNumber}: Deleted ${result.deletedCount || 0} documents (Total: ${deletedCount.toLocaleString()})`);
      }
      
      // Small delay between batches to avoid overwhelming the database
      if (batch.length === BATCH_SIZE) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    console.log(`   ✅ Cleanup complete! Deleted ${deletedCount.toLocaleString()} old records`);
    console.log(`   💾 Estimated space freed: ~${(deletedCount * 2 / 1024).toFixed(2)} MB`);
    
    return {
      success: true,
      deletedCount,
      cutoffDate: twoYearsAgo,
    };
    
  } catch (error: any) {
    console.error('❌ Error during cleanup:', error);
    return {
      success: false,
      deletedCount: 0,
      cutoffDate: new Date(),
      error: error.message || 'Unknown error during cleanup',
    };
  }
}

