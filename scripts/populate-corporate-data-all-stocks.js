/**
 * Script to populate CorporateInfo collection with real data from NSE API
 * Processes ALL stocks (2000+) - this will take a long time
 * Run this in the background to populate data for all stocks
 * 
 * Usage: node scripts/populate-corporate-data-all-stocks.js
 */

const mongoose = require('mongoose');
const axios = require('axios');
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
}, { timestamps: true });

const CorporateInfo = mongoose.models.CorporateInfo || mongoose.model('CorporateInfo', CorporateInfoSchema);
const StockMaster = mongoose.models.StockMaster || mongoose.model('StockMaster', StockMasterSchema);

// Fetch corporate data from NSE API (inline implementation)
async function fetchNSECorporateData(symbol) {
  const axios = require('axios');
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Referer': `https://www.nseindia.com/get-quotes/equity?symbol=${symbol}`,
  };

  try {
    const response = await axios.get(
      `https://www.nseindia.com/api/top-corp-info?symbol=${symbol}&market=equities&series=EQ`,
      { headers, timeout: 15000 }
    );

    const data = response.data;
    const result = {};

    // Parse financial_results
    if (data.financial_results?.data && Array.isArray(data.financial_results.data)) {
      result.financialResults = data.financial_results.data
        .filter(item => item.to_date)
        .map(item => {
          const quarterEnded = parseNSEDate(item.to_date);
          const totalIncome = parseNumber(item.income || '0');
          const netProfitLoss = parseNumber(item.proLossAftTax || '0');
          const earningsPerShare = parseNumber(item.reDilEPS || '0');
          const operatingProfit = parseNumber(item.reProLossBefTax || '0');
          
          let netProfitMargin = undefined;
          if (totalIncome > 0 && netProfitLoss !== 0) {
            netProfitMargin = (netProfitLoss / totalIncome) * 100;
          }

          return {
            quarterEnded,
            totalIncome,
            netProfitLoss,
            earningsPerShare,
            revenue: totalIncome,
            operatingProfit,
            netProfitMargin,
          };
        })
        .slice(0, 20);
    }

    // Parse shareholding patterns
    if (data.shareholdings_patterns?.data && typeof data.shareholdings_patterns.data === 'object') {
      const patternsData = data.shareholdings_patterns.data;
      result.shareholdingPatterns = Object.entries(patternsData)
        .map(([dateStr, items]) => {
          if (!Array.isArray(items)) return null;

          const pattern = {
            periodEnded: parseNSEDate(dateStr),
            promoterAndPromoterGroup: 0,
            public: 0,
            sharesHeldByEmployeeTrusts: 0,
            total: 100,
          };

          items.forEach(item => {
            const key = Object.keys(item)[0];
            const value = parseNumber(item[key] || '0');
            
            if (key.includes('Promoter') || key.includes('promoter')) {
              pattern.promoterAndPromoterGroup = value;
            } else if (key.includes('Public') || key.includes('public')) {
              pattern.public = value;
            } else if (key.includes('Employee') || key.includes('employee')) {
              pattern.sharesHeldByEmployeeTrusts = value;
            } else if (key.includes('Total') || key.includes('total')) {
              pattern.total = value;
            }
          });

          return pattern;
        })
        .filter(p => p !== null)
        .sort((a, b) => new Date(b.periodEnded).getTime() - new Date(a.periodEnded).getTime())
        .slice(0, 10);
    }

    // Parse announcements
    if (data.latest_announcements?.data) {
      result.announcements = data.latest_announcements.data
        .filter(item => item.subject && item.broadcastdate)
        .map(item => ({
          subject: item.subject,
          date: parseNSEDate(item.broadcastdate),
        }))
        .slice(0, 20);
    }

    // Parse corporate actions - only keep future dates
    if (data.corporate_actions?.data) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      result.corporateActions = data.corporate_actions.data
        .filter(item => item.purpose && item.exdate)
        .map(item => {
          let actionType = 'Other';
          const purpose = (item.purpose || '').toLowerCase();
          if (purpose.includes('dividend')) actionType = 'Dividend';
          else if (purpose.includes('bonus')) actionType = 'Bonus';
          else if (purpose.includes('split')) actionType = 'Split';
          else if (purpose.includes('rights')) actionType = 'Rights';
          else if (purpose.includes('agm')) actionType = 'AGM';

          return {
            subject: item.purpose,
            date: parseNSEDate(item.exdate),
            exDate: parseNSEDate(item.exdate),
            actionType,
          };
        })
        .filter(action => {
          const actionDate = new Date(action.date);
          actionDate.setHours(0, 0, 0, 0);
          return actionDate >= today; // Only keep future dates
        })
        .slice(0, 20);
    }

    // Parse board meetings - only keep future dates
    if (data.borad_meeting?.data) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      result.boardMeetings = data.borad_meeting.data
        .filter(item => item.purpose && item.meetingdate)
        .map(item => ({
          subject: item.purpose,
          date: parseNSEDate(item.meetingdate),
          purpose: item.purpose,
        }))
        .filter(meeting => {
          const meetingDate = new Date(meeting.date);
          meetingDate.setHours(0, 0, 0, 0);
          return meetingDate >= today; // Only keep future dates
        })
        .slice(0, 20);
    }

    return result;
  } catch (error) {
    throw error;
  }
}

function parseNSEDate(dateStr) {
  if (!dateStr) return new Date();
  const dateOnly = dateStr.split(' ')[0].trim();
  
  const ddmmyyyyMatch = dateOnly.match(/^(\d{1,2})-(\w{3})-(\d{4})$/);
  if (ddmmyyyyMatch) {
    const months = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };
    return new Date(parseInt(ddmmyyyyMatch[3]), months[ddmmyyyyMatch[2]] || 0, parseInt(ddmmyyyyMatch[1]));
  }
  
  const ddmmyyyySpaceMatch = dateOnly.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/);
  if (ddmmyyyySpaceMatch) {
    const months = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };
    return new Date(parseInt(ddmmyyyySpaceMatch[3]), months[ddmmyyyySpaceMatch[2]] || 0, parseInt(ddmmyyyySpaceMatch[1]));
  }
  
  return new Date(dateStr);
}

function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

async function populateCorporateDataForAllStocks() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Get all NSE stocks
    const allStocks = await StockMaster.find({ exchange: 'NSE' })
      .select('isin symbol stockName')
      .lean();
    
    console.log(`📊 Found ${allStocks.length} stocks to process`);
    
    // Check which stocks already have data
    const existing = await CorporateInfo.find({})
      .select('isin')
      .lean();
    const existingIsins = new Set(existing.map((e) => e.isin));
    
    const stocksToProcess = allStocks.filter((stock) => !existingIsins.has(stock.isin));
    console.log(`   ${existingIsins.size} stocks already have data`);
    console.log(`   ${stocksToProcess.length} stocks need data`);
    
    let processed = 0;
    let created = 0;
    let updated = 0;
    let failed = 0;
    let skipped = 0;
    
    const BATCH_SIZE = 10; // Process 10 at a time to avoid rate limiting
    
    for (let i = 0; i < stocksToProcess.length; i += BATCH_SIZE) {
      const batch = stocksToProcess.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (stock) => {
        try {
          if (!stock.symbol) {
            skipped++;
            return;
          }
          
          const corporateData = await fetchNSECorporateData(stock.symbol);
          
          // Only save if we have meaningful data
          const hasData = (corporateData.financialResults && corporateData.financialResults.length > 0) ||
                         (corporateData.shareholdingPatterns && corporateData.shareholdingPatterns.length > 0) ||
                         (corporateData.announcements && corporateData.announcements.length > 0) ||
                         (corporateData.corporateActions && corporateData.corporateActions.length > 0) ||
                         (corporateData.boardMeetings && corporateData.boardMeetings.length > 0);
          
          if (!hasData) {
            skipped++;
            return;
          }
          
          const updateData = {
            isin: stock.isin,
            symbol: stock.symbol,
            stockName: stock.stockName,
            lastUpdated: new Date(),
          };
          
          if (corporateData.announcements) updateData.announcements = corporateData.announcements;
          if (corporateData.corporateActions) updateData.corporateActions = corporateData.corporateActions;
          if (corporateData.boardMeetings) updateData.boardMeetings = corporateData.boardMeetings;
          if (corporateData.financialResults) updateData.financialResults = corporateData.financialResults;
          if (corporateData.shareholdingPatterns) updateData.shareholdingPatterns = corporateData.shareholdingPatterns;
          
          try {
            await CorporateInfo.findOneAndUpdate(
              { isin: stock.isin },
              { $set: updateData },
              { upsert: true }
            );
            created++;
          } catch (dbError) {
            if (dbError.message && dbError.message.includes('space quota')) {
              console.error(`\n❌ Database space quota exceeded. Stopping...`);
              throw dbError;
            }
            throw dbError;
          }
          
          processed++;
        } catch (error) {
          failed++;
          if (error.message && error.message.includes('space quota')) {
            throw error; // Re-throw to stop processing
          }
        }
      });
      
      await Promise.all(batchPromises);
      
      processed += batch.length;
      
      if (processed % 50 === 0) {
        console.log(`   Processed ${processed}/${stocksToProcess.length} stocks... (Created: ${created}, Failed: ${failed}, Skipped: ${skipped})`);
      }
      
      // Delay to avoid rate limiting
      if (i + BATCH_SIZE < stocksToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`\n✅ Completed:`);
    console.log(`   - Processed: ${processed}`);
    console.log(`   - Created/Updated: ${created}`);
    console.log(`   - Failed: ${failed}`);
    console.log(`   - Skipped (no data): ${skipped}`);
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.message && error.message.includes('space quota')) {
      console.error('   Database space quota exceeded. Please free up space and try again.');
    }
    process.exit(1);
  }
}

populateCorporateDataForAllStocks();

