import dbConnect from '../mongodb';
import Prediction, { PredictionStatus } from '../models/Prediction';
import TrackingEntry from '../models/TrackingEntry';
import { fetchCurrentPrice, fetchBulkCurrentPrices } from './marketData';

/**
 * Count the number of trading days (Mon-Fri) between two dates
 */
export function getTradingDaysBetween(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);

  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  // Don't count the start date itself, only days after
  return Math.max(0, count - 1);
}

/**
 * Get the trading day number since prediction was made (skip weekends)
 */
export function getDayNumber(predictionDate: Date): number {
  const now = new Date();
  return getTradingDaysBetween(predictionDate, now);
}

/**
 * Evaluate prediction outcome after 30 days
 */
function evaluateOutcome(totalReturn: number, dayNumber: number): PredictionStatus | null {
  if (dayNumber >= 3 && totalReturn >= 5) {
    return totalReturn >= 10 ? 'OverAchieved' : 'Achieved';
  }

  if (dayNumber >= 30) {
    if (totalReturn >= 10) return 'OverAchieved';
    if (totalReturn >= 5) return 'Achieved';
    if (totalReturn >= 3) return 'MissedSlightly';
    return 'Missed';
  }

  if (dayNumber >= 45) return 'Expired';

  return null; // Still active
}

interface TrackingUpdateResult {
  updatedCount: number;
  evaluatedCount: number;
  expiredCount: number;
}

/**
 * Main daily tracking service
 * Updates tracking entries for all active predictions
 */
export async function updateDailyTracking(): Promise<TrackingUpdateResult> {
  await dbConnect();

  const activePredictions = await Prediction.find({ status: 'Active' });
  console.log(`Updating tracking for ${activePredictions.length} active predictions...`);

  // Bulk-fetch all current prices in one MongoDB aggregation (much faster)
  const priceMap = await fetchBulkCurrentPrices(
    activePredictions.map(p => p.stockSymbol)
  );

  let updatedCount = 0;
  let evaluatedCount = 0;
  let expiredCount = 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const prediction of activePredictions) {
    try {
      const currentPrice = priceMap.get(prediction.stockSymbol) ??
                           await fetchCurrentPrice(prediction.stockSymbol);
      if (!currentPrice || currentPrice === 0) {
        console.warn(`Could not fetch price for ${prediction.stockSymbol}, skipping`);
        continue;
      }

      const dayNumber = getDayNumber(prediction.firstRecommendedDate);
      const totalReturn =
        ((currentPrice - prediction.entryPrice) / prediction.entryPrice) * 100;

      // Calculate daily change from previous tracking entry
      const lastEntry = await TrackingEntry.findOne({
        predictionId: prediction._id,
      })
        .sort({ dayNumber: -1 })
        .limit(1);

      const dailyChange = lastEntry
        ? ((currentPrice - lastEntry.closingPrice) / lastEntry.closingPrice) * 100
        : totalReturn;

      // Create tracking entry (upsert to avoid duplicates for same day)
      const entryExpiresAt = new Date(
        prediction.firstRecommendedDate.getTime() + 60 * 24 * 60 * 60 * 1000
      );

      await TrackingEntry.findOneAndUpdate(
        {
          predictionId: prediction._id,
          date: {
            $gte: today,
            $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
          },
        },
        {
          predictionId: prediction._id,
          stockSymbol: prediction.stockSymbol,
          date: new Date(),
          closingPrice: currentPrice,
          dailyChange,
          totalReturn,
          volume: 0, // Volume not fetched in real-time here
          dayNumber,
          expiresAt: entryExpiresAt,
        },
        { upsert: true, new: true }
      );

      updatedCount++;

      // Update best return if improved
      if (totalReturn > prediction.bestReturn) {
        prediction.bestReturn = totalReturn;
      }

      // Check outcome conditions
      let newStatus: PredictionStatus | null = null;

      if (dayNumber >= 45) {
        newStatus = 'Expired';
        expiredCount++;
      } else {
        newStatus = evaluateOutcome(totalReturn, dayNumber);
      }

      if (newStatus && newStatus !== 'Active') {
        prediction.status = newStatus;
        prediction.finalReturn = totalReturn;
        prediction.evaluationDate = new Date();
        evaluatedCount++;
        console.log(
          `Prediction for ${prediction.stockSymbol} evaluated as ${newStatus} (return: ${totalReturn.toFixed(2)}%)`
        );
      }

      await prediction.save();
    } catch (error) {
      console.error(`Error tracking ${prediction.stockSymbol}:`, error);
    }
  }

  return { updatedCount, evaluatedCount, expiredCount };
}

/**
 * Get all tracking entries for a specific prediction
 */
export async function getTrackingHistory(predictionId: string) {
  await dbConnect();
  return TrackingEntry.find({ predictionId }).sort({ dayNumber: 1 });
}
