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

console.log('\n=== EXCEL FILE COMPREHENSIVE ANALYSIS ===');
console.log('Sheet names:', workbook.SheetNames);
console.log('');

// Check P&L_Equity_Statement sheet
const plSheet = workbook.Sheets['P&L_Equity_Statement'] || 
                workbook.Sheets[workbook.SheetNames.find(n => n.toLowerCase().includes('p&l')) || ''];

if (!plSheet) {
  console.error('P&L_Equity_Statement sheet not found!');
  process.exit(1);
}

const data = XLSX.utils.sheet_to_json(plSheet, { defval: '' });
console.log(`Total rows in P&L_Equity_Statement: ${data.length}`);

// Analyze all stocks
const stockMap = new Map();
const stockRows = [];

data.forEach((row, index) => {
  const stockName = String(row['Stock Name'] || '').trim();
  if (!stockName || 
      stockName.toLowerCase().includes('disclaimer') || 
      stockName.toLowerCase().includes('note') ||
      stockName === '') {
    return;
  }
  
  const openQty = parseFloat(row['Open Qty'] || row['openQty'] || 0);
  const closedQty = parseFloat(row['Closed Qty'] || row['closedQty'] || 0);
  const isin = String(row['ISIN'] || row['isin'] || '').trim();
  const currentValue = parseFloat(row['Current Value'] || row['currentValue'] || 0);
  const amtInvested = parseFloat(row['Amt Invested'] || row['amtInvested'] || row['Investment Amount'] || 0);
  
  if (!stockMap.has(stockName)) {
    stockMap.set(stockName, {
      stockName,
      openQty: 0,
      closedQty: 0,
      currentValue: 0,
      amtInvested: 0,
      isin: isin || '',
      rows: [],
    });
  }
  
  const stock = stockMap.get(stockName);
  stock.openQty += openQty;
  stock.closedQty += closedQty;
  stock.currentValue += currentValue;
  stock.amtInvested += amtInvested;
  if (!stock.isin && isin) stock.isin = isin;
  stock.rows.push({
    index: index + 1,
    openQty,
    closedQty,
    currentValue,
    amtInvested,
  });
});

const allStocks = Array.from(stockMap.values());
const stocksWithOpenQty = allStocks.filter(s => s.openQty > 0);
const stocksWithClosedQty = allStocks.filter(s => s.closedQty > 0);
const stocksWithOnlyClosed = allStocks.filter(s => s.openQty <= 0 && s.closedQty > 0);
const stocksWithBoth = allStocks.filter(s => s.openQty > 0 && s.closedQty > 0);

console.log('\n📊 COMPREHENSIVE STOCK STATISTICS:');
console.log(`   Total unique stocks (all time): ${allStocks.length}`);
console.log(`   Stocks with Open Qty > 0 (CURRENT holdings): ${stocksWithOpenQty.length}`);
console.log(`   Stocks with Closed Qty > 0 (HISTORICAL - sold stocks): ${stocksWithClosedQty.length}`);
console.log(`   Stocks with BOTH Open and Closed Qty: ${stocksWithBoth.length}`);
console.log(`   Stocks with ONLY Closed Qty (sold, not current): ${stocksWithOnlyClosed.length}`);

console.log('\n✅ CURRENT HOLDINGS (Open Qty > 0):');
stocksWithOpenQty.sort((a, b) => a.stockName.localeCompare(b.stockName));
stocksWithOpenQty.forEach((stock, idx) => {
  console.log(`   ${idx + 1}. ${stock.stockName}`);
  console.log(`      Open Qty: ${stock.openQty}, Closed Qty: ${stock.closedQty}`);
  console.log(`      Current Value: ₹${stock.currentValue.toLocaleString('en-IN')}, Invested: ₹${stock.amtInvested.toLocaleString('en-IN')}`);
  console.log(`      ISIN: ${stock.isin || 'MISSING'}, Rows: ${stock.rows.length}`);
});

console.log('\n📤 HISTORICAL STOCKS (Only Closed Qty - Sold stocks):');
stocksWithOnlyClosed.sort((a, b) => a.stockName.localeCompare(b.stockName));
stocksWithOnlyClosed.forEach((stock, idx) => {
  console.log(`   ${idx + 1}. ${stock.stockName}`);
  console.log(`      Closed Qty: ${stock.closedQty}, Current Value: ₹${stock.currentValue.toLocaleString('en-IN')}`);
  console.log(`      ISIN: ${stock.isin || 'MISSING'}`);
});

console.log('\n📋 ALL UNIQUE STOCKS (Complete List):');
allStocks.sort((a, b) => a.stockName.localeCompare(b.stockName));
allStocks.forEach((stock, idx) => {
  const status = stock.openQty > 0 ? '✅ CURRENT' : stock.closedQty > 0 ? '📤 SOLD' : '❓ ZERO';
  console.log(`   ${idx + 1}. ${stock.stockName} [${status}]`);
  console.log(`      Open: ${stock.openQty}, Closed: ${stock.closedQty}, ISIN: ${stock.isin || 'MISSING'}`);
});

console.log('\n🔍 ISSUE DIAGNOSIS:');
console.log(`   Excel has ${allStocks.length} unique stocks total`);
console.log(`   Excel has ${stocksWithOpenQty.length} stocks with Open Qty > 0 (current holdings)`);
console.log(`   Database has 21 holdings`);
console.log(`   \n   The parser filters to only include stocks with Open Qty > 0`);
console.log(`   This means sold stocks (Closed Qty only) are excluded from holdings`);
console.log(`   \n   If you want ALL stocks (including historical), we need to change the filter logic.`);

