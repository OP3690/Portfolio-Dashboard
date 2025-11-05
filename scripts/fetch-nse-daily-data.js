#!/usr/bin/env node

/**
 * Script to fetch and store NSE daily data for all stocks
 * This runs once to populate initial data
 * 
 * Usage: node scripts/fetch-nse-daily-data.js
 */

require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');
const { processAllStocksNSEDailyData } = require('../lib/nseDailyDataService');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://root:zUQfjzImQWoof7xs@cluster0.cyu0ctf.mongodb.net/OP_Portfolio_Dashboard?retryWrites=true&w=majority&appName=Cluster0';

async function main() {
  try {
    console.log('🚀 Starting NSE daily data fetch for all stocks...');
    console.log('📅 This will fetch and store:');
    console.log('   - Daily fields: totalTradedVolume, totalBuyQuantity, totalSellQuantity');
    console.log('   - Stock-level updates: industry, isFNOSec, pdSectorInd, pdSectorPe, pdSymbolPe');
    console.log('');
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Process all stocks
    const result = await processAllStocksNSEDailyData();
    
    console.log('\n✅ Script completed successfully!');
    console.log(`   - Total: ${result.total}`);
    console.log(`   - Processed: ${result.processed}`);
    console.log(`   - Failed: ${result.failed}`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Script failed:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

main();

