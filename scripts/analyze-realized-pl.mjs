import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), '..', 'Holding_equity_open (1).xlsx');

if (!fs.existsSync(filePath)) {
  console.error('File not found:', filePath);
  process.exit(1);
}

const buffer = fs.readFileSync(filePath);
const workbook = XLSX.read(buffer, { type: 'buffer' });

console.log('\n=== REALIZED PROFIT-LOSS SHEET ANALYSIS ===');
console.log('Sheet names:', workbook.SheetNames);

const realizedSheet = workbook.Sheets['Realized Profit-Loss'];
if (!realizedSheet) {
  console.error('Realized Profit-Loss sheet not found!');
  process.exit(1);
}

// Find header row
let headerRow = -1;
for (let i = 0; i < 50; i++) {
  const cell = realizedSheet[XLSX.utils.encode_cell({ r: i, c: 1 })];
  if (cell && (String(cell.v).toLowerCase().includes('stock name') || String(cell.v).toLowerCase().includes('company'))) {
    headerRow = i;
    break;
  }
}

if (headerRow === -1) {
  console.error('Header row not found!');
  process.exit(1);
}

console.log(`Header row found at: ${headerRow + 1} (0-indexed: ${headerRow})`);

// Read header row to see column names
const headerData = XLSX.utils.sheet_to_json(realizedSheet, { 
  range: headerRow,
  header: 1,
  defval: ''
});
const headers = headerData[0] || [];
console.log('\nColumn headers found:');
headers.forEach((h, idx) => {
  console.log(`  Column ${idx} (${String.fromCharCode(65 + idx)}): "${h}"`);
});

// Find end row (disclaimer or empty section)
let endRow = null;
for (let i = headerRow + 1; i < 500; i++) {
  let foundDisclaimer = false;
  for (let col = 0; col < 20; col++) {
    const cell = realizedSheet[XLSX.utils.encode_cell({ r: i, c: col })];
    if (cell && String(cell.v).toLowerCase().includes('disclaimer')) {
      foundDisclaimer = true;
      break;
    }
  }
  if (foundDisclaimer) {
    endRow = i - 1;
    break;
  }
  // Check if row is completely empty
  let rowEmpty = true;
  for (let col = 0; col < 20; col++) {
    const cell = realizedSheet[XLSX.utils.encode_cell({ r: i, c: col })];
    if (cell && cell.v !== null && String(cell.v).trim() !== '') {
      rowEmpty = false;
      break;
    }
  }
  if (rowEmpty && i > headerRow + 5) {
    // Check next few rows to confirm it's really empty
    let allEmpty = true;
    for (let j = i; j < i + 3; j++) {
      for (let col = 0; col < 20; col++) {
        const cell = realizedSheet[XLSX.utils.encode_cell({ r: j, c: col })];
        if (cell && cell.v !== null && String(cell.v).trim() !== '') {
          allEmpty = false;
          break;
        }
      }
      if (!allEmpty) break;
    }
    if (allEmpty) {
      endRow = i - 1;
      break;
    }
  }
}

console.log(`End row: ${endRow !== null ? endRow + 1 : 'not found'} (0-indexed: ${endRow})`);

// Read data
const range = endRow !== null 
  ? XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: endRow, c: 20 } })
  : XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: headerRow + 200, c: 20 } });

const data = XLSX.utils.sheet_to_json(realizedSheet, { 
  defval: '', 
  range: range,
  header: 1 
});

console.log(`Total rows read: ${data.length}`);

// Process data
const olaElectricRows = [];
const stockMap = new Map();

for (let i = 1; i < data.length; i++) {
  const row = data[i];
  if (!row || row.length === 0) continue;
  
  // Column B (index 1) is Stock Name
  const stockName = String(row[1] || '').trim();
  if (!stockName || stockName.toLowerCase().includes('disclaimer')) {
    continue;
  }
  
  // Column D (index 3) is ISIN/Identifier
  const isin = String(row[3] || '').trim();
  // Column E (index 4) is Quantity
  const qty = parseFloat(row[4] || 0);
  // Column F (index 5) is Buy Date
  const buyDateStr = String(row[5] || '').trim();
  // Column I (index 8) is Sell Date
  const sellDateStr = String(row[8] || '').trim();
  // Column J (index 9) is Sell Price?
  const sellPrice = parseFloat(row[9] || 0);
  // Column L (index 11) is Realized Profit-Loss
  const realizedPL = parseFloat(row[11] || 0);
  
  // Find Ola Electric
  if (stockName.toLowerCase().includes('ola electric')) {
    olaElectricRows.push({
      row: i + 1,
      stockName,
      isin,
      qty,
      buyDateStr,
      sellDateStr,
      sellPrice,
      realizedPL,
      rawRow: row,
    });
  }
  
  // Aggregate by stock
  if (qty > 0 || realizedPL !== 0) {
    const key = isin || stockName.toLowerCase();
    if (!stockMap.has(key)) {
      stockMap.set(key, {
        stockName,
        isin: isin || '',
        totalQty: 0,
        totalRealizedPL: 0,
        rows: [],
      });
    }
    const stock = stockMap.get(key);
    stock.totalQty += qty;
    stock.totalRealizedPL += realizedPL;
    stock.rows.push({
      row: i + 1,
      qty,
      realizedPL,
    });
  }
}

console.log('\n🔍 OLA ELECTRIC ENTRIES:');
if (olaElectricRows.length > 0) {
  console.log(`Found ${olaElectricRows.length} Ola Electric entries:`);
  olaElectricRows.forEach((entry, idx) => {
    console.log(`\n  Entry ${idx + 1} (Excel row ${entry.row}):`);
    console.log(`    Stock Name: "${entry.stockName}"`);
    console.log(`    ISIN: "${entry.isin}"`);
    console.log(`    Quantity: ${entry.qty}`);
    console.log(`    Buy Date: ${entry.buyDateStr}`);
    console.log(`    Sell Date: ${entry.sellDateStr}`);
    console.log(`    Sell Price: ${entry.sellPrice}`);
    console.log(`    Realized P/L: ${entry.realizedPL}`);
    console.log(`    Raw row:`, entry.rawRow.slice(0, 12));
  });
} else {
  console.log('❌ No Ola Electric entries found!');
}

console.log(`\n📊 Total unique stocks in Realized P/L: ${stockMap.size}`);
console.log(`\nSample stocks:`);
Array.from(stockMap.entries()).slice(0, 10).forEach(([key, stock]) => {
  console.log(`  - ${stock.stockName} (ISIN: ${stock.isin || 'MISSING'}) - Qty: ${stock.totalQty}, P/L: ${stock.totalRealizedPL}`);
});

