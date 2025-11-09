import mongoose from 'mongoose';

// Default connection string with database name
const DEFAULT_MONGODB_URI = 'mongodb+srv://root:zUQfjzImQWoof7xs@cluster0.cyu0ctf.mongodb.net/OP_Portfolio_Dashboard?retryWrites=true&w=majority&appName=Cluster0';

const MONGODB_URI = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;

// Ensure database name is in the connection string
let connectionUri = MONGODB_URI;
if (!connectionUri.includes('/') || connectionUri.match(/\/\?/)) {
  // If no database name specified, add OP_Portfolio_Dashboard
  connectionUri = connectionUri.replace(/\?/, '/OP_Portfolio_Dashboard?').replace(/\/\/OP_Portfolio_Dashboard/, '/OP_Portfolio_Dashboard');
}

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongoose: MongooseCache;
}

let cached: MongooseCache = global.mongoose || { conn: null, promise: null };

if (!global.mongoose) {
  global.mongoose = cached;
}

async function connectDB() {
  // Check if connection is still valid and ready
  if (cached.conn && mongoose.connection.readyState === 1) {
    // Connection appears ready, return it
    // Note: We don't ping here to avoid blocking - if connection is stale, operations will fail and we'll reconnect
    return cached.conn;
  }

  // If connection exists but is stale, close it and reconnect
  if (cached.conn && mongoose.connection.readyState !== 1) {
    console.log('⚠️  MongoDB connection is stale, reconnecting...');
    try {
      await mongoose.connection.close();
    } catch (e) {
      // Ignore errors when closing
    }
    cached.conn = null;
    cached.promise = null;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      // Increased timeouts for better reliability
      serverSelectionTimeoutMS: 30000, // 30 seconds (increased from 10)
      socketTimeoutMS: 60000, // 60 seconds (increased from 45)
      connectTimeoutMS: 30000, // 30 seconds for initial connection
      // Retry logic for replica sets
      retryWrites: true,
      retryReads: true,
      // Connection pooling
      maxPoolSize: 10,
      minPoolSize: 2,
      // Keep connections alive
      heartbeatFrequencyMS: 10000,
      // Handle DNS resolution better
      directConnection: false,
    };

    cached.promise = mongoose.connect(connectionUri, opts).then(async (mongoose) => {
      // Wait for connection to be fully ready
      // mongoose.connect() resolves when connection is established, but we need to verify it's ready
      let retries = 0;
      const maxRetries = 10;
      
      while (mongoose.connection.readyState !== 1 && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
        retries++;
      }
      
      if (mongoose.connection.readyState !== 1) {
        throw new Error(`Connection not ready after ${maxRetries * 500}ms. State: ${mongoose.connection.readyState}`);
      }
      
      // Verify connection with a ping (but don't fail if db is not yet available)
      try {
        if (mongoose.connection.db) {
          await mongoose.connection.db.admin().ping();
        }
      } catch (pingError: any) {
        // If ping fails, wait a bit more and try once more
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (mongoose.connection.db) {
          try {
            await mongoose.connection.db.admin().ping();
          } catch (retryPingError) {
            // Don't throw - connection might still work for queries
            console.warn('⚠️  Connection ping failed, but continuing:', retryPingError);
          }
        }
      }
      
      const dbName = mongoose.connection.db?.databaseName || 'unknown';
      const host = mongoose.connection.host || 'unknown';
      const port = mongoose.connection.port || 'unknown';
      console.log(`✅ Connected to MongoDB database: ${dbName}`);
      console.log(`🌐 Connection host: ${host}:${port}`);
      console.log(`📊 Collections will be stored in: ${dbName}`);
      console.log(`🔗 Connection URI (masked): ${connectionUri.replace(/:[^:@]+@/, ':****@')}`);
      
      // Set up connection event handlers
      mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err);
        cached.conn = null;
        cached.promise = null;
      });
      
      mongoose.connection.on('disconnected', () => {
        console.log('⚠️  MongoDB disconnected');
        cached.conn = null;
        cached.promise = null;
      });
      
      mongoose.connection.on('reconnected', () => {
        console.log('✅ MongoDB reconnected');
      });
      
      return mongoose;
    });
  }

  try {
    // Add timeout to the connection promise
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database connection timeout after 30 seconds')), 30000)
    );
    
    cached.conn = await Promise.race([cached.promise, timeoutPromise]) as typeof mongoose;
    
    // Verify connection is actually ready before returning
    if (mongoose.connection.readyState !== 1) {
      throw new Error(`Connection established but not ready. State: ${mongoose.connection.readyState}`);
    }
    
    // Connection is ready - don't ping here as it can cause issues
    // If connection is actually stale, operations will fail and trigger reconnection
  } catch (e: any) {
    cached.promise = null;
    cached.conn = null;
    console.error('❌ MongoDB connection error:', e);
    
    // Check for specific error types
    const errorMessage = e?.message || '';
    const isTimeout = errorMessage.includes('timeout') || 
                     errorMessage.includes('ETIMEOUT') ||
                     errorMessage.includes('serverSelectionTimeoutMS');
    const isStale = errorMessage.includes('stale') || 
                   errorMessage.includes('electionId');
    const isNetwork = errorMessage.includes('ENOTFOUND') ||
                     errorMessage.includes('ECONNREFUSED');
    
    // Retry logic with exponential backoff
    if (isTimeout || isStale || isNetwork) {
      console.log(`🔄 Retrying connection (${isTimeout ? 'timeout' : isStale ? 'stale' : 'network'} error)...`);
      
      // Wait before retry (exponential backoff: 1s, 2s, 4s)
      const retryDelay = Math.min(1000 * Math.pow(2, 0), 4000);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      
      // Clear cache and retry once
      cached.promise = null;
      cached.conn = null;
      
      // Only retry once to avoid infinite loops
      const mongooseCache = global.mongoose as any;
      if (!mongooseCache?.retryAttempted) {
        global.mongoose = global.mongoose || { conn: null, promise: null };
        mongooseCache.retryAttempted = true;
        try {
          return await connectDB();
        } finally {
          (global.mongoose as any).retryAttempted = false;
        }
      }
    }
    
    throw e;
  }

  return cached.conn;
}

export default connectDB;

