import { fetchCurrentPriceFromNSE } from '../lib/stockDataService.js';

(async () => {
  console.log('🧪 Testing NSE API for IOC...\n');
  
  try {
    const result = await fetchCurrentPriceFromNSE('IOC');
    if (result) {
      console.log('✅ NSE API Success:');
      console.log(`   Price: ₹${result.price}`);
      console.log(`   Date: ${result.date}`);
      console.log(`   Source: ${result.source}`);
    } else {
      console.log('❌ NSE API returned null');
    }
  } catch (error) {
    console.error('❌ NSE API Error:', error.message);
    console.error('   Stack:', error.stack);
  }
  
  process.exit(0);
})();

