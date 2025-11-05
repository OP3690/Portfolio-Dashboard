import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import StockData from '@/models/StockData';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

interface QuantPrediction {
  isin: string;
  stockName: string;
  symbol?: string;
  currentPrice: number;
  exp3MReturn?: number;
  p12?: number;
  volatility?: number;
  regimeBull?: number;
  kalmanSNR?: number;
  filtersPass?: boolean;
  action?: string;
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const { investmentAmount, strategy = 'balanced', quantPredictions } = body;

    if (!investmentAmount || investmentAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid investment amount' },
        { status: 400 }
      );
    }

    // If quant predictions are provided, use them directly
    // Otherwise, fetch from stock research API
    let predictions: QuantPrediction[] = [];

    if (quantPredictions && Array.isArray(quantPredictions) && quantPredictions.length > 0) {
      // Use provided quant predictions
      predictions = quantPredictions.map((q: any) => ({
        isin: q.isin,
        stockName: q.stockName || 'Unknown',
        symbol: q.symbol || '',
        currentPrice: q.currentPrice || 0,
        exp3MReturn: q.exp3MReturn || q.predictedReturn || 0,
        p12: q.p12 || q.probability || 0,
        volatility: q.volatility || 0,
        regimeBull: q.regimeBull || 0,
        kalmanSNR: q.kalmanSNR || 0,
        filtersPass: q.filtersPass || false,
        action: q.action || ''
      })).filter((q: QuantPrediction) => (q.exp3MReturn || 0) > 0 && (q.p12 || 0) > 0);
    }

    // If no predictions provided or empty, fetch from database
    if (predictions.length === 0) {
      const StockMaster = (await import('@/models/StockMaster')).default;
      const allStocks = await StockMaster.find({})
        .select('isin stockName symbol sector')
        .lean();

      // Fetch quant predictions - we need to calculate them or fetch from cache
      // For now, we'll fetch stock data and calculate basic metrics

    // Get latest prices for all stocks
    const isins = allStocks.map((s: any) => s.isin);
    const latestPricesMap = new Map<string, any>();

    // Fetch latest prices in smaller batches using individual queries to avoid memory issues
    const BATCH_SIZE = 200; // Reduced batch size to avoid memory limits
    for (let i = 0; i < isins.length; i += BATCH_SIZE) {
      const batchIsins = isins.slice(i, i + BATCH_SIZE);
      
      // Use parallel individual queries instead of aggregation to avoid sort memory issues
      await Promise.all(batchIsins.map(async (isin) => {
        try {
          const latest = await StockData.findOne({ isin })
            .sort({ date: -1 })
            .lean() as any;
          
          if (latest && latest.close && latest.close >= 30) {
            latestPricesMap.set(isin, latest);
          }
        } catch (error) {
          // Silently skip on error
        }
      }));
    }

    // Fetch 63-day historical data for volatility and returns calculation
    const today = new Date();
    const sixtyThreeDaysAgo = new Date(today);
    sixtyThreeDaysAgo.setDate(today.getDate() - 63);

    const stockDataMap = new Map<string, any[]>();
    // Limit to top 500 stocks with valid prices for performance
    const validIsins = Array.from(latestPricesMap.keys()).slice(0, 500);

    // Process in smaller batches to avoid memory issues
    for (let i = 0; i < validIsins.length; i += 100) {
      const batchIsins = validIsins.slice(i, i + 100);
      
      await Promise.all(batchIsins.map(async (isin) => {
        try {
          // Use limit to reduce memory usage
          const prices = await StockData.find({
            isin,
            date: { $gte: sixtyThreeDaysAgo, $lte: today }
          })
            .sort({ date: 1 })
            .limit(63) // Limit to 63 days max
            .select('date close volume')
            .lean();

          if (prices.length >= 30) {
            stockDataMap.set(isin, prices);
          }
        } catch (error) {
          // Skip on error
        }
      }));
    }

    // Calculate metrics for each stock
    for (const stock of allStocks) {
      const latest = latestPricesMap.get(stock.isin);
      const prices = stockDataMap.get(stock.isin);

      if (!latest || !prices || prices.length < 30) continue;

      const closes = prices.map((p: any) => p.close).filter((c: number) => c > 0);
      if (closes.length < 30) continue;

      const currentPrice = latest.close;

      // Calculate volatility (63-day)
      const returns = [];
      for (let i = 1; i < closes.length; i++) {
        if (closes[i - 1] > 0) {
          returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
        }
      }
      // Calculate proper statistical metrics
      const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      const volatility = stdDev * Math.sqrt(252); // Annualized volatility
      
      // Calculate annualized return (CAGR-like)
      const startPrice = closes[0];
      const endPrice = closes[closes.length - 1];
      const periods = closes.length / 252; // Years of data
      const annualizedReturn = periods > 0 ? (Math.pow(endPrice / startPrice, 1 / periods) - 1) : 0;
      
      // Apply volatility drag (realistic return expectation)
      // Volatility drag = -0.5 * variance (geometric mean adjustment)
      const volatilityDrag = -0.5 * variance;
      const adjustedAnnualizedReturn = annualizedReturn + volatilityDrag;
      
      // Convert to 3-month return (quarterly)
      // Use mean reversion: recent momentum + long-term trend, weighted
      const recent21Days = Math.max(0, closes.length - 21);
      const recentReturn = recent21Days > 0 ? (closes[closes.length - 1] - closes[recent21Days]) / closes[recent21Days] : 0;
      const momentumWeight = 0.3; // 30% weight to recent momentum
      const trendWeight = 0.7; // 70% weight to long-term trend
      
      // 3-month return = (annualized / 4) adjusted for momentum
      const base3MReturn = (adjustedAnnualizedReturn / 4) * trendWeight;
      const momentum3MReturn = (recentReturn * 63 / 21) * momentumWeight; // Scale 21-day to 63-day
      
      // Combine with realistic caps
      let exp3MReturn = base3MReturn + momentum3MReturn;
      
      // Apply realistic caps: max 25% for 3 months (very bullish scenario)
      // Most stocks don't return >25% in 3 months consistently
      exp3MReturn = Math.max(-0.15, Math.min(0.25, exp3MReturn)); // Cap between -15% and +25%
      
      // Probability of >12% return using statistical distribution
      // Assuming normal distribution: P(return > 12%) = 1 - CDF((12% - mean) / std)
      const threeMonthVol = volatility / Math.sqrt(4); // Quarterly volatility
      const zScore = (0.12 - exp3MReturn) / (threeMonthVol + 0.01); // Add small epsilon to avoid division by zero
      // Approximate CDF using error function approximation
      const p12 = Math.max(0.05, Math.min(0.85, 0.5 * (1 - Math.tanh(zScore * 1.7))));
      
      // Regime probability based on trend and volatility
      const trendStrength = Math.abs(exp3MReturn) / (threeMonthVol + 0.01);
      const regimeBull = Math.max(0.3, Math.min(0.85, 0.5 + (exp3MReturn > 0 ? trendStrength * 0.15 : -trendStrength * 0.15)));

        predictions.push({
          isin: stock.isin,
          stockName: stock.stockName || 'Unknown',
          symbol: stock.symbol || '',
          currentPrice,
          exp3MReturn: Math.round(exp3MReturn * 10000) / 100, // Convert to percentage, round to 2 decimals
          p12: Math.round(p12 * 1000) / 1000, // Round to 3 decimals
          volatility: Math.round(volatility * 1000) / 1000, // Round to 3 decimals
          regimeBull: Math.round(regimeBull * 1000) / 1000, // Round to 3 decimals
          kalmanSNR: 0,
          filtersPass: exp3MReturn > 0.05 && p12 > 0.5, // Only pass if positive return and >50% probability
          action: exp3MReturn > 0.10 && p12 > 0.6 ? '✅ Buy' : exp3MReturn > 0.05 && p12 > 0.5 ? '⚠️ Watch' : '🚫 Avoid'
        });
      }
    }

    // Risk adjustment factor based on strategy - make it more impactful
    const lambda = strategy === 'aggressive' ? 0.2 : strategy === 'balanced' ? 0.5 : 0.8;
    
    // Strategy-specific filters and scoring weights
    const strategyConfig = {
      aggressive: {
        minReturn: 3, // Lower minimum return threshold
        minP12: 0.35, // Lower probability threshold
        returnWeight: 0.6, // Favor high returns
        riskWeight: 0.2, // Lower risk penalty
        volatilityPenalty: 0.3 // Lower volatility penalty
      },
      balanced: {
        minReturn: 5,
        minP12: 0.45,
        returnWeight: 0.5,
        riskWeight: 0.3,
        volatilityPenalty: 0.5
      },
      defensive: {
        minReturn: 4,
        minP12: 0.50,
        returnWeight: 0.35, // Lower return weight
        riskWeight: 0.45, // Higher risk penalty
        volatilityPenalty: 0.7 // Higher volatility penalty
      }
    };
    
    const config = strategyConfig[strategy as keyof typeof strategyConfig];

    // Calculate risk-adjusted scores using proper Sharpe-like metrics
    const scoredStocks = predictions
      .filter(q => q.exp3MReturn && q.p12 && q.volatility && q.regimeBull && q.exp3MReturn! > config.minReturn && q.p12! > config.minP12)
      .map(q => {
        // Expected return (already in percentage, convert to decimal)
        const expectedReturn = q.exp3MReturn! / 100;
        
        // Risk-adjusted return using Sharpe-like ratio
        const riskFreeRate = 0.06 / 4; // 6% annual risk-free rate / 4 for quarterly
        const excessReturn = expectedReturn - riskFreeRate;
        const threeMonthVol = (q.volatility! / Math.sqrt(4)) || 0.01; // Quarterly volatility
        const sharpeLike = threeMonthVol > 0 ? excessReturn / threeMonthVol : 0;
        
        // Probability-weighted expected value
        const expectedValue = expectedReturn * q.p12!;
        
        // Risk penalty based on volatility and regime uncertainty
        const riskPenalty = threeMonthVol * (1 - q.regimeBull!);
        const volatilityPenalty = threeMonthVol * config.volatilityPenalty;
        
        // Strategy-specific scoring: aggressive favors returns, defensive favors stability
        const riskAdjusted = 
          (expectedValue * config.returnWeight) + // Return component
          (sharpeLike * 0.3) - // Sharpe component
          (lambda * riskPenalty * config.riskWeight) - // Risk penalty
          (volatilityPenalty * (1 - config.returnWeight)); // Volatility penalty

        return {
          ...q,
          riskAdjustedScore: riskAdjusted,
          expectedValue,
          sharpeLike
        };
      })
      .filter(s => s.riskAdjustedScore > 0)
      .sort((a, b) => b.riskAdjustedScore - a.riskAdjustedScore)
      .slice(0, 10); // Top 10 candidates

    // Select top 3 and optimize weights (inverse volatility weighting)
    const top3 = scoredStocks.slice(0, 3);

    if (top3.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No suitable stocks found for allocation'
      });
    }

    // Calculate inverse volatility weights (with strategy adjustment)
    // Defensive: favor lower volatility more, Aggressive: favor returns over volatility
    const volatilityWeight = strategy === 'aggressive' ? 0.5 : strategy === 'balanced' ? 1.0 : 1.5;
    const invVolatilities = top3.map(s => Math.pow(1 / (s.volatility! + 0.01), volatilityWeight));
    const sumInvVol = invVolatilities.reduce((a, b) => a + b, 0);
    let weights = invVolatilities.map(iv => iv / sumInvVol);

    // Calculate allocations with realistic projections
    let totalCalculatedAmount = 0;
    const allocations = top3.map((stock, idx) => {
      const weight = weights[idx];
      const amount = Math.round(investmentAmount * weight);
      totalCalculatedAmount += amount;
      
      // Use probability-weighted expected return (not just exp3MReturn)
      // This gives more realistic projections: P(positive) * expected_return + P(negative) * expected_loss
      const expectedReturn = stock.exp3MReturn! / 100; // Convert percentage to decimal
      const p12 = stock.p12!;
      
      // Probability-weighted return: P(>12%) * 12% + P(<12%) * expected_return
      // This is more conservative and realistic
      const conservativeReturn = (p12 * 0.12) + ((1 - p12) * Math.max(-0.05, expectedReturn * 0.5));
      
      // Cap the projected return at realistic levels
      const projectedReturn = Math.max(-0.10, Math.min(0.20, conservativeReturn)); // Between -10% and +20%
      
      const projectedValue = amount * (1 + projectedReturn);

      // Confidence level
      let confidence = 'Medium';
      let confidenceIcon = '🟠';
      if (stock.p12! > 0.75 && stock.regimeBull! > 0.65) {
        confidence = 'High';
        confidenceIcon = '🔵';
      } else if (stock.p12! > 0.65 && stock.regimeBull! > 0.55) {
        confidence = 'Strong';
        confidenceIcon = '🟢';
      }

      return {
        rank: idx + 1,
        stockName: stock.stockName,
        symbol: stock.symbol || '',
        isin: stock.isin,
        exp3MReturn: stock.exp3MReturn!,
        volatility: stock.volatility! * 100,
        weight: weight * 100,
        amount: amount, // Keep original amount for adjustment
        projectedValue: Math.round(projectedValue),
        projectedReturn: projectedReturn * 100,
        confidence,
        confidenceIcon,
        p12: stock.p12!,
        regimeBull: stock.regimeBull! * 100
      };
    });
    
    // Fix rounding discrepancy - adjust the last allocation to make total exactly match investment amount
    const roundingDifference = investmentAmount - totalCalculatedAmount;
    if (roundingDifference !== 0 && allocations.length > 0) {
      // Adjust the last allocation to account for rounding
      const lastAllocation = allocations[allocations.length - 1];
      lastAllocation.amount += roundingDifference;
      lastAllocation.projectedValue = Math.round(lastAllocation.amount * (1 + (lastAllocation.projectedReturn / 100)));
    }
    
    // Recalculate weights based on final amounts
    allocations.forEach((alloc, idx) => {
      alloc.weight = (alloc.amount / investmentAmount) * 100;
    });

    // Calculate total portfolio metrics
    const totalAmount = allocations.reduce((sum, a) => sum + a.amount, 0);
    const totalProjectedValue = allocations.reduce((sum, a) => sum + a.projectedValue, 0);
    const totalProjectedReturn = ((totalProjectedValue - totalAmount) / totalAmount) * 100;
    const avgVolatility = allocations.reduce((sum, a) => sum + a.volatility * a.weight / 100, 0);

    return NextResponse.json({
      success: true,
      data: {
        allocations,
        portfolio: {
          totalAmount,
          totalProjectedValue,
          totalProjectedReturn,
          avgVolatility
        },
        strategy,
        investmentAmount
      }
    });

  } catch (error: any) {
    console.error('Smart allocation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate allocation' },
      { status: 500 }
    );
  }
}

