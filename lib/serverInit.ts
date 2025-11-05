/**
 * Server initialization script
 * This runs when the server starts to set up cron jobs
 */
import { setupDailyStockDataRefresh } from './cronJobs';
import { setupNSEDailyDataCron } from './nseDailyDataCron';
import { setupCorporateDataCron } from './corporateDataCron';

let cronJobInitialized = false;

export function initializeServer() {
  if (!cronJobInitialized) {
    try {
      console.log('🚀 Initializing server - Setting up cron jobs...');
      setupDailyStockDataRefresh();
      setupNSEDailyDataCron();
      setupCorporateDataCron();
      cronJobInitialized = true;
      console.log('✅ Server initialization complete - Cron jobs are active');
      console.log('📅 Daily stock data refresh will run at 7:00 PM IST');
      console.log('📅 NSE daily data fetch will run at 5:00 PM IST');
      console.log('📅 Corporate data update will run at 11:45 PM IST');
      console.log('📦 Processing in batches of 250 stocks with 10-minute pauses');
    } catch (error) {
      console.error('❌ Failed to initialize cron jobs:', error);
    }
  } else {
    console.log('ℹ️  Cron jobs already initialized (skipping duplicate initialization)');
  }
}

// Initialize on import (for server-side execution)
if (typeof window === 'undefined') {
  initializeServer();
}

