import { NextRequest, NextResponse } from 'next/server';
import mongoose, { Connection } from 'mongoose';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Old database connection string
const OLD_MONGODB_URI = 'mongodb+srv://global5665:test123@cluster0.wigbba7.mongodb.net/OP_Portfolio_Dashboard?retryWrites=true&w=majority&appName=Cluster0';

// New database connection string
const NEW_MONGODB_URI = 'mongodb+srv://root:zUQfjzImQWoof7xs@cluster0.cyu0ctf.mongodb.net/OP_Portfolio_Dashboard?retryWrites=true&w=majority&appName=Cluster0';

/**
 * API endpoint to migrate all data from old MongoDB to new MongoDB
 * GET /api/migrate-to-new-db?deleteOld=true (optional parameter to delete old data)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const deleteOld = searchParams.get('deleteOld') === 'true';
  
  let oldConnection: Connection | null = null;
  let newConnection: Connection | null = null;
  
  try {
    console.log('🔄 Starting database migration...');
    console.log('📦 Old DB:', OLD_MONGODB_URI.replace(/:[^:@]+@/, ':****@'));
    console.log('📦 New DB:', NEW_MONGODB_URI.replace(/:[^:@]+@/, ':****@'));
    
    // Connect to old database
    console.log('\n1️⃣ Connecting to OLD database...');
    oldConnection = mongoose.createConnection(OLD_MONGODB_URI);
    await oldConnection.asPromise();
    const oldDb = oldConnection.db;
    if (!oldDb) {
      throw new Error('Failed to get OLD database connection');
    }
    console.log('✅ Connected to OLD database:', oldDb.databaseName);
    
    // Connect to new database
    console.log('\n2️⃣ Connecting to NEW database...');
    newConnection = mongoose.createConnection(NEW_MONGODB_URI);
    await newConnection.asPromise();
    const newDb = newConnection.db;
    if (!newDb) {
      throw new Error('Failed to get NEW database connection');
    }
    console.log('✅ Connected to NEW database:', newDb.databaseName);
    
    // Get all collections from old database
    console.log('\n3️⃣ Fetching collections from OLD database...');
    const collections = await oldDb.listCollections().toArray();
    console.log(`✅ Found ${collections.length} collections:`, collections.map(c => c.name).join(', '));
    
    const migrationResults: any[] = [];
    let totalDocumentsMigrated = 0;
    
    // Migrate each collection
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      console.log(`\n📦 Migrating collection: ${collectionName}...`);
      
      try {
        const oldCollection = oldDb.collection(collectionName);
        const newCollection = newDb.collection(collectionName);
        
        // Get count from old collection
        const oldCount = await oldCollection.countDocuments();
        console.log(`   📊 Documents in OLD: ${oldCount}`);
        
        if (oldCount === 0) {
          console.log(`   ⏭️  Skipping empty collection`);
          migrationResults.push({
            collection: collectionName,
            status: 'skipped',
            reason: 'Empty collection',
            documentsMigrated: 0,
          });
          continue;
        }
        
        // Check if collection exists in new database
        const existingCount = await newCollection.countDocuments();
        console.log(`   📊 Documents in NEW (before): ${existingCount}`);
        
        // Use aggregation to copy all documents
        const documents = await oldCollection.find({}).toArray();
        
        if (documents.length > 0) {
          // Insert documents in batches to avoid memory issues
          const BATCH_SIZE = 1000;
          let insertedCount = 0;
          
          for (let i = 0; i < documents.length; i += BATCH_SIZE) {
            const batch = documents.slice(i, i + BATCH_SIZE);
            // Remove _id to let MongoDB generate new ones (or keep them if you want to preserve)
            const batchToInsert = batch.map(doc => {
              // Keep _id to preserve document references
              return doc;
            });
            
            if (batchToInsert.length > 0) {
              try {
                await newCollection.insertMany(batchToInsert, { ordered: false });
                insertedCount += batchToInsert.length;
              } catch (error: any) {
                // Handle duplicate key errors (if documents already exist)
                if (error.code === 11000) {
                  // Try to insert one by one, skipping duplicates
                  for (const doc of batchToInsert) {
                    try {
                      await newCollection.insertOne(doc);
                      insertedCount++;
                    } catch (e: any) {
                      if (e.code !== 11000) {
                        console.error(`   ⚠️  Error inserting document:`, e.message);
                      }
                    }
                  }
                } else {
                  throw error;
                }
              }
            }
            
            console.log(`   ⏳ Progress: ${Math.min(i + BATCH_SIZE, documents.length)}/${documents.length} documents`);
          }
          
          const finalCount = await newCollection.countDocuments();
          console.log(`   ✅ Migrated: ${insertedCount} documents (Total in NEW: ${finalCount})`);
          
          totalDocumentsMigrated += insertedCount;
          
          migrationResults.push({
            collection: collectionName,
            status: 'success',
            documentsInOld: oldCount,
            documentsMigrated: insertedCount,
            documentsInNew: finalCount,
          });
          
          // Delete from old database if requested
          if (deleteOld && insertedCount > 0) {
            console.log(`   🗑️  Deleting from OLD database...`);
            const deleteResult = await oldCollection.deleteMany({});
            console.log(`   ✅ Deleted ${deleteResult.deletedCount} documents from OLD`);
            migrationResults[migrationResults.length - 1].deletedFromOld = deleteResult.deletedCount;
          }
        } else {
          migrationResults.push({
            collection: collectionName,
            status: 'skipped',
            reason: 'No documents to migrate',
            documentsMigrated: 0,
          });
        }
      } catch (error: any) {
        console.error(`   ❌ Error migrating ${collectionName}:`, error.message);
        migrationResults.push({
          collection: collectionName,
          status: 'error',
          error: error.message,
          documentsMigrated: 0,
        });
      }
    }
    
    // Create indexes on new database (copy from old)
    console.log('\n4️⃣ Copying indexes to NEW database...');
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      try {
        const oldCollection = oldDb.collection(collectionName);
        const newCollection = newDb.collection(collectionName);
        
        const indexes = await oldCollection.indexes();
        if (indexes.length > 1) { // More than just the default _id index
          console.log(`   📑 Copying ${indexes.length - 1} indexes for ${collectionName}...`);
          for (const index of indexes) {
            if (index.name !== '_id_') {
              try {
                const indexSpec = index.key as any;
                const indexOptions: any = { name: index.name };
                if (index.unique) indexOptions.unique = true;
                if (index.sparse) indexOptions.sparse = true;
                if (index.background) indexOptions.background = true;
                
                await newCollection.createIndex(indexSpec, indexOptions);
                console.log(`      ✅ Created index: ${index.name}`);
              } catch (e: any) {
                if (e.code === 85) { // Index already exists
                  console.log(`      ℹ️  Index ${index.name} already exists`);
                } else {
                  console.error(`      ⚠️  Error creating index ${index.name}:`, e.message);
                }
              }
            }
          }
        }
      } catch (error: any) {
        console.error(`   ⚠️  Error copying indexes for ${collectionName}:`, error.message);
      }
    }
    
    console.log('\n✅ Migration completed!');
    
    return NextResponse.json({
      success: true,
      message: deleteOld 
        ? 'Migration completed and old data deleted' 
        : 'Migration completed successfully',
      summary: {
        totalCollections: collections.length,
        totalDocumentsMigrated: totalDocumentsMigrated,
        collectionsMigrated: migrationResults.filter(r => r.status === 'success').length,
        collectionsSkipped: migrationResults.filter(r => r.status === 'skipped').length,
        collectionsFailed: migrationResults.filter(r => r.status === 'error').length,
      },
      results: migrationResults,
    });
    
  } catch (error: any) {
    console.error('❌ Migration failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Migration failed',
      },
      { status: 500 }
    );
  } finally {
    // Close connections
    if (oldConnection) {
      try {
        await oldConnection.close();
        console.log('✅ Closed OLD database connection');
      } catch (e) {
        console.error('Error closing old connection:', e);
      }
    }
    if (newConnection) {
      try {
        await newConnection.close();
        console.log('✅ Closed NEW database connection');
      } catch (e) {
        console.error('Error closing new connection:', e);
      }
    }
  }
}

