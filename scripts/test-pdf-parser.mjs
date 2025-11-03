import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Use dynamic import for pdfjs-dist
let pdfjsLib;
try {
  pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
} catch (e) {
  // Fallback to legacy
  pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
}

// Find the PDF file
const fileName = 'NSDLe-CAS_112439056_SEP_2025.PDF';
const possiblePaths = [
  path.join(process.cwd(), fileName),
  path.join(process.cwd(), '..', fileName),
];

let filePath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    filePath = p;
    break;
  }
}

if (!filePath) {
  console.error(`❌ File "${fileName}" not found!`);
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
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: dataBuffer,
      password: password,
    });
    
    const pdfDoc = await loadingTask.promise;
    console.log(`✅ PDF loaded successfully!`);
    console.log(`Total pages: ${pdfDoc.numPages}`);
    
    // Extract text from all pages
    let fullText = '';
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(' ');
      fullText += `\n--- PAGE ${pageNum} ---\n${pageText}\n`;
    }
    
    console.log(`\n=== TEXT EXTRACT (First 5000 chars) ===`);
    console.log(fullText.substring(0, 5000));
    
    // Look for key sections
    console.log(`\n=== SEARCHING FOR KEY SECTIONS ===`);
    
    // Look for holdings/equity sections
    const holdingsKeywords = ['Stock Name', 'ISIN', 'Quantity', 'Holding', 'Equity', 'Security', 'Instrument'];
    holdingsKeywords.forEach(keyword => {
      if (fullText.includes(keyword)) {
        console.log(`✅ Found keyword: "${keyword}"`);
      }
    });
    
    // Look for client information
    const clientKeywords = ['PAN', 'Client Name', 'Folio', 'DP ID', 'Client ID'];
    clientKeywords.forEach(keyword => {
      if (fullText.includes(keyword)) {
        console.log(`✅ Found keyword: "${keyword}"`);
      }
    });
    
    // Try to extract lines with stock names
    console.log(`\n=== EXTRACTING POTENTIAL STOCK DATA ===`);
    const lines = fullText.split('\n').filter(line => line.trim().length > 0);
    
    // Look for ISIN patterns
    const isinMatches = fullText.match(/INE\d{10}/gi);
    if (isinMatches) {
      console.log(`✅ Found ${isinMatches.length} ISIN patterns:`, [...new Set(isinMatches)].slice(0, 10));
    }
    
    // Save full text to file for analysis
    const outputPath = path.join(process.cwd(), 'pdf-extracted-text.txt');
    fs.writeFileSync(outputPath, fullText);
    console.log(`\n✅ Full PDF text saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('❌ Error parsing PDF:', error.message);
    if (error.message.includes('password') || error.message.includes('encrypted')) {
      console.error('   This PDF may require a different password or parsing method.');
    }
    console.error(error.stack);
    process.exit(1);
  }
}

parsePDF();
