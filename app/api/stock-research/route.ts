import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import StockMaster from '@/models/StockMaster';
import StockData from '@/models/StockData';
import { subDays, subMonths } from 'date-fns';

export async function GET(request: NextRequest) {
  await connectDB();
  
  try {
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
    const latestRecord = await StockData.findOne({})
      .sort({ date: -1 })
      .lean() as any;
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

    const results = {
      volumeSpikes: [] as any[],
      deepPullbacks: [] as any[],
      capitulated: [] as any[],
      fiveDayDecliners: [] as any[],
      fiveDayClimbers: [] as any[],
      tightRangeBreakouts: [] as any[],
    };

    const stocksToProcess = allStocks.slice(0, 1500);
    console.log(`Processing ${stocksToProcess.length} stocks...`);

    let processedCount = 0;
    let skippedCount = 0;

    for (const stock of stocksToProcess) {
      try {
        const latest = await StockData.findOne({ isin: stock.isin })
          .sort({ date: -1 })
          .lean() as any;
        
        if (!latest || Array.isArray(latest) || !latest.close || latest.close < 30) {
          skippedCount++;
          continue;
        }

        const currentPrice = latest.close;
        const price60Days = await getRecentPrices(stock.isin, 60);
        const price30Days = await getRecentPrices(stock.isin, 30);
        const price15Days = await getRecentPrices(stock.isin, 15);
        const price10Days = await getRecentPrices(stock.isin, 10);
        const price5Days = await getRecentPrices(stock.isin, 5);
        const price365Days = await getRecentPrices(stock.isin, 365);

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

        // Extract arrays
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
        const prevDayData = await StockData.findOne({ 
          isin: stock.isin,
          date: { $lt: latest.date }
        })
        .sort({ date: -1 })
        .lean() as any;
        const prevClose = (prevDayData && !Array.isArray(prevDayData) && prevDayData.close) ? prevDayData.close : (price15Days.length > 1 ? price15Days[price15Days.length - 2]?.close : currentPrice);
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

    console.log(`Processing complete. Processed: ${processedCount}, Skipped: ${skippedCount}`);
    console.log(`Results: Volume=${results.volumeSpikes.length}, Pullbacks=${results.deepPullbacks.length}, Capitulated=${results.capitulated.length}, Decliners=${results.fiveDayDecliners.length}, Climbers=${results.fiveDayClimbers.length}, Breakouts=${results.tightRangeBreakouts.length}`);

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
      };
      const key = signalMap[signalType];
      if (key) {
        if (key === 'deepPullbacks') {
          responseData[key] = sortAndLimit(results[key as keyof typeof results] as any[], false);
        } else {
          responseData[key] = sortAndLimit(results[key as keyof typeof results] as any[]);
        }
      }
    } else {
      // Return all signal types
      responseData.volumeSpikes = sortAndLimit(results.volumeSpikes);
      responseData.deepPullbacks = sortAndLimit(results.deepPullbacks, false); // Lower oversold = better
      responseData.capitulated = sortAndLimit(results.capitulated);
      responseData.fiveDayDecliners = sortAndLimit(results.fiveDayDecliners);
      responseData.fiveDayClimbers = sortAndLimit(results.fiveDayClimbers);
      responseData.tightRangeBreakouts = sortAndLimit(results.tightRangeBreakouts);
    }

    return NextResponse.json({
      success: true,
      data: responseData,
      stats: {
        totalStocks: allStocks.length,
        processed: processedCount,
        skipped: skippedCount,
      },
      filters: signalType ? { signalType } : {
        volumeSpikes: { minVolSpike: volSpikeMinVolSpike, minPriceMove: volSpikeMinPriceMove, minPrice: volSpikeMinPrice },
        deepPullbacks: { maxFromHigh: pullbackMaxFromHigh, minVol: pullbackMinVol, minPrice: pullbackMinPrice },
        capitulated: { maxFromHigh: capMaxFromHigh, minVolSpike: capMinVolSpike, minPrice: capMinPrice },
        fiveDayDecliners: { minDownDays: declinerMinDownDays, maxReturn: declinerMaxReturn, minPrice: declinerMinPrice },
        fiveDayClimbers: { minUpDays: climberMinUpDays, minReturn: climberMinReturn, minPrice: climberMinPrice },
        tightRangeBreakouts: { maxRange: breakoutMaxRange, minBoScore: breakoutMinBoScore, minVolSpike: breakoutMinVolSpike, minPrice: breakoutMinPrice },
      }
    });

  } catch (error: any) {
    console.error('Stock research error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch stock research data' },
      { status: 500 }
    );
  }
}
