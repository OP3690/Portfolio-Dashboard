import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const StockDataSchema = new mongoose.Schema({}, { strict: false, collection: 'stockdata' });

(async () => {
  await mongoose.connect(MONGODB_URI);
  const StockData = mongoose.models.StockData || mongoose.model('StockData', StockDataSchema);
  const ioclIsin = 'INE242A01010';
  
  // Get all IOCL records
  const allData = await StockData.find({ isin: ioclIsin }).sort({ date: -1 }).limit(10).lean();
  console.log(`\n📊 All IOCL records (last 10):`);
  allData.forEach((d, i) => {
    console.log(`${i+1}. Date: ${d.date}, Close: ₹${d.close}, Symbol: ${d.symbol || 'N/A'}`);
  });
  
  // Check today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  console.log(`\n📅 Today (midnight local): ${today.toISOString()}`);
  console.log(`📅 Today (midnight UTC): ${new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString()}`);
  
  // Check with different date ranges
  const todayStart = new Date(today);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setUTCHours(23, 59, 59, 999);
  
  const todayData = await StockData.find({ 
    isin: ioclIsin,
    date: { $gte: todayStart, $lte: todayEnd }
  }).lean();
  
  console.log(`\n🔍 Records between ${todayStart.toISOString()} and ${todayEnd.toISOString()}: ${todayData.length}`);
  todayData.forEach((d, i) => {
    console.log(`  ${i+1}. Date: ${d.date}, Close: ₹${d.close}`);
  });
  
  // Check last 3 days
  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const recentData = await StockData.find({ 
    isin: ioclIsin,
    date: { $gte: threeDaysAgo }
  }).sort({ date: -1 }).lean();
  
  console.log(`\n📅 Last 3 days records: ${recentData.length}`);
  recentData.forEach((d, i) => {
    console.log(`  ${i+1}. Date: ${d.date}, Close: ₹${d.close}`);
  });
  
  await mongoose.disconnect();
  process.exit(0);
})();

