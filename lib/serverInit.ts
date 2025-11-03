/**
 * Server initialization script
 * This runs when the server starts to set up cron jobs
 */
import { setupDailyStockDataRefresh } from './cronJobs';

let cronJobInitialized = false;

export function initializeServer() {
  if (!cronJobInitialized) {
    try {
      setupDailyStockDataRefresh();
      cronJobInitialized = true;
      console.log('🚀 Server initialization complete - Cron jobs are active');
    } catch (error) {
      console.error('❌ Failed to initialize cron jobs:', error);
    }
  }
}

// Initialize on import (for server-side execution)
if (typeof window === 'undefined') {
  initializeServer();
}

