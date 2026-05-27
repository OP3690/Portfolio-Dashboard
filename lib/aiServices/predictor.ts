import dbConnect from '../mongodb';
import Prediction, { IPrediction } from '../models/Prediction';
import ModelWeights, { IWeights } from '../models/ModelWeights';
import { fetchMultipleStocks } from './marketData';
import { computeAllIndicators, normalizeIndicators } from './indicators';
import { STOCK_UNIVERSE_DEDUPED as STOCK_UNIVERSE, getStockInfo } from './stockUniverse';

const DEFAULT_WEIGHTS: IWeights = {
  rsi: 0.15,
  macd: 0.20,
  bbPosition: 0.10,
  volumeRatio: 0.15,
  momentum10d: 0.20,
  maCrossover: 0.10,
  adx: 0.10,
};

export interface PredictionResult {
  stockSymbol: string;
  stockName: string;
  entryPrice: number;
  confidenceScore: number;
  compositeScore: number;
  isNew: boolean;
  recommendationCount: number;
}

interface StockScore {
  symbol: string;
  stockName: string;
  entryPrice: number;
  compositeScore: number;
  confidenceScore: number;
  indicatorSnapshot: {
    rsi: number;
    macdSignal: number;
    bbPosition: number;
    volumeRatio: number;
    momentum10d: number;
    maCrossover: number;
    adx: number;
  };
  rawRSI: number;
  rawADX: number;
}

async function loadActiveWeights(): Promise<{ weights: IWeights; version: string }> {
  try {
    const active = await ModelWeights.findOne({ isActive: true }).sort({ date: -1 });
    if (active) return { weights: active.weights, version: active.version };
  } catch (error) {
    console.error('Error loading active weights:', error);
  }
  return { weights: DEFAULT_WEIGHTS, version: 'v1.0' };
}

function computeCompositeScore(normalizedScores: Record<string, number>, weights: IWeights): number {
  return (
    weights.rsi          * normalizedScores.rsi +
    weights.macd         * normalizedScores.macd +
    weights.bbPosition   * normalizedScores.bbPosition +
    weights.volumeRatio  * normalizedScores.volumeRatio +
    weights.momentum10d  * normalizedScores.momentum10d +
    weights.maCrossover  * normalizedScores.maCrossover +
    weights.adx          * normalizedScores.adx
  );
}

export async function runDailyPrediction(): Promise<PredictionResult[]> {
  await dbConnect();

  const { weights, version } = await loadActiveWeights();
  const symbols = STOCK_UNIVERSE.map((s) => s.symbol);

  console.log(`Running predictions with model ${version} on ${symbols.length} stocks...`);

  let stockDataMap: Map<string, { date: Date; open: number; high: number; low: number; close: number; volume: number }[]>;
  try {
    stockDataMap = await fetchMultipleStocks(symbols, 90);
  } catch (error) {
    console.error('Error fetching stock data:', error);
    return [];
  }

  const scoredStocks: StockScore[] = [];

  for (const stockInfo of STOCK_UNIVERSE) {
    const bars = stockDataMap.get(stockInfo.symbol);
    if (!bars || bars.length < 30) {
      console.warn(`Insufficient data for ${stockInfo.symbol}, skipping`);
      continue;
    }

    try {
      const indicators       = computeAllIndicators(bars);
      const normalizedScores = normalizeIndicators(indicators);
      const compositeScore   = computeCompositeScore(normalizedScores, weights);
      const entryPrice       = bars[bars.length - 1].close;
      const confidenceScore  = Math.min(100, Math.round(compositeScore * 120));

      scoredStocks.push({
        symbol: stockInfo.symbol,
        stockName: stockInfo.name,
        entryPrice,
        compositeScore,
        confidenceScore,
        indicatorSnapshot: {
          rsi:         indicators.rsi,
          macdSignal:  indicators.macd.signal,
          bbPosition:  indicators.bbPosition,
          volumeRatio: indicators.volumeRatio,
          momentum10d: indicators.momentum10d,
          maCrossover: indicators.maCrossover,
          adx:         indicators.adx,
        },
        rawRSI: indicators.rsi,
        rawADX: indicators.adx,
      });
    } catch (error) {
      console.error(`Error computing indicators for ${stockInfo.symbol}:`, error);
    }
  }

  if (scoredStocks.length === 0) {
    console.warn('No stocks scored');
    return [];
  }

  // Apply filters: composite score >= 0.55, RSI 40-75, ADX > 20
  let threshold = 0.55;
  let filtered = scoredStocks.filter(
    (s) => s.compositeScore >= threshold && s.rawRSI >= 40 && s.rawRSI <= 75 && s.rawADX > 20
  );

  if (filtered.length < 3) {
    threshold = 0.45;
    filtered = scoredStocks.filter(
      (s) => s.compositeScore >= threshold && s.rawRSI >= 40 && s.rawRSI <= 75 && s.rawADX > 20
    );
  }

  if (filtered.length < 3) {
    filtered = [...scoredStocks].sort((a, b) => b.compositeScore - a.compositeScore).slice(0, 3);
  } else {
    filtered = filtered.sort((a, b) => b.compositeScore - a.compositeScore).slice(0, 3);
  }

  const results: PredictionResult[] = [];
  const now       = new Date();
  const expiresAt = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);

  for (const stock of filtered) {
    const existing = await Prediction.findOne({ stockSymbol: stock.symbol, status: 'Active' });

    if (existing) {
      existing.recommendationCount  += 1;
      existing.latestRecommendedDate = now;
      existing.recommendationDates.push(now);
      await existing.save();

      results.push({
        stockSymbol: stock.symbol,
        stockName: stock.stockName,
        entryPrice: existing.entryPrice,
        confidenceScore: existing.confidenceScore,
        compositeScore: stock.compositeScore,
        isNew: false,
        recommendationCount: existing.recommendationCount,
      });
    } else {
      await Prediction.create({
        stockSymbol:          stock.symbol,
        stockName:            stock.stockName,
        exchange:             'NSE',
        firstRecommendedDate: now,
        latestRecommendedDate: now,
        recommendationDates:  [now],
        recommendationCount:  1,
        entryPrice:           stock.entryPrice,
        targetReturn:         5,
        confidenceScore:      stock.confidenceScore,
        status:               'Active',
        bestReturn:           0,
        modelVersion:         version,
        indicatorSnapshot:    stock.indicatorSnapshot,
        expiresAt,
      });

      results.push({
        stockSymbol: stock.symbol,
        stockName: stock.stockName,
        entryPrice: stock.entryPrice,
        confidenceScore: stock.confidenceScore,
        compositeScore: stock.compositeScore,
        isNew: true,
        recommendationCount: 1,
      });
    }
  }

  console.log(`Prediction run complete. ${results.length} predictions created/updated.`);
  return results;
}
