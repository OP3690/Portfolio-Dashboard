/**
 * Root Cause Analysis Script for Upload Issue
 * Run with: node scripts/rca-upload-issue.mjs
 */

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
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

const EXCEL_FILE_PATH = path.join(__dirname, '../../Holding_equity_open.xlsx');
const CLIENT_ID = '994826';

// Holding Schema (simplified for script)
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

HoldingSchema.index({ clientId: 1, isin: 1 }, { unique: true });

const Holding = mongoose.models.Holding || mongoose.model('Holding', HoldingSchema);

function normalizeIsin(isin) {
  if (!isin) return '';
  return String(isin).trim().toUpperCase();
}

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    console.log('✅ Already connected to database');
    return;
  }
  
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/portfolio';
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB:', mongoUri.replace(/\/\/.*@/, '//***@'));
}

async function disconnectDB() {
  await mongoose.disconnect();
  console.log('✅ Disconnected from MongoDB');
}

// Simplified Excel parser (extracted key logic)
function parseExcelFile(filePath) {
  console.log(`\n📂 Reading Excel file: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel file not found: ${filePath}`);
  }
  
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  
  // Get Holdings sheet
  const holdingsSheet = workbook.Sheets['Holdings'] || workbook.Sheets[workbook.SheetNames[0]];
  
  if (!holdingsSheet) {
    throw new Error('Holdings sheet not found');
  }
  
  // Find header row (row with "Stock Name")
  let startRow = 10;
  for (let i = 0; i < 20; i++) {
    const cell = holdingsSheet[XLSX.utils.encode_cell({ r: i, c: 1 })];
    if (cell && (cell.v === 'Stock Name' || String(cell.v).includes('Stock'))) {
      startRow = i;
      break;
    }
  }
  
  // Find "Disclaimer" row
  let endRow = null;
  for (let i = startRow + 1; i < 500; i++) {
    for (let col = 0; col < 10; col++) {
      const cell = holdingsSheet[XLSX.utils.encode_cell({ r: i, c: col })];
      if (cell && String(cell.v).toLowerCase().includes('disclaimer')) {
        // Check if row before has data
        let rowBeforeHasData = false;
        for (let c = 0; c < 20; c++) {
          const prevCell = holdingsSheet[XLSX.utils.encode_cell({ r: i - 1, c })];
          if (prevCell && prevCell.v && String(prevCell.v).trim() !== '') {
            if (c === 1 || c === 3) {
              rowBeforeHasData = true;
              break;
            }
          }
        }
        endRow = rowBeforeHasData ? i - 1 : i - 2;
        break;
      }
    }
    if (endRow !== null) break;
  }
  
  console.log(`📊 Header row: ${startRow + 1}, End row: ${endRow !== null ? endRow + 1 : 'end'}`);
  
  // Parse data
  let data = [];
  if (endRow !== null) {
    const rangeStr = XLSX.utils.encode_range({ s: { r: startRow, c: 0 }, e: { r: endRow, c: 20 } });
    data = XLSX.utils.sheet_to_json(holdingsSheet, { range: rangeStr, defval: null });
  } else {
    data = XLSX.utils.sheet_to_json(holdingsSheet, { range: startRow, defval: null });
  }
  
  console.log(`📊 Parsed ${data.length} raw rows`);
  
  // Normalize holdings
  const holdings = data
    .map((row, index) => {
      const stockName = row['Stock Name'] || row['stockName'] || '';
      const isin = row['ISIN'] || row['isin'] || '';
      const openQty = parseFloat(row['Open Qty'] || row['openQty'] || 0);
      
      if (!stockName && !isin) return null;
      if (String(stockName).toLowerCase().includes('disclaimer')) return null;
      
      return {
        stockName: stockName.toString().trim(),
        sectorName: (row['Sector Name'] || row['sectorName'] || '').toString().trim(),
        isin: isin.toString().trim(),
        portfolioPercentage: parseFloat(row['% of Total Portfolio'] || row['portfolioPercentage'] || 0),
        openQty: openQty,
        marketPrice: parseFloat(row['Market Price'] || row['marketPrice'] || 0),
        marketValue: parseFloat(row['Market Value'] || row['marketValue'] || 0),
        investmentAmount: parseFloat(row['Investment Amount'] || row['investmentAmount'] || 0),
        avgCost: parseFloat(row['Avg Cost'] || row['avgCost'] || 0),
        profitLossTillDate: parseFloat(row['Profit/Loss Till date'] || row['profitLossTillDate'] || 0),
        profitLossTillDatePercent: parseFloat(row['Profit/Loss Till date %'] || row['profitLossTillDatePercent'] || 0),
      };
    })
    .filter(h => h && h.isin && h.isin.trim() !== '');
  
  return holdings;
}

async function runDiagnostic() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🔍 ROOT CAUSE ANALYSIS: Upload Issue Diagnostic');
    console.log('='.repeat(80));
    console.log(`Excel File: ${EXCEL_FILE_PATH}`);
    console.log(`Client ID: ${CLIENT_ID}`);
    console.log(`Date: ${new Date().toISOString()}\n`);
    
    // Connect to DB
    await connectDB();
    
    // STEP 1: Parse Excel
    console.log('\n' + '='.repeat(80));
    console.log('STEP 1: Parsing Excel File');
    console.log('='.repeat(80));
    const holdings = await parseExcelFile(EXCEL_FILE_PATH);
    console.log(`✅ Parsed ${holdings.length} holdings from Excel`);
    
    const bhelInExcel = holdings.find(h => {
      const normalizedIsin = normalizeIsin(h.isin);
      return normalizedIsin === 'INE257A01026' || h.stockName?.toLowerCase().includes('bhel');
    });
    
    if (bhelInExcel) {
      console.log(`✅ BHEL found in Excel: ${bhelInExcel.stockName} (${bhelInExcel.isin}) - Qty: ${bhelInExcel.openQty}`);
    } else {
      console.error(`❌ BHEL NOT found in Excel!`);
      console.log(`All ISINs:`, holdings.map(h => h.isin));
    }
    
    // STEP 2: Check DB before
    console.log('\n' + '='.repeat(80));
    console.log('STEP 2: Checking Database (BEFORE)');
    console.log('='.repeat(80));
    const holdingsBefore = await Holding.find({ clientId: CLIENT_ID }).lean();
    console.log(`✅ Holdings in DB: ${holdingsBefore.length}`);
    
    // STEP 3: Save each holding
    console.log('\n' + '='.repeat(80));
    console.log('STEP 3: Saving Holdings (One by One)');
    console.log('='.repeat(80));
    
    const saveResults = [];
    for (const holding of holdings) {
      const normalizedIsin = normalizeIsin(holding.isin);
      
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
          clientName: 'Test Client',
          asOnDate: new Date(),
          lastUpdated: new Date(),
        };
        
        const result = await Holding.findOneAndUpdate(
          { clientId: CLIENT_ID, isin: normalizedIsin },
          holdingToSave,
          { upsert: true, new: true, runValidators: true }
        );
        
        if (result) {
          saveResults.push({ holding, success: true });
          if (normalizedIsin === 'INE257A01026') {
            console.log(`✅ BHEL saved: ${result.stockName} (${result.isin})`);
          }
        } else {
          saveResults.push({ holding, success: false, error: 'Result is null' });
          console.error(`❌ Failed: ${holding.stockName} - result is null`);
        }
      } catch (error) {
        saveResults.push({ holding, success: false, error: error.message });
        console.error(`❌ Error: ${holding.stockName} (${normalizedIsin}): ${error.message}`);
        if (normalizedIsin === 'INE257A01026') {
          console.error(`   Error code: ${error.code}`);
          console.error(`   Error details:`, JSON.stringify(error, null, 2));
        }
      }
    }
    
    console.log(`\n✅ Saved: ${saveResults.filter(r => r.success).length}/${holdings.length}`);
    
    // STEP 4: Wait and verify
    console.log('\n' + '='.repeat(80));
    console.log('STEP 4: Verifying Database (AFTER)');
    console.log('='.repeat(80));
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const holdingsAfter = await Holding.find({ clientId: CLIENT_ID }).lean();
    const countAfter = await Holding.countDocuments({ clientId: CLIENT_ID });
    
    console.log(`✅ Count query: ${countAfter}`);
    console.log(`✅ Find query: ${holdingsAfter.length}`);
    
    const bhelAfter = holdingsAfter.find(h => {
      const normalizedIsin = normalizeIsin(h.isin);
      return normalizedIsin === 'INE257A01026';
    });
    
    if (bhelAfter) {
      console.log(`✅ BHEL in DB: ${bhelAfter.stockName} (${bhelAfter.isin})`);
    } else {
      console.error(`❌ BHEL NOT in DB after save!`);
        
      const bhelDirect = await Holding.findOne({ clientId: CLIENT_ID, isin: 'INE257A01026' }).lean();
      if (bhelDirect) {
        console.error(`⚠️  BHEL found via direct query but not in find({ clientId })!`);
        console.error(`   This indicates a query filtering issue.`);
      } else {
        console.error(`❌ BHEL not found via direct query either.`);
      }
    }
    
    // Compare expected vs actual
    const expectedIsins = new Set(holdings.map(h => normalizeIsin(h.isin)).filter(Boolean));
    const actualIsins = new Set(holdingsAfter.map(h => normalizeIsin(h.isin)).filter(Boolean));
    const missingIsins = Array.from(expectedIsins).filter(isin => !actualIsins.has(isin));
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Expected: ${expectedIsins.size}`);
    console.log(`Actual: ${actualIsins.size}`);
    console.log(`Missing: ${missingIsins.length}`);
    
    if (missingIsins.length > 0) {
      console.error(`\n❌ ROOT CAUSE: ${missingIsins.length} holdings missing!`);
      missingIsins.forEach(isin => {
        const holding = holdings.find(h => normalizeIsin(h.isin) === isin);
        const saveResult = saveResults.find(r => normalizeIsin(r.holding.isin) === isin);
        console.error(`   - ${isin} (${holding?.stockName || 'Unknown'})`);
        if (saveResult && !saveResult.success) {
          console.error(`     Save failed: ${saveResult.error}`);
        } else if (saveResult && saveResult.success) {
          console.error(`     Save reported success but not in DB!`);
        }
      });
    } else {
      console.log(`\n✅ All holdings are in the database!`);
    }
    
    console.log('\n' + '='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
  } finally {
    await disconnectDB();
    process.exit(0);
  }
}

runDiagnostic();

