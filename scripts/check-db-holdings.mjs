/**
 * Direct database check script
 */

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

const CLIENT_ID = '994826';

const HoldingSchema = new mongoose.Schema({
  stockName: { type: String, required: true },
  sectorName: { type: String, required: true },
  isin: { type: String, required: true, index: true },
  portfolioPercentage: { type: Number, required: true },
  openQty: { type: Number, required: true },
  marketPrice: { type: Number, required: true },
  marketValue: { type: Number, required: true },
  investmentAmount: { type: Number, required: true },
  avgCost: { type: Number, required: true },
  profitLossTillDate: { type: Number, required: true },
  profitLossTillDatePercent: { type: Number, required: true },
  lastUpdated: { type: Date, default: Date.now },
  clientId: { type: String, required: true, index: true },
  clientName: { type: String, required: true },
  asOnDate: { type: Date, required: true },
}, { collection: 'holdings' });

const Holding = mongoose.models.Holding || mongoose.model('Holding', HoldingSchema);

async function checkDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/portfolio';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');
    
    // Get ALL holdings
    const allHoldings = await Holding.find({ clientId: CLIENT_ID }).lean();
    const count = await Holding.countDocuments({ clientId: CLIENT_ID });
    
    console.log(`📊 Total holdings in database: ${count}`);
    console.log(`📊 Holdings from find(): ${allHoldings.length}\n`);
    
    // Normalize ISINs
    const normalizedHoldings = allHoldings.map(h => ({
      ...h,
      isin: (h.isin || '').trim().toUpperCase(),
    }));
    
    // Check for BHEL
    const bhel = normalizedHoldings.find(h => 
      h.isin === 'INE257A01026' || h.stockName?.toLowerCase().includes('bhel')
    );
    
    if (bhel) {
      console.log(`✅ BHEL FOUND in database:`);
      console.log(`   - Stock Name: ${bhel.stockName}`);
      console.log(`   - ISIN: ${bhel.isin}`);
      console.log(`   - Qty: ${bhel.openQty}`);
      console.log(`   - Client ID: ${bhel.clientId}`);
      console.log(`   - _id: ${bhel._id}\n`);
    } else {
      console.error(`❌ BHEL NOT FOUND in database!\n`);
    }
    
    // List all holdings
    console.log(`All holdings (${normalizedHoldings.length}):`);
    normalizedHoldings.forEach((h, idx) => {
      const isBhel = h.isin === 'INE257A01026';
      const marker = isBhel ? ' 🔵' : '  ';
      console.log(`${marker} ${idx + 1}. ${h.stockName} - ${h.isin} - Qty: ${h.openQty}`);
    });
    
    // Check ISINs
    const allIsins = normalizedHoldings.map(h => h.isin).sort();
    console.log(`\nAll ISINs (${allIsins.length}):`);
    allIsins.forEach((isin, idx) => {
      const isBhel = isin === 'INE257A01026';
      const marker = isBhel ? '🔵' : ' ';
      console.log(`${marker} ${idx + 1}. ${isin}`);
    });
    
    // Direct query for BHEL
    console.log(`\n🔍 Direct query for BHEL:`);
    const direct1 = await Holding.findOne({ clientId: CLIENT_ID, isin: 'INE257A01026' }).lean();
    console.log(`   1. By exact ISIN: ${direct1 ? 'FOUND' : 'NOT FOUND'}`);
    if (direct1) console.log(`      ${direct1.stockName}, ISIN: "${direct1.isin}"`);
    
    const direct2 = await Holding.findOne({ 
      clientId: CLIENT_ID, 
      isin: { $regex: /INE257A01026/i } 
    }).lean();
    console.log(`   2. By regex ISIN: ${direct2 ? 'FOUND' : 'NOT FOUND'}`);
    if (direct2) console.log(`      ${direct2.stockName}, ISIN: "${direct2.isin}"`);
    
    const direct3 = await Holding.findOne({ 
      clientId: CLIENT_ID, 
      stockName: { $regex: /b\s*h\s*e\s*l|bhel/i } 
    }).lean();
    console.log(`   3. By stock name: ${direct3 ? 'FOUND' : 'NOT FOUND'}`);
    if (direct3) console.log(`      ${direct3.stockName}, ISIN: "${direct3.isin}"`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

checkDatabase();

