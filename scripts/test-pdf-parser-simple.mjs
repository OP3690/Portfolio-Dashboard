import fs from 'fs';
import path from 'path';

// Use pdfjs-dist ES module
const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');

// Find the PDF file
const fileName = 'NSDLe-CAS_112439056_SEP_2025.PDF';
const filePath = path.join(process.cwd(), '..', fileName);

if (!fs.existsSync(filePath)) {
  console.error(`❌ File "${fileName}" not found at ${filePath}`);
  process.exit(1);
}

console.log(`✅ Found file: ${filePath}\n`);

const password = 'ABUPU2422M';

async function parsePDF() {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    
    console.log('=== PARSING PDF ===');
    console.log(`File size: ${(dataBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Password: ${password}\n`);
    
    // Load the PDF document with password
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(dataBuffer),
      password: password,
    });
    
    const pdfDoc = await loadingTask.promise;
    console.log(`✅ PDF loaded successfully!`);
    console.log(`Total pages: ${pdfDoc.numPages}\n`);
    
    // Extract text from all pages
    let fullText = '';
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(' ');
      fullText += `\n--- PAGE ${pageNum} ---\n${pageText}\n`;
    }
    
    console.log(`\n=== TEXT EXTRACT (First 10000 chars) ===`);
    console.log(fullText.substring(0, 10000));
    
    // Look for key sections
    console.log(`\n=== SEARCHING FOR KEY SECTIONS ===`);
    
    // Look for holdings/equity sections
    const holdingsKeywords = ['Stock Name', 'ISIN', 'Quantity', 'Holding', 'Equity', 'Security', 'Instrument', 'Balance'];
    holdingsKeywords.forEach(keyword => {
      if (fullText.includes(keyword)) {
        console.log(`✅ Found keyword: "${keyword}"`);
      }
    });
    
    // Look for client information
    const clientKeywords = ['PAN', 'Client Name', 'Folio', 'DP ID', 'Client ID', 'Account'];
    clientKeywords.forEach(keyword => {
      if (fullText.includes(keyword)) {
        console.log(`✅ Found keyword: "${keyword}"`);
      }
    });
    
    // Extract ISINs
    const isinMatches = fullText.match(/INE\d{10}/gi);
    if (isinMatches) {
      console.log(`\n✅ Found ${isinMatches.length} ISIN patterns`);
      console.log(`Unique ISINs:`, [...new Set(isinMatches)].slice(0, 20));
    }
    
    // Save full text to file for analysis
    const outputPath = path.join(process.cwd(), 'pdf-extracted-text.txt');
    fs.writeFileSync(outputPath, fullText);
    console.log(`\n✅ Full PDF text saved to: ${outputPath}`);
    
    // Try to extract structured data
    console.log(`\n=== ATTEMPTING STRUCTURED DATA EXTRACTION ===`);
    const lines = fullText.split('\n').filter(line => line.trim().length > 2);
    
    // Look for lines with ISINs
    const linesWithIsin = lines.filter(line => /INE\d{10}/i.test(line));
    console.log(`Found ${linesWithIsin.length} lines containing ISINs`);
    if (linesWithIsin.length > 0) {
      console.log(`\nSample lines with ISINs:`);
      linesWithIsin.slice(0, 10).forEach((line, i) => {
        console.log(`  ${i + 1}. ${line.substring(0, 150)}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error parsing PDF:', error.message);
    if (error.message.includes('password') || error.message.includes('encrypted')) {
      console.error('   This PDF may require a different password.');
    }
    if (error.stack) {
      console.error(error.stack.substring(0, 1000));
    }
    process.exit(1);
  }
}

parsePDF();
