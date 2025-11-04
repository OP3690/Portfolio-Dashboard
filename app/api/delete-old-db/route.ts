import { NextRequest, NextResponse } from 'next/server';
import mongoose, { Connection } from 'mongoose';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Old database connection string
const OLD_MONGODB_URI = 'mongodb+srv://global5665:test123@cluster0.wigbba7.mongodb.net/OP_Portfolio_Dashboard?retryWrites=true&w=majority&appName=Cluster0';

/**
 * API endpoint to delete all data from old MongoDB database
 * GET /api/delete-old-db
 * 
 * WARNING: This will permanently delete all data from the old database!
 */
export async function GET(request: NextRequest) {
  let oldConnection: Connection | null = null;
  
  try {
    console.log('🗑️  Starting deletion of OLD database...');
    console.log('📦 Old DB:', OLD_MONGODB_URI.replace(/:[^:@]+@/, ':****@'));
    
    // Connect to old database
    console.log('\n1️⃣ Connecting to OLD database...');
    oldConnection = mongoose.createConnection(OLD_MONGODB_URI);
    await oldConnection.asPromise();
    const oldDb = oldConnection.db;
    if (!oldDb) {
      throw new Error('Failed to get OLD database connection');
    }
    console.log('✅ Connected to OLD database:', oldDb.databaseName);
    
    // Get all collections from old database
    console.log('\n2️⃣ Fetching collections from OLD database...');
    const collections = await oldDb.listCollections().toArray();
    console.log(`✅ Found ${collections.length} collections:`, collections.map(c => c.name).join(', '));
    
    const deletionResults: any[] = [];
    let totalDocumentsDeleted = 0;
    
    // Delete all documents from each collection
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      console.log(`\n🗑️  Deleting collection: ${collectionName}...`);
      
      try {
        const oldCollection = oldDb.collection(collectionName);
        
        // Get count before deletion
        const countBefore = await oldCollection.countDocuments();
        console.log(`   📊 Documents before deletion: ${countBefore}`);
        
        if (countBefore === 0) {
          console.log(`   ⏭️  Collection is already empty`);
          deletionResults.push({
            collection: collectionName,
            status: 'skipped',
            reason: 'Collection already empty',
            documentsDeleted: 0,
          });
          continue;
        }
        
        // Delete all documents
        const deleteResult = await oldCollection.deleteMany({});
        console.log(`   ✅ Deleted ${deleteResult.deletedCount} documents`);
        
        totalDocumentsDeleted += deleteResult.deletedCount;
        
        deletionResults.push({
          collection: collectionName,
          status: 'success',
          documentsDeleted: deleteResult.deletedCount,
        });
      } catch (error: any) {
        console.error(`   ❌ Error deleting ${collectionName}:`, error.message);
        deletionResults.push({
          collection: collectionName,
          status: 'error',
          error: error.message,
          documentsDeleted: 0,
        });
      }
    }
    
    console.log('\n✅ Deletion completed!');
    
    return NextResponse.json({
      success: true,
      message: 'All data deleted from old database',
      summary: {
        totalCollections: collections.length,
        totalDocumentsDeleted: totalDocumentsDeleted,
        collectionsDeleted: deletionResults.filter(r => r.status === 'success').length,
        collectionsSkipped: deletionResults.filter(r => r.status === 'skipped').length,
        collectionsFailed: deletionResults.filter(r => r.status === 'error').length,
      },
      results: deletionResults,
    });
    
  } catch (error: any) {
    console.error('❌ Deletion failed:', error);
    
    // Provide helpful error messages
    let errorMessage = error.message || 'Deletion failed';
    if (error.message && error.message.includes('IP') && error.message.includes('whitelist')) {
      errorMessage = error.message + '\n\n📋 SOLUTION: Please whitelist IP addresses in MongoDB Atlas Network Access settings.';
    }
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  } finally {
    // Close connection
    if (oldConnection) {
      try {
        await oldConnection.close();
        console.log('✅ Closed OLD database connection');
      } catch (e) {
        console.error('Error closing connection:', e);
      }
    }
  }
}

