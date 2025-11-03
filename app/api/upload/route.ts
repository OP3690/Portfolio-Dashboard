import { NextRequest, NextResponse } from 'next/server';
import { parseExcelFile, parseStockMasterFile } from '@/lib/excelParser';
import connectDB from '@/lib/mongodb';
import Holding from '@/models/Holding';
import Transaction from '@/models/Transaction';
import RealizedProfitLoss from '@/models/RealizedProfitLoss';
import StockMaster from '@/models/StockMaster';
import { updateDailyStockDataForHoldings } from '@/lib/stockDataService';
import { findISINsForStockNames } from '@/lib/isinMatcher';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Helper function to normalize ISIN (trim whitespace and uppercase)
function normalizeIsin(isin: string | null | undefined): string {
  if (!isin) return '';
  return String(isin).trim().toUpperCase();
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
  } catch (dbError: any) {
    console.error('Database connection error:', dbError);
    return NextResponse.json(
      { 
        success: false,
        error: 'Database connection failed. Please try again.' 
      },
      { status: 500 }
    );
  }

  try {
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

    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await file.arrayBuffer();
    } catch (bufferError: any) {
      console.error('Error reading file buffer:', bufferError);
      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to read file. Please ensure the file is not corrupted.' 
        },
        { status: 400 }
      );
    }

    if (fileType === 'stockMaster') {
      // Parse and save stock master data
      let stockMasterData;
      try {
        stockMasterData = parseStockMasterFile(arrayBuffer);
      } catch (parseError: any) {
        console.error('Error parsing stock master file:', parseError);
        return NextResponse.json(
          { 
            success: false,
            error: `Failed to parse stock master file: ${parseError.message || 'Invalid file format'}` 
          },
          { status: 400 }
        );
      }
      
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
    let excelData;
    try {
      excelData = parseExcelFile(arrayBuffer);
    } catch (parseError: any) {
      console.error('Error parsing Excel file:', parseError);
      return NextResponse.json(
        { 
          success: false,
          error: `Failed to parse Excel file: ${parseError.message || 'Invalid file format. Please ensure the file matches the expected format.'}` 
        },
        { status: 400 }
      );
    }
    
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
    
    // Excel already has ISINs - just normalize them (no lookup needed)
    console.log(`✅ Using ISINs directly from Excel (no lookup needed)...`);
    
    // Normalize ISINs from Excel and validate
    let validIsinCount = 0;
    let missingIsinCount = 0;
    
    currentHoldingsFromExcel = currentHoldingsFromExcel.map(h => {
      const existingIsin = normalizeIsin(h.isin);
      if (existingIsin && existingIsin.length >= 10) {
        // Valid ISIN (should be 12 characters, but accept 10+)
        validIsinCount++;
        return { ...h, isin: existingIsin }; // Ensure normalized ISIN
      } else {
        missingIsinCount++;
        console.warn(`  ⚠️  "${h.stockName}" has invalid/missing ISIN: "${h.isin}"`);
        return h;
      }
    });
    
    console.log(`   ✅ Valid ISINs: ${validIsinCount}`);
    if (missingIsinCount > 0) {
      console.log(`   ❌ Missing/Invalid ISINs: ${missingIsinCount}`);
    }
    
    // Pre-fetch old holdings for comparison (reused later)
    const oldHoldings = await Holding.find({ clientId }).lean();
    
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
    
    // Normalize ISINs from database for comparison (oldHoldings already fetched above)
    const oldIsins = new Set(oldHoldings.map(h => normalizeIsin(h.isin)).filter(Boolean));

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
    
    // OPTIMIZATION: Reuse oldHoldings (already fetched above) instead of querying again
    const allExistingHoldings = oldHoldings as any[];
    const existingHoldingsMap = new Map<string, any>();
    const variantIsinsToDelete = new Set<string>();
    
    // Build map of existing holdings by normalized ISIN and collect variants
    for (const existing of allExistingHoldings) {
      const normalizedExistingIsin = normalizeIsin(existing.isin);
      if (normalizedExistingIsin) {
        // If we already have this normalized ISIN, check if current is variant
        if (existingHoldingsMap.has(normalizedExistingIsin)) {
          // This is a variant - mark for deletion
          variantIsinsToDelete.add(existing._id.toString());
        } else {
          existingHoldingsMap.set(normalizedExistingIsin, existing);
          // Check if the stored ISIN format differs from normalized
          if (existing.isin !== normalizedExistingIsin) {
            variantIsinsToDelete.add(existing._id.toString());
            // Still add to map for comparison
            existingHoldingsMap.set(normalizedExistingIsin, existing);
          }
        }
      }
    }
    
    // Batch delete all variants at once
    if (variantIsinsToDelete.size > 0) {
      const variantIds = Array.from(variantIsinsToDelete).map(id => ({ _id: id }));
      await Holding.deleteMany({ _id: { $in: variantIds } });
      console.log(`🗑️  Deleted ${variantIsinsToDelete.size} variant holdings with duplicate ISINs`);
    }
    
    // Prepare bulk operations
    const bulkOps: any[] = [];
    // Note: 'now' is already defined earlier in the function (line 153)
    
    for (const holding of holdingsWithIsin) {
      const normalizedIsin = normalizeIsin(holding.isin); // Use helper function for consistency
      
      // Double-check ISIN is present (should never happen after filter, but safety check)
      if (!normalizedIsin || normalizedIsin === '') {
        console.error(`❌ ERROR: Holding has empty ISIN after filter: ${holding.stockName}`);
        continue;
      }
      // Removed BHEL-specific logging (it was just a test)
      
      // Get Excel values (handle both normalized and raw Excel column names)
      // IMPORTANT: The Excel parser normalizes column names, so holding.stockName should work
      // But we also check raw Excel column names as fallback
      const excelStockName = String(holding.stockName || holding['Stock Name'] || '').trim();
      const excelQty = Number(holding.openQty ?? holding['Open Qty'] ?? 0);
      const excelMarketPrice = Number(holding.marketPrice ?? holding['Market Price'] ?? 0);
      const excelMarketValue = Number(holding.marketValue ?? holding['Market Value'] ?? 0);
      const excelInvestmentAmount = Number(holding.investmentAmount ?? holding['Investment Amount'] ?? 0);
      const excelSectorName = String(holding.sectorName || holding['Sector Name'] || '').trim();
      
      // Use pre-fetched existing holdings map (no database query needed)
      const existing = existingHoldingsMap.get(normalizedIsin);

      if (!existing) {
        // New stock - add it
        newStocksCount++;
      } else {
        // Existing stock - check if data changed
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
        }
      }

      // Prepare holding data with defaults for ALL required fields
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
      
      // Validate critical fields
      if (!holdingToSave.isin || !holdingToSave.isin.trim()) {
        console.error(`❌ CRITICAL: Holding has no ISIN! Skipping:`, holdingToSave.stockName);
        failedSaves.push({ holding, error: 'Missing ISIN' });
        continue;
      }
      
      // Add to bulk operations array
      bulkOps.push({
        updateOne: {
          filter: { clientId, isin: normalizedIsin },
          update: { $set: holdingToSave },
          upsert: true,
        },
      });
      
      savedHoldings.push({ isin: normalizedIsin, stockName: holdingToSave.stockName });
    }
    
    // Execute bulk write operation (MUCH faster than individual queries)
    if (bulkOps.length > 0) {
      try {
        console.log(`\n💾 Executing bulk write for ${bulkOps.length} holdings...`);
        const bulkResult = await Holding.bulkWrite(bulkOps, { ordered: false });
        console.log(`✅ Bulk write completed: ${bulkResult.modifiedCount} updated, ${bulkResult.upsertedCount} inserted`);
        
        // Track actual saves vs failures
        const actualSaved = bulkResult.modifiedCount + bulkResult.upsertedCount;
        if (actualSaved < bulkOps.length) {
          console.warn(`⚠️  Warning: Only ${actualSaved} of ${bulkOps.length} holdings were saved`);
        }
      } catch (bulkError: any) {
        console.error(`❌ Bulk write error:`, bulkError.message);
        // Individual errors are in bulkError.writeErrors
        if (bulkError.writeErrors && bulkError.writeErrors.length > 0) {
          console.error(`   Failed operations: ${bulkError.writeErrors.length}`);
          bulkError.writeErrors.forEach((err: any, idx: number) => {
            const failedHolding = savedHoldings[idx];
            if (failedHolding) {
              failedSaves.push({ holding: { isin: failedHolding.isin, stockName: failedHolding.stockName }, error: err.errmsg || 'Bulk write error' });
            }
          });
        }
        // For partial failures, we continue - some may have succeeded
      }
    }
    
    // Log summary of saves
    console.log(`\n=== SAVE SUMMARY ===`);
    console.log(`✅ Processed ${savedHoldings.length} holdings`);
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
    
    // Simple verification - no excessive queries
    console.log(`\n✅ Holdings saved successfully via bulk write`);

    // Update Transactions - OPTIMIZED: Use bulk write instead of individual queries
    console.log(`\n=== UPDATING TRANSACTIONS ===`);
    const transactionBulkOps: any[] = [];
    
    for (const transaction of excelData.transactions) {
      if (!transaction.isin) continue;
      
      const normalizedIsin = normalizeIsin(transaction.isin);
      transactionBulkOps.push({
        updateOne: {
          filter: {
            clientId,
            isin: normalizedIsin,
            transactionDate: transaction.transactionDate,
            buySell: transaction.buySell,
            tradedQty: transaction.tradedQty,
          },
          update: {
            $set: {
              ...transaction,
              isin: normalizedIsin,
              clientId,
              lastUpdated: now,
            }
          },
          upsert: true,
        },
      });
    }
    
    let transactionsSavedCount = 0;
    if (transactionBulkOps.length > 0) {
      try {
        const Transaction = (await import('@/models/Transaction')).default;
        const transactionResult = await Transaction.bulkWrite(transactionBulkOps, { ordered: false });
        transactionsSavedCount = transactionResult.upsertedCount + transactionResult.modifiedCount;
        console.log(`✅ Processed ${transactionsSavedCount} transactions (${transactionResult.upsertedCount} inserted, ${transactionResult.modifiedCount} updated)`);
      } catch (error: any) {
        console.error(`Error in bulk transaction write:`, error.message);
      }
    } else {
      console.log(`✅ No transactions to process`);
    }

    // Update Realized Profit-Loss - OPTIMIZED: Use bulk write, use ISINs directly from Excel
    console.log(`\n=== UPDATING REALIZED P&L ===`);
    const realizedBulkOps: any[] = [];
    let realizedSkippedCount = 0;
    
    for (const realized of excelData.realizedProfitLoss) {
      if (!realized.stockName || !realized.stockName.trim()) {
        realizedSkippedCount++;
        continue;
      }

      // Use ISIN directly from Excel (no lookup needed)
      let normalizedIsin = normalizeIsin(realized.isin || '');
      
      // Fix common ISIN formatting issue for Ola Electric
      if (normalizedIsin === 'INE0LXG01040') {
        normalizedIsin = 'INEOLXG01040';
      }
      
      realizedBulkOps.push({
        updateOne: {
          filter: {
            clientId,
            stockName: String(realized.stockName || '').trim(),
            sellDate: realized.sellDate,
            buyDate: realized.buyDate,
            closedQty: realized.closedQty,
          },
          update: {
            $set: {
              stockName: String(realized.stockName || '').trim(),
              sectorName: String(realized.sectorName || '').trim() || 'Unknown',
              isin: normalizedIsin,
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
            }
          },
          upsert: true,
        },
      });
    }
    
    let realizedSavedCount = 0;
    if (realizedBulkOps.length > 0) {
      try {
        const realizedResult = await RealizedProfitLoss.bulkWrite(realizedBulkOps, { ordered: false });
        realizedSavedCount = realizedResult.upsertedCount + realizedResult.modifiedCount;
        console.log(`✅ Processed ${realizedSavedCount} realized P&L records (${realizedResult.upsertedCount} inserted, ${realizedResult.modifiedCount} updated, ${realizedSkippedCount} skipped)`);
      } catch (error: any) {
        console.error(`Error in bulk realized P&L write:`, error.message);
      }
    } else {
      console.log(`✅ No realized P&L records to process`);
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
    
    // Build summary message
    const totalUniqueStocks = currentHoldingsFromExcel.length;
    const currentHoldingsCount = currentHoldingsFromExcel.filter(h => (h.openQty || 0) > 0).length;
    const historicalHoldingsCount = currentHoldingsFromExcel.filter(h => (h.openQty || 0) <= 0 && (h.closedQty || 0) > 0).length;
    
    let summaryMessage = `Successfully processed portfolio file: ${currentHoldingsCount} current holdings`;
    if (historicalHoldingsCount > 0) {
      summaryMessage += `, ${historicalHoldingsCount} historical stocks (sold)`;
    }
    summaryMessage += ` (${totalUniqueStocks} unique stocks total)`;
    summaryMessage += `, ${transactionsSavedCount} transactions, ${realizedSavedCount} realized P/L`;
    
    return NextResponse.json({
      success: true,
      message: summaryMessage,
      count: currentHoldingsFromExcel.length + transactionsSavedCount + realizedSavedCount,
      parsingDetails: {
        holdingsParsed: excelData.holdings.length,
        holdingsFromExcel: currentHoldingsFromExcel.length,
        totalUniqueStocks: totalUniqueStocks,
        currentHoldingsCount: currentHoldingsCount,
        historicalHoldingsCount: historicalHoldingsCount,
      },
      data: {
        holdings: currentHoldingsCount,
        totalUniqueStocks: totalUniqueStocks,
        historicalHoldings: historicalHoldingsCount,
        transactions: transactionsSavedCount,
        realizedProfitLoss: realizedSavedCount,
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
    // Ensure we always return valid JSON, even for unexpected errors
    const errorMessage = error?.message || error?.toString() || 'Failed to process Excel file';
    
    // Handle specific error types
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid file format or corrupted file. Please check your Excel file.' 
        },
        { status: 400 }
      );
    }
    
    if (error instanceof TypeError) {
      return NextResponse.json(
        { 
          success: false,
          error: 'File processing error. Please ensure the file is a valid Excel file.' 
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { 
        success: false,
        error: errorMessage 
      },
      { status: 500 }
    );
  }
}


