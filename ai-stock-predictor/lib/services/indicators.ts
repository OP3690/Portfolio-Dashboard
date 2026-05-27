import { OHLCVBar } from './marketData';

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
}

export interface IndicatorResult {
  rsi: number;
  macd: MACDResult;
  bbPosition: number;
  volumeRatio: number;
  momentum10d: number;
  maCrossover: number;
  adx: number;
}

// Helper: EMA
function calculateEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let prev = values[0];
  ema.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    ema.push(prev);
  }
  return ema;
}

// Helper: SMA
function calculateSMA(values: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      sma.push(NaN);
    } else {
      const slice = values.slice(i - period + 1, i + 1);
      sma.push(slice.reduce((a, b) => a + b, 0) / period);
    }
  }
  return sma;
}

// Helper: sigmoid function
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * RSI(14): Classic 14-period Relative Strength Index
 * Returns 0-100; oversold < 30, overbought > 70
 */
export function calculateRSI(bars: OHLCVBar[], period: number = 14): number {
  if (bars.length < period + 1) return 50; // Default to neutral

  const closes = bars.map((b) => b.close);
  let gains = 0;
  let losses = 0;

  // Initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Smooth RSI using Wilder's smoothing
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * MACD(12, 26, 9): MACD line, signal line, and histogram
 * Positive histogram = bullish momentum
 */
export function calculateMACD(
  bars: OHLCVBar[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDResult {
  if (bars.length < slowPeriod + signalPeriod) {
    return { macd: 0, signal: 0, histogram: 0 };
  }

  const closes = bars.map((b) => b.close);
  const ema12 = calculateEMA(closes, fastPeriod);
  const ema26 = calculateEMA(closes, slowPeriod);

  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdLine.push(ema12[i] - ema26[i]);
  }

  const signalLine = calculateEMA(macdLine.slice(slowPeriod - fastPeriod), signalPeriod);
  const lastIdx = signalLine.length - 1;
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[lastIdx];
  const histogram = lastMacd - lastSignal;

  return {
    macd: lastMacd,
    signal: lastSignal,
    histogram,
  };
}

/**
 * Bollinger Band Position: (price - lower) / (upper - lower)
 * Returns 0-1; >0.8 = near upper band (breakout signal), <0.2 = near lower (oversold)
 */
export function calculateBBPosition(bars: OHLCVBar[], period: number = 20, stdDev: number = 2): number {
  if (bars.length < period) return 0.5; // Default to middle

  const closes = bars.map((b) => b.close);
  const recentCloses = closes.slice(-period);
  const mean = recentCloses.reduce((a, b) => a + b, 0) / period;
  const variance = recentCloses.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
  const std = Math.sqrt(variance);

  const upper = mean + stdDev * std;
  const lower = mean - stdDev * std;
  const currentPrice = closes[closes.length - 1];

  if (upper === lower) return 0.5;
  return Math.max(0, Math.min(1, (currentPrice - lower) / (upper - lower)));
}

/**
 * Volume Ratio: current volume / 20-day average volume
 * Returns ratio; >1.5 = high volume (confirms move)
 */
export function calculateVolumeRatio(bars: OHLCVBar[], avgPeriod: number = 20): number {
  if (bars.length < avgPeriod + 1) return 1;

  const recentBars = bars.slice(-avgPeriod - 1);
  const avgVolume =
    recentBars.slice(0, avgPeriod).reduce((sum, b) => sum + b.volume, 0) / avgPeriod;
  const currentVolume = recentBars[recentBars.length - 1].volume;

  if (avgVolume === 0) return 1;
  return currentVolume / avgVolume;
}

/**
 * Momentum10d: (currentPrice - price10DaysAgo) / price10DaysAgo * 100
 * Returns % momentum over 10 days
 */
export function calculateMomentum10d(bars: OHLCVBar[]): number {
  if (bars.length < 11) return 0;

  const currentPrice = bars[bars.length - 1].close;
  const price10DaysAgo = bars[bars.length - 11].close;

  if (price10DaysAgo === 0) return 0;
  return ((currentPrice - price10DaysAgo) / price10DaysAgo) * 100;
}

/**
 * MA Crossover signal: (price - MA50) / MA50 * 100
 * Returns % distance from 50-day MA; positive = bullish, negative = bearish
 */
export function calculateMACrossover(bars: OHLCVBar[], period: number = 50): number {
  if (bars.length < period) return 0;

  const closes = bars.map((b) => b.close);
  const recentCloses = closes.slice(-period);
  const ma = recentCloses.reduce((a, b) => a + b, 0) / period;
  const currentPrice = closes[closes.length - 1];

  if (ma === 0) return 0;
  return ((currentPrice - ma) / ma) * 100;
}

/**
 * ADX(14): Average Directional Index — trend strength
 * Returns 0-100; >25 = strong trend
 */
export function calculateADX(bars: OHLCVBar[], period: number = 14): number {
  if (bars.length < period * 2) return 15; // Default to below threshold

  const trueRanges: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];

  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    const prevHigh = bars[i - 1].high;
    const prevLow = bars[i - 1].low;

    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);

    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Wilder's smoothing
  let smoothedTR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedPlusDM = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedMinusDM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);

  const dxValues: number[] = [];

  for (let i = period; i < trueRanges.length; i++) {
    smoothedTR = smoothedTR - smoothedTR / period + trueRanges[i];
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDMs[i];
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDMs[i];

    const plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
    const minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;

    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
    dxValues.push(dx);
  }

  if (dxValues.length < period) return 15;

  // ADX = smoothed average of DX values
  const adx = dxValues.slice(-period).reduce((a, b) => a + b, 0) / period;
  return adx;
}

/**
 * Compute all indicators for a given set of OHLCV bars
 */
export function computeAllIndicators(bars: OHLCVBar[]): IndicatorResult {
  const rsi = calculateRSI(bars);
  const macd = calculateMACD(bars);
  const bbPosition = calculateBBPosition(bars);
  const volumeRatio = calculateVolumeRatio(bars);
  const momentum10d = calculateMomentum10d(bars);
  const maCrossover = calculateMACrossover(bars);
  const adx = calculateADX(bars);

  return { rsi, macd, bbPosition, volumeRatio, momentum10d, maCrossover, adx };
}

/**
 * Normalize indicators to 0-1 scores for composite scoring
 */
export function normalizeIndicators(indicators: IndicatorResult): Record<string, number> {
  // RSI: ideal range 45-65, peaks at 55
  const rsiScore = (() => {
    const rsi = indicators.rsi;
    if (rsi >= 45 && rsi <= 65) {
      // Gaussian-like peak at 55
      return Math.exp(-Math.pow(rsi - 55, 2) / 200);
    } else if (rsi < 45) {
      return Math.max(0, (rsi - 30) / 15) * 0.7;
    } else {
      return Math.max(0, (80 - rsi) / 15) * 0.7;
    }
  })();

  // MACD: sigmoid(histogram) normalized 0-1, positive = bullish
  const macdScore = sigmoid(indicators.macd.histogram * 0.5);

  // BB Position: score peaks at 0.55-0.75 (breaking above midline toward upper)
  const bbScore = (() => {
    const bb = indicators.bbPosition;
    if (bb >= 0.55 && bb <= 0.75) return 1.0;
    if (bb >= 0.4 && bb < 0.55) return (bb - 0.4) / 0.15;
    if (bb > 0.75 && bb <= 0.9) return (0.9 - bb) / 0.15;
    return 0.1;
  })();

  // Volume Ratio: capped at 3x average
  const volumeScore = Math.min(indicators.volumeRatio / 3, 1);

  // Momentum10d: sigmoid normalized
  const momentumScore = sigmoid(indicators.momentum10d / 20);

  // MA Crossover: sigmoid normalized
  const maCrossoverScore = sigmoid(indicators.maCrossover / 10);

  // ADX: higher is better, capped
  const adxScore = Math.min(indicators.adx / 50, 1);

  return {
    rsi: rsiScore,
    macd: macdScore,
    bbPosition: bbScore,
    volumeRatio: volumeScore,
    momentum10d: momentumScore,
    maCrossover: maCrossoverScore,
    adx: adxScore,
  };
}
