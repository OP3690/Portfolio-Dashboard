import { NextRequest, NextResponse } from 'next/server';
import { parseExcelFile, parseStockMasterFile } from '@/lib/excelParser';
import connectDB from '@/lib/mongodb';
import Holding from '@/models/Holding';
import Transaction from '@/models/Transaction';
import RealizedProfitLoss from '@/models/RealizedProfitLoss';
import StockMaster from '@/models/StockMaster';
import { updateDailyStockDataForHoldings } from '@/lib/stockDataService';
import { findISINsForStockNames } from '@/lib/isinMatcher';

// Helper function to normalize ISIN (trim whitespace and uppercase)
function normalizeIsin(isin: string | null | undefined): string {
  if (!isin) return '';
  return String(isin).trim().toUpperCase();
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const fileType = formData.get('fileType') as string; // 'holdings' or 'stockMaster'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Only accept Excel files
    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    
    if (!isExcel) {
      return NextResponse.json({ 
        error: 'Invalid file type. Please upload an Excel file (.xlsx, .xls) only.' 
      }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();

    if (fileType === 'stockMaster') {
      // Parse and save stock master data
      const stockMasterData = parseStockMasterFile(arrayBuffer);
      
      for (const stock of stockMasterData) {
        await StockMaster.findOneAndUpdate(
          { isin: stock.isin },
          {
            isin: stock.isin,
            stockName: stock.stockName,
            symbol: stock.symbol,
            exchange: stock.exchange,
            lastUpdated: new Date(),
          },
          { upsert: true, new: true }
        );
      }

      return NextResponse.json({ 
        success: true, 
        message: `Successfully processed ${stockMasterData.length} stocks from stock master file`,
        count: stockMasterData.length,
        details: {
          stocksProcessed: stockMasterData.length,
          fileName: file.name,
          fileSize: file.size,
        }
      });
    }

    // Parse holdings Excel file (only format supported - Holding_equity_open format)
    console.log('\n=== PARSING EXCEL FILE ===');
    const excelData = parseExcelFile(arrayBuffer);
    
    // Log parsing results for debugging
    console.log('\n=== UPLOAD API: PARSING RESULTS ===');
    console.log(`✅ Excel parsed successfully!`);
    console.log(`Total holdings parsed: ${excelData.holdings.length}`);
    console.log(`Total transactions parsed: ${excelData.transactions.length}`);
    console.log(`Total realized P&L records parsed: ${excelData.realizedProfitLoss.length}`);
    console.log(`Total unrealized P&L records parsed: ${excelData.unrealizedProfitLoss.length}`);
    
    // Check for Ola Electric in parsed data
    const olaInRealized = excelData.realizedProfitLoss.filter((r: any) => 
      String(r.stockName || '').toLowerCase().includes('ola electric')
    );
    if (olaInRealized.length > 0) {
      console.log(`✅✅✅ Found ${olaInRealized.length} Ola Electric records in parsed realized P&L`);
      olaInRealized.slice(0, 3).forEach((r: any, i: number) => {
        console.log(`  ${i + 1}. "${r.stockName}" - ISIN: ${r.isin || 'MISSING'}, Closed Qty: ${r.closedQty}`);
      });
    } else {
      console.warn(`⚠️  No Ola Electric found in parsed realized P&L`);
    }
    console.log(`Holdings ISINs:`, excelData.holdings.map((h: any) => h.isin));
    console.log('=== END UPLOAD API PARSING RESULTS ===\n');

    if (!excelData.clientId) {
      return NextResponse.json({ error: 'Invalid Excel format: Client ID not found' }, { status: 400 });
    }

    const clientId = excelData.clientId;
    const now = new Date();

    // Get ALL holdings from Excel (both current and historical)
    // IMPORTANT: Always look up ISINs from stock names using StockMaster as primary source
    // The user will upload monthly updates, and ISINs should always be fetched from the master stock list
    // The Excel file contains both:
    //   1. Current holdings (Open Qty > 0)
    //   2. Historical holdings (Closed Qty > 0, Open Qty = 0) - stocks that were sold
    let currentHoldingsFromExcel = excelData.holdings.filter(h => h.stockName && h.stockName.trim() !== '');
    
    // Separate current holdings from historical holdings for logging
    const currentHoldings = currentHoldingsFromExcel.filter(h => (h.openQty || 0) > 0);
    const historicalHoldings = currentHoldingsFromExcel.filter(h => (h.openQty || 0) <= 0 && (h.closedQty || 0) > 0);
    
    console.log(`\n📊 Processing ${currentHoldingsFromExcel.length} total holdings from Excel:`);
    console.log(`   ✅ Current holdings (Open Qty > 0): ${currentHoldings.length}`);
    console.log(`   📤 Historical holdings (Closed Qty > 0, Open Qty = 0): ${historicalHoldings.length}`);
    console.log(`🔍 Looking up ISINs for all holdings from stock names...`);
    
    // Get all stock names that need ISIN lookup (include those with existing ISINs too, for validation)
    const allStockNames = currentHoldingsFromExcel.map(h => String(h.stockName || '').trim()).filter(Boolean);
    const uniqueStockNames = [...new Set(allStockNames.map(name => name.toLowerCase()))];
    console.log(`   Total unique stock names: ${uniqueStockNames.length}`);
    
    // Strategy 1: PRIMARY - Query StockMaster collection for ISINs (this is the master file)
    // This should be the primary source since the user maintains a master stock list
    console.log(`\n📋 Strategy 1: Querying StockMaster collection (primary source)...`);
    const stockMasterMap = new Map<string, { isin: string; stockName: string; similarity: number }>();
    
    // Get all stocks from StockMaster that might match
    const allStockMasters = await StockMaster.find({}).lean();
    console.log(`   Found ${allStockMasters.length} stocks in StockMaster collection`);
    
    // Build a map for exact matches first
    const exactMatchMap = new Map<string, string>();
    allStockMasters.forEach((stock: any) => {
      const stockName = String(stock.stockName || '').trim().toLowerCase();
      const isin = normalizeIsin(stock.isin);
      if (stockName && isin) {
        exactMatchMap.set(stockName, isin);
      }
    });
    
    // Try exact matches first
    let exactMatches = 0;
    uniqueStockNames.forEach(stockNameKey => {
      const exactMatch = exactMatchMap.get(stockNameKey);
      if (exactMatch) {
        // Find the original stock name (with correct casing) from Excel
        const originalStockName = allStockNames.find(n => n.toLowerCase() === stockNameKey) || stockNameKey;
        stockMasterMap.set(stockNameKey, {
          isin: exactMatch,
          stockName: originalStockName,
          similarity: 1.0
        });
        exactMatches++;
      }
    });
    console.log(`   ✅ Found ${exactMatches} exact matches from StockMaster`);
    
    // Strategy 2: Use fuzzy matching from StockMaster for remaining stocks
    const stockNamesNeedingFuzzyMatch = uniqueStockNames.filter(name => !stockMasterMap.has(name));
    if (stockNamesNeedingFuzzyMatch.length > 0) {
      console.log(`\n🔍 Strategy 2: Using fuzzy matching for ${stockNamesNeedingFuzzyMatch.length} stocks from StockMaster...`);
      const fuzzyMatchMap = await findISINsForStockNames(stockNamesNeedingFuzzyMatch, 0.7);
      console.log(`   ✅ Found ${fuzzyMatchMap.size} matches via fuzzy matching`);
      
      // Add fuzzy matches to stockMasterMap
      fuzzyMatchMap.forEach((match, stockNameKey) => {
        const originalStockName = allStockNames.find(n => n.toLowerCase() === stockNameKey) || stockNameKey;
        stockMasterMap.set(stockNameKey, {
          isin: match.isin,
          stockName: originalStockName,
          similarity: match.similarity
        });
      });
    }
    
    // Strategy 3: Fallback to existing holdings in database (for historical data)
    const stockNamesStillNeedingIsin = uniqueStockNames.filter(name => !stockMasterMap.has(name));
    if (stockNamesStillNeedingIsin.length > 0) {
      console.log(`\n💾 Strategy 3: Checking existing holdings in database for ${stockNamesStillNeedingIsin.length} stocks...`);
      const existingHoldings = await Holding.find({ clientId }).lean();
      const existingHoldingsMap = new Map<string, string>();
      
      existingHoldings.forEach((h: any) => {
        const stockName = String(h.stockName || '').trim().toLowerCase();
        const isin = normalizeIsin(h.isin);
        if (stockName && isin && !existingHoldingsMap.has(stockName)) {
          existingHoldingsMap.set(stockName, isin);
        }
      });
      
      let fallbackMatches = 0;
      stockNamesStillNeedingIsin.forEach(stockNameKey => {
        const foundIsin = existingHoldingsMap.get(stockNameKey);
        if (foundIsin) {
          const originalStockName = allStockNames.find(n => n.toLowerCase() === stockNameKey) || stockNameKey;
          stockMasterMap.set(stockNameKey, {
            isin: foundIsin,
            stockName: originalStockName,
            similarity: 1.0 // Exact match from existing holdings
          });
          fallbackMatches++;
        }
      });
      console.log(`   ✅ Found ${fallbackMatches} matches from existing holdings`);
    }
    
    // Update all holdings with ISINs from StockMaster (preferred) or fallback sources
    console.log(`\n🔄 Updating holdings with ISINs...`);
    let updatedCount = 0;
    let validatedCount = 0;
    let missingIsinCount = 0;
    
    currentHoldingsFromExcel = currentHoldingsFromExcel.map(h => {
      const stockName = String(h.stockName || '').trim();
      const stockNameKey = stockName.toLowerCase();
      const existingIsin = normalizeIsin(h.isin);
      
      // Get ISIN from StockMaster (primary source)
      const stockMasterMatch = stockMasterMap.get(stockNameKey);
      
      if (stockMasterMatch) {
        const matchedIsin = normalizeIsin(stockMasterMatch.isin);
        
        // If Excel already has an ISIN, validate it matches
        if (existingIsin) {
          if (existingIsin === matchedIsin) {
            validatedCount++;
            return h; // Keep existing ISIN if it matches
          } else {
            console.warn(`  ⚠️  ISIN mismatch for "${stockName}": Excel has ${existingIsin}, StockMaster has ${matchedIsin}. Using StockMaster value.`);
            updatedCount++;
            return { ...h, isin: matchedIsin };
          }
        } else {
          // No ISIN in Excel, use StockMaster value
          console.log(`  ✅ Found ISIN for "${stockName}" from StockMaster: ${matchedIsin} (${(stockMasterMatch.similarity * 100).toFixed(1)}% match)`);
          updatedCount++;
          return { ...h, isin: matchedIsin };
        }
      } else {
        // No match found in StockMaster or existing holdings
        if (existingIsin) {
          // Excel has an ISIN, keep it but warn
          console.warn(`  ⚠️  "${stockName}" has ISIN ${existingIsin} in Excel but not found in StockMaster. Keeping Excel value.`);
          return h;
        } else {
          // No ISIN anywhere
          console.error(`  ❌ Could not find ISIN for "${stockName}" in StockMaster or existing holdings!`);
          missingIsinCount++;
          return h;
        }
      }
    });
    
    console.log(`\n📊 ISIN Lookup Summary:`);
    console.log(`   ✅ Exact matches from StockMaster: ${exactMatches}`);
    console.log(`   🔍 Fuzzy matches from StockMaster: ${stockMasterMap.size - exactMatches}`);
    console.log(`   🔄 Holdings updated with ISINs: ${updatedCount}`);
    console.log(`   ✓ Holdings validated (ISIN already correct): ${validatedCount}`);
    console.log(`   ❌ Holdings missing ISIN: ${missingIsinCount}`);
    
    // Log which holdings are missing ISINs
    if (missingIsinCount > 0) {
      console.log(`\n⚠️  Holdings WITHOUT ISIN (will be skipped):`);
      currentHoldingsFromExcel.forEach(h => {
        const stockName = String(h.stockName || '').trim();
        const stockNameKey = stockName.toLowerCase();
        const existingIsin = normalizeIsin(h.isin);
        const stockMasterMatch = stockMasterMap.get(stockNameKey);
        
        if (!stockMasterMatch && !existingIsin) {
          const openQty = h.openQty || 0;
          const closedQty = h.closedQty || 0;
          console.log(`   ❌ "${stockName}" - Open Qty: ${openQty}, Closed Qty: ${closedQty}`);
        }
      });
    }
    
    // Final filter: Only process holdings with ISIN (required for database operations)
    const validHoldings = currentHoldingsFromExcel.filter(h => h.isin && normalizeIsin(h.isin) !== '');
    const invalidHoldings = currentHoldingsFromExcel.filter(h => !h.isin || normalizeIsin(h.isin) === '');
    
    if (invalidHoldings.length > 0) {
      console.warn(`\n⚠️  WARNING: ${invalidHoldings.length} holdings will be SKIPPED due to missing ISIN:`);
      invalidHoldings.forEach(h => {
        console.warn(`   - "${h.stockName}" (Quantity: ${h.openQty || 0})`);
      });
      console.warn(`\n💡 To fix this, please:`);
      console.warn(`   1. Ensure the stock name matches exactly with StockMaster collection`);
      console.warn(`   2. Upload/update the StockMaster file (NSE_BSE_Active_Scripts_with_ISIN.xlsx)`);
      console.warn(`   3. Check for typos or variations in stock names`);
    }
    
    currentHoldingsFromExcel = validHoldings;
    console.log(`\n✅ Final holdings to process: ${currentHoldingsFromExcel.length} holdings with valid ISINs`);
    
    if (currentHoldingsFromExcel.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid holdings found with ISINs. Please check your Excel file or update StockMaster collection.',
        details: {
          totalHoldings: excelData.holdings.length,
          holdingsWithoutIsin: invalidHoldings.length,
          invalidStockNames: invalidHoldings.map(h => h.stockName),
        }
      }, { status: 400 });
    }
    
    // Check for duplicate ISINs in Excel data (same ISIN, different stock names)
    const isinToStockName = new Map<string, string>();
    const duplicateIsins: Array<{ isin: string; stocks: string[] }> = [];
    for (const holding of currentHoldingsFromExcel) {
      if (isinToStockName.has(holding.isin)) {
        const existingStock = isinToStockName.get(holding.isin);
        if (existingStock !== holding.stockName) {
          // Found duplicate ISIN with different stock name
          const existingDuplicate = duplicateIsins.find(d => d.isin === holding.isin);
          if (existingDuplicate) {
            if (!existingDuplicate.stocks.includes(holding.stockName)) {
              existingDuplicate.stocks.push(holding.stockName);
            }
            if (!existingDuplicate.stocks.includes(existingStock!)) {
              existingDuplicate.stocks.push(existingStock!);
            }
          } else {
            duplicateIsins.push({ isin: holding.isin, stocks: [existingStock!, holding.stockName] });
          }
        }
      } else {
        isinToStockName.set(holding.isin, holding.stockName);
      }
    }
    
    if (duplicateIsins.length > 0) {
      console.warn('⚠️  WARNING: Found duplicate ISINs in Excel file:');
      duplicateIsins.forEach(dup => {
        console.warn(`  ISIN ${dup.isin} appears for stocks: ${dup.stocks.join(', ')}`);
      });
      console.warn('  Last stock with each ISIN will overwrite previous ones in database.');
    }
    
    // CRITICAL FIX: Normalize ISINs for comparison to avoid false positives
    // Excel ISINs might have whitespace/case differences compared to DB ISINs
    const currentIsins = new Set(
      currentHoldingsFromExcel
        .map(h => normalizeIsin(h.isin))
        .filter(Boolean)
    );
    
    // Check if BHEL is in current holdings before deletion
    const bhelInCurrent = currentHoldingsFromExcel.find(h => {
      const normalizedIsin = normalizeIsin(h.isin);
      return normalizedIsin === 'INE257A01026' || h.stockName?.toLowerCase().includes('bhel');
    });
    console.log(`BHEL in currentHoldingsFromExcel: ${bhelInCurrent ? 'YES' : 'NO'}`);
    if (bhelInCurrent) {
      console.log(`BHEL details:`, bhelInCurrent.stockName, bhelInCurrent.isin, `(normalized: ${normalizeIsin(bhelInCurrent.isin)})`, `Qty: ${bhelInCurrent.openQty}`);
    }

    // Get old holdings from database
    const oldHoldings = await Holding.find({ clientId }).lean();
    // Normalize ISINs from database for comparison
    const oldIsins = new Set(oldHoldings.map(h => normalizeIsin(h.isin)).filter(Boolean));
    
    // Check if BHEL is in old holdings
    const bhelInOld = oldHoldings.find((h: any) => {
      const normalizedIsin = normalizeIsin(h.isin);
      return normalizedIsin === 'INE257A01026' || h.stockName?.toLowerCase().includes('bhel');
    });
    if (bhelInOld) {
      console.log(`BHEL in old holdings: YES -`, bhelInOld.stockName, bhelInOld.isin, `(normalized: ${normalizeIsin(bhelInOld.isin)})`);
    } else {
      console.log(`BHEL in old holdings: NO`);
    }

    // REMOVED: Deletion of "sold stocks" - stocks can be sold and bought again
    // Instead, we'll only keep what's in the current Excel file
    // Old holdings that aren't in current file will naturally be replaced via upsert
    // This prevents accidental deletion of stocks that might appear again
    
    console.log(`📊 Holdings update strategy: Upsert only (no pre-deletion of sold stocks)`);
    console.log(`   - Old holdings in DB: ${oldHoldings.length}`);
    console.log(`   - New holdings from Excel: ${currentHoldingsFromExcel.length}`);
    console.log(`   - Stocks will be upserted (created if new, updated if existing)`);
    
    // Log any stocks that are in old holdings but not in current (for informational purposes only)
    const stocksNotInCurrent = Array.from(oldIsins).filter(normalizedIsin => !currentIsins.has(normalizedIsin));
    if (stocksNotInCurrent.length > 0) {
      console.log(`ℹ️  Note: ${stocksNotInCurrent.length} stocks from previous upload are not in current Excel:`);
      stocksNotInCurrent.forEach(isin => {
        const oldHolding = oldHoldings.find(h => normalizeIsin(h.isin) === isin);
        if (oldHolding) {
          console.log(`   - ${oldHolding.stockName} (${isin}) - Qty: ${oldHolding.openQty}`);
        }
      });
      console.log(`   These will remain in DB until explicitly replaced or manually removed.`);
      console.log(`   If a stock is truly sold, it should have openQty=0 in Excel or be removed from Excel entirely.`);
    }

    // Update or add current holdings
    let newStocksCount = 0;
    let updatedStocksCount = 0;
    let failedSaves: Array<{holding: any, error: string}> = [];
    let savedHoldings: Array<{isin: string, stockName: string}> = [];

    console.log(`\n=== SAVING ${currentHoldingsFromExcel.length} HOLDINGS ===`);
    
    // CRITICAL: After ISIN lookup, filter out holdings that still don't have ISINs
    // But log them so we know what was skipped
    const holdingsWithIsin = currentHoldingsFromExcel.filter(h => {
      const isin = normalizeIsin(h.isin);
      if (!isin || isin === '') {
        console.log(`⚠️  Skipping holding without ISIN after lookup: ${h.stockName}`);
        return false;
      }
      return true;
    });
    
    console.log(`\nProcessing ${holdingsWithIsin.length} holdings with valid ISINs (${currentHoldingsFromExcel.length - holdingsWithIsin.length} skipped)`);
    
    for (const holding of holdingsWithIsin) {
      const normalizedIsin = normalizeIsin(holding.isin); // Use helper function for consistency
      
      // Double-check ISIN is present (should never happen after filter, but safety check)
      if (!normalizedIsin || normalizedIsin === '') {
        console.error(`❌ ERROR: Holding has empty ISIN after filter: ${holding.stockName}`);
        continue;
      }
      const isBhel = normalizedIsin === 'INE257A01026' || holding.stockName?.toLowerCase().includes('bhel');
      
      if (isBhel) {
        console.log(`\n🔵🔵🔵 PROCESSING BHEL: ${holding.stockName} (ISIN: ${normalizedIsin})`);
      }
      
      // Get Excel values (handle both normalized and raw Excel column names)
      // IMPORTANT: The Excel parser normalizes column names, so holding.stockName should work
      // But we also check raw Excel column names as fallback
      const excelStockName = String(holding.stockName || holding['Stock Name'] || '').trim();
      const excelQty = Number(holding.openQty ?? holding['Open Qty'] ?? 0);
      const excelMarketPrice = Number(holding.marketPrice ?? holding['Market Price'] ?? 0);
      const excelMarketValue = Number(holding.marketValue ?? holding['Market Value'] ?? 0);
      const excelInvestmentAmount = Number(holding.investmentAmount ?? holding['Investment Amount'] ?? 0);
      const excelSectorName = String(holding.sectorName || holding['Sector Name'] || '').trim();
      
      // Debug logging for Tata Steel to track what values we're getting from Excel
      if (excelStockName.toLowerCase().includes('tata steel')) {
        console.log(`📊 Tata Steel Excel values extracted:`, {
          stockName: excelStockName,
          qty: excelQty,
          isin: normalizedIsin,
          rawHolding: {
            stockName: holding.stockName,
            'Stock Name': holding['Stock Name'],
            openQty: holding.openQty,
            'Open Qty': holding['Open Qty'],
          }
        });
      }
      
      const existing = await Holding.findOne({
        clientId,
        isin: normalizedIsin,
      }).lean() as any;

      if (!existing || Array.isArray(existing)) {
        // New stock - add it
        newStocksCount++;
        if (isBhel) {
          console.log(`🔵 BHEL: New stock - Adding: ${excelStockName} (ISIN: ${normalizedIsin}, Qty: ${excelQty})`);
        } else {
          console.log(`➕ Adding new stock: ${excelStockName} (ISIN: ${normalizedIsin}, Qty: ${excelQty})`);
        }
      } else {
        // Existing stock - check if data changed
        // Use parsed Excel values for comparison
        // CRITICAL: Convert numbers to ensure proper comparison (handle string vs number issues)
        const existingQty = Number(existing.openQty) || 0;
        const existingPrice = Number(existing.marketPrice) || 0;
        const existingValue = Number(existing.marketValue) || 0;
        const existingInvestment = Number(existing.investmentAmount) || 0;
        const existingStockName = String(existing.stockName || '').trim();
        const existingSector = String(existing.sectorName || '').trim();
        
        const shouldUpdate = 
          existingQty !== excelQty ||
          existingPrice !== excelMarketPrice ||
          existingValue !== excelMarketValue ||
          existingInvestment !== excelInvestmentAmount ||
          existingStockName !== excelStockName ||
          existingSector !== excelSectorName;

        if (shouldUpdate) {
          updatedStocksCount++;
          if (isBhel || excelStockName.toLowerCase().includes('tata steel')) {
            console.log(`🔄 Updating stock: ${excelStockName} (ISIN: ${normalizedIsin})`);
            console.log(`   Changes detected:`);
            if (existingStockName !== excelStockName) {
              console.log(`     - Stock Name: "${existingStockName}" → "${excelStockName}"`);
            }
            if (existingQty !== excelQty) {
              console.log(`     - Quantity: ${existingQty} → ${excelQty}`);
            }
            if (existingPrice !== excelMarketPrice) {
              console.log(`     - Market Price: ${existingPrice} → ${excelMarketPrice}`);
            }
            if (existingSector !== excelSectorName) {
              console.log(`     - Sector: "${existingSector}" → "${excelSectorName}"`);
            }
          } else {
            console.log(`🔄 Updating stock: ${excelStockName} (ISIN: ${normalizedIsin})`);
          }
        } else {
          if (isBhel || excelStockName.toLowerCase().includes('tata steel')) {
            console.log(`ℹ️  No changes detected for: ${excelStockName} (existing matches Excel)`);
            console.log(`   Existing: Name="${existingStockName}", Qty=${existingQty}`);
            console.log(`   Excel: Name="${excelStockName}", Qty=${excelQty}`);
          }
        }
      }
      
      // ALWAYS update (even if no changes detected) to ensure lastUpdated timestamp is fresh
      // This ensures the UI can detect that data was refreshed

      // Prepare holding data with defaults for ALL required fields - use the parsed Excel values
      // Define holdingToSave BEFORE try block so it's accessible in catch block
      const holdingToSave = {
          stockName: excelStockName,
          sectorName: excelSectorName,
          isin: normalizedIsin,
          portfolioPercentage: holding.portfolioPercentage ?? holding['% of Total Portfolio'] ?? 0,
          openQty: excelQty,
          marketPrice: excelMarketPrice,
          marketValue: excelMarketValue,
          investmentAmount: excelInvestmentAmount,
          avgCost: holding.avgCost ?? holding['Avg Cost'] ?? 0,
          profitLossTillDate: holding.profitLossTillDate ?? holding['Profit/Loss Till date'] ?? 0,
          profitLossTillDatePercent: holding.profitLossTillDatePercent ?? holding['Profit/Loss Till date %'] ?? 0,
          clientId,
          clientName: excelData.clientName || '',
          asOnDate: excelData.asOnDate || new Date(),
          lastUpdated: now,
        };
      
      // Log what we're saving for Tata Steel
      if (excelStockName.toLowerCase().includes('tata steel')) {
        console.log(`📝 Saving Tata Steel data:`, {
          stockName: holdingToSave.stockName,
          qty: holdingToSave.openQty,
          isin: holdingToSave.isin,
        });
      }
      
      // Validate critical fields - if ISIN or stock name is missing, log but still try to save with defaults
      if (!holdingToSave.isin || !holdingToSave.isin.trim()) {
        console.error(`❌ CRITICAL: Holding has no ISIN! Skipping:`, holdingToSave.stockName);
        failedSaves.push({ holding, error: 'Missing ISIN' });
        continue;
      }
      
      // Upsert the holding (update if exists, insert if new)
      try {
        // Delete any existing entries with the same ISIN (normalized) but different format
        // This ensures we don't have duplicates with whitespace/case differences
        const existingVariants = await Holding.find({ clientId }).lean();
        const variantsToDelete = existingVariants.filter(v => 
          normalizeIsin(v.isin) === normalizedIsin && v.isin !== normalizedIsin
        );
        
        if (variantsToDelete.length > 0) {
          if (isBhel) {
            console.log(`🔵 BHEL: Found ${variantsToDelete.length} variant(s) to delete`);
          }
          for (const variant of variantsToDelete) {
            console.log(`   Deleting variant with different ISIN format: "${variant.isin}" (expected: "${normalizedIsin}")`);
            await Holding.deleteOne({ _id: variant._id });
          }
        }
        
        // Try to save - if duplicate key error, delete the conflicting entry and retry
        let result;
        let saveAttempts = 0;
        const maxAttempts = 3;
        
        while (saveAttempts < maxAttempts && !result) {
          saveAttempts++;
          try {
            // CRITICAL: Always use $set to ensure ALL fields are updated, even if they're the same
            // This ensures data consistency and updates the lastUpdated timestamp
            result = await Holding.findOneAndUpdate(
              { clientId, isin: normalizedIsin },
              { 
                $set: {
                  ...holdingToSave,
                  lastUpdated: new Date(), // Always update timestamp to reflect latest upload
                }
              },
              { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
            );
            if (result) {
              // Verify it was actually saved
              const verifySaved = await Holding.findOne({ 
                clientId, 
                isin: normalizedIsin 
              }).lean() as any;
              
              if (verifySaved && !Array.isArray(verifySaved)) {
                // Double-check the saved values match what we tried to save (especially for Tata Steel)
                if (excelStockName.toLowerCase().includes('tata steel')) {
                  console.log(`   ✅ Tata Steel saved! Verifying values:`);
                  console.log(`      - Stock Name: DB="${verifySaved.stockName}" vs Excel="${holdingToSave.stockName}" ${verifySaved.stockName === holdingToSave.stockName ? '✅' : '❌'}`);
                  console.log(`      - Quantity: DB=${verifySaved.openQty} vs Excel=${holdingToSave.openQty} ${verifySaved.openQty === holdingToSave.openQty ? '✅' : '❌'}`);
                  if (verifySaved.stockName !== holdingToSave.stockName || verifySaved.openQty !== holdingToSave.openQty) {
                    console.error(`   ⚠️  WARNING: Saved values don't match Excel values!`);
                  }
                }
                
                savedHoldings.push({ isin: normalizedIsin, stockName: holdingToSave.stockName });
                if (isBhel) {
                  console.log(`   ✅✅✅ BHEL SAVE SUCCESS! _id: ${result._id}, isin: "${result.isin}", verified: YES`);
                }
                break; // Success, exit retry loop
              } else {
                if (isBhel || excelStockName.toLowerCase().includes('tata steel')) {
                  console.error(`   ❌ SAVE RETURNED RESULT BUT NOT FOUND IN DB! Retrying...`);
                }
                result = null; // Not actually saved, retry
              }
            }
          } catch (duplicateError: any) {
            // Log error for BHEL
            if (normalizeIsin(holdingToSave.isin) === 'INE257A01026' || holdingToSave.stockName?.toLowerCase().includes('bhel')) {
              console.error(`   ❌❌❌ BHEL SAVE ERROR (Attempt ${saveAttempts}):`, duplicateError.message);
              console.error(`   Error code:`, duplicateError.code);
              console.error(`   Full error:`, duplicateError);
            }
            if (saveAttempts >= maxAttempts) {
              throw duplicateError; // Give up after max attempts
            }
            
            // Handle duplicate key error (E11000)
            if (duplicateError.code === 11000 || duplicateError.message?.includes('duplicate key')) {
              console.warn(`⚠️  Duplicate key error for ${holdingToSave.stockName} (ISIN: ${holdingToSave.isin}) - Attempt ${saveAttempts}/${maxAttempts}`);
              
              // Try to find and delete the conflicting entry
              const conflicting = await Holding.findOne({ clientId, isin: normalizedIsin }).lean() as any;
              if (conflicting && !Array.isArray(conflicting)) {
                console.log(`   Deleting conflicting entry:`, conflicting._id, conflicting.isin);
                await Holding.deleteOne({ _id: conflicting._id });
                // Retry on next iteration
                await new Promise(resolve => setTimeout(resolve, 100));
              } else {
                throw duplicateError; // Can't find conflict, give up
              }
            } else {
              throw duplicateError; // Not a duplicate key error, don't retry
            }
          }
        }
        
        // If still no result, try using create() as fallback
        if (!result) {
          try {
            if (isBhel) {
              console.log(`🔵 BHEL: Attempting fallback save using create()`);
            } else {
              console.log(`   Attempting fallback save using create() for ${holdingToSave.stockName}`);
            }
            // Delete any existing first (using normalized ISIN)
            await Holding.deleteMany({ clientId, isin: normalizedIsin });
            result = await Holding.create(holdingToSave);
            
            // Verify it was saved
            const verifyCreate = await Holding.findOne({ 
              clientId, 
              isin: normalizedIsin 
            }).lean();
            
            if (verifyCreate) {
              savedHoldings.push({ isin: normalizedIsin, stockName: holdingToSave.stockName });
              if (isBhel) {
                console.log(`   ✅✅✅ BHEL Fallback create() succeeded and verified! _id: ${result._id}`);
              } else {
                console.log(`   ✅ Fallback create() succeeded for ${holdingToSave.stockName}`);
              }
            } else {
              throw new Error('Create returned result but verification failed');
            }
          } catch (createError: any) {
            // If create also fails, log and continue
            if (isBhel) {
              console.error(`   ❌❌❌ BHEL Fallback create() FAILED:`, createError.message);
            } else {
              console.error(`   ❌ Fallback create() also failed for ${holdingToSave.stockName}:`, createError.message);
            }
            throw createError;
          }
        }
        
        if (!result) {
          const errorMsg = `All save attempts returned null`;
          if (isBhel) {
            console.error(`❌❌❌ BHEL FAILED TO SAVE: ${errorMsg}`);
          } else {
            console.error(`❌ Failed to save holding: ${holdingToSave.stockName} (ISIN: ${normalizedIsin}) - ${errorMsg}`);
          }
          failedSaves.push({ holding, error: errorMsg });
        }
      } catch (saveError: any) {
        console.error(`❌ Error saving holding ${holdingToSave?.stockName || holding.stockName} (ISIN: ${holdingToSave?.isin || holding.isin}):`, saveError.message);
        console.error(`   Error code: ${saveError.code}, Error name: ${saveError.name}`);
        if (saveError.errors) {
          console.error(`   Validation errors:`, JSON.stringify(saveError.errors, null, 2));
        }
        failedSaves.push({ holding, error: saveError.message });
      }
    }
    
    // Log summary of saves
    console.log(`\n=== SAVE SUMMARY ===`);
    console.log(`✅ Successfully saved/updated: ${savedHoldings.length} holdings`);
    console.log(`   - New: ${newStocksCount}`);
    console.log(`   - Updated: ${updatedStocksCount}`);
    console.log(`   - Saved ISINs:`, savedHoldings.map(h => h.isin).sort());
    
    // Check if BHEL was saved
    const bhelSaved = savedHoldings.find(h => normalizeIsin(h.isin) === 'INE257A01026');
    if (bhelSaved) {
      console.log(`✅✅✅ BHEL was successfully saved: ${bhelSaved.stockName} (${bhelSaved.isin})`);
    } else {
      console.error(`❌❌❌ BHEL was NOT in saved holdings list!`);
      // Check if BHEL is in failed saves
      const bhelFailed = failedSaves.find(({ holding }) => 
        normalizeIsin(holding.isin) === 'INE257A01026' || holding.stockName?.toLowerCase().includes('bhel')
      );
      if (bhelFailed) {
        console.error(`❌❌❌ BHEL failed to save: ${bhelFailed.error}`);
      }
    }
    
    if (failedSaves.length > 0) {
      console.error(`❌ Failed to save ${failedSaves.length} holdings:`);
      failedSaves.forEach(({ holding, error }) => {
        const isBhelFailed = normalizeIsin(holding.isin) === 'INE257A01026';
        const marker = isBhelFailed ? '❌❌❌ BHEL ' : '   ';
        console.error(`${marker}- ${holding.stockName} (${holding.isin}): ${error}`);
      });
    }
    
    // Retry failed saves
    if (failedSaves.length > 0) {
      console.log(`\n=== RETRYING FAILED SAVES ===`);
      for (const { holding, error } of failedSaves) {
        try {
          const normalizedIsin = (holding.isin || '').trim();
          if (!normalizedIsin) {
            console.error(`   Skipping retry - no ISIN for ${holding.stockName}`);
            continue;
          }
          
          const retryData = {
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
            clientId,
            clientName: excelData.clientName || '',
            asOnDate: excelData.asOnDate || new Date(),
            lastUpdated: new Date(),
          };
          
          // Delete existing and create fresh
          await Holding.deleteMany({ clientId, isin: normalizedIsin });
          const retryResult = await Holding.create(retryData);
          console.log(`   ✅ Retry successful for ${holding.stockName} (${normalizedIsin})`);
        } catch (retryError: any) {
          console.error(`   ❌ Retry failed for ${holding.stockName}:`, retryError.message);
        }
      }
    }
    
    // 🚨 CRITICAL: After save loop, verify ALL expected holdings are saved
    console.log(`\n=== POST-LOOP VERIFICATION: Checking for missing holdings ===`);
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for all writes to commit
    
    const expectedIsins = new Set(currentHoldingsFromExcel.map(h => (h.isin || '').trim().toUpperCase()).filter(Boolean));
    const actualHoldingsAfterLoop = await Holding.find({ clientId }).lean();
    const actualIsinsAfterLoop = new Set(actualHoldingsAfterLoop.map(h => (h.isin || '').trim().toUpperCase()).filter(Boolean));
    
    const missingIsins = Array.from(expectedIsins).filter(isin => !actualIsinsAfterLoop.has(isin));
    
    if (missingIsins.length > 0) {
      console.error(`❌❌❌ ${missingIsins.length} HOLDINGS MISSING AFTER SAVE LOOP!`);
      console.error(`   Missing ISINs:`, missingIsins);
      
      // Try to save each missing holding
      for (const missingIsin of missingIsins) {
        const missingHolding = currentHoldingsFromExcel.find(h => (h.isin || '').trim().toUpperCase() === missingIsin);
        if (missingHolding) {
          console.error(`🚨 Attempting to save missing holding: ${missingHolding.stockName} (${missingIsin})`);
          try {
            const guaranteedSaveData = {
              stockName: missingHolding.stockName || '',
              sectorName: missingHolding.sectorName || '',
              isin: missingIsin,
              portfolioPercentage: missingHolding.portfolioPercentage ?? 0,
              openQty: missingHolding.openQty ?? 0,
              marketPrice: missingHolding.marketPrice ?? 0,
              marketValue: missingHolding.marketValue ?? 0,
              investmentAmount: missingHolding.investmentAmount ?? 0,
              avgCost: missingHolding.avgCost ?? 0,
              profitLossTillDate: missingHolding.profitLossTillDate ?? 0,
              profitLossTillDatePercent: missingHolding.profitLossTillDatePercent ?? 0,
              clientId,
              clientName: excelData.clientName || '',
              asOnDate: excelData.asOnDate || new Date(),
              lastUpdated: new Date(),
            };
            
            // Delete any existing entries first
            await Holding.deleteMany({ clientId, isin: missingIsin });
            
            // Save using create (most reliable)
            const guaranteedResult = await Holding.create(guaranteedSaveData);
            console.error(`✅✅✅ GUARANTEED SAVE SUCCESS! ${missingHolding.stockName} saved with _id:`, guaranteedResult._id);
            
            // Verify it was saved
            await new Promise(resolve => setTimeout(resolve, 200));
            const verifyGuaranteed = await Holding.findOne({ clientId, isin: missingIsin }).lean();
            if (verifyGuaranteed) {
              console.error(`✅✅✅ GUARANTEED SAVE VERIFIED! ${missingHolding.stockName} confirmed in database`);
            } else {
              console.error(`❌❌❌ GUARANTEED SAVE FAILED! ${missingHolding.stockName} still not found!`);
            }
          } catch (guaranteedError: any) {
            console.error(`❌❌❌ GUARANTEED SAVE ERROR for ${missingHolding.stockName}:`, guaranteedError.message);
            console.error(`   Error code:`, guaranteedError.code);
            if (guaranteedError.errors) {
              console.error(`   Validation errors:`, JSON.stringify(guaranteedError.errors, null, 2));
            }
          }
        }
      }
    } else {
      console.log(`✅ All expected holdings found in database after save loop`);
    }
    
    // Wait a moment for MongoDB to commit all writes (especially important for replica sets)
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Verify all holdings were saved - do MULTIPLE queries to ensure consistency
    console.log(`\n=== VERIFYING DATABASE STATE ===`);
    let finalHoldings = await Holding.find({ clientId }).lean();
    let finalHoldingsCount = finalHoldings.length;
    console.log(`Query 1 - Holdings count: ${finalHoldingsCount}`);
    
    // Query again to check for consistency
    await new Promise(resolve => setTimeout(resolve, 200));
    const finalHoldings2 = await Holding.find({ clientId }).lean();
    console.log(`Query 2 - Holdings count: ${finalHoldings2.length}`);
    
    // Direct query for BHEL to verify it exists
    const bhelVerify1 = await Holding.findOne({ clientId, isin: 'INE257A01026' }).lean();
    console.log(`Direct BHEL query 1: ${bhelVerify1 ? 'FOUND' : 'NOT FOUND'}`);
    
    await new Promise(resolve => setTimeout(resolve, 200));
    const bhelVerify2 = await Holding.findOne({ clientId, isin: 'INE257A01026' }).lean();
    console.log(`Direct BHEL query 2: ${bhelVerify2 ? 'FOUND' : 'NOT FOUND'}`);
    
    // Use the most recent query results
    finalHoldings = finalHoldings2;
    finalHoldingsCount = finalHoldings2.length;
    console.log(`\n=== HOLDINGS VERIFICATION ===`);
    console.log(`Total holdings in database after upload: ${finalHoldingsCount}`);
    console.log(`Expected from Excel: ${currentHoldingsFromExcel.length}`);
    
    // Verify all expected holdings are present
    const expectedIsinsFinal = new Set(currentHoldingsFromExcel.map(h => (h.isin || '').trim().toUpperCase()).filter(Boolean));
    const actualIsinsFinal = new Set(finalHoldings.map((h: any) => (h.isin || '').trim().toUpperCase()).filter(Boolean));
    const missingIsinsFinal = Array.from(expectedIsinsFinal).filter(isin => !actualIsinsFinal.has(isin));
    
    if (missingIsinsFinal.length > 0) {
      console.error(`❌❌❌ ${missingIsinsFinal.length} HOLDINGS STILL MISSING AFTER ALL SAVES!`);
      console.error(`   Missing ISINs:`, missingIsinsFinal);
      
      // Try one more time to save missing holdings
      for (const missingIsin of missingIsinsFinal) {
        const missingHolding = currentHoldingsFromExcel.find(h => (h.isin || '').trim().toUpperCase() === missingIsin);
        if (missingHolding) {
          console.error(`🚨 FINAL ATTEMPT: Saving missing holding ${missingHolding.stockName} (${missingIsin})`);
          try {
            const finalSaveData = {
              stockName: missingHolding.stockName || '',
              sectorName: missingHolding.sectorName || '',
              isin: missingIsin,
              portfolioPercentage: missingHolding.portfolioPercentage ?? 0,
              openQty: missingHolding.openQty ?? 0,
              marketPrice: missingHolding.marketPrice ?? 0,
              marketValue: missingHolding.marketValue ?? 0,
              investmentAmount: missingHolding.investmentAmount ?? 0,
              avgCost: missingHolding.avgCost ?? 0,
              profitLossTillDate: missingHolding.profitLossTillDate ?? 0,
              profitLossTillDatePercent: missingHolding.profitLossTillDatePercent ?? 0,
              clientId,
              clientName: excelData.clientName || '',
              asOnDate: excelData.asOnDate || new Date(),
              lastUpdated: new Date(),
            };
            
            await Holding.deleteMany({ clientId, isin: missingIsin });
            const finalResult = await Holding.create(finalSaveData);
            console.error(`✅ FINAL SAVE SUCCESS for ${missingHolding.stockName}`);
            
            // Add to finalHoldings array
            const verifyFinal = await Holding.findOne({ clientId, isin: missingIsin }).lean() as any;
            if (verifyFinal && !Array.isArray(verifyFinal)) {
              finalHoldings.push(verifyFinal);
              finalHoldingsCount = finalHoldings.length;
            }
          } catch (finalError: any) {
            console.error(`❌ FINAL SAVE FAILED for ${missingHolding.stockName}:`, finalError.message);
          }
        }
      }
    }
    
    // Final verification summary
    console.log(`\n=== FINAL VERIFICATION SUMMARY ===`);
    console.log(`Expected holdings from Excel: ${currentHoldingsFromExcel.length}`);
    console.log(`Actual holdings in database: ${finalHoldingsCount}`);
    
    if (finalHoldingsCount !== currentHoldingsFromExcel.length) {
      console.warn(`⚠️  COUNT MISMATCH: Expected ${currentHoldingsFromExcel.length}, got ${finalHoldingsCount}`);
      const excelIsins = new Set(currentHoldingsFromExcel.map(h => (h.isin || '').trim().toUpperCase()).filter(Boolean));
      const dbIsins = new Set(finalHoldings.map((h: any) => (h.isin || '').trim().toUpperCase()).filter(Boolean));
      const missingIsins = Array.from(excelIsins).filter(isin => !dbIsins.has(isin));
      const extraIsins = Array.from(dbIsins).filter(isin => !excelIsins.has(isin));
      
      if (missingIsins.length > 0) {
        console.error(`❌ Missing ISINs in database (${missingIsins.length}):`, missingIsins);
      }
      if (extraIsins.length > 0) {
        console.warn(`⚠️  Extra ISINs in database (${extraIsins.length}):`, extraIsins);
      }
    } else {
      console.log(`✅ All ${finalHoldingsCount} holdings successfully saved!`);
    }
    
    finalHoldings.forEach((h: any, idx: number) => {
      console.log(`  ${idx + 1}. ${h.stockName} - ISIN: ${h.isin} - Qty: ${h.openQty || 0}`);
    });
    console.log(`=== END VERIFICATION ===\n`);

    // Update Transactions - use unique constraint to avoid duplicates
    console.log(`\n=== UPDATING TRANSACTIONS ===`);
    console.log(`Total transactions to process: ${excelData.transactions.length}`);
    let transactionsSavedCount = 0;
    let transactionsUpdatedCount = 0;
    for (const transaction of excelData.transactions) {
      if (!transaction.isin) {
        console.log(`Skipping transaction without ISIN`);
        continue;
      }

      try {
        const normalizedIsin = (transaction.isin || '').trim();
        const existing = await Transaction.findOne({
          clientId,
          isin: normalizedIsin,
          transactionDate: transaction.transactionDate,
          buySell: transaction.buySell,
          tradedQty: transaction.tradedQty,
        });

        const result = await Transaction.findOneAndUpdate(
          {
            clientId,
            isin: normalizedIsin,
            transactionDate: transaction.transactionDate,
            buySell: transaction.buySell,
            tradedQty: transaction.tradedQty,
          },
          {
            ...transaction,
            isin: normalizedIsin,
            clientId,
            lastUpdated: now,
          },
          { upsert: true, new: true, runValidators: true }
        );
        
        if (existing) {
          transactionsUpdatedCount++;
        } else {
          transactionsSavedCount++;
        }
      } catch (error: any) {
        // Skip if duplicate (unique constraint violation)
        if (error.code !== 11000) {
          console.error(`Error saving transaction for ${transaction.stockName} (${transaction.isin}):`, error.message);
        }
      }
    }
    console.log(`✅ Saved ${transactionsSavedCount} new transactions, updated ${transactionsUpdatedCount} existing transactions`);

    // Update Realized Profit-Loss
    console.log(`\n=== UPDATING REALIZED P&L ===`);
    console.log(`Total realized P&L records to process: ${excelData.realizedProfitLoss.length}`);
    
    // Step 1: Collect all stock names that need ISIN lookup
    const stocksNeedingIsin = excelData.realizedProfitLoss
      .filter((r: any) => {
        const hasStockName = r.stockName && String(r.stockName).trim();
        const missingIsin = !r.isin || !String(r.isin).trim();
        return hasStockName && missingIsin;
      })
      .map((r: any) => String(r.stockName).trim());
    
    // Step 2: Batch lookup ISINs using fuzzy matching from StockMaster
    console.log(`🔍 Looking up ISINs for ${stocksNeedingIsin.length} stocks without ISIN using fuzzy matching...`);
    const isinLookupMap = stocksNeedingIsin.length > 0 
      ? await findISINsForStockNames(stocksNeedingIsin, 0.7) // 70% similarity threshold
      : new Map<string, { isin: string; similarity: number; method: string }>();
    
    console.log(`✅ Found ISINs for ${isinLookupMap.size} stocks via fuzzy matching`);
    
    let realizedSavedCount = 0;
    let realizedSkippedCount = 0;
    let olaElectricCount = 0;
    let isinFoundCount = 0;
    
    for (const realized of excelData.realizedProfitLoss) {
      // Check for Ola Electric specifically
      const isOlaElectric = String(realized.stockName || '').toLowerCase().includes('ola electric');
      if (isOlaElectric) {
        olaElectricCount++;
        console.log(`📊 Found Ola Electric realized P&L record #${olaElectricCount}:`, {
          stockName: realized.stockName,
          isin: realized.isin || 'MISSING',
          closedQty: realized.closedQty,
          sellDate: realized.sellDate,
        });
      }
      
      // IMPORTANT: Don't skip if ISIN is missing - use stock name as fallback
      // The new format might not have ISINs in Realized Profit-Loss sheet
      if (!realized.stockName || !realized.stockName.trim()) {
        console.log(`⚠️  Skipping realized P&L without stock name`);
        realizedSkippedCount++;
        continue;
      }

      try {
        // Step 3: Get ISIN from multiple sources (priority order):
        // 1. Direct ISIN from Excel (with correction for common errors like '0' vs 'O')
        // 2. Fuzzy match from StockMaster (if missing)
        let normalizedIsin = (realized.isin || '').trim().toUpperCase();
        
        // Fix common ISIN formatting issues (e.g., "INE0LXG01040" should be "INEOLXG01040")
        // This is common when Excel misreads the letter 'O' as the number '0'
        if (normalizedIsin && normalizedIsin.startsWith('INE') && normalizedIsin.length === 12) {
          const chars = normalizedIsin.split('');
          // Check if character at index 3 (4th character) is '0' 
          // In ISINs, this position is often the letter 'O' (e.g., INEOLXG01040)
          if (chars[3] === '0' && chars.length > 4) {
            // For Ola Electric specifically: "INE0LXG01040" should be "INEOLXG01040"
            if (normalizedIsin === 'INE0LXG01040') {
              normalizedIsin = 'INEOLXG01040';
              if (isOlaElectric) {
                console.log(`✅ Corrected Ola Electric ISIN during upload: ${normalizedIsin}`);
              }
            }
          }
        }
        
        // If ISIN is missing or still empty after correction, try fuzzy matching from StockMaster
        if (!normalizedIsin) {
          const stockNameKey = String(realized.stockName).trim().toLowerCase();
          const fuzzyMatch = isinLookupMap.get(stockNameKey);
          
          if (fuzzyMatch) {
            normalizedIsin = fuzzyMatch.isin.toUpperCase();
            isinFoundCount++;
            if (isOlaElectric) {
              console.log(`✅✅✅ Found ISIN for Ola Electric via fuzzy matching: ${normalizedIsin} (similarity: ${(fuzzyMatch.similarity * 100).toFixed(1)}%, method: ${fuzzyMatch.method})`);
            } else {
              console.log(`✅ Found ISIN for "${realized.stockName}" via fuzzy matching: ${normalizedIsin} (${(fuzzyMatch.similarity * 100).toFixed(1)}%)`);
            }
          } else {
            if (isOlaElectric) {
              console.warn(`⚠️  Could not find ISIN for Ola Electric via fuzzy matching`);
            }
          }
        }
        
        // For records without ISIN, we'll still save them and use stock name for grouping
        // Use a compound unique key: clientId + stockName + sellDate + buyDate + closedQty
        await RealizedProfitLoss.findOneAndUpdate(
          {
            clientId,
            stockName: String(realized.stockName || '').trim(),
            sellDate: realized.sellDate,
            buyDate: realized.buyDate,
            closedQty: realized.closedQty,
          },
          {
            stockName: String(realized.stockName || '').trim(),
            sectorName: String(realized.sectorName || '').trim() || 'Unknown',
            isin: normalizedIsin, // May be empty string
            closedQty: Number(realized.closedQty || 0),
            sellDate: realized.sellDate ? new Date(realized.sellDate) : new Date(),
            sellPrice: Number(realized.sellPrice || 0),
            sellValue: Number(realized.sellValue || 0),
            buyDate: realized.buyDate ? new Date(realized.buyDate) : new Date(),
            buyPrice: Number(realized.buyPrice || 0),
            buyValue: Number(realized.buyValue || 0),
            realizedProfitLoss: Number(realized.realizedProfitLoss || 0),
            clientId,
            lastUpdated: now,
          },
          { upsert: true, new: true, runValidators: true }
        );
        realizedSavedCount++;
        
        if (isOlaElectric) {
          console.log(`✅ Saved Ola Electric realized P&L record (ISIN: ${normalizedIsin || 'N/A'})`);
        }
      } catch (error: any) {
        console.error(`❌ Error saving realized P&L for ${realized.stockName}:`, error.message);
        if (isOlaElectric) {
          console.error(`❌ Ola Electric save error details:`, error);
        }
      }
    }
    console.log(`✅ Saved ${realizedSavedCount} realized P&L records (skipped ${realizedSkippedCount})`);
    console.log(`✅ Found ISINs via fuzzy matching for ${isinFoundCount} stocks`);
    if (olaElectricCount > 0) {
      console.log(`✅✅✅ Processed ${olaElectricCount} Ola Electric realized P&L records`);
    }
    
    // VERIFICATION: Ensure ALL parsed realized P&L records were saved
    console.log(`\n=== REALIZED P&L VERIFICATION ===`);
    console.log(`Total parsed from Excel: ${excelData.realizedProfitLoss.length}`);
    console.log(`Total saved to database: ${realizedSavedCount}`);
    console.log(`Total skipped: ${realizedSkippedCount}`);
    
    if (realizedSavedCount + realizedSkippedCount !== excelData.realizedProfitLoss.length) {
      console.error(`❌❌❌ COUNT MISMATCH! Some records were not processed!`);
      console.error(`   Expected: ${excelData.realizedProfitLoss.length}, Got: ${realizedSavedCount + realizedSkippedCount}`);
    }
    
    // Verify all unique stocks from Excel are in database
    const uniqueStocksInExcel = new Set(
      excelData.realizedProfitLoss
        .filter((r: any) => r.stockName && r.stockName.trim())
        .map((r: any) => String(r.stockName).trim().toLowerCase())
    );
    console.log(`Unique stocks in Excel realized P&L: ${uniqueStocksInExcel.size}`);
    
    // Query database to verify
    const dbRealizedPL = await RealizedProfitLoss.find({ clientId }).lean();
    const uniqueStocksInDB = new Set(
      dbRealizedPL
        .filter((r: any) => r.stockName && r.stockName.trim())
        .map((r: any) => String(r.stockName).trim().toLowerCase())
    );
    console.log(`Unique stocks in database: ${uniqueStocksInDB.size}`);
    
    // Check for missing stocks
    const missingStocks = Array.from(uniqueStocksInExcel).filter(
      stock => !uniqueStocksInDB.has(stock)
    );
    if (missingStocks.length > 0) {
      console.error(`❌❌❌ Missing ${missingStocks.length} stocks in database:`, missingStocks.slice(0, 10));
    } else {
      console.log(`✅ All unique stocks from Excel are in database!`);
    }
    
    // Specifically check Ola Electric
    const olaInDB = dbRealizedPL.filter((r: any) => 
      String(r.stockName || '').toLowerCase().includes('ola electric')
    );
    console.log(`Ola Electric records in database after upload: ${olaInDB.length}`);
    if (olaElectricCount > 0 && olaInDB.length === 0) {
      console.error(`❌❌❌ CRITICAL: ${olaElectricCount} Ola Electric records parsed but NONE in database!`);
    }

    // Update Unrealized Profit-Loss - Delete old records and insert new ones
    console.log(`\n=== UPDATING UNREALIZED P&L ===`);
    console.log(`Total unrealized P&L records to process: ${excelData.unrealizedProfitLoss.length}`);
    
    // First, delete all existing unrealized P&L for this client to ensure clean slate
    // Note: Unrealized P&L is typically calculated from current holdings, so we'll use holdings data
    // But if the Excel has an Unrealized P&L sheet, we should save it
    try {
      // Check if there's an UnrealizedProfitLoss model - if not, we'll just log it
      // For now, unrealized P&L is calculated from holdings, so we don't need a separate table
      // But we'll log the data for reference
      if (excelData.unrealizedProfitLoss.length > 0) {
        console.log(`Note: ${excelData.unrealizedProfitLoss.length} unrealized P&L records parsed from Excel`);
        console.log(`Unrealized P&L is calculated from current holdings, so these are for reference only.`);
        excelData.unrealizedProfitLoss.forEach((unrealized: any, idx: number) => {
          if (unrealized.isin) {
            console.log(`  ${idx + 1}. ${unrealized.stockName} (${unrealized.isin}) - Unrealized P/L: ${unrealized.totalUnrealizedProfitLoss}`);
          }
        });
      }
    } catch (error: any) {
      console.error('Error processing unrealized P&L:', error);
    }

    // Trigger stock data update for holdings
    const holdingsIsins = excelData.holdings.map(h => h.isin).filter(Boolean);
    if (holdingsIsins.length > 0) {
      // Run in background (non-blocking)
      updateDailyStockDataForHoldings(
        excelData.holdings.map(h => ({ isin: h.isin }))
      ).catch(console.error);
    }

    // Calculate counts for response
    const transactionsCount = excelData.transactions.length;
    const realizedCount = excelData.realizedProfitLoss.length;
    const unrealizedCount = excelData.unrealizedProfitLoss.length;
    
    const totalRecords = currentHoldingsFromExcel.length + transactionsCount + realizedCount + unrealizedCount;
    
    // FINAL VERIFICATION: Query database ONE MORE TIME right before response to ensure accuracy
    console.log(`\n=== FINAL PRE-RESPONSE VERIFICATION ===`);
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait longer for any pending writes
    let absoluteFinalHoldings = await Holding.find({ clientId }).lean();
    let absoluteFinalCount = absoluteFinalHoldings.length;
    
    console.log(`Absolute final holdings count: ${absoluteFinalCount}`);
    
    // Check for any missing holdings and try to save them
    const expectedIsinsAbsolute = new Set(currentHoldingsFromExcel.map(h => (h.isin || '').trim().toUpperCase()).filter(Boolean));
    const actualIsinsAbsolute = new Set(absoluteFinalHoldings.map((h: any) => (h.isin || '').trim().toUpperCase()).filter(Boolean));
    const missingIsinsAbsolute = Array.from(expectedIsinsAbsolute).filter(isin => !actualIsinsAbsolute.has(isin));
    
    if (missingIsinsAbsolute.length > 0) {
      console.error(`🚨🚨🚨 ${missingIsinsAbsolute.length} HOLDINGS MISSING IN FINAL CHECK!`);
      console.error(`   Missing ISINs:`, missingIsinsAbsolute);
      
      // Last resort: Try to save each missing holding using raw MongoDB
      for (const missingIsin of missingIsinsAbsolute) {
        const missingHolding = currentHoldingsFromExcel.find(h => (h.isin || '').trim().toUpperCase() === missingIsin);
        if (missingHolding) {
          console.error(`🚨 LAST RESORT: Attempting raw MongoDB save for ${missingHolding.stockName} (${missingIsin})`);
          try {
            const mongoose = await import('mongoose');
            const db = mongoose.default.connection.db;
            if (!db) {
              throw new Error('Database connection not available');
            }
            const holdingsCollection = db.collection('holdings');
            
            const finalRawData = {
              stockName: missingHolding.stockName || '',
              sectorName: missingHolding.sectorName || '',
              isin: missingIsin,
              portfolioPercentage: missingHolding.portfolioPercentage ?? 0,
              openQty: missingHolding.openQty ?? 0,
              marketPrice: missingHolding.marketPrice ?? 0,
              marketValue: missingHolding.marketValue ?? 0,
              investmentAmount: missingHolding.investmentAmount ?? 0,
              avgCost: missingHolding.avgCost ?? 0,
              profitLossTillDate: missingHolding.profitLossTillDate ?? 0,
              profitLossTillDatePercent: missingHolding.profitLossTillDatePercent ?? 0,
              clientId,
              clientName: excelData.clientName || '',
              asOnDate: excelData.asOnDate || new Date(),
              lastUpdated: new Date(),
            };
            
            // Delete and insert using raw driver
            await holdingsCollection.deleteMany({ clientId, isin: missingIsin });
            const rawInsert = await holdingsCollection.insertOne(finalRawData);
            console.error(`🚨 RAW INSERT SUCCESS for ${missingHolding.stockName}:`, rawInsert.insertedId);
            
            // Re-query using Mongoose and add to array
            await new Promise(resolve => setTimeout(resolve, 300));
            const verifyRaw = await Holding.findOne({ clientId, isin: missingIsin }).lean() as any;
            if (verifyRaw && !Array.isArray(verifyRaw)) {
              console.error(`✅✅✅ RAW INSERT VERIFIED! ${missingHolding.stockName} saved via raw MongoDB!`);
              absoluteFinalHoldings.push(verifyRaw);
              absoluteFinalHoldings = [...new Map(absoluteFinalHoldings.map((h: any) => [h.isin, h])).values()]; // Remove duplicates
              absoluteFinalCount = absoluteFinalHoldings.length;
            }
          } catch (rawError: any) {
            console.error(`❌❌❌ RAW INSERT FAILED for ${missingHolding.stockName}:`, rawError.message);
          }
        }
      }
    }
    
    // Use the absolute final query results
    let actualFinalHoldings = absoluteFinalHoldings;
    let actualFinalCount = absoluteFinalCount;
    
    // Build summary message
    // Calculate total unique stocks (current + historical)
    const totalUniqueStocks = currentHoldingsFromExcel.length;
    const currentHoldingsCount = currentHoldingsFromExcel.filter(h => (h.openQty || 0) > 0).length;
    const historicalHoldingsCount = currentHoldingsFromExcel.filter(h => (h.openQty || 0) <= 0 && (h.closedQty || 0) > 0).length;
    
    // Compare with database holdings count
    const dbHoldingsCount = absoluteFinalCount;
    const dbHoldings = absoluteFinalHoldings.map((h: any) => ({
      stockName: h.stockName,
      isin: h.isin,
      openQty: h.openQty,
    }));
    
    let summaryMessage = `Successfully processed portfolio file: ${currentHoldingsCount} current holdings`;
    if (historicalHoldingsCount > 0) {
      summaryMessage += `, ${historicalHoldingsCount} historical stocks (sold)`;
    }
    summaryMessage += ` (${totalUniqueStocks} unique stocks total)`;
    summaryMessage += `, ${transactionsCount} transactions, ${realizedCount} realized P/L, ${unrealizedCount} unrealized P/L (${totalRecords} records processed)`;
    
    // Add warning if database has different count than current holdings from Excel
    let warningMessage = '';
    if (dbHoldingsCount !== currentHoldingsCount) {
      warningMessage = `Warning: ${currentHoldingsCount} holdings processed but ${dbHoldingsCount} found in database (${totalRecords} records processed)`;
    }
    
    if (newStocksCount > 0) {
      summaryMessage += ` (+${newStocksCount} new)`;
    }
    if (updatedStocksCount > 0) {
      summaryMessage += ` (${updatedStocksCount} updated)`;
    }
    
    // Add warning if database has different count than current holdings from Excel
    if (dbHoldingsCount !== currentHoldingsCount) {
      summaryMessage += ` ⚠️ Warning: ${currentHoldingsCount} holdings processed but ${dbHoldingsCount} found in database`;
      if (duplicateIsins.length > 0) {
        summaryMessage += ` (${duplicateIsins.length} duplicate ISIN(s) detected)`;
      }
    } else if (duplicateIsins.length > 0) {
      summaryMessage += ` ⚠️ Warning: ${duplicateIsins.length} duplicate ISIN(s) found in Excel`;
    }
    
    // Final status log
    // Note: expectedCount should be currentHoldingsCount (only stocks with Open Qty > 0)
    // Historical stocks are tracked in RealizedProfitLoss, not in Holdings collection
    const expectedCount = currentHoldingsCount;
    if (actualFinalCount === expectedCount) {
      console.log(`✅✅✅ FINAL CHECK: All ${actualFinalCount} current holdings are in database!`);
      console.log(`   Total unique stocks from Excel: ${totalUniqueStocks} (${currentHoldingsCount} current + ${historicalHoldingsCount} historical)`);
    } else {
      console.error(`❌❌❌ FINAL CHECK: Only ${actualFinalCount}/${expectedCount} current holdings in database!`);
      console.error(`   Total unique stocks from Excel: ${totalUniqueStocks} (${currentHoldingsCount} current + ${historicalHoldingsCount} historical)`);
      // Only compare current holdings (Open Qty > 0) with database, not historical ones
      const currentHoldingsWithIsin = currentHoldingsFromExcel.filter(h => (h.openQty || 0) > 0 && normalizeIsin(h.isin));
      const expectedIsinsFinal = new Set(currentHoldingsWithIsin.map(h => normalizeIsin(h.isin)));
      const actualIsinsFinal = new Set(actualFinalHoldings.map((h: any) => normalizeIsin(h.isin)));
      const missingFinal = Array.from(expectedIsinsFinal).filter(isin => !actualIsinsFinal.has(isin));
      if (missingFinal.length > 0) {
        console.error(`   Missing ISINs:`, missingFinal);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: summaryMessage,
      count: totalRecords,
      parsingDetails: {
        holdingsParsed: excelData.holdings.length,
        holdingsFromExcel: currentHoldingsFromExcel.length,
        totalUniqueStocks: totalUniqueStocks,
        currentHoldingsCount: currentHoldingsCount,
        historicalHoldingsCount: historicalHoldingsCount,
        holdingsInDatabase: actualFinalCount, // Use actual final count
        olaElectricFound: {
          inParsedRealizedPL: !!excelData.realizedProfitLoss.find((r: any) => String(r.stockName || '').toLowerCase().includes('ola electric')),
          countInParsedRealizedPL: excelData.realizedProfitLoss.filter((r: any) => String(r.stockName || '').toLowerCase().includes('ola electric')).length,
          inDatabase: !!actualFinalHoldings.find((h: any) => String(h.stockName || '').toLowerCase().includes('ola electric')),
        },
        allIsins: excelData.holdings.map(h => h.isin),
        currentHoldingsIsins: currentHoldingsFromExcel.map(h => h.isin),
        databaseIsins: actualFinalHoldings.map((h: any) => h.isin), // Use actual final holdings
      },
      data: {
        holdings: currentHoldingsCount,
        totalUniqueStocks: totalUniqueStocks,
        historicalHoldings: historicalHoldingsCount,
        transactions: transactionsCount,
        realizedProfitLoss: realizedCount,
        unrealizedProfitLoss: unrealizedCount,
        newStocks: newStocksCount,
        updatedStocks: updatedStocksCount,
      },
      details: {
        fileName: file.name,
        fileSize: file.size,
        clientId: clientId,
        clientName: excelData.clientName,
        asOnDate: excelData.asOnDate,
      }
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process Excel file' },
      { status: 500 }
    );
  }
}


