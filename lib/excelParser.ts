import * as XLSX from 'xlsx';
import { format, parse } from 'date-fns';

export interface ExcelData {
  clientId: string;
  clientName: string;
  asOnDate: Date;
  holdings: any[];
  transactions: any[];
  realizedProfitLoss: any[];
  unrealizedProfitLoss: any[];
}

export function parseDate(dateStr: string | number | Date): Date {
  if (dateStr instanceof Date) return dateStr;
  if (typeof dateStr === 'number') {
    // Excel date serial number
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + dateStr * 24 * 60 * 60 * 1000);
  }
  if (typeof dateStr === 'string') {
    // Try different date formats
    const formats = ['dd-MM-yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy'];
    for (const fmt of formats) {
      try {
        return parse(dateStr, fmt, new Date());
      } catch (e) {
        continue;
      }
    }
    // Fallback to Date.parse
    const parsed = Date.parse(dateStr);
    if (!isNaN(parsed)) return new Date(parsed);
  }
  return new Date();
}

// Helper function to find header row and end row (blank row before "Disclaimer –")
function findSheetRange(sheet: XLSX.WorkSheet, maxRows: number = 500): { startRow: number; endRow: number | null } {
  let startRow = 10;
  let endRow: number | null = null;
  
  // Find header row (row with "Stock Name")
  for (let i = 0; i < 20; i++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: i, c: 1 })];
    if (cell && (cell.v === 'Stock Name' || cell.v === 'stockName' || String(cell.v).includes('Stock'))) {
      startRow = i;
      break;
    }
  }
  
  // Find "Disclaimer –" row, then find blank row before it
  // Structure: [data rows] -> [blank row (optional)] -> [Disclaimer –]
  for (let i = startRow + 1; i < maxRows; i++) {
    // Check if current row contains "Disclaimer" (check multiple columns)
    let foundDisclaimer = false;
    let disclaimerCol = -1;
    for (let col = 0; col < 10; col++) { // Check more columns
      const cell = sheet[XLSX.utils.encode_cell({ r: i, c: col })];
      if (cell && cell.v) {
        const val = String(cell.v).trim();
        if (val.toLowerCase().includes('disclaimer')) {
          foundDisclaimer = true;
          disclaimerCol = col;
          break;
        }
      }
    }
    
    if (foundDisclaimer) {
      console.log(`Found "Disclaimer" at Excel row ${i + 1} (0-based: ${i}), column ${disclaimerCol + 1}`);
      
      // Check if the row immediately before disclaimer (i-1) has data
      // We need to determine: is there a blank row, or does data go right up to disclaimer?
      let rowBeforeHasData = false;
      let hasAnyData = false;
      for (let col = 0; col < 20; col++) {
        const prevCell = sheet[XLSX.utils.encode_cell({ r: i - 1, c: col })];
        if (prevCell && prevCell.v !== null && prevCell.v !== undefined && String(prevCell.v).trim() !== '') {
          hasAnyData = true;
          // Check if it looks like a data row (has stock name or ISIN in typical columns)
          if (col === 1 || col === 3) { // Column B (stock name) or D (ISIN)
            rowBeforeHasData = true;
            break;
          }
        }
      }
      
      console.log(`  Row ${i - 1} (Excel row ${i}) - Has any data: ${hasAnyData}, Looks like data row: ${rowBeforeHasData}`);
      
      if (rowBeforeHasData && i - 1 > startRow) {
        // Pattern: [last data at i-1] -> [disclaimer at i] (no blank row between)
        // Last data row is at i-1 (0-indexed), which is Excel row i
        endRow = i - 1;
        console.log(`  → Pattern: [data at Excel row ${endRow + 1}] -> [disclaimer at Excel row ${i + 1}] (no blank row)`);
        console.log(`  → Last data row is at Excel row ${endRow + 1} (0-based: ${endRow})`);
      } else if (hasAnyData && i - 2 > startRow) {
        // Pattern: [last data at i-2] -> [blank/other at i-1] -> [disclaimer at i]
        // Last data row is at i-2
        endRow = i - 2;
        console.log(`  → Pattern: [data at Excel row ${endRow + 1}] -> [blank/other at Excel row ${i}] -> [disclaimer at Excel row ${i + 1}]`);
        console.log(`  → Last data row is at Excel row ${endRow + 1} (0-based: ${endRow})`);
      } else if (i - 1 > startRow) {
        // Fallback: assume i-1 is the last data row
        endRow = i - 1;
        console.log(`  → Fallback: Setting last data row to Excel row ${endRow + 1} (0-based: ${endRow})`);
      } else {
        // Edge case: disclaimer is right after header
        endRow = startRow;
        console.log(`  ⚠️  Warning: Disclaimer found immediately after header, setting endRow to ${endRow}`);
      }
      
      console.log(`  → Final: Will parse from Excel row ${startRow + 1} (header) to ${endRow + 1} (last data, inclusive)`);
      console.log(`  → Expected number of data rows: ${endRow - startRow} (Excel rows ${startRow + 2} to ${endRow + 1})`);
      break;
    }
  }
  
  return { startRow, endRow };
}

// Helper function to parse sheet data with proper range
function parseSheetData(sheet: XLSX.WorkSheet, range: { startRow: number; endRow: number | null }): any[] {
  if (!sheet) return [];
  
  const { startRow, endRow } = range;
  
  if (endRow !== null && endRow < startRow) {
    return []; // Invalid range
  }
  
  // IMPORTANT: When using XLSX.utils.sheet_to_json with a range:
  // - The first row in the range becomes the header row
  // - All subsequent rows in the range become data rows
  // - The range is INCLUSIVE of both start and end rows
  // So if header is at startRow and last data is at endRow, we need to include endRow in the range
  
  let data: any[];
  if (endRow !== null) {
    // Use range parameter to limit parsing
    // Range from startRow (header) to endRow (last data row), inclusive
    const rangeStr = XLSX.utils.encode_range({ s: { r: startRow, c: 0 }, e: { r: endRow, c: 20 } });
    console.log(`  Using range: ${rangeStr}`);
    console.log(`  Range covers Excel rows ${startRow + 1} (header) to ${endRow + 1} (last data), inclusive`);
    console.log(`  Expected data rows: ${endRow - startRow} (Excel rows ${startRow + 2} to ${endRow + 1})`);
    
    // Use header: 1 to use the first row as headers
    // This ensures column names are properly mapped
    data = XLSX.utils.sheet_to_json(sheet, { 
      range: rangeStr,
      defval: null,
      header: 1, // Array of arrays format for better control
      raw: false // Convert values to strings/dates
    });
    
    // Convert array-of-arrays to array-of-objects using first row as headers
    if (data.length > 0) {
      const headers = data[0] as string[];
      data = data.slice(1).map((row: any[]) => {
        const obj: any = {};
        headers.forEach((header, idx) => {
          const headerStr = String(header || '').trim();
          if (headerStr) {
            obj[headerStr] = row[idx];
          }
          // Also add by index for backward compatibility
          obj[idx] = row[idx];
        });
        return obj;
      });
    }
  } else {
    // No end row specified, parse from startRow to end of sheet
    data = XLSX.utils.sheet_to_json(sheet, { 
      range: startRow,
      defval: null,
      header: 1,
      raw: false
    });
    
    // Convert array-of-arrays to array-of-objects
    if (data.length > 0) {
      const headers = data[0] as string[];
      data = data.slice(1).map((row: any[]) => {
        const obj: any = {};
        headers.forEach((header, idx) => {
          const headerStr = String(header || '').trim();
          if (headerStr) {
            obj[headerStr] = row[idx];
          }
          obj[idx] = row[idx];
        });
        return obj;
      });
    }
  }
  
  console.log(`  sheet_to_json returned ${data.length} rows of data`);
  if (endRow !== null && data.length !== (endRow - startRow)) {
    console.warn(`  ⚠️  Expected ${endRow - startRow} data rows but got ${data.length} rows`);
  }
  
  return data;
}

// Helper function to aggregate multiple rows per stock in P&L_Equity_Statement sheet
function aggregatePLHoldings(rawData: any[]): any[] {
  const stockMap = new Map<string, any>();
  
  rawData.forEach((row: any) => {
    const stockName = String(row['Stock Name'] || '').trim();
    if (!stockName) return; // Skip empty rows
    
    // Skip disclaimer/header rows
    if (stockName.toLowerCase().includes('disclaimer') || 
        stockName.toLowerCase().includes('note:')) {
      return;
    }
    
    const openQty = parseFloat(row['Open Qty'] || row['openQty'] || 0);
    const closedQty = parseFloat(row['Closed Qty'] || row['closedQty'] || 0);
    const currentValue = parseFloat(row['Current Value'] || row['currentValue'] || 0);
    const amtInvested = parseFloat(row['Amt Invested'] || row['amtInvested'] || row['Investment Amount'] || 0);
    const unrealizedPL = parseFloat(row['Unrealized Profit/Loss'] || row['unrealizedProfitLoss'] || 0);
    const unrealizedPLPercent = parseFloat(row['% Unrealized Profit/Loss'] || row['unrealizedProfitLossPercent'] || 0);
    const realizedPL = parseFloat(row['Realized Profit/Loss'] || row['realizedProfitLoss'] || 0);
    const dividend = parseFloat(row['Dividend'] || row['dividend'] || 0);
    
    // Only process rows with Open Qty > 0 (current holdings) or Closed Qty > 0 (sold stocks)
    if (openQty <= 0 && closedQty <= 0) return;
    
    if (!stockMap.has(stockName)) {
      // First occurrence of this stock
      stockMap.set(stockName, {
        stockName,
        openQty: openQty,
        closedQty: closedQty,
        currentValue: currentValue,
        amtInvested: amtInvested,
        unrealizedProfitLoss: unrealizedPL,
        unrealizedProfitLossPercent: unrealizedPLPercent,
        realizedProfitLoss: realizedPL,
        dividend: dividend,
        rowCount: 1,
      });
    } else {
      // Aggregate with existing stock
      const existing = stockMap.get(stockName)!;
      existing.openQty += openQty;
      existing.closedQty += closedQty;
      existing.currentValue += currentValue;
      existing.amtInvested += amtInvested;
      existing.unrealizedProfitLoss += unrealizedPL;
      existing.realizedProfitLoss += realizedPL;
      existing.dividend += dividend;
      existing.rowCount += 1;
      
      // Recalculate unrealized PL percent if needed
      if (existing.amtInvested > 0) {
        existing.unrealizedProfitLossPercent = (existing.unrealizedProfitLoss / existing.amtInvested) * 100;
      }
    }
  });
  
  // Return ALL stocks (both current and historical)
  // Note: The upload route will handle filtering for current holdings vs historical
  // For now, we return all stocks so the user can see complete portfolio history
  const allStocks = Array.from(stockMap.values());
  
  // Log statistics
  const currentHoldings = allStocks.filter(h => h.openQty > 0);
  const historicalOnly = allStocks.filter(h => h.openQty <= 0 && h.closedQty > 0);
  
  console.log(`📊 Aggregated ${allStocks.length} unique stocks from P&L_Equity_Statement sheet:`);
  console.log(`   ✅ Current holdings (Open Qty > 0): ${currentHoldings.length}`);
  console.log(`   📤 Historical only (Closed Qty > 0, Open Qty = 0): ${historicalOnly.length}`);
  console.log(`   📋 Total unique stocks (all time): ${allStocks.length}`);
  
  // Return ALL stocks - don't filter by openQty
  // The upload route can decide whether to save historical stocks or not
  return allStocks;
}

export function parseExcelFile(buffer: ArrayBuffer): ExcelData {
  const workbook = XLSX.read(buffer, { type: 'array' });
  
  // Extract header info (assuming it's in the first sheet)
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const clientId = firstSheet['B4']?.v?.toString() || firstSheet['B3']?.v?.toString() || '994826';
  const clientName = firstSheet['B5']?.v?.toString() || firstSheet['B4']?.v?.toString() || '';
  
  // Try multiple date formats and locations
  // NEW FORMAT: "To Date" is at B7 (row 7, column 2)
  // OLD FORMAT: Date was at B6 or B7
  let asOnDateStr = firstSheet['B7']?.v?.toString() || firstSheet['B6']?.v?.toString() || firstSheet['B5']?.v?.toString() || '';
  let asOnDate = parseDate(asOnDateStr);
  
  // If date parsing failed, use today's date as fallback
  if (isNaN(asOnDate.getTime())) {
    asOnDate = new Date();
  }

  // Check for new format (P&L_Equity_Statement) or old format (Holdings)
  console.log('\n=== DETECTING EXCEL FILE FORMAT ===');
  console.log(`Sheet names found:`, workbook.SheetNames);
  
  const hasNewFormat = workbook.SheetNames.some(name => 
    name.toLowerCase().includes('p&l') || name.toLowerCase().includes('equity_statement') || name === 'P&L_Equity_Statement'
  );
  
  console.log(`Format detected: ${hasNewFormat ? 'NEW FORMAT (P&L_Equity_Statement)' : 'OLD FORMAT (Holdings)'}`);
  
  let holdingsData: any[] = [];
  
  if (hasNewFormat) {
    // NEW FORMAT: Parse P&L_Equity_Statement sheet
    const plSheet = workbook.Sheets['P&L_Equity_Statement'] || 
                    workbook.Sheets[workbook.SheetNames.find(name => 
                      name.toLowerCase().includes('p&l') || name.toLowerCase().includes('equity_statement')
                    ) || ''];
    
    console.log('\n=== PARSING P&L_EQUITY_STATEMENT SHEET (NEW FORMAT) ===');
    console.log(`Using sheet: "${Object.keys(workbook.Sheets).find(name => name.toLowerCase().includes('p&l') || name.toLowerCase().includes('equity_statement')) || 'NOT FOUND'}"`);
    
    if (plSheet) {
      // Header is at row 12 (0-indexed: 11) in new format
      const holdingsRange = findSheetRange(plSheet);
      console.log(`Header found at Excel row ${holdingsRange.startRow + 1} (0-based: ${holdingsRange.startRow})`);
      let rawHoldingsData = parseSheetData(plSheet, holdingsRange);
      console.log(`Parsed ${rawHoldingsData.length} raw rows from Excel`);
      
      // Aggregate multiple rows per stock
      holdingsData = aggregatePLHoldings(rawHoldingsData);
      console.log(`After aggregation: ${holdingsData.length} unique holdings`);
    } else {
      console.error('⚠️  P&L_Equity_Statement sheet not found!');
    }
  } else {
    // OLD FORMAT: Parse Holdings sheet
    const holdingsSheet = workbook.Sheets['Holdings'] || workbook.Sheets[workbook.SheetNames[0]];
    console.log('\n=== PARSING HOLDINGS SHEET (OLD FORMAT) ===');
    const holdingsRange = findSheetRange(holdingsSheet);
    console.log(`Header found at Excel row ${holdingsRange.startRow + 1} (0-based: ${holdingsRange.startRow})`);
    holdingsData = parseSheetData(holdingsSheet, holdingsRange);
    console.log(`Parsed ${holdingsData.length} raw rows from Excel`);
    console.log(`Expected data range: Excel row ${holdingsRange.startRow + 1} to ${holdingsRange.endRow !== null ? holdingsRange.endRow + 1 : 'end'}`);
    
    // Safety check: If we got exactly 20 rows but there might be 21, try extending by one row
    if (holdingsData.length === 20 && holdingsRange.endRow !== null) {
      console.log(`  ⚠️  Got exactly 20 rows, checking if we should extend by one row...`);
      // Check if the next row (after endRow) has data
      const nextRow = holdingsRange.endRow + 1;
      let nextRowHasData = false;
      for (let col = 0; col < 10; col++) {
        const cell = holdingsSheet[XLSX.utils.encode_cell({ r: nextRow, c: col })];
        if (cell && cell.v) {
          const val = String(cell.v).trim();
          // Check if it looks like a stock (has ISIN format or stock name)
          if (val.match(/^INE\d{10}$/i) || (col === 1 && val.length > 0)) { // Column B (stock name) or ISIN format
            nextRowHasData = true;
            console.log(`  ✅ Found data in next row (Excel row ${nextRow + 1}): "${val}"`);
            break;
          }
        }
      }
      
      if (nextRowHasData) {
        console.log(`  🔧 Extending range to include Excel row ${nextRow + 1}`);
        const extendedRange = { startRow: holdingsRange.startRow, endRow: nextRow };
        holdingsData = parseSheetData(holdingsSheet, extendedRange);
        console.log(`  ✅ After extension: Parsed ${holdingsData.length} raw rows from Excel`);
      }
    }
  }

  // Parse Transaction Details sheet
  console.log('\n=== PARSING TRANSACTION DETAILS SHEET ===');
  const transactionSheetName = workbook.SheetNames.find(name => 
    name.toLowerCase().includes('transaction') || name.toLowerCase().includes('transaction details')
  );
  console.log(`Looking for Transaction Details sheet. Found: "${transactionSheetName || 'NOT FOUND'}"`);
  
  const transactionsSheet = workbook.Sheets['Transaction Details'] || 
                           (transactionSheetName ? workbook.Sheets[transactionSheetName] : null);
  
  if (!transactionsSheet) {
    console.warn(`⚠️  Transaction Details sheet not found! Available sheets: ${workbook.SheetNames.join(', ')}`);
  }
  
  const transactionsRange = transactionsSheet ? findSheetRange(transactionsSheet) : { startRow: 10, endRow: null };
  const transactionsData = parseSheetData(transactionsSheet, transactionsRange);
  console.log(`Parsed Transactions: header at row ${transactionsRange.startRow + 1}, data ends at row ${transactionsRange.endRow !== null ? transactionsRange.endRow + 1 : 'end'}, total rows: ${transactionsData.length}`);
  
  // Check for Ola Electric in transactions
  const olaInTransactions = transactionsData.filter((t: any) => 
    String(t['Stock Name'] || '').toLowerCase().includes('ola electric')
  );
  if (olaInTransactions.length > 0) {
    console.log(`✅ Found ${olaInTransactions.length} Ola Electric transactions`);
    olaInTransactions.slice(0, 3).forEach((t: any, i: number) => {
      console.log(`  ${i + 1}. "${t['Stock Name']}" - ISIN: ${t['ISIN'] || 'MISSING'}, Buy/Sell: ${t['Buy/Sell']}`);
    });
  }

  // Parse Realized Profit-Loss sheet
  console.log('\n=== PARSING REALIZED PROFIT-LOSS SHEET ===');
  const realizedSheetName = workbook.SheetNames.find(name => 
    name.toLowerCase().includes('realized') || name.toLowerCase().includes('realized profit')
  );
  console.log(`Looking for Realized Profit-Loss sheet. Found: "${realizedSheetName || 'NOT FOUND'}"`);
  
  const realizedSheet = workbook.Sheets['Realized Profit-Loss'] || 
                       (realizedSheetName ? workbook.Sheets[realizedSheetName] : null);
  
  if (!realizedSheet) {
    console.warn(`⚠️  Realized Profit-Loss sheet not found! Available sheets: ${workbook.SheetNames.join(', ')}`);
  }
  
  const realizedRange = realizedSheet ? findSheetRange(realizedSheet) : { startRow: 10, endRow: null };
  const realizedData = parseSheetData(realizedSheet, realizedRange);
  console.log(`Parsed Realized P/L: header at row ${realizedRange.startRow + 1}, data ends at row ${realizedRange.endRow !== null ? realizedRange.endRow + 1 : 'end'}, total rows: ${realizedData.length}`);
  
  // Check for Ola Electric in raw realized data BEFORE normalization
  const olaInRealizedRaw = realizedData.filter((r: any) => 
    String(r['Stock Name'] || r['stockName'] || '').toLowerCase().includes('ola electric')
  );
  if (olaInRealizedRaw.length > 0) {
    console.log(`✅ Found ${olaInRealizedRaw.length} Ola Electric rows in RAW realized P/L data (before normalization)`);
    olaInRealizedRaw.slice(0, 5).forEach((r: any, i: number) => {
      console.log(`  ${i + 1}. Stock: "${r['Stock Name'] || r['stockName']}" - Closed Qty: ${r['Closed Qty'] || r['closedQty']}, ISIN: ${r['ISIN'] || r['isin'] || 'MISSING'}`);
    });
  } else {
    console.warn(`⚠️  No Ola Electric found in RAW realized P/L data (total raw rows: ${realizedData.length})`);
    // Show first few rows for debugging
    if (realizedData.length > 0) {
      console.log(`  First 3 rows:`, realizedData.slice(0, 3).map((r: any) => ({
        stockName: r['Stock Name'] || r['stockName'] || 'NO NAME',
        closedQty: r['Closed Qty'] || r['closedQty'] || 0,
      })));
    }
  }

  // Parse Unrealized Profit-Loss sheet
  const unrealizedSheet = workbook.Sheets['Unrealized Profit-Loss'] || workbook.Sheets[workbook.SheetNames.find(name => name.toLowerCase().includes('unrealized')) || ''];
  const unrealizedRange = unrealizedSheet ? findSheetRange(unrealizedSheet) : { startRow: 10, endRow: null };
  const unrealizedData = parseSheetData(unrealizedSheet, unrealizedRange);
  console.log(`Parsed Unrealized P/L: header at row ${unrealizedRange.startRow + 1}, data ends at row ${unrealizedRange.endRow !== null ? unrealizedRange.endRow + 1 : 'end'}, total rows: ${unrealizedData.length}`);

  // Build ISIN lookup map from Transaction Details (for new format where ISIN is not in P&L sheet)
  // NOTE: In the new format, Transaction Details sheet might NOT have an ISIN column at all
  // We'll build a map from Transaction Details, but if it's empty, we'll rely on:
  // 1. Existing holdings in database (handled in upload route)
  // 2. Fuzzy matching from StockMaster (handled in upload route)
  const stockNameToIsin = new Map<string, string>();
  let transactionsWithIsin = 0;
  let transactionsWithoutIsin = 0;
  
  transactionsData.forEach((t: any) => {
    const stockName = String(t['Stock Name'] || t['stockName'] || '').trim();
    if (!stockName) return;
    
    // Try to find ISIN in the transaction row
    let isin = String(t['ISIN'] || t['isin'] || '').trim();
    
    // If ISIN field is empty or looks like a date (common when ISIN column is missing), 
    // search all values in the row for a valid ISIN format
    if (!isin || isin.match(/^\d{2}-\d{2}-\d{4}$/) || !isin.match(/^INE\d{10}$/i)) {
      // Search all properties for a valid ISIN format
      for (const key in t) {
        const value = String(t[key] || '').trim();
        if (value.match(/^INE\d{10}$/i)) {
          isin = value.toUpperCase();
          break;
        }
      }
    }
    
    // Only add to map if we found a valid ISIN
    if (isin && isin.match(/^INE\d{10}$/i)) {
      const stockNameLower = stockName.toLowerCase();
      if (!stockNameToIsin.has(stockNameLower)) {
        stockNameToIsin.set(stockNameLower, isin.toUpperCase());
        transactionsWithIsin++;
      }
    } else {
      transactionsWithoutIsin++;
    }
  });
  
  console.log(`Built ISIN lookup map from transactions: ${stockNameToIsin.size} stock names mapped to ISINs`);
  console.log(`  Transactions with ISIN: ${transactionsWithIsin}, without ISIN: ${transactionsWithoutIsin}`);
  if (stockNameToIsin.size > 0) {
    console.log(`Sample mappings:`, Array.from(stockNameToIsin.entries()).slice(0, 10));
  } else {
    console.warn(`⚠️  WARNING: No ISINs found in Transaction Details sheet!`);
    console.warn(`   This is expected for the new format. ISINs will be looked up from:`);
    console.warn(`   1. Existing holdings in database`);
    console.warn(`   2. Fuzzy matching from StockMaster collection`);
  }

  // Normalize column names and filter out invalid rows
  console.log(`Processing ${holdingsData.length} raw holdings rows from Excel`);
  console.log(`Stock name to ISIN map size: ${stockNameToIsin.size}`);
  if (stockNameToIsin.size > 0) {
    console.log(`Sample ISIN mappings:`, Array.from(stockNameToIsin.entries()).slice(0, 5));
  }
  
  const normalizeHoldings = holdingsData
    .map((row: any, index: number) => {
      // IMPORTANT: After aggregation, row structure is different:
      // - Aggregated data (from aggregatePLHoldings) has camelCase: stockName, openQty, closedQty, etc.
      // - Raw Excel data (old format) has Excel column names: 'Stock Name', 'Open Qty', etc.
      // Check which format we're dealing with
      const isAggregatedData = row.stockName !== undefined;
      
      const stockName = isAggregatedData 
        ? String(row.stockName || '').trim()
        : String(row['Stock Name'] || row['stockName'] || '').trim();
      
      // For new format: ISIN might not be in P&L sheet, extract from Transaction Details
      // IMPORTANT: In the new format, there's NO ISIN column in P&L_Equity_Statement sheet
      // We MUST look it up from Transaction Details using stock name
      let isin = isAggregatedData
        ? String(row.isin || '').trim()
        : String(row['ISIN'] || row['isin'] || '').trim();
      
      // If ISIN is missing (which is expected in new format), look it up from Transaction Details
      // NOTE: In the new format, Transaction Details might not have ISINs, so this might be empty
      // The upload route will handle ISIN lookup from database and fuzzy matching
      if ((!isin || isin === '0' || isin === '') && stockName) {
        // Try exact match first (case-insensitive)
        const stockNameLower = stockName.toLowerCase().trim();
        isin = stockNameToIsin.get(stockNameLower) || '';
        
        // If still not found, try case-insensitive match (already done above, but keep for clarity)
        if (!isin) {
          for (const [mappedName, mappedIsin] of stockNameToIsin.entries()) {
            if (mappedName.toLowerCase().trim() === stockNameLower) {
              isin = mappedIsin;
              break;
            }
          }
        }
        
        if (isin) {
          console.log(`✅ Found ISIN for "${stockName}" from Transaction Details: ${isin}`);
        } else {
          // Don't log warning for every stock - it's expected in new format
          // ISIN will be looked up in upload route from database and StockMaster
        }
      }
      
      // Handle both aggregated data format and raw Excel column names
      const openQty = isAggregatedData
        ? parseFloat(row.openQty || 0)
        : parseFloat(row['Open Qty'] || row['openQty'] || 0);
      
      const closedQty = isAggregatedData
        ? parseFloat(row.closedQty || 0)
        : parseFloat(row['Closed Qty'] || row['closedQty'] || 0);
      
      const marketValue = isAggregatedData
        ? parseFloat(row.currentValue || 0)
        : parseFloat(row['Market Value'] || row['marketValue'] || row['Current Value'] || row['currentValue'] || 0);
      
      const investmentAmount = isAggregatedData
        ? parseFloat(row.amtInvested || 0)
        : parseFloat(row['Investment Amount'] || row['investmentAmount'] || row['Amt Invested'] || row['amtInvested'] || 0);
      
      const marketPrice = openQty > 0 ? marketValue / openQty : 0;
      const avgCost = openQty > 0 ? investmentAmount / openQty : 0;
      
      const profitLossTillDate = isAggregatedData
        ? parseFloat(row.unrealizedProfitLoss || 0)
        : parseFloat(row['Profit/Loss Till date'] || row['profitLossTillDate'] || row['Unrealized Profit/Loss'] || row['unrealizedProfitLoss'] || 0);
      
      const profitLossTillDatePercent = isAggregatedData
        ? parseFloat(row.unrealizedProfitLossPercent || 0)
        : parseFloat(row['Profit/Loss Till date %'] || row['profitLossTillDatePercent'] || row['% Unrealized Profit/Loss'] || row['unrealizedProfitLossPercent'] || 0);
      
      // Log each row for debugging
      console.log(`  Parsed Row ${index}: StockName="${stockName}", ISIN="${isin}", Qty=${openQty}`);
      
      // Specifically check for BHEL
      if (isin === 'INE257A01026' || stockName.toLowerCase().includes('bhel')) {
        console.log(`  ✅ FOUND BHEL at parsed index ${index}: StockName="${stockName}", ISIN="${isin}", Qty=${openQty}`);
      }
      
      // Skip rows that are clearly not stock data (completely empty rows)
      if (!stockName || stockName === '') {
        return null;
      }
      
      // Skip disclaimer/header rows
      if (stockName.toLowerCase().includes('disclaimer') || stockName.toLowerCase().includes('note:')) {
        return null;
      }
      
      // For new format: Include ALL stocks (both current and historical)
      // Current holdings: Open Qty > 0
      // Historical holdings: Closed Qty > 0, Open Qty = 0 (sold stocks)
      // Stocks with both: Open Qty > 0 AND Closed Qty > 0 (partially sold)
      // NOTE: ISIN might be missing - that's OK, it will be looked up in upload route
      // For old format: Include all holdings with valid stockName and ISIN
      // closedQty is already extracted above (line 519-521), so use it directly
      
      if (hasNewFormat) {
        // Include stocks with either Open Qty > 0 OR Closed Qty > 0 (both current and historical)
        // This ensures we capture all unique stocks the user has ever held
        if (openQty <= 0 && closedQty <= 0) {
          return null; // Skip only if both are zero
        }
      }
      
      if (!hasNewFormat && !isin) {
        return null; // Old format: require ISIN
      }
      
      // For new format: ISIN can be empty - it will be looked up later
      // But we still need a valid stock name
      
      // Sector name (not available in aggregated data, but might be in raw Excel)
      const sectorName = isAggregatedData
        ? (row.sectorName || '').toString().trim()
        : (row['Sector Name'] || row['sectorName'] || '').toString().trim();
      
      // Portfolio percentage (not available in aggregated data, but might be in raw Excel)
      const portfolioPercentage = isAggregatedData
        ? parseFloat(row.portfolioPercentage || 0)
        : parseFloat(row['% of Total Portfolio'] || row['portfolioPercentage'] || 0);
      
      return {
        stockName: stockName,
        sectorName: sectorName,
        isin: isin,
        portfolioPercentage: portfolioPercentage,
        openQty: openQty,
        closedQty: closedQty, // Include closed quantity for historical tracking
        marketPrice: marketPrice,
        marketValue: marketValue,
        investmentAmount: investmentAmount,
        avgCost: avgCost,
        profitLossTillDate: profitLossTillDate,
        profitLossTillDatePercent: profitLossTillDatePercent,
      };
    })
    .filter((row: any) => {
      // Filter out null rows and rows without stock name
      if (!row || !row.stockName || row.stockName.trim() === '') {
        return false;
      }
      
      // For new format: only require stockName (ISIN will be looked up from database or StockMaster)
      // For old format: require both stockName and ISIN
      if (hasNewFormat) {
        // New format: Accept if stock name exists (ISIN can be empty - will be looked up in upload route)
        // IMPORTANT: Include ALL stocks (both current with Open Qty > 0 and historical with Closed Qty > 0)
        // The user wants to track complete portfolio history
        const hasValidStockName = row.stockName && row.stockName.trim() !== '';
        const hasOpenQty = row.openQty > 0;
        const hasClosedQty = row.closedQty > 0; // Historical stocks that have been sold
        
        if (!hasValidStockName) {
          return false;
        }
        
        // Include stocks with either Open Qty > 0 (current) OR Closed Qty > 0 (historical)
        // This ensures we capture all unique stocks the user has ever held
        const shouldInclude = hasOpenQty || hasClosedQty;
        
        if (!shouldInclude) {
          console.log(`  ⚠️  Skipping "${row.stockName}" - both Open Qty and Closed Qty are zero`);
          return false;
        }
        
        // Log holdings without ISIN for debugging
        if (!row.isin || row.isin.trim() === '') {
          const status = hasOpenQty ? 'CURRENT' : 'HISTORICAL';
          console.log(`  📝 ${status} holding without ISIN (will be looked up): "${row.stockName}" (Open: ${row.openQty}, Closed: ${row.closedQty})`);
        }
        
        return hasValidStockName && shouldInclude;
      } else {
        return row.isin && row.isin.trim() !== ''; // Old format: require ISIN
      }
    });
  
  console.log(`After normalization: ${normalizeHoldings.length} valid holdings`);
  console.log('\nNormalized holdings list:');
  normalizeHoldings.forEach((h: any, idx: number) => {
    console.log(`  ${idx + 1}. ${h.stockName} (${h.isin}) - Qty: ${h.openQty}`);
    // Check for BHEL
    if (h.isin === 'INE257A01026' || h.stockName.toLowerCase().includes('bhel')) {
      console.log(`    ✅ BHEL found in normalized holdings at index ${idx + 1}`);
    }
  });
  
  // Check if BHEL is missing
  const bhelFound = normalizeHoldings.find((h: any) => h.isin === 'INE257A01026' || h.stockName.toLowerCase().includes('bhel'));
  if (!bhelFound && holdingsData.length >= 21) {
    console.warn(`  ⚠️  WARNING: Expected 21 holdings but BHEL (INE257A01026) is missing after normalization!`);
    console.warn(`  Last parsed raw row was:`, holdingsData[holdingsData.length - 1]);
  }
  
  console.log('=== END HOLDINGS PARSING ===\n');

  const normalizeTransactions = transactionsData
    .map((row: any) => {
      const stockName = row['Stock Name'] || row['stockName'] || '';
      const isin = row['ISIN'] || row['isin'] || '';
      
      // Skip invalid rows
      if (!stockName || !isin) {
        return null;
      }
      
      // Skip disclaimer/header rows
      if (typeof stockName === 'string' && (
        stockName.toLowerCase().includes('disclaimer') ||
        stockName.toLowerCase().includes('note:')
      )) {
        return null;
      }
      
      return {
        stockName: stockName,
        sectorName: row['Sector Name'] || row['sectorName'] || '',
        isin: isin,
        transactionDate: parseDate(row['Transaction Date'] || row['transactionDate'] || ''),
        source: row['Source'] || row['source'] || '',
        buySell: row['Buy/Sell'] || row['buySell'] || '',
        tradedQty: parseFloat(row['Traded Qty'] || row['tradedQty'] || 0),
        tradePriceAdjusted: parseFloat(row['Trade Price (Adjusted)'] || row['tradePriceAdjusted'] || 0),
        charges: parseFloat(row['Charges'] || row['charges'] || 0),
        tradeValueAdjusted: parseFloat(row['Trade Value (Adjusted)'] || row['tradeValueAdjusted'] || 0),
      };
    })
    .filter((row: any) => row !== null && row.isin && row.stockName);

  // Build ISIN lookup for realized P&L (same as for holdings)
  // For new format: ISIN might not be in Realized Profit-Loss sheet
  const normalizedRealized = realizedData.map((row: any, index: number) => {
    // Try multiple column name variations to handle different Excel formats
    // Also try by index for formats where headers aren't recognized
    const stockName = String(
      row['Stock Name'] || 
      row['stockName'] || 
      row['Company'] ||
      row['company'] ||
      row[1] || // Column B (index 1)
      ''
    ).trim();
    
    // For new format: ISIN might not be in Realized Profit-Loss sheet, extract from Transaction Details
    // Also try by index (Column D, index 3)
    let isin = String(
      row['ISIN'] || 
      row['isin'] || 
      row['ISIN Code'] ||
      row['Identifier'] ||
      row[3] || // Column D (index 3) - ISIN column
      ''
    ).trim();
    
    // Fix common ISIN formatting issues (e.g., "INE0LXG01040" should be "INEOLXG01040")
    // Check if it looks like an ISIN with a digit where 'O' should be
    // This is common when Excel misreads the letter 'O' as the number '0'
    if (isin && isin.startsWith('INE') && isin.length === 12) {
      const chars = isin.split('');
      // Check if character at index 3 (4th character) is '0' 
      // In ISINs, this position is often the letter 'O' (e.g., INEOLXG01040)
      if (chars[3] === '0' && chars.length > 4) {
        // Check if the pattern matches known ISIN formats where 'O' is expected
        // Pattern: INE + O + ... (common in many ISINs)
        // Replace the '0' with 'O' for common patterns
        const potentialCorrectedIsin = chars.slice(0, 3).join('') + 'O' + chars.slice(4).join('');
        console.log(`  🔧 Potential ISIN correction: "${isin}" -> "${potentialCorrectedIsin}" (replaced '0' with 'O' at position 3)`);
        // For Ola Electric specifically: "INE0LXG01040" should be "INEOLXG01040"
        if (isin === 'INE0LXG01040') {
          isin = 'INEOLXG01040';
          console.log(`  ✅ Corrected Ola Electric ISIN: ${isin}`);
        }
      }
    }
    
    // If ISIN is missing or invalid, try to find from Transaction Details by stock name match
    if ((!isin || isin === '0' || isin === '') && stockName) {
      const stockNameLower = stockName.toLowerCase().trim();
      // Try exact match
      isin = stockNameToIsin.get(stockNameLower) || '';
      
      // If still not found, try case-insensitive match
      if (!isin) {
        for (const [mappedName, mappedIsin] of stockNameToIsin.entries()) {
          if (mappedName.toLowerCase().trim() === stockNameLower) {
            isin = mappedIsin;
            break;
          }
        }
      }
    }
    
    // Extract closed quantity (might be labeled differently in different formats)
    // For the "Holding_equity_open" format, the column is "Closed Qty" (Column E, index 4)
    let closedQty = parseFloat(
      String(row['Closed Qty'] || 
      row['closedQty'] || 
      row['ClosedQty'] ||
      row['Quantity'] ||
      row['quantity'] ||
      row['Qty'] ||
      row['qty'] ||
      row[4] || // Column E (index 4) - Quantity column
      0).replace(/,/g, '') // Remove commas
    );
    
    // If closedQty is 0 but we have a Quantity field, use it
    if (closedQty === 0 || isNaN(closedQty)) {
      closedQty = parseFloat(String(row['Quantity'] || row['quantity'] || row['Qty'] || row['qty'] || row[4] || 0).replace(/,/g, ''));
    }
    
    // Extract dates (handle different date formats)
    // For "Holding_equity_open" format:
    // - Buy Date is in Column F (index 5) - "Date 1" 
    // - Sell Date is in Column I (index 8) - "Date 2"
    // For "Holding_equity_open" format:
    // - Buy Date is in Column F (index 5)
    // - Sell Date is in Column I (index 8)
    let sellDateStr = String(
      row['Sell Date'] || 
      row['sellDate'] || 
      row['SellDate'] ||
      row['Date 2'] ||
      row['Sell Date (Date 2)'] ||
      row[8] || // Column I (index 8) - Sell Date
      ''
    ).trim();
    
    let buyDateStr = String(
      row['Buy Date'] || 
      row['buyDate'] || 
      row['BuyDate'] ||
      row['Date 1'] ||
      row['Buy Date (Date 1)'] ||
      row[5] || // Column F (index 5) - Buy Date
      ''
    ).trim();
    
    // Try to parse dates - handle DD-MM-YYYY format common in Indian Excel files
    const sellDate = parseDate(sellDateStr);
    const buyDate = parseDate(buyDateStr);
    
    // Log Ola Electric dates for debugging
    if (stockName.toLowerCase().includes('ola electric')) {
      console.log(`  📅 Ola Electric dates: buyDateStr="${buyDateStr}" (parsed: ${buyDate}), sellDateStr="${sellDateStr}" (parsed: ${sellDate})`);
    }
    
    // Extract prices and values
    // For "Holding_equity_open" format:
    // - Buy Price is in Column G (index 6) - "Value 1"
    // - Sell Price is in Column J (index 9) - "Value 3"
    // - Buy Value is in Column H (index 7) - "Value 2"
    // - Sell Value is in Column K (index 10) - "Value 4"
    // - Realized P/L is in Column L (index 11)
    const sellPrice = parseFloat(
      String(row['Sell Price'] || 
      row['sellPrice'] || 
      row['SellPrice'] ||
      row['Value 3'] ||
      row[9] || // Column J (index 9) - Sell Price
      0).replace(/,/g, '')
    );
    
    const sellValue = parseFloat(
      String(row['Sell Value'] || 
      row['sellValue'] || 
      row['SellValue'] ||
      row['Value 4'] ||
      row[10] || // Column K (index 10) - Sell Value
      0).replace(/,/g, '')
    );
    
    const buyPrice = parseFloat(
      String(row['Buy Price'] || 
      row['buyPrice'] || 
      row['BuyPrice'] ||
      row['Value 1'] ||
      row[6] || // Column G (index 6) - Buy Price
      0).replace(/,/g, '')
    );
    
    const buyValue = parseFloat(
      String(row['Buy Value'] || 
      row['buyValue'] || 
      row['BuyValue'] ||
      row['Value 2'] ||
      row[7] || // Column H (index 7) - Buy Value
      0).replace(/,/g, '')
    );
    
    const realizedProfitLoss = parseFloat(
      String(row['Realized Profit/Loss'] || 
      row['realizedProfitLoss'] || 
      row['Realized Profit-Loss'] ||
      row['RealizedPL'] ||
      row['Realized P/L'] ||
      row['Profit/Loss'] ||
      row[11] || // Column L (index 11) - Realized Profit/Loss
      0).replace(/,/g, '')
    );
    
    // Log Ola Electric for debugging
    if (stockName.toLowerCase().includes('ola electric')) {
      console.log(`  🔍 Ola Electric row ${index + 1}: stockName="${stockName}", isin="${isin}", closedQty=${closedQty}, realizedPL=${realizedProfitLoss}`);
    }
    
    return {
      stockName: stockName,
      sectorName: String(
        row['Sector Name'] || 
        row['sectorName'] || 
        row['Category'] ||
        row['category'] ||
        row['Type'] ||
        row[2] || // Column C (index 2) - Sector Name/Category
        ''
      ).trim(),
      isin: isin,
      closedQty: closedQty,
      sellDate: sellDate,
      sellPrice: sellPrice,
      sellValue: sellValue,
      buyDate: buyDate,
      buyPrice: buyPrice,
      buyValue: buyValue,
      realizedProfitLoss: realizedProfitLoss,
      typeOfProfitLoss: String(
        row['Type of Profit/Loss'] || 
        row['typeOfProfitLoss'] || 
        row['Type'] ||
        ''
      ).trim(),
    };
  });
  
  // Filter out invalid rows (must have stockName and closedQty > 0)
  console.log(`\n=== FILTERING REALIZED P/L DATA ===`);
  console.log(`Total rows before filtering: ${normalizedRealized.length}`);
  
  const normalizeRealized = normalizedRealized.filter((r: any) => {
    const hasStockName = r.stockName && r.stockName.trim() !== '';
    const hasClosedQty = r.closedQty > 0;
    const isValid = hasStockName && hasClosedQty;
    
    // Log Ola Electric filtering
    if (r.stockName && r.stockName.toLowerCase().includes('ola electric')) {
      console.log(`  🔍 Ola Electric row: stockName="${r.stockName}", closedQty=${r.closedQty}, isValid=${isValid}`);
    }
    
    return isValid;
  });
  
  console.log(`Total rows after filtering: ${normalizeRealized.length}`);
  
  // Count Ola Electric in normalized data
  const olaElectricInNormalized = normalizeRealized.filter((r: any) => 
    r.stockName.toLowerCase().includes('ola electric')
  );
  if (olaElectricInNormalized.length > 0) {
    console.log(`✅✅✅ Ola Electric found in NORMALIZED realized P/L: ${olaElectricInNormalized.length} records`);
    olaElectricInNormalized.forEach((r, i) => {
      console.log(`  ${i + 1}. "${r.stockName}" - ISIN: ${r.isin || 'MISSING'}, Closed Qty: ${r.closedQty}, Sell Date: ${r.sellDate}`);
    });
  } else {
    console.error(`❌❌❌ Ola Electric NOT found in normalized realized P/L! (total normalized: ${normalizeRealized.length})`);
    // Show unique stock names for debugging
    const uniqueStocks = [...new Set(normalizeRealized.map((r: any) => r.stockName))].slice(0, 10);
    console.log(`  First 10 unique stocks in normalized data:`, uniqueStocks);
  }

  const normalizeUnrealized = unrealizedData.map((row: any) => ({
    stockName: row['Stock Name'] || row['stockName'] || '',
    sectorName: row['Sector Name'] || row['sectorName'] || '',
    isin: row['ISIN'] || row['isin'] || '',
    openQty: parseFloat(row['Open Qty'] || row['openQty'] || 0),
    marketPrice: parseFloat(row['Market price'] || row['marketPrice'] || 0),
    buyPrice: parseFloat(row['Buy Price'] || row['buyPrice'] || 0),
    profitLossPerShare: parseFloat(row['Profit/Loss per share'] || row['profitLossPerShare'] || 0),
    totalMarketValue: parseFloat(row['Total Market Value'] || row['totalMarketValue'] || 0),
    totalBuyValue: parseFloat(row['Total Buy Value'] || row['totalBuyValue'] || 0),
    totalUnrealizedProfitLoss: parseFloat(row['Total unrealized Profit/Loss'] || row['totalUnrealizedProfitLoss'] || 0),
  }));

  return {
    clientId,
    clientName,
    asOnDate,
    holdings: normalizeHoldings,
    transactions: normalizeTransactions,
    realizedProfitLoss: normalizeRealized,
    unrealizedProfitLoss: normalizeUnrealized,
  };
}

export function parseStockMasterFile(buffer: ArrayBuffer): Array<{isin: string, stockName: string, symbol?: string, exchange?: string}> {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  
  // Try to find header row
  let startRow = 0;
  for (let i = 0; i < 10; i++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: i, c: 0 })];
    if (cell && (String(cell.v).toUpperCase().includes('ISIN') || String(cell.v).toUpperCase().includes('STOCK'))) {
      startRow = i;
      break;
    }
  }
  
  const data = XLSX.utils.sheet_to_json(sheet, { 
    range: startRow,
    defval: null 
  });
  
  return data.map((row: any) => ({
    isin: row['ISIN'] || row['isin'] || row['ISIN Code'] || row['ISIN CODE'] || '',
    stockName: row['Stock Name'] || row['stockName'] || row['STOCK NAME'] || row['Company Name'] || row['Name'] || '',
    symbol: row['Symbol'] || row['symbol'] || row['SYMBOL'] || row['Trading Symbol'] || '',
    exchange: row['Exchange'] || row['exchange'] || row['EXCHANGE'] || row['Market'] || '',
  })).filter((item: any) => item.isin && item.stockName);
}

