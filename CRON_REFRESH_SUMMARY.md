# Automated Stock Data Refresh - Summary

## ✅ What Gets Refreshed

When the cron job runs (via `/api/cron-trigger` with `refreshAllStocks=true`):

1. **All Stocks**: Fetches data for ALL stocks in StockMaster (not just holdings)
2. **Last 3 Days**: Fetches last 3 days including today:
   - Today
   - Yesterday  
   - Day before yesterday
3. **Priority Order**:
   - Holdings first (priority)
   - Then all other stocks in StockMaster
4. **Data Source**:
   - **NSE API first** (with session cookies) - faster and more accurate
   - **Yahoo Finance fallback** - if NSE API fails
5. **Handles Missing Data**: Stocks with no historical data (like IOCL) will get today's price

## 🔄 How It Works

### Flow:
1. Cron triggers `/api/cron-trigger` at 7:00 PM IST
2. `/api/cron-trigger` calls `/api/fetch-historical-data` with:
   - `refreshLatest: true` (refreshes last 3 days)
   - `refreshAllStocks: true` (processes ALL stocks)
3. The refresh logic:
   - Checks which stocks have today's data (via aggregation)
   - For stocks needing refresh:
     - Tries NSE API first (for NSE stocks)
     - Falls back to Yahoo Finance if NSE fails
   - For stocks with no data:
     - Fetches today's price via NSE API
     - Falls back to Yahoo Finance if needed
4. Stores data in StockData collection with today's date

### Code Path:
```
/api/cron-trigger (GET)
  ↓
/api/fetch-historical-data (POST)
  - refreshLatest: true
  - refreshAllStocks: true (from query param)
  ↓
For each stock:
  - Try NSE API (if NSE stock)
  - Fallback to fetchAndStoreHistoricalData(isin, false)
    - forceFullUpdate: false = fetches last 3 days only
```

## 📅 Schedule

- **Time**: 7:00 PM IST (19:00 IST) daily
- **Cron Schedule**: `0 19 * * *` (IST timezone)
- **UTC Equivalent**: `30 13 * * *` (13:30 UTC = 19:00 IST)

## 🚀 Setup Options

### Option 1: Vercel Cron (Serverless)
- Already configured in `vercel.json`
- Runs automatically on Vercel
- Schedule: `30 13 * * *` (7:00 PM IST)

### Option 2: Render.com Background Worker
- Use `scripts/render-cron-server.mjs`
- Runs continuously on Render
- Schedule: `0 19 * * *` (7:00 PM IST)
- See `RENDER_CRON_SETUP.md` for details

### Option 3: External Cron Service
- Use cron-job.org or similar
- Call: `https://YOUR-APP-URL/api/cron-trigger?secret=YOUR_SECRET_KEY`
- Schedule: `30 13 * * *` (7:00 PM IST in UTC)

### Option 4: Node-Cron (Always-On Servers)
- Uses `lib/cronJobs.ts`
- Runs when server starts
- Schedule: `0 19 * * *` (7:00 PM IST)

## ✅ Verification

To verify it's working:

1. **Check logs** for:
   - `🔄 Refreshing latest 3 days of data for ALL stocks:`
   - `✅ NSE API: SYMBOL (ISIN) - Price: ₹XXX`
   - `✅ Refresh completed: X stocks processed`

2. **Check database**:
   - StockData should have today's date entries
   - Prices should match NSE API

3. **Check dashboard**:
   - Current prices should be updated
   - Should match NSE prices (e.g., IOCL should show ₹167.71, not ₹169.05)

## 🔍 Troubleshooting

If prices aren't updating:

1. **Check if cron is running**: Look for logs at 7:00 PM IST
2. **Check NSE API**: Look for `✅ NSE API` or `⚠️ NSE API failed` messages
3. **Check date matching**: Ensure today's date entries are being created
4. **Manual trigger**: Call `/api/cron-trigger` manually to test

The refresh now reliably fetches last 3 days for ALL stocks using NSE API!

