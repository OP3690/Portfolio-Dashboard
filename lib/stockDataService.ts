import axios from 'axios';
import StockMaster from '@/models/StockMaster';
import StockData from '@/models/StockData';
import connectDB from './mongodb';
import { subDays, format, parseISO, startOfDay } from 'date-fns';

// Helper to format market cap for logging
function formatMarketCap(mcap: number): string {
  if (mcap >= 10000000000) return `₹${(mcap / 10000000000).toFixed(2)}Cr`;
  if (mcap >= 10000000) return `₹${(mcap / 10000000).toFixed(2)}Cr`;
  if (mcap >= 100000) return `₹${(mcap / 100000).toFixed(2)}L`;
  return `₹${(mcap / 1000).toFixed(2)}K`;
}

// NSE API endpoints (public APIs)
const NSE_BASE_URL = 'https://www.nseindia.com';
const NSE_API_URL = 'https://www.nseindia.com/api/historical/cm/equity';

// Alternative: Using a proxy or different approach for NSE data
// For production, you might need to use paid APIs or scrape with proper headers

interface OHLCData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  // Price / Range
  currentPrice?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  // Volume metrics
  averageVolume?: number;
  regularMarketVolume?: number;
  // Fundamentals
  trailingPE?: number;
  forwardPE?: number;
  priceToBook?: number;
  marketCap?: number;
  dividendYield?: number;
}

/**
 * Fetch historical stock data from NSE (Note: NSE requires session cookies)
 * For now, using a simplified approach - in production use proper NSE API integration
 */
// Cache for NSE session cookies (valid for ~30 minutes)
let nseCookieCache: { cookies: string; timestamp: number } | null = null;
const NSE_COOKIE_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

/**
 * Get NSE session cookies by visiting the main page first
 * This is required for NSE API to work properly
 */
async function getNSESessionCookies(): Promise<string> {
  // Return cached cookies if still valid
  if (nseCookieCache && (Date.now() - nseCookieCache.timestamp) < NSE_COOKIE_CACHE_DURATION) {
    console.log(`✅ Using cached NSE cookies (age: ${Math.round((Date.now() - nseCookieCache.timestamp) / 1000)}s)`);
    return nseCookieCache.cookies;
  }

  try {
    console.log('🔄 Fetching NSE session cookies...');
    // First, visit the main NSE page to get session cookies
    const response = await axios.get('https://www.nseindia.com', {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      maxRedirects: 5,
    });

    // Extract cookies from response headers
    const setCookieHeaders = response.headers['set-cookie'] || [];
    const cookies = setCookieHeaders
      .map((cookie: string) => cookie.split(';')[0])
      .join('; ');

    if (cookies) {
      nseCookieCache = { cookies, timestamp: Date.now() };
      console.log(`✅ Got NSE session cookies (${setCookieHeaders.length} cookies)`);
      return cookies;
    } else {
      console.log(`⚠️  No cookies found in NSE response`);
    }
  } catch (error: any) {
    console.log(`⚠️  Failed to get NSE session cookies: ${error.message}`);
    if (error.response) {
      console.log(`   Response status: ${error.response.status}`);
    }
  }

  return '';
}

/**
 * Fetch current price from NSE API (Priority source for NSE stocks)
 * API: https://www.nseindia.com/api/quote-equity?symbol=SYMBOL
 */
export async function fetchCurrentPriceFromNSE(symbol: string): Promise<{
  price: number | null;
  date: Date | null;
  source: string;
} | null> {
  try {
    if (!symbol) {
      return null;
    }

    // Get NSE session cookies first
    const cookies = await getNSESessionCookies();

    const nseUrl = `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`;
    
    const headers: any = {
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

    // Add cookies if available
    if (cookies) {
      headers['Cookie'] = cookies;
    }
    
    const response = await axios.get(nseUrl, {
      timeout: 10000,
      headers: headers,
      maxRedirects: 5,
      validateStatus: (status) => status < 500,
    });

    if (response.status === 200 && response.data) {
      const data = response.data;
      const priceInfo = data.priceInfo || {};
      
      // Priority: lastPrice (current/last traded) > close > vwap
      let price: number | null = null;
      
      if (priceInfo.lastPrice && typeof priceInfo.lastPrice === 'number' && priceInfo.lastPrice > 0) {
        price = priceInfo.lastPrice;
        console.log(`✅ NSE API ${symbol}: Using lastPrice = ₹${price}`);
      } else if (priceInfo.close && typeof priceInfo.close === 'number' && priceInfo.close > 0) {
        price = priceInfo.close;
        console.log(`✅ NSE API ${symbol}: Using close = ₹${price} (lastPrice not available)`);
      } else if (priceInfo.vwap && typeof priceInfo.vwap === 'number' && priceInfo.vwap > 0) {
        price = priceInfo.vwap;
        console.log(`✅ NSE API ${symbol}: Using vwap = ₹${price} (lastPrice/close not available)`);
      }
      
      if (price && price > 0) {
        // Parse lastUpdateTime if available, otherwise use current date
        let date = new Date();
        if (data.metadata?.lastUpdateTime) {
          try {
            // Parse format: "04-Nov-2025 16:00:00"
            const dateStr = data.metadata.lastUpdateTime;
            const parsedDate = new Date(dateStr);
            if (!isNaN(parsedDate.getTime())) {
              date = parsedDate;
            }
          } catch (e) {
            // Use current date if parsing fails
          }
        }
        
        console.log(`✅ NSE API ${symbol}: Successfully fetched price ₹${price} (lastUpdateTime: ${data.metadata?.lastUpdateTime || 'N/A'})`);
        
        return {
          price,
          date,
          source: 'NSE'
        };
      } else {
        console.log(`⚠️  NSE API ${symbol}: No valid price found in response (lastPrice: ${priceInfo.lastPrice}, close: ${priceInfo.close}, vwap: ${priceInfo.vwap})`);
      }
    } else {
      console.log(`⚠️  NSE API ${symbol}: Unexpected response status ${response.status}`);
    }
  } catch (error: any) {
    // Log error details for debugging
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.log(`⚠️  NSE API access denied (${error.response.status}) for ${symbol} - Session cookies may be required`);
    } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      console.log(`⚠️  NSE API timeout for ${symbol}`);
    } else {
      console.log(`⚠️  NSE API error for ${symbol}: ${error.message || 'Unknown error'}`);
    }
  }
  
  return null;
}

/**
 * Fetch comprehensive stock fundamentals and metrics from Yahoo Finance
 * Includes: PE, Market Cap, Price to Book, Dividend Yield, 52W High/Low, Average Volume
 */
async function fetchStockFundamentals(symbol: string, exchange: string): Promise<{
  trailingPE?: number;
  forwardPE?: number;
  priceToBook?: number;
  marketCap?: number;
  dividendYield?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  averageVolume?: number;
  regularMarketVolume?: number;
  currentPrice?: number;
}> {
  const yahooExchange = exchange.toUpperCase() === 'BSE' ? 'BO' : 'NS';
  const yahooSymbol = `${symbol}.${yahooExchange}`;
  
  // Method 1: Enhanced headers to bypass 401 - try query2 endpoint
  try {
    const summaryUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${yahooSymbol}?modules=summaryProfile,defaultKeyStatistics,price,summaryDetail`;
    
    // Enhanced headers to mimic real browser and bypass 401
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': `https://finance.yahoo.com/quote/${yahooSymbol}`,
      'Origin': 'https://finance.yahoo.com',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'DNT': '1',
      'Connection': 'keep-alive',
    };
    
    try {
      const response = await axios.get(summaryUrl, {
        timeout: 15000,
        headers: headers,
        maxRedirects: 5,
        validateStatus: (status) => status < 500, // Don't throw on 401
      });

      if (response.status === 200 && response.data?.quoteSummary?.result?.[0]) {
        const result = response.data.quoteSummary.result[0];
        const keyStats = result.defaultKeyStatistics || {};
        const priceData = result.price || {};
        const summaryDetail = result.summaryDetail || {};
        
        // Extract all fundamentals
        const trailingPE = keyStats.trailingPE?.raw || keyStats.trailingPE;
        const forwardPE = keyStats.forwardPE?.raw || keyStats.forwardPE;
        const priceToBook = keyStats.priceToBook?.raw || keyStats.priceToBook;
        const marketCap = keyStats.marketCap?.raw || keyStats.marketCap;
        const dividendYield = summaryDetail.dividendYield?.raw || summaryDetail.dividendYield;
        
        // Extract 52-week high/low from price data
        const fiftyTwoWeekHigh = priceData.fiftyTwoWeekHigh?.raw || priceData.fiftyTwoWeekHigh;
        const fiftyTwoWeekLow = priceData.fiftyTwoWeekLow?.raw || priceData.fiftyTwoWeekLow;
        
        // Extract current price
        const currentPrice = priceData.regularMarketPrice?.raw || priceData.regularMarketPrice || priceData.preMarketPrice?.raw || priceData.preMarketPrice;
        
        // Extract volume metrics
        const averageVolume = summaryDetail.averageVolume?.raw || summaryDetail.averageVolume || keyStats.averageDailyVolume10Day?.raw || keyStats.averageDailyVolume10Day;
        const regularMarketVolume = priceData.regularMarketVolume?.raw || priceData.regularMarketVolume;
        
        return {
          trailingPE: trailingPE !== undefined && trailingPE !== null ? trailingPE : undefined,
          forwardPE: forwardPE !== undefined && forwardPE !== null ? forwardPE : undefined,
          priceToBook: priceToBook !== undefined && priceToBook !== null ? priceToBook : undefined,
          marketCap: marketCap !== undefined && marketCap !== null ? marketCap : undefined,
          dividendYield: dividendYield !== undefined && dividendYield !== null ? dividendYield : undefined,
          fiftyTwoWeekHigh: fiftyTwoWeekHigh !== undefined && fiftyTwoWeekHigh !== null ? fiftyTwoWeekHigh : undefined,
          fiftyTwoWeekLow: fiftyTwoWeekLow !== undefined && fiftyTwoWeekLow !== null ? fiftyTwoWeekLow : undefined,
          averageVolume: averageVolume !== undefined && averageVolume !== null ? averageVolume : undefined,
          regularMarketVolume: regularMarketVolume !== undefined && regularMarketVolume !== null ? regularMarketVolume : undefined,
          currentPrice: currentPrice !== undefined && currentPrice !== null ? currentPrice : undefined,
        };
      } else if (response.status === 401) {
        throw new Error('401_UNAUTHORIZED');
      }
    } catch (error: any) {
      // Method 2: Try query1 endpoint instead of query2
      if (error.message === '401_UNAUTHORIZED' || error.response?.status === 401) {
        try {
          const altUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${yahooSymbol}?modules=summaryProfile,defaultKeyStatistics,price,summaryDetail`;
          const altHeaders = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': `https://finance.yahoo.com/`,
            'Origin': 'https://finance.yahoo.com',
            'Cache-Control': 'no-cache',
          };
          
          const altResponse = await axios.get(altUrl, {
            timeout: 15000,
            headers: altHeaders,
            maxRedirects: 5,
          });
          
          if (altResponse.data?.quoteSummary?.result?.[0]) {
            const result = altResponse.data.quoteSummary.result[0];
            const keyStats = result.defaultKeyStatistics || {};
            const priceData = result.price || {};
            const summaryDetail = result.summaryDetail || {};
            
            return {
              trailingPE: keyStats.trailingPE?.raw || keyStats.trailingPE,
              forwardPE: keyStats.forwardPE?.raw || keyStats.forwardPE,
              priceToBook: keyStats.priceToBook?.raw || keyStats.priceToBook,
              marketCap: keyStats.marketCap?.raw || keyStats.marketCap,
              dividendYield: summaryDetail.dividendYield?.raw || summaryDetail.dividendYield,
              fiftyTwoWeekHigh: priceData.fiftyTwoWeekHigh?.raw || priceData.fiftyTwoWeekHigh,
              fiftyTwoWeekLow: priceData.fiftyTwoWeekLow?.raw || priceData.fiftyTwoWeekLow,
              averageVolume: summaryDetail.averageVolume?.raw || summaryDetail.averageVolume || keyStats.averageDailyVolume10Day?.raw || keyStats.averageDailyVolume10Day,
              regularMarketVolume: priceData.regularMarketVolume?.raw || priceData.regularMarketVolume,
              currentPrice: priceData.regularMarketPrice?.raw || priceData.regularMarketPrice || priceData.preMarketPrice?.raw || priceData.preMarketPrice,
            };
          }
        } catch (altError) {
          // Method 2 also failed, try Method 3
        }
        
        // Method 3: Try v7 endpoint (has limited data but sometimes works)
        try {
          const v7Url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${yahooSymbol}&fields=regularMarketPrice,marketCap,fiftyTwoWeekHigh,fiftyTwoWeekLow,averageDailyVolume10Day,regularMarketVolume`;
          const v7Response = await axios.get(v7Url, {
            timeout: 15000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
            },
          });
          
          if (v7Response.data?.quoteResponse?.result?.[0]) {
            const quote = v7Response.data.quoteResponse.result[0];
            return {
              currentPrice: quote.regularMarketPrice,
              marketCap: quote.marketCap,
              fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
              fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
              averageVolume: quote.averageDailyVolume10Day,
              regularMarketVolume: quote.regularMarketVolume,
              // v7 doesn't have PE data, but at least we get some fundamentals
            };
          }
        } catch (v7Error: any) {
          // All methods failed
          console.debug(`All methods failed for ${yahooSymbol}:`, v7Error?.message || v7Error);
        }
      }
    }
  } catch (error) {
    // Silently fail
  }
  
  return {};
}

export async function fetchNSEHistoricalData(
  symbol: string,
  exchange: string,
  fromDate: Date,
  toDate: Date
): Promise<OHLCData[]> {
  try {
    // Use Yahoo Finance API for historical data
    // Yahoo Finance uses .NS suffix for NSE and .BO for BSE
    const yahooExchange = exchange.toUpperCase() === 'BSE' ? 'BO' : 'NS';
    const yahooSymbol = `${symbol}.${yahooExchange}`;
    const fromTimestamp = Math.floor(fromDate.getTime() / 1000);
    const toTimestamp = Math.floor(toDate.getTime() / 1000);
    
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?period1=${fromTimestamp}&period2=${toTimestamp}&interval=1d`;
    
    // Fetch fundamentals once for the current date (PE/MarketCap don't change daily, use latest)
    // Try to fetch fundamentals, but don't fail if API is blocked (401 errors)
    let fundamentals = {};
    try {
      fundamentals = await fetchStockFundamentals(symbol, exchange);
      // Log if we successfully got fundamentals
      if (fundamentals && Object.keys(fundamentals).length > 0) {
        const fundData = fundamentals as any;
        console.log(`✅ Fetched fundamentals for ${symbol}: PE=${fundData.trailingPE || 'N/A'}, MarketCap=${fundData.marketCap || 'N/A'}`);
      }
    } catch (error: any) {
      // Silently continue - fundamentals fetch might fail due to API restrictions
      if (error?.response?.status === 401) {
        console.debug(`⚠️  Yahoo Finance API blocked (401) for ${symbol} - fundamentals unavailable`);
      }
    }
    
    try {
      const response = await axios.get(yahooUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
      });

      if (response.data?.chart?.result?.[0]) {
        const result = response.data.chart.result[0];
        const timestamps = result.timestamp || [];
        const quotes = result.indicators?.quote?.[0] || {};
        
        // Calculate 52-week high/low from historical data if not available in fundamentals
        let calculated52WHigh: number | undefined;
        let calculated52WLow: number | undefined;
        if (timestamps.length > 0) {
          const oneYearAgo = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);
          const recentHighs: number[] = [];
          const recentLows: number[] = [];
          
          for (let i = 0; i < timestamps.length; i++) {
            const timestamp = timestamps[i];
            if (timestamp >= oneYearAgo) {
              if (quotes.high?.[i] && quotes.high[i] > 0) recentHighs.push(quotes.high[i]);
              if (quotes.low?.[i] && quotes.low[i] > 0) recentLows.push(quotes.low[i]);
            }
          }
          
          if (recentHighs.length > 0) calculated52WHigh = Math.max(...recentHighs);
          if (recentLows.length > 0) calculated52WLow = Math.min(...recentLows);
        }
        
        // Use fundamentals 52W high/low if available, otherwise use calculated
        const fundData = fundamentals as any;
        const effective52WHigh = fundData.fiftyTwoWeekHigh || calculated52WHigh;
        const effective52WLow = fundData.fiftyTwoWeekLow || calculated52WLow;
        
        // Calculate average volume from historical data
        const volumes: number[] = quotes.volume ? quotes.volume.filter((v: number) => v && v > 0) : [];
        const calculatedAvgVolume = volumes.length > 0 
          ? volumes.reduce((a, b) => a + b, 0) / volumes.length 
          : undefined;
        const effectiveAvgVolume = fundData.averageVolume || calculatedAvgVolume;
        
        const data: OHLCData[] = [];
        for (let i = 0; i < timestamps.length; i++) {
          const closePrice = quotes.close?.[i];
          if (closePrice && closePrice > 0) {
            const isLatestDate = i === timestamps.length - 1;
            const currentVolume = quotes.volume?.[i] || 0;
            
            data.push({
              date: new Date(timestamps[i] * 1000),
              open: quotes.open?.[i] || closePrice,
              high: quotes.high?.[i] || closePrice,
              low: quotes.low?.[i] || closePrice,
              close: closePrice,
              volume: currentVolume,
              // Price / Range - use fundamentals for latest, calculated for historical
              currentPrice: isLatestDate ? (fundData.currentPrice || closePrice) : closePrice,
              fiftyTwoWeekHigh: effective52WHigh,
              fiftyTwoWeekLow: effective52WLow,
              // Volume metrics
              averageVolume: effectiveAvgVolume,
              regularMarketVolume: isLatestDate ? (fundData.regularMarketVolume || currentVolume) : currentVolume,
              // Fundamentals - store for latest date, will propagate to historical
              trailingPE: isLatestDate ? fundData.trailingPE : undefined,
              forwardPE: isLatestDate ? fundData.forwardPE : undefined,
              priceToBook: isLatestDate ? fundData.priceToBook : undefined,
              marketCap: isLatestDate ? fundData.marketCap : undefined,
              dividendYield: isLatestDate ? fundData.dividendYield : undefined,
            });
          }
        }
        return data;
      }
    } catch (yahooError: any) {
      console.error(`Yahoo Finance API error for ${yahooSymbol}:`, yahooError.message);
    }

    // Fallback: Return empty array
    return [];
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error);
    return [];
  }
}

/**
 * Map ISIN to stock symbol for fetching data
 * Returns symbol with exchange suffix (.NS for NSE, .BO for BSE)
 */
export async function getSymbolFromISIN(isin: string): Promise<{ symbol: string; exchange: string } | null> {
  try {
    await connectDB();
    const stock = await StockMaster.findOne({ isin });
    
    let symbol = stock?.symbol || '';
    let exchange = stock?.exchange || 'NSE';
    
    // If no symbol, try to extract from stock name
    if (!symbol && stock?.stockName) {
      const stockName = stock.stockName;
      
      // Try multiple extraction strategies
      // Strategy 1: Remove common suffixes and get first word
      symbol = stockName
        .replace(/Ltd\.?/gi, '')
        .replace(/Limited/gi, '')
        .replace(/Corporation/gi, '')
        .replace(/Corp\.?/gi, '')
        .replace(/Services/gi, '')
        .replace(/Infrastructure/gi, '')
        .replace(/Infrastr/gi, '')
        .trim()
        .split(' ')[0]
        .toUpperCase();
      
      // Strategy 2: Try to extract common patterns
      // Handle special cases based on known Yahoo Finance symbols
      const stockNameUpper = stockName.toUpperCase();
      
      // Special cases based on common patterns
      if (stockNameUpper.includes('FUTURE CONSUMER')) {
        symbol = 'FCONSUMER';
      } else if (stockNameUpper.includes('SUMEDHA') && stockNameUpper.includes('FISCAL')) {
        symbol = 'SUMEDHA';
        exchange = 'BSE'; // Sumedha is on BSE
      } else if (stockNameUpper.includes('SKIL') && stockNameUpper.includes('INFRA')) {
        symbol = 'SKIL';
      } else if (stockNameUpper.includes('ICICI') && stockNameUpper.includes('SECURITIES')) {
        symbol = 'ISEC';
      } else if (stockNameUpper.includes('ICICI') && stockNameUpper.includes('LOMBARD')) {
        symbol = 'ICICIGI';
      } else if (stockNameUpper.includes('ADITYA BIRLA') && stockNameUpper.includes('AMC')) {
        symbol = 'ABSLAMC';
      } else if (stockNameUpper.includes('NMDC') && stockNameUpper.includes('STEEL')) {
        symbol = 'NSLNCD';
      } else if (stockNameUpper.includes('INVENTURE')) {
        symbol = 'INVENTURE';
      } else if (stockNameUpper.includes('SITI') && stockNameUpper.includes('NETWORKS')) {
        symbol = 'SITINET';
      }
    }
    
    // Clean up symbol (remove dots, spaces)
    if (symbol) {
      symbol = symbol.replace(/\./g, '').replace(/\s+/g, '').toUpperCase();
    }
    
    if (!symbol) {
      console.warn(`⚠️  No symbol found for ISIN: ${isin}, Stock: ${stock?.stockName || 'Unknown'}`);
      return null;
    }
    
    console.log(`📌 Symbol mapping for ${isin}: ${symbol} (${exchange === 'BSE' ? 'BO' : 'NS'})`);
    return { symbol, exchange };
  } catch (error) {
    console.error(`Error getting symbol for ISIN ${isin}:`, error);
    return null;
  }
}

/**
 * Check if stock has complete 5 years of data
 */
export async function hasComplete5YearData(isin: string): Promise<boolean> {
  try {
    await connectDB();
    const StockData = (await import('@/models/StockData')).default;
    
    const fiveYearsAgo = subDays(new Date(), 5 * 365);
    const count = await StockData.countDocuments({
      isin,
      date: { $gte: fiveYearsAgo }
    });
    
    // Consider complete if we have at least 1200 records (approx 5 years of trading days)
    // Accounting for weekends and holidays
    return count >= 1200;
  } catch (error) {
    console.error(`Error checking 5-year data for ${isin}:`, error);
    return false;
  }
}

/**
 * Fetch and store historical data for a stock
 * If hasComplete5YearData is true, only fetches last 3 days
 * Otherwise fetches full 5 years
 */
export async function fetchAndStoreHistoricalData(isin: string, forceFullUpdate: boolean = false): Promise<number> {
  try {
    const connection = await connectDB();
    const dbName = connection.connection.db?.databaseName || 'unknown';
    console.log(`💾 fetchAndStoreHistoricalData - Using database: ${dbName}`);
    console.log(`📦 Collection name: ${StockData.collection.name}`);
    
    const symbolInfo = await getSymbolFromISIN(isin);
    if (!symbolInfo || !symbolInfo.symbol) {
      console.log(`No symbol found for ISIN: ${isin}`);
      return 0;
    }

    let { symbol, exchange } = symbolInfo;

    const toDate = new Date();
    let fromDate: Date;
    
    if (forceFullUpdate) {
      // Fetch full 5 years (initial fetch or force update)
      fromDate = subDays(toDate, 365 * 5);
      console.log(`Fetching full 5 years of data for ${isin}`);
    } else {
      // Always fetch last 3 days including today for refresh
      fromDate = subDays(toDate, 2); // Last 3 days: today, yesterday, day before yesterday
      console.log(`Refreshing last 3 days of data for ${isin} (including today)`);
    }

    console.log(`Fetching data for ${isin} (${symbol}.${exchange === 'BSE' ? 'BO' : 'NS'}) from ${format(fromDate, 'yyyy-MM-dd')} to ${format(toDate, 'yyyy-MM-dd')}`);

    // PRIORITY: For NSE stocks, try NSE API first for today's price (faster and more accurate)
    let todayPriceFromNSE: { price: number; date: Date } | null = null;
    if (exchange === 'NSE' && !forceFullUpdate) {
      try {
        const nsePriceData = await fetchCurrentPriceFromNSE(symbol);
        if (nsePriceData && nsePriceData.price) {
          // Always use today's date (not the date from NSE metadata, which might be yesterday)
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          todayPriceFromNSE = {
            price: nsePriceData.price,
            date: today
          };
          console.log(`✅ Got today's price from NSE API for ${symbol}: ₹${nsePriceData.price}`);
        }
      } catch (error: any) {
        console.debug(`⚠️  NSE API failed for ${symbol}, will use Yahoo Finance: ${error.message}`);
      }
    }

    // Fetch data from Yahoo Finance (for historical data or if NSE failed)
    let ohlcData = await fetchNSEHistoricalData(symbol, exchange, fromDate, toDate);
    
    // If we got today's price from NSE, always add/update today's entry
    if (todayPriceFromNSE) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      
      // Check if we have today's data from Yahoo Finance
      const todayDataIndex = ohlcData.findIndex(d => {
        const dDate = new Date(d.date);
        return dDate >= today && dDate <= todayEnd;
      });
      
      if (todayDataIndex >= 0) {
        // Update existing today's data with NSE price (more accurate - lastPrice is current)
        ohlcData[todayDataIndex].close = todayPriceFromNSE.price;
        ohlcData[todayDataIndex].currentPrice = todayPriceFromNSE.price;
        // Update high/low if NSE price is higher/lower
        if (todayPriceFromNSE.price > ohlcData[todayDataIndex].high) {
          ohlcData[todayDataIndex].high = todayPriceFromNSE.price;
        }
        if (todayPriceFromNSE.price < ohlcData[todayDataIndex].low) {
          ohlcData[todayDataIndex].low = todayPriceFromNSE.price;
        }
        // Ensure date is today (not yesterday from NSE metadata)
        ohlcData[todayDataIndex].date = todayPriceFromNSE.date;
      } else {
        // Add today's data from NSE if not present in Yahoo Finance data
        const lastData = ohlcData[ohlcData.length - 1] || {};
        ohlcData.push({
          date: todayPriceFromNSE.date, // This is already set to today in the function above
          open: lastData.close || todayPriceFromNSE.price,
          high: todayPriceFromNSE.price,
          low: todayPriceFromNSE.price,
          close: todayPriceFromNSE.price,
          volume: lastData.volume || 0,
          currentPrice: todayPriceFromNSE.price
        });
      }
    }
    
    if (ohlcData.length === 0) {
      console.warn(`⚠️  No data retrieved for ${isin} (${symbol}.${exchange === 'BSE' ? 'BO' : 'NS'})`);
      console.warn(`   This could mean: 1) Stock is delisted, 2) Symbol is incorrect, 3) Yahoo Finance doesn't have data`);
      // Try alternate exchange if no data found
      if (exchange === 'NSE') {
        console.log(`   Trying BSE for ${symbol}...`);
        const altData = await fetchNSEHistoricalData(symbol, 'BSE', fromDate, toDate);
        if (altData.length > 0) {
          console.log(`   ✅ Found data on BSE! Updating exchange...`);
          exchange = 'BSE';
          ohlcData = altData;
          // Update StockMaster with correct exchange
          try {
            await StockMaster.updateOne({ isin }, { $set: { exchange: 'BSE' } });
          } catch (e) {
            console.error('Error updating StockMaster exchange:', e);
          }
        } else {
          return 0;
        }
      } else {
        return 0;
      }
    }

    // Store in database
    let storedCount = 0;
    const stockMaster = await StockMaster.findOne({ isin });
    
    // Get the latest available fundamentals from database to propagate to historical dates
    const latestExistingData = await StockData.findOne({ 
      isin, 
      $or: [
        { trailingPE: { $exists: true, $ne: null } },
        { marketCap: { $exists: true, $ne: null } },
        { fiftyTwoWeekHigh: { $exists: true, $ne: null } }
      ]
    })
      .sort({ date: -1 })
      .lean() as any;
    
    // Find the latest date in fetched data that has fundamentals
    const latestFetchedData = ohlcData.length > 0 ? ohlcData[ohlcData.length - 1] : null;
    
    // Use fetched values if available, otherwise use latest from database
    const existingData = (latestExistingData && !Array.isArray(latestExistingData)) ? latestExistingData : null;
    const effectiveFundamentals = {
      trailingPE: latestFetchedData?.trailingPE || existingData?.trailingPE,
      forwardPE: latestFetchedData?.forwardPE || existingData?.forwardPE,
      priceToBook: latestFetchedData?.priceToBook || existingData?.priceToBook,
      marketCap: latestFetchedData?.marketCap || existingData?.marketCap,
      dividendYield: latestFetchedData?.dividendYield || existingData?.dividendYield,
      fiftyTwoWeekHigh: latestFetchedData?.fiftyTwoWeekHigh || existingData?.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: latestFetchedData?.fiftyTwoWeekLow || existingData?.fiftyTwoWeekLow,
      averageVolume: latestFetchedData?.averageVolume || existingData?.averageVolume,
      regularMarketVolume: latestFetchedData?.regularMarketVolume || existingData?.regularMarketVolume,
    };
    
    for (const data of ohlcData) {
      try {
        // Use start of day to normalize date (in local timezone)
        // This ensures dates are stored consistently regardless of when data is fetched
        // MongoDB stores dates in UTC, so 00:00 IST becomes 18:30 UTC previous day
        const normalizedDate = new Date(data.date);
        normalizedDate.setHours(0, 0, 0, 0);
        // Note: When stored in MongoDB, this will be converted to UTC
        // 00:00 IST = 18:30 UTC previous day (IST is UTC+5:30)
        
        // Build update object - only include fields that have values (MongoDB ignores undefined)
        const updateData: any = {
          isin,
          stockName: stockMaster?.stockName || '',
          symbol,
          exchange: stockMaster?.exchange || 'NSE',
          date: normalizedDate,
          // OHLC & Volume (History data)
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          volume: data.volume,
          // Price / Range
          currentPrice: data.currentPrice !== undefined ? data.currentPrice : data.close,
          lastUpdated: new Date(),
        };
        
        // Add fundamentals only if they have values
        if (data.fiftyTwoWeekHigh !== undefined && data.fiftyTwoWeekHigh !== null) {
          updateData.fiftyTwoWeekHigh = data.fiftyTwoWeekHigh;
        } else if (effectiveFundamentals.fiftyTwoWeekHigh !== undefined && effectiveFundamentals.fiftyTwoWeekHigh !== null) {
          updateData.fiftyTwoWeekHigh = effectiveFundamentals.fiftyTwoWeekHigh;
        }
        
        if (data.fiftyTwoWeekLow !== undefined && data.fiftyTwoWeekLow !== null) {
          updateData.fiftyTwoWeekLow = data.fiftyTwoWeekLow;
        } else if (effectiveFundamentals.fiftyTwoWeekLow !== undefined && effectiveFundamentals.fiftyTwoWeekLow !== null) {
          updateData.fiftyTwoWeekLow = effectiveFundamentals.fiftyTwoWeekLow;
        }
        
        if (data.averageVolume !== undefined && data.averageVolume !== null) {
          updateData.averageVolume = data.averageVolume;
        } else if (effectiveFundamentals.averageVolume !== undefined && effectiveFundamentals.averageVolume !== null) {
          updateData.averageVolume = effectiveFundamentals.averageVolume;
        }
        
        if (data.regularMarketVolume !== undefined && data.regularMarketVolume !== null) {
          updateData.regularMarketVolume = data.regularMarketVolume;
        } else if (effectiveFundamentals.regularMarketVolume !== undefined && effectiveFundamentals.regularMarketVolume !== null) {
          updateData.regularMarketVolume = effectiveFundamentals.regularMarketVolume;
        }
        
        // Fundamentals - only set if we have values
        if (data.trailingPE !== undefined && data.trailingPE !== null) {
          updateData.trailingPE = data.trailingPE;
        } else if (effectiveFundamentals.trailingPE !== undefined && effectiveFundamentals.trailingPE !== null) {
          updateData.trailingPE = effectiveFundamentals.trailingPE;
        }
        
        if (data.forwardPE !== undefined && data.forwardPE !== null) {
          updateData.forwardPE = data.forwardPE;
        } else if (effectiveFundamentals.forwardPE !== undefined && effectiveFundamentals.forwardPE !== null) {
          updateData.forwardPE = effectiveFundamentals.forwardPE;
        }
        
        if (data.priceToBook !== undefined && data.priceToBook !== null) {
          updateData.priceToBook = data.priceToBook;
        } else if (effectiveFundamentals.priceToBook !== undefined && effectiveFundamentals.priceToBook !== null) {
          updateData.priceToBook = effectiveFundamentals.priceToBook;
        }
        
        if (data.marketCap !== undefined && data.marketCap !== null) {
          updateData.marketCap = data.marketCap;
        } else if (effectiveFundamentals.marketCap !== undefined && effectiveFundamentals.marketCap !== null) {
          updateData.marketCap = effectiveFundamentals.marketCap;
        }
        
        if (data.dividendYield !== undefined && data.dividendYield !== null) {
          updateData.dividendYield = data.dividendYield;
        } else if (effectiveFundamentals.dividendYield !== undefined && effectiveFundamentals.dividendYield !== null) {
          updateData.dividendYield = effectiveFundamentals.dividendYield;
        }
        
        const saved = await StockData.findOneAndUpdate(
          { isin, date: normalizedDate },
          { $set: updateData },
          { upsert: true, new: true }
        );
        storedCount++;
        
        // Log first record stored to confirm database/collection and show all fields being stored
        if (storedCount === 1) {
          console.log(`📝 First record stored in collection: ${StockData.collection.name}`);
          console.log(`📁 Database: ${(StockData.db as any)?.databaseName || 'unknown'}`);
          console.log(`📊 Comprehensive data stored for ${isin}:`);
          console.log(`   - OHLC: Open=${data.open}, High=${data.high}, Low=${data.low}, Close=${data.close}`);
          console.log(`   - Volume: ${data.volume}, AvgVolume=${effectiveFundamentals.averageVolume || 'N/A'}`);
          console.log(`   - Price/Range: Current=${data.currentPrice || data.close}, 52W High=${effectiveFundamentals.fiftyTwoWeekHigh || 'N/A'}, 52W Low=${effectiveFundamentals.fiftyTwoWeekLow || 'N/A'}`);
          console.log(`   - Fundamentals: TrailingPE=${effectiveFundamentals.trailingPE || 'N/A'}, ForwardPE=${effectiveFundamentals.forwardPE || 'N/A'}, P/B=${effectiveFundamentals.priceToBook || 'N/A'}`);
          console.log(`   - MarketCap: ${effectiveFundamentals.marketCap ? formatMarketCap(effectiveFundamentals.marketCap) : 'N/A'}, DividendYield=${effectiveFundamentals.dividendYield || 'N/A'}`);
        }
      } catch (err: any) {
        if (err.code !== 11000) { // Skip duplicate key errors
          console.error(`Error storing data for ${isin} on ${format(data.date, 'yyyy-MM-dd')}:`, err);
        }
      }
    }
    
    // If we fetched new fundamentals, update recent historical records (last 90 days) with it
    // This ensures fundamentals data is available for recent historical analysis
    const hasNewFundamentals = effectiveFundamentals.trailingPE !== undefined || 
                               effectiveFundamentals.marketCap !== undefined ||
                               effectiveFundamentals.fiftyTwoWeekHigh !== undefined;
    
    if (hasNewFundamentals) {
      const ninetyDaysAgo = subDays(new Date(), 90);
      const updateQuery: any = { isin, date: { $gte: ninetyDaysAgo } };
      const updateData: any = { lastUpdated: new Date() };
      
      // Only update fields that have new values
      if (effectiveFundamentals.trailingPE !== undefined) updateData.trailingPE = effectiveFundamentals.trailingPE;
      if (effectiveFundamentals.forwardPE !== undefined) updateData.forwardPE = effectiveFundamentals.forwardPE;
      if (effectiveFundamentals.priceToBook !== undefined) updateData.priceToBook = effectiveFundamentals.priceToBook;
      if (effectiveFundamentals.marketCap !== undefined) updateData.marketCap = effectiveFundamentals.marketCap;
      if (effectiveFundamentals.dividendYield !== undefined) updateData.dividendYield = effectiveFundamentals.dividendYield;
      if (effectiveFundamentals.fiftyTwoWeekHigh !== undefined) updateData.fiftyTwoWeekHigh = effectiveFundamentals.fiftyTwoWeekHigh;
      if (effectiveFundamentals.fiftyTwoWeekLow !== undefined) updateData.fiftyTwoWeekLow = effectiveFundamentals.fiftyTwoWeekLow;
      if (effectiveFundamentals.averageVolume !== undefined) updateData.averageVolume = effectiveFundamentals.averageVolume;
      if (effectiveFundamentals.regularMarketVolume !== undefined) updateData.regularMarketVolume = effectiveFundamentals.regularMarketVolume;
      
      try {
        const updateResult = await StockData.updateMany(
          updateQuery,
          { $set: updateData }
        );
        if (updateResult.modifiedCount > 0) {
          console.log(`📊 Updated fundamentals for ${updateResult.modifiedCount} recent records (last 90 days) for ${isin}`);
        }
      } catch (updateErr) {
        console.error(`Error updating fundamentals for recent records:`, updateErr);
      }
    }

    console.log(`Stored ${storedCount} records for ${isin}`);
    return storedCount;
  } catch (error) {
    console.error(`Error in fetchAndStoreHistoricalData for ${isin}:`, error);
    return 0;
  }
}

/**
 * Fetch historical data for all stocks in StockMaster
 */
export async function fetchAllStocksHistoricalData(): Promise<void> {
  try {
    await connectDB();
    const stocks = await StockMaster.find({}).lean();
    
    console.log(`Starting to fetch historical data for ${stocks.length} stocks...`);
    
    // Process in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < stocks.length; i += batchSize) {
      const batch = stocks.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(stock => fetchAndStoreHistoricalData(stock.isin))
      );
      
      // Add delay between batches
      if (i + batchSize < stocks.length) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      }
    }
    
    console.log('Completed fetching historical data for all stocks');
  } catch (error) {
    console.error('Error fetching all stocks historical data:', error);
    throw error;
  }
}

/**
 * Update daily stock data for holdings
 */
export async function updateDailyStockDataForHoldings(holdings: Array<{ isin: string }>): Promise<void> {
  try {
    await connectDB();
    
    const uniqueIsins = [...new Set(holdings.map(h => h.isin))];
    console.log(`Updating daily data for ${uniqueIsins.length} holdings...`);
    
    for (const isin of uniqueIsins) {
      const symbolInfo = await getSymbolFromISIN(isin);
      if (!symbolInfo || !symbolInfo.symbol) continue;
      
      const { symbol, exchange } = symbolInfo;
      const today = new Date();
      const yesterday = subDays(today, 1);
      
      // Fetch last 30 days to ensure we have recent data
      const ohlcData = await fetchNSEHistoricalData(symbol, exchange, yesterday, today);
      
      const stockMaster = await StockMaster.findOne({ isin });
      
      for (const data of ohlcData) {
        try {
          // Use start of day to normalize date
          const normalizedDate = new Date(data.date);
          normalizedDate.setHours(0, 0, 0, 0);
          
          await StockData.findOneAndUpdate(
            { isin, date: normalizedDate },
            {
              isin,
              stockName: stockMaster?.stockName || '',
              symbol,
              exchange: stockMaster?.exchange || 'NSE',
              date: normalizedDate,
              open: data.open,
              high: data.high,
              low: data.low,
              close: data.close,
              volume: data.volume,
              lastUpdated: new Date(),
            },
            { upsert: true, new: true }
          );
        } catch (err: any) {
          if (err.code !== 11000) {
            console.error(`Error storing daily data for ${isin}:`, err);
          }
        }
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('Completed updating daily stock data');
  } catch (error) {
    console.error('Error updating daily stock data:', error);
  }
}

