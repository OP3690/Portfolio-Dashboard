import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import StockData from '@/models/StockData';
import StockMaster from '@/models/StockMaster';
import Holding from '@/models/Holding';
import { subDays, subMonths } from 'date-fns';
import { fetchNSEHistoricalData } from '@/lib/stockDataService';
import { format } from 'date-fns';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Calculate RSI (Relative Strength Index)
function calculateRSI(prices: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  const changes: number[] = [];
  
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }
  
  for (let i = period - 1; i < changes.length; i++) {
    const periodChanges = changes.slice(i - period + 1, i + 1);
    const gains = periodChanges.filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
    const losses = Math.abs(periodChanges.filter(c => c < 0).reduce((a, b) => a + b, 0)) / period;
    
    if (losses === 0) {
      rsi.push(100);
    } else {
      const rs = gains / losses;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }
  
  // Pad beginning with null values
  return new Array(period - 1).fill(0).concat(rsi);
}

// Calculate MACD (Moving Average Convergence Divergence)
function calculateMACD(prices: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): {
  macd: number[];
  signal: number[];
  histogram: number[];
} {
  // Calculate EMAs
  const calculateEMA = (data: number[], period: number): number[] => {
    const ema: number[] = [];
    const multiplier = 2 / (period + 1);
    
    // First EMA value is SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += data[i];
      ema.push(NaN);
    }
    ema[period - 1] = sum / period;
    
    // Calculate subsequent EMAs
    for (let i = period; i < data.length; i++) {
      ema.push((data[i] - ema[i - 1]) * multiplier + ema[i - 1]);
    }
    
    return ema;
  };
  
  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);
  
  // MACD line
  const macd: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (isNaN(fastEMA[i]) || isNaN(slowEMA[i])) {
      macd.push(NaN);
    } else {
      macd.push(fastEMA[i] - slowEMA[i]);
    }
  }
  
  // Signal line (EMA of MACD)
  const macdValues = macd.filter(m => !isNaN(m));
  const signalEMA = calculateEMA(macdValues, signalPeriod);
  
  // Pad signal array
  const signal: number[] = [];
  let signalIdx = 0;
  for (let i = 0; i < macd.length; i++) {
    if (isNaN(macd[i])) {
      signal.push(NaN);
    } else {
      signal.push(signalIdx < signalEMA.length ? signalEMA[signalIdx] : NaN);
      signalIdx++;
    }
  }
  
  // Histogram
  const histogram: number[] = [];
  for (let i = 0; i < macd.length; i++) {
    if (isNaN(macd[i]) || isNaN(signal[i])) {
      histogram.push(NaN);
    } else {
      histogram.push(macd[i] - signal[i]);
    }
  }
  
  return { macd, signal, histogram };
}

// Calculate Moving Averages
function calculateMA(prices: number[], period: number): number[] {
  const ma: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      ma.push(NaN);
    } else {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      ma.push(sum / period);
    }
  }
  return ma;
}

// Calculate Bollinger Bands
function calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2): {
  upper: number[];
  middle: number[];
  lower: number[];
} {
  const middle = calculateMA(prices, period);
  const upper: number[] = [];
  const lower: number[] = [];
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
    } else {
      const periodPrices = prices.slice(i - period + 1, i + 1);
      const mean = middle[i];
      const variance = periodPrices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period;
      const std = Math.sqrt(variance);
      
      upper.push(mean + (stdDev * std));
      lower.push(mean - (stdDev * std));
    }
  }
  
  return { upper, middle, lower };
}

// Calculate ATR (Average True Range)
function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
  const trueRanges: number[] = [];
  
  for (let i = 1; i < highs.length; i++) {
    const tr1 = highs[i] - lows[i];
    const tr2 = Math.abs(highs[i] - closes[i - 1]);
    const tr3 = Math.abs(lows[i] - closes[i - 1]);
    trueRanges.push(Math.max(tr1, tr2, tr3));
  }
  
  const atr: number[] = new Array(highs.length).fill(NaN);
  let atrSum = 0;
  
  for (let i = 0; i < trueRanges.length; i++) {
    if (i < period - 1) {
      atrSum += trueRanges[i];
    } else {
      if (i === period - 1) {
        atrSum += trueRanges[i];
        atr[i + 1] = atrSum / period;
      } else {
        atr[i + 1] = ((atr[i] * (period - 1)) + trueRanges[i]) / period;
      }
    }
  }
  
  return atr;
}

// Calculate Stochastic Oscillator
function calculateStochastic(highs: number[], lows: number[], closes: number[], kPeriod: number = 14, dPeriod: number = 3): {
  k: number[];
  d: number[];
} {
  const k: number[] = [];
  
  for (let i = kPeriod - 1; i < highs.length; i++) {
    const periodHighs = highs.slice(i - kPeriod + 1, i + 1);
    const periodLows = lows.slice(i - kPeriod + 1, i + 1);
    const highestHigh = Math.max(...periodHighs);
    const lowestLow = Math.min(...periodLows);
    
    if (highestHigh === lowestLow) {
      k.push(50);
    } else {
      k.push(((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100);
    }
  }
  
  // Pad beginning
  const kPadded = new Array(kPeriod - 1).fill(NaN).concat(k);
  
  // Calculate %D (SMA of %K)
  const d = calculateMA(kPadded.filter(v => !isNaN(v)), dPeriod);
  const dPadded = new Array(kPeriod - 1).fill(NaN).concat(d);
  
  return { k: kPadded, d: dPadded };
}

// Calculate ADX (Average Directional Index)
function calculateADX(highs: number[], lows: number[], closes: number[], period: number = 14): {
  adx: number[];
  plusDI: number[];
  minusDI: number[];
} {
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];
  
  for (let i = 1; i < highs.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    
    const tr1 = highs[i] - lows[i];
    const tr2 = Math.abs(highs[i] - closes[i - 1]);
    const tr3 = Math.abs(lows[i] - closes[i - 1]);
    tr.push(Math.max(tr1, tr2, tr3));
  }
  
  // Calculate smoothed values
  const atr = calculateATR(highs, lows, closes, period);
  const plusDI: number[] = [];
  const minusDI: number[] = [];
  
  for (let i = period - 1; i < plusDM.length; i++) {
    const plusDMSum = plusDM.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    const minusDMSum = minusDM.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    const atrValue = atr[i + 1];
    
    if (atrValue > 0) {
      plusDI.push((plusDMSum / period / atrValue) * 100);
      minusDI.push((minusDMSum / period / atrValue) * 100);
    } else {
      plusDI.push(0);
      minusDI.push(0);
    }
  }
  
  // Calculate DX and ADX
  const dx: number[] = [];
  for (let i = 0; i < plusDI.length; i++) {
    const diSum = plusDI[i] + minusDI[i];
    if (diSum > 0) {
      dx.push((Math.abs(plusDI[i] - minusDI[i]) / diSum) * 100);
    } else {
      dx.push(0);
    }
  }
  
  const adx = calculateMA(dx, period);
  const plusDIPadded = new Array(period).fill(NaN).concat(plusDI);
  const minusDIPadded = new Array(period).fill(NaN).concat(minusDI);
  const adxPadded = new Array(period * 2 - 1).fill(NaN).concat(adx);
  
  return { adx: adxPadded, plusDI: plusDIPadded, minusDI: minusDIPadded };
}

// Calculate Support and Resistance Levels
function calculateSupportResistance(highs: number[], lows: number[], closes: number[]): {
  support: number[];
  resistance: number[];
} {
  const support: number[] = [];
  const resistance: number[] = [];
  
  const window = 20;
  
  for (let i = window; i < highs.length - window; i++) {
    const localHighs = highs.slice(i - window, i + window + 1);
    const localLows = lows.slice(i - window, i + window + 1);
    
    const currentHigh = highs[i];
    const currentLow = lows[i];
    
    // Resistance: local high that's near current high
    if (currentHigh === Math.max(...localHighs)) {
      resistance.push(currentHigh);
    } else {
      resistance.push(NaN);
    }
    
    // Support: local low that's near current low
    if (currentLow === Math.min(...localLows)) {
      support.push(currentLow);
    } else {
      support.push(NaN);
    }
  }
  
  // Pad arrays
  const supportPadded = new Array(window).fill(NaN).concat(support).concat(new Array(window).fill(NaN));
  const resistancePadded = new Array(window).fill(NaN).concat(resistance).concat(new Array(window).fill(NaN));
  
  return { support: supportPadded, resistance: resistancePadded };
}

// Calculate Fibonacci Retracements
function calculateFibonacci(high: number, low: number): {
  level0: number;
  level236: number;
  level382: number;
  level50: number;
  level618: number;
  level786: number;
  level100: number;
} {
  const diff = high - low;
  return {
    level0: high,
    level236: high - (diff * 0.236),
    level382: high - (diff * 0.382),
    level50: high - (diff * 0.5),
    level618: high - (diff * 0.618),
    level786: high - (diff * 0.786),
    level100: low
  };
}

// Detect Chart Patterns
function detectPatterns(ohlcData: any[]): any[] {
  const patterns: any[] = [];
  const closes = ohlcData.map(d => d.close);
  const highs = ohlcData.map(d => d.high);
  const lows = ohlcData.map(d => d.low);
  
  if (closes.length < 50) return patterns;
  
  // Double Top Pattern
  const recentHighs = highs.slice(-50);
  const maxHigh = Math.max(...recentHighs);
  const maxHighIndex = recentHighs.indexOf(maxHigh);
  const secondHighIndex = recentHighs.lastIndexOf(maxHigh);
  
  if (secondHighIndex > maxHighIndex && Math.abs(maxHigh - recentHighs[secondHighIndex]) / maxHigh < 0.02) {
    const midLow = Math.min(...lows.slice(-50 + maxHighIndex, -50 + secondHighIndex));
    if (maxHigh - midLow > maxHigh * 0.05) {
      patterns.push({
        type: 'warning',
        icon: '📉',
        title: 'Double Top Pattern Detected',
        message: 'Potential reversal pattern detected. Price may decline from current levels.',
        severity: 'medium'
      });
    }
  }
  
  // Double Bottom Pattern
  const recentLows = lows.slice(-50);
  const minLow = Math.min(...recentLows);
  const minLowIndex = recentLows.indexOf(minLow);
  const secondLowIndex = recentLows.lastIndexOf(minLow);
  
  if (secondLowIndex > minLowIndex && Math.abs(minLow - recentLows[secondLowIndex]) / minLow < 0.02) {
    const midHigh = Math.max(...highs.slice(-50 + minLowIndex, -50 + secondLowIndex));
    if (midHigh - minLow > minLow * 0.05) {
      patterns.push({
        type: 'success',
        icon: '📈',
        title: 'Double Bottom Pattern Detected',
        message: 'Potential reversal pattern detected. Price may rise from current levels.',
        severity: 'medium'
      });
    }
  }
  
  // Head and Shoulders (simplified)
  if (closes.length >= 60) {
    const last60Highs = highs.slice(-60);
    const peaks: number[] = [];
    for (let i = 1; i < last60Highs.length - 1; i++) {
      if (last60Highs[i] > last60Highs[i - 1] && last60Highs[i] > last60Highs[i + 1]) {
        peaks.push(last60Highs[i]);
      }
    }
    
    if (peaks.length >= 3) {
      const sortedPeaks = [...peaks].sort((a, b) => b - a);
      const head = sortedPeaks[0];
      const shoulders = sortedPeaks.slice(1, 3);
      
      if (shoulders.length === 2 && Math.abs(shoulders[0] - shoulders[1]) / shoulders[0] < 0.03) {
        patterns.push({
          type: 'danger',
          icon: '⚠️',
          title: 'Head and Shoulders Pattern',
          message: 'Bearish reversal pattern detected. Consider taking profits or reducing position.',
          severity: 'high'
        });
      }
    }
  }
  
  return patterns;
}

// Calculate trendline using linear regression
function calculateTrendline(prices: number[]): { slope: number; intercept: number; r2: number } {
  const n = prices.length;
  const x = Array.from({ length: n }, (_, i) => i);
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = prices.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * prices[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = prices.reduce((sum, yi) => sum + yi * yi, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  // Calculate R²
  const yMean = sumY / n;
  const ssRes = prices.reduce((sum, yi, i) => {
    const yPred = slope * i + intercept;
    return sum + Math.pow(yi - yPred, 2);
  }, 0);
  const ssTot = prices.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
  const r2 = 1 - (ssRes / ssTot);
  
  return { slope, intercept, r2 };
}

// Generate algorithm flags and alerts
function generateAlerts(
  ohlcData: any[], 
  rsi: number[], 
  macd: any, 
  currentPrice: number, 
  ma20: number[], 
  ma50: number[], 
  bb: any,
  stochastic: any,
  adx: any,
  atr: number[]
): any[] {
  const alerts: any[] = [];
  const latestIdx = ohlcData.length - 1;
  
  if (latestIdx < 0) return alerts;
  
  const latest = ohlcData[latestIdx];
  const latestRSI = rsi[latestIdx];
  const latestMACD = macd.macd[latestIdx];
  const latestSignal = macd.signal[latestIdx];
  const latestHistogram = macd.histogram[latestIdx];
  const latestStochK = stochastic.k[latestIdx];
  const latestStochD = stochastic.d[latestIdx];
  const latestADX = adx.adx[latestIdx];
  const latestATR = atr[latestIdx];
  
  // RSI Alerts
  if (!isNaN(latestRSI)) {
    if (latestRSI > 70) {
      alerts.push({
        type: 'warning',
        icon: '⚠️',
        title: 'RSI Overbought',
        message: `RSI at ${latestRSI.toFixed(1)} indicates overbought condition. Consider profit-taking.`,
        severity: 'high'
      });
    } else if (latestRSI < 30) {
      alerts.push({
        type: 'info',
        icon: '📈',
        title: 'RSI Oversold',
        message: `RSI at ${latestRSI.toFixed(1)} indicates oversold condition. Potential buying opportunity.`,
        severity: 'medium'
      });
    } else if (latestRSI > 50 && latestRSI < 60) {
      alerts.push({
        type: 'success',
        icon: '✅',
        title: 'RSI Bullish Zone',
        message: `RSI at ${latestRSI.toFixed(1)} indicates healthy bullish momentum.`,
        severity: 'low'
      });
    }
  }
  
  // MACD Alerts
  if (!isNaN(latestMACD) && !isNaN(latestSignal)) {
    if (latestMACD > latestSignal && latestHistogram > 0 && latestHistogram > macd.histogram[latestIdx - 1]) {
      alerts.push({
        type: 'success',
        icon: '🟢',
        title: 'MACD Bullish Crossover',
        message: 'MACD crossed above signal line with increasing histogram. Strong bullish momentum detected.',
        severity: 'high'
      });
    } else if (latestMACD < latestSignal && latestHistogram < 0 && latestHistogram < macd.histogram[latestIdx - 1]) {
      alerts.push({
        type: 'danger',
        icon: '🔴',
        title: 'MACD Bearish Crossover',
        message: 'MACD crossed below signal line with decreasing histogram. Strong bearish momentum detected.',
        severity: 'high'
      });
    }
  }
  
  // Stochastic Alerts
  if (!isNaN(latestStochK) && !isNaN(latestStochD)) {
    if (latestStochK > 80 && latestStochD > 80) {
      alerts.push({
        type: 'warning',
        icon: '📊',
        title: 'Stochastic Overbought',
        message: `Stochastic K=${latestStochK.toFixed(1)}, D=${latestStochD.toFixed(1)}. Overbought condition.`,
        severity: 'medium'
      });
    } else if (latestStochK < 20 && latestStochD < 20) {
      alerts.push({
        type: 'info',
        icon: '📊',
        title: 'Stochastic Oversold',
        message: `Stochastic K=${latestStochK.toFixed(1)}, D=${latestStochD.toFixed(1)}. Oversold condition.`,
        severity: 'medium'
      });
    }
  }
  
  // ADX Trend Strength
  if (!isNaN(latestADX)) {
    if (latestADX > 25) {
      alerts.push({
        type: 'success',
        icon: '💪',
        title: 'Strong Trend Detected',
        message: `ADX at ${latestADX.toFixed(1)} indicates strong trend. Trend-following strategies may work well.`,
        severity: 'medium'
      });
    } else if (latestADX < 20) {
      alerts.push({
        type: 'info',
        icon: '🌀',
        title: 'Weak Trend / Range-Bound',
        message: `ADX at ${latestADX.toFixed(1)} indicates weak trend. Market may be consolidating.`,
        severity: 'low'
      });
    }
  }
  
  // Moving Average Alerts
  if (!isNaN(ma20[latestIdx]) && !isNaN(ma50[latestIdx])) {
    if (currentPrice > ma20[latestIdx] && ma20[latestIdx] > ma50[latestIdx]) {
      alerts.push({
        type: 'success',
        icon: '📊',
        title: 'Uptrend Confirmed',
        message: 'Price above 20MA and 20MA above 50MA. Strong uptrend in place.',
        severity: 'medium'
      });
    } else if (currentPrice < ma20[latestIdx] && ma20[latestIdx] < ma50[latestIdx]) {
      alerts.push({
        type: 'danger',
        icon: '📉',
        title: 'Downtrend Confirmed',
        message: 'Price below 20MA and 20MA below 50MA. Downtrend in place.',
        severity: 'medium'
      });
    }
  }
  
  // Bollinger Bands Alerts
  if (!isNaN(bb.upper[latestIdx]) && !isNaN(bb.lower[latestIdx])) {
    const bbWidth = (bb.upper[latestIdx] - bb.lower[latestIdx]) / bb.middle[latestIdx];
    if (currentPrice > bb.upper[latestIdx]) {
      alerts.push({
        type: 'warning',
        icon: '⚡',
        title: 'Price Above Upper Bollinger Band',
        message: 'Price is above upper Bollinger Band. Possible overbought condition or strong breakout.',
        severity: 'medium'
      });
    } else if (currentPrice < bb.lower[latestIdx]) {
      alerts.push({
        type: 'info',
        icon: '💡',
        title: 'Price Below Lower Bollinger Band',
        message: 'Price is below lower Bollinger Band. Possible oversold condition or breakdown.',
        severity: 'medium'
      });
    }
    
    // Bollinger Band Squeeze
    if (bbWidth < 0.1) {
      alerts.push({
        type: 'info',
        icon: '🎯',
        title: 'Bollinger Band Squeeze',
        message: 'Low volatility detected. Potential for significant price movement ahead.',
        severity: 'medium'
      });
    }
  }
  
  // Volume Analysis
  const recentVolumes = ohlcData.slice(-20).map(d => d.volume);
  const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
  if (latest.volume > avgVolume * 1.5) {
    alerts.push({
      type: 'info',
      icon: '📊',
      title: 'High Volume Spike',
      message: `Volume is ${((latest.volume / avgVolume) * 100).toFixed(0)}% above average. Significant trading activity detected.`,
      severity: 'medium'
    });
  }
  
  // ATR Volatility Alert
  if (!isNaN(latestATR) && latestIdx > 0) {
    const avgATR = atr.slice(-20).filter(a => !isNaN(a)).reduce((a, b) => a + b, 0) / 20;
    if (latestATR > avgATR * 1.3) {
      alerts.push({
        type: 'warning',
        icon: '🌊',
        title: 'High Volatility Alert',
        message: `ATR indicates increased volatility. Risk management is crucial.`,
        severity: 'medium'
      });
    }
  }
  
  return alerts;
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const isin = searchParams.get('isin');
    const days = parseInt(searchParams.get('days') || '180'); // Default 6 months
    
    if (!isin) {
      return NextResponse.json(
        { success: false, error: 'ISIN parameter is required' },
        { status: 400 }
      );
    }
    
    // Get stock master info
    const stock = await StockMaster.findOne({ isin }).lean();
    if (!stock) {
      return NextResponse.json(
        { success: false, error: 'Stock not found' },
        { status: 404 }
      );
    }
    
    // If sector is missing in StockMaster, try to get it from Holdings
    let sector = (stock as any).sector;
    if (!sector || sector === 'Unknown') {
      const holding = await Holding.findOne({ isin }).select('sectorName').lean();
      if (holding && (holding as any).sectorName) {
        sector = (holding as any).sectorName;
        // Optionally update StockMaster with the sector for future use
        await StockMaster.updateOne({ isin }, { $set: { sector } }).catch(() => {
          // Silent fail - don't block the response if update fails
        });
      }
    }
    
    // Fetch historical data
    const today = new Date();
    const startDate = subDays(today, days);
    
    let ohlcData = await StockData.find({
      isin,
      date: { $gte: startDate, $lte: today }
    })
      .sort({ date: 1 })
      .select('date open high low close volume')
      .lean();
    
    // If no data found, try to fetch it on-demand
    if (ohlcData.length === 0) {
      const stockDoc = await StockMaster.findOne({ isin }).lean();
      const stock = stockDoc as any;
      
      if (stock && stock.symbol && stock.exchange) {
        try {
          console.log(`No historical data found for ${isin}, fetching on-demand...`);
          
          // Fetch historical data from Yahoo Finance
          const fetchedData = await fetchNSEHistoricalData(
            stock.symbol,
            stock.exchange,
            startDate,
            today
          );
          
          if (fetchedData && fetchedData.length > 0) {
            // Store fetched data in database
            const stockMaster = await StockMaster.findOne({ isin });
            
            for (const dataPoint of fetchedData) {
              try {
                await StockData.findOneAndUpdate(
                  {
                    isin,
                    date: dataPoint.date
                  },
                  {
                    isin,
                    stockName: stock.stockName,
                    symbol: stock.symbol,
                    exchange: stock.exchange,
                    date: dataPoint.date,
                    open: dataPoint.open,
                    high: dataPoint.high,
                    low: dataPoint.low,
                    close: dataPoint.close,
                    volume: dataPoint.volume,
                    currentPrice: dataPoint.close,
                    lastUpdated: new Date()
                  },
                  { upsert: true, new: true }
                );
              } catch (err) {
                // Skip duplicates
                console.error(`Error storing data point for ${isin} on ${dataPoint.date}:`, err);
              }
            }
            
            // Re-fetch from database
            ohlcData = await StockData.find({
              isin,
              date: { $gte: startDate, $lte: today }
            })
              .sort({ date: 1 })
              .select('date open high low close volume')
              .lean();
            
            console.log(`✅ Fetched and stored ${ohlcData.length} data points for ${isin}`);
          }
        } catch (error: any) {
          console.error(`Error fetching on-demand data for ${isin}:`, error.message);
          // Continue to return error if fetching failed
        }
      }
      
      // If still no data after attempting to fetch
      if (ohlcData.length === 0) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'No historical data available for this stock. Please use "Refresh Stock Data" to fetch historical data for all stocks.',
            isin,
            symbol: stock?.symbol,
            stockName: stock?.stockName
          },
          { status: 404 }
        );
      }
    }
    
    // Extract price arrays
    const closes = ohlcData.map((d: any) => d.close);
    const highs = ohlcData.map((d: any) => d.high);
    const lows = ohlcData.map((d: any) => d.low);
    const opens = ohlcData.map((d: any) => d.open);
    const volumes = ohlcData.map((d: any) => d.volume);
    const dates = ohlcData.map((d: any) => d.date);
    
    const currentPrice = closes[closes.length - 1];
    
    // Calculate technical indicators
    const rsi = calculateRSI(closes, 14);
    const macd = calculateMACD(closes, 12, 26, 9);
    const ma20 = calculateMA(closes, 20);
    const ma50 = calculateMA(closes, 50);
    const ma200 = calculateMA(closes, 200);
    const bb = calculateBollingerBands(closes, 20, 2);
    const trendline = calculateTrendline(closes);
    const atr = calculateATR(highs, lows, closes, 14);
    const stochastic = calculateStochastic(highs, lows, closes, 14, 3);
    const adx = calculateADX(highs, lows, closes, 14);
    const supportResistance = calculateSupportResistance(highs, lows, closes);
    
    // Generate trendline points
    const trendlinePoints = closes.map((_, i) => ({
      date: dates[i],
      value: trendline.slope * i + trendline.intercept
    }));
    
    // Calculate additional metrics
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i - 1] > 0) {
        returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      }
    }
    
    const volatility = returns.length > 0 ? Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / returns.length
    ) * Math.sqrt(252) * 100 : 0;
    
    const totalReturn = closes.length > 0 ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100 : 0;
    
    // Calculate Fibonacci levels
    const periodHigh = Math.max(...highs);
    const periodLow = Math.min(...lows);
    const fibonacci = calculateFibonacci(periodHigh, periodLow);
    
    // Detect patterns
    const patterns = detectPatterns(ohlcData);
    
    // Generate alerts
    const alerts = generateAlerts(ohlcData, rsi, macd, currentPrice, ma20, ma50, bb, stochastic, adx, atr);
    
    // Combine patterns with alerts
    const allAlerts = [...alerts, ...patterns];
    
    // Format data for charts
    const chartData = ohlcData.map((d: any, idx: number) => ({
      date: new Date(d.date).toISOString().split('T')[0],
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume,
      rsi: isNaN(rsi[idx]) ? null : rsi[idx],
      macd: isNaN(macd.macd[idx]) ? null : macd.macd[idx],
      macdSignal: isNaN(macd.signal[idx]) ? null : macd.signal[idx],
      macdHistogram: isNaN(macd.histogram[idx]) ? null : macd.histogram[idx],
      ma20: isNaN(ma20[idx]) ? null : ma20[idx],
      ma50: isNaN(ma50[idx]) ? null : ma50[idx],
      ma200: isNaN(ma200[idx]) ? null : ma200[idx],
      bbUpper: isNaN(bb.upper[idx]) ? null : bb.upper[idx],
      bbMiddle: isNaN(bb.middle[idx]) ? null : bb.middle[idx],
      bbLower: isNaN(bb.lower[idx]) ? null : bb.lower[idx],
      trendline: idx < trendlinePoints.length ? trendlinePoints[idx].value : null,
      atr: isNaN(atr[idx]) ? null : atr[idx],
      stochasticK: isNaN(stochastic.k[idx]) ? null : stochastic.k[idx],
      stochasticD: isNaN(stochastic.d[idx]) ? null : stochastic.d[idx],
      adx: isNaN(adx.adx[idx]) ? null : adx.adx[idx],
      plusDI: isNaN(adx.plusDI[idx]) ? null : adx.plusDI[idx],
      minusDI: isNaN(adx.minusDI[idx]) ? null : adx.minusDI[idx],
      support: isNaN(supportResistance.support[idx]) ? null : supportResistance.support[idx],
      resistance: isNaN(supportResistance.resistance[idx]) ? null : supportResistance.resistance[idx]
    }));
    
    return NextResponse.json({
      success: true,
      data: {
        stock: {
          isin: (stock as any).isin,
          stockName: (stock as any).stockName || 'Unknown',
          symbol: (stock as any).symbol || '',
          sector: sector || 'Unknown',
          currentPrice
        },
        chartData,
        indicators: {
          rsi: rsi.slice(-1)[0],
          macd: macd.macd.slice(-1)[0],
          macdSignal: macd.signal.slice(-1)[0],
          macdHistogram: macd.histogram.slice(-1)[0],
          ma20: ma20.slice(-1)[0],
          ma50: ma50.slice(-1)[0],
          ma200: ma200.slice(-1)[0],
          atr: atr.slice(-1)[0],
          stochasticK: stochastic.k.slice(-1)[0],
          stochasticD: stochastic.d.slice(-1)[0],
          adx: adx.adx.slice(-1)[0],
          plusDI: adx.plusDI.slice(-1)[0],
          minusDI: adx.minusDI.slice(-1)[0]
        },
        fibonacci,
        supportResistance: {
          currentSupport: supportResistance.support.filter(s => !isNaN(s)).slice(-5),
          currentResistance: supportResistance.resistance.filter(r => !isNaN(r)).slice(-5)
        },
        metrics: {
          volatility: Math.round(volatility * 100) / 100,
          totalReturn: Math.round(totalReturn * 100) / 100,
          trendlineSlope: trendline.slope,
          trendlineR2: Math.round(trendline.r2 * 1000) / 1000
        },
        alerts: allAlerts,
        summary: {
          period: days,
          dataPoints: ohlcData.length,
          dateRange: {
            start: dates[0],
            end: dates[dates.length - 1]
          }
        },
        corporateData: null // Will be fetched client-side or via separate endpoint
      }
    });
    
  } catch (error: any) {
    console.error('Stock analysis detail error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch stock analysis' },
      { status: 500 }
    );
  }
}

// Search stocks endpoint
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const { searchTerm } = body;
    
    if (!searchTerm || searchTerm.length < 2) {
      return NextResponse.json({
        success: true,
        stocks: []
      });
    }
    
    const searchRegex = new RegExp(searchTerm, 'i');
    const stocks = await StockMaster.find({
      $or: [
        { stockName: searchRegex },
        { symbol: searchRegex },
        { isin: searchRegex }
      ]
    })
      .select('isin stockName symbol sector')
      .limit(50)
      .lean();
    
    // Get ISINs that need sector lookup
    const isinsNeedingSector = stocks
      .filter((s: any) => !s.sector || s.sector === 'Unknown')
      .map((s: any) => s.isin);
    
    // Bulk fetch sectors from Holdings for missing ones
    let sectorMap: { [key: string]: string } = {};
    if (isinsNeedingSector.length > 0) {
      const holdings = await Holding.find({ isin: { $in: isinsNeedingSector } })
        .select('isin sectorName')
        .lean();
      
      holdings.forEach((h: any) => {
        if (h.sectorName) {
          sectorMap[h.isin] = h.sectorName;
        }
      });
      
      // Update StockMaster with found sectors (async, non-blocking)
      Promise.all(
        Object.entries(sectorMap).map(([isin, sector]) =>
          StockMaster.updateOne({ isin }, { $set: { sector } }).catch(() => {})
        )
      ).catch(() => {});
    }
    
    return NextResponse.json({
      success: true,
      stocks: stocks.map((s: any) => ({
        isin: s.isin,
        stockName: s.stockName || 'Unknown',
        symbol: s.symbol || '',
        sector: s.sector || sectorMap[s.isin] || 'Unknown'
      }))
    });
    
  } catch (error: any) {
    console.error('Stock search error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to search stocks' },
      { status: 500 }
    );
  }
}

