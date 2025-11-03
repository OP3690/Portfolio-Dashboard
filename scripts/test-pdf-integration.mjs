import fs from 'fs';
import path from 'path';

// Test the PDF parser integration
const fileName = 'NSDLe-CAS_112439056_SEP_2025.PDF';
const filePath = path.join(process.cwd(), '..', fileName);

if (!fs.existsSync(filePath)) {
  console.error(`❌ File "${fileName}" not found`);
  process.exit(1);
}

console.log(`✅ Testing PDF parser with file: ${filePath}\n`);

async function testPDFParser() {
  try {
    // Dynamic import of the PDF parser
    const { parsePDFFile } = await import('../lib/pdfParser.ts');
    
    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    
    const password = 'ABUPU2422M';
    const result = await parsePDFFile(arrayBuffer, password);
    
    console.log('\n=== PDF PARSING RESULTS ===');
    console.log(`Client Name: ${result.clientName}`);
    console.log(`Client ID: ${result.clientId}`);
    console.log(`PAN: ${result.pan}`);
    console.log(`As On Date: ${result.asOnDate.toISOString().split('T')[0]}`);
    console.log(`\nHoldings: ${result.holdings.length}`);
    console.log(`Transactions: ${result.transactions.length}`);
    
    console.log('\n=== FIRST 10 HOLDINGS ===');
    result.holdings.slice(0, 10).forEach((h, i) => {
      console.log(`${i + 1}. ${h.stockName} (${h.isin}) - Qty: ${h.openQty}, Price: ${h.marketPrice}, Value: ${h.marketValue}`);
    });
    
    // Check for specific stocks
    const olaElectric = result.holdings.find(h => h.stockName.toLowerCase().includes('ola electric'));
    const tataSteel = result.holdings.find(h => h.stockName.toLowerCase().includes('tata steel'));
    
    console.log(`\n=== SPECIFIC STOCKS ===`);
    console.log(`Ola Electric: ${olaElectric ? `YES (${olaElectric.isin}, Qty: ${olaElectric.openQty})` : 'NO'}`);
    console.log(`Tata Steel: ${tataSteel ? `YES (${tataSteel.isin}, Qty: ${tataSteel.openQty})` : 'NO'}`);
    
    if (result.transactions.length > 0) {
      console.log(`\n=== FIRST 5 TRANSACTIONS ===`);
      result.transactions.slice(0, 5).forEach((t, i) => {
        console.log(`${i + 1}. ${t.stockName} - ${t.buySell} ${t.tradedQty} on ${t.transactionDate.toISOString().split('T')[0]}`);
      });
    }
    
    console.log(`\n✅ PDF parser test completed successfully!`);
    
  } catch (error) {
    console.error('❌ Error testing PDF parser:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testPDFParser();

