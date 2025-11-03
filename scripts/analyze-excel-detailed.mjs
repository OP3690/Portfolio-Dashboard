import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), '..', 'P&L_Equity_Statement (3).xlsx');

if (!fs.existsSync(filePath)) {
  console.error('File not found:', filePath);
  process.exit(1);
}

const buffer = fs.readFileSync(filePath);
const workbook = XLSX.read(buffer, { type: 'buffer' });

console.log('\n=== DETAILED EXCEL FILE ANALYSIS ===');
console.log('Sheet names:', workbook.SheetNames);
console.log('');

const plSheet = workbook.Sheets['P&L_Equity_Statement'];
if (!plSheet) {
  console.error('P&L_Equity_Statement sheet not found!');
  process.exit(1);
}

// Find header row
let headerRow = -1;
for (let i = 0; i < 20; i++) {
  const cell = plSheet[XLSX.utils.encode_cell({ r: i, c: 1 })];
  if (cell && (cell.v === 'Stock Name' || String(cell.v).includes('Stock Name'))) {
    headerRow = i;
    break;
  }
}

if (headerRow === -1) {
  console.error('Header row not found!');
  process.exit(1);
}

console.log(`Header row found at: ${headerRow + 1} (0-indexed: ${headerRow})`);

// Find end row (disclaimer)
let endRow = null;
for (let i = headerRow + 1; i < 250; i++) {
  let foundDisclaimer = false;
  for (let col = 0; col < 20; col++) {
    const cell = plSheet[XLSX.utils.encode_cell({ r: i, c: col })];
    if (cell && String(cell.v).toLowerCase().includes('disclaimer')) {
      foundDisclaimer = true;
      break;
    }
  }
  if (foundDisclaimer) {
    // Check if previous row has data
    let prevRowHasData = false;
    for (let col = 0; col < 20; col++) {
      const prevCell = plSheet[XLSX.utils.encode_cell({ r: i - 1, c: col })];
      if (prevCell && prevCell.v !== null && String(prevCell.v).trim() !== '') {
        prevRowHasData = true;
        break;
      }
    }
    if (prevRowHasData) {
      endRow = i - 1;
    } else {
      endRow = i - 2;
    }
    break;
  }
}

console.log(`End row: ${endRow !== null ? endRow + 1 : 'not found'} (0-indexed: ${endRow})`);

// Read data with proper range
const range = endRow !== null 
  ? XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: endRow, c: 20 } })
  : XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: headerRow + 200, c: 20 } });

const data = XLSX.utils.sheet_to_json(plSheet, { 
  defval: '', 
  range: range,
  header: 1 
});

console.log(`Total rows read: ${data.length}`);

// Process data
const stockMap = new Map();

for (let i = 1; i < data.length; i++) {
  const row = data[i];
  if (!row || row.length === 0) continue;
  
  const stockName = String(row[1] || '').trim(); // Column B (index 1)
  if (!stockName || stockName.toLowerCase().includes('disclaimer') || stockName === '') {
    continue;
  }
  
  const closedQty = parseFloat(row[2] || 0); // Column C
  const realizedPL = parseFloat(row[3] || 0);
  const dividend = parseFloat(row[4] || 0);
  const netPL = parseFloat(row[5] || 0);
  const netPLPercent = parseFloat(row[6] || 0);
  const openQty = parseFloat(row[7] || 0); // Column H
  const currentValue = parseFloat(row[8] || 0); // Column I
  const amtInvested = parseFloat(row[9] || 0); // Column J
  
  // Aggregate by stock name
  if (!stockMap.has(stockName)) {
    stockMap.set(stockName, {
      stockName,
      openQty: 0,
      closedQty: 0,
      currentValue: 0,
      amtInvested: 0,
      realizedPL: 0,
      dividend: 0,
      rows: [],
    });
  }
  
  const stock = stockMap.get(stockName);
  stock.openQty += openQty;
  stock.closedQty += closedQty;
  stock.currentValue += currentValue;
  stock.amtInvested += amtInvested;
  stock.realizedPL += realizedPL;
  stock.dividend += dividend;
  stock.rows.push({
    row: i + 1,
    openQty,
    closedQty,
    currentValue,
    amtInvested,
  });
}

const allStocks = Array.from(stockMap.values());
const currentHoldings = allStocks.filter(s => s.openQty > 0);
const historicalOnly = allStocks.filter(s => s.openQty <= 0 && s.closedQty > 0);
const bothCurrentAndHistorical = allStocks.filter(s => s.openQty > 0 && s.closedQty > 0);

console.log('\n📊 COMPREHENSIVE STOCK ANALYSIS:');
console.log(`   Total unique stocks (all time): ${allStocks.length}`);
console.log(`   Current holdings (Open Qty > 0): ${currentHoldings.length}`);
console.log(`   Historical only (Closed Qty > 0, Open Qty = 0): ${historicalOnly.length}`);
console.log(`   Stocks with both (Open Qty > 0 AND Closed Qty > 0): ${bothCurrentAndHistorical.length}`);

console.log('\n✅ CURRENT HOLDINGS (Open Qty > 0):');
currentHoldings.sort((a, b) => a.stockName.localeCompare(b.stockName));
currentHoldings.forEach((stock, idx) => {
  console.log(`   ${idx + 1}. ${stock.stockName}`);
  console.log(`      Open Qty: ${stock.openQty}, Closed Qty: ${stock.closedQty}`);
  console.log(`      Current Value: ₹${stock.currentValue.toLocaleString('en-IN')}, Invested: ₹${stock.amtInvested.toLocaleString('en-IN')}`);
  console.log(`      Rows: ${stock.rows.length}`);
});

console.log('\n📤 HISTORICAL STOCKS (Only Closed Qty - Sold stocks):');
historicalOnly.sort((a, b) => a.stockName.localeCompare(b.stockName));
historicalOnly.forEach((stock, idx) => {
  console.log(`   ${idx + 1}. ${stock.stockName}`);
  console.log(`      Closed Qty: ${stock.closedQty}, Realized P/L: ₹${stock.realizedPL.toLocaleString('en-IN')}`);
});

console.log('\n📋 ALL UNIQUE STOCKS (Complete List):');
allStocks.sort((a, b) => a.stockName.localeCompare(b.stockName));
allStocks.forEach((stock, idx) => {
  const status = stock.openQty > 0 ? '✅ CURRENT' : stock.closedQty > 0 ? '📤 SOLD' : '❓ ZERO';
  console.log(`   ${idx + 1}. ${stock.stockName} [${status}]`);
  console.log(`      Open: ${stock.openQty}, Closed: ${stock.closedQty}, Value: ₹${stock.currentValue.toLocaleString('en-IN')}`);
});

console.log('\n🔍 EXPECTED RESULT:');
console.log(`   Based on your statement, you should have ${currentHoldings.length} current holdings in the database.`);
console.log(`   Total unique stocks in your portfolio (all time): ${allStocks.length}`);

