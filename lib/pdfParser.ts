// Use pdf-parse for Node.js server-side PDF parsing (better compatibility than pdfjs-dist)
// pdf-parse is designed for Node.js and doesn't require browser workers
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export interface PDFHoldingsData {
  clientId: string;
  clientName: string;
  pan: string;
  asOnDate: Date;
  holdings: Array<{
    isin: string;
    stockName: string;
    stockSymbol?: string;
    faceValue: number;
    openQty: number;
    marketPrice: number;
    marketValue: number;
    sectorName?: string;
    accountType?: string; // NSDL or CDSL
    dpId?: string;
    clientId?: string;
  }>;
  transactions: Array<{
    isin: string;
    stockName: string;
    transactionDate: Date;
    buySell: string;
    tradedQty: number;
    tradePrice: number;
    tradeValue: number;
  }>;
}

/**
 * Parse NSDL CAS PDF file and extract holdings data
 * @param buffer - PDF file buffer
 * @param password - PDF password (default: 'ABUPU2422M')
 * @returns Parsed holdings data
 */
export async function parsePDFFile(
  buffer: ArrayBuffer,
  password: string = 'ABUPU2422M'
): Promise<PDFHoldingsData> {
  console.log('\n=== PARSING PDF FILE ===');
  console.log(`File size: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Password: ${password ? 'PROVIDED' : 'NOT PROVIDED'}\n`);

  // pdf-parse doesn't support password-protected PDFs, so we need pdfjs-dist
  // For Node.js server-side, use legacy build which has better Node.js support
  // The legacy build uses CommonJS and has better worker handling for Node.js
  
  let pdfjs: any;
  try {
    // Try legacy build first (better Node.js compatibility)
    const legacyModule = require('pdfjs-dist/legacy/build/pdf.js');
    pdfjs = legacyModule;
    console.log('✅ Using pdfjs-dist legacy build (better Node.js support)');
  } catch (legacyError) {
    // Fallback to ES module build
    const pdfjsModule = await import('pdfjs-dist/build/pdf.mjs');
    pdfjs = pdfjsModule.default || pdfjsModule;
    console.log('✅ Using pdfjs-dist ES module build');
  }
  
  // Configure worker for Node.js - legacy build handles this better
  // For server-side, try to disable worker or use minimal configuration
  if (typeof window === 'undefined' && pdfjs.GlobalWorkerOptions) {
    // Legacy build might not require workerSrc, but set it anyway
    // Use a file path that Node.js can access
    try {
      const path = require('path');
      const fs = require('fs');
      
      // Get current working directory (ES modules don't have __dirname)
      const cwd = process.cwd();
      
      // Try legacy worker first
      const legacyWorkerPath = path.resolve(
        cwd,
        'node_modules',
        'pdfjs-dist',
        'legacy',
        'build',
        'pdf.worker.mjs'
      );
      
      // Try build worker
      const buildWorkerPath = path.resolve(
        cwd,
        'node_modules',
        'pdfjs-dist',
        'build',
        'pdf.worker.min.mjs'
      );
      
      let workerPath = null;
      if (fs.existsSync(legacyWorkerPath)) {
        workerPath = legacyWorkerPath;
      } else if (fs.existsSync(buildWorkerPath)) {
        workerPath = buildWorkerPath;
      }
      
      if (workerPath) {
        // Use absolute file path (Node.js can handle this)
        pdfjs.GlobalWorkerOptions.workerSrc = workerPath;
        console.log(`✅ Configured worker path: ${workerPath}`);
      } else {
        console.warn('⚠️  Worker file not found, attempting without worker...');
        // For pdfjs-dist v4.x, try using empty string - it might work without worker
        pdfjs.GlobalWorkerOptions.workerSrc = '';
      }
    } catch (workerError: any) {
      console.warn('⚠️  Worker configuration error:', workerError.message);
      // Try to continue without worker
      pdfjs.GlobalWorkerOptions.workerSrc = '';
    }
  }
  
  // Load the PDF document with password
  let fullText = '';
  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      password: password,
      useSystemFonts: true,
      verbosity: 0,
      // Try to disable worker usage for server-side
      disableAutoFetch: true,
      disableStream: false,
    });
    
    const pdfDoc = await loadingTask.promise;
    console.log(`✅ PDF loaded successfully! Total pages: ${pdfDoc.numPages}`);
    
    // Extract text from all pages
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += `\n--- PAGE ${pageNum} ---\n${pageText}\n`;
    }
  } catch (pdfError: any) {
    // If worker error occurs, provide helpful error message
    if (pdfError.message && pdfError.message.includes('worker')) {
      throw new Error(
        `PDF parsing failed due to worker configuration issue. ` +
        `This is a known limitation of pdfjs-dist in Node.js. ` +
        `Error: ${pdfError.message}`
      );
    }
    throw pdfError;
  }

  console.log(`✅ Extracted ${fullText.length} characters of text\n`);

  // Extract client information
  const clientInfo = extractClientInfo(fullText);
  console.log(`Client Name: ${clientInfo.clientName}`);
  console.log(`Client ID: ${clientInfo.clientId || 'N/A'}`);
  console.log(`PAN: ${clientInfo.pan || 'N/A'}`);

  // Extract date
  const asOnDate = extractAsOnDate(fullText);
  console.log(`As On Date: ${asOnDate.toISOString().split('T')[0]}`);

  // Extract equity holdings
  const holdings = extractEquityHoldings(fullText);
  console.log(`✅ Extracted ${holdings.length} equity holdings`);

  // Extract transactions
  const transactions = extractTransactions(fullText);
  console.log(`✅ Extracted ${transactions.length} transactions`);

  return {
    clientId: clientInfo.clientId || '',
    clientName: clientInfo.clientName || '',
    pan: clientInfo.pan || '',
    asOnDate,
    holdings,
    transactions,
  };
}

/**
 * Extract client information from PDF text
 */
function extractClientInfo(text: string): {
  clientName: string;
  clientId?: string;
  pan?: string;
} {
  // Extract PAN (masked format: ABXXXXXX2M)
  const panMatch = text.match(/PAN\s*:?\s*(ABX{6,8}\d{1,2}[A-Z])/i);
  const pan = panMatch ? panMatch[1] : undefined;

  // Extract Client ID (format: Client ID: 21801100)
  const clientIdMatch = text.match(/Client ID\s*:?\s*(\d{6,10})/i);
  const clientId = clientIdMatch ? clientIdMatch[1] : undefined;

  // Extract Client Name (usually appears early in the PDF)
  // Look for lines that look like names (all caps, multiple words)
  const namePatterns = [
    /ACCOUNT HOLDER\s+([A-Z\s]{10,50})/i,
    /In the Single Name of\s+([A-Z\s]{10,50})/i,
    /NSDL ID:\s*\d+\s+([A-Z\s]{10,50})/i,
  ];

  let clientName = '';
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      clientName = match[1].trim();
      // Clean up name (remove PAN, remove extra spaces)
      clientName = clientName.replace(/\(PAN:.*?\)/i, '').trim();
      if (clientName.length > 5 && clientName.length < 100) {
        break;
      }
    }
  }

  return { clientName, clientId, pan };
}

/**
 * Extract as on date from PDF text
 */
function extractAsOnDate(text: string): Date {
  // Look for date patterns like "as on 30-Sep-2025" or "Holdings as on 30-Sep-2025"
  const datePatterns = [
    /Holdings\s+as\s+on\s+(\d{1,2})-(\w{3})-(\d{4})/i,
    /as\s+on\s+(\d{1,2})-(\w{3})-(\d{4})/i,
    /Statement for the period from\s+\d{2}-\w{3}-\d{4}\s+to\s+(\d{1,2})-(\w{3})-(\d{4})/i,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      const day = parseInt(match[1]);
      const monthStr = match[2].toLowerCase();
      const year = parseInt(match[3]);

      const monthMap: { [key: string]: number } = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
      };

      const month = monthMap[monthStr];
      if (month !== undefined) {
        return new Date(year, month, day);
      }
    }
  }

  // Default to current date if not found
  return new Date();
}

/**
 * Extract equity holdings from PDF text (from ALL demat accounts)
 */
function extractEquityHoldings(text: string): Array<{
  isin: string;
  stockName: string;
  stockSymbol?: string;
  faceValue: number;
  openQty: number;
  marketPrice: number;
  marketValue: number;
  sectorName?: string;
  accountType?: string; // NSDL or CDSL
  dpId?: string;
  clientId?: string;
}> {
  const holdings: Array<{
    isin: string;
    stockName: string;
    stockSymbol?: string;
    faceValue: number;
    openQty: number;
    marketPrice: number;
    marketValue: number;
    sectorName?: string;
    accountType?: string;
    dpId?: string;
    clientId?: string;
  }> = [];

  const lines = text.split('\n');
  
  // Find ALL equity sections (may have multiple demat accounts)
  const equitySections: Array<{
    startIndex: number;
    endIndex: number;
    accountType?: string;
    dpId?: string;
    clientId?: string;
  }> = [];

  let currentAccountType: string | undefined;
  let currentDpId: string | undefined;
  let currentClientId: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lowerLine = line.toLowerCase();
    
    // Detect account headers (might be on same line as other content)
    if (lowerLine.includes('nsdl demat account')) {
      currentAccountType = 'NSDL';
      // Extract DP ID and Client ID (check current line and next few lines)
      const dpIdMatch = line.match(/DP ID[:\s]+([A-Z0-9]+)/i);
      const clientIdMatch = line.match(/Client ID[:\s]+(\d+)/i);
      currentDpId = dpIdMatch ? dpIdMatch[1] : undefined;
      currentClientId = clientIdMatch ? clientIdMatch[1] : undefined;
      
      // Check next lines if not found on current line
      if ((!currentDpId || !currentClientId) && i + 1 < lines.length) {
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (!currentDpId) {
            const dpMatch = nextLine.match(/DP ID[:\s]+([A-Z0-9]+)/i);
            if (dpMatch) currentDpId = dpMatch[1];
          }
          if (!currentClientId) {
            const clientMatch = nextLine.match(/Client ID[:\s]+(\d+)/i);
            if (clientMatch) currentClientId = clientMatch[1];
          }
          if (currentDpId && currentClientId) break;
        }
      }
      continue;
    }
    
    if (lowerLine.includes('cdsl demat account')) {
      currentAccountType = 'CDSL';
      const dpIdMatch = line.match(/DP ID[:\s]+(\d+)/i);
      const clientIdMatch = line.match(/Client ID[:\s]+(\d+)/i);
      currentDpId = dpIdMatch ? dpIdMatch[1] : undefined;
      currentClientId = clientIdMatch ? clientIdMatch[1] : undefined;
      
      // Check next lines if not found
      if ((!currentDpId || !currentClientId) && i + 1 < lines.length) {
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (!currentDpId) {
            const dpMatch = nextLine.match(/DP ID[:\s]+(\d+)/i);
            if (dpMatch) currentDpId = dpMatch[1];
          }
          if (!currentClientId) {
            const clientMatch = nextLine.match(/Client ID[:\s]+(\d+)/i);
            if (clientMatch) currentClientId = clientMatch[1];
          }
          if (currentDpId && currentClientId) break;
        }
      }
      continue;
    }
    
    // Find equity section headers
    if ((lowerLine.includes('equity shares') || 
         (lowerLine.includes('equities (e)') && lowerLine.includes('isin'))) ||
        (lowerLine.includes('isin') && (lowerLine.includes('stock symbol') || lowerLine.includes('company name') || lowerLine.includes('security')))) {
      
      // Find where this section ends
      let endIndex = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim().toLowerCase();
        if (nextLine.includes('sub total') || 
            (nextLine.includes('total') && !nextLine.includes('portfolio')) ||
            nextLine.includes('mutual funds') || 
            nextLine.includes('mutual fund folios') ||
            nextLine.includes('cdsl demat account') ||
            nextLine.includes('nsdl demat account')) {
          endIndex = j;
          break;
        }
      }
      
      equitySections.push({
        startIndex: i,
        endIndex,
        accountType: currentAccountType,
        dpId: currentDpId,
        clientId: currentClientId,
      });
      
      console.log(`✅ Found equity section ${equitySections.length}: ${currentAccountType || 'UNKNOWN'} account (lines ${i + 1}-${endIndex + 1})`);
      i = endIndex; // Skip to end of section
    }
  }

  if (equitySections.length === 0) {
    console.warn('⚠️  No equity holdings sections found using header detection.');
    console.warn('   Trying fallback: searching entire text for ISIN patterns...');
    
    // Fallback: search entire text for ISINs
    const allIsins = text.match(/INE\d{10}/gi);
    if (allIsins && allIsins.length > 0) {
      const uniqueIsins = [...new Set(allIsins)];
      console.warn(`   ✅ Found ${uniqueIsins.length} unique ISINs in entire text.`);
      console.warn(`   Sample ISINs: ${uniqueIsins.slice(0, 5).join(', ')}`);
      console.warn('   Will extract from full text...');
      
      // Try to find where equity holdings actually start
      // Look for patterns that indicate equity section start
      let fallbackStart = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        if (line.includes('equity shares') || 
            (line.includes('isin') && line.includes('stock symbol')) ||
            (line.includes('equities (e)') && line.includes('isin'))) {
          fallbackStart = i;
          console.warn(`   Found potential start at line ${i + 1}: ${lines[i].substring(0, 100)}`);
          break;
        }
      }
      
      equitySections.push({
        startIndex: fallbackStart,
        endIndex: lines.length,
        accountType: undefined,
        dpId: undefined,
        clientId: undefined,
      });
      console.warn(`   ✅ Created fallback section from line ${fallbackStart + 1} to end`);
    } else {
      console.error(`   ❌ No ISINs found in entire text either. PDF parsing completely failed.`);
      return [];
    }
  }

  // Process each equity section
  for (let sectionIdx = 0; sectionIdx < equitySections.length; sectionIdx++) {
    const section = equitySections[sectionIdx];
    console.log(`\n📊 Processing equity section ${sectionIdx + 1}/${equitySections.length}...`);
    
    // Collect text from this section
    let equitySectionText = '';
    for (let i = section.startIndex; i < section.endIndex; i++) {
      const line = lines[i].trim();
      // Skip page markers
      if (line.includes('--- PAGE') || line.includes('PAGE ---')) {
        continue;
      }
      
      // IMPORTANT: Header and data might be on the same line!
      // Check if line contains both header text AND an ISIN - if so, include it
      const lowerLine = line.toLowerCase();
      const hasIsin = /INE\d{10}/i.test(line);
      const hasHeader = lowerLine.includes('isin') && lowerLine.includes('stock symbol');
      
      // If it's a header-only line (has header text but no ISIN), skip it
      if (hasHeader && !hasIsin) {
        console.log(`   Skipping header-only line: ${line.substring(0, 80)}...`);
        continue;
      }
      
      // Include all other lines (they might have data)
      equitySectionText += ' ' + line;
    }

  console.log(`Equity section text length: ${equitySectionText.length} characters`);
  if (equitySectionText.length < 100) {
    console.warn(`⚠️  Equity section text is very short (${equitySectionText.length} chars). Might be a parsing issue.`);
    console.warn(`   Sample: ${equitySectionText.substring(0, 300)}`);
  } else {
    console.log(`   Sample text: ${equitySectionText.substring(0, 200)}...`);
  }

  // Find all ISINs in the equity section
  const isinRegex = /(INE\d{10})/gi;
  const allIsinMatches = Array.from(equitySectionText.matchAll(isinRegex));
  console.log(`✅ Found ${allIsinMatches.length} ISIN patterns in equity section`);
  
  if (allIsinMatches.length === 0) {
    console.error(`❌ No ISINs found in equity section!`);
    console.error(`   This is the problem - parser found 0 ISINs, so 0 holdings will be extracted.`);
    console.error(`   Equity section preview (first 500 chars): ${equitySectionText.substring(0, 500)}`);
    
    // Fallback: search entire text
    const fullTextIsins = text.match(/INE\d{10}/gi);
    if (fullTextIsins && fullTextIsins.length > 0) {
      console.warn(`   ⚠️  But found ${fullTextIsins.length} ISINs in FULL text! Using full text as fallback.`);
      equitySectionText = text;
      const fallbackMatches = Array.from(equitySectionText.matchAll(isinRegex));
      if (fallbackMatches.length > 0) {
        // Reassign using splice to update the array
        allIsinMatches.length = 0;
        allIsinMatches.push(...fallbackMatches);
        console.log(`   ✅ Fallback successful: Now have ${allIsinMatches.length} ISINs`);
      }
    } else {
      console.error(`   ❌ No ISINs found in full text either. PDF parsing may have failed.`);
      return [];
    }
  }
  
  // Log some ISINs for verification
  const uniqueIsins = [...new Set(allIsinMatches.map(m => m[1]))];
  console.log(`   Unique ISINs: ${uniqueIsins.length}`);
  if (uniqueIsins.length > 0) {
    console.log(`   First 5 ISINs: ${uniqueIsins.slice(0, 5).join(', ')}`);
  }

  // Process each ISIN
  for (let isinIdx = 0; isinIdx < allIsinMatches.length; isinIdx++) {
    const isinMatch = allIsinMatches[isinIdx];
    const isin = isinMatch[1].toUpperCase();
    const isinStartPos = isinMatch.index!;
    
    // Get the text segment for this ISIN (from this ISIN to next ISIN or end)
    const nextIsinPos = isinIdx < allIsinMatches.length - 1 
      ? allIsinMatches[isinIdx + 1].index! 
      : equitySectionText.length;
    const segmentText = equitySectionText.substring(isinStartPos, nextIsinPos).trim();

    try {
      // Parse the segment: Format is: ISIN SYMBOL COMPANY_NAME FaceValue Qty MarketPrice Value
      // Example: "INE129A01019 GAIL.NSE GAIL (INDIA) LIMITED 10.00 120 176.29 21,154.80"
      const parts = segmentText.split(/\s+/);
      const isinIndex = 0; // ISIN is always first in the segment
      
      // Extract stock symbol (next item after ISIN)
      let stockSymbol: string | undefined;
      let companyNameStart = 1;
      
      if (parts.length > 1) {
        const nextPart = parts[1];
        // Check if it's a stock symbol (contains .NSE, .BSE, or "TRADING SUSPENDED")
        if (nextPart.includes('.NSE') || nextPart.includes('.BSE') || 
            nextPart === 'TRADING' || nextPart.match(/^[A-Z]{2,10}\./)) {
          // If it's "TRADING SUSPENDED", the next part should be "SUSPENDED"
          if (nextPart === 'TRADING' && parts.length > 2 && parts[2] === 'SUSPENDED') {
            stockSymbol = 'TRADING SUSPENDED';
            companyNameStart = 3;
          } else {
            stockSymbol = nextPart;
            companyNameStart = 2;
          }
        }
      }

      // Extract company name (all words until we hit a number)
      let companyName = '';
      let numericStartIndex = -1;
      for (let j = companyNameStart; j < parts.length; j++) {
        const part = parts[j];
        // Check if this is a number (could be face value)
        // Handle Indian number format: "1,38,087.00" -> remove commas and check
        const cleanedPart = part.replace(/,/g, '');
        if (/^\d+\.?\d*$/.test(cleanedPart)) {
          numericStartIndex = j;
          break;
        }
        companyName += (companyName ? ' ' : '') + part;
      }

      if (!companyName || numericStartIndex === -1) {
        console.warn(`⚠️  Could not parse company name or numbers for ISIN ${isin}. Segment: ${segmentText.substring(0, 100)}`);
        continue;
      }

      // Extract numeric values: Face Value, Qty, Market Price, Value
      const numbers: number[] = [];
      for (let j = numericStartIndex; j < Math.min(numericStartIndex + 4, parts.length); j++) {
        const numStr = parts[j].replace(/,/g, ''); // Remove Indian number formatting commas
        const num = parseFloat(numStr);
        if (!isNaN(num)) {
          numbers.push(num);
        }
      }

      if (numbers.length < 3) {
        console.warn(`⚠️  Not enough numbers found for ISIN ${isin}. Found: ${numbers.length}, need at least 3`);
        continue;
      }

      // Handle different formats: NSDL format vs CDSL format
      // NSDL: Face Value, Qty, Market Price, Value
      // CDSL: May have different column order
      let faceValue = 0;
      let openQty = 0;
      let marketPrice = 0;
      let marketValue = 0;
      
      // Try to detect format based on section
      if (section.accountType === 'CDSL' && segmentText.includes('Current Bal.')) {
        // CDSL format: Current Bal, Free Bal, ..., Market Price, Value
        // Example: "53.000 53.000 0.000 ... 674.10 35,727.30"
        // First number is usually quantity, last two are price and value
        if (numbers.length >= 3) {
          openQty = Math.round(numbers[0] || 0);
          marketPrice = numbers[numbers.length - 2] || 0;
          marketValue = numbers[numbers.length - 1] || 0;
        }
      } else {
        // NSDL format: Face Value, Qty, Market Price, Value
        faceValue = numbers[0] || 0;
        openQty = Math.round(numbers[1] || 0);
        marketPrice = numbers[2] || 0;
        marketValue = numbers[3] || (openQty * marketPrice); // Calculate if not provided
      }

      // Skip if quantity is 0 or invalid
      if (openQty <= 0) {
        console.log(`⚠️  Skipping ${isin} - quantity is 0`);
        continue;
      }

      holdings.push({
        isin,
        stockName: companyName.trim(),
        stockSymbol,
        faceValue,
        openQty,
        marketPrice,
        marketValue,
        accountType: section.accountType,
        dpId: section.dpId,
        clientId: section.clientId,
      });
      
      console.log(`✅ Parsed holding: ${companyName.trim()} (${isin}) - Qty: ${openQty}, Price: ${marketPrice}, Value: ${marketValue} [${section.accountType || 'UNKNOWN'}]`);

    } catch (error: any) {
      console.warn(`❌ Error parsing segment for ISIN ${isin}:`, error.message);
      console.warn(`   Segment text: ${segmentText.substring(0, 150)}`);
      continue;
    }
  }
  
  } // End of section loop

  console.log(`\n📊 Total equity holdings extracted: ${holdings.length} from ${equitySections.length} section(s)`);

  // Remove duplicates (same ISIN from same account)
  // But keep holdings from different accounts
  const uniqueHoldings = holdings.filter((holding, index, self) =>
    index === self.findIndex(h => 
      h.isin === holding.isin && 
      h.accountType === holding.accountType &&
      h.clientId === holding.clientId
    )
  );

  console.log(`✅ After deduplication: ${uniqueHoldings.length} unique holdings`);
  return uniqueHoldings;
}

/**
 * Extract transactions from PDF text
 */
function extractTransactions(text: string): Array<{
  isin: string;
  stockName: string;
  transactionDate: Date;
  buySell: string;
  tradedQty: number;
  tradePrice: number;
  tradeValue: number;
}> {
  const transactions: Array<{
    isin: string;
    stockName: string;
    transactionDate: Date;
    buySell: string;
    tradedQty: number;
    tradePrice: number;
    tradeValue: number;
  }> = [];

  // Find transactions section
  // Pattern: ISIN : INE134E01011 - POWER FINANCE CORPORATION LIMITED
  // Date Order No Description Instruction Details Opening Balance Debit Credit Closing Balance
  // Example: 03-Sep-2025 81000043689729 By CM AXIS SECURITIES LIMITED, T+1 NORMAL / 2025167 Standing Instruction to receive credit 90 0 50 140

  const lines = text.split('\n');
  let inTransactionSection = false;
  let currentIsin = '';
  let currentStockName = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect transaction section
    if (line.includes('Transactions') && line.includes('for the period')) {
      inTransactionSection = true;
      continue;
    }

    if (!inTransactionSection) continue;

    // Extract ISIN and stock name from line like "ISIN : INE134E01011 - POWER FINANCE CORPORATION LIMITED"
    const isinMatch = line.match(/ISIN\s*:\s*(INE\d{10})\s*-\s*(.+)/i);
    if (isinMatch) {
      currentIsin = isinMatch[1].toUpperCase();
      currentStockName = isinMatch[2].trim();
      continue;
    }

    // Parse transaction lines (date format: DD-MMM-YYYY)
    const dateMatch = line.match(/(\d{1,2})-(\w{3})-(\d{4})/);
    if (!dateMatch || !currentIsin) continue;

    try {
      const day = parseInt(dateMatch[1]);
      const monthStr = dateMatch[2].toLowerCase();
      const year = parseInt(dateMatch[3]);

      const monthMap: { [key: string]: number } = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
      };

      const month = monthMap[monthStr];
      if (month === undefined) continue;

      const transactionDate = new Date(year, month, day);

      // Determine buy/sell from description
      // "By CM" = Buy, "By Allotment" = Buy, "By Transfer" = Buy
      // "To CM" = Sell
      let buySell = 'BUY';
      if (line.includes('To CM') || line.includes('Redemption') || line.includes('Sale')) {
        buySell = 'SELL';
      }

      // Extract quantities (Credit column is usually the traded quantity)
      const parts = line.split(/\s+/);
      const numbers = parts.filter(p => /^\d+\.?\d*$/.test(p.replace(/,/g, ''))).map(p => parseFloat(p.replace(/,/g, '')));

      // Usually: Opening Balance, Debit, Credit, Closing Balance
      // Credit is the traded quantity
      if (numbers.length >= 4) {
        const tradedQty = Math.round(numbers[2] || 0); // Credit column
        
        if (tradedQty > 0) {
          transactions.push({
            isin: currentIsin,
            stockName: currentStockName,
            transactionDate,
            buySell,
            tradedQty,
            tradePrice: 0, // Price not available in transaction summary
            tradeValue: 0, // Value not available
          });
        }
      }

    } catch (error) {
      console.warn(`Error parsing transaction line:`, error);
      continue;
    }
  }

  return transactions;
}

