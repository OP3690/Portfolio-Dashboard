/**
 * Script to remove old Corporate Actions and Board Meetings from database
 * Only keeps entries with dates >= today
 * 
 * Usage: node scripts/cleanup-old-corporate-data.js
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

const CorporateInfo = mongoose.models.CorporateInfo || mongoose.model('CorporateInfo', CorporateInfoSchema);

async function cleanupOldCorporateData() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get all corporate info records
    const allRecords = await CorporateInfo.find({}).lean();
    console.log(`📊 Found ${allRecords.length} corporate info records to process`);
    
    let updated = 0;
    let removedActions = 0;
    let removedMeetings = 0;
    
    // Process in smaller batches with delays to avoid rate limits
    const BATCH_SIZE = 20; // Smaller batches
    for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
      const batch = allRecords.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (record) => {
        try {
          let hasUpdate = false;
          const updateOps = {};
          
          // Check and filter corporate actions
          if (record.corporateActions && record.corporateActions.length > 0) {
            const oldCount = record.corporateActions.length;
            const filteredActions = record.corporateActions.filter((action) => {
              const actionDate = new Date(action.date);
              actionDate.setHours(0, 0, 0, 0);
              return actionDate >= today;
            });
            
            if (filteredActions.length < oldCount) {
              removedActions += (oldCount - filteredActions.length);
              updateOps.corporateActions = filteredActions;
              hasUpdate = true;
            }
          }
          
          // Check and filter board meetings
          if (record.boardMeetings && record.boardMeetings.length > 0) {
            const oldCount = record.boardMeetings.length;
            const filteredMeetings = record.boardMeetings.filter((meeting) => {
              const meetingDate = new Date(meeting.date);
              meetingDate.setHours(0, 0, 0, 0);
              return meetingDate >= today;
            });
            
            if (filteredMeetings.length < oldCount) {
              removedMeetings += (oldCount - filteredMeetings.length);
              updateOps.boardMeetings = filteredMeetings;
              hasUpdate = true;
            }
          }
          
          // Update if needed
          if (hasUpdate) {
            await db.collection('corporateinfos').updateOne(
              { isin: record.isin },
              { $set: updateOps }
            );
            return true;
          }
          return false;
        } catch (error) {
          if (error.message && error.message.includes('quota')) {
            throw error; // Re-throw to stop processing
          }
          console.error(`   Error updating ${record.isin}: ${error.message}`);
          return false;
        }
      });
      
      try {
        const results = await Promise.all(batchPromises);
        updated += results.filter(r => r === true).length;
      } catch (error) {
        if (error.message && error.message.includes('quota')) {
          console.error(`\n❌ Database space quota exceeded. Stopping...`);
          console.error(`   Processed ${updated} records before quota limit`);
          throw error;
        }
      }
      
      if ((i + BATCH_SIZE) % 100 === 0 || i + BATCH_SIZE >= allRecords.length) {
        console.log(`   Processed ${Math.min(i + BATCH_SIZE, allRecords.length)}/${allRecords.length} records... (Updated: ${updated}, Removed: ${removedActions} actions, ${removedMeetings} meetings)`);
      }
      
      // Delay between batches to avoid rate limits
      if (i + BATCH_SIZE < allRecords.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log(`\n✅ Cleanup completed:`);
    console.log(`   - Records updated: ${updated}`);
    console.log(`   - Corporate Actions removed: ${removedActions}`);
    console.log(`   - Board Meetings removed: ${removedMeetings}`);
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    if (error.message && error.message.includes('quota')) {
      console.error('\n❌ Database space quota exceeded. Please free up space first.');
      console.error('   You can run: node scripts/cleanup-database.js');
    } else {
      console.error('\n❌ Error:', error.message);
    }
    process.exit(1);
  }
}

cleanupOldCorporateData();

