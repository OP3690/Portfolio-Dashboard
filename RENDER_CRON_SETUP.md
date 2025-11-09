# Render.com Cron Server Setup

This guide explains how to set up an automated daily stock data refresh on Render.com.

## Overview

Render.com provides always-on infrastructure, making it perfect for running cron jobs. This script will:
- ✅ Run continuously on Render
- ✅ Trigger daily stock data refresh at 7:00 PM IST
- ✅ Fetch last 3 days of data for ALL stocks
- ✅ Use NSE API (with session cookies) for accurate prices
- ✅ Handle stocks with no data properly

## Setup Instructions

### Step 1: Create Background Worker Service on Render

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Click**: "New +" → "Background Worker"
3. **Configure the service**:
   - **Name**: `portfolio-cron-server` (or any name you prefer)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node scripts/render-cron-server.mjs`
   - **Region**: Choose closest to your database
   - **Branch**: `main` (or your default branch)

### Step 2: Set Environment Variables

In the Render service settings, add these environment variables:

1. **MONGODB_URI** (Required)
   - Your MongoDB connection string
   - Example: `mongodb+srv://user:pass@cluster.mongodb.net/dbname`

2. **CRON_SECRET_KEY** (Optional, for security)
   - Any secret string
   - Example: `your-secret-key-here`

3. **NEXT_PUBLIC_APP_URL** (Optional)
   - Your app URL (if needed)
   - Example: `https://your-app.onrender.com`

### Step 3: Deploy

1. **Click**: "Create Background Worker"
2. **Wait** for the build to complete
3. **Check logs** to verify it's running

### Step 4: Verify It's Working

1. **Check Render logs**:
   - Go to your service → "Logs" tab
   - You should see: `✅ Daily stock data refresh cron job scheduled successfully!`
   - You should see: `⏰ Next run: Tomorrow at 7:00 PM IST`

2. **Wait for 7:00 PM IST** or trigger manually:
   - You can temporarily modify the script to trigger immediately (see below)
   - Or wait for the scheduled time

3. **Check logs after refresh**:
   - Look for: `✅ Render Cron: Refresh completed!`
   - Check: `✅ Stocks processed: X`
   - Check: `✅ Records fetched: X`

## Testing the Cron Server

### Option 1: Test on Startup (Temporary)

Edit `scripts/render-cron-server.mjs` and uncomment this line:

```javascript
// Optional: Trigger immediately on startup (for testing)
console.log('🧪 Testing refresh on startup...');
await triggerRefresh();
```

This will trigger the refresh immediately when the service starts.

### Option 2: Wait for Scheduled Time

The cron job will automatically run at 7:00 PM IST daily.

### Option 3: Manual Trigger via API

You can also manually trigger the refresh by calling:

```bash
curl "https://YOUR-APP-URL.onrender.com/api/cron-trigger?secret=YOUR_SECRET_KEY"
```

## What Gets Refreshed

✅ **All stocks** in StockMaster (not just holdings)  
✅ **Last 3 days** including today (today + yesterday + day before yesterday)  
✅ **Priority**: Holdings first, then other stocks  
✅ **Source**: NSE API (for NSE stocks) → Yahoo Finance (fallback)  
✅ **Handles stocks with no data**: Stocks like IOCL that have no historical data will get today's price

**Important**: The refresh fetches **last 3 days** for **ALL stocks** when `refreshAllStocks=true` is set. This ensures:
- Today's prices are always up-to-date
- Yesterday and day-before-yesterday are refreshed in case of any data issues
- All stocks in your database get refreshed, not just current holdings

## Schedule Details

- **Time**: 7:00 PM IST (19:00 IST) daily
- **Cron Schedule**: `0 19 * * *` (using IST timezone)
- **Duration**: Typically 5-15 minutes depending on number of stocks

## Monitoring

### Success Indicators

Look for these in Render logs:
- `✅ NSE API: SYMBOL (ISIN) - Price: ₹XXX`
- `✅ Render Cron: Refresh completed!`
- `✅ Stocks processed: X`
- `✅ Records fetched: X`

### Failure Indicators

Watch for:
- `⚠️ NSE API failed` (will fallback to Yahoo Finance - this is OK)
- `❌ Error refreshing ISIN` (check specific stock)
- `❌ Render Cron: Failed to trigger refresh` (check error message)

## Troubleshooting

### Issue: Service not starting

**Check:**
1. Are environment variables set correctly?
2. Is MONGODB_URI valid?
3. Check Render logs for startup errors

**Fix:**
- Verify MONGODB_URI is correct
- Check that all required packages are installed
- Review error messages in logs

### Issue: Cron not running

**Check:**
1. Is the service running? (Check Render dashboard)
2. Are there any errors in logs?
3. Is the timezone correct? (Should be IST)

**Fix:**
- Verify service is "Live" in Render dashboard
- Check logs for cron scheduling messages
- Ensure timezone is set to "Asia/Kolkata"

### Issue: Prices not updating

**Check:**
1. Are NSE API calls succeeding? (Look for `✅ NSE API` messages)
2. Is the date correct? (Should be today's date)
3. Are there any errors in logs?

**Fix:**
- The refresh now handles stocks with no data
- NSE API with session cookies should work reliably
- If NSE fails, it falls back to Yahoo Finance automatically

## Cost Considerations

- **Render Free Tier**: 750 hours/month (enough for 1 always-on service)
- **Background Workers**: Free tier includes background workers
- **Database**: Uses your existing MongoDB (no additional cost)

## Alternative: Use Render Cron Jobs (If Available)

If Render offers cron jobs feature:
1. Create a cron job
2. Schedule: `0 19 * * *` (7:00 PM IST)
3. Command: `curl "https://YOUR-APP-URL.onrender.com/api/cron-trigger?secret=YOUR_SECRET_KEY"`

## Next Steps

1. ✅ Create Background Worker service on Render
2. ✅ Set environment variables
3. ✅ Deploy and verify it's running
4. ✅ Monitor logs for first few days
5. ✅ Verify prices are updating correctly

The cron server will now run continuously on Render and automatically refresh stock data daily at 7:00 PM IST!

