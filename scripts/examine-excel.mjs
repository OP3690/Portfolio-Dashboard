import XLSX from 'xlsx';
import fs from 'fs';

const filePath = '../P&L_Equity_Statement (3).xlsx';
const buffer = fs.readFileSync(filePath);
const workbook = XLSX.read(buffer, { type: 'buffer' });

console.log('📋 Sheet Names:', workbook.SheetNames);
console.log('\n' + '='.repeat(80) + '\n');

workbook.SheetNames.forEach((sheetName, idx) => {
  const sheet = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet['!ref']);
  
  console.log(`📄 Sheet ${idx + 1}: "${sheetName}"`);
  console.log(`   Range: ${sheet['!ref']} (${range.e.r + 1} rows, ${range.e.c + 1} cols)`);
  
  // Show first 30 rows, first 15 columns
  console.log('\n   First 30 rows (first 15 columns):');
  for (let r = 0; r < Math.min(30, range.e.r + 1); r++) {
    const row = [];
    for (let c = 0; c < Math.min(15, range.e.c + 1); c++) {
      const cellAddr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[cellAddr];
      const value = cell ? String(cell.v || '').substring(0, 30) : '';
      row.push(value.padEnd(20));
    }
    const rowStr = row.join(' | ');
    if (rowStr.trim()) {
      console.log(`   Row ${String(r + 1).padStart(2)}: ${rowStr}`);
    }
  }
  
  console.log('\n' + '-'.repeat(80) + '\n');
});

