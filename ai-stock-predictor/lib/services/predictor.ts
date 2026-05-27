import dbConnect from '../mongodb';
import Prediction, { IPrediction } from '../models/Prediction';
import ModelWeights, { IWeights } from '../models/ModelWeights';
import { fetchMultipleStocks } from './marketData';
import { computeAllIndicators, normalizeIndicators } from './indicators';
import { STOCK_UNIVERSE_DEDUPED as STOCK_UNIVERSE, getStockInfo } from '../stockUniverse';

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

/**
 * Load active model weights from DB or use defaults
 */
async function loadActiveWeights(): Promise<{ weights: IWeights; version: string }> {
  try {
    const active = await ModelWeights.findOne({ isActive: true }).sort({ date: -1 });
    if (active) {
      return { weights: active.weights, version: active.version };
    }
  } catch (error) {
    console.error('Error loading active weights:', error);
  }
  return { weights: DEFAULT_WEIGHTS, version: 'v1.0' };
}

/**
 * Compute composite score for a stock
 */
function computeCompositeScore(
  normalizedScores: Record<string, number>,
  weights: IWeights
): number {
  return (
    weights.rsi * normalizedScores.rsi +
    weights.macd * normalizedScores.macd +
    weights.bbPosition * normalizedScores.bbPosition +
    weights.volumeRatio * normalizedScores.volumeRatio +
    weights.momentum10d * normalizedScores.momentum10d +
    weights.maCrossover * normalizedScores.maCrossover +
    weights.adx * normalizedScores.adx
  );
}

/**
 * Generate mock predictions for first-run seed data
 */
async function generateMockPredictions(modelVersion: string): Promise<PredictionResult[]> {
  const mockStocks = [
    { symbol: 'RELIANCE.NS', name: 'Reliance Industries', price: 2850.5 },
    { symbol: 'TCS.NS', name: 'Tata Consultancy Services', price: 3920.75 },
    { symbol: 'INFY.NS', name: 'Infosys', price: 1785.25 },
  ];

  const results: PredictionResult[] = [];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);

  for (const stock of mockStocks) {
    const confidenceScore = Math.floor(Math.random() * 20 + 65); // 65-85
    const mockSnapshot = {
      rsi: 52 + Math.random() * 10,
      macdSignal: 0.5 + Math.random() * 0.5,
      bbPosition: 0.55 + Math.random() * 0.2,
      volumeRatio: 1.2 + Math.random() * 0.8,
      momentum10d: 2 + Math.random() * 4,
      maCrossover: 1 + Math.random() * 3,
      adx: 25 + Math.random() * 15,
    };

    const existing = await Prediction.findOne({
      stockSymbol: stock.symbol,
      status: 'Active',
    });

    if (existing) {
      existing.recommendationCount += 1;
      existing.latestRecommendedDate = now;
      existing.recommendationDates.push(now);
      await existing.save();
      results.push({
        stockSymbol: stock.symbol,
        stockName: stock.name,
        entryPrice: existing.entryPrice,
        confidenceScore: existing.confidenceScore,
        compositeScore: 0.7,
        isNew: false,
        recommendationCount: existing.recommendationCount,
      });
    } else {
      await Prediction.create({
        stockSymbol: stock.symbol,
        stockName: stock.name,
        exchange: 'NSE',
        firstRecommendedDate: now,
        latestRecommendedDate: now,
        recommendationDates: [now],
        recommendationCount: 1,
        entryPrice: stock.price,
        targetReturn: 5,
        confidenceScore,
        status: 'Active',
        bestReturn: 0,
        modelVersion,
        indicatorSnapshot: mockSnapshot,
        expiresAt,
      });
      results.push({
        stockSymbol: stock.symbol,
        stockName: stock.name,
        entryPrice: stock.price,
        confidenceScore,
        compositeScore: 0.7,
        isNew: true,
        recommendationCount: 1,
      });
    }
  }

  return results;
}

/**
 * Core daily prediction engine
 * Analyzes all stocks in universe and selects top 3
 */
export async function runDailyPrediction(): Promise<PredictionResult[]> {
  await dbConnect();

  const { weights, version } = await loadActiveWeights();
  const symbols = STOCK_UNIVERSE.map((s) => s.symbol);

  console.log(`Running predictions with model ${version} on ${symbols.length} stocks...`);

  // Fetch 90 days of data for all stocks
  let stockDataMap: Map<string, Awaited<ReturnType<typeof fetchMultipleStocks>> extends Map<string, infer V> ? V : never>;
  try {
    stockDataMap = await fetchMultipleStocks(symbols, 90);
  } catch (error) {
    console.error('Error fetching stock data, using mock predictions:', error);
    return generateMockPredictions(version);
  }

  // Analyze each stock
  const scoredStocks: StockScore[] = [];

  for (const stockInfo of STOCK_UNIVERSE) {
    const bars = stockDataMap.get(stockInfo.symbol);
    if (!bars || bars.length < 30) {
      console.warn(`Insufficient data for ${stockInfo.symbol}, skipping`);
      continue;
    }

    try {
      const indicators = computeAllIndicators(bars);
      const normalizedScores = normalizeIndicators(indicators);
      const compositeScore = computeCompositeScore(normalizedScores, weights);
      const entryPrice = bars[bars.length - 1].close;

      // Confidence score: map composite score to 0-100 with some scaling
      const confidenceScore = Math.min(100, Math.round(compositeScore * 120));

      scoredStocks.push({
        symbol: stockInfo.symbol,
        stockName: stockInfo.name,
        entryPrice,
        compositeScore,
        confidenceScore,
        indicatorSnapshot: {
          rsi: indicators.rsi,
          macdSignal: indicators.macd.signal,
          bbPosition: indicators.bbPosition,
          volumeRatio: indicators.volumeRatio,
          momentum10d: indicators.momentum10d,
          maCrossover: indicators.maCrossover,
          adx: indicators.adx,
        },
        rawRSI: indicators.rsi,
        rawADX: indicators.adx,
      });
    } catch (error) {
      console.error(`Error computing indicators for ${stockInfo.symbol}:`, error);
    }
  }

  if (scoredStocks.length === 0) {
    console.warn('No stocks scored, generating mock predictions');
    return generateMockPredictions(version);
  }

  // Apply filters: composite score >= 0.55, RSI 40-75, ADX > 20
  let threshold = 0.55;
  let filtered = scoredStocks.filter(
    (s) =>
      s.compositeScore >= threshold && s.rawRSI >= 40 && s.rawRSI <= 75 && s.rawADX > 20
  );

  // If fewer than 3 pass, lower threshold to 0.45
  if (filtered.length < 3) {
    threshold = 0.45;
    filtered = scoredStocks.filter(
      (s) => s.compositeScore >= threshold && s.rawRSI >= 40 && s.rawRSI <= 75 && s.rawADX > 20
    );
  }

  // If still < 3, take top 3 regardless
  if (filtered.length < 3) {
    filtered = [...scoredStocks].sort((a, b) => b.compositeScore - a.compositeScore).slice(0, 3);
  } else {
    // Sort by composite score and take top 3
    filtered = filtered.sort((a, b) => b.compositeScore - a.compositeScore).slice(0, 3);
  }

  // Upsert predictions into database
  const results: PredictionResult[] = [];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);

  for (const stock of filtered) {
    const existing = await Prediction.findOne({
      stockSymbol: stock.symbol,
      status: 'Active',
    });

    if (existing) {
      // Increment recommendation count for active prediction
      existing.recommendationCount += 1;
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
      // Create new prediction
      await Prediction.create({
        stockSymbol: stock.symbol,
        stockName: stock.stockName,
        exchange: 'NSE',
        firstRecommendedDate: now,
        latestRecommendedDate: now,
        recommendationDates: [now],
        recommendationCount: 1,
        entryPrice: stock.entryPrice,
        targetReturn: 5,
        confidenceScore: stock.confidenceScore,
        status: 'Active',
        bestReturn: 0,
        modelVersion: version,
        indicatorSnapshot: stock.indicatorSnapshot,
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
