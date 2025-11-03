import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// Find the Excel file
const fileName = 'P&L_Equity_Statement (3).xlsx';
const possiblePaths = [
  path.join(process.cwd(), fileName),
  path.join(process.cwd(), '..', fileName),
  path.join(process.cwd(), 'public', fileName),
  path.join(process.cwd(), 'uploads', fileName),
];

let filePath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    filePath = p;
    break;
  }
}

if (!filePath) {
  // Search in current directory and subdirectories
  function findFile(dir, filename) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && !file.startsWith('.') && !file.includes('node_modules')) {
        const found = findFile(fullPath, filename);
        if (found) return found;
      } else if (file === filename) {
        return fullPath;
      }
    }
    return null;
  }
  
  filePath = findFile(process.cwd(), fileName);
}

if (!filePath) {
  console.error(`❌ File "${fileName}" not found!`);
  console.log('\nSearched in:');
  possiblePaths.forEach(p => console.log(`  - ${p}`));
  process.exit(1);
}

console.log(`✅ Found file: ${filePath}\n`);

// Read the Excel file
const buffer = fs.readFileSync(filePath);
const workbook = XLSX.read(buffer, { type: 'buffer' });

console.log('=== EXCEL FILE STRUCTURE ===\n');
console.log(`Sheet names (${workbook.SheetNames.length}):`);
workbook.SheetNames.forEach((name, i) => {
  console.log(`  ${i + 1}. "${name}"`);
});

// Check for new format
const hasNewFormat = workbook.SheetNames.some(name => 
  name.toLowerCase().includes('p&l') || name.toLowerCase().includes('equity_statement') || name === 'P&L_Equity_Statement'
);
console.log(`\nFormat detected: ${hasNewFormat ? 'NEW FORMAT (P&L_Equity_Statement)' : 'OLD FORMAT (Holdings)'}`);

// Examine each sheet
console.log('\n=== SHEET DETAILS ===\n');

for (const sheetName of workbook.SheetNames) {
  console.log(`\n📊 Sheet: "${sheetName}"`);
  const sheet = workbook.Sheets[sheetName];
  
  // Get range
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  console.log(`  Range: ${sheet['!ref'] || 'N/A'} (${range.e.r + 1} rows, ${range.e.c + 1} cols)`);
  
  // Look for header row
  let headerRow = -1;
  for (let r = 0; r <= Math.min(range.e.r, 20); r++) {
    const cell = sheet[XLSX.utils.encode_cell({ r, c: 1 })];
    if (cell && cell.v && String(cell.v).toLowerCase().includes('stock name')) {
      headerRow = r;
      break;
    }
  }
  
  if (headerRow >= 0) {
    console.log(`  ✅ Header row found at: ${headerRow + 1} (0-based: ${headerRow})`);
    
    // Show header values
    const headers = [];
    for (let c = 0; c <= Math.min(range.e.c, 15); c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c })];
      if (cell && cell.v) {
        headers.push(cell.v);
      }
    }
    console.log(`  Headers (first 15 cols):`, headers);
    
    // Check for "Disclaimer" row
    let disclaimerRow = -1;
    for (let r = headerRow + 1; r <= Math.min(range.e.r, 500); r++) {
      for (let c = 0; c <= Math.min(range.e.c, 10); c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.v && String(cell.v).toLowerCase().includes('disclaimer')) {
          disclaimerRow = r;
          break;
        }
      }
      if (disclaimerRow >= 0) break;
    }
    
    if (disclaimerRow >= 0) {
      console.log(`  ✅ Disclaimer row found at: ${disclaimerRow + 1} (0-based: ${disclaimerRow})`);
      console.log(`  📝 Data rows (excluding header): ${disclaimerRow - headerRow - 1}`);
    }
    
    // Count rows with data (non-empty Stock Name)
    let dataRowCount = 0;
    let sampleRows = [];
    for (let r = headerRow + 1; r <= Math.min(range.e.r, disclaimerRow >= 0 ? disclaimerRow - 1 : 500); r++) {
      const stockNameCell = sheet[XLSX.utils.encode_cell({ r, c: 1 })];
      if (stockNameCell && stockNameCell.v && String(stockNameCell.v).trim()) {
        dataRowCount++;
        if (sampleRows.length < 5) {
          const rowData = {
            row: r + 1,
            stockName: stockNameCell.v,
          };
          // Get ISIN if available
          const isinCell = sheet[XLSX.utils.encode_cell({ r, c: 2 })];
          if (isinCell && isinCell.v) rowData.isin = isinCell.v;
          sampleRows.push(rowData);
        }
      }
    }
    console.log(`  📊 Rows with data: ${dataRowCount}`);
    if (sampleRows.length > 0) {
      console.log(`  Sample rows:`);
      sampleRows.forEach(row => {
        console.log(`    Row ${row.row}: "${row.stockName}"${row.isin ? ` (ISIN: ${row.isin})` : ''}`);
      });
    }
    
    // Check for specific stocks
    const searchStocks = ['BHEL', 'Ola Electric', 'Tata Steel'];
    console.log(`  🔍 Searching for specific stocks:`);
    for (const searchStock of searchStocks) {
      let found = false;
      for (let r = headerRow + 1; r <= Math.min(range.e.r, disclaimerRow >= 0 ? disclaimerRow - 1 : 500); r++) {
        const stockNameCell = sheet[XLSX.utils.encode_cell({ r, c: 1 })];
        if (stockNameCell && stockNameCell.v && 
            String(stockNameCell.v).toLowerCase().includes(searchStock.toLowerCase())) {
          const isinCell = sheet[XLSX.utils.encode_cell({ r, c: 2 })];
          console.log(`    ✅ Found "${searchStock}": Row ${r + 1}, ISIN: ${isinCell?.v || 'MISSING'}`);
          found = true;
          break;
        }
      }
      if (!found) {
        console.log(`    ❌ "${searchStock}" not found`);
      }
    }
  } else {
    console.log(`  ⚠️  No header row found (no "Stock Name" in first 20 rows)`);
  }
}

// Try to parse using the actual parser
console.log('\n\n=== TESTING WITH ACTUAL PARSER ===\n');
try {
  const { parseExcelFile } = await import('../lib/excelParser.ts');
  const excelData = parseExcelFile(buffer);
  
  console.log(`Client ID: ${excelData.clientId}`);
  console.log(`Client Name: ${excelData.clientName || 'N/A'}`);
  console.log(`As On Date: ${excelData.asOnDate}`);
  console.log(`\nHoldings: ${excelData.holdings.length}`);
  console.log(`Transactions: ${excelData.transactions.length}`);
  console.log(`Realized P/L: ${excelData.realizedProfitLoss.length}`);
  console.log(`Unrealized P/L: ${excelData.unrealizedProfitLoss.length}`);
  
  if (excelData.holdings.length > 0) {
    console.log(`\n📊 First 5 Holdings:`);
    excelData.holdings.slice(0, 5).forEach((h, i) => {
      console.log(`  ${i + 1}. ${h.stockName} (${h.isin}) - Qty: ${h.openQty}`);
    });
  }
  
  // Check for BHEL and Ola Electric
  const bhel = excelData.holdings.find(h => 
    h.stockName?.toLowerCase().includes('bhel') || h.isin === 'INE257A01026'
  );
  console.log(`\n🔍 BHEL in holdings: ${bhel ? `YES (${bhel.stockName}, ${bhel.isin}, Qty: ${bhel.openQty})` : 'NO'}`);
  
  const ola = excelData.realizedProfitLoss.find(r => 
    r.stockName?.toLowerCase().includes('ola electric')
  );
  console.log(`🔍 Ola Electric in realized P/L: ${ola ? `YES (${ola.stockName}, ISIN: ${ola.isin || 'MISSING'}, Closed Qty: ${ola.closedQty})` : 'NO'}`);
  
  // Show all holdings
  if (excelData.holdings.length > 0) {
    console.log(`\n📋 All Holdings (${excelData.holdings.length}):`);
    excelData.holdings.forEach((h, i) => {
      console.log(`  ${i + 1}. ${h.stockName} (${h.isin || 'NO ISIN'}) - Qty: ${h.openQty}`);
    });
  }
  
} catch (error) {
  console.error(`\n❌ Error parsing with actual parser:`, error.message);
  console.error(error.stack);
}

