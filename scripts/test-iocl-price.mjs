import mongoose from 'mongoose';
import StockData from '../models/StockData.js';
import StockMaster from '../models/StockMaster.js';
import { fetchCurrentPriceFromNSE } from '../lib/stockDataService.js';
import connectDB from '../lib/mongodb.js';

async function testIOCLPrice() {
  try {
    console.log('🔗 Connecting to database...');
    await connectDB();
    
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
      
      // Test NSE API
      if (stockMaster.exchange === 'NSE' && stockMaster.symbol) {
        console.log(`\n🌐 Testing NSE API for ${stockMaster.symbol}...`);
        const nsePrice = await fetchCurrentPriceFromNSE(stockMaster.symbol);
        if (nsePrice) {
          console.log(`✅ NSE API Response:`);
          console.log(`   Price: ₹${nsePrice.price}`);
          console.log(`   Date: ${nsePrice.date}`);
          console.log(`   Source: ${nsePrice.source}`);
        } else {
          console.log('❌ NSE API returned null');
        }
      }
    } else {
      console.log('❌ StockMaster entry not found');
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
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testIOCLPrice();

