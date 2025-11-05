import axios from 'axios';
import StockMaster from '@/models/StockMaster';
import StockData from '@/models/StockData';
import connectDB from './mongodb';
import { format, parse } from 'date-fns';

/**
 * Fetch comprehensive data from NSE API
 * API: https://www.nseindia.com/api/quote-equity?symbol=SYMBOL
 */
export async function fetchNSEDailyData(symbol: string): Promise<{
  // Daily fields (based on lastUpdateTime date)
  totalTradedVolume?: number;
  totalBuyQuantity?: number;
  totalSellQuantity?: number;
  lastUpdateTime?: Date;
  
  // Stock-level fields (update only if changed)
  industry?: string;
  isFNOSec?: boolean;
  pdSectorInd?: string;
  pdSectorPe?: number;
  pdSymbolPe?: number;
} | null> {
  try {
    if (!symbol) {
      return null;
    }

    const nseUrl = `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`;
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': `https://www.nseindia.com/quote-equity?symbol=${encodeURIComponent(symbol)}`,
      'Origin': 'https://www.nseindia.com',
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    };
    
    const response = await axios.get(nseUrl, {
      timeout: 10000,
      headers: headers,
      maxRedirects: 5,
      validateStatus: (status) => status < 500,
    });

    if (response.status === 200 && response.data) {
      const data = response.data;
      
      // Parse lastUpdateTime from metadata
      let lastUpdateDate: Date | undefined;
      if (data.metadata?.lastUpdateTime) {
        try {
          // Parse format: "04-Nov-2025 16:00:00"
          const dateStr = data.metadata.lastUpdateTime;
          // Try parsing with date-fns format
          lastUpdateDate = parse(dateStr, 'dd-MMM-yyyy HH:mm:ss', new Date());
          // If parsing failed, try native Date parsing
          if (isNaN(lastUpdateDate.getTime())) {
            lastUpdateDate = new Date(dateStr);
          }
          // If still invalid, use current date
          if (isNaN(lastUpdateDate.getTime())) {
            lastUpdateDate = new Date();
          }
          // Set time to start of day (00:00:00) for date-based storage
          lastUpdateDate.setHours(0, 0, 0, 0);
        } catch (e) {
          // If parsing fails, use current date
          lastUpdateDate = new Date();
          lastUpdateDate.setHours(0, 0, 0, 0);
        }
      }
      
      // Extract daily fields from preOpenMarket
      const preOpenMarket = data.preOpenMarket || {};
      const totalTradedVolume = preOpenMarket.totalTradedVolume;
      const totalBuyQuantity = preOpenMarket.totalBuyQuantity;
      const totalSellQuantity = preOpenMarket.totalSellQuantity;
      
      // Extract stock-level fields
      const info = data.info || {};
      const metadata = data.metadata || {};
      
      return {
        // Daily fields
        totalTradedVolume: typeof totalTradedVolume === 'number' ? totalTradedVolume : undefined,
        totalBuyQuantity: typeof totalBuyQuantity === 'number' ? totalBuyQuantity : undefined,
        totalSellQuantity: typeof totalSellQuantity === 'number' ? totalSellQuantity : undefined,
        lastUpdateTime: lastUpdateDate,
        
        // Stock-level fields
        industry: info.industry || undefined,
        isFNOSec: typeof info.isFNOSec === 'boolean' ? info.isFNOSec : undefined,
        pdSectorInd: metadata.pdSectorInd || undefined,
        pdSectorPe: typeof metadata.pdSectorPe === 'number' ? metadata.pdSectorPe : undefined,
        pdSymbolPe: typeof metadata.pdSymbolPe === 'number' ? metadata.pdSymbolPe : undefined,
      };
    }
  } catch (error: any) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.debug(`⚠️  NSE API access denied (${error.response.status}) for ${symbol}`);
    } else {
      console.debug(`⚠️  NSE API error for ${symbol}: ${error.message || 'Unknown error'}`);
    }
  }
  
  return null;
}

/**
 * Store daily NSE data for a single stock
 */
export async function storeNSEDailyData(isin: string, symbol: string): Promise<boolean> {
  try {
    await connectDB();
    
    // Fetch data from NSE API
    const nseData = await fetchNSEDailyData(symbol);
    
    if (!nseData) {
      return false;
    }
    
    // Get stock master record
    const stockMaster = await StockMaster.findOne({ isin }).lean();
    if (!stockMaster) {
      console.warn(`⚠️  StockMaster not found for ISIN: ${isin}`);
      return false;
    }
    
    // Update StockMaster fields only if changed
    const updateFields: any = {};
    const stockMasterDoc = stockMaster as any;
    
    if (nseData.industry !== undefined && stockMasterDoc.industry !== nseData.industry) {
      updateFields.industry = nseData.industry;
    }
    if (nseData.isFNOSec !== undefined && stockMasterDoc.isFNOSec !== nseData.isFNOSec) {
      updateFields.isFNOSec = nseData.isFNOSec;
    }
    if (nseData.pdSectorInd !== undefined && stockMasterDoc.pdSectorInd !== nseData.pdSectorInd) {
      updateFields.pdSectorInd = nseData.pdSectorInd;
    }
    if (nseData.pdSectorPe !== undefined && stockMasterDoc.pdSectorPe !== nseData.pdSectorPe) {
      updateFields.pdSectorPe = nseData.pdSectorPe;
    }
    if (nseData.pdSymbolPe !== undefined && stockMasterDoc.pdSymbolPe !== nseData.pdSymbolPe) {
      updateFields.pdSymbolPe = nseData.pdSymbolPe;
    }
    
    // Update StockMaster if any fields changed
    if (Object.keys(updateFields).length > 0) {
      updateFields.lastUpdated = new Date();
      await StockMaster.findOneAndUpdate(
        { isin },
        { $set: updateFields },
        { upsert: false }
      );
      console.log(`✅ Updated StockMaster for ${symbol} (${isin}): ${Object.keys(updateFields).join(', ')}`);
    }
    
    // Store daily fields in StockData based on lastUpdateTime date
    if (nseData.lastUpdateTime) {
      const date = nseData.lastUpdateTime;
      
      // Find or create StockData entry for this date
      const stockDataUpdate: any = {
        isin,
        stockName: stockMasterDoc.stockName || '',
        symbol: symbol,
        exchange: stockMasterDoc.exchange || 'NSE',
        date: date,
        lastUpdated: new Date(),
      };
      
      // Add daily volume fields if available
      if (nseData.totalTradedVolume !== undefined) {
        stockDataUpdate.totalTradedVolume = nseData.totalTradedVolume;
      }
      if (nseData.totalBuyQuantity !== undefined) {
        stockDataUpdate.totalBuyQuantity = nseData.totalBuyQuantity;
      }
      if (nseData.totalSellQuantity !== undefined) {
        stockDataUpdate.totalSellQuantity = nseData.totalSellQuantity;
      }
      
      // Upsert StockData entry
      await StockData.findOneAndUpdate(
        { isin, date },
        { $set: stockDataUpdate },
        { upsert: true, new: true }
      );
      
      console.log(`✅ Stored daily data for ${symbol} (${isin}) on ${format(date, 'yyyy-MM-dd')}`);
      return true;
    }
    
    return false;
  } catch (error: any) {
    console.error(`❌ Error storing NSE daily data for ${isin}:`, error.message);
    return false;
  }
}

/**
 * Process all stocks and store NSE daily data
 */
export async function processAllStocksNSEDailyData(): Promise<{
  total: number;
  processed: number;
  failed: number;
  errors: string[];
}> {
  try {
    await connectDB();
    
    // Get all NSE stocks from StockMaster
    const allStocks = await StockMaster.find({ exchange: 'NSE' })
      .select('isin symbol')
      .lean();
    
    const uniqueStocks = allStocks.filter((s: any) => s.symbol && s.isin);
    const total = uniqueStocks.length;
    
    console.log(`📊 Processing ${total} NSE stocks for daily data...`);
    
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];
    
    // Process in batches to avoid rate limiting
    const BATCH_SIZE = 50;
    const DELAY_MS = 300; // 300ms delay between stocks
    
    for (let i = 0; i < uniqueStocks.length; i += BATCH_SIZE) {
      const batch = uniqueStocks.slice(i, i + BATCH_SIZE);
      
      console.log(`\n📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(total / BATCH_SIZE)} (stocks ${i + 1}-${Math.min(i + BATCH_SIZE, total)})...`);
      
      const batchPromises = batch.map(async (stock: any) => {
        try {
          const success = await storeNSEDailyData(stock.isin, stock.symbol);
          if (success) {
            processed++;
          } else {
            failed++;
            errors.push(`${stock.symbol} (${stock.isin}): Failed to fetch/store data`);
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        } catch (error: any) {
          failed++;
          errors.push(`${stock.symbol} (${stock.isin}): ${error.message || 'Unknown error'}`);
        }
      });
      
      await Promise.all(batchPromises);
      
      // Pause between batches
      if (i + BATCH_SIZE < uniqueStocks.length) {
        console.log(`⏸️  Pausing 2 seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`\n✅ Processing complete:`);
    console.log(`   - Total stocks: ${total}`);
    console.log(`   - Processed: ${processed}`);
    console.log(`   - Failed: ${failed}`);
    if (errors.length > 0) {
      console.log(`   - Errors: ${errors.slice(0, 10).join(', ')}`);
      if (errors.length > 10) {
        console.log(`   ... and ${errors.length - 10} more errors`);
      }
    }
    
    return {
      total,
      processed,
      failed,
      errors,
    };
  } catch (error: any) {
    console.error('❌ Error processing all stocks:', error.message);
    throw error;
  }
}

