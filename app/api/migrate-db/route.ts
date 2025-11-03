import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * Migration endpoint to copy data from 'test' database to 'OP_Portfolio_Dashboard' database
 * GET /api/migrate-db - Migrate all relevant collections
 */
export async function GET(request: NextRequest) {
  try {
    // Connection string to source database (test)
    const sourceUri = process.env.MONGODB_URI?.replace(/\/[^/]*\?/, '/test?') || 'mongodb+srv://global5665:test123@cluster0.wigbba7.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0';
    
    // Connection string to target database (OP_Portfolio_Dashboard)
    const targetUri = process.env.MONGODB_URI?.replace(/\/[^/]*\?/, '/OP_Portfolio_Dashboard?') || 'mongodb+srv://global5665:test123@cluster0.wigbba7.mongodb.net/OP_Portfolio_Dashboard?retryWrites=true&w=majority&appName=Cluster0';
    
    console.log('🔄 Starting database migration...');
    console.log(`📥 Source: test database`);
    console.log(`📤 Target: OP_Portfolio_Dashboard database`);
    
    // Connect to source database
    const sourceConnection = await mongoose.createConnection(sourceUri).asPromise();
    const sourceDb = sourceConnection.db;
    if (!sourceDb) {
      return NextResponse.json({ error: 'Failed to connect to source database' }, { status: 500 });
    }
    console.log(`✅ Connected to source database: ${sourceDb.databaseName}`);
    
    // Connect to target database
    const targetConnection = await mongoose.createConnection(targetUri).asPromise();
    const targetDb = targetConnection.db;
    if (!targetDb) {
      return NextResponse.json({ error: 'Failed to connect to target database' }, { status: 500 });
    }
    console.log(`✅ Connected to target database: ${targetDb.databaseName}`);
    
    // Collections to migrate
    const collectionsToMigrate = [
      'holdings',
      'transactions',
      'realizedprofitlosses',
      'stockdatas',
      'stockmasters'
    ];
    
    const migrationResults: any = {};
    
    for (const collectionName of collectionsToMigrate) {
      try {
        console.log(`\n📦 Migrating collection: ${collectionName}`);
        
        // Get source collection
        const sourceCollection = sourceDb.collection(collectionName);
        const targetCollection = targetDb.collection(collectionName);
        
        // Count documents in source
        const sourceCount = await sourceCollection.countDocuments();
        console.log(`   Source documents: ${sourceCount}`);
        
        if (sourceCount === 0) {
          console.log(`   ⏭️  Skipping empty collection`);
          migrationResults[collectionName] = { sourceCount: 0, migratedCount: 0, skipped: true };
          continue;
        }
        
        // Get all documents from source
        const documents = await sourceCollection.find({}).toArray();
        console.log(`   Retrieved ${documents.length} documents`);
        
        // Clear target collection if it exists (optional - comment out if you want to append)
        const targetCount = await targetCollection.countDocuments();
        if (targetCount > 0) {
          console.log(`   ⚠️  Target collection has ${targetCount} documents. Will replace with source data.`);
          await targetCollection.deleteMany({});
        }
        
        // Insert documents into target
        if (documents.length > 0) {
          await targetCollection.insertMany(documents, { ordered: false });
          const finalCount = await targetCollection.countDocuments();
          console.log(`   ✅ Migrated ${finalCount} documents`);
          migrationResults[collectionName] = { 
            sourceCount, 
            migratedCount: finalCount, 
            success: true 
          };
        } else {
          migrationResults[collectionName] = { 
            sourceCount, 
            migratedCount: 0, 
            skipped: true 
          };
        }
        
        // Copy indexes
        const indexes = await sourceCollection.indexes();
        if (indexes.length > 1) { // More than just the default _id index
          console.log(`   📑 Copying ${indexes.length - 1} indexes...`);
          for (const index of indexes) {
            if (index.name !== '_id_') {
              try {
                // Remove the _id field from index spec if present
                const indexSpec = { ...index.key };
                delete indexSpec._id;
                
                if (Object.keys(indexSpec).length > 0) {
                  await targetCollection.createIndex(indexSpec, {
                    unique: index.unique || false,
                    name: index.name,
                    sparse: index.sparse || false,
                  });
                  console.log(`      ✅ Created index: ${index.name}`);
                }
              } catch (indexErr: any) {
                if (indexErr.code !== 85) { // Ignore duplicate index errors
                  console.log(`      ⚠️  Index ${index.name} already exists or error: ${indexErr.message}`);
                }
              }
            }
          }
        }
        
      } catch (err: any) {
        console.error(`   ❌ Error migrating ${collectionName}:`, err.message);
        migrationResults[collectionName] = { 
          error: err.message, 
          success: false 
        };
      }
    }
    
    // Close connections
    await sourceConnection.close();
    await targetConnection.close();
    
    console.log('\n✅ Migration completed!');
    
    // Summary
    const summary = {
      totalCollections: collectionsToMigrate.length,
      successful: Object.values(migrationResults).filter((r: any) => r.success).length,
      failed: Object.values(migrationResults).filter((r: any) => r.error).length,
      skipped: Object.values(migrationResults).filter((r: any) => r.skipped).length,
    };
    
    return NextResponse.json({
      success: true,
      message: 'Database migration completed',
      summary,
      results: migrationResults,
    });
    
  } catch (error: any) {
    console.error('❌ Migration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to migrate database',
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}

