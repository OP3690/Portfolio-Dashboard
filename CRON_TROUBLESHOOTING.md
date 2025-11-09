# Cron Job Troubleshooting Guide

## Issue: Latest Stock Date Not Updating

If you're seeing "Latest Stock Date: 07/11/2025" when today is 09/11/2025, the cron job is not running or not updating the data.

## Quick Fix: Manual Refresh

### Option 1: Use the "Refresh Stock Data" Button
1. Go to the Dashboard
2. Click the green "Refresh Stock Data" button (next to "Latest Stock Date")
3. Wait for it to complete (this will refresh ALL stocks, not just holdings)

### Option 2: Trigger via API
```bash
# For local development
curl -X POST "http://localhost:3000/api/fetch-historical-data?refreshAllStocks=true" \
  -H "Content-Type: application/json" \
  -d '{"refreshLatest": true}'

# For production (replace with your URL)
curl -X POST "https://YOUR-APP-URL.vercel.app/api/fetch-historical-data?refreshAllStocks=true" \
  -H "Content-Type: application/json" \
  -d '{"refreshLatest": true}'
```

### Option 3: Trigger Cron Endpoint
```bash
# For local development
curl "http://localhost:3000/api/cron-trigger"

# For production (with secret key if configured)
curl "https://YOUR-APP-URL.vercel.app/api/cron-trigger?secret=YOUR_SECRET_KEY"
```

## Why Cron Might Not Be Running

### 1. Vercel Cron (Serverless)
- **Check**: Go to Vercel Dashboard → Your Project → Settings → Cron Jobs
- **Verify**: The cron job is listed and enabled
- **Schedule**: Should be `30 13 * * *` (7:00 PM IST = 13:30 UTC)
- **Note**: Vercel Cron only works on Production deployments, not Preview deployments

### 2. Render.com Background Worker
- **Check**: Go to Render Dashboard → Your Background Worker
- **Verify**: The worker is running (status should be "Live")
- **Check Logs**: Look for cron execution logs at 7:00 PM IST
- **Verify Script**: Make sure `scripts/render-cron-server.mjs` is running

### 3. External Cron Service (cron-job.org)
- **Check**: Log in to cron-job.org
- **Verify**: The cron job is active and hasn't failed
- **Check Logs**: Look for execution history
- **Verify URL**: Make sure the URL is correct and accessible

## Verify Cron is Working

### Check Server Logs
Look for these log messages at 7:00 PM IST:
```
🔄 ========================================
🔄 Cron trigger: Starting daily stock data refresh...
🕐 Time: [timestamp]
🔄 Using new refresh logic with NSE API support
🔄 Fetching last 3 days for ALL stocks in StockMaster
🔄 ========================================
```

### Check Database
After cron runs, verify the latest date:
```bash
curl "http://localhost:3000/api/latest-stock-date"
```

Should return today's date (or yesterday if market was closed).

## Common Issues

### Issue 1: Cron Runs But No Data Updates
**Cause**: MongoDB connection timeout or API rate limiting
**Solution**: 
- Check MongoDB connection string
- Check server logs for errors
- Verify NSE API is accessible

### Issue 2: Cron Runs But Only Holdings Updated
**Cause**: `refreshAllStocks` parameter not set
**Solution**: 
- Verify cron trigger includes `refreshAllStocks=true`
- Check `vercel.json` cron configuration
- Check Render cron server script

### Issue 3: Cron Not Running at All
**Cause**: Cron service not configured or disabled
**Solution**:
- Set up Vercel Cron (for Vercel deployments)
- Set up Render Background Worker (for Render deployments)
- Set up external cron service (cron-job.org) as backup

## Testing Cron Manually

### Test Cron Trigger Endpoint
```bash
# Test locally
curl "http://localhost:3000/api/cron-trigger"

# Test in production
curl "https://YOUR-APP-URL.vercel.app/api/cron-trigger?secret=YOUR_SECRET_KEY"
```

### Expected Response
```json
{
  "success": true,
  "message": "Stock data refresh completed successfully",
  "details": {
    "stocksProcessed": 2000,
    "totalRecords": 6000,
    "duration": "5.23 minutes",
    "completedAt": "2025-11-09T13:30:00.000Z"
  }
}
```

## Schedule Details

- **Time**: 7:00 PM IST (19:00 IST) daily
- **UTC Time**: 13:30 UTC (1:30 PM UTC)
- **Cron Expression**: `30 13 * * *` (UTC) or `0 19 * * *` (IST)
- **What It Does**: Fetches last 3 days of data for ALL stocks in StockMaster

## Next Steps

1. **Immediate**: Use "Refresh Stock Data" button to update data now
2. **Short-term**: Verify cron is configured and running
3. **Long-term**: Set up monitoring/alerts for cron failures

