import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

// Load environment variables
try {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([^=:#]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    });
  }
} catch (e) {
  console.warn('Could not load .env.local');
}

const StockMasterSchema = new mongoose.Schema({
  isin: String,
  stockName: String,
  symbol: String,
  exchange: String,
  sector: String,
  lastUpdated: Date,
}, { collection: 'stockmasters' });

const StockMaster = mongoose.models.StockMaster || mongoose.model('StockMaster', StockMasterSchema);

async function checkOlaElectric() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');
    
    // Search for Ola Electric in StockMaster
    console.log('🔍 Searching for "Ola Electric" in StockMaster...\n');
    
    // Try exact match
    const exactMatch = await StockMaster.find({
      stockName: { $regex: /ola electric/i }
    }).lean();
    
    console.log(`Found ${exactMatch.length} exact matches:`);
    exactMatch.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.stockName} - ISIN: ${s.isin} - Symbol: ${s.symbol || 'N/A'}`);
    });
    
    // Try partial matches
    const partialMatches = await StockMaster.find({
      $or: [
        { stockName: { $regex: /ola/i } },
        { stockName: { $regex: /electric.*mobility/i } },
        { symbol: { $regex: /ola/i } }
      ]
    }).limit(10).lean();
    
    console.log(`\nFound ${partialMatches.length} partial matches (Ola/Electric/Mobility):`);
    partialMatches.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.stockName} - ISIN: ${s.isin} - Symbol: ${s.symbol || 'N/A'}`);
    });
    
    // Check total StockMaster count
    const totalCount = await StockMaster.countDocuments();
    console.log(`\n📊 Total stocks in StockMaster: ${totalCount}`);
    
    // Check if StockMaster is empty
    if (totalCount === 0) {
      console.log('\n⚠️  WARNING: StockMaster collection is EMPTY!');
      console.log('   Please upload NSE_BSE_Active_Scripts_with_ISIN.xlsx first.');
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkOlaElectric();

