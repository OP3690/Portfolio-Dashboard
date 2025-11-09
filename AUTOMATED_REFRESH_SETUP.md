# Automated Stock Data Refresh Setup

This guide explains how the automated daily stock data refresh works and how to ensure it runs reliably.

## Overview

The stock data refresh now:
- ✅ Uses NSE API first (with session cookies) for faster, more accurate prices
- ✅ Handles stocks with no data properly (like IOCL)
- ✅ Falls back to Yahoo Finance if NSE API fails
- ✅ Refreshes last 3 days including today for all stocks
- ✅ Works on both serverless (Vercel) and traditional servers

## How It Works

### 1. **Vercel Cron (Recommended for Vercel Deployments)**

If you're using Vercel, the `vercel.json` file is already configured:

```json
{
  "crons": [
    {
      "path": "/api/cron-trigger",
      "schedule": "30 13 * * *"  // 7:00 PM IST (13:30 UTC)
    }
  ]
}
```

**What happens:**
- Vercel automatically calls `/api/cron-trigger` daily at 7:00 PM IST
- The endpoint uses the new refresh logic with NSE API support
- All stocks are refreshed (not just holdings)

**To verify it's working:**
1. Go to your Vercel dashboard
2. Navigate to your project → Settings → Cron Jobs
3. You should see the cron job listed
4. Check the execution history to see if it's running

### 2. **External Cron Service (Alternative)**

If Vercel Cron isn't working or you want a backup, use [cron-job.org](https://cron-job.org):

1. **Create account** at https://cron-job.org
2. **Create a new cron job:**
   - **Title**: Daily Stock Data Refresh - 7 PM IST
   - **URL**: `https://YOUR-APP-URL.vercel.app/api/cron-trigger?secret=YOUR_SECRET_KEY`
   - **Schedule**: `30 13 * * *` (7:00 PM IST = 13:30 UTC)
   - **Request Method**: GET
   - **Headers**: None needed
3. **Set environment variable** in Vercel:
   - Key: `CRON_SECRET_KEY`
   - Value: (any secret string, e.g., `abc123xyz789secret`)
4. **Test**: Click "Execute now" to test

### 3. **Node-Cron (For Always-On Servers)**

If you're running on a traditional server (not serverless), the `node-cron` job will work:

- **Location**: `lib/cronJobs.ts`
- **Schedule**: Daily at 7:00 PM IST
- **Runs automatically** when server starts

**Note**: This does NOT work on Vercel or other serverless platforms.

## Testing the Refresh

### Manual Test

You can manually trigger the refresh:

```bash
# Using curl
curl "https://YOUR-APP-URL.vercel.app/api/cron-trigger?secret=YOUR_SECRET_KEY"

# Or visit in browser
https://YOUR-APP-URL.vercel.app/api/cron-trigger?secret=YOUR_SECRET_KEY
```

### Check Logs

After the cron runs, check your Vercel logs:
1. Go to Vercel Dashboard → Your Project → Logs
2. Filter by "cron-trigger" or "refresh"
3. Look for messages like:
   - `✅ NSE API IOC: Using lastPrice = ₹167.71`
   - `✅ Refresh completed: X stocks processed`

## Troubleshooting

### Issue: Cron job not running

**Solution 1: Check Vercel Cron**
- Go to Vercel Dashboard → Settings → Cron Jobs
- Verify the cron job is listed and enabled
- Check execution history

**Solution 2: Use External Cron**
- Set up cron-job.org as backup
- Use the same URL: `/api/cron-trigger?secret=YOUR_SECRET_KEY`

**Solution 3: Manual Trigger**
- You can manually call the endpoint anytime
- Or use the "Refresh Stock Data" button in the UI

### Issue: Prices not updating

**Check:**
1. Are NSE API calls succeeding? (Check logs for `✅ NSE API` messages)
2. Is the date correct? (Should be today's date at midnight)
3. Are there any errors in the logs?

**Fix:**
- The refresh now handles stocks with no data
- NSE API with session cookies should work reliably
- If NSE fails, it falls back to Yahoo Finance

### Issue: Timezone confusion

**7:00 PM IST = 13:30 UTC**

- Vercel Cron uses UTC timezone
- Schedule: `30 13 * * *` = 13:30 UTC = 19:00 IST (7:00 PM IST)
- Node-cron uses IST timezone directly: `0 19 * * *`

## What Gets Refreshed

- **All stocks** in StockMaster (not just holdings)
- **Last 3 days** including today
- **Priority**: Holdings first, then other stocks
- **Source**: NSE API (for NSE stocks) → Yahoo Finance (fallback)

## Monitoring

### Success Indicators

Look for these in logs:
- `✅ NSE API: SYMBOL (ISIN) - Price: ₹XXX`
- `✅ Refresh completed: X stocks processed`
- `✅ Found X stocks with TODAY's data`

### Failure Indicators

Watch for:
- `⚠️ NSE API failed` (will fallback to Yahoo Finance)
- `❌ Error refreshing ISIN` (check specific stock)
- `⚠️ No valid price found` (data issue)

## Next Steps

1. **Verify Vercel Cron is enabled** (if using Vercel)
2. **Set up cron-job.org as backup** (recommended)
3. **Set CRON_SECRET_KEY** environment variable (for security)
4. **Test manually** to ensure it works
5. **Monitor logs** for the first few days

The refresh should now work reliably and fetch the latest prices from NSE API!

