/**
 * Local script:
 *   1. DELETE all stockdata for non-holding ISINs (free up space)
 *   2. BACKFILL 5-year Yahoo Finance OHLCV for all 22 holding ISINs
 *
 * Run with:  node scripts/backfill-holdings.mjs
 */

import mongoose from 'mongoose';
import https from 'https';

const MONGODB_URI =
  'mongodb+srv://root:zUQfjzImQWoof7xs@cluster0.cyu0ctf.mongodb.net/OP_Portfolio_Dashboard?retryWrites=true&w=majority&appName=Cluster0';

// ── minimal schemas ──────────────────────────────────────────────────────────
const holdingSchema    = new mongoose.Schema({ isin: String, clientId: String }, { strict: false });
const stockMasterSchema= new mongoose.Schema({ isin: String, symbol: String, exchange: String, stockName: String }, { strict: false });
const stockDataSchema  = new mongoose.Schema(
  { isin: String, symbol: String, exchange: String, stockName: String,
    date: Date, open: Number, high: Number, low: Number, close: Number,
    volume: Number, currentPrice: Number, lastUpdated: Date },
  { strict: false }
);
stockDataSchema.index({ isin: 1, date: 1 }, { unique: true });

const Holding     = mongoose.models.Holding     || mongoose.model('Holding',     holdingSchema,     'holdings');
const StockMaster = mongoose.models.StockMaster || mongoose.model('StockMaster', stockMasterSchema, 'stockmasters');
const StockData   = mongoose.models.StockData   || mongoose.model('StockData',   stockDataSchema,   'stockdatas');

// ── helpers ──────────────────────────────────────────────────────────────────
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; portfolio-backfill)', Accept: 'application/json' },
      timeout: 30000,
    }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('JSON parse error')); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchYahooData(symbol, exchange, fromDate, toDate) {
  const suffix  = exchange === 'BSE' ? '.BO' : '.NS';
  const ticker  = encodeURIComponent(symbol + suffix);
  const period1 = Math.floor(fromDate.getTime() / 1000);
  const period2 = Math.floor(toDate.getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1d`;

  const json = await httpsGet(url);
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const timestamps = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const { open = [], high = [], low = [], close = [], volume = [] } = q;

  const records = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (!close[i]) continue;
    records.push({
      date:   new Date(timestamps[i] * 1000),
      open:   open[i]   || close[i],
      high:   high[i]   || close[i],
      low:    low[i]    || close[i],
      close:  close[i],
      volume: volume[i] || 0,
    });
  }
  return records;
}

async function backfillISIN(isin) {
  const master = await StockMaster.findOne({ isin }).select('symbol exchange stockName').lean();
  if (!master?.symbol) {
    console.log(`  ⚠️  No StockMaster entry for ${isin} — skipping`);
    return 0;
  }

  const { symbol, exchange, stockName } = master;
  const toDate   = new Date();
  const fromDate = new Date(toDate.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);

  console.log(`  → ${symbol} (${exchange})`);

  let records = await fetchYahooData(symbol, exchange, fromDate, toDate);
  if (records.length === 0) {
    const alt = exchange === 'NSE' ? 'BSE' : 'NSE';
    console.log(`     No data from ${exchange}, trying ${alt}…`);
    records = await fetchYahooData(symbol, alt, fromDate, toDate);
  }

  if (records.length === 0) {
    console.log(`  ❌ No Yahoo Finance data for ${symbol}`);
    return 0;
  }

  const ops = records.map(r => ({
    updateOne: {
      filter: { isin, date: r.date },
      update: {
        $set: {
          isin, symbol, exchange,
          stockName: stockName || symbol,
          date: r.date, open: r.open, high: r.high, low: r.low,
          close: r.close, volume: r.volume, currentPrice: r.close,
          lastUpdated: new Date(),
        },
      },
      upsert: true,
    },
  }));

  const res = await StockData.bulkWrite(ops, { ordered: false });
  const saved = (res.upsertedCount || 0) + (res.modifiedCount || 0);
  console.log(`  ✅ ${saved} records saved (${records.length} fetched)`);
  return saved;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔌 Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected\n');

  // ── Step 1: get holding ISINs ────────────────────────────────────────────
  const holdings = await Holding.find({ clientId: '994826' }).select('isin').lean();
  const holdingIsins = [...new Set(holdings.map(h => h.isin).filter(Boolean))];
  console.log(`📋 ${holdingIsins.length} holding ISINs: ${holdingIsins.join(', ')}\n`);

  // ── Step 2: delete ALL non-holding stockdata in batches ──────────────────
  console.log('🗑️  Deleting all non-holding stock data to free space…');
  let totalDeleted = 0;
  while (true) {
    // Find IDs of non-holding records in batches of 50k
    const ids = await StockData
      .find({ isin: { $nin: holdingIsins } }, { _id: 1 })
      .limit(50000)
      .lean();
    if (ids.length === 0) break;
    const r = await StockData.deleteMany({ _id: { $in: ids.map(d => d._id) } });
    totalDeleted += r.deletedCount;
    const remaining = await StockData.countDocuments({ isin: { $nin: holdingIsins } });
    console.log(`   Deleted ${r.deletedCount} — remaining non-holding: ${remaining}`);
    if (remaining === 0) break;
  }
  console.log(`✅ Cleared ${totalDeleted} non-holding records\n`);

  // ── Step 3: also delete holding data older than 5 years ─────────────────
  const cutoff5yr = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000);
  const oldHolding = await StockData.deleteMany({ isin: { $in: holdingIsins }, date: { $lt: cutoff5yr } });
  console.log(`✅ Deleted ${oldHolding.deletedCount} holding records older than 5yr\n`);

  // ── Step 4: backfill 5 years for each holding ───────────────────────────
  console.log('📈 Backfilling 5-year data for holdings…\n');
  let totalSaved = 0;
  for (let i = 0; i < holdingIsins.length; i++) {
    const isin = holdingIsins[i];
    console.log(`[${i + 1}/${holdingIsins.length}] ${isin}`);
    try {
      totalSaved += await backfillISIN(isin);
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}`);
    }
    if (i < holdingIsins.length - 1) await sleep(800);
  }

  const total = await StockData.countDocuments();
  console.log(`\n🎉 Done! Saved ${totalSaved} records. Total in DB: ${total}`);
  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
