# Corporate Data - Implementation Notes

## Current Status

The Stock Intelligence Boards (Financial Results Calendar, Promoter Holding Changes) are implemented and ready to use. However, they require data in the `CorporateInfo` collection.

## Database Space Issue

⚠️ **Current Status:** MongoDB database is at 516 MB / 512 MB (over quota). Cannot add new data until space is freed up.

## Data Sources

### Option 1: NSE API ✅ **WORKING**
The correct NSE API endpoint is:
- `/api/top-corp-info?symbol=SYMBOL&market=equities&series=EQ` - **Returns all corporate data**

This endpoint provides:
- `latest_announcements.data` - Array of announcements
- `corporate_actions.data` - Array of corporate actions
- `financial_results.data` - Array of financial results
- `shareholdings_patterns.data` - Object with dates as keys
- `borad_meeting.data` - Array of board meetings (note: typo in API response)

### Option 2: Web Scraping
The NSE website displays this data, but it's loaded via JavaScript. Would require:
- Puppeteer/Playwright for browser automation
- HTML parsing
- More complex implementation

### Option 3: Alternative Data Sources
- Financial data providers (paid APIs)
- Manual data entry
- CSV imports

## Current Implementation

1. **API Endpoints:**
   - `/api/financial-results-calendar?days=7|15|30|60` - Returns stocks with upcoming results
   - `/api/promoter-holding-changes?type=increasing|decreasing&days=7|15|30` - Returns holding changes

2. **Data Population Scripts:**
   - `scripts/populate-corporate-data-holdings.js` - Fetches real data from NSE API for holdings only (recommended)
   - `scripts/populate-corporate-data.js` - Generates sample data for testing (for all stocks)
   - **Note:** Cannot run due to database space limit (516 MB / 512 MB)

3. **Automatic Fetching:**
   - When viewing a stock in Detailed Stock Analysis, it attempts to fetch corporate data
   - Falls back gracefully if NSE API doesn't return data

## Recommendations

### Short Term:
1. **Free up database space** by:
   - Removing old/unused data
   - Compressing historical stock data
   - Archiving old records

2. **Populate real data from NSE API:**
   - Once space is available, run `scripts/populate-corporate-data-holdings.js`
   - This will fetch real corporate data from NSE API for all holdings
   - The script processes holdings only (minimal database usage)

### Long Term:
1. ✅ **NSE API integration** - Already implemented using `/api/top-corp-info`
2. **Automated daily updates** - Cron job to refresh corporate data
3. **Alternative data providers** (paid APIs) - If NSE API becomes unavailable
4. **CSV import** functionality - For manual data entry

## Testing the Boards

Once data is populated in `CorporateInfo` collection:

1. Navigate to **Stock Research** page
2. Scroll to **Stock Intelligence Boards** section
3. The boards will display:
   - **Financial Results Calendar:** Stocks with upcoming results in next 7/15/30/60 days
   - **Promoter Holding Increasing:** Stocks where promoter holding increased
   - **Promoter Holding Decreasing:** Stocks where promoter holding decreased

## Data Structure

### Financial Results:
```javascript
{
  quarterEnded: Date,
  totalIncome: number, // in Lakhs
  netProfitLoss: number, // in Lakhs
  earningsPerShare: number,
  revenue?: number,
  operatingProfit?: number,
  netProfitMargin?: number
}
```

### Shareholding Patterns:
```javascript
{
  periodEnded: Date,
  promoterAndPromoterGroup: number, // %
  public: number, // %
  sharesHeldByEmployeeTrusts?: number, // %
  foreignInstitutionalInvestors?: number, // %
  domesticInstitutionalInvestors?: number, // %
  other?: number, // %
  total: number // % (should be 100)
}
```

## Next Steps

1. ✅ Code implementation complete
2. ⏸️ Waiting for database space to be freed
3. ⏳ Populate sample/test data
4. 🔄 Implement real data fetching (scraping or alternative APIs)

