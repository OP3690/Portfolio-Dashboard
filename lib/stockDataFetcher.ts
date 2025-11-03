import axios from 'axios';
import StockMaster from '@/models/StockMaster';
import StockData from '@/models/StockData';
import connectDB from './mongodb';

// Using NSE API and Yahoo Finance as fallback
const NSE_API_BASE = 'https://www.nseindia.com/api';
const YAHOO_FINANCE_API = 'https://query1.finance.yahoo.com/v8/finance/chart';

// Map ISIN to NSE symbol (we'll need to build this mapping)
const ISIN_TO_SYMBOL_MAP: { [key: string]: string } = {};

export async function fetchStockPrice(isin: string, stockName: string): Promise<any> {
  try {
    // First try to get symbol from StockMaster
    await connectDB();
    const stockMaster = await StockMaster.findOne({ isin });
    
    let symbol = stockMaster?.symbol;
    if (!symbol) {
      // Try to extract symbol from stock name
      symbol = extractSymbolFromName(stockName);
    }

    // Try NSE API first (requires cookies, might not work without proxy)
    // For now, we'll use a simpler approach with yahoo finance or NSE APIs
    
    // Using a proxy-free NSE API alternative
    const response = await axios.get(`https://www.moneycontrol.com/api/mc/quotes/equity/${isin}`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    }).catch(() => null);

    if (response?.data) {
      return response.data;
    }

    // Fallback: Return basic structure (in production, integrate with proper stock API)
    return {
      isin,
      stockName,
      symbol,
      price: null,
      change: null,
    };
  } catch (error) {
    console.error(`Error fetching stock data for ${isin}:`, error);
    return null;
  }
}

function extractSymbolFromName(stockName: string): string {
  // Simple extraction - remove common suffixes
  return stockName
    .replace(/Ltd\.?/gi, '')
    .replace(/Limited/gi, '')
    .replace(/Corporation/gi, '')
    .replace(/Corp\.?/gi, '')
    .trim()
    .split(' ')[0]
    .toUpperCase();
}

export async function fetchHistoricalData(isin: string, years: number = 5): Promise<any[]> {
  try {
    await connectDB();
    const stockMaster = await StockMaster.findOne({ isin });
    
    if (!stockMaster) {
      return [];
    }

    // Check if we already have data in database
    const existingData = await StockData.find({ isin })
      .sort({ date: -1 })
      .limit(1);
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - years);

    // For now, we'll create a placeholder structure
    // In production, integrate with NSE/BSE APIs or use paid stock data providers
    const historicalData: any[] = [];
    
    // This is a placeholder - actual implementation would fetch from NSE/BSE APIs
    return historicalData;
  } catch (error) {
    console.error(`Error fetching historical data for ${isin}:`, error);
    return [];
  }
}

export async function saveStockDataToDB(stockData: any[]): Promise<void> {
  try {
    await connectDB();
    
    for (const data of stockData) {
      await StockData.findOneAndUpdate(
        { isin: data.isin, date: data.date },
        data,
        { upsert: true, new: true }
      );
    }
  } catch (error) {
    console.error('Error saving stock data to DB:', error);
    throw error;
  }
}

// Placeholder function for daily stock data update
export async function updateDailyStockData(isinList: string[]): Promise<void> {
  for (const isin of isinList) {
    try {
      const stockMaster = await StockMaster.findOne({ isin });
      if (!stockMaster) continue;

      const stockData = await fetchStockPrice(isin, stockMaster.stockName);
      if (stockData) {
        await StockData.findOneAndUpdate(
          { isin, date: new Date().toISOString().split('T')[0] },
          {
            isin,
            stockName: stockMaster.stockName,
            symbol: stockMaster.symbol,
            exchange: stockMaster.exchange,
            close: stockData.price,
            date: new Date(),
          },
          { upsert: true }
        );
      }
    } catch (error) {
      console.error(`Error updating daily data for ${isin}:`, error);
    }
  }
}

