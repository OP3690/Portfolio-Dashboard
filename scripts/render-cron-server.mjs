/**
 * Render.com Cron Server
 * 
 * This script runs as a separate service on Render.com to trigger daily stock data refresh
 * It runs continuously and triggers the refresh at 7:00 PM IST daily
 * 
 * To use this on Render:
 * 1. Create a new "Background Worker" service
 * 2. Set the start command to: node scripts/render-cron-server.mjs
 * 3. Set environment variables (MONGODB_URI, NEXT_PUBLIC_APP_URL, CRON_SECRET_KEY)
 * 4. Deploy
 * 
 * This ensures the cron job runs reliably on Render's always-on infrastructure
 */

import cron from 'node-cron';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
const envPath = join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      if (value) {
        process.env[key.trim()] = value;
      }
    }
  });
}

// Also load from .env if it exists
const envPath2 = join(__dirname, '../.env');
if (fs.existsSync(envPath2)) {
  const envContent = fs.readFileSync(envPath2, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      if (value) {
        process.env[key.trim()] = value;
      }
    }
  });
}

// Get app URL from environment or construct it
function getAppUrl() {
  // Try environment variable first
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  
  // Try Render environment variable
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL;
  }
  
  // Try Vercel environment variable
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  // Default to localhost (for local testing)
  return 'http://localhost:3000';
}

// Trigger refresh by calling the API endpoint
async function triggerRefresh() {
  try {
    console.log('\n🔄 ========================================');
    console.log('🔄 Render Cron: Starting daily stock data refresh...');
    console.log(`🕐 Time: ${new Date().toLocaleString()}`);
    console.log('🔄 Using new refresh logic with NSE API support');
    console.log('🔄 Fetching last 3 days for ALL stocks');
    console.log('🔄 ========================================\n');
    
    const appUrl = getAppUrl();
    const cronSecret = process.env.CRON_SECRET_KEY;
    
    // Build the URL
    let refreshUrl = `${appUrl}/api/cron-trigger`;
    if (cronSecret) {
      refreshUrl += `?secret=${encodeURIComponent(cronSecret)}`;
    }
    
    console.log(`🌐 Calling: ${refreshUrl.replace(cronSecret || '', '***')}`);
    
    // Call the cron-trigger endpoint which handles the refresh
    const response = await axios.get(refreshUrl, {
      timeout: 300000, // 5 minutes timeout
      headers: {
        'User-Agent': 'Render-Cron-Server/1.0',
      },
    });
    
    const resultData = response.data;
    
    if (resultData.success) {
      console.log('\n✅ ========================================');
      console.log('✅ Render Cron: Refresh completed!');
      console.log(`✅ Message: ${resultData.message || 'Success'}`);
      
      if (resultData.details) {
        console.log(`✅ Stocks processed: ${resultData.details.stocksProcessed || 0}`);
        console.log(`✅ Records fetched: ${resultData.details.totalRecords || 0}`);
        console.log(`✅ Found in DB: ${resultData.details.foundInDatabase || 0}`);
        console.log(`✅ Refreshed: ${resultData.details.stocksWith5YearData || 0}`);
        console.log(`✅ Fetched 5-year: ${resultData.details.stocksFetched5Year || 0}`);
        console.log(`⏱️  Duration: ${resultData.details.duration || 'N/A'}`);
      }
      
      console.log(`🕐 Completed at: ${new Date().toLocaleString()}`);
      console.log('✅ ========================================\n');
    } else {
      console.error('\n❌ ========================================');
      console.error('❌ Render Cron: Refresh failed');
      console.error(`❌ Error: ${resultData.error || 'Unknown error'}`);
      console.error('❌ ========================================\n');
    }
  } catch (error) {
    console.error('\n❌ ========================================');
    console.error('❌ Render Cron: Failed to trigger refresh');
    console.error(`❌ Error: ${error.message}`);
    if (error.response) {
      console.error(`❌ Status: ${error.response.status}`);
      console.error(`❌ Response: ${JSON.stringify(error.response.data)}`);
    }
    if (error.stack) {
      console.error('❌ Stack:', error.stack);
    }
    console.error('❌ ========================================\n');
  }
}

// Schedule: 7:00 PM IST every day
// Cron format: minute hour * * * (day of month, month, day of week)
// Using IST timezone
const cronSchedule = '0 19 * * *';

console.log('🚀 Render Cron Server Starting...');
console.log('📅 Setting up daily stock data refresh cron job...');
console.log(`⏰ Schedule: Daily at 7:00 PM IST (${cronSchedule})`);
console.log(`📊 Scope: ALL stocks in StockMaster`);
console.log(`📅 Data Range: Last 3 days (today + yesterday + day before yesterday)`);
console.log(`🌐 Uses: NSE API (with session cookies) + Yahoo Finance fallback`);
console.log(`🔄 Refresh Logic: refreshLatest=true, refreshAllStocks=true`);
console.log(`✅ Handles stocks with no data (like IOCL)`);
console.log('');

// Schedule the cron job
cron.schedule(cronSchedule, async () => {
  await triggerRefresh();
}, {
  scheduled: true,
  timezone: "Asia/Kolkata" // Indian Standard Time
});

console.log('✅ Daily stock data refresh cron job scheduled successfully!');
console.log('⏰ Next run: Tomorrow at 7:00 PM IST');
console.log('💡 This service will run continuously on Render');
console.log('');

// Optional: Trigger immediately on startup (for testing)
// Uncomment the line below to test the refresh on startup
// console.log('🧪 Testing refresh on startup...');
// await triggerRefresh();

// Keep the process alive
console.log('🔄 Cron server is running. Waiting for scheduled time...');
console.log('Press Ctrl+C to stop\n');

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Render Cron Server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down Render Cron Server...');
  process.exit(0);
});

