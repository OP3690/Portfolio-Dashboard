import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import StockData from '@/models/StockData';
import StockMaster from '@/models/StockMaster';
import Holding from '@/models/Holding';
import Transaction from '@/models/Transaction';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * Test endpoint to check database connection and collections
 */
export async function GET(request: NextRequest) {
  try {
    // Ensure connection is fully established and ready
    const connection = await connectDB();
    
    // Verify connection is ready
    if (mongoose.connection.readyState !== 1) {
      throw new Error(`Connection not ready. State: ${mongoose.connection.readyState}`);
    }
    
    // Verify we can access the database
    const db = connection.connection.db;
    if (!db) {
      throw new Error('Database object is null');
    }
    
    // Test connection with a ping
    try {
      await db.admin().ping();
    } catch (pingError: any) {
      throw new Error(`Connection ping failed: ${pingError.message}`);
    }
    
    const dbName = db.databaseName || 'unknown';
    
    // Get all collection names
    const collections = await db.listCollections().toArray();
    const collectionNames = collections?.map(c => c.name) || [];
    
    // Count documents in each collection
    const stockDataCount = await StockData.countDocuments();
    const stockMasterCount = await StockMaster.countDocuments();
    const holdingCount = await Holding.countDocuments();
    const transactionCount = await Transaction.countDocuments();
    
    // Get a sample document from StockData
    const sampleStockData = await StockData.findOne().lean();
    
    // Get connection info
    const connectionInfo = {
      host: connection.connection.host,
      port: connection.connection.port,
      name: connection.connection.name,
      readyState: connection.connection.readyState,
    };
    
    return NextResponse.json({
      success: true,
      database: {
        name: dbName,
        connection: connectionInfo,
      },
      collections: {
        all: collectionNames,
        expected: [
          'stockdatas',
          'stockmasters',
          'holdings',
          'transactions',
          'realizedprofitlosses'
        ],
      },
      counts: {
        stockdatas: stockDataCount,
        stockmasters: stockMasterCount,
        holdings: holdingCount,
        transactions: transactionCount,
      },
      sampleStockData: sampleStockData ? {
        isin: (sampleStockData as any).isin,
        stockName: (sampleStockData as any).stockName,
        date: (sampleStockData as any).date,
        close: (sampleStockData as any).close,
      } : null,
      mongooseModels: {
        StockData: StockData.collection.name,
        StockMaster: StockMaster.collection.name,
        Holding: Holding.collection.name,
        Transaction: Transaction.collection.name,
      },
    });
  } catch (error: any) {
    console.error('Test DB error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to test database connection',
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}

