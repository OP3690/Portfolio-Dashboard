/**
 * Script to populate CorporateInfo collection with financial results and shareholding patterns
 * This script can be run manually to populate data for testing
 * 
 * Usage: node scripts/populate-corporate-data.js
 */

const mongoose = require('mongoose');
const { subMonths } = require('date-fns');
const fs = require('fs');
const path = require('path');

// Load .env.local if it exists
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://root:zUQfjzImQWoof7xs@cluster0.cyu0ctf.mongodb.net/OP_Portfolio_Dashboard?retryWrites=true&w=majority&appName=Cluster0';

// Define schemas
const CorporateInfoSchema = new mongoose.Schema({
  isin: { type: String, required: true, index: true },
  symbol: { type: String, index: true },
  stockName: { type: String },
  announcements: [{
    subject: { type: String, required: true },
    date: { type: Date, required: true },
    description: { type: String },
  }],
  corporateActions: [{
    subject: { type: String, required: true },
    date: { type: Date, required: true },
    exDate: { type: Date },
    recordDate: { type: Date },
    description: { type: String },
    actionType: { type: String },
  }],
  boardMeetings: [{
    subject: { type: String, required: true },
    date: { type: Date, required: true },
    purpose: { type: String },
    outcome: { type: String },
  }],
  financialResults: [{
    quarterEnded: { type: Date, required: true },
    totalIncome: { type: Number },
    netProfitLoss: { type: Number },
    earningsPerShare: { type: Number },
    revenue: { type: Number },
    operatingProfit: { type: Number },
    netProfitMargin: { type: Number },
  }],
  shareholdingPatterns: [{
    periodEnded: { type: Date, required: true },
    promoterAndPromoterGroup: { type: Number },
    public: { type: Number },
    sharesHeldByEmployeeTrusts: { type: Number },
    foreignInstitutionalInvestors: { type: Number },
    domesticInstitutionalInvestors: { type: Number },
    other: { type: Number },
    total: { type: Number },
  }],
  lastUpdated: { type: Date, default: Date.now },
}, { timestamps: true });

const StockMasterSchema = new mongoose.Schema({
  isin: { type: String, required: true, unique: true, index: true },
  stockName: { type: String, required: true },
  symbol: { type: String, index: true },
  exchange: { type: String },
  sector: { type: String },
}, { timestamps: true });

const CorporateInfo = mongoose.models.CorporateInfo || mongoose.model('CorporateInfo', CorporateInfoSchema);
const StockMaster = mongoose.models.StockMaster || mongoose.model('StockMaster', StockMasterSchema);

/**
 * Generate sample financial results based on typical quarterly patterns
 */
function generateSampleFinancialResults() {
  const results = [];
  const today = new Date();
  
  // Generate last 8 quarters (2 years)
  for (let i = 0; i < 8; i++) {
    const quarterEnd = subMonths(today, i * 3);
    // Set to last day of quarter (Mar, Jun, Sep, Dec)
    const month = quarterEnd.getMonth();
    let quarterMonth;
    if (month >= 0 && month < 3) quarterMonth = 2; // Q4 (Jan-Mar)
    else if (month >= 3 && month < 6) quarterMonth = 5; // Q1 (Apr-Jun)
    else if (month >= 6 && month < 9) quarterMonth = 8; // Q2 (Jul-Sep)
    else quarterMonth = 11; // Q3 (Oct-Dec)
    
    const quarterEndDate = new Date(quarterEnd.getFullYear(), quarterMonth, 0); // Last day of month
    
    // Generate realistic sample data
    const baseIncome = 100000 + Math.random() * 50000; // 1-1.5 Lakhs base
    const growth = 1 + (Math.random() * 0.2 - 0.1); // ±10% variation
    const totalIncome = baseIncome * Math.pow(1.05, i) * growth; // Slight growth trend
    
    const profitMargin = 0.05 + Math.random() * 0.15; // 5-20% profit margin
    const netProfitLoss = totalIncome * profitMargin;
    const earningsPerShare = 5 + Math.random() * 10; // 5-15 EPS
    
    results.push({
      quarterEnded: quarterEndDate,
      totalIncome: Math.round(totalIncome),
      netProfitLoss: Math.round(netProfitLoss),
      earningsPerShare: parseFloat(earningsPerShare.toFixed(2)),
      revenue: Math.round(totalIncome * 0.95),
      operatingProfit: Math.round(netProfitLoss * 1.2),
      netProfitMargin: parseFloat((profitMargin * 100).toFixed(2)),
    });
  }
  
  return results.reverse(); // Oldest first
}

/**
 * Generate sample shareholding patterns
 */
function generateSampleShareholdingPatterns() {
  const patterns = [];
  const today = new Date();
  
  // Generate last 4 quarters
  for (let i = 0; i < 4; i++) {
    const periodEnd = subMonths(today, i * 3);
    // Set to last day of quarter
    const month = periodEnd.getMonth();
    let quarterMonth;
    if (month >= 0 && month < 3) quarterMonth = 2;
    else if (month >= 3 && month < 6) quarterMonth = 5;
    else if (month >= 6 && month < 9) quarterMonth = 8;
    else quarterMonth = 11;
    
    const periodEndDate = new Date(periodEnd.getFullYear(), quarterMonth, 0);
    
    // Generate realistic shareholding with slight variations
    const basePromoter = 50 + Math.random() * 10; // 50-60%
    const promoterChange = (Math.random() - 0.5) * 2; // ±1% change per quarter
    const promoterAndPromoterGroup = Math.max(30, Math.min(75, basePromoter + (promoterChange * i)));
    
    const public = 100 - promoterAndPromoterGroup - (Math.random() * 2); // Remaining to public
    const employeeTrusts = Math.random() * 1; // 0-1%
    const total = 100;
    
    patterns.push({
      periodEnded: periodEndDate,
      promoterAndPromoterGroup: parseFloat(promoterAndPromoterGroup.toFixed(2)),
      public: parseFloat(public.toFixed(2)),
      sharesHeldByEmployeeTrusts: parseFloat(employeeTrusts.toFixed(2)),
      foreignInstitutionalInvestors: parseFloat((Math.random() * 20).toFixed(2)),
      domesticInstitutionalInvestors: parseFloat((Math.random() * 15).toFixed(2)),
      other: parseFloat((Math.random() * 5).toFixed(2)),
      total: total,
    });
  }
  
  return patterns.reverse(); // Oldest first
}

async function populateCorporateData() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Get all stocks from StockMaster
    const stocks = await StockMaster.find({ exchange: 'NSE' })
      .select('isin symbol stockName')
      .limit(100) // Process first 100 stocks for testing
      .lean();
    
    console.log(`📊 Found ${stocks.length} stocks to process`);
    
    let processed = 0;
    let updated = 0;
    let created = 0;
    
    for (const stock of stocks) {
      try {
        const existing = await CorporateInfo.findOne({ isin: stock.isin }).lean();
        
        const financialResults = generateSampleFinancialResults();
        const shareholdingPatterns = generateSampleShareholdingPatterns();
        
        const corporateData = {
          isin: stock.isin,
          symbol: stock.symbol || '',
          stockName: stock.stockName || 'Unknown',
          financialResults,
          shareholdingPatterns,
          lastUpdated: new Date(),
        };
        
        if (existing) {
          await CorporateInfo.updateOne(
            { isin: stock.isin },
            { $set: corporateData }
          );
          updated++;
        } else {
          await CorporateInfo.create(corporateData);
          created++;
        }
        
        processed++;
        
        if (processed % 10 === 0) {
          console.log(`  Processed ${processed}/${stocks.length} stocks...`);
        }
      } catch (error) {
        console.error(`  ❌ Error processing ${stock.symbol}:`, error.message);
      }
    }
    
    console.log(`\n✅ Completed:`);
    console.log(`   - Processed: ${processed}`);
    console.log(`   - Created: ${created}`);
    console.log(`   - Updated: ${updated}`);
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

populateCorporateData();

