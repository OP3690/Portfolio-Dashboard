import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PredictionTrade from '@/lib/models/PredictionTrade';
import Prediction from '@/lib/models/Prediction';
import TrackingEntry from '@/lib/models/TrackingEntry';
import StockData from '@/models/StockData';
import { getStockIsin } from '@/lib/aiServices/stockUniverse';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

/* ── GET /api/prediction-trades ─────────────────────────────────────────────
   Returns all trades, enriched with current price from latest TrackingEntry.
─────────────────────────────────────────────────────────────────────────── */
export async function GET() {
  try {
    await dbConnect();

    const trades = await PredictionTrade.find({}).sort({ createdAt: -1 }).lean();

    if (trades.length === 0) {
      return NextResponse.json({ success: true, trades: [] });
    }

    // Fetch latest TrackingEntry for each prediction to get current price
    const predIds = trades.map((t: any) => new mongoose.Types.ObjectId(t.predictionId));
    const latestEntries = await TrackingEntry.aggregate([
      { $match: { predictionId: { $in: predIds } } },
      { $sort: { date: -1 } },
      { $group: { _id: '$predictionId', closingPrice: { $first: '$closingPrice' }, totalReturn: { $first: '$totalReturn' }, date: { $first: '$date' } } },
    ]);

    const priceMap = new Map<string, { currentPrice: number; totalReturn: number; lastDate: Date }>();
    for (const e of latestEntries) {
      priceMap.set(e._id.toString(), {
        currentPrice: e.closingPrice,
        totalReturn:  e.totalReturn,
        lastDate:     e.date,
      });
    }

    // Fallback: for trades whose predictionId has no TrackingEntry, look up by stockSymbol
    // (covers trades bought under older/different prediction cycles)
    const symbols = [...new Set(trades.map((t: any) => t.stockSymbol as string))];
    const symbolEntries = await TrackingEntry.aggregate([
      { $match: { stockSymbol: { $in: symbols } } },
      { $sort: { date: -1 } },
      { $group: { _id: '$stockSymbol', closingPrice: { $first: '$closingPrice' }, totalReturn: { $first: '$totalReturn' }, date: { $first: '$date' } } },
    ]);

    const symbolPriceMap = new Map<string, { currentPrice: number; totalReturn: number; lastDate: Date }>();
    for (const e of symbolEntries) {
      symbolPriceMap.set(e._id as string, {
        currentPrice: e.closingPrice,
        totalReturn:  e.totalReturn,
        lastDate:     e.date,
      });
    }

    // Final fallback: StockData (persistent OHLCV, no TTL) — covers trades whose
    // TrackingEntries have expired (>60 days old) or were never tracked
    const symbolIsins = symbols
      .map(sym => ({ sym, isin: getStockIsin(sym) }))
      .filter((x): x is { sym: string; isin: string } => !!x.isin);
    const isins = symbolIsins.map(x => x.isin);

    const stockDataEntries = isins.length > 0
      ? await StockData.aggregate([
          { $match: { isin: { $in: isins }, $or: [{ close: { $ne: null } }, { currentPrice: { $ne: null } }] } },
          { $sort: { date: -1 } },
          { $group: { _id: '$isin', close: { $first: '$close' }, currentPrice: { $first: '$currentPrice' }, date: { $first: '$date' } } },
        ])
      : [];

    // isin → latest price
    const isinPriceMap = new Map<string, { price: number; date: Date }>();
    for (const e of stockDataEntries) {
      const price = e.close ?? e.currentPrice;
      if (price != null) isinPriceMap.set(e._id as string, { price, date: e.date });
    }

    // stockSymbol → latest price (via ISIN resolution)
    const stockDataPriceMap = new Map<string, { price: number; date: Date }>();
    for (const { sym, isin } of symbolIsins) {
      const entry = isinPriceMap.get(isin);
      if (entry) stockDataPriceMap.set(sym, entry);
    }

    // Also pull prediction status
    const predictions = await Prediction.find(
      { _id: { $in: predIds } },
      { status: 1 },
    ).lean();
    const statusMap = new Map<string, string>();
    for (const p of predictions) statusMap.set((p._id as any).toString(), p.status);

    const enriched = trades.map((t: any) => {
      // Price priority:
      // 1. StockData (persistent, no TTL, most up-to-date OHLCV)
      // 2. TrackingEntry by predictionId (prediction-specific daily tracking)
      // 3. TrackingEntry by stockSymbol (any cycle for that stock)
      // 4. buyPrice (last resort — unrealizedPnL will show 0)
      const sdEntry = stockDataPriceMap.get(t.stockSymbol);
      const tp      = priceMap.get(t.predictionId.toString()) ?? symbolPriceMap.get(t.stockSymbol);
      const currentPrice   = sdEntry?.price ?? tp?.currentPrice ?? t.buyPrice;
      const lastTracked    = sdEntry?.date ?? tp?.lastDate ?? null;

      const unrealizedPnL  = (currentPrice - t.buyPrice) * t.remainingQuantity;
      const unrealizedPnLPct = t.buyPrice > 0
        ? ((currentPrice - t.buyPrice) / t.buyPrice) * 100
        : 0;
      const currentValue   = currentPrice * t.remainingQuantity;
      const totalPnL       = t.realizedPnL + unrealizedPnL;
      const totalInvested  = t.buyPrice * t.buyQuantity;
      const totalPnLPct    = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

      return {
        ...t,
        currentPrice,
        unrealizedPnL,
        unrealizedPnLPct,
        currentValue,
        totalPnL,
        totalPnLPct,
        predictionStatus: statusMap.get(t.predictionId.toString()) ?? 'Unknown',
        lastTracked,
      };
    });

    return NextResponse.json({ success: true, trades: enriched });
  } catch (err: any) {
    console.error('GET prediction-trades error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/* ── POST /api/prediction-trades ────────────────────────────────────────────
   Create a new buy trade.
   Body: { predictionId, buyDate, buyPrice, buyQuantity, notes? }
─────────────────────────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const body = await req.json();
    const { predictionId, buyDate, buyPrice, buyQuantity, notes } = body;

    if (!predictionId || !buyDate || buyPrice == null || buyQuantity == null) {
      return NextResponse.json(
        { success: false, error: 'predictionId, buyDate, buyPrice, buyQuantity are required' },
        { status: 400 },
      );
    }

    const bPrice = parseFloat(buyPrice);
    const bQty   = parseFloat(buyQuantity);

    if (bPrice <= 0 || bQty <= 0) {
      return NextResponse.json(
        { success: false, error: 'buyPrice and buyQuantity must be positive' },
        { status: 400 },
      );
    }

    // Load prediction for stock name / entry price
    const prediction = await Prediction.findById(predictionId);
    if (!prediction) {
      return NextResponse.json({ success: false, error: 'Prediction not found' }, { status: 404 });
    }

    const trade = await PredictionTrade.create({
      predictionId,
      stockSymbol:          prediction.stockSymbol,
      stockName:            prediction.stockName,
      predictionEntryPrice: prediction.entryPrice,
      buyDate:              new Date(buyDate),
      buyPrice:             bPrice,
      buyQuantity:          bQty,
      totalInvested:        bPrice * bQty,
      remainingQuantity:    bQty,
      soldQuantity:         0,
      realizedPnL:          0,
      realizedPnLPct:       0,
      status:               'holding',
      notes:                notes ?? '',
    });

    return NextResponse.json({ success: true, trade });
  } catch (err: any) {
    console.error('POST prediction-trades error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
