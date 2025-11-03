# Testing Guide: Excel Upload and Holdings Display

## Quick Test Steps

### 1. Check Database Directly
Open in browser: `http://localhost:3000/api/test-holdings?clientId=994826`

This will show:
- Total count in database
- Whether BHEL exists
- All ISINs in database

### 2. Check Dashboard API Response
Open in browser: `http://localhost:3000/api/dashboard?clientId=994826`

Look at the JSON response:
- Check `data.holdings.length` - should be 21
- Check if BHEL (ISIN: INE257A01026) is in the `data.holdings` array

### 3. Upload Excel File
1. Click "Upload Excel" button
2. Select your Excel file
3. Wait for upload success message
4. Check browser console for "UPLOAD PARSING DETAILS":
   - `Holdings parsed: 21` ✅
   - `Holdings from Excel: 21` ✅
   - `Holdings in database: 21` ✅
   - `BHEL TRACKING DETAILS` - should show BHEL found ✅

### 4. Check Server Logs (Terminal where Next.js is running)
After upload, look for:
```
📊 Holdings update strategy: Upsert only (no pre-deletion of sold stocks)
✅ Saved: 21/21 holdings
```

After dashboard refresh, look for:
```
API: 📊 Database count: 21, Response count: 20
API: 🔴🔴🔴 USING DATABASE AS SOURCE OF TRUTH - Rebuilding from scratch...
```

### 5. Check Browser Console (F12)
After dashboard loads:
- `Dashboard API Response - Holdings count: 21` ✅
- `✅ BHEL found in API response` ✅
- `HoldingsTable: Received 21 holdings` ✅

## Expected Results

✅ **Upload Success:**
- All 21 holdings parsed from Excel
- All 21 holdings saved to database
- BHEL (INE257A01026) confirmed in database

✅ **Dashboard Display:**
- API returns 21 holdings
- BHEL appears in the holdings table
- Filter dropdowns show "(21)" not "(20)"

## Troubleshooting

### If Upload Shows 21 but Dashboard Shows 20:

1. **Check Server Terminal Logs:**
   - Look for `API: 📊 Database count: X, Response count: Y`
   - If counts don't match, the API should automatically rebuild
   - Look for `API: ✅✅✅ Rebuilt from database. Final count: 21`

2. **Check Browser Network Tab:**
   - Open DevTools → Network
   - Find the `/api/dashboard` request
   - Click it and check the Response
   - Look at `data.holdings.length` and verify BHEL is in the array

3. **Manual Database Check:**
   - Visit: `http://localhost:3000/api/test-holdings?clientId=994826`
   - Verify database has 21 holdings including BHEL

### If Database Has 21 but API Returns 20:

The API has multiple safeguards that should automatically fix this:
1. Check for missing holdings after Promise.allSettled
2. Query database directly if counts don't match
3. Rebuild holdings array from database if needed

Check server logs for which safeguard triggered.

## Test File Requirements

Your Excel file should have:
- **Holdings sheet** with 21 rows of data (including BHEL)
- **Transaction Details sheet**
- **Realized Profit-Loss sheet**
- Blank row before "Disclaimer –" row
- All required columns present

## Success Indicators

✅ Upload: Console shows "21 holdings saved"
✅ Database: `/api/test-holdings` shows 21 holdings
✅ API: `/api/dashboard` JSON response has 21 holdings
✅ UI: Holdings table shows 21 rows
✅ UI: Filter dropdowns show "(21)"

