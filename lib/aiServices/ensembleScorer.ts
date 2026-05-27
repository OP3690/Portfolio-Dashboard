/**
 * ensembleScorer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-layer ensemble that combines four independent signal sources:
 *
 *   Layer 1 — Technical Score     (existing 7 indicators, normalised)
 *   Layer 2 — Advanced Score      (Hurst, z-score, OBV, CMF, stochastic, CCI…)
 *   Layer 3 — Monte Carlo Prob    (GBM simulation — probability of +5% in 3d)
 *   Layer 4 — Backtest Win Rate   (historical signal accuracy for THIS stock)
 *
 * Combination: Weighted Geometric Mean
 * ──────────────────────────────────────
 *   raw = (tech^w1 × adv^w2 × mc^w3 × bt^w4) ^ (1/(w1+w2+w3+w4))
 *
 * A geometric mean requires ALL layers to be strong — a single weak signal
 * drags the score down, preventing false positives from one dominant factor.
 *
 * Regime Adjustment
 * ─────────────────
 *   trending:      momentum layers (tech, adv) are upweighted
 *   mean-reverting: z-score & Williams %R layers upweighted
 *   volatile:      MC probability upweighted, overall score discounted
 *   quiet:         backtest win-rate gets more weight (signals are noisier)
 *
 * Bayesian Weight Update (called from recalibrator)
 * ──────────────────────────────────────────────────
 * After N evaluated predictions, the ensemble weights are updated:
 *   w_new = w_old × (1 + η × (layer_correlation − 0.5) × 2)
 * where layer_correlation = avg outcome score for predictions where this layer
 * scored high (> 0.65).
 * Normalised to sum to 1.0 after each update.
 */

import { IndicatorResult } from './indicators';
import { AdvancedIndicatorResult, MarketRegime } from './advancedIndicators';
import { MonteCarloResult } from './monteCarlo';
import { BacktestResult } from './backtest';

/* ─── Ensemble weights ─────────────────────────────────────────────────────── */
export interface EnsembleWeights {
  technical:   number;   // Layer 1
  advanced:    number;   // Layer 2
  monteCarlo:  number;   // Layer 3
  backtest:    number;   // Layer 4
}

export const DEFAULT_ENSEMBLE_WEIGHTS: EnsembleWeights = {
  technical:   0.30,
  advanced:    0.30,
  monteCarlo:  0.20,
  backtest:    0.20,
};

/* ─── Score breakdown ──────────────────────────────────────────────────────── */
export interface EnsembleScoreBreakdown {
  technicalScore:  number;   // [0,1]
  advancedScore:   number;   // [0,1]
  monteCarloScore: number;   // [0,1] — raw MC probability
  backtestScore:   number;   // [0,1] — historical win rate
  regimeMultiplier:number;   // applied after geometric mean
  rawScore:        number;   // geometric mean before regime
  finalScore:      number;   // final ensemble score [0,1]
  regime:          MarketRegime;
  mcProbability:   number;   // raw MC probability (for display)
  backtestWinRate: number;   // raw backtest win rate (for display)
  backtestSamples: number;
}

/* ─── Technical score (weighted sum of 7 basic indicators) ─────────────────── */
export function computeTechnicalScore(
  normalised: Record<string, number>,
  weights:    Record<string, number>,
): number {
  const keys: Array<keyof typeof weights> = ['rsi', 'macd', 'bbPosition', 'volumeRatio', 'momentum10d', 'maCrossover', 'adx'];
  let score = 0, totalW = 0;
  for (const k of keys) {
    const w = weights[k] ?? 1 / keys.length;
    score  += w * (normalised[k] ?? 0.5);
    totalW += w;
  }
  return totalW > 0 ? score / totalW : 0.5;
}

/* ─── Advanced score (average of normalised advanced indicators) ──────────── */
export function computeAdvancedScore(normalised: Record<string, number>): number {
  const values = Object.values(normalised);
  if (values.length === 0) return 0.5;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/* ─── Regime-based weight adjustment ──────────────────────────────────────── */
function regimeWeights(regime: MarketRegime, base: EnsembleWeights): EnsembleWeights {
  const w = { ...base };
  switch (regime) {
    case 'trending':
      w.technical  *= 1.20;
      w.advanced   *= 1.15;
      w.monteCarlo *= 0.85;
      break;
    case 'mean-reverting':
      w.technical  *= 0.90;
      w.advanced   *= 1.20;  // z-score / OBV signals are in advanced
      w.monteCarlo *= 0.90;
      w.backtest   *= 1.10;
      break;
    case 'volatile':
      w.technical  *= 0.80;
      w.advanced   *= 0.80;
      w.monteCarlo *= 1.30;  // let the simulation tell us if upside beats noise
      w.backtest   *= 1.20;
      break;
    case 'quiet':
      w.technical  *= 1.05;
      w.backtest   *= 1.25;  // rely more on historical accuracy
      break;
  }
  // Re-normalise
  const total = w.technical + w.advanced + w.monteCarlo + w.backtest;
  return {
    technical:   w.technical  / total,
    advanced:    w.advanced   / total,
    monteCarlo:  w.monteCarlo / total,
    backtest:    w.backtest   / total,
  };
}

/* ─── Regime multiplier ────────────────────────────────────────────────────── */
function regimeMultiplier(regime: MarketRegime, hurstExponent: number, atrPctile: number): number {
  switch (regime) {
    case 'trending':
      // Extra bonus for strong trend persistence
      return hurstExponent > 0.62 ? 1.12 : 1.05;
    case 'mean-reverting':
      return 0.92;  // slight discount — reversions are less reliable on 3d horizon
    case 'volatile':
      // Penalise extreme volatility
      return atrPctile > 0.90 ? 0.70 : 0.82;
    case 'quiet':
      return 0.98;
    default:
      return 1.0;
  }
}

/* ─── Main ensemble scorer ─────────────────────────────────────────────────── */
export function computeEnsembleScore(
  technicalScore:  number,
  advancedScore:   number,
  mc:              MonteCarloResult,
  bt:              BacktestResult,
  regime:          MarketRegime,
  hurstExponent:   number,
  atrPercentile:   number,
  baseWeights:     EnsembleWeights = DEFAULT_ENSEMBLE_WEIGHTS,
): EnsembleScoreBreakdown {

  const w = regimeWeights(regime, baseWeights);

  // Clamp all inputs to (0.01, 0.99) so geometric mean never collapses to 0
  const clamp = (v: number) => Math.max(0.01, Math.min(0.99, v));

  const ts = clamp(technicalScore);
  const as_ = clamp(advancedScore);
  const ms = clamp(mc.probability);

  // When backtest has few samples, blend with 0.5 (no-information prior)
  const btRaw     = bt.winRate;
  const btBlended = bt.confidence * btRaw + (1 - bt.confidence) * 0.50;
  const bs        = clamp(btBlended);

  // Weighted geometric mean
  // score = (ts^w1 × as^w2 × ms^w3 × bs^w4) ^ (1 / totalWeight)
  const logScore =
    w.technical  * Math.log(ts) +
    w.advanced   * Math.log(as_) +
    w.monteCarlo * Math.log(ms) +
    w.backtest   * Math.log(bs);

  const rawScore     = Math.exp(logScore);
  const rMult        = regimeMultiplier(regime, hurstExponent, atrPercentile);
  const finalScore   = Math.min(0.99, rawScore * rMult);

  return {
    technicalScore:   ts,
    advancedScore:    as_,
    monteCarloScore:  ms,
    backtestScore:    bs,
    regimeMultiplier: rMult,
    rawScore,
    finalScore,
    regime,
    mcProbability:    mc.probability,
    backtestWinRate:  bt.winRate,
    backtestSamples:  bt.sampleCount,
  };
}

/* ─── Ensemble weight recalibration (Bayesian update) ─────────────────────── */
export interface EnsembleOutcome {
  technicalScore:  number;
  advancedScore:   number;
  monteCarloScore: number;
  backtestScore:   number;
  outcomeScore:    number;  // 1.0=OverAchieved, 0.8=Achieved, 0.3=MissedSlightly, 0=Missed/Expired
}

const LEARNING_RATE = 0.08;
const WEIGHT_MIN    = 0.08;
const WEIGHT_MAX    = 0.50;

export function recalibrateEnsembleWeights(
  outcomes:     EnsembleOutcome[],
  currentWeights: EnsembleWeights,
): EnsembleWeights {
  if (outcomes.length < 5) return currentWeights;

  const layers: Array<{ key: keyof EnsembleWeights; scoreKey: keyof EnsembleOutcome }> = [
    { key: 'technical',  scoreKey: 'technicalScore'  },
    { key: 'advanced',   scoreKey: 'advancedScore'   },
    { key: 'monteCarlo', scoreKey: 'monteCarloScore' },
    { key: 'backtest',   scoreKey: 'backtestScore'   },
  ];

  const newWeights = { ...currentWeights };

  for (const { key, scoreKey } of layers) {
    // Predictions where this layer scored high (> 0.65)
    const highScored = outcomes.filter(o => (o[scoreKey] as number) > 0.65);
    if (highScored.length === 0) continue;

    const avgOutcome = highScored.reduce((s, o) => s + o.outcomeScore, 0) / highScored.length;
    // Update: w += lr × (avg_outcome − 0.5) × 2
    const delta = LEARNING_RATE * (avgOutcome - 0.5) * 2;
    newWeights[key] = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, newWeights[key] + delta));
  }

  // Normalise
  const total = newWeights.technical + newWeights.advanced + newWeights.monteCarlo + newWeights.backtest;
  return {
    technical:   newWeights.technical  / total,
    advanced:    newWeights.advanced   / total,
    monteCarlo:  newWeights.monteCarlo / total,
    backtest:    newWeights.backtest   / total,
  };
}
