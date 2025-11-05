/**
 * Debug script to check why Financial Results Calendar shows 0 stocks
 * 
 * Usage: node scripts/debug-financial-results.js
 */

const mongoose = require('mongoose');
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

// Define schema
const CorporateInfoSchema = new mongoose.Schema({
  isin: { type: String, required: true, index: true },
  symbol: { type: String, index: true },
  stockName: { type: String },
  boardMeetings: [{
    subject: { type: String, required: true },
    date: { type: Date, required: true },
    purpose: { type: String },
  }],
}, { timestamps: true });

const CorporateInfo = mongoose.models.CorporateInfo || mongoose.model('CorporateInfo', CorporateInfoSchema);

async function debugFinancialResults() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + 60);
    targetDate.setHours(23, 59, 59, 999);
    
    console.log(`📅 Today: ${today.toISOString().split('T')[0]}`);
    console.log(`📅 Target Date (60 days): ${targetDate.toISOString().split('T')[0]}\n`);
    
    // Get all corporate info with board meetings
    const allCorporateInfo = await CorporateInfo.find({
      boardMeetings: { $exists: true, $ne: [] }
    })
      .select('isin symbol stockName boardMeetings')
      .lean();
    
    console.log(`📊 Found ${allCorporateInfo.length} stocks with board meetings\n`);
    
    // Helper function to check financial results keywords
    const hasFinancialResultsKeyword = (text) => {
      if (!text) return false;
      const lowerText = text.toLowerCase();
      return lowerText.includes('financial result') || 
             lowerText.includes('financial results') || 
             lowerText.includes('quarterly result') || 
             lowerText.includes('quarterly results') ||
             lowerText.includes('q1') || 
             lowerText.includes('q2') || 
             lowerText.includes('q3') || 
             lowerText.includes('q4') ||
             lowerText.includes('approve the financial') ||
             lowerText.includes('consider and approve') ||
             lowerText.includes('consider the financial') ||
             lowerText.includes('period ended');
    };
    
    let matchingStocks = 0;
    let totalMeetings = 0;
    let futureMeetings = 0;
    let financialResultsMeetings = 0;
    
    console.log('🔍 Checking board meetings...\n');
    
    for (const info of allCorporateInfo) {
      if (info.boardMeetings && info.boardMeetings.length > 0) {
        totalMeetings += info.boardMeetings.length;
        
        for (const meeting of info.boardMeetings) {
          const meetingDate = new Date(meeting.date);
          meetingDate.setHours(0, 0, 0, 0);
          
          const subject = (meeting.subject || '').toLowerCase();
          const purpose = ((meeting.purpose || '').toLowerCase());
          
          const isFuture = meetingDate >= today && meetingDate <= targetDate;
          const hasFinancialKeyword = hasFinancialResultsKeyword(subject) || hasFinancialResultsKeyword(purpose);
          
          if (isFuture) {
            futureMeetings++;
          }
          
          if (hasFinancialKeyword) {
            financialResultsMeetings++;
            
            if (isFuture) {
              matchingStocks++;
              console.log(`✅ MATCH: ${info.symbol || info.isin}`);
              console.log(`   Meeting Date: ${meetingDate.toISOString().split('T')[0]}`);
              console.log(`   Subject: ${meeting.subject || 'N/A'}`);
              console.log(`   Purpose: ${meeting.purpose || 'N/A'}`);
              console.log(`   Days Until: ${Math.ceil((meetingDate - today) / (1000 * 60 * 60 * 24))}`);
              console.log('');
            } else {
              console.log(`⚠️  Financial results keyword found but date is ${meetingDate < today ? 'past' : 'future (>60 days)'}: ${info.symbol || info.isin}`);
              console.log(`   Meeting Date: ${meetingDate.toISOString().split('T')[0]}`);
              console.log(`   Purpose: ${meeting.purpose || 'N/A'}`);
              console.log('');
            }
          }
        }
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`   Total stocks with board meetings: ${allCorporateInfo.length}`);
    console.log(`   Total board meetings: ${totalMeetings}`);
    console.log(`   Future meetings (next 60 days): ${futureMeetings}`);
    console.log(`   Meetings with financial results keywords: ${financialResultsMeetings}`);
    console.log(`   ✅ Matching stocks (future + financial keyword): ${matchingStocks}`);
    
    // Check a few sample records
    console.log('\n📋 Sample board meetings (first 5 stocks):');
    for (let i = 0; i < Math.min(5, allCorporateInfo.length); i++) {
      const info = allCorporateInfo[i];
      console.log(`\n${i + 1}. ${info.symbol || info.isin} (${info.stockName || 'N/A'})`);
      if (info.boardMeetings && info.boardMeetings.length > 0) {
        info.boardMeetings.slice(0, 3).forEach((meeting, idx) => {
          const meetingDate = new Date(meeting.date);
          console.log(`   Meeting ${idx + 1}:`);
          console.log(`     Date: ${meetingDate.toISOString().split('T')[0]}`);
          console.log(`     Subject: ${meeting.subject || 'N/A'}`);
          console.log(`     Purpose: ${meeting.purpose || 'N/A'}`);
        });
      }
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

debugFinancialResults();

