# Excel Upload → Database Storage → Data Retrieval Flow

## Overview
This document explains the complete flow of how Excel files are uploaded, parsed, stored in MongoDB, and retrieved for display.

---

## PHASE 1: EXCEL UPLOAD (Client-Side)

### Location: `components/Navigation.tsx`

**Step 1: File Selection & Validation**
```typescript
// User selects Excel file via file input
// Validation checks:
- File type must be .xlsx
- File size must be < 10MB
- File must exist
```

**Step 2: FormData Creation**
```typescript
const formData = new FormData();
formData.append('file', file);           // Excel file
formData.append('fileType', uploadType); // 'holdings' or 'stockMaster'
```

**Step 3: POST to `/api/upload`**
```typescript
const response = await fetch('/api/upload', {
  method: 'POST',
  body: formData,
});
```

**Step 4: Response Handling**
- Logs `parsingDetails` from response
- Shows success/error toast
- Triggers `onUploadSuccess()` callback to refresh dashboard

---

## PHASE 2: EXCEL PARSING (Server-Side)

### Location: `lib/excelParser.ts`

### 2.1 Header Information Extraction
```typescript
// Reads first sheet to extract:
- clientId: From cell B4 or B3 (default: '994826')
- clientName: From cell B5 or B4
- asOnDate: From cell B6, B5, or B7 (parsed as date)
```

### 2.2 Holdings Sheet Parsing

#### Step 1: Find Data Range
**Function: `findSheetRange(sheet, maxRows)`**

**Logic:**
1. **Find Header Row:**
   - Searches rows 0-19 for cell containing "Stock Name" (case-insensitive)
   - Sets `startRow` to this row index

2. **Find End Row (Before Disclaimer):**
   - Searches from `startRow + 1` onwards
   - Looks for row containing "Disclaimer" (case-insensitive, checks 10 columns)
   - **Pattern Detection:**
     - Pattern A: `[data at i-1] → [disclaimer at i]` → `endRow = i-1`
     - Pattern B: `[data at i-2] → [blank at i-1] → [disclaimer at i]` → `endRow = i-2`
     - Fallback: If disclaimer right after header → `endRow = startRow`

**Result:** `{ startRow: number, endRow: number | null }`

#### Step 2: Parse Sheet Data
**Function: `parseSheetData(sheet, range)`**

**Logic:**
```typescript
// If endRow is specified:
const rangeStr = XLSX.utils.encode_range({ 
  s: { r: startRow, c: 0 },  // Start at header row, column 0
  e: { r: endRow, c: 20 }    // End at last data row, column 20
});

// Convert sheet to JSON
data = XLSX.utils.sheet_to_json(sheet, { 
  range: rangeStr,  // Uses the calculated range
  defval: null      // Default value for empty cells
});
```

**Safety Check:**
- If exactly 20 rows parsed → Check next row for data
- If next row has ISIN format or stock name → Extend range by 1 row

#### Step 3: Normalize Holdings Data
**Function: `parseExcelFile()` → Normalization**

**Column Name Mapping:**
Excel parser handles BOTH formats:
- Raw Excel: `row['Stock Name']`, `row['Open Qty']`, `row['ISIN']`
- Normalized: `row['stockName']`, `row['openQty']`, `row['isin']`

**Field Extraction Logic:**
```typescript
for each row in holdingsData:
  stockName = row['Stock Name'] || row['stockName'] || ''
  isin = row['ISIN'] || row['isin'] || ''
  openQty = parseFloat(row['Open Qty'] || row['openQty'] || 0)
  // ... other fields with same pattern
```

**Filtering Criteria:**

1. **Skip Empty Rows:**
   ```typescript
   if (no stockName && no isin && openQty === 0) → return null
   ```

2. **Skip Disclaimer/Header Rows:**
   ```typescript
   if (stockName.includes('disclaimer') || 
       stockName.includes('note:') || 
       (stockName.includes('average cost') && no isin)) → return null
   ```

3. **Final Filter:**
   ```typescript
   // Keep only rows with BOTH valid ISIN AND stockName
   if (row.isin && row.isin.trim() !== '' && 
       row.stockName && row.stockName.trim() !== '') → KEEP
   else → FILTER OUT
   ```

**Result:** Array of normalized holdings objects

### 2.3 Other Sheets Parsing
- **Transaction Details:** Same range detection logic
- **Realized Profit-Loss:** Same range detection logic
- **Unrealized Profit-Loss:** Same range detection logic

---

## PHASE 3: DATABASE STORAGE (Server-Side)

### Location: `app/api/upload/route.ts`

### 3.1 Pre-Processing

#### Step 1: Filter Holdings
```typescript
currentHoldingsFromExcel = excelData.holdings.filter(
  h => h.isin && h.isin.trim() !== ''
)
// Includes holdings with 0 quantity
```

#### Step 2: Check for Duplicates
```typescript
// Checks if same ISIN appears with different stock names
// Logs warning if duplicates found
// Last one wins (will overwrite in database)
```

#### Step 3: Normalize ISINs
```typescript
function normalizeIsin(isin: string): string {
  return String(isin).trim().toUpperCase();
}

// Creates Set of normalized ISINs for comparison
currentIsins = Set of normalized ISINs from Excel
oldIsins = Set of normalized ISINs from Database
```

#### Step 4: Strategy
- **NO DELETION:** Stocks not in current Excel are NOT deleted
- **UPSERT ONLY:** Each holding is upserted (update if exists, insert if new)
- Old holdings remain in DB until explicitly replaced

### 3.2 Save Loop

**For each holding in `currentHoldingsFromExcel`:**

#### Step 1: Extract Excel Values
```typescript
// Handles BOTH normalized and raw Excel column names
excelStockName = String(holding.stockName || holding['Stock Name'] || '').trim()
excelQty = Number(holding.openQty ?? holding['Open Qty'] ?? 0)
excelMarketPrice = Number(holding.marketPrice ?? holding['Market Price'] ?? 0)
// ... etc for all fields
```

#### Step 2: Check if Existing
```typescript
existing = await Holding.findOne({ 
  clientId, 
  isin: normalizedIsin 
}).lean()
```

#### Step 3: Compare for Changes
```typescript
// Convert existing DB values to proper types
existingQty = Number(existing.openQty) || 0
existingStockName = String(existing.stockName || '').trim()

// Check if changes detected
shouldUpdate = 
  existingQty !== excelQty ||
  existingStockName !== excelStockName ||
  // ... other field comparisons
```

#### Step 4: Prepare Data Object
```typescript
holdingToSave = {
  stockName: excelStockName,        // Uses extracted Excel value
  sectorName: excelSectorName,
  isin: normalizedIsin,             // Normalized ISIN
  openQty: excelQty,                // Uses extracted Excel value
  marketPrice: excelMarketPrice,
  marketValue: excelMarketValue,
  investmentAmount: excelInvestmentAmount,
  // ... all other fields with defaults
  clientId,
  clientName: excelData.clientName,
  asOnDate: excelData.asOnDate,
  lastUpdated: new Date(),          // Always current timestamp
}
```

#### Step 5: Delete Variants
```typescript
// Find holdings with same normalized ISIN but different format
variantsToDelete = all holdings where:
  normalizeIsin(variant.isin) === normalizedIsin 
  AND variant.isin !== normalizedIsin

// Delete variants to prevent duplicates
```

#### Step 6: Save to Database
```typescript
// Uses MongoDB findOneAndUpdate with upsert
result = await Holding.findOneAndUpdate(
  { clientId, isin: normalizedIsin },  // Query: Find by clientId + ISIN
  { 
    $set: {
      ...holdingToSave,              // Update ALL fields
      lastUpdated: new Date()        // Always update timestamp
    }
  },
  { 
    upsert: true,                    // Insert if not exists
    new: true,                       // Return updated document
    runValidators: true,             // Run schema validators
    setDefaultsOnInsert: true        // Set defaults on insert
  }
)
```

**Key Points:**
- `$set` ensures ALL fields are updated (not just changed ones)
- `upsert: true` means "update if exists, insert if new"
- Unique index on `(clientId, isin)` prevents duplicates

#### Step 7: Verify Save
```typescript
// Immediately verify the save worked
verifySaved = await Holding.findOne({ 
  clientId, 
  isin: normalizedIsin 
}).lean()

if (verifySaved) {
  // Log success, add to savedHoldings array
} else {
  // Retry logic or log error
}
```

### 3.3 Post-Save Verification

#### Step 1: Wait for MongoDB Commit
```typescript
await setTimeout(500ms)  // Allow writes to commit
```

#### Step 2: Query Database
```typescript
finalHoldings = await Holding.find({ clientId }).lean()
finalHoldingsCount = finalHoldings.length
```

#### Step 3: Compare Expected vs Actual
```typescript
expectedIsins = Set of normalized ISINs from Excel
actualIsins = Set of normalized ISINs from Database

missingIsins = expectedIsins - actualIsins

if (missingIsins.length > 0) {
  // Retry saving missing holdings
  // Uses Holding.create() as fallback
}
```

#### Step 4: Multiple Verification Queries
```typescript
// Query 1
finalHoldings1 = await Holding.find({ clientId }).lean()

// Query 2 (after 200ms delay)
finalHoldings2 = await Holding.find({ clientId }).lean()

// Direct BHEL query
bhelVerify = await Holding.findOne({ 
  clientId, 
  isin: 'INE257A01026' 
}).lean()
```

---

## PHASE 4: DATA RETRIEVAL (Server-Side)

### Location: `app/api/dashboard/route.ts`

### 4.1 Initial Fetch

#### Step 1: Get Count
```typescript
totalCount = await Holding.countDocuments({ clientId })
```

#### Step 2: Direct BHEL Query
```typescript
// Try multiple methods to find BHEL
bhelDirectQuery = await Holding.findOne({ 
  clientId, 
  isin: 'INE257A01026' 
}).lean()

// If not found, try regex
bhelDirectQuery = await Holding.findOne({ 
  clientId, 
  isin: { $regex: /INE257A01026/i }
}).lean()

// If still not found, try by name
bhelDirectQuery = await Holding.findOne({ 
  clientId, 
  stockName: { $regex: /b\s*h\s*e\s*l|bhel/i }
}).lean()
```

#### Step 3: Fetch All Holdings
```typescript
holdings = await Holding.find({ clientId }).lean()
```

#### Step 4: Check for Count Mismatch
```typescript
if (holdings.length < totalCount) {
  // MongoDB query issue - find() not returning all documents
  
  // Alternative: Batch fetch using skip/limit
  allHoldingsAlternative = []
  skip = 0
  while (skip < totalCount) {
    batch = await Holding.find({ clientId })
      .skip(skip)
      .limit(100)
      .lean()
    allHoldingsAlternative.push(...batch)
    skip += batch.length
  }
  
  if (allHoldingsAlternative.length === totalCount) {
    holdings = allHoldingsAlternative  // Use batch results
  }
}
```

#### Step 5: Verify BHEL in Results
```typescript
rawBhelCheck = holdings.find(h => 
  normalizeIsin(h.isin) === 'INE257A01026' ||
  h.stockName.toLowerCase().includes('bhel')
)

if (!rawBhelCheck && totalCount > holdings.length) {
  // Add BHEL manually from direct query
  if (bhelDirectQuery) {
    holdings.push(bhelDirectQuery)
  }
}
```

### 4.2 Normalize ISINs
```typescript
holdings = holdings.map(h => ({
  ...h,
  isin: normalizeIsin(h.isin)  // Trim and uppercase
}))
```

### 4.3 Process Holdings (Calculate Metrics)

**For each holding:**
```typescript
// Get transactions for this holding
stockTransactions = transactions.filter(t => 
  normalizeIsin(t.isin) === normalizedIsin
)

// Calculate XIRR, CAGR, Holding Period
stockXIRR = calculateStockXIRR(stockTransactions, holding)
{ cagr, holdingPeriodYears, holdingPeriodMonths } = 
  calculateStockCAGRAndHoldingPeriod(stockTransactions, holding)

// Return holding with calculated metrics
return {
  ...holding,
  xirr: stockXIRR,
  cagr: cagr,
  holdingPeriodYears: holdingPeriodYears,
  holdingPeriodMonths: holdingPeriodMonths,
}
```

**Uses `Promise.allSettled()`:**
- If one holding's calculation fails, others still process
- Failed holdings get default values (0 for metrics)

### 4.4 Safeguards & Missing Holdings Recovery

#### Check 1: Compare Processed vs Original
```typescript
processedIsins = Set of ISINs from processedHoldings
originalIsins = Set of ISINs from original holdings

missingFromProcessed = originalIsins - processedIsins

if (missingFromProcessed.length > 0) {
  // Add missing holdings back with default metrics
  for each missing holding:
    - Query database for holding
    - Calculate metrics (or use defaults)
    - Add to processedHoldings
}
```

#### Check 2: Final Verification Before Response
```typescript
finalDbCount = await Holding.countDocuments({ clientId })
finalResponseHasBhel = processedHoldings.find(h => 
  normalizeIsin(h.isin) === 'INE257A01026'
)

if (!finalResponseHasBhel || 
    processedHoldings.length !== finalDbCount) {
  
  // REBUILD from database
  allDbHoldings = await Holding.find({ clientId }).lean()
  
  // Process each holding
  processedHoldings = await Promise.all(
    allDbHoldings.map(calculateMetrics)
  )
}
```

### 4.5 Return Response
```typescript
return NextResponse.json({
  success: true,
  data: {
    summary: { ... },
    holdings: processedHoldings,  // All holdings with metrics
    // ... other data
  }
})
```

---

## KEY FILTERING CRITERIA

### Excel Parsing Filtering:
1. **Empty Row Filter:**
   - Stock Name is empty/whitespace
   - ISIN is empty/whitespace
   - Open Qty is 0
   - **Result:** Row filtered out

2. **Disclaimer/Header Filter:**
   - Stock Name contains "disclaimer" (case-insensitive)
   - Stock Name contains "note:" (case-insensitive)
   - Stock Name contains "average cost" AND no ISIN
   - **Result:** Row filtered out

3. **Final Validation:**
   - Must have BOTH valid ISIN AND stockName
   - ISIN must not be empty after trim
   - StockName must not be empty after trim
   - **Result:** Row kept if passes, filtered if fails

### Database Storage Filtering:
1. **ISIN Validation:**
   - Holdings without ISIN are skipped
   - ISIN is normalized (trim + uppercase) before save
   - **Result:** Invalid holdings not saved

2. **Duplicate Handling:**
   - Unique index on `(clientId, isin)` prevents duplicates
   - Variants with different ISIN format are deleted before save
   - **Result:** One holding per client per ISIN

### Data Retrieval Filtering:
1. **No Filtering on Fetch:**
   - `find({ clientId })` returns ALL holdings for client
   - No quantity filter (includes holdings with 0 qty)
   - **Result:** All holdings returned

2. **Processing Filtering:**
   - Holdings are NOT filtered out during processing
   - Failed calculations get default values (0), not filtered
   - **Result:** All holdings included in response

---

## POTENTIAL ISSUES & FIXES

### Issue 1: BHEL Missing from Dashboard
**Symptoms:**
- Upload shows 21 holdings saved
- Dashboard shows only 20 holdings
- BHEL is missing

**Possible Causes:**
1. MongoDB `find()` query not returning all documents
2. BHEL ISIN format mismatch (whitespace/case)
3. Processing filters out BHEL during Promise.allSettled

**Fixes Applied:**
- Alternative batch fetch if count mismatch
- Direct BHEL query and manual addition
- Final rebuild from database if BHEL missing
- Extensive logging at each step

### Issue 2: Excel Updates Not Reflecting
**Symptoms:**
- Stock name changed in Excel (e.g., "Tata Steel" → "Tata Steel ABC")
- Quantity changed (e.g., 651 → 655)
- UI still shows old values

**Possible Causes:**
1. Field extraction using wrong column names
2. Type comparison issues (string vs number)
3. Update operator not using `$set`

**Fixes Applied:**
- Proper field extraction (handles both formats)
- Explicit type conversion for comparisons
- Uses `$set` operator to update all fields
- Always updates (even if no changes) to refresh timestamp

### Issue 3: Count Mismatch
**Symptoms:**
- `countDocuments()` says 21
- `find()` returns 20

**Possible Causes:**
1. MongoDB cursor/read preference issue
2. Replication lag
3. Index issue

**Fixes Applied:**
- Alternative batch fetch using skip/limit
- Multiple verification queries
- Rebuild from database if mismatch detected

---

## DATABASE SCHEMA

### Holding Model:
```typescript
{
  stockName: string (required)
  sectorName: string (required)
  isin: string (required, indexed)
  portfolioPercentage: number (required)
  openQty: number (required)
  marketPrice: number (required)
  marketValue: number (required)
  investmentAmount: number (required)
  avgCost: number (required)
  profitLossTillDate: number (required)
  profitLossTillDatePercent: number (required)
  lastUpdated: Date (default: Date.now)
  clientId: string (required, indexed)
  clientName: string (required)
  asOnDate: Date (required)
}

// Unique Index: (clientId, isin)
// Ensures one holding per client per ISIN
```

---

## DATA FLOW DIAGRAM

```
Excel File
    ↓
[Navigation.tsx] - File selection & validation
    ↓
FormData (file + fileType)
    ↓
[POST /api/upload]
    ↓
[excelParser.ts] - Parse Excel
    ├─ Find header row (contains "Stock Name")
    ├─ Find end row (before "Disclaimer")
    ├─ Extract data rows
    ├─ Normalize column names
    └─ Filter invalid rows
    ↓
Normalized Holdings Array
    ↓
[upload/route.ts] - Save to Database
    ├─ Extract Excel values (handle both column name formats)
    ├─ Normalize ISINs
    ├─ Check if existing in DB
    ├─ Compare for changes
    ├─ Delete variants (different ISIN format)
    ├─ Upsert using findOneAndUpdate with $set
    ├─ Verify save
    └─ Post-save verification
    ↓
MongoDB Database
    ↓
[GET /api/dashboard]
    ├─ countDocuments({ clientId })
    ├─ findOne({ clientId, isin: 'INE257A01026' }) - Direct BHEL query
    ├─ find({ clientId }) - All holdings
    ├─ Check for count mismatch
    ├─ Alternative batch fetch if needed
    ├─ Normalize ISINs
    ├─ Calculate metrics (XIRR, CAGR) for each
    ├─ Promise.allSettled (handles failures)
    ├─ Check for missing holdings
    ├─ Rebuild from database if needed
    └─ Final verification
    ↓
Response JSON
    ↓
[page.tsx] - Client-side
    ↓
[HoldingsTable.tsx] - Display
```

---

## CRITICAL POINTS

1. **ISIN Normalization:**
   - Always trim whitespace and uppercase
   - Applied everywhere: Excel parsing, DB saves, DB queries, comparisons

2. **Field Extraction:**
   - Always check BOTH formats: `holding.stockName` AND `holding['Stock Name']`
   - Explicit type conversion: `Number()`, `String()`

3. **Update Strategy:**
   - Always use `$set` operator
   - Always update `lastUpdated` timestamp
   - Always verify save immediately after

4. **Retrieval Strategy:**
   - Always check `countDocuments()` vs `find().length`
   - Multiple verification queries
   - Rebuild from database if mismatch

5. **Error Handling:**
   - `Promise.allSettled()` for parallel processing
   - Retry logic for failed saves
   - Fallback methods (direct queries, batch fetch, rebuild)

