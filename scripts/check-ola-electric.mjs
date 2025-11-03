import XLSX from 'xlsx';
import fs from 'fs';

const buffer = fs.readFileSync('../P&L_Equity_Statement (3).xlsx');
const workbook = XLSX.read(buffer, { type: 'buffer' });

// Check Realized Profit-Loss sheet
const realizedSheet = workbook.Sheets['Realized Profit-Loss'];
const realizedData = XLSX.utils.sheet_to_json(realizedSheet, { range: 11, defval: null });

console.log('\n=== Searching for Ola Electric in Realized Profit-Loss ===');
const olaElectric = realizedData.filter(r => 
  (r['Stock Name'] || '').toString().toLowerCase().includes('ola electric')
);
console.log(`Found ${olaElectric.length} Ola Electric entries:`);
olaElectric.forEach((r, i) => {
  console.log(`  ${i+1}. Stock: "${r['Stock Name']}", Closed Qty: ${r['Closed Qty']}, ISIN: "${r['ISIN'] || 'MISSING'}", Sell Date: ${r['Sell Date']}, Realized P/L: ${r['Realized Profit/Loss']}`);
});

// Check Transaction Details for Ola Electric ISIN
const txSheet = workbook.Sheets['Transaction Details'];
const txData = XLSX.utils.sheet_to_json(txSheet, { range: 11, defval: null });
console.log('\n=== Searching for Ola Electric in Transaction Details ===');
const olaTx = txData.filter(t => 
  (t['Stock Name'] || '').toString().toLowerCase().includes('ola electric')
);
if (olaTx.length > 0) {
  const uniqueIsins = [...new Set(olaTx.map(t => (t['ISIN'] || '').toString().trim()).filter(Boolean))];
  console.log(`Found ${olaTx.length} Ola Electric transactions`);
  console.log(`ISINs in transactions:`, uniqueIsins);
  if (uniqueIsins.length > 0) {
    console.log(`Primary ISIN: ${uniqueIsins[0]}`);
  }
} else {
  console.log('No Ola Electric transactions found');
}

