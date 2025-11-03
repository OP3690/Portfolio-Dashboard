/**
 * Root Cause Analysis Script for Upload Issue
 * This script will:
 * 1. Parse the Excel file directly
 * 2. Check database state before and after
 * 3. Test each step of the upload process
 * 4. Identify where holdings are being lost
 */

const XLSX = require('xlsx');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// Import models
const Holding = require('../models/Holding.ts').default;
const excelParser = require('../lib/excelParser.ts');

const EXCEL_FILE_PATH = path.join(__dirname, '../../Holding_equity_open.xlsx');
const CLIENT_ID = '994826';

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    console.log('✅ Already connected to database');
    return;
  }
  
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/portfolio';
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB');
}

async function disconnectDB() {
  await mongoose.disconnect();
  console.log('✅ Disconnected from MongoDB');
}

function normalizeIsin(isin) {
  if (!isin) return '';
  return String(isin).trim().toUpperCase();
}

async function parseExcelFile() {
  console.log('\n' + '='.repeat(80));
  console.log('STEP 1: Parsing Excel File');
  console.log('='.repeat(80));
  
  const workbook = XLSX.readFile(EXCEL_FILE_PATH);
  const holdingsSheet = workbook.Sheets['Holdings'];
  
  if (!holdingsSheet) {
    throw new Error('Holdings sheet not found in Excel file');
  }
  
  // Use the actual parser from excelParser.ts
  const excelData = await excelParser.parseExcelFile(EXCEL_FILE_PATH);
  
  console.log(`✅ Excel parsed successfully`);
  console.log(`   - Holdings count: ${excelData.holdings.length}`);
  console.log(`   - Transactions count: ${excelData.transactions.length}`);
  console.log(`   - Realized P&L count: ${excelData.realizedProfitLoss.length}`);
  
  // Check for BHEL in parsed data
  const bhelInParsed = excelData.holdings.find(h => {
    const normalizedIsin = normalizeIsin(h.isin);
    return normalizedIsin === 'INE257A01026' || h.stockName?.toLowerCase().includes('bhel');
  });
  
  if (bhelInParsed) {
    console.log(`✅ BHEL found in parsed data:`);
    console.log(`   - Stock Name: ${bhelInParsed.stockName}`);
    console.log(`   - ISIN: ${bhelInParsed.isin}`);
    console.log(`   - Qty: ${bhelInParsed.openQty}`);
    console.log(`   - Market Value: ${bhelInParsed.marketValue}`);
  } else {
    console.error(`❌ BHEL NOT found in parsed data!`);
  }
  
  // List all ISINs
  const allIsins = excelData.holdings.map(h => normalizeIsin(h.isin)).filter(Boolean);
  console.log(`\n✅ All ISINs from Excel (${allIsins.length}):`);
  allIsins.forEach((isin, idx) => {
    const holding = excelData.holdings.find(h => normalizeIsin(h.isin) === isin);
    console.log(`   ${idx + 1}. ${isin} - ${holding?.stockName || 'Unknown'}`);
  });
  
  return excelData;
}

async function checkDatabaseBeforeUpload() {
  console.log('\n' + '='.repeat(80));
  console.log('STEP 2: Checking Database State (BEFORE Upload)');
  console.log('='.repeat(80));
  
  const holdings = await Holding.find({ clientId: CLIENT_ID }).lean();
  const holdingsCount = await Holding.countDocuments({ clientId: CLIENT_ID });
  
  console.log(`✅ Current holdings in database: ${holdingsCount}`);
  console.log(`✅ Holdings from find(): ${holdings.length}`);
  
  // Check for BHEL
  const bhelInDb = holdings.find(h => {
    const normalizedIsin = normalizeIsin(h.isin);
    return normalizedIsin === 'INE257A01026' || h.stockName?.toLowerCase().includes('bhel');
  });
  
  if (bhelInDb) {
    console.log(`✅ BHEL found in database:`);
    console.log(`   - Stock Name: ${bhelInDb.stockName}`);
    console.log(`   - ISIN: ${bhelInDb.isin}`);
    console.log(`   - Qty: ${bhelInDb.openQty}`);
  } else {
    console.error(`❌ BHEL NOT found in database`);
  }
  
  // List all ISINs in database
  const dbIsins = holdings.map(h => normalizeIsin(h.isin)).filter(Boolean);
  console.log(`\n✅ All ISINs in database (${dbIsins.length}):`);
  dbIsins.forEach((isin, idx) => {
    const holding = holdings.find(h => normalizeIsin(h.isin) === isin);
    console.log(`   ${idx + 1}. ${isin} - ${holding?.stockName || 'Unknown'}`);
  });
  
  return { holdings, holdingsCount };
}

async function simulateUploadProcess(excelData) {
  console.log('\n' + '='.repeat(80));
  console.log('STEP 3: Simulating Upload Process Step-by-Step');
  console.log('='.repeat(80));
  
  // Step 3.1: Filter current holdings (same logic as upload route)
  const currentHoldingsFromExcel = excelData.holdings.filter(h => {
    return h.isin && h.isin.trim() !== '';
  });
  
  console.log(`\n3.1 Filtered holdings from Excel: ${currentHoldingsFromExcel.length}`);
  
  const bhelInFiltered = currentHoldingsFromExcel.find(h => {
    const normalizedIsin = normalizeIsin(h.isin);
    return normalizedIsin === 'INE257A01026' || h.stockName?.toLowerCase().includes('bhel');
  });
  
  if (bhelInFiltered) {
    console.log(`✅ BHEL in filtered holdings: ${bhelInFiltered.stockName} (${bhelInFiltered.isin})`);
  } else {
    console.error(`❌ BHEL NOT in filtered holdings!`);
  }
  
  // Step 3.2: Try to save each holding individually
  console.log(`\n3.2 Attempting to save each holding...`);
  const saveResults = [];
  
  for (const holding of currentHoldingsFromExcel) {
    const normalizedIsin = normalizeIsin(holding.isin);
    
    if (!normalizedIsin) {
      console.error(`   ❌ Skipping ${holding.stockName} - no ISIN`);
      saveResults.push({ holding, success: false, error: 'No ISIN' });
      continue;
    }
    
    try {
      const holdingToSave = {
        stockName: holding.stockName || '',
        sectorName: holding.sectorName || '',
        isin: normalizedIsin,
        portfolioPercentage: holding.portfolioPercentage ?? 0,
        openQty: holding.openQty ?? 0,
        marketPrice: holding.marketPrice ?? 0,
        marketValue: holding.marketValue ?? 0,
        investmentAmount: holding.investmentAmount ?? 0,
        avgCost: holding.avgCost ?? 0,
        profitLossTillDate: holding.profitLossTillDate ?? 0,
        profitLossTillDatePercent: holding.profitLossTillDatePercent ?? 0,
        clientId: CLIENT_ID,
        clientName: excelData.clientName || '',
        asOnDate: excelData.asOnDate || new Date(),
        lastUpdated: new Date(),
      };
      
      // Try to save
      const result = await Holding.findOneAndUpdate(
        { clientId: CLIENT_ID, isin: normalizedIsin },
        holdingToSave,
        { upsert: true, new: true, runValidators: true }
      );
      
      if (result) {
        saveResults.push({ holding, success: true, result });
        if (normalizedIsin === 'INE257A01026') {
          console.log(`   ✅ BHEL saved successfully: ${result.stockName} (${result.isin})`);
        }
      } else {
        saveResults.push({ holding, success: false, error: 'Result is null' });
        console.error(`   ❌ Failed to save ${holding.stockName} - result is null`);
      }
    } catch (error) {
      saveResults.push({ holding, success: false, error: error.message });
      console.error(`   ❌ Error saving ${holding.stockName} (${normalizedIsin}):`, error.message);
      
      if (normalizedIsin === 'INE257A01026') {
        console.error(`   ❌❌❌ CRITICAL: BHEL save failed!`);
        console.error(`   Error details:`, {
          message: error.message,
          code: error.code,
          errors: error.errors,
        });
      }
    }
  }
  
  const successfulSaves = saveResults.filter(r => r.success).length;
  const failedSaves = saveResults.filter(r => !r.success);
  
  console.log(`\n✅ Save Summary:`);
  console.log(`   - Successful: ${successfulSaves}/${currentHoldingsFromExcel.length}`);
  console.log(`   - Failed: ${failedSaves.length}`);
  
  if (failedSaves.length > 0) {
    console.error(`\n❌ Failed saves:`);
    failedSaves.forEach(({ holding, error }) => {
      console.error(`   - ${holding.stockName} (${holding.isin}): ${error}`);
    });
  }
  
  // Step 3.3: Wait and verify
  console.log(`\n3.3 Waiting 1 second for MongoDB writes to commit...`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Step 3.4: Verify what's actually in the database
  console.log(`\n3.4 Verifying database state after save...`);
  const holdingsAfterSave = await Holding.find({ clientId: CLIENT_ID }).lean();
  const holdingsCountAfter = await Holding.countDocuments({ clientId: CLIENT_ID });
  
  console.log(`✅ Holdings in database after save: ${holdingsCountAfter}`);
  console.log(`✅ Holdings from find() after save: ${holdingsAfterSave.length}`);
  
  // Check for BHEL
  const bhelAfterSave = holdingsAfterSave.find(h => {
    const normalizedIsin = normalizeIsin(h.isin);
    return normalizedIsin === 'INE257A01026' || h.stockName?.toLowerCase().includes('bhel');
  });
  
  if (bhelAfterSave) {
    console.log(`✅ BHEL found in database after save:`);
    console.log(`   - Stock Name: ${bhelAfterSave.stockName}`);
    console.log(`   - ISIN: ${bhelAfterSave.isin}`);
    console.log(`   - Qty: ${bhelAfterSave.openQty}`);
  } else {
    console.error(`❌❌❌ BHEL NOT found in database after save!`);
    
    // Try direct query
    const bhelDirect = await Holding.findOne({ 
      clientId: CLIENT_ID, 
      isin: 'INE257A01026' 
    }).lean();
    
    if (bhelDirect) {
      console.error(`⚠️  BHEL found via direct query but not in find({ clientId })!`);
      console.error(`   This suggests a query filtering issue.`);
    } else {
      console.error(`❌ BHEL not found via direct query either!`);
    }
  }
  
  // Compare expected vs actual
  const expectedIsins = new Set(currentHoldingsFromExcel.map(h => normalizeIsin(h.isin)).filter(Boolean));
  const actualIsins = new Set(holdingsAfterSave.map(h => normalizeIsin(h.isin)).filter(Boolean));
  
  const missingIsins = Array.from(expectedIsins).filter(isin => !actualIsins.has(isin));
  const extraIsins = Array.from(actualIsins).filter(isin => !expectedIsins.has(isin));
  
  console.log(`\n📊 Comparison:`);
  console.log(`   - Expected from Excel: ${expectedIsins.size}`);
  console.log(`   - Actual in database: ${actualIsins.size}`);
  
  if (missingIsins.length > 0) {
    console.error(`\n❌ Missing ISINs (${missingIsins.length}):`);
    missingIsins.forEach(isin => {
      const holding = currentHoldingsFromExcel.find(h => normalizeIsin(h.isin) === isin);
      console.error(`   - ${isin} - ${holding?.stockName || 'Unknown'}`);
    });
  }
  
  if (extraIsins.length > 0) {
    console.warn(`\n⚠️  Extra ISINs in database (${extraIsins.length}):`);
    extraIsins.forEach(isin => {
      const holding = holdingsAfterSave.find(h => normalizeIsin(h.isin) === isin);
      console.warn(`   - ${isin} - ${holding?.stockName || 'Unknown'}`);
    });
  }
  
  return {
    expectedCount: expectedIsins.size,
    actualCount: actualIsins.size,
    missingIsins,
    saveResults,
  };
}

async function checkDatabaseAfterUpload() {
  console.log('\n' + '='.repeat(80));
  console.log('STEP 4: Final Database Verification');
  console.log('='.repeat(80));
  
  // Multiple queries to check consistency
  const count1 = await Holding.countDocuments({ clientId: CLIENT_ID });
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const holdings1 = await Holding.find({ clientId: CLIENT_ID }).lean();
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const count2 = await Holding.countDocuments({ clientId: CLIENT_ID });
  const holdings2 = await Holding.find({ clientId: CLIENT_ID }).lean();
  
  console.log(`✅ Count query 1: ${count1}`);
  console.log(`✅ Count query 2: ${count2}`);
  console.log(`✅ Find query 1: ${holdings1.length}`);
  console.log(`✅ Find query 2: ${holdings2.length}`);
  
  // Check for BHEL in multiple ways
  const bhel1 = holdings1.find(h => normalizeIsin(h.isin) === 'INE257A01026');
  const bhel2 = holdings2.find(h => normalizeIsin(h.isin) === 'INE257A01026');
  const bhelDirect = await Holding.findOne({ clientId: CLIENT_ID, isin: 'INE257A01026' }).lean();
  const bhelByName = await Holding.findOne({ 
    clientId: CLIENT_ID, 
    stockName: { $regex: /b\s*h\s*e\s*l|bhel/i } 
  }).lean();
  
  console.log(`\n🔍 BHEL Check:`);
  console.log(`   - In holdings1: ${bhel1 ? 'YES' : 'NO'}`);
  console.log(`   - In holdings2: ${bhel2 ? 'YES' : 'NO'}`);
  console.log(`   - Direct query (ISIN): ${bhelDirect ? 'YES' : 'NO'}`);
  console.log(`   - Direct query (Name): ${bhelByName ? 'YES' : 'NO'}`);
  
  if (bhelDirect && !bhel1) {
    console.error(`\n❌❌❌ CRITICAL ISSUE: BHEL exists in database but find({ clientId }) doesn't return it!`);
    console.error(`   This indicates a query filtering problem.`);
    console.error(`   BHEL data:`, {
      _id: bhelDirect._id,
      stockName: bhelDirect.stockName,
      isin: bhelDirect.isin,
      clientId: bhelDirect.clientId,
    });
  }
  
  return {
    count1,
    count2,
    holdings1: holdings1.length,
    holdings2: holdings2.length,
    bhelFound: !!bhelDirect || !!bhelByName,
  };
}

async function main() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('ROOT CAUSE ANALYSIS: Upload Issue Diagnostic');
    console.log('='.repeat(80));
    console.log(`Excel File: ${EXCEL_FILE_PATH}`);
    console.log(`Client ID: ${CLIENT_ID}`);
    console.log(`Date: ${new Date().toISOString()}`);
    
    // Connect to database
    await connectDB();
    
    // Step 1: Parse Excel
    const excelData = await parseExcelFile();
    
    // Step 2: Check database before
    const dbBefore = await checkDatabaseBeforeUpload();
    
    // Step 3: Simulate upload
    const uploadResults = await simulateUploadProcess(excelData);
    
    // Step 4: Final verification
    const dbAfter = await checkDatabaseAfterUpload();
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY & ROOT CAUSE');
    console.log('='.repeat(80));
    
    console.log(`\n📊 Results:`);
    console.log(`   - Holdings in Excel: ${excelData.holdings.length}`);
    console.log(`   - Holdings before upload: ${dbBefore.holdingsCount}`);
    console.log(`   - Holdings after upload: ${dbAfter.count1}`);
    console.log(`   - Expected: ${uploadResults.expectedCount}`);
    console.log(`   - Actual: ${uploadResults.actualCount}`);
    console.log(`   - Missing: ${uploadResults.missingIsins.length}`);
    
    if (uploadResults.missingIsins.length > 0) {
      console.error(`\n❌ ROOT CAUSE: ${uploadResults.missingIsins.length} holdings are not being saved to the database.`);
      console.error(`   Missing ISINs: ${uploadResults.missingIsins.join(', ')}`);
      
      // Check which saves failed
      const failedForMissing = uploadResults.saveResults.filter(r => 
        uploadResults.missingIsins.includes(normalizeIsin(r.holding.isin))
      );
      
      if (failedForMissing.length > 0) {
        console.error(`\n   Failed saves:`);
        failedForMissing.forEach(({ holding, error }) => {
          console.error(`     - ${holding.stockName} (${holding.isin}): ${error}`);
        });
      } else {
        console.error(`\n   ⚠️  All saves reported success, but holdings still missing from database!`);
        console.error(`   This suggests a MongoDB write/read consistency issue or data deletion.`);
      }
    } else {
      console.log(`\n✅ All holdings are in the database!`);
    }
    
    if (!dbAfter.bhelFound) {
      console.error(`\n❌ BHEL is missing from the database.`);
      console.error(`   Check the failed saves above for BHEL-specific errors.`);
    } else {
      console.log(`\n✅ BHEL is in the database.`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('Diagnostic Complete');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ ERROR:', error);
    console.error(error.stack);
  } finally {
    await disconnectDB();
    process.exit(0);
  }
}

// Run the diagnostic
main();

