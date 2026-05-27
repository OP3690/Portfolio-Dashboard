import mongoose from 'mongoose';
import { STOCK_UNIVERSE_DEDUPED } from './stockUniverse';

export interface OHLCVBar {
  date: Date; open: number; high: number; low: number; close: number; volume: number;
}

const SYMBOL_TO_ISIN = new Map<string, string>();
const ISIN_TO_SYMBOL = new Map<string, string>();
STOCK_UNIVERSE_DEDUPED.forEach((s: { symbol: string; isin: string }) => {
  SYMBOL_TO_ISIN.set(s.symbol, s.isin);
  ISIN_TO_SYMBOL.set(s.isin, s.symbol);
});

function getDb() {
  if (!mongoose.connection.db) throw new Error('MongoDB not connected');
  return mongoose.connection.db;
}

export async function fetchStockData(symbol: string, days = 90): Promise<OHLCVBar[]> {
  const isin = SYMBOL_TO_ISIN.get(symbol);
  if (!isin) return [];
  try {
    const since = new Date();
    since.setDate(since.getDate() - Math.ceil(days * 1.5));
    const docs = await getDb().collection('stockdatas')
      .find({ isin, date: { $gte: since } }, { projection: { date:1, open:1, high:1, low:1, close:1, volume:1, regularMarketVolume:1 } })
      .sort({ date: 1 }).toArray() as any[];
    return docs.filter((d: any) => d.close != null).map((d: any) => ({
      date: new Date(d.date), open: d.open ?? d.close, high: d.high ?? d.close,
      low: d.low ?? d.close, close: d.close, volume: d.volume ?? d.regularMarketVolume ?? 0,
    })).slice(-days);
  } catch { return []; }
}

export async function fetchCurrentPrice(symbol: string): Promise<number> {
  const isin = SYMBOL_TO_ISIN.get(symbol);
  if (!isin) return 0;
  try {
    const doc = await getDb().collection('stockdatas')
      .findOne({ isin }, { sort: { date: -1 }, projection: { close:1, currentPrice:1 } }) as any;
    return doc?.currentPrice ?? doc?.close ?? 0;
  } catch { return 0; }
}

export async function fetchMultipleStocks(symbols: string[], days = 90): Promise<Map<string, OHLCVBar[]>> {
  const result = new Map<string, OHLCVBar[]>();
  const batchSize = 10;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const res = await Promise.all(batch.map(async s => ({ s, data: await fetchStockData(s, days) })));
    res.forEach(({ s, data }) => result.set(s, data));
  }
  return result;
}

export async function fetchBulkCurrentPrices(symbols: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const isins = symbols.map(s => SYMBOL_TO_ISIN.get(s)).filter(Boolean) as string[];
  if (!isins.length) return result;
  try {
    const docs = await getDb().collection('stockdatas').aggregate([
      { $match: { isin: { $in: isins } } },
      { $sort: { date: -1 } },
      { $group: { _id: '$isin', close: { $first: '$close' }, currentPrice: { $first: '$currentPrice' } } },
    ]).toArray() as any[];
    docs.forEach((d: any) => {
      const sym = ISIN_TO_SYMBOL.get(d._id);
      if (sym) result.set(sym, d.currentPrice ?? d.close ?? 0);
    });
  } catch {}
  return result;
}
