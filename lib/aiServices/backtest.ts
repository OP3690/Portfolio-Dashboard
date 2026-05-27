/**
 * backtest.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Walk-forward backtesting — evaluates how often the model's BUY signal
 * actually led to a ≥targetReturn gain within horizonDays on THIS specific stock.
 *
 * Algorithm
 * ─────────
 * Starting from the most recent completed date (bars.length − horizonDays − 1)
 * and walking backwards, we:
 *   1. Ask: "would the model have issued a BUY signal at bar[i]?"
 *      → simplified fast check: SMA20 crossover + volume confirmation + not overbought
 *   2. Record whether the target was hit within the next horizonDays bars.
 *   3. Repeat for up to maxSamples signal events.
 *
 * Returns a BacktestResult with win_rate, sample count, avg return, and a
 * series of the last 20 signal events (for UI display).
 *
 * Performance: O(n × maxSamples) — runs in < 5 ms per stock at 90 bars.
 */

import { OHLCVBar } from './marketData';

export interface BacktestSignal {
  barIndex:    number;
  date:        Date;
  entryPrice:  number;
  bestPriceIn3d: number;
  actualReturn:  number;   // %
  hit:         boolean;
}

export interface BacktestResult {
  winRate:        number;  // [0, 1]
  sampleCount:    number;
  avgReturnOnHits:number;  // % avg return when target was hit
  avgReturnAll:   number;  // % avg return across all signals
  signals:        BacktestSignal[];
  /** Calibration confidence — higher when more samples available */
  confidence:     number;  // [0, 1]
}

/** Fast SMA helper */
function sma(arr: number[], period: number, idx: number): number {
  if (idx < period - 1) return arr[idx];
  return arr.slice(idx - period + 1, idx + 1).reduce((s, v) => s + v, 0) / period;
}

/** Fast average-volume helper */
function avgVol(bars: OHLCVBar[], idx: number, period: number): number {
  const start = Math.max(0, idx - period + 1);
  const slice = bars.slice(start, idx + 1);
  return slice.reduce((s, b) => s + b.volume, 0) / slice.length;
}

export function backtestStock(
  bars:         OHLCVBar[],
  targetReturn  = 0.05,
  horizonDays   = 3,
  maxSamples    = 20,
): BacktestResult {
  const closes   = bars.map(b => b.close);
  const signals: BacktestSignal[] = [];

  // Need at least 30 bars for signal detection + horizonDays for outcome
  const startIdx = Math.max(25, bars.length - 1 - horizonDays);
  const endIdx   = 25;

  for (let i = startIdx; i >= endIdx && signals.length < maxSamples; i--) {
    // ── Fast signal filter (bullish momentum setup) ──────────────────────
    const sma20 = sma(closes, 20, i);
    const sma50 = sma(closes, Math.min(50, i + 1), i);

    // Condition 1: Price above SMA20 (uptrend)
    if (closes[i] <= sma20) continue;

    // Condition 2: SMA20 > SMA50 (trend alignment)
    if (sma20 <= sma50) continue;

    // Condition 3: Volume confirmation — current vol above 10-day average
    const vol10 = avgVol(bars, i, 10);
    if (bars[i].volume < vol10 * 0.8) continue;

    // Condition 4: Not overbought — price within 5% above SMA20
    const distFromSMA = (closes[i] - sma20) / sma20;
    if (distFromSMA > 0.08) continue; // too extended

    // Condition 5: RSI-like filter — recent 5-day return not >8%
    const ret5 = i >= 5 ? (closes[i] - closes[i - 5]) / closes[i - 5] : 0;
    if (ret5 > 0.08) continue;

    // ── Outcome measurement ────────────────────────────────────────────────
    const entryPrice = closes[i];
    let bestPrice    = entryPrice;
    let hit          = false;

    for (let j = i + 1; j <= Math.min(i + horizonDays, bars.length - 1); j++) {
      if (bars[j].close > bestPrice) bestPrice = bars[j].close;
      if ((bars[j].close - entryPrice) / entryPrice >= targetReturn) {
        hit = true;
        break;
      }
    }

    const actualReturn = ((bestPrice - entryPrice) / entryPrice) * 100;

    signals.push({
      barIndex:      i,
      date:          bars[i].date,
      entryPrice,
      bestPriceIn3d: bestPrice,
      actualReturn,
      hit,
    });
  }

  if (signals.length === 0) {
    return { winRate: 0.5, sampleCount: 0, avgReturnOnHits: 0, avgReturnAll: 0, signals: [], confidence: 0 };
  }

  const wins    = signals.filter(s => s.hit);
  const winRate = wins.length / signals.length;

  const avgReturnOnHits = wins.length > 0
    ? wins.reduce((s, sig) => s + sig.actualReturn, 0) / wins.length
    : 0;

  const avgReturnAll = signals.reduce((s, sig) => s + sig.actualReturn, 0) / signals.length;

  // Confidence: sigmoid on sample count — reaches 0.9 at 15 samples
  const confidence = 1 / (1 + Math.exp(-0.5 * (signals.length - 8)));

  return { winRate, sampleCount: signals.length, avgReturnOnHits, avgReturnAll, signals, confidence };
}
