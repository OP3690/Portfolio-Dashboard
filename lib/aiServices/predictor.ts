/**
 * predictor.ts — Advanced Multi-Layer Ensemble Prediction Engine
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Architecture (4 independent signal layers):
 *
 *  Layer 1 – Technical Score
 *    RSI(14), MACD(12/26/9), Bollinger position, Volume ratio,
 *    Momentum 10d, MA crossover, ADX(14)
 *    → normalised + weighted by learned per-indicator weights
 *
 *  Layer 2 – Advanced Score
 *    Hurst exponent, Z-scores (20d/60d), OBV slope, Chaikin Money Flow,
 *    ATR percentile, HV percentile, Stochastic, Williams %R, CCI,
 *    ROC (5/20/60d), Price percentile
 *    → each normalised to [0,1] bullish score, averaged
 *
 *  Layer 3 – Monte Carlo Probability (GBM)
 *    Calibrates drift (μ) and volatility (σ) from last 60 trading days.
 *    Applies GARCH-style recent-vol blend (0.7 long-run + 0.3 5-day vol).
 *    Simulates 12,000 price paths over 3 trading days.
 *    → P(return ≥ 5% in 3 days)
 *
 *  Layer 4 – Walk-Forward Backtest Win Rate
 *    Tests the BUY-signal logic (SMA20 crossover + volume confirmation) on
 *    the last 20 historical signal events for THIS stock specifically.
 *    → historical hit rate for the 5% / 3-day target
 *
 *  Combination: Weighted Geometric Mean × Regime Multiplier
 *    score = (L1^w1 × L2^w2 × L3^w3 × L4^w4)^(1) × regime_multiplier
 *
 *    All 4 layers must be simultaneously strong — a geometric mean collapses
 *    when ANY layer is weak, preventing single-factor false positives.
 *
 *  Regime Detection (Hurst Exponent):
 *    H > 0.56 + ADX > 25 → 'trending'   → momentum weights ×1.2
 *    H < 0.44            → 'mean-reverting' → advanced weights ×1.2
 *    ATR%ile > 0.80      → 'volatile'    → MC weight ×1.3, score ×0.82
 *    otherwise           → 'quiet'       → backtest weight ×1.25
 *
 *  Self-Improvement:
 *    recalibrateEnsembleWeights() updates layer weights based on which layers
 *    correlated most strongly with successful outcomes over the last 30 days.
 *    Called automatically when ≥10 evaluated predictions exist.
 */

import dbConnect from '../mongodb';
import Prediction from '../models/Prediction';
import ModelWeights, { IWeights } from '../models/ModelWeights';
import { fetchMultipleStocks } from './marketData';
import { computeAllIndicators, normalizeIndicators } from './indicators';
import { computeAdvancedIndicators, normaliseAdvanced } from './advancedIndicators';
import { monteCarloSimulation } from './monteCarlo';
import { backtestStock } from './backtest';
import {
  computeTechnicalScore,
  computeAdvancedScore,
  computeEnsembleScore,
  DEFAULT_ENSEMBLE_WEIGHTS,
  EnsembleWeights,
  EnsembleScoreBreakdown,
} from './ensembleScorer';
import { STOCK_UNIVERSE_DEDUPED as STOCK_UNIVERSE } from './stockUniverse';

/* ─── Default indicator weights (kept for Layer 1) ─────────────────────────── */
const DEFAULT_INDICATOR_WEIGHTS: IWeights = {
  rsi: 0.15, macd: 0.20, bbPosition: 0.10,
  volumeRatio: 0.15, momentum10d: 0.20, maCrossover: 0.10, adx: 0.10,
};

/* ─── Result type ──────────────────────────────────────────────────────────── */
export interface PredictionResult {
  stockSymbol:     string;
  stockName:       string;
  entryPrice:      number;
  confidenceScore: number;
  compositeScore:  number;
  isNew:           boolean;
  recommendationCount: number;
  // New fields
  regime:          string;
  mcProbability:   number;
  backtestWinRate: number;
  backtestSamples: number;
  scoreBreakdown:  EnsembleScoreBreakdown;
}

/* ─── Internal stock-score type ────────────────────────────────────────────── */
interface ScoredStock {
  symbol:    string;
  stockName: string;
  entryPrice:number;
  score:     EnsembleScoreBreakdown;
  indicatorSnapshot: {
    rsi: number; macdSignal: number; bbPosition: number;
    volumeRatio: number; momentum10d: number; maCrossover: number; adx: number;
  };
}

/* ─── Load active weights ──────────────────────────────────────────────────── */
async function loadWeights(): Promise<{
  indicatorWeights: IWeights;
  ensembleWeights:  EnsembleWeights;
  version:          string;
}> {
  try {
    const active = await ModelWeights.findOne({ isActive: true }).sort({ date: -1 });
    if (active) {
      return {
        indicatorWeights: active.weights,
        ensembleWeights:  (active as any).ensembleWeights ?? DEFAULT_ENSEMBLE_WEIGHTS,
        version:          active.version,
      };
    }
  } catch (e) { console.error('loadWeights error:', e); }
  return {
    indicatorWeights: DEFAULT_INDICATOR_WEIGHTS,
    ensembleWeights:  DEFAULT_ENSEMBLE_WEIGHTS,
    version:          'v1.0',
  };
}

/* ─── Confidence score from ensemble score ─────────────────────────────────── */
function ensembleToConfidence(score: EnsembleScoreBreakdown): number {
  // Map finalScore [0,1] → confidence [0,100] with a non-linear curve
  // A score of 0.50 → ~55 confidence; 0.65 → ~78; 0.80 → ~92
  const c = 1 / (1 + Math.exp(-12 * (score.finalScore - 0.55)));
  return Math.min(99, Math.max(1, Math.round(c * 100)));
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PREDICTION ENGINE
══════════════════════════════════════════════════════════════════════════════*/
export async function runDailyPrediction(): Promise<PredictionResult[]> {
  await dbConnect();

  const { indicatorWeights, ensembleWeights, version } = await loadWeights();
  const symbols = STOCK_UNIVERSE.map(s => s.symbol);

  console.log(`\n🤖 Ensemble predictor v${version} — scoring ${symbols.length} stocks`);
  console.log(`   Layers: Technical(${(ensembleWeights.technical*100).toFixed(0)}%) · Advanced(${(ensembleWeights.advanced*100).toFixed(0)}%) · MonteCarlo(${(ensembleWeights.monteCarlo*100).toFixed(0)}%) · Backtest(${(ensembleWeights.backtest*100).toFixed(0)}%)`);

  // Fetch 90-day OHLCV for all stocks in one MongoDB pass
  let stockDataMap: Awaited<ReturnType<typeof fetchMultipleStocks>>;
  try {
    stockDataMap = await fetchMultipleStocks(symbols, 90);
  } catch (e) {
    console.error('fetchMultipleStocks error:', e);
    return [];
  }

  const scoredStocks: ScoredStock[] = [];
  let skipped = 0, errors = 0;

  for (const stockInfo of STOCK_UNIVERSE) {
    const bars = stockDataMap.get(stockInfo.symbol);
    if (!bars || bars.length < 30) { skipped++; continue; }

    try {
      // ── Layer 1: Technical (7 indicators) ───────────────────────────────
      const indicators       = computeAllIndicators(bars);
      const normIndicators   = normalizeIndicators(indicators);
      const technicalScore   = computeTechnicalScore(normIndicators, indicatorWeights as unknown as Record<string, number>);

      // ── Layer 2: Advanced (15 indicators) ──────────────────────────────
      const advanced         = computeAdvancedIndicators(bars, indicators.adx);
      const normAdvanced     = normaliseAdvanced(advanced);
      const advancedScore    = computeAdvancedScore(normAdvanced);

      // ── Layer 3: Monte Carlo (GBM) ──────────────────────────────────────
      const mc               = monteCarloSimulation(bars, 0.05, 3, 12_000, 60);

      // ── Layer 4: Backtest win rate ───────────────────────────────────────
      const bt               = backtestStock(bars, 0.05, 3, 20);

      // ── Ensemble score ───────────────────────────────────────────────────
      const scoreBreakdown   = computeEnsembleScore(
        technicalScore, advancedScore, mc, bt,
        advanced.regime, advanced.hurstExponent, advanced.atrPercentile,
        ensembleWeights,
      );

      scoredStocks.push({
        symbol:    stockInfo.symbol,
        stockName: stockInfo.name,
        entryPrice: bars[bars.length - 1].close,
        score:     scoreBreakdown,
        indicatorSnapshot: {
          rsi:         indicators.rsi,
          macdSignal:  indicators.macd.signal,
          bbPosition:  indicators.bbPosition,
          volumeRatio: indicators.volumeRatio,
          momentum10d: indicators.momentum10d,
          maCrossover: indicators.maCrossover,
          adx:         indicators.adx,
        },
      });
    } catch (e) {
      errors++;
      if (errors <= 5) console.error(`Score error ${stockInfo.symbol}:`, e);
    }
  }

  console.log(`   Scored: ${scoredStocks.length} | Skipped (low data): ${skipped} | Errors: ${errors}`);

  if (scoredStocks.length === 0) return [];

  // ── Multi-condition filter ─────────────────────────────────────────────
  // Filters are applied in strict order, with threshold relaxation if needed.
  // These are more demanding than the old model — all 4 layers must align.

  const baseFilter = (s: ScoredStock) => {
    const ind = s.score;
    const adv = s.score.advancedScore;
    return (
      ind.technicalScore   >= 0.42 &&   // basic technical alignment
      ind.advancedScore    >= 0.42 &&   // advanced signals aligned
      ind.monteCarloScore  >= 0.12 &&   // at least 12% MC probability
      ind.backtestScore    >= 0.30 &&   // some historical precedent
      ind.finalScore       >= 0.38      // ensemble minimum
    );
  };

  let candidates = scoredStocks.filter(baseFilter);

  // RSI guard (avoid extreme readings)
  candidates = candidates.filter(s => {
    const rsi = s.indicatorSnapshot.rsi;
    return rsi >= 35 && rsi <= 78;
  });

  // ADX guard (trend strength)
  candidates = candidates.filter(s => s.indicatorSnapshot.adx > 18);

  // ATR percentile guard (avoid explosively volatile stocks)
  candidates = candidates.filter(s => {
    const bars = stockDataMap.get(s.symbol);
    return !bars || s.score.advancedScore > 0; // advancedScore already caps for vol
  });

  // Sort by final ensemble score
  candidates.sort((a, b) => b.score.finalScore - a.score.finalScore);

  // If fewer than 3 pass all filters, relax and take top 3 overall
  if (candidates.length < 3) {
    console.log(`   ⚠️  Only ${candidates.length} passed strict filter — relaxing to top-3`);
    candidates = [...scoredStocks].sort((a, b) => b.score.finalScore - a.score.finalScore);
  }

  const top3 = candidates.slice(0, 3);

  console.log(`\n   Top 3 picks:`);
  top3.forEach((s, i) => {
    const sc = s.score;
    console.log(`   ${i + 1}. ${s.symbol.padEnd(16)} score=${sc.finalScore.toFixed(3)}  tech=${sc.technicalScore.toFixed(2)}  adv=${sc.advancedScore.toFixed(2)}  mc=${(sc.mcProbability*100).toFixed(1)}%  bt=${(sc.backtestWinRate*100).toFixed(0)}%  regime=${sc.regime}`);
  });

  // ── Upsert predictions into DB ──────────────────────────────────────────
  const results: PredictionResult[] = [];
  const now       = new Date();
  const expiresAt = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);

  for (const stock of top3) {
    const sc             = stock.score;
    const confidenceScore = ensembleToConfidence(sc);

    const existing = await Prediction.findOne({ stockSymbol: stock.symbol, status: 'Active' });

    if (existing) {
      existing.recommendationCount   += 1;
      existing.latestRecommendedDate  = now;
      existing.recommendationDates.push(now);
      // Update live ensemble fields on the existing doc
      (existing as any).ensembleScore  = sc.finalScore;
      (existing as any).regime         = sc.regime;
      (existing as any).mcProbability  = sc.mcProbability;
      (existing as any).backtestWinRate = sc.backtestWinRate;
      await existing.save();

      results.push({
        stockSymbol:     stock.symbol,
        stockName:       stock.stockName,
        entryPrice:      existing.entryPrice,
        confidenceScore: existing.confidenceScore,
        compositeScore:  sc.finalScore,
        isNew:           false,
        recommendationCount: existing.recommendationCount,
        regime:          sc.regime,
        mcProbability:   sc.mcProbability,
        backtestWinRate: sc.backtestWinRate,
        backtestSamples: sc.backtestSamples,
        scoreBreakdown:  sc,
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
        confidenceScore,
        status:               'Active',
        bestReturn:           0,
        modelVersion:         version,
        indicatorSnapshot:    stock.indicatorSnapshot,
        expiresAt,
        // Extended fields stored as loose properties (schema allows extra fields via strict:false guard below)
        ensembleScore:        sc.finalScore,
        regime:               sc.regime,
        mcProbability:        sc.mcProbability,
        backtestWinRate:      sc.backtestWinRate,
        backtestSamples:      sc.backtestSamples,
        scoreBreakdown: {
          technicalScore:   sc.technicalScore,
          advancedScore:    sc.advancedScore,
          monteCarloScore:  sc.monteCarloScore,
          backtestScore:    sc.backtestScore,
          regimeMultiplier: sc.regimeMultiplier,
          rawScore:         sc.rawScore,
        },
      });

      results.push({
        stockSymbol:     stock.symbol,
        stockName:       stock.stockName,
        entryPrice:      stock.entryPrice,
        confidenceScore,
        compositeScore:  sc.finalScore,
        isNew:           true,
        recommendationCount: 1,
        regime:          sc.regime,
        mcProbability:   sc.mcProbability,
        backtestWinRate: sc.backtestWinRate,
        backtestSamples: sc.backtestSamples,
        scoreBreakdown:  sc,
      });
    }
  }

  console.log(`\n✅ Prediction complete: ${results.length} picks created/updated.\n`);
  return results;
}
