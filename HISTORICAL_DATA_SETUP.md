# Historical Data Setup Guide

## Overview

This system now stores **5 years of historical OHLC data** for all stocks in `stockmasters` into the `stockdatas` collection. The system is optimized to:
- **Prevent duplicates** using a unique index on `(isin, date)`
- **Fetch only last 3 days** daily (including today) to keep data fresh
- **Use database data first** for all calculations to ensure fast performance

## Database Structure

### StockData Collection
- **Unique Index**: `{ isin: 1, date: 1 }` - Prevents duplicate entries automatically
- **Fields Stored**:
  - OHLC: `open`, `high`, `low`, `close`
  - Volume: `volume`, `averageVolume`, `regularMarketVolume`
  - Price/Range: `currentPrice`, `fiftyTwoWeekHigh`, `fiftyTwoWeekLow`
  - Fundamentals: `trailingPE`, `forwardPE`, `priceToBook`, `marketCap`, `dividendYield`
  - Metadata: `isin`, `stockName`, `symbol`, `exchange`, `date`, `lastUpdated`

### Data Flow
1. **Initial 5-Year Fetch**: One-time bulk fetch for all stocks
2. **Daily Refresh**: Automatically fetches last 3 days (today + yesterday + day before) at 7:00 PM IST
3. **Calculations**: All APIs use `stockdatas` collection first, external APIs only if needed

## Endpoints

### 1. Fetch 5-Year Historical Data (One-Time)
**Endpoint**: `GET /api/fetch-5year-data`

**Purpose**: Fetch and store 5 years of historical OHLC data for all stocks in `stockmasters`.

**Usage**:
```bash
# Visit in browser or use curl
https://YOUR-APP-URL.vercel.app/api/fetch-5year-data
```

**What it does**:
- Checks which stocks already have 5-year data (>= 1000 records)
- Fetches 5-year data only for stocks that need it
- Processes in batches of 10 stocks with 2-second delays
- Skips stocks that already have complete data

**Response**:
```json
{
  "success": true,
  "message": "5-year historical data fetch completed",
  "summary": {
    "totalStocks": 2189,
    "stocksWith5YearData": 1500,
    "stocksNeedingData": 689,
    "stocksProcessed": 689,
    "totalDocumentsFetched": 345000,
    "durationMinutes": 45.23
  }
}
```

**Note**: This is a long-running process. For 2,189 stocks, it may take 1-2 hours. The endpoint will complete even if some stocks fail.

### 2. Daily Refresh (Automatic)
**Endpoint**: Automatic via cron job at 7:00 PM IST daily

**What it does**:
- Fetches **only last 3 days** (today + yesterday + day before) for all stocks
- Processes in batches of 250 stocks with 10-minute pauses
- Updates existing records or inserts new ones (duplicates prevented by unique index)
- Prioritizes holdings first, then other stocks

**Manual Trigger**: `POST /api/fetch-historical-data` with `{ "refreshLatest": true }`

### 3. Refresh Stock Data (Manual)
**Endpoint**: `POST /api/fetch-historical-data`

**Body**:
```json
{
  "refreshLatest": true
}
```

**What it does**:
- Fetches last 3 days for all stocks in `stockmasters`
- Prioritizes holdings first
- Checks database first to avoid redundant API calls

## Duplicate Prevention

### Automatic Prevention
The `StockData` model has a **unique compound index** on `(isin, date)`:
```typescript
StockDataSchema.index({ isin: 1, date: 1 }, { unique: true });
```

This ensures:
- **No duplicate entries** for the same ISIN on the same date
- **Upsert behavior**: `findOneAndUpdate` with `upsert: true` will update existing records or insert new ones
- **Database-level enforcement**: MongoDB prevents duplicates even if application logic tries to insert them

### How It Works
1. When fetching data, the system uses `findOneAndUpdate`:
   ```typescript
   await StockData.findOneAndUpdate(
     { isin, date: normalizedDate },
     { $set: updateData },
     { upsert: true, new: true }
   );
   ```
2. If a record with the same `(isin, date)` exists, it updates it
3. If not, it inserts a new record
4. If a duplicate is attempted, MongoDB throws a unique index error (which is caught and ignored)

## Performance Optimizations

### 1. Database-First Approach
All calculation endpoints use `stockdatas` collection first:
- **Dashboard**: Uses `StockData.aggregate()` to get latest prices in one query
- **Stock Analytics**: Fetches historical data from `stockdatas` for monthly returns
- **Stock Research**: Uses `stockdatas` for signal generation

### 2. Aggregation Pipelines
Instead of individual queries, the system uses MongoDB aggregation pipelines:
- **Latest Prices**: Single aggregation to get latest price for all ISINs
- **Today's Data Check**: Single aggregation to check which stocks have today's data
- **5-Year Data Check**: Single aggregation to check which stocks have complete 5-year data

### 3. Caching
- **Price Cache**: Dashboard caches prices per ISIN to avoid repeated queries
- **5-Year Data Check**: Results are cached to avoid repeated checks

## Daily Cron Job

### Schedule
- **Time**: 7:00 PM IST (19:00 IST)
- **Frequency**: Daily
- **Scope**: All stocks in `stockmasters`
- **Batch Size**: 250 stocks per batch
- **Pause**: 10 minutes between batches

### What It Does
1. Connects to database
2. Gets all stocks from `stockmasters`
3. Checks which stocks already have today's data (using aggregation)
4. Fetches last 3 days only for stocks that need it
5. Processes in batches with pauses to avoid rate limiting

### Logs
The cron job logs:
- Batch progress
- Stocks processed
- Records fetched
- Errors (if any)
- Total duration

## Usage Instructions

### Step 1: Initial 5-Year Data Fetch
1. Visit: `https://YOUR-APP-URL.vercel.app/api/fetch-5year-data`
2. Wait for completion (may take 1-2 hours for all stocks)
3. Check response for summary

### Step 2: Verify Data
1. Check database stats: `https://YOUR-APP-URL.vercel.app/db-stats`
2. Verify `stockdatas` collection has expected document count
3. Check that each stock has ~1250 records (5 years × 250 trading days/year)

### Step 3: Daily Refresh (Automatic)
- The cron job runs automatically at 7:00 PM IST
- No action needed - it will fetch last 3 days for all stocks

### Step 4: Manual Refresh (If Needed)
1. Click "Refresh Stock Data" button in the UI
2. Or call: `POST /api/fetch-historical-data` with `{ "refreshLatest": true }`

## Troubleshooting

### Issue: Duplicate Data
**Solution**: The unique index prevents duplicates. If you see duplicates, check:
1. The unique index exists: `db.stockdatas.getIndexes()`
2. The index is on `(isin, date)`
3. If duplicates exist, they may have been inserted before the index was created - use a cleanup script

### Issue: Missing 5-Year Data
**Solution**:
1. Run `/api/fetch-5year-data` again
2. Check logs for errors
3. Verify stocks exist in `stockmasters`

### Issue: Stale Data
**Solution**:
1. Run "Refresh Stock Data" manually
2. Check cron job logs
3. Verify cron job is scheduled correctly

### Issue: Slow Calculations
**Solution**:
1. Ensure indexes exist on `stockdatas` collection
2. Check database stats for storage size
3. Verify aggregation pipelines are being used

## Database Indexes

### Required Indexes
```javascript
// Unique index on (isin, date) - prevents duplicates
db.stockdatas.createIndex({ isin: 1, date: 1 }, { unique: true });

// Index on isin for faster lookups
db.stockdatas.createIndex({ isin: 1 });

// Index on date for date range queries
db.stockdatas.createIndex({ date: -1 });
```

### Verify Indexes
```javascript
// In MongoDB shell or Compass
db.stockdatas.getIndexes();
```

## Storage Estimates

### Per Stock (5 Years)
- **Records**: ~1,250 (5 years × 250 trading days/year)
- **Size per record**: ~0.5 KB
- **Total per stock**: ~625 KB

### All Stocks (2,189 stocks)
- **Total records**: ~2,736,250
- **Total size**: ~1.37 GB (data) + ~0.3 GB (indexes) = ~1.67 GB

### Current Storage
- **Current usage**: 19.02 MB / 512 MB (3.72%)
- **After 5-year fetch**: ~1.67 GB (exceeds free tier)
- **Recommendation**: Upgrade to paid tier or optimize data (remove old data, compress)

## Best Practices

1. **Always use database data first** - External APIs should only be used as fallback
2. **Check today's data first** - Use aggregation to check which stocks need updates
3. **Batch processing** - Process stocks in batches to avoid rate limiting
4. **Monitor storage** - Check `/db-stats` regularly to monitor storage usage
5. **Error handling** - Log errors but continue processing other stocks
6. **Cron scheduling** - Schedule cron job during off-peak hours (7 PM IST is good)

## API Response Examples

### Successful 5-Year Fetch
```json
{
  "success": true,
  "message": "5-year historical data fetch completed",
  "summary": {
    "totalStocks": 2189,
    "stocksWith5YearData": 1500,
    "stocksNeedingData": 689,
    "stocksProcessed": 689,
    "stocksSkipped": 0,
    "stocksFailed": 5,
    "totalDocumentsFetched": 345000,
    "durationMinutes": 45.23
  },
  "results": [...],
  "errors": [...]
}
```

### Successful Daily Refresh
```json
{
  "success": true,
  "message": "Successfully refreshed 2189 stocks (6570 records).",
  "stocksProcessed": 2189,
  "totalRecords": 6570
}
```

## Notes

- **Rate Limiting**: The system includes delays between batches to avoid hitting external API rate limits
- **Error Handling**: Errors are logged but don't stop the entire process
- **Resumable**: If a fetch fails, you can run it again - it will skip stocks that already have data
- **Idempotent**: Running the same fetch multiple times is safe - duplicates are prevented

