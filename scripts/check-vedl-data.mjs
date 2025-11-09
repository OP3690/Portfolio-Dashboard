import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

async function checkData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const StockData = mongoose.model('StockData', new mongoose.Schema({}, { strict: false, collection: 'stockdata' }));
    const StockMaster = mongoose.model('StockMaster', new mongoose.Schema({}, { strict: false, collection: 'stockmaster' }));
    
    const isin = 'INE205A01025';
    const isinUpper = isin.toUpperCase();
    
    console.log('\n📊 Checking ISIN:', isinUpper);
    
    // Check StockMaster
    const stock = await StockMaster.findOne({ isin: isinUpper }).lean();
    console.log('StockMaster found:', !!stock);
    if (stock) {
      console.log('  - ISIN:', stock.isin);
      console.log('  - Symbol:', stock.symbol);
      console.log('  - Stock Name:', stock.stockName);
    } else {
      // Try case-insensitive
      const stockCI = await StockMaster.findOne({ 
        isin: { $regex: new RegExp(`^${isinUpper}$`, 'i') } 
      }).lean();
      if (stockCI) {
        console.log('  - Found with case-insensitive search');
        console.log('  - ISIN:', stockCI.isin);
        console.log('  - Symbol:', stockCI.symbol);
      }
    }
    
    // Check StockData count
    const count = await StockData.countDocuments({ isin: isinUpper });
    console.log('\n📈 StockData count (exact match):', count);
    
    // Check with case-insensitive
    const countCI = await StockData.countDocuments({ 
      isin: { $regex: new RegExp(`^${isinUpper}$`, 'i') } 
    });
    console.log('📈 StockData count (case-insensitive):', countCI);
    
    // Get sample dates
    const sample = await StockData.find({ 
      isin: { $regex: new RegExp(`^${isinUpper}$`, 'i') } 
    })
      .sort({ date: -1 })
      .limit(10)
      .select('date isin close')
      .lean();
    console.log('\n📅 Sample records (latest 10):');
    sample.forEach(s => {
      console.log(`  - ${s.date?.toISOString().split('T')[0]} | ISIN: ${s.isin} | Close: ${s.close}`);
    });
    
    // Check date range
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    threeYearsAgo.setHours(0, 0, 0, 0);
    
    const countLast3Years = await StockData.countDocuments({
      isin: { $regex: new RegExp(`^${isinUpper}$`, 'i') },
      date: { $gte: threeYearsAgo, $lte: today }
    });
    console.log(`\n📊 Records in last 3 years (${threeYearsAgo.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]}):`, countLast3Years);
    
    // Check all ISIN formats in StockData for this stock
    const allIsins = await StockData.distinct('isin', { 
      $or: [
        { isin: isinUpper },
        { isin: { $regex: new RegExp(`^${isinUpper}$`, 'i') } }
      ]
    });
    console.log('\n🔍 All ISIN formats found in StockData:', allIsins);
    
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkData();

