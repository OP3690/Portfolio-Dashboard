import mongoose from 'mongoose';

// Default connection string with database name
const DEFAULT_MONGODB_URI = 'mongodb+srv://global5665:test123@cluster0.wigbba7.mongodb.net/OP_Portfolio_Dashboard?retryWrites=true&w=majority&appName=Cluster0';

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
  // Check if connection is still valid
  if (cached.conn && mongoose.connection.readyState === 1) {
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
      // Add options to handle stale connections better
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      // Retry logic for replica sets
      retryWrites: true,
      retryReads: true,
      // Clear stale connections
      maxPoolSize: 10,
      minPoolSize: 2,
    };

    cached.promise = mongoose.connect(connectionUri, opts).then((mongoose) => {
      const dbName = mongoose.connection.db?.databaseName || 'unknown';
      const host = mongoose.connection.host || 'unknown';
      const port = mongoose.connection.port || 'unknown';
      console.log(`✅ Connected to MongoDB database: ${dbName}`);
      console.log(`🌐 Connection host: ${host}:${port}`);
      console.log(`📊 Collections will be stored in: ${dbName}`);
      console.log(`🔗 Connection URI (masked): ${connectionUri.replace(/:[^:@]+@/, ':****@')}`);
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    cached.conn = null;
    console.error('❌ MongoDB connection error:', e);
    
    // If it's a stale connection error, clear cache and retry once
    if (e && typeof e === 'object' && 'message' in e && 
        (e as any).message?.includes('stale') || 
        (e as any).message?.includes('electionId')) {
      console.log('🔄 Retrying connection due to stale topology...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      cached.promise = null;
      cached.conn = null;
      return connectDB(); // Retry once
    }
    
    throw e;
  }

  return cached.conn;
}

export default connectDB;

