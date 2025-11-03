# Cron-Job.org Setup Guide

This guide will help you set up [cron-job.org](https://cron-job.org/en/) to automatically trigger your stock data refresh daily at 7:00 PM IST.

---

## Step 1: Get Your Deployment URL

First, you need to know your deployed application URL:

- **Vercel**: `https://your-app-name.vercel.app`
- **Render**: `https://your-app-name.onrender.com`

**Example**: `https://portfolio-dashboard-abc123.vercel.app`

---

## Step 2: Create Account on Cron-Job.org

1. **Go to**: https://cron-job.org/en/
2. **Click**: "Sign up" (top right)
3. **Choose**:
   - Sign up with email, or
   - Sign up with GitHub (recommended - faster)
4. **Complete** the registration process

---

## Step 3: Create Your First Cron Job

1. **After logging in**, you'll see the dashboard
2. **Click**: "Create cronjob" button (big green button)

---

## Step 4: Configure the Cron Job

Fill in the following details:

### Basic Settings

1. **Title**: 
   ```
   Daily Stock Data Refresh - 7 PM IST
   ```

2. **Address (URL)**: 
   ```
   https://YOUR-APP-URL.vercel.app/api/cron-trigger
   ```
   **Replace `YOUR-APP-URL` with your actual deployment URL**
   
   **Example**: 
   ```
   https://portfolio-dashboard-abc123.vercel.app/api/cron-trigger
   ```

3. **Schedule**: 
   - **Option 1** (Recommended): Select "Custom"
   - **Minutes**: `0`
   - **Hours**: `13` (7 PM IST = 1:30 PM UTC, but we need to adjust)
   - **Day of month**: `*`
   - **Month**: `*`
   - **Day of week**: `*`
   
   **IMPORTANT**: IST (Indian Standard Time) is UTC+5:30
   - 7:00 PM IST = 1:30 PM UTC (13:30 UTC)
   - So set: **Hours**: `13`, **Minutes**: `30`
   
   **OR use the Schedule Builder**:
   - Click "Schedule Builder"
   - Select "Every day"
   - Set time to: **13:30** (1:30 PM UTC = 7:00 PM IST)

4. **Request Method**: 
   - Select: **GET**

5. **Request Headers** (Optional but recommended):
   - Click "Add header"
   - **Name**: `User-Agent`
   - **Value**: `Cron-Job-Bot/1.0`

### Advanced Settings (Optional)

6. **Request Body**: 
   - Leave empty (we're using GET method)

7. **Timeout** (Important):
   - Set to: **60 seconds** (or higher)
   - The endpoint returns immediately, so this is fine

8. **Notifications**:
   - Enable "Notify on failure" if you want email alerts
   - Enter your email address

---

## Step 5: Add Security (Recommended)

For better security, you can add a secret key:

### A. Set Environment Variable

1. **Go to your Vercel/Render dashboard**
2. **Navigate to**: Settings → Environment Variables
3. **Add**:
   - **Key**: `CRON_SECRET_KEY`
   - **Value**: Generate a random string (e.g., `abc123xyz789secret`)
   - **Environment**: Production
4. **Save** and **redeploy** your application

### B. Update Cron Job URL

Update your cron job URL to include the secret:

```
https://YOUR-APP-URL.vercel.app/api/cron-trigger?secret=abc123xyz789secret
```

**Replace `abc123xyz789secret` with your actual secret key**

---

## Step 6: Test Your Cron Job

1. **Click**: "Execute now" button (next to your cron job)
2. **Check**: 
   - The status should show "Success" (green)
   - Response should show: `{"success":true,"message":"Stock data refresh started in background"}`
3. **Verify**: Check your application logs to see if the refresh started

---

## Step 7: Monitor Your Cron Job

### View Execution History

1. **Click** on your cron job name
2. **Go to**: "Execution history" tab
3. **You'll see**:
   - All past executions
   - Response codes
   - Response times
   - Any errors

### Check Execution Status

- **Green checkmark**: Success
- **Red X**: Failed
- **Clock icon**: Scheduled

---

## Step 8: Verify It's Working

After the first execution at 7 PM IST:

1. **Check your database**: Verify that stock data has been updated
2. **Check application logs**: Look for refresh messages
3. **Check cron-job.org history**: Verify the job executed successfully

---

## Troubleshooting

### Issue: Cron job returns 401 Unauthorized

**Solution**: 
- Make sure you added the `CRON_SECRET_KEY` environment variable
- Check that the URL includes the correct `?secret=` parameter
- Redeploy your application after adding the environment variable

### Issue: Cron job times out

**Solution**: 
- This is normal! The endpoint returns immediately and processes in the background
- The timeout is just for the HTTP response, not the actual processing
- Check your application logs to see the background processing

### Issue: Cron job doesn't run at 7 PM IST

**Solution**: 
- Verify the timezone conversion:
  - 7:00 PM IST = 13:30 UTC (1:30 PM UTC)
- Double-check the schedule settings in cron-job.org
- Make sure the timezone is set to UTC in cron-job.org

### Issue: Want to change the schedule

**Solution**:
1. Go to your cron job in cron-job.org
2. Click "Edit"
3. Change the schedule
4. Save

---

## Timezone Reference

**IST (Indian Standard Time) to UTC Conversion**:
- IST is UTC+5:30
- 7:00 PM IST = 1:30 PM UTC (13:30 UTC)
- 7:00 PM IST = 19:00 IST = 13:30 UTC

**Use this in cron-job.org**:
- **Hours**: `13`
- **Minutes**: `30`

---

## Summary

✅ **What you've set up**:
- Automated daily stock data refresh at 7:00 PM IST
- Processes stocks in batches of 250
- 10-minute pauses between batches
- Fetches last 3 days including today for all stocks

✅ **What happens**:
1. Cron-job.org calls your API at 7 PM IST daily
2. Your API starts processing stocks in the background
3. Stocks are processed in batches of 250
4. Each batch waits 10 minutes before processing the next
5. Database is updated with latest stock data

✅ **Monitoring**:
- Check cron-job.org execution history
- Check your application logs
- Verify database updates

---

## Need Help?

- **Cron-job.org FAQ**: https://cron-job.org/en/help/
- **Check your application logs** for detailed processing information
- **Test the endpoint manually**: Visit `https://YOUR-APP-URL/api/cron-trigger` in your browser

