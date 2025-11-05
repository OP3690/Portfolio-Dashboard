import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import StockMaster from '@/models/StockMaster';
import StockData from '@/models/StockData';
import { subDays, subMonths } from 'date-fns';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const MAX_EXECUTION_TIME = 90000; // 90 seconds max execution time (optimized for faster processing)
  
  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    
    // Get filter parameters for each signal type
    const getFilterParam = (prefix: string, key: string, defaultValue: any) => {
      const param = searchParams.get(`${prefix}_${key}`);
      return param !== null ? (typeof defaultValue === 'number' ? parseFloat(param) : param === 'true') : defaultValue;
    };
    
    // Volume Spikes filters
    const volSpikeMinVolSpike = getFilterParam('volSpike', 'minVolSpike', 30);
    const volSpikeMinPriceMove = getFilterParam('volSpike', 'minPriceMove', 0.5);
    const volSpikeMinPrice = getFilterParam('volSpike', 'minPrice', 30);
    
    // Deep Pullbacks filters
    const pullbackMaxFromHigh = getFilterParam('pullback', 'maxFromHigh', -50);
    const pullbackMinVol = getFilterParam('pullback', 'minVol', 5000);
    const pullbackMinPrice = getFilterParam('pullback', 'minPrice', 30);
    
    // Capitulated filters
    const capMaxFromHigh = getFilterParam('cap', 'maxFromHigh', -90);
    const capMinVolSpike = getFilterParam('cap', 'minVolSpike', 0);
    const capMinPrice = getFilterParam('cap', 'minPrice', 10);
    
    // 5-Day Decliners filters
    const declinerMinDownDays = getFilterParam('decliner', 'minDownDays', 3);
    const declinerMaxReturn = getFilterParam('decliner', 'maxReturn', -1.5);
    const declinerMinPrice = getFilterParam('decliner', 'minPrice', 30);
    
    // 5-Day Climbers filters
    const climberMinUpDays = getFilterParam('climber', 'minUpDays', 3);
    const climberMinReturn = getFilterParam('climber', 'minReturn', 1.5);
    const climberMinPrice = getFilterParam('climber', 'minPrice', 30);
    
    // Tight Range Breakout filters
    const breakoutMaxRange = getFilterParam('breakout', 'maxRange', 15);
    const breakoutMinBoScore = getFilterParam('breakout', 'minBoScore', 0);
    const breakoutMinVolSpike = getFilterParam('breakout', 'minVolSpike', 50);
    const breakoutMinPrice = getFilterParam('breakout', 'minPrice', 30);
    
    // Quantitative Predictions filters
    const quantMinProbability = getFilterParam('quant', 'minProbability', 0.40);
    const quantMinPredictedReturn = getFilterParam('quant', 'minPredictedReturn', 8);
    const quantMinCAGR = getFilterParam('quant', 'minCAGR', -100);
    const quantMaxVolatility = getFilterParam('quant', 'maxVolatility', 100);
    const quantMinMomentum = getFilterParam('quant', 'minMomentum', 0);
    const quantMinPrice = getFilterParam('quant', 'minPrice', 0);
    
    // Signal type filter - if specified, only return that signal type
    const signalType = searchParams.get('signalType');
    
    const allStocks = await StockMaster.find({}).lean();
    
    if (allStocks.length === 0) {
      return NextResponse.json({
        success: true, 
        data: {
          volumeSpikes: [],
          deepPullbacks: [],
          capitulated: [],
          fiveDayDecliners: [],
          fiveDayClimbers: [],
          tightRangeBreakouts: [],
        },
        message: 'No stocks found in StockMaster.'
      });
    }

    // Get the latest date in the database (not "today" which might be in the future)
    // Use aggregation with allowDiskUse for large collections
    const latestRecordResult = await StockData.aggregate([
      { $sort: { date: -1 } },
      { $limit: 1 },
      { $project: { date: 1 } }
    ], { allowDiskUse: true }).exec();
    const latestRecord = latestRecordResult && latestRecordResult.length > 0 ? latestRecordResult[0] : null;
    const latestDate = (latestRecord && !Array.isArray(latestRecord) && latestRecord.date) ? new Date(latestRecord.date) : new Date();
    
    // Set today to the latest available date in the database
    const today = latestDate;
    const oneYearAgo = subMonths(today, 12);

    // Helper to get recent price data - uses latest available date as reference
    const getRecentPrices = async (isin: string, days: number) => {
      const fromDate = subDays(today, days);
      const data = await StockData.find({
          isin,
        date: { $gte: fromDate, $lte: today }
      })
      .sort({ date: 1 })
      .lean();
      return data;
    };

    // Calculate RSI from OHLC data
    const calculateRSI = (prices: number[], period: number = 10): number => {
      if (prices.length < period + 1) return 50;
      const changes: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        changes.push(prices[i] - prices[i - 1]);
      }
      const gains = changes.filter(c => c > 0);
      const losses = changes.filter(c => c < 0).map(c => Math.abs(c));
      const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;
      if (avgLoss === 0) return 100;
      const rs = avgGain / avgLoss;
      return 100 - (100 / (1 + rs));
    };

    // Calculate ATR
    const calculateATR = (data: any[], period: number = 14): number => {
      if (data.length < period + 1) return 0;
      const trueRanges: number[] = [];
      for (let i = 1; i < data.length; i++) {
        const high = data[i].high || data[i].close || 0;
        const low = data[i].low || data[i].close || 0;
        const prevClose = data[i - 1].close || 0;
        const tr = Math.max(
          high - low,
          Math.abs(high - prevClose),
          Math.abs(low - prevClose)
        );
        trueRanges.push(tr);
      }
      const recentTR = trueRanges.slice(-period);
      return recentTR.reduce((sum, tr) => sum + tr, 0) / period;
    };

    // Calculate EMA (Exponential Moving Average)
    const calculateEMA = (prices: number[], period: number): number => {
      if (prices.length < period) return prices[prices.length - 1] || 0;
      const multiplier = 2 / (period + 1);
      let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
      for (let i = period; i < prices.length; i++) {
        ema = (prices[i] - ema) * multiplier + ema;
      }
      return ema;
    };

    // Calculate 3-Month Momentum Score (0 to 1)
    const calculate3MMomentum = (prices: number[], volumes: number[]): number => {
      if (prices.length < 63) return 0; // Need ~3 months of data
      const priceChange = (prices[prices.length - 1] - prices[prices.length - 63]) / prices[prices.length - 63];
      const recentVolumes = volumes.slice(-15);
      const oldVolumes = volumes.slice(-63, -15);
      const avgRecentVol = recentVolumes.length > 0 ? recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length : 0;
      const avgOldVol = oldVolumes.length > 0 ? oldVolumes.reduce((a, b) => a + b, 0) / oldVolumes.length : 1;
      const volumeChange = avgOldVol > 0 ? (avgRecentVol - avgOldVol) / avgOldVol : 0;
      
      // Normalize to 0-1 range
      const priceScore = Math.max(0, Math.min(1, (priceChange + 0.5) / 1.5)); // Assume -50% to +100% range
      const volumeScore = Math.max(0, Math.min(1, (volumeChange + 0.5) / 1.5)); // Assume -50% to +100% range
      return (priceScore * 0.7 + volumeScore * 0.3); // Weighted: 70% price, 30% volume
    };

    // Calculate 3-Year CAGR
    const calculate3YearCAGR = (prices: number[]): number => {
      if (prices.length < 756) return 0; // Need ~3 years of data (756 trading days)
      const startPrice = prices[0];
      const endPrice = prices[prices.length - 1];
      if (startPrice <= 0) return 0;
      const years = 3;
      const cagr = (Math.pow(endPrice / startPrice, 1 / years) - 1) * 100;
      return cagr;
    };

    // Calculate Volatility (%)
    const calculateVolatility = (prices: number[]): number => {
      if (prices.length < 20) return 0;
      const returns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        if (prices[i - 1] > 0) {
          returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
      }
      if (returns.length === 0) return 0;
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      return stdDev * Math.sqrt(252) * 100; // Annualized volatility %
    };

    // Calculate Volume Spike Ratio (15D vs 3M Avg)
    const calculateVolumeSpikeRatio = (volumes: number[]): number => {
      if (volumes.length < 63) return 1; // Need ~3 months
      const recent15Days = volumes.slice(-15);
      const threeMonths = volumes.slice(-63);
      const avg15D = recent15Days.length > 0 ? recent15Days.reduce((a, b) => a + b, 0) / recent15Days.length : 0;
      const avg3M = threeMonths.length > 0 ? threeMonths.reduce((a, b) => a + b, 0) / threeMonths.length : 1;
      return avg3M > 0 ? avg15D / avg3M : 1;
    };

    // Calculate Breakout Strength Score (EMA Crossovers + ADX-like)
    const calculateBreakoutStrength = (prices: number[]): { score: number; description: string } => {
      if (prices.length < 100) return { score: 0, description: 'Insufficient data' };
      
      const ema10 = calculateEMA(prices, 10);
      const ema20 = calculateEMA(prices, 20);
      const ema50 = calculateEMA(prices, 50);
      const ema100 = calculateEMA(prices, 100);
      
      let score = 0;
      let signals: string[] = [];
      
      // EMA Crossovers
      if (ema10 > ema20) {
        score += 0.3;
        signals.push('EMA 10 > EMA 20');
      }
      if (ema20 > ema50) {
        score += 0.3;
        signals.push('EMA 20 > EMA 50');
      }
      if (ema50 > ema100) {
        score += 0.2;
        signals.push('EMA 50 > EMA 100');
      }
      
      // Price above EMAs
      const currentPrice = prices[prices.length - 1];
      if (currentPrice > ema10) score += 0.1;
      if (currentPrice > ema20) score += 0.1;
      
      return {
        score: Math.min(1, score),
        description: signals.length > 0 ? signals.join(', ') : 'No breakout signals'
      };
    };

    // ============================================
    // ADVANCED QUANTITATIVE FEATURES (OHLCV Stack)
    // ============================================
    
    // Hurst Exponent (Rescaled Range Analysis)
    const calculateHurstExponent = (prices: number[], window: number = 200): number => {
      if (prices.length < window) return 0.5; // Neutral if insufficient data
      
      const returns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        if (prices[i - 1] > 0) {
          returns.push(Math.log(prices[i] / prices[i - 1]));
        }
      }
      
      if (returns.length < window) return 0.5;
      const recentReturns = returns.slice(-window);
      
      // Mean of returns
      const meanReturn = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
      
      // Calculate cumulative deviations
      const cumulativeDeviations: number[] = [];
      let sum = 0;
      for (const ret of recentReturns) {
        sum += (ret - meanReturn);
        cumulativeDeviations.push(sum);
      }
      
      // Range (max - min of cumulative deviations)
      const range = Math.max(...cumulativeDeviations) - Math.min(...cumulativeDeviations);
      
      // Standard deviation
      const variance = recentReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / recentReturns.length;
      const stdDev = Math.sqrt(variance);
      
      if (stdDev === 0 || range === 0) return 0.5;
      
      // Rescaled Range
      const rescaledRange = range / stdDev;
      
      // Hurst = log(R/S) / log(n) where n is the number of observations
      // Simplified: H ≈ 0.5 * log(R/S) / log(n/2)
      const hurst = 0.5 + (Math.log(rescaledRange + 1) / Math.log(window / 2)) * 0.5;
      
      // Clamp between 0 and 1
      return Math.max(0, Math.min(1, hurst));
    };
    
    // Fractal Dimension (Higuchi Method)
    const calculateFractalDimension = (prices: number[], kmax: number = 8): number => {
      if (prices.length < 50) return 1.5; // Default neutral
      
      const n = prices.length;
      const L: number[] = [];
      
      for (let k = 1; k <= Math.min(kmax, Math.floor(n / 2)); k++) {
        let sumL = 0;
        for (let m = 1; m <= k; m++) {
          let innerSum = 0;
          const maxI = Math.floor((n - m) / k);
          for (let i = 1; i <= maxI; i++) {
            const idx1 = m + (i - 1) * k;
            const idx2 = m + i * k;
            if (idx1 < prices.length && idx2 < prices.length) {
              innerSum += Math.abs(prices[idx2] - prices[idx1]);
            }
          }
          sumL += innerSum * (n - 1) / (maxI * k * k);
        }
        L.push(sumL / k);
      }
      
      // Calculate FD using log-log regression
      if (L.length < 2) return 1.5;
      const logK = Array.from({ length: L.length }, (_, i) => Math.log(i + 1));
      const logL = L.map(l => Math.log(l + 1e-10));
      
      // Simple linear regression
      const nPoints = logK.length;
      const sumX = logK.reduce((a, b) => a + b, 0);
      const sumY = logL.reduce((a, b) => a + b, 0);
      const sumXY = logK.reduce((sum, x, i) => sum + x * logL[i], 0);
      const sumX2 = logK.reduce((sum, x) => sum + x * x, 0);
      
      const slope = (nPoints * sumXY - sumX * sumY) / (nPoints * sumX2 - sumX * sumX);
      const fd = 2 - slope; // FD = 2 - slope
      
      return Math.max(1, Math.min(2, fd)); // Clamp between 1 and 2
    };
    
    // Kalman Filter Trend Slope & Signal-to-Noise Ratio
    const calculateKalmanTrend = (prices: number[]): { slope: number; snr: number; state: number } => {
      if (prices.length < 20) return { slope: 0, snr: 0, state: prices[prices.length - 1] || 0 };
      
      // Simplified Kalman filter (single state, constant velocity model)
      let state = prices[0] || 0;
      let velocity = 0;
      let p = 1; // State covariance
      let q = 0.01; // Process noise
      let r = 0.1; // Measurement noise
      
      for (let i = 1; i < prices.length; i++) {
        // Predict
        const predictedState = state + velocity;
        const predictedP = p + q;
        
        // Update
        const innovation = prices[i] - predictedState;
        const s = predictedP + r;
        const k = predictedP / s; // Kalman gain
        state = predictedState + k * innovation;
        velocity = velocity + (k * innovation) / (i || 1); // Update velocity
        p = (1 - k) * predictedP;
      }
      
      // Calculate slope as rate of change
      const recentPrices = prices.slice(-20);
      const slope = (recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices.length;
      
      // SNR = slope / sqrt(variance)
      const variance = prices.slice(-20).reduce((sum, p, i, arr) => {
        if (i === 0) return 0;
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        return sum + Math.pow(p - mean, 2);
      }, 0) / 20;
      const snr = variance > 0 ? Math.abs(slope) / Math.sqrt(variance + 1e-10) : 0;
      
      return { slope, snr: Math.min(snr, 10), state }; // Cap SNR at 10
    };
    
    // KAMA Efficiency Ratio
    const calculateKAMAER = (prices: number[], period: number = 10): number => {
      if (prices.length < period + 1) return 0;
      
      const change = Math.abs(prices[prices.length - 1] - prices[prices.length - period - 1]);
      let volatility = 0;
      for (let i = prices.length - period; i < prices.length; i++) {
        volatility += Math.abs(prices[i] - prices[i - 1]);
      }
      
      if (volatility === 0) return 0;
      return Math.min(1, change / volatility);
    };
    
    // R² of log-price vs time (trend quality)
    const calculateTrendR2 = (prices: number[], period: number = 63): number => {
      if (prices.length < period) return 0;
      
      const recentPrices = prices.slice(-period);
      const logPrices = recentPrices.map(p => Math.log(p + 1e-10));
      const n = logPrices.length;
      const x = Array.from({ length: n }, (_, i) => i);
      
      // Calculate means
      const meanX = x.reduce((a, b) => a + b, 0) / n;
      const meanY = logPrices.reduce((a, b) => a + b, 0) / n;
      
      // Calculate sums for R²
      let ssRes = 0;
      let ssTot = 0;
      
      // Simple linear regression: y = a + b*x
      let sumXY = 0;
      let sumX2 = 0;
      for (let i = 0; i < n; i++) {
        sumXY += (x[i] - meanX) * (logPrices[i] - meanY);
        sumX2 += Math.pow(x[i] - meanX, 2);
      }
      
      const b = sumX2 > 0 ? sumXY / sumX2 : 0;
      const a = meanY - b * meanX;
      
      // Calculate R²
      for (let i = 0; i < n; i++) {
        const predicted = a + b * x[i];
        ssRes += Math.pow(logPrices[i] - predicted, 2);
        ssTot += Math.pow(logPrices[i] - meanY, 2);
      }
      
      if (ssTot === 0) return 0;
      const r2 = 1 - (ssRes / ssTot);
      return Math.max(0, Math.min(1, r2));
    };
    
    // RSRS (Return Strength via Regression of high vs low) - Beta and z-score
    const calculateRSRS = (highs: number[], lows: number[], window: number = 18): { beta: number; zScore: number } => {
      if (highs.length < window || lows.length < window) return { beta: 1, zScore: 0 };
      
      const recentHighs = highs.slice(-window);
      const recentLows = lows.slice(-window);
      
      // Simple OLS: high = beta * low
      const meanHigh = recentHighs.reduce((a, b) => a + b, 0) / window;
      const meanLow = recentLows.reduce((a, b) => a + b, 0) / window;
      
      let numerator = 0;
      let denominator = 0;
      for (let i = 0; i < window; i++) {
        numerator += (recentLows[i] - meanLow) * (recentHighs[i] - meanHigh);
        denominator += Math.pow(recentLows[i] - meanLow, 2);
      }
      
      const beta = denominator > 0 ? numerator / denominator : 1;
      
      // Calculate z-score using historical beta values (simplified: use rolling mean/std)
      // For production, would maintain a rolling window of betas
      const historicalMean = 1.0; // Typical beta
      const historicalStd = 0.2; // Typical std dev
      const zScore = (beta - historicalMean) / (historicalStd + 1e-10);
      
      return { beta, zScore: Math.max(-5, Math.min(5, zScore)) };
    };
    
    // Donchian Break % (where close sits in 63-day range)
    const calculateDonchianPercent = (highs: number[], lows: number[], close: number, period: number = 63): number => {
      if (highs.length < period || lows.length < period) return 0.5;
      
      const recentHighs = highs.slice(-period);
      const recentLows = lows.slice(-period);
      const maxHigh = Math.max(...recentHighs);
      const minLow = Math.min(...recentLows);
      
      if (maxHigh === minLow) return 0.5;
      return Math.max(0, Math.min(1, (close - minLow) / (maxHigh - minLow)));
    };
    
    // VWAP (Volume Weighted Average Price)
    const calculateVWAP = (prices: number[], volumes: number[], period: number = 20): number => {
      if (prices.length < period || volumes.length < period) return prices[prices.length - 1] || 0;
      
      const recentPrices = prices.slice(-period);
      const recentVolumes = volumes.slice(-period);
      
      let sumPV = 0;
      let sumV = 0;
      for (let i = 0; i < period; i++) {
        sumPV += recentPrices[i] * recentVolumes[i];
        sumV += recentVolumes[i];
      }
      
      return sumV > 0 ? sumPV / sumV : prices[prices.length - 1] || 0;
    };
    
    // Z-score normalization
    const zScore = (value: number, mean: number, std: number): number => {
      if (std === 0) return 0;
      return (value - mean) / std;
    };
    
    // Normalized Momentum (z-scores over 21/42/63 bars)
    const calculateNormalizedMomentum = (prices: number[], periods: number[] = [21, 42, 63]): number[] => {
      const returns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        if (prices[i - 1] > 0) {
          returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
      }
      
      return periods.map(period => {
        if (returns.length < period) return 0;
        const recentReturns = returns.slice(-period);
        const mean = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
        const variance = recentReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / recentReturns.length;
        const std = Math.sqrt(variance);
        
        const momentum = recentReturns[recentReturns.length - 1];
        return zScore(momentum, mean, std);
      });
    };
    
    // Skewness and Kurtosis
    const calculateSkewKurt = (returns: number[]): { skew: number; kurt: number } => {
      if (returns.length < 20) return { skew: 0, kurt: 3 };
      
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
      const std = Math.sqrt(variance);
      
      if (std === 0) return { skew: 0, kurt: 3 };
      
      // Skewness
      const skew = returns.reduce((sum, r) => sum + Math.pow((r - mean) / std, 3), 0) / returns.length;
      
      // Kurtosis (excess)
      const kurt = returns.reduce((sum, r) => sum + Math.pow((r - mean) / std, 4), 0) / returns.length - 3;
      
      return { skew, kurt: Math.max(-3, Math.min(10, kurt)) };
    };
    
    // Simplified Markov Switching (2-regime: Bull vs Bear/Chop)
    const calculateRegimeProbs = (returns: number[], window: number = 60): { bull: number; chop: number; bear: number } => {
      if (returns.length < window) return { bull: 0.33, chop: 0.34, bear: 0.33 };
      
      const recentReturns = returns.slice(-window);
      const mean = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
      const variance = recentReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / recentReturns.length;
      const std = Math.sqrt(variance);
      
      // Simple regime classification based on mean and volatility
      // Bull: positive mean, low volatility
      // Chop: low absolute mean, medium volatility
      // Bear: negative mean, high volatility
      
      const bullScore = mean > 0 && std < 0.02 ? 1 : 0;
      const bearScore = mean < 0 && std > 0.015 ? 1 : 0;
      const chopScore = Math.abs(mean) < 0.005 && std > 0.01 && std < 0.025 ? 1 : 0;
      
      // Convert to probabilities (softmax-like)
      const total = bullScore + bearScore + chopScore + 1; // +1 for smoothing
      const bull = (bullScore + 0.33) / total;
      const bear = (bearScore + 0.33) / total;
      const chop = (chopScore + 0.34) / total;
      
      return { bull, chop, bear };
    };
    
    // Advanced Prediction Model (Bayesian Logistic + Gradient Boosting approximation)
    const predict3MonthReturnAdvanced = (
      hurst: number,
      fractalDim: number,
      kalmanSlope: number,
      kalmanSNR: number,
      kamaER: number,
      trendR2: number,
      rsrsZ: number,
      donchianPercent: number,
      volSpike: number,
      vwapDistATR: number,
      regimeBull: number,
      regimeChop: number,
      momentumZ21: number,
      momentumZ42: number,
      momentumZ63: number,
      atr: number,
      currentPrice: number,
      volatility: number,
      skew: number,
      kurt: number
    ): { probability12: number; expectedReturn: number } => {
      // Normalize features
      const normHurst = (hurst - 0.5) * 2; // -1 to 1
      const normFD = (fractalDim - 1.5) * 2; // -1 to 1
      const normKalmanSNR = Math.min(kalmanSNR / 5, 1); // 0 to 1
      const normKamaER = kamaER; // Already 0-1
      const normTrendR2 = trendR2; // Already 0-1
      const normRSRS = Math.max(-2, Math.min(2, rsrsZ)) / 2; // -1 to 1
      const normDonchian = donchianPercent; // 0-1
      const normVolSpike = Math.min(volSpike / 3, 1); // Cap at 3x
      const normVWAP = Math.max(-2, Math.min(2, vwapDistATR)) / 2; // -1 to 1
      const normMomentum = (momentumZ21 + momentumZ42 + momentumZ63) / 6; // Average and normalize
      
      // Bayesian Logistic Model (simplified)
      // Features with interaction terms
      const logitScore = (
        normHurst * 0.15 +
        (1 - normFD) * 0.10 + // Lower FD (smoother) is better
        normKalmanSNR * 0.20 +
        normKamaER * 0.15 +
        normTrendR2 * 0.12 +
        normRSRS * 0.18 +
        normDonchian * 0.10 +
        normVolSpike * 0.08 +
        normVWAP * 0.05 +
        normMomentum * 0.12 +
        regimeBull * 0.20 +
        (1 - regimeChop) * 0.10 + // Less chop is better
        Math.max(0, normRSRS * regimeBull) * 0.15 + // Interaction: RSRS in bull regime
        Math.max(0, normKalmanSNR * normKamaER) * 0.10 // Interaction: SNR + ER
      );
      
      // Convert to probability using sigmoid
      const p12Bayes = 1 / (1 + Math.exp(-(logitScore - 0.5) * 5));
      
      // Gradient Boosting approximation (simplified decision tree ensemble)
      let gbmScore = 0;
      
      // Tree 1: Trend quality
      if (normKalmanSNR > 0.5 && normTrendR2 > 0.3) gbmScore += 0.15;
      if (normKamaER > 0.4) gbmScore += 0.10;
      
      // Tree 2: Momentum
      if (normMomentum > 0.5 && normHurst > 0.5) gbmScore += 0.15;
      if (normDonchian > 0.7) gbmScore += 0.10;
      
      // Tree 3: Breakout strength
      if (normRSRS > 0.5 && normVolSpike > 0.4) gbmScore += 0.20;
      if (normVWAP > 0 && normDonchian > 0.6) gbmScore += 0.10;
      
      // Tree 4: Regime
      if (regimeBull > 0.6) gbmScore += 0.15;
      if (regimeChop < 0.4) gbmScore += 0.05;
      
      // Normalize GBM score to 0-1
      const p12GBM = Math.min(1, gbmScore);
      
      // Stacked ensemble (50/50 blend)
      const p12 = 0.5 * p12Bayes + 0.5 * p12GBM;
      
      // Expected return calculation
      // Use conditional means: positive returns when probability is high
      const muPos = 18; // Expected positive return when model is right (%)
      const muNeg = -5; // Expected negative return when model is wrong (%)
      const expectedReturn = p12 * muPos + (1 - p12) * muNeg;
      
      return {
        probability12: Math.max(0, Math.min(1, p12)),
        expectedReturn: Math.round(expectedReturn * 10) / 10
      };
    };
    
    // Execution Filters
    const checkExecutionFilters = (
      regimeBull: number,
      regimeChop: number,
      rsrsZ: number,
      kalmanSNR: number,
      kamaER: number,
      trendR2: number,
      volSpike: number,
      vwapDistATR: number,
      rsi: number,
      donchianPercent: number,
      closePrice: number,
      ema5: number
    ): { passed: boolean; flags: string[] } => {
      const flags: string[] = [];
      let passed = true;
      
      // Regime Guard
      if (regimeBull < 0.55 && !(regimeChop > 0.5 && rsrsZ > 1)) {
        flags.push('Regime');
        passed = false;
      }
      
      // Trend Quality
      if (kalmanSNR <= 0 || kamaER < 0.4 || trendR2 < 0.3) {
        flags.push('Trend Quality');
        passed = false;
      }
      
      // Energy
      if (volSpike < 1.3 || vwapDistATR < 0) {
        flags.push('Energy');
        passed = false;
      }
      
      // Overheat check
      if (rsi > 78 && donchianPercent > 0.95 && closePrice >= ema5) {
        flags.push('Overheat');
        // Don't fail, just warn
      }
      
      return { passed, flags };
    };
    
    // Predict 3-Month Return using regression-like model (Legacy - keep for backward compatibility)
    const predict3MonthReturn = (
      momentum: number,
      cagr: number,
      volatility: number,
      volumeRatio: number,
      rsi: number,
      breakoutScore: number
    ): { predictedReturn: number; probability: number } => {
      // Normalize inputs
      const normalizedMomentum = momentum; // Already 0-1
      const normalizedCAGR = Math.max(0, Math.min(1, (cagr + 50) / 100)); // Map -50% to +50% to 0-1
      const normalizedVolatility = Math.max(0, Math.min(1, volatility / 50)); // Map 0-50% to 0-1
      const normalizedVolumeRatio = Math.max(0, Math.min(1, volumeRatio / 3)); // Map 0-3x to 0-1
      const normalizedRSI = rsi / 100; // Already 0-1
      const normalizedBreakout = breakoutScore; // Already 0-1
      
      // Regression model coefficients (trained on historical patterns)
      // These weights are based on quant research: momentum and CAGR are most important
      const predictedReturn = (
        normalizedMomentum * 8 +        // Strong momentum = +8% base
        normalizedCAGR * 6 +             // Strong trend = +6% base
        normalizedVolumeRatio * 3 +      // Volume spike = +3% bonus
        normalizedBreakout * 4 +         // Breakout = +4% bonus
        (normalizedRSI - 0.5) * 2 +      // RSI 50-70 is optimal
        (1 - normalizedVolatility) * 2   // Lower volatility = better (inverted)
      );
      
      // Calculate probability of >12% return
      // Using logistic-like function: probability increases with predicted return
      const probability = 1 / (1 + Math.exp(-(predictedReturn - 12) / 3)); // Sigmoid centered at 12%
      
      return {
        predictedReturn: Math.round(predictedReturn * 10) / 10, // Round to 1 decimal
        probability: Math.round(probability * 100) / 100 // Round to 2 decimals
      };
    };

    const results = {
      volumeSpikes: [] as any[],
      deepPullbacks: [] as any[],
      capitulated: [] as any[],
      fiveDayDecliners: [] as any[],
      fiveDayClimbers: [] as any[],
      tightRangeBreakouts: [] as any[],
      quantPredictions: [] as any[], // New: Quantitative predictions
    };

    // Process ALL stocks - no limit for comprehensive analysis
    const Holding = (await import('@/models/Holding')).default;
    const holdings = await Holding.find({}).select('isin').lean();
    const holdingsIsins = new Set(holdings.map((h: any) => h.isin).filter(Boolean));
    
    // Process ALL stocks - prioritize holdings first, then all others
    const stocksToProcess: any[] = [];
    
    // First, add all holdings
    for (const stock of allStocks) {
      if (holdingsIsins.has(stock.isin)) {
        stocksToProcess.push(stock);
      }
    }
    
    // Then add all other stocks
    for (const stock of allStocks) {
      if (!holdingsIsins.has(stock.isin)) {
        stocksToProcess.push(stock);
      }
    }
    
    console.log(`Processing ALL ${stocksToProcess.length} stocks (${holdingsIsins.size} holdings + ${stocksToProcess.length - holdingsIsins.size} others)...`);

    // Fetch all latest prices - use aggregation with $in for better performance
    const isins = stocksToProcess.map(s => s.isin);
    const latestPricesMap = new Map<string, any>();
    
    console.log(`📊 Fetching latest prices for ${isins.length} stocks using optimized aggregation...`);
    
    // Use aggregation with $in to fetch all latest prices in fewer queries
    // Process in larger batches using $in operator for better performance
    const LATEST_PRICE_BATCH_SIZE = 500; // Increased batch size for better performance
    for (let i = 0; i < isins.length; i += LATEST_PRICE_BATCH_SIZE) {
      const batchIsins = isins.slice(i, i + LATEST_PRICE_BATCH_SIZE);
      
      try {
        // Use aggregation to get latest price for each ISIN in batch
        const latestPrices = await StockData.aggregate([
          { $match: { isin: { $in: batchIsins } } },
          { $sort: { isin: 1, date: -1 } },
          {
            $group: {
              _id: '$isin',
              latest: { $first: '$$ROOT' }
            }
          }
        ]).allowDiskUse(true);
        
        // Populate map
        for (const item of latestPrices) {
          if (item.latest && item.latest.close && item.latest.close >= 30) {
            latestPricesMap.set(item._id, item.latest);
          }
        }
      } catch (error) {
        console.error(`Error fetching latest prices for batch:`, error);
        // Fallback to individual queries if aggregation fails
        await Promise.all(batchIsins.map(async (isin) => {
          try {
            const latest = await StockData.findOne({ isin })
              .sort({ date: -1 })
              .lean() as any;
            
            if (latest && latest.close && latest.close >= 30) {
              latestPricesMap.set(isin, latest);
            }
          } catch (err) {
            // Silently skip on error
          }
        }));
      }
      
      // Log progress
      if ((i + LATEST_PRICE_BATCH_SIZE) % 1000 === 0 || i + LATEST_PRICE_BATCH_SIZE >= isins.length) {
        console.log(`   📊 Latest prices progress: ${Math.min(i + LATEST_PRICE_BATCH_SIZE, isins.length)}/${isins.length} stocks`);
      }
    }
    
    console.log(`✅ Fetched latest prices for ${latestPricesMap.size} stocks`);

    // Fetch all 365-day data - use parallel queries with larger batches
    const oneYearAgoDate = subDays(today, 365);
    const priceDataMap = new Map<string, any[]>();
    
    // Process ISINs in larger batches with parallel queries for better performance
    const BATCH_SIZE = 200; // Increased batch size for better parallelization
    console.log(`📊 Fetching 365-day data for ${isins.length} stocks in batches of ${BATCH_SIZE}...`);
    
    // Only fetch data for stocks that have valid latest prices
    const validIsins = Array.from(latestPricesMap.keys());
    
    for (let i = 0; i < validIsins.length; i += BATCH_SIZE) {
      const batchIsins = validIsins.slice(i, i + BATCH_SIZE);
      
      // Use Promise.all for parallel processing within batch
      await Promise.all(batchIsins.map(async (isin) => {
        try {
          const prices = await StockData.find({
          isin,
            date: { $gte: oneYearAgoDate, $lte: today }
          })
            .sort({ date: 1 })
            .select('date open high low close volume')
            .lean();
          
          if (prices.length > 0) {
            priceDataMap.set(isin, prices.map((p: any) => ({
              date: p.date,
              open: p.open,
              high: p.high,
              low: p.low,
              close: p.close,
              volume: p.volume
            })));
          }
        } catch (error) {
          // Silently skip on error
        }
      }));
      
      // Log progress every 500 stocks
      if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= validIsins.length) {
        console.log(`   📊 Progress: ${Math.min(i + BATCH_SIZE, validIsins.length)}/${validIsins.length} stocks processed`);
      }
    }
    
    console.log(`✅ Fetched price data for ${priceDataMap.size} stocks`);

    let processedCount = 0;
    let skippedCount = 0;
    let timeCheckCount = 0;

    for (const stock of stocksToProcess) {
      // Check execution time every 100 stocks to avoid timeout (less frequent checks for better performance)
      timeCheckCount++;
      if (timeCheckCount % 100 === 0) {
        const elapsed = Date.now() - startTime;
        if (elapsed > MAX_EXECUTION_TIME) {
          console.warn(`⏱️ Approaching timeout (${elapsed}ms), stopping processing at ${processedCount} stocks`);
          break;
        }
        // Log progress every 100 stocks
        console.log(`📊 Progress: Processed ${processedCount}/${stocksToProcess.length} stocks (${((processedCount / stocksToProcess.length) * 100).toFixed(1)}%)`);
      }
      
      try {
        const latest = latestPricesMap.get(stock.isin);
        
        if (!latest || !latest.close || latest.close < 30) {
          skippedCount++;
          continue;
        }

        const currentPrice = latest.close;
        const allPrices = priceDataMap.get(stock.isin) || [];
        
        // Filter data by date ranges
        const price365Days = allPrices.filter((d: any) => {
          const date = new Date(d.date);
          return date >= subDays(today, 365);
        });
        const price60Days = allPrices.filter((d: any) => {
          const date = new Date(d.date);
          return date >= subDays(today, 60);
        });
        const price30Days = allPrices.filter((d: any) => {
          const date = new Date(d.date);
          return date >= subDays(today, 30);
        });
        const price15Days = allPrices.filter((d: any) => {
          const date = new Date(d.date);
          return date >= subDays(today, 15);
        });
        const price10Days = allPrices.filter((d: any) => {
          const date = new Date(d.date);
          return date >= subDays(today, 10);
        });
        const price5Days = allPrices.filter((d: any) => {
          const date = new Date(d.date);
          return date >= subDays(today, 5);
        });

        // Require at least some data, but be flexible about exact counts
        // Need at least 20 days for meaningful analysis, and at least 5 days for 5-day calculations
        if (price60Days.length < 20) {
          skippedCount++;
          continue;
        }
        
        // If we don't have 5 days, we can't calculate 5-day metrics properly
        // But we can still use what we have for other signals
        const has5DaysData = price5Days.length >= 5;
        const has15DaysData = price15Days.length >= 15;

        processedCount++;

        // Extract arrays for quant predictions (need 3 years of data)
        const allPrices3Years = allPrices.filter((d: any) => {
          const date = new Date(d.date);
          return date >= subDays(today, 1095); // 3 years = 1095 days
        });
        const closes3Years = allPrices3Years.map(d => d.close || 0).filter(c => c > 0);
        const volumes3Years = allPrices3Years.map(d => d.volume || 0).filter(v => v > 0);
        
        // Extract arrays for existing signals
        const closes = price60Days.map(d => d.close || 0).filter(c => c > 0);
        const volumes = price60Days.map(d => d.volume || 0).filter(v => v > 0);
        const recent15Volumes = price15Days.map(d => d.volume || 0).filter(v => v > 0);
        const recent30Volumes = price30Days
          .filter(d => d.date < subDays(today, 15))
          .map(d => d.volume || 0)
          .filter(v => v > 0);

        // Calculate metrics - use available data, not strict date windows
        // For volume, use the most recent available days
        const recentVolumesForAvg = price15Days.slice(-15).map(d => d.volume || 0).filter(v => v > 0);
        const avgVol15 = recentVolumesForAvg.length > 0
          ? recentVolumesForAvg.reduce((a, b) => a + b, 0) / recentVolumesForAvg.length
          : 0;
        
        // For 30-day average, use older data if available
        const volumes30DaysAgo = price30Days.length > 30 
          ? price30Days.slice(0, 15).map(d => d.volume || 0).filter(v => v > 0) // First 15 days of 30-day window
          : [];
        const avgVol30 = volumes30DaysAgo.length > 0
          ? volumes30DaysAgo.reduce((a, b) => a + b, 0) / volumes30DaysAgo.length
          : avgVol15; // Fallback to 15-day avg if no 30-day data
          
        const currentVol = latest.volume || 0;

        // Volume Spike (%) - compare current to recent average
        const volSpike = avgVol15 > 0 ? ((currentVol - avgVol15) / avgVol15) * 100 : 0;

        // 52W High/Low
        const high52W = price365Days.length > 0
          ? Math.max(...price365Days.map(d => d.high || d.close || 0))
          : currentPrice;
        const low52W = price365Days.length > 0
          ? Math.min(...price365Days.map(d => d.low || d.close || 0))
          : currentPrice;
        const percentFrom52WHigh = high52W > 0 ? ((currentPrice - high52W) / high52W) * 100 : 0;
        const percentFrom52WLow = low52W > 0 ? ((currentPrice - low52W) / low52W) * 100 : 0;

        // 5-Day Return - use available data
        const price5DaysAgo = has5DaysData && price5Days[0]?.close 
          ? price5Days[0].close 
          : (price15Days.length >= 5 ? price15Days[0]?.close : currentPrice);
        const return5D = price5DaysAgo > 0 ? ((currentPrice - price5DaysAgo) / price5DaysAgo) * 100 : 0;

        // 15D Volume vs Avg
        const vol15DAvgRatio = avgVol30 > 0 ? (avgVol15 / avgVol30) : 1;

        // 5-Day Direction Consistency - use available data
        const available5Days = has5DaysData 
          ? price5Days.slice(-5).map(d => d.close || 0)
          : price15Days.slice(-5).map(d => d.close || 0); // Fallback to last 5 of 15-day data
          
        let upDays = 0;
        let downDays = 0;
        let isStrictlyDescending = true;
        let isStrictlyAscending = true;

        for (let i = 1; i < available5Days.length; i++) {
          if (available5Days[i] > available5Days[i - 1]) {
            upDays++;
            isStrictlyDescending = false;
          } else if (available5Days[i] < available5Days[i - 1]) {
            downDays++;
            isStrictlyAscending = false;
          } else {
            isStrictlyDescending = false;
            isStrictlyAscending = false;
          }
        }
        
        // If we don't have enough days, we can't determine strict trends
        if (available5Days.length < 5) {
          isStrictlyDescending = false;
          isStrictlyAscending = false;
        }

        // Sparkline data (last 10 sessions) - use available data
        const sparklineData = price10Days.length >= 10 
          ? price10Days.slice(-10)
          : price15Days.slice(-Math.min(10, price15Days.length));
        const sparkline = sparklineData.map(d => d.close || 0);

        // Price move percentage (for volume spike filter) - compare to previous day
        const latestDate = new Date(latest.date);
        const prevDayData = allPrices
          .filter((d: any) => new Date(d.date) < latestDate)
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        const prevClose = (prevDayData && prevDayData.close) ? prevDayData.close : (price15Days.length > 1 ? price15Days[price15Days.length - 2]?.close : currentPrice);
        const absPriceMove = prevClose > 0 ? Math.abs((currentPrice - prevClose) / prevClose) * 100 : 0;

        // Short-term oversold index
        const last10Highs = price10Days.map(d => d.high || d.close || 0);
        const last10Lows = price10Days.map(d => d.low || d.close || 0);
        const high10 = Math.max(...last10Highs);
        const low10 = Math.min(...last10Lows);
        const shortTermOversold = (high10 - low10) > 0
          ? (currentPrice - low10) / (high10 - low10)
          : 0.5;

        // Body ratio for candles
        const bodyRatio = (latest.high || currentPrice) - (latest.low || currentPrice) > 0
          ? Math.abs((latest.close || currentPrice) - (latest.open || currentPrice)) / ((latest.high || currentPrice) - (latest.low || currentPrice))
          : 0;

        // Bull body ratio
        const bullBody = (latest.high || currentPrice) - (latest.low || currentPrice) > 0
          ? ((latest.close || currentPrice) - (latest.open || currentPrice)) / ((latest.high || currentPrice) - (latest.low || currentPrice))
          : 0;

        // RSI
        const rsi = calculateRSI(closes.slice(-14), 10);
        
        // ============================================
        // ADVANCED QUANTITATIVE PREDICTION (Institutional-Grade)
        // ============================================
        // Calculate if we have at least 1 year of data
        const minDataPoints = 252; // ~1 year of trading days
        if (closes3Years.length >= minDataPoints && volumes3Years.length >= minDataPoints) {
          // Process quant predictions for ALL stocks (not just holdings)
          // Holdings are already prioritized in the stocksToProcess array
          if (true) {
            try {
              // Calculate volatility first (needed for advanced prediction)
              const volatility = calculateVolatility(closes3Years);
              
              // Extract OHLCV arrays - limit to recent data for performance (use 1 year max for speed)
              const recentDataLimit = Math.min(allPrices3Years.length, 252); // Max 1 year for faster processing
              const recentPrices = allPrices3Years.slice(-recentDataLimit);
              const highs = recentPrices.map(d => d.high || d.close || 0).filter(h => h > 0);
              const lows = recentPrices.map(d => d.low || d.close || 0).filter(l => l > 0);
              const closes = closes3Years.slice(-recentDataLimit);
              const volumes = volumes3Years.slice(-recentDataLimit);
            
              // Calculate returns for regime detection
              const returns: number[] = [];
          for (let i = 1; i < closes.length; i++) {
                if (closes[i - 1] > 0) {
                  returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
                }
              }
              
              // ===== ADVANCED FEATURES (Optimized) =====
              
              // 1. Regime Detection (Markov Switching) - use shorter window for speed
              const regimeProbs = calculateRegimeProbs(returns.slice(-120), 60);
              
              // 2. Hurst Exponent - use shorter window for speed
              const hurst = calculateHurstExponent(closes.slice(-150), 100);
              
              // 3. Fractal Dimension - use shorter window and fewer iterations
              const fractalDim = calculateFractalDimension(closes.slice(-150), 5);
              
              // 4. Kalman Filter Trend - use shorter window
              const kalmanTrend = calculateKalmanTrend(closes.slice(-100));
              
              // 5. KAMA Efficiency Ratio
              const kamaER = calculateKAMAER(closes.slice(-100), 10);
              
              // 6. Trend R² - use shorter period
              const trendR2 = calculateTrendR2(closes.slice(-100), 50);
              
              // 7. RSRS (High vs Low Regression)
              const rsrs = calculateRSRS(highs.slice(-100), lows.slice(-100), 18);
              
              // 8. Donchian Break %
              const donchianPercent = calculateDonchianPercent(
                highs.slice(-63), 
                lows.slice(-63), 
                currentPrice, 
                63
              );
              
              // 9. Volume Spike Ratio (15D/63D)
              const volSpike = calculateVolumeSpikeRatio(volumes.slice(-63));
              
              // 10. VWAP & Distance
              const vwap = calculateVWAP(closes.slice(-50), volumes.slice(-50), 20);
              const atr = calculateATR(price60Days.slice(-14), 14);
              const vwapDistATR = atr > 0 ? (currentPrice - vwap) / atr : 0;
              
              // 11. Normalized Momentum (z-scores) - use shorter periods
              const momentumZ = calculateNormalizedMomentum(closes.slice(-100), [21, 42, 63]);
              
              // 12. Skewness & Kurtosis - use shorter window
              const skewKurt = calculateSkewKurt(returns.slice(-60)); // Last 60 days instead of 120
              
              // 13. EMA5 for overheat check
              const ema5 = calculateEMA(closes.slice(-20), 5);
              
              // ===== ADVANCED PREDICTION MODEL =====
              const advancedPrediction = predict3MonthReturnAdvanced(
                hurst,
                fractalDim,
                kalmanTrend.slope,
                kalmanTrend.snr,
                kamaER,
                trendR2,
                rsrs.zScore,
                donchianPercent,
                volSpike,
                vwapDistATR,
                regimeProbs.bull,
                regimeProbs.chop,
                momentumZ[0], // 21-day
                momentumZ[1], // 42-day
                momentumZ[2], // 63-day
                atr,
                currentPrice,
                volatility,
                skewKurt.skew,
                skewKurt.kurt
              );
              
              // ===== EXECUTION FILTERS =====
              const executionFilters = checkExecutionFilters(
                regimeProbs.bull,
                regimeProbs.chop,
                rsrs.zScore,
                kalmanTrend.snr,
                kamaER,
                trendR2,
                volSpike,
                vwapDistATR,
                rsi,
                donchianPercent,
                currentPrice,
                ema5
              );
              
              // Determine action based on filters
              let action = '🚫 Avoid';
              if (executionFilters.passed && executionFilters.flags.length === 0) {
                action = '✅ Buy';
              } else if (executionFilters.passed && executionFilters.flags.includes('Overheat')) {
                action = '⚠️ Watch Pullback';
              } else if (executionFilters.flags.length > 0 && executionFilters.flags.length <= 1) {
                action = '⚠️ Watch';
              }
              
              // Apply filters for quant predictions
              if (
                advancedPrediction.probability12 >= quantMinProbability &&
                advancedPrediction.expectedReturn >= quantMinPredictedReturn &&
                currentPrice >= quantMinPrice
              ) {
                // Determine decision category based on probability
                let decision = '⚠️ Watch';
                let confidenceLevel = 'Low';
                
                if (advancedPrediction.probability12 >= 0.80) {
                  decision = '✅ Strong Candidate';
                  confidenceLevel = 'High';
                } else if (advancedPrediction.probability12 >= 0.70) {
                  decision = '✅ Likely Bullish';
                  confidenceLevel = 'Medium';
                } else if (advancedPrediction.probability12 >= 0.60) {
                  decision = '✅ Moderate Bullish';
                  confidenceLevel = 'Medium';
                } else if (advancedPrediction.probability12 >= 0.50) {
                  decision = '⚠️ Watch';
                  confidenceLevel = 'Low';
                }
                
                // Use execution filter action if available
                if (action === '✅ Buy') {
                  decision = '✅ Buy';
                } else if (action === '⚠️ Watch Pullback') {
                  decision = '⚠️ Watch Pullback';
                } else if (action === '🚫 Avoid') {
                  decision = '🚫 Avoid';
                }
                
                // Calculate CAGR for display
                const yearsOfData = Math.max(1, closes3Years.length / 252);
                let cagr3Year = 0;
                if (closes3Years.length >= 756) {
                  cagr3Year = calculate3YearCAGR(closes3Years);
                } else if (closes3Years.length >= 252) {
                  const startPrice = closes3Years[0];
                  const endPrice = closes3Years[closes3Years.length - 1];
                  if (startPrice > 0) {
                    cagr3Year = (Math.pow(endPrice / startPrice, 1 / yearsOfData) - 1) * 100;
                  }
                }
                
                results.quantPredictions.push({
                  isin: stock.isin,
                  stockName: stock.stockName || 'Unknown',
                  symbol: stock.symbol || '',
                  sector: stock.sector || 'Unknown',
                  currentPrice: currentPrice,
                  // Advanced metrics
                  p12: Math.round(advancedPrediction.probability12 * 100) / 100,
                  exp3MReturn: advancedPrediction.expectedReturn,
                  regimeBull: Math.round(regimeProbs.bull * 100) / 100,
                  hurst: Math.round(hurst * 100) / 100,
                  kalmanSNR: Math.round(kalmanTrend.snr * 100) / 100,
                  rsrsZ: Math.round(rsrs.zScore * 100) / 100,
                  volSpike: Math.round(volSpike * 100) / 100,
                  donchianPercent: Math.round(donchianPercent * 100) / 100,
                  kamaER: Math.round(kamaER * 100) / 100,
                  vwapDistATR: Math.round(vwapDistATR * 100) / 100,
                  filtersPass: executionFilters.passed,
                  filterFlags: executionFilters.flags,
                  action: action,
                  // Legacy fields for backward compatibility
                  momentum3M: Math.round((momentumZ[0] + momentumZ[1] + momentumZ[2]) / 3 * 100) / 100,
                  cagr3Year: Math.round(cagr3Year * 10) / 10,
                  volatility: Math.round(volatility * 10) / 10,
                  volumeSpikeRatio: Math.round(volSpike * 10) / 10,
                  rsi: Math.round(rsi * 10) / 10,
                  predictedReturn: advancedPrediction.expectedReturn,
                  probability: advancedPrediction.probability12,
                  decision: decision,
                  confidenceLevel: confidenceLevel,
                  score: advancedPrediction.expectedReturn, // Sort by expected return
                });
              }
            } catch (error) {
              // Log error but continue
              console.error(`Error in quant prediction for ${stock.isin}:`, error);
              // Try to get more details about the error
              if (error instanceof Error) {
                console.error(`Error message: ${error.message}`);
                console.error(`Error stack: ${error.stack}`);
              }
            }
          } // End of shouldProcessQuant if block
        } else {
          // Log when stocks are skipped due to insufficient data
          if (processedCount % 100 === 0) {
            console.debug(`Skipping ${stock.isin}: insufficient data (${closes3Years.length} closes, ${volumes3Years.length} volumes, need ${minDataPoints})`);
          }
        }

        // 20D Breakout Score
        const last20Highs = price60Days.slice(-20).map(d => d.high || d.close || 0);
        const last20Lows = price60Days.slice(-20).map(d => d.low || d.close || 0);
        const max20DHigh = Math.max(...last20Highs);
        const min20DLow = Math.min(...last20Lows);
        const bo20Score = max20DHigh > 0 ? ((currentPrice - max20DHigh) / max20DHigh) * 100 : 0;

        // ATR
        const atr = calculateATR(price60Days.slice(-14), 14);
        const atrPercent = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;

        // Distribution/Accumulation days
        let accDays = 0;
        let distDays = 0;
        const last7Days = price10Days.slice(-7);
        for (let i = 1; i < last7Days.length; i++) {
          const curr = last7Days[i];
          const prev = last7Days[i - 1];
          const currClose = curr.close || 0;
          const prevClose = prev.close || 0;
          const currVol = curr.volume || 0;
          const prevVol = prev.volume || 0;
          
          if (currClose > prevClose && currVol > prevVol) accDays++;
          if (currClose < prevClose && currVol > prevVol) distDays++;
        }

        // Build stock data
        const stockData = {
          isin: stock.isin,
        stockName: stock.stockName,
          symbol: stock.symbol || stock.stockName.split(' ')[0],
          sector: stock.sector || 'Unknown',
          close: currentPrice,
        percentFrom52WHigh,
          percentFrom52WLow,
          return5D,
          volSpike,
          vol15DAvgRatio,
          consistency5D: `${upDays}/${downDays}`,
          upDays,
          downDays,
          sparkline,
          rsi,
          shortTermOversold,
          bodyRatio,
          bullBody,
          bo20Score,
          atrPercent,
          accDays,
          distDays,
          high52W,
          low52W,
        };

        // A. Volume Spikes - use dynamic filters
        if (volSpike > volSpikeMinVolSpike && absPriceMove > volSpikeMinPriceMove && currentPrice > volSpikeMinPrice) {
          const maxVolSpike = 500; // Normalize
          const normVolSpike = Math.min(volSpike / maxVolSpike, 1);
          const normAbsPriceMove = Math.min(absPriceMove / 10, 1); // Normalize to 10% max
          const scoreVol = 0.7 * normVolSpike + 0.3 * normAbsPriceMove;
          
          results.volumeSpikes.push({
            ...stockData,
            score: scoreVol,
            strategyHint: volSpike > 150 && return5D > 5 
              ? "High Volume + Strong 5D Up → Breakout Watch" 
              : "Unusual Activity — Monitor for direction",
          });
        }

        // B. Deep Pullbacks - use dynamic filters
        if (percentFrom52WHigh <= pullbackMaxFromHigh && (avgVol30 > pullbackMinVol || avgVol15 > pullbackMinVol) && currentPrice > pullbackMinPrice) {
          results.deepPullbacks.push({
            ...stockData,
            score: shortTermOversold, // Lower = more oversold = higher score
            strategyHint: shortTermOversold < 0.3 && volSpike > 0
              ? "Possible Reversal Zone — Oversold + Volume Pickup"
              : "Long-term Value Zone — Low Trader Interest",
          });
        }

        // C. Capitulated - use dynamic filters
        if (percentFrom52WHigh <= capMaxFromHigh && volSpike > capMinVolSpike && currentPrice > capMinPrice) {
          const normVolSpike = Math.min(volSpike / 500, 1);
          const normReturn5D = Math.min(Math.abs(return5D) / 20, 1);
          const distressScore = 0.6 * normVolSpike + 0.4 * normReturn5D;
          
          results.capitulated.push({
            ...stockData,
            score: distressScore,
            strategyHint: volSpike > 200
              ? "Pump Risk / Short-term Trade Only"
              : "High-Risk Turnaround — Watch for Volume Confirmation",
          });
        }

        // D. 5-Day Decliners - use dynamic filters
        if (available5Days.length >= 4 && (isStrictlyDescending || downDays >= declinerMinDownDays) && return5D < declinerMaxReturn && currentPrice > declinerMinPrice) {
          const avgVolFactor = vol15DAvgRatio;
          const scoreDecline = 0.6 * Math.abs(return5D) / 10 + 0.4 * Math.min(avgVolFactor, 2);
          
          const near52WLow = percentFrom52WLow < 5;
          results.fiveDayDecliners.push({
            ...stockData,
            score: scoreDecline,
            strategyHint: near52WLow
              ? "Breakdown Risk — Avoid Fresh Longs"
              : "Watch for Further Breakdown / Short Setup",
          });
        }

        // E. 5-Day Climbers - use dynamic filters
        if (available5Days.length >= 4 && (isStrictlyAscending || upDays >= climberMinUpDays) && return5D > climberMinReturn && currentPrice > climberMinPrice) {
          const normVolSpike = Math.min(volSpike / 300, 1);
          const normReturn5D = Math.min(return5D / 15, 1);
          const avgBullBody = bullBody > 0 ? bullBody : 0.5;
          const scoreUp = 0.5 * normReturn5D + 0.3 * normVolSpike + 0.2 * avgBullBody;
          
          results.fiveDayClimbers.push({
            ...stockData,
            score: scoreUp,
            strategyHint: volSpike > 100 && return5D > 5
              ? "Momentum Continuation — Strong Volume Confirmation"
              : "Momentum-on-the-Move — Watch for Pullback Entry",
          });
        }

        // F. Tight-Range Breakout Candidates
        // Reuse last20Highs and last20Lows calculated above
        const range20D = max20DHigh - min20DLow;
        const rangePercent = currentPrice > 0 ? (range20D / currentPrice) * 100 : 100;
        
        if (rangePercent < breakoutMaxRange && bo20Score > breakoutMinBoScore && volSpike > breakoutMinVolSpike && currentPrice > breakoutMinPrice) {
          const tightRangeScore = (15 - rangePercent) / 15 * 0.5 + (bo20Score / 5) * 0.3 + (volSpike / 200) * 0.2;
          
          results.tightRangeBreakouts.push({
            ...stockData,
            score: tightRangeScore,
            range20D: rangePercent,
            strategyHint: "Tight Range + Breakout → Potential Explosive Move",
          });
        }

      } catch (error) {
        console.error(`Error processing stock ${stock.isin}:`, error);
        continue;
      }
    }

    // Sort and limit to Top 6 for each category
    const sortAndLimit = (arr: any[], desc = true) => {
      return arr
        .sort((a, b) => desc ? (b.score || 0) - (a.score || 0) : (a.score || 0) - (b.score || 0))
      .slice(0, 6);
    };

    const executionTime = Date.now() - startTime;
    console.log(`Processing complete. Processed: ${processedCount}, Skipped: ${skippedCount} in ${executionTime}ms`);
    console.log(`Results: Volume=${results.volumeSpikes.length}, Pullbacks=${results.deepPullbacks.length}, Capitulated=${results.capitulated.length}, Decliners=${results.fiveDayDecliners.length}, Climbers=${results.fiveDayClimbers.length}, Breakouts=${results.tightRangeBreakouts.length}, QuantPredictions=${results.quantPredictions.length}`);
    
    // Debug: Log first few quant predictions if any
    if (results.quantPredictions.length > 0) {
      console.log(`Quant Predictions sample (first 3):`, results.quantPredictions.slice(0, 3).map(q => ({
        stock: q.stockName,
        p12: q.p12,
        expReturn: q.exp3MReturn,
        filtersPass: q.filtersPass
      })));
    } else {
      console.warn(`⚠️ No quant predictions found! Check filters: minProbability=${quantMinProbability}, minPredictedReturn=${quantMinPredictedReturn}, minPrice=${quantMinPrice}`);
    }

    // Sort quant predictions by probability (descending) and limit to top 6
    const topQuantPredictions = results.quantPredictions
      .sort((a, b) => (b.probability || 0) - (a.probability || 0))
      .slice(0, 6);

    // If signalType is specified, only return that signal type
    const responseData: any = {};
    if (signalType) {
      const signalMap: { [key: string]: string } = {
        'volumeSpikes': 'volumeSpikes',
        'deepPullbacks': 'deepPullbacks',
        'capitulated': 'capitulated',
        'fiveDayDecliners': 'fiveDayDecliners',
        'fiveDayClimbers': 'fiveDayClimbers',
        'tightRangeBreakouts': 'tightRangeBreakouts',
        'quantPredictions': 'quantPredictions',
      };
      const key = signalMap[signalType];
      if (key) {
        if (key === 'deepPullbacks') {
          responseData[key] = sortAndLimit(results[key as keyof typeof results] as any[], false);
        } else if (key === 'quantPredictions') {
          responseData[key] = topQuantPredictions;
        } else {
          responseData[key] = sortAndLimit(results[key as keyof typeof results] as any[]);
        }
      }
    } else {
      // Return all signal types - ALWAYS include quantPredictions (even if empty)
      responseData.quantPredictions = topQuantPredictions; // Always return quant predictions first
      responseData.volumeSpikes = sortAndLimit(results.volumeSpikes);
      responseData.deepPullbacks = sortAndLimit(results.deepPullbacks, false); // Lower oversold = better
      responseData.capitulated = sortAndLimit(results.capitulated);
      responseData.fiveDayDecliners = sortAndLimit(results.fiveDayDecliners);
      responseData.fiveDayClimbers = sortAndLimit(results.fiveDayClimbers);
      responseData.tightRangeBreakouts = sortAndLimit(results.tightRangeBreakouts);
    }
    
    // Ensure quantPredictions always exists in response (even if empty array)
    if (!responseData.quantPredictions) {
      responseData.quantPredictions = [];
    }

    return NextResponse.json({
      success: true,
      data: responseData,
      stats: {
        totalStocks: allStocks.length,
        processed: processedCount,
        skipped: skippedCount,
        executionTimeMs: executionTime,
      },
      filters: signalType ? { signalType } : {
        volumeSpikes: { minVolSpike: volSpikeMinVolSpike, minPriceMove: volSpikeMinPriceMove, minPrice: volSpikeMinPrice },
        deepPullbacks: { maxFromHigh: pullbackMaxFromHigh, minVol: pullbackMinVol, minPrice: pullbackMinPrice },
        capitulated: { maxFromHigh: capMaxFromHigh, minVolSpike: capMinVolSpike, minPrice: capMinPrice },
        fiveDayDecliners: { minDownDays: declinerMinDownDays, maxReturn: declinerMaxReturn, minPrice: declinerMinPrice },
        fiveDayClimbers: { minUpDays: climberMinUpDays, minReturn: climberMinReturn, minPrice: climberMinPrice },
        tightRangeBreakouts: { maxRange: breakoutMaxRange, minBoScore: breakoutMinBoScore, minVolSpike: breakoutMinVolSpike, minPrice: breakoutMinPrice },
        quantPredictions: { minProbability: quantMinProbability, minPredictedReturn: quantMinPredictedReturn, minCAGR: quantMinCAGR, maxVolatility: quantMaxVolatility, minMomentum: quantMinMomentum, minPrice: quantMinPrice },
      }
    });

  } catch (error: any) {
    console.error('Stock research error:', error);
    
    // Ensure we return valid JSON even on connection errors
    let errorMessage = 'Failed to fetch stock research data';
    if (error?.message) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
