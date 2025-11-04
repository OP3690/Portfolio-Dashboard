import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * API endpoint to check MongoDB database space usage and statistics
 * GET /api/db-stats
 */
export async function GET(request: NextRequest) {
  try {
    const connection = await connectDB();
    const db = connection.connection.db;
    
    if (!db) {
      return NextResponse.json({
        success: false,
        error: 'Database connection not available',
      }, { status: 500 });
    }

    // Get database stats
    const dbStats = await db.stats();
    
    // Get all collection names
    const collections = await db.listCollections().toArray();
    
    // Get stats for each collection
    const collectionStats = await Promise.all(
      collections.map(async (collection) => {
        try {
          // Use db.command to get collection stats (native MongoDB driver method)
          const statsResult = await db.command({ collStats: collection.name });
          const count = await db.collection(collection.name).countDocuments();
          
          return {
            name: collection.name,
            count: count,
            size: statsResult.size || 0,
            storageSize: statsResult.storageSize || 0,
            totalIndexSize: statsResult.totalIndexSize || 0,
            avgObjSize: statsResult.avgObjSize || 0,
            nindexes: statsResult.nindexes || 0,
            sizeFormatted: formatBytes(statsResult.size || 0),
            storageSizeFormatted: formatBytes(statsResult.storageSize || 0),
            totalIndexSizeFormatted: formatBytes(statsResult.totalIndexSize || 0),
          };
        } catch (error: any) {
          return {
            name: collection.name,
            error: error.message,
          };
        }
      })
    );

    // Calculate total collection sizes
    const totalCollectionSize = collectionStats.reduce((sum, col) => {
      return sum + (col.storageSize || 0);
    }, 0);

    const totalDataSize = collectionStats.reduce((sum, col) => {
      return sum + (col.size || 0);
    }, 0);

    const totalIndexSize = collectionStats.reduce((sum, col) => {
      return sum + (col.totalIndexSize || 0);
    }, 0);

    // MongoDB Atlas free tier limits:
    // - Storage: 512 MB
    // - Database size: varies
    
    return NextResponse.json({
      success: true,
      database: {
        name: db.databaseName,
        collections: collections.length,
        dataSize: dbStats.dataSize,
        dataSizeFormatted: formatBytes(dbStats.dataSize),
        storageSize: dbStats.storageSize,
        storageSizeFormatted: formatBytes(dbStats.storageSize),
        indexSize: dbStats.indexSize,
        indexSizeFormatted: formatBytes(dbStats.indexSize),
        totalSize: dbStats.dataSize + dbStats.storageSize + dbStats.indexSize,
        totalSizeFormatted: formatBytes(dbStats.dataSize + dbStats.storageSize + dbStats.indexSize),
        objects: dbStats.objects,
        avgObjSize: dbStats.avgObjSize,
        fileSize: dbStats.fileSize,
        fileSizeFormatted: dbStats.fileSize ? formatBytes(dbStats.fileSize) : 'N/A',
      },
      collections: collectionStats,
      summary: {
        totalCollections: collections.length,
        totalDocuments: collectionStats.reduce((sum, col) => sum + (col.count || 0), 0),
        totalDataSize: totalDataSize,
        totalDataSizeFormatted: formatBytes(totalDataSize),
        totalStorageSize: totalCollectionSize,
        totalStorageSizeFormatted: formatBytes(totalCollectionSize),
        totalIndexSize: totalIndexSize,
        totalIndexSizeFormatted: formatBytes(totalIndexSize),
      },
      limits: {
        freeTierStorage: 512 * 1024 * 1024, // 512 MB
        freeTierStorageFormatted: '512 MB',
        usagePercent: ((dbStats.storageSize / (512 * 1024 * 1024)) * 100).toFixed(2),
      },
    });
  } catch (error: any) {
    console.error('Error fetching database stats:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch database statistics',
      },
      { status: 500 }
    );
  }
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

