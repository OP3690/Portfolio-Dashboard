/**
 * advancedIndicators.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Extended technical indicator library beyond the basic 7.
 *
 * Additions:
 *   • Hurst Exponent          — market memory (trending vs mean-reverting)
 *   • Z-Score (20 / 60 day)   — statistical mean-reversion signal
 *   • On-Balance Volume slope — smart-money accumulation trend
 *   • Chaikin Money Flow      — buying/selling pressure confirmation
 *   • ATR Percentile          — volatility rank (avoid high-vol breakouts)
 *   • Historical Vol %ile     — realised-vol rank
 *   • Williams %R             — overbought/oversold oscillator
 *   • Stochastic %K/%D        — momentum oscillator
 *   • CCI                     — commodity channel index (trend deviation)
 *   • ROC (5d / 20d / 60d)    — rate of change / multi-horizon momentum
 *   • Price Percentile        — position within 52-week range
 *   • Regime                  — market regime derived from the above
 */

import { OHLCVBar } from './marketData';

/* ─── Result types ─────────────────────────────────────────────────────────── */
export type MarketRegime = 'trending' | 'mean-reverting' | 'volatile' | 'quiet';

export interface AdvancedIndicatorResult {
  // ── Trend / Momentum ──
  roc5d:  number;        // % rate of change over 5 trading days
  roc20d: number;        // % rate of change over 20 trading days
  roc60d: number;        // % rate of change over 60 days (skip-month momentum)
  williamsR: number;     // Williams %R (14) – range [-100, 0]
  stochK: number;        // Stochastic %K (14) – [0, 100]
  stochD: number;        // Stochastic %D (3-period smoothing of K)
  cci20: number;         // Commodity Channel Index (20) – un-bounded

  // ── Mean Reversion ──
  zScore20: number;      // z-score of close vs 20-day distribution
  zScore60: number;      // z-score of close vs 60-day distribution
  pricePercentile: number; // position in [0,1] within 52-week high-low range

  // ── Volume / Smart Money ──
  obvSlope: number;      // normalised slope of OBV over 10 days (−1 → +1)
  cmf21: number;         // Chaikin Money Flow (21-day) – [−1, +1]

  // ── Volatility ──
  atrPercentile: number;   // current ATR vs 252-day ATR distribution [0,1]
  hvPercentile: number;    // 21-day HV vs 252-day HV distribution [0,1]

  // ── Market Memory ──
  hurstExponent: number;   // R/S Hurst exponent [0,1] — 0.5 = random walk

  // ── Regime ──
  regime: MarketRegime;
}

/* ─── Internal helpers ─────────────────────────────────────────────────────── */
function linRegSlope(y: number[]): number {
  const n = y.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const sumX  = x.reduce((s, v) => s + v, 0);
  const sumY  = y.reduce((s, v) => s + v, 0);
  const sumXY = x.reduce((s, v, i) => s + v * y[i], 0);
  const sumX2 = x.reduce((s, v) => s + v * v, 0);
  const denom = n * sumX2 - sumX * sumX;
  return denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
}

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[], mu?: number): number {
  const m = mu ?? mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

/* ─── Indicator implementations ────────────────────────────────────────────── */

/** Rate of Change: (close_now / close_{-period} - 1) × 100 */
function roc(closes: number[], period: number): number {
  if (closes.length <= period) return 0;
  const cur  = closes[closes.length - 1];
  const past = closes[closes.length - 1 - period];
  return past !== 0 ? ((cur - past) / past) * 100 : 0;
}

/** Williams %R (14): ranges [−100, 0]. −80 to −100 = oversold; 0 to −20 = overbought */
function williamsR(bars: OHLCVBar[], period = 14): number {
  const slice   = bars.slice(-period);
  const highest = Math.max(...slice.map(b => b.high));
  const lowest  = Math.min(...slice.map(b => b.low));
  const close   = bars[bars.length - 1].close;
  if (highest === lowest) return -50;
  return ((highest - close) / (highest - lowest)) * -100;
}

/** Stochastic %K and %D */
function stochastic(bars: OHLCVBar[], kPeriod = 14, dPeriod = 3): { k: number; d: number } {
  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < bars.length; i++) {
    const slice   = bars.slice(i - kPeriod + 1, i + 1);
    const lowest  = Math.min(...slice.map(b => b.low));
    const highest = Math.max(...slice.map(b => b.high));
    kValues.push(highest === lowest ? 50 : ((bars[i].close - lowest) / (highest - lowest)) * 100);
  }
  const k = kValues[kValues.length - 1] ?? 50;
  const dSlice = kValues.slice(-dPeriod);
  const d = dSlice.length > 0 ? mean(dSlice) : k;
  return { k, d };
}

/** CCI (20): measures deviation of typical price from its SMA */
function cci(bars: OHLCVBar[], period = 20): number {
  const slice = bars.slice(-period);
  const tp    = slice.map(b => (b.high + b.low + b.close) / 3);
  const m     = mean(tp);
  const mad   = tp.reduce((s, v) => s + Math.abs(v - m), 0) / period;
  const curTP = tp[tp.length - 1];
  return mad > 0 ? (curTP - m) / (0.015 * mad) : 0;
}

/** Z-score of current close vs rolling distribution */
function zScore(closes: number[], period: number): number {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  const m     = mean(slice);
  const s     = stdDev(slice, m);
  return s > 0 ? (closes[closes.length - 1] - m) / s : 0;
}

/** Position of current close within the [period]-day high-low range */
function pricePercentile(closes: number[], highs: number[], lows: number[], period = 252): number {
  const n       = Math.min(period, closes.length);
  const cSlice  = closes.slice(-n);
  const hSlice  = highs.slice(-n);
  const lSlice  = lows.slice(-n);
  const highest = Math.max(...hSlice);
  const lowest  = Math.min(...lSlice);
  const cur     = closes[closes.length - 1];
  return highest === lowest ? 0.5 : (cur - lowest) / (highest - lowest);
}

/** Normalised OBV slope (positive = accumulation, negative = distribution) */
function obvSlope(bars: OHLCVBar[], slopePeriod = 10): number {
  // Build OBV
  const obvArr: number[] = [0];
  for (let i = 1; i < bars.length; i++) {
    if      (bars[i].close > bars[i - 1].close) obvArr.push(obvArr[i - 1] + bars[i].volume);
    else if (bars[i].close < bars[i - 1].close) obvArr.push(obvArr[i - 1] - bars[i].volume);
    else                                          obvArr.push(obvArr[i - 1]);
  }
  const recent = obvArr.slice(-slopePeriod);
  const slope  = linRegSlope(recent);
  // Normalise by average daily volume to make it scale-free
  const avgVol = bars.slice(-slopePeriod).reduce((s, b) => s + b.volume, 0) / slopePeriod;
  return avgVol > 0 ? Math.max(-1, Math.min(1, slope / avgVol)) : 0;
}

/** Chaikin Money Flow (21-day): >0.25 = strong buying, <−0.25 = strong selling */
function cmf(bars: OHLCVBar[], period = 21): number {
  const slice = bars.slice(-period);
  let mfv = 0, vol = 0;
  for (const b of slice) {
    const hl = b.high - b.low;
    if (hl > 0) {
      mfv += ((b.close - b.low) - (b.high - b.close)) / hl * b.volume;
    }
    vol += b.volume;
  }
  return vol > 0 ? mfv / vol : 0;
}

/** ATR percentile: where is current ATR relative to the last 252 bars? */
function atrPercentile(bars: OHLCVBar[], period = 14, lookback = 252): number {
  if (bars.length < 2) return 0.5;
  // Compute true range
  const tr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    tr.push(Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low  - bars[i - 1].close),
    ));
  }
  // Smooth with Wilder (RMA) to get ATR
  const k = 1 / period;
  const atrArr: number[] = [tr[0]];
  for (let i = 1; i < tr.length; i++) {
    atrArr.push(tr[i] * k + atrArr[i - 1] * (1 - k));
  }
  const window  = atrArr.slice(-Math.min(lookback, atrArr.length));
  const current = atrArr[atrArr.length - 1];
  return window.filter(v => v <= current).length / window.length;
}

/** Historical volatility percentile (21-day HV vs rolling 252-day window) */
function hvPercentile(closes: number[], calcPeriod = 21, lookback = 252): number {
  if (closes.length < calcPeriod + 2) return 0.5;
  const logR = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  const hvArr: number[] = [];
  for (let i = calcPeriod; i <= logR.length; i++) {
    const w  = logR.slice(i - calcPeriod, i);
    const m  = mean(w);
    const s  = Math.sqrt(w.reduce((a, v) => a + (v - m) ** 2, 0) / (calcPeriod - 1));
    hvArr.push(s * Math.sqrt(252)); // annualise
  }
  if (hvArr.length === 0) return 0.5;
  const window  = hvArr.slice(-Math.min(lookback, hvArr.length));
  const current = hvArr[hvArr.length - 1];
  return window.filter(v => v <= current).length / window.length;
}

/**
 * Hurst Exponent via R/S analysis across multiple lag scales.
 * H > 0.55 → persistent trend  (momentum strategies favoured)
 * H ≈ 0.50 → random walk       (no edge)
 * H < 0.45 → anti-persistent   (mean reversion favoured)
 */
function hurstExponent(closes: number[]): number {
  const minPeriod = 8;
  const maxPeriod = Math.min(40, Math.floor(closes.length / 2));
  if (maxPeriod < minPeriod) return 0.5;

  const logLags: number[] = [];
  const logRS:   number[] = [];

  for (let lag = minPeriod; lag <= maxPeriod; lag += 4) {
    // Use the last `lag` log-returns
    const n = Math.min(lag * 2, closes.length - 1);
    const logRet = closes.slice(-n - 1).slice(1).map((c, i, arr) =>
      Math.log(c / (i === 0 ? closes[closes.length - n - 1] : arr[i - 1]))
    );
    if (logRet.length < lag) continue;
    const window = logRet.slice(-lag);
    const m      = mean(window);
    // Cumulative deviation from mean
    let cum = 0, maxCum = -Infinity, minCum = Infinity;
    for (const r of window) { cum += r - m; maxCum = Math.max(maxCum, cum); minCum = Math.min(minCum, cum); }
    const R = maxCum - minCum;
    const S = stdDev(window, m);
    if (S > 0 && R > 0) { logLags.push(Math.log(lag)); logRS.push(Math.log(R / S)); }
  }

  if (logLags.length < 2) return 0.5;
  // OLS slope = Hurst exponent estimate
  const H = linRegSlope(logRS.map((y, i) => y)); // simplified: use the series as-is
  // Proper calculation: regress logRS on logLags
  const n    = logLags.length;
  const sx   = mean(logLags);
  const sy   = mean(logRS);
  const cov  = logLags.reduce((s, x, i) => s + (x - sx) * (logRS[i] - sy), 0) / n;
  const varX = logLags.reduce((s, x) => s + (x - sx) ** 2, 0) / n;
  const slope = varX > 0 ? cov / varX : 0.5;
  return Math.max(0.2, Math.min(0.8, slope));
}

/** Classify market regime from Hurst + ATR + ADX inputs */
function detectRegime(hurst: number, atrPctile: number, adx: number): MarketRegime {
  if (hurst > 0.56 && adx > 25)      return 'trending';
  if (hurst < 0.44)                   return 'mean-reverting';
  if (atrPctile > 0.80)               return 'volatile';
  return 'quiet';
}

/* ─── Main export ──────────────────────────────────────────────────────────── */
export function computeAdvancedIndicators(bars: OHLCVBar[], adx: number): AdvancedIndicatorResult {
  const closes = bars.map(b => b.close);
  const highs  = bars.map(b => b.high);
  const lows   = bars.map(b => b.low);

  const hurst     = hurstExponent(closes);
  const atrPctile = atrPercentile(bars);
  const stoch     = stochastic(bars);

  return {
    roc5d:           roc(closes, 5),
    roc20d:          roc(closes, 20),
    roc60d:          closes.length > 65 ? roc(closes.slice(0, -5), 55) : 0, // skip last 5d
    williamsR:       williamsR(bars),
    stochK:          stoch.k,
    stochD:          stoch.d,
    cci20:           cci(bars),
    zScore20:        zScore(closes, 20),
    zScore60:        zScore(closes, Math.min(60, closes.length)),
    pricePercentile: pricePercentile(closes, highs, lows),
    obvSlope:        obvSlope(bars),
    cmf21:           cmf(bars),
    atrPercentile:   atrPctile,
    hvPercentile:    hvPercentile(closes),
    hurstExponent:   hurst,
    regime:          detectRegime(hurst, atrPctile, adx),
  };
}

/**
 * Normalise all advanced indicators to a [0, 1] bullish score.
 * 1.0 = maximally bullish signal for this indicator.
 */
export function normaliseAdvanced(ind: AdvancedIndicatorResult): Record<string, number> {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  return {
    // ROC: moderate positive momentum (2–10%) is best
    roc5d:    clamp(ind.roc5d  >  0 && ind.roc5d  < 6  ? 0.8 : ind.roc5d  > 6  ? 0.5 : 0.2, 0, 1),
    roc20d:   clamp(ind.roc20d >  0 && ind.roc20d < 12 ? 0.9 : ind.roc20d > 12 ? 0.5 : 0.1, 0, 1),
    roc60d:   clamp(ind.roc60d >  0 && ind.roc60d < 20 ? 0.8 : ind.roc60d > 20 ? 0.4 : 0.2, 0, 1),

    // Williams %R: -80 to -20 = neutral; -80 to -100 = oversold (buy); 0 to -20 = overbought (sell)
    williamsR: clamp(ind.williamsR < -80 ? 0.9 : ind.williamsR < -50 ? 0.7 : ind.williamsR < -20 ? 0.5 : 0.2, 0, 1),

    // Stochastic: 20–80 momentum zone is good; <20 oversold (strong buy); >80 overbought
    stochK: clamp(ind.stochK < 20 ? 0.9 : ind.stochK < 80 ? 0.65 : 0.2, 0, 1),

    // Stoch %D confirms %K crossover
    stochCross: clamp(ind.stochK > ind.stochD && ind.stochK < 80 ? 0.8 : 0.4, 0, 1),

    // CCI: >100 = strong uptrend confirmation; -100 to 0 = recovery zone
    cci20: clamp(ind.cci20 > 100 ? 0.85 : ind.cci20 > 0 ? 0.65 : ind.cci20 > -100 ? 0.5 : 0.15, 0, 1),

    // Z-score: slight negative (−0.5 to −1.5) = mean-reversion buy signal
    zScore20: clamp(ind.zScore20 > -1.5 && ind.zScore20 < -0.3 ? 0.85
                  : ind.zScore20 >= -0.3 && ind.zScore20 < 0.5  ? 0.70
                  : ind.zScore20 >= 0.5  && ind.zScore20 < 1.5  ? 0.50
                  : 0.20, 0, 1),

    zScore60: clamp(ind.zScore60 > -2 && ind.zScore60 < -0.5 ? 0.80
                  : ind.zScore60 >= -0.5 && ind.zScore60 < 1.0 ? 0.65
                  : 0.30, 0, 1),

    // Price percentile: 25–65% range is constructive (not too extended, not broken)
    pricePercentile: clamp(ind.pricePercentile > 0.25 && ind.pricePercentile < 0.65 ? 0.80
                         : ind.pricePercentile > 0.65 && ind.pricePercentile < 0.80 ? 0.55
                         : ind.pricePercentile > 0.80 ? 0.25
                         : 0.40, 0, 1),

    // OBV slope: positive = smart-money buying
    obvSlope: clamp(0.5 + ind.obvSlope * 0.5, 0, 1),

    // CMF: >0.1 = buying pressure confirmed
    cmf21: clamp(ind.cmf21 > 0.15 ? 0.85 : ind.cmf21 > 0 ? 0.65 : ind.cmf21 > -0.15 ? 0.45 : 0.15, 0, 1),

    // ATR percentile: low-mid (20–65%) is ideal — neither dead nor explosive
    atrPercentile: clamp(ind.atrPercentile > 0.20 && ind.atrPercentile < 0.65 ? 0.80
                       : ind.atrPercentile > 0.65 && ind.atrPercentile < 0.85 ? 0.50
                       : ind.atrPercentile > 0.85 ? 0.20
                       : 0.55, 0, 1),

    // HV percentile: low HV coiling = breakout potential
    hvPercentile: clamp(ind.hvPercentile < 0.35 ? 0.85
                      : ind.hvPercentile < 0.60 ? 0.70
                      : ind.hvPercentile < 0.80 ? 0.45
                      : 0.20, 0, 1),

    // Hurst: >0.56 trend-persistence gives momentum edge
    hurstExponent: clamp(ind.hurstExponent > 0.56 ? 0.90
                       : ind.hurstExponent > 0.50 ? 0.65
                       : ind.hurstExponent > 0.44 ? 0.40
                       : 0.25, 0, 1),
  };
}
