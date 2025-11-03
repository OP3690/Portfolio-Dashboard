import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/portfolio';

async function checkBHEL() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const holdingsCollection = db.collection('holdings');

    // Get clientId from the first document or use default
    const firstHolding = await holdingsCollection.findOne({});
    const clientId = firstHolding?.clientId || '994826';
    
    console.log(`\n🔍 Checking for BHEL in database (clientId: ${clientId})...\n`);

    // Count total holdings
    const totalCount = await holdingsCollection.countDocuments({ clientId });
    console.log(`Total holdings in database: ${totalCount}`);

    // Find BHEL by ISIN
    const bhelByIsin = await holdingsCollection.findOne({
      clientId,
      isin: 'INE257A01026'
    });
    
    if (bhelByIsin) {
      console.log('✅ BHEL found by ISIN (INE257A01026):');
      console.log(`   Stock Name: ${bhelByIsin.stockName}`);
      console.log(`   ISIN: ${bhelByIsin.isin}`);
      console.log(`   Open Qty: ${bhelByIsin.openQty}`);
      console.log(`   _id: ${bhelByIsin._id}`);
    } else {
      console.log('❌ BHEL NOT found by exact ISIN match');
    }

    // Find BHEL by regex ISIN
    const bhelByRegexIsin = await holdingsCollection.findOne({
      clientId,
      isin: { $regex: /INE257A01026/i }
    });
    
    if (bhelByRegexIsin && !bhelByIsin) {
      console.log('\n✅ BHEL found by regex ISIN:');
      console.log(`   Stock Name: ${bhelByRegexIsin.stockName}`);
      console.log(`   ISIN: "${bhelByRegexIsin.isin}" (has whitespace/case issues)`);
      console.log(`   Open Qty: ${bhelByRegexIsin.openQty}`);
    }

    // Find BHEL by stock name
    const bhelByName = await holdingsCollection.findOne({
      clientId,
      stockName: { $regex: /b\s*h\s*e\s*l|bhel/i }
    });
    
    if (bhelByName && !bhelByIsin && !bhelByRegexIsin) {
      console.log('\n✅ BHEL found by stock name:');
      console.log(`   Stock Name: ${bhelByName.stockName}`);
      console.log(`   ISIN: ${bhelByName.isin}`);
      console.log(`   Open Qty: ${bhelByName.openQty}`);
    }

    // Try the main query that the dashboard uses
    const mainQueryResults = await holdingsCollection.find({ clientId }).toArray();
    console.log(`\n📊 Main query (find({ clientId })) returned: ${mainQueryResults.length} holdings`);
    
    const bhelInMainQuery = mainQueryResults.find(h => {
      const isin = String(h.isin || '').trim().toUpperCase();
      const stockName = String(h.stockName || '').toLowerCase();
      return isin === 'INE257A01026' || stockName.includes('bhel');
    });

    if (bhelInMainQuery) {
      console.log('✅ BHEL found in main query results:');
      console.log(`   Stock Name: ${bhelInMainQuery.stockName}`);
      console.log(`   ISIN: "${bhelInMainQuery.isin}"`);
      console.log(`   Open Qty: ${bhelInMainQuery.openQty}`);
    } else {
      console.log('❌ BHEL NOT found in main query results!');
      console.log(`   This explains why it's missing from the dashboard.`);
    }

    // List all ISINs from main query
    console.log('\n📋 All ISINs from main query:');
    const allIsins = mainQueryResults.map(h => ({
      stockName: h.stockName,
      isin: h.isin,
      openQty: h.openQty,
    })).sort((a, b) => a.stockName.localeCompare(b.stockName));
    
    allIsins.forEach((h, idx) => {
      const isBhel = String(h.isin || '').trim().toUpperCase() === 'INE257A01026' ||
                    String(h.stockName || '').toLowerCase().includes('bhel');
      const marker = isBhel ? '🔵' : '  ';
      console.log(`${marker} ${idx + 1}. ${h.stockName} - ISIN: "${h.isin}" - Qty: ${h.openQty}`);
    });

    // Check if there's a count mismatch
    if (totalCount !== mainQueryResults.length) {
      console.error(`\n🔴 COUNT MISMATCH!`);
      console.error(`   countDocuments: ${totalCount}`);
      console.error(`   find().toArray(): ${mainQueryResults.length}`);
      console.error(`   Missing: ${totalCount - mainQueryResults.length} holdings`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkBHEL();

