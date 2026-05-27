import dbConnect from '../mongodb';
import Prediction, { PredictionStatus } from '../models/Prediction';
import TrackingEntry from '../models/TrackingEntry';
import mongoose from 'mongoose';
import { STOCK_UNIVERSE_DEDUPED } from './stockUniverse';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

const SYMBOL_TO_ISIN = new Map<string, string>();
STOCK_UNIVERSE_DEDUPED.forEach((s: { symbol: string; isin: string }) => {
  SYMBOL_TO_ISIN.set(s.symbol, s.isin);
});

function getDb() {
  if (!mongoose.connection.db) throw new Error('MongoDB not connected');
  return mongoose.connection.db;
}

export function getTradingDaysBetween(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);
  while (current <= endDate) {
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return Math.max(0, count - 1);
}

export function getDayNumber(predictionDate: Date): number {
  return getTradingDaysBetween(predictionDate, new Date());
}

function evaluateOutcome(totalReturn: number, dayNumber: number): PredictionStatus | null {
  if (dayNumber >= 3 && totalReturn >= 5) {
    return totalReturn >= 10 ? 'OverAchieved' : 'Achieved';
  }
  if (dayNumber >= 30) {
    if (totalReturn >= 10) return 'OverAchieved';
    if (totalReturn >= 5)  return 'Achieved';
    if (totalReturn >= 3)  return 'MissedSlightly';
    return 'Missed';
  }
  if (dayNumber >= 45) return 'Expired';
  return null;
}

/** Strip time from a Date → midnight UTC YYYY-MM-DD key */
function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface DayBar { dateStr: string; close: number; volume: number; }

/**
 * Fetch all OHLCV closes for a stock from stockdatas between start and today.
 * Returns an array sorted ascending by date.
 */
async function fetchHistoricalCloses(
  symbol: string,
  since: Date,
): Promise<DayBar[]> {
  const isin = SYMBOL_TO_ISIN.get(symbol);
  if (!isin) return [];

  // Fetch one extra day before `since` so we can compute dailyChange on day-1
  const lookback = new Date(since);
  lookback.setDate(lookback.getDate() - 5); // a few calendar days back covers weekends

  try {
    const docs = await getDb()
      .collection('stockdatas')
      .find(
        { isin, date: { $gte: lookback } },
        { projection: { date: 1, close: 1, volume: 1, regularMarketVolume: 1 } },
      )
      .sort({ date: 1 })
      .toArray() as any[];

    return docs
      .filter((d: any) => d.close != null)
      .map((d: any) => ({
        dateStr: dateKey(new Date(d.date)),
        close:   d.close as number,
        volume:  (d.volume ?? d.regularMarketVolume ?? 0) as number,
      }));
  } catch {
    return [];
  }
}

interface TrackingUpdateResult {
  updatedCount: number;
  evaluatedCount: number;
  expiredCount: number;
}

/**
 * For every Active prediction:
 *   1. Pull full OHLCV history from stockdatas since the recommendation date.
 *   2. For each trading day that has a real closing price, upsert a TrackingEntry
 *      with the correct dailyChange (day-over-day) and totalReturn (vs entryPrice).
 *   3. Evaluate outcomes and expire old predictions.
 */
export async function updateDailyTracking(): Promise<TrackingUpdateResult> {
  await dbConnect();

  const activePredictions = await Prediction.find({ status: 'Active' });
  console.log(`Updating tracking for ${activePredictions.length} active predictions…`);

  let updatedCount   = 0;
  let evaluatedCount = 0;
  let expiredCount   = 0;

  for (const prediction of activePredictions) {
    try {
      const recDate   = new Date(prediction.firstRecommendedDate);
      const entryExpiresAt = new Date(recDate.getTime() + 60 * 24 * 60 * 60 * 1000);

      // ── Fetch historical closes since recommendation date ──────────────────
      const bars = await fetchHistoricalCloses(prediction.stockSymbol, recDate);
      if (bars.length === 0) {
        console.warn(`No historical data for ${prediction.stockSymbol}, skipping`);
        continue;
      }

      const recDateStr = dateKey(recDate);
      const todayStr   = dateKey(new Date());

      // Build a lookup map for quick access
      const barMap = new Map<string, DayBar>();
      for (const b of bars) barMap.set(b.dateStr, b);

      // Sorted date strings that are on/after the recommendation date
      const tradingDays = bars
        .map(b => b.dateStr)
        .filter(d => d >= recDateStr && d <= todayStr);

      if (tradingDays.length === 0) continue;

      let lastClose: number | null = null;

      // Seed lastClose from the bar just before recommendation date (if available)
      const priorBars = bars.filter(b => b.dateStr < recDateStr);
      if (priorBars.length > 0) {
        lastClose = priorBars[priorBars.length - 1].close;
      }

      let latestTotalReturn = 0;
      let latestDayNumber   = 0;
      let latestClose       = prediction.entryPrice;

      for (let i = 0; i < tradingDays.length; i++) {
        const ds  = tradingDays[i];
        const bar = barMap.get(ds)!;

        const dayNumber   = getTradingDaysBetween(recDate, new Date(ds + 'T12:00:00Z'));
        const totalReturn = ((bar.close - prediction.entryPrice) / prediction.entryPrice) * 100;

        // dailyChange: % vs previous available close; on Day-0 use total-return as reference
        const dailyChange = lastClose != null && lastClose !== 0
          ? ((bar.close - lastClose) / lastClose) * 100
          : totalReturn;

        const entryDate = new Date(ds + 'T12:00:00Z'); // noon UTC ~ stable across timezones

        await TrackingEntry.findOneAndUpdate(
          {
            predictionId: prediction._id,
            // Match any doc whose date falls on the same calendar day (UTC)
            date: {
              $gte: new Date(ds + 'T00:00:00Z'),
              $lt:  new Date(ds + 'T23:59:59Z'),
            },
          },
          {
            predictionId: prediction._id,
            stockSymbol:  prediction.stockSymbol,
            date:         entryDate,
            closingPrice: bar.close,
            dailyChange,
            totalReturn,
            volume:       bar.volume,
            dayNumber,
            expiresAt:    entryExpiresAt,
          },
          { upsert: true, new: true },
        );

        lastClose         = bar.close;
        latestTotalReturn = totalReturn;
        latestDayNumber   = dayNumber;
        latestClose       = bar.close;
        updatedCount++;
      }

      // ── Update prediction's bestReturn ─────────────────────────────────────
      if (latestTotalReturn > prediction.bestReturn) {
        prediction.bestReturn = latestTotalReturn;
      }

      // ── Evaluate outcome ───────────────────────────────────────────────────
      let newStatus: PredictionStatus | null = null;
      if (latestDayNumber >= 45) {
        newStatus = 'Expired';
        expiredCount++;
      } else {
        newStatus = evaluateOutcome(latestTotalReturn, latestDayNumber);
      }

      if (newStatus && newStatus !== 'Active') {
        prediction.status         = newStatus;
        prediction.finalReturn    = latestTotalReturn;
        prediction.evaluationDate = new Date();
        evaluatedCount++;
      }

      await prediction.save();

    } catch (error) {
      console.error(`Error tracking ${prediction.stockSymbol}:`, error);
    }
  }

  console.log(`Tracking complete: ${updatedCount} entries upserted, ${evaluatedCount} evaluated, ${expiredCount} expired`);
  return { updatedCount, evaluatedCount, expiredCount };
}

export async function getTrackingHistory(predictionId: string) {
  await dbConnect();
  return TrackingEntry.find({ predictionId }).sort({ dayNumber: 1 });
}
