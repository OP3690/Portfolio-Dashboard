/**
 * Test IOCL price in database and trigger refresh
 */

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
    }
  });
}

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URL;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

const StockDataSchema = new mongoose.Schema({}, { strict: false, collection: 'stockdata' });
const StockMasterSchema = new mongoose.Schema({}, { strict: false, collection: 'stockmasters' });

async function testIOCLRefresh() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const StockData = mongoose.models.StockData || mongoose.model('StockData', StockDataSchema);
    const StockMaster = mongoose.models.StockMaster || mongoose.model('StockMaster', StockMasterSchema);
    
    const ioclIsin = 'INE242A01010';
    
    // Check current price in database
    console.log('\n📊 Checking current price in database...');
    const latestData = await StockData.findOne({ isin: ioclIsin })
      .sort({ date: -1 })
      .lean();
    
    if (latestData) {
      console.log(`✅ Found in database:`);
      console.log(`   Date: ${latestData.date}`);
      console.log(`   Close: ₹${latestData.close}`);
      console.log(`   Current Price: ₹${latestData.currentPrice || 'N/A'}`);
      console.log(`   Symbol: ${latestData.symbol || 'N/A'}`);
    } else {
      console.log('❌ No data found in database');
    }
    
    // Get symbol from StockMaster
    console.log('\n🔍 Getting symbol from StockMaster...');
    const stockMaster = await StockMaster.findOne({ isin: ioclIsin }).lean();
    if (stockMaster) {
      console.log(`✅ Symbol: ${stockMaster.symbol}, Exchange: ${stockMaster.exchange}`);
    } else {
      console.log('❌ StockMaster entry not found');
      await mongoose.disconnect();
      process.exit(1);
    }
    
    // Check today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    console.log(`\n📅 Today's date (midnight): ${today.toISOString()}`);
    
    // Check if today's price exists
    const todayData = await StockData.findOne({ 
      isin: ioclIsin,
      date: today
    }).lean();
    
    if (todayData) {
      console.log(`✅ Today's price exists: ₹${todayData.close}`);
    } else {
      console.log(`❌ Today's price does NOT exist in database`);
    }
    
    // Now trigger refresh via API
    console.log('\n🔄 Triggering refresh via API...');
    try {
      const response = await axios.post('http://localhost:3000/api/fetch-historical-data', {
        refreshLatest: true
      }, {
        timeout: 60000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ Refresh API response:', response.data);
    } catch (apiError) {
      console.error('❌ Refresh API error:', apiError.message);
      if (apiError.response) {
        console.error('   Response data:', apiError.response.data);
      }
    }
    
    // Wait a bit and check again
    console.log('\n⏳ Waiting 3 seconds for refresh to complete...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check again
    console.log('\n📊 Checking price again after refresh...');
    const updatedData = await StockData.findOne({ 
      isin: ioclIsin,
      date: today
    }).lean();
    
    if (updatedData) {
      console.log(`✅ Updated price: ₹${updatedData.close}`);
    } else {
      console.log(`❌ Still no today's price after refresh`);
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

testIOCLRefresh();
