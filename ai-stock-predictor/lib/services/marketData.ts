/**
 * Market Data Service
 *
 * Reads historical OHLCV data from the existing OP_Portfolio_Dashboard.stockdatas
 * collection instead of external APIs. The compound index (isin, date) makes
 * all queries efficient.
 *
 * stockdatas schema (relevant fields):
 *   isin        : string  — primary key linking to stockmasters
 *   symbol      : string  — NSE symbol
 *   date        : Date    — trading date
 *   open        : number
 *   high        : number
 *   low         : number
 *   close       : number
 *   volume      : number  (may also appear as regularMarketVolume)
 *   currentPrice: number  — same as close for historical rows
 *   averageVolume: number — 20-day average volume
 */

import mongoose from 'mongoose';
import { STOCK_UNIVERSE_DEDUPED as STOCK_UNIVERSE_LIST } from '../stockUniverse';

export interface OHLCVBar {
  date:   Date;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

/** Raw document shape returned from stockdatas */
interface StockDataDoc {
  isin:                 string;
  symbol:               string;
  date:                 Date;
  open?:                number;
  high?:                number;
  low?:                 number;
  close:                number;
  volume?:              number;
  regularMarketVolume?: number;
  currentPrice?:        number;
  averageVolume?:       number;
}

// Build an isin→symbol and symbol→isin lookup from the embedded universe
const ISIN_TO_SYMBOL = new Map<string, string>();
const SYMBOL_TO_ISIN = new Map<string, string>();
STOCK_UNIVERSE_LIST.forEach((s: { symbol: string; isin: string }) => {
  ISIN_TO_SYMBOL.set(s.isin, s.symbol);
  SYMBOL_TO_ISIN.set(s.symbol, s.isin);
});

/** Get raw MongoDB collection (bypasses Mongoose schema) */
function getDb() {
  if (!mongoose.connection.db) {
    throw new Error('MongoDB not connected. Call dbConnect() first.');
  }
  return mongoose.connection.db;
}

/**
 * Fetch historical OHLCV bars for a single stock.
 * Uses the existing (isin, date) compound index.
 */
export async function fetchStockData(symbol: string, days: number = 90): Promise<OHLCVBar[]> {
  const isin = SYMBOL_TO_ISIN.get(symbol);
  if (!isin) {
    console.warn(`fetchStockData: symbol "${symbol}" not in universe`);
    return [];
  }

  try {
    const db    = getDb();
    const since = new Date();
    since.setDate(since.getDate() - Math.ceil(days * 1.5)); // buffer for weekends/holidays

    const docs = await db
      .collection<StockDataDoc>('stockdatas')
      .find(
        { isin, date: { $gte: since } },
        { projection: { date: 1, open: 1, high: 1, low: 1, close: 1, volume: 1, regularMarketVolume: 1 } }
      )
      .sort({ date: 1 })
      .toArray();

    const bars: OHLCVBar[] = docs
      .filter(d => d.close != null)
      .map(d => ({
        date:   new Date(d.date),
        open:   d.open  ?? d.close,
        high:   d.high  ?? d.close,
        low:    d.low   ?? d.close,
        close:  d.close,
        volume: d.volume ?? d.regularMarketVolume ?? 0,
      }));

    return bars.slice(-days); // Return exactly N days
  } catch (error) {
    console.error(`fetchStockData error for ${symbol} (${isin}):`, error);
    return [];
  }
}

/**
 * Fetch only the most recent closing price for a stock.
 * Looks up the latest stockdatas document by (isin, date desc).
 */
export async function fetchCurrentPrice(symbol: string): Promise<number> {
  const isin = SYMBOL_TO_ISIN.get(symbol);
  if (!isin) {
    console.warn(`fetchCurrentPrice: symbol "${symbol}" not in universe`);
    return 0;
  }

  try {
    const db  = getDb();
    const doc = await db
      .collection<StockDataDoc>('stockdatas')
      .findOne(
        { isin },
        { sort: { date: -1 }, projection: { close: 1, currentPrice: 1 } }
      );

    return doc?.currentPrice ?? doc?.close ?? 0;
  } catch (error) {
    console.error(`fetchCurrentPrice error for ${symbol}:`, error);
    return 0;
  }
}

/**
 * Fetch average volume for a stock (20-day average stored in stockdatas).
 * Falls back to computing from the last 20 bars if not stored.
 */
export async function fetchAverageVolume(symbol: string): Promise<number> {
  const isin = SYMBOL_TO_ISIN.get(symbol);
  if (!isin) return 0;

  try {
    const db  = getDb();
    const doc = await db
      .collection<StockDataDoc>('stockdatas')
      .findOne(
        { isin },
        { sort: { date: -1 }, projection: { averageVolume: 1, volume: 1 } }
      );

    if (doc?.averageVolume && doc.averageVolume > 0) {
      return doc.averageVolume;
    }
    // Fall back: compute from last 20 bars
    const bars = await fetchStockData(symbol, 20);
    if (bars.length === 0) return 0;
    return bars.reduce((s, b) => s + b.volume, 0) / bars.length;
  } catch {
    return 0;
  }
}

/**
 * Fetch multiple stocks in parallel (batches of 10 — no rate limiting needed
 * since we're querying our own MongoDB, not an external API).
 */
export async function fetchMultipleStocks(
  symbols: string[],
  days: number = 90
): Promise<Map<string, OHLCVBar[]>> {
  const result   = new Map<string, OHLCVBar[]>();
  const batchSize = 10; // Safe for MongoDB — no external rate limits

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch        = symbols.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async symbol => ({ symbol, data: await fetchStockData(symbol, days) }))
    );
    batchResults.forEach(({ symbol, data }) => result.set(symbol, data));
  }

  return result;
}

/**
 * Get the latest stockdatas document for each stock in a list.
 * Used for bulk current-price lookups during tracking.
 * Single aggregation pipeline — much faster than N individual queries.
 */
export async function fetchBulkCurrentPrices(symbols: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const isins  = symbols
    .map(s => ({ symbol: s, isin: SYMBOL_TO_ISIN.get(s) }))
    .filter(x => x.isin != null) as Array<{ symbol: string; isin: string }>;

  if (isins.length === 0) return result;

  try {
    const db   = getDb();
    const docs = await db
      .collection<StockDataDoc>('stockdatas')
      .aggregate([
        { $match: { isin: { $in: isins.map(x => x.isin) } } },
        { $sort:  { date: -1 } },
        { $group: { _id: '$isin', close: { $first: '$close' }, currentPrice: { $first: '$currentPrice' } } },
      ])
      .toArray() as Array<{ _id: string; close: number; currentPrice?: number }>;

    docs.forEach(doc => {
      const sym = ISIN_TO_SYMBOL.get(doc._id);
      if (sym) result.set(sym, doc.currentPrice ?? doc.close ?? 0);
    });
  } catch (error) {
    console.error('fetchBulkCurrentPrices error:', error);
  }

  return result;
}
