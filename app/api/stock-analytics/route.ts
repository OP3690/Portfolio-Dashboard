import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Holding from '@/models/Holding';
import StockData from '@/models/StockData';
import { format, startOfMonth, endOfMonth, subMonths, eachMonthOfInterval, subYears } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get('clientId') || '994826';
    // Get period months from query param (default to 12 months)
    const periodMonthsParam = searchParams.get('periodMonths');
    const periodMonths = periodMonthsParam ? parseInt(periodMonthsParam, 10) : 12;

    // Get all holdings with ISINs
    const holdings = await Holding.find({ clientId }).lean();
    
    if (holdings.length === 0) {
      return NextResponse.json({ stockPerformance: [] });
    }

    // Get unique ISINs
    const uniqueIsins = [...new Set(holdings.map((h: any) => h.isin).filter(Boolean))];
    
    // Calculate period months for analysis (up to 5 years = 60 months)
    const now = new Date();
    const monthsBack = Math.min(periodMonths, 60); // Cap at 60 months (5 years)
    const periodStartDate = subMonths(now, monthsBack);
    const months = eachMonthOfInterval({ start: periodStartDate, end: now });

    const stockPerformance: Array<{
      stockName: string;
      isin: string;
      monthlyReturns: Array<{ month: string; return: number }>;
      monthlyVolumes: Array<{ month: string; avgVolume: number }>;
      averageReturn: number;
      volatility: number;
      consistencyIndex: number;
      positiveStreak: number;
      negativeStreak: number;
      aboveThresholdCount: number;
      currentStreak: number;
      isPositiveStreak: boolean;
      volumeTrend: {
        avg3YearVolume: number;
        avgRecentVolume: number;
        percentChange: number;
      };
    }> = [];

    // Calculate performance for each stock
    for (const holding of holdings) {
      const isin = (holding as any).isin;
      const stockName = (holding as any).stockName;
      
      if (!isin) continue;

      // Get all stock data (prices and volume) for this ISIN
      const stockData = await StockData.find({ isin })
        .sort({ date: 1 })
        .select('date close volume')
        .lean();

      if (stockData.length === 0) continue;

      // Calculate volume trend (3-year average vs recent)
      const threeYearsAgo = subYears(now, 3);
      const volumeData = stockData.filter(s => {
        const date = new Date(s.date);
        return date >= threeYearsAgo && s.volume && s.volume > 0;
      }).map(s => s.volume || 0);

      // Get recent volume (last 30 days)
      const thirtyDaysAgo = subMonths(now, 1);
      const recentVolumeData = stockData.filter(s => {
        const date = new Date(s.date);
        return date >= thirtyDaysAgo && s.volume && s.volume > 0;
      }).map(s => s.volume || 0);

      // Calculate 3-year average volume
      const avg3YearVolume = volumeData.length > 0
        ? volumeData.reduce((sum, v) => sum + v, 0) / volumeData.length
        : 0;

      // Calculate recent average volume (last 30 days)
      const avgRecentVolume = recentVolumeData.length > 0
        ? recentVolumeData.reduce((sum, v) => sum + v, 0) / recentVolumeData.length
        : 0;

      // Calculate volume trend (% change)
      let volumeTrendPercent = 0;
      if (avg3YearVolume > 0) {
        volumeTrendPercent = ((avgRecentVolume - avg3YearVolume) / avg3YearVolume) * 100;
      }

      const monthlyReturns: Array<{ month: string; return: number }> = [];
      const monthlyVolumes: Array<{ month: string; avgVolume: number }> = [];
      const returns: number[] = [];
      let aboveThresholdCount = 0;
      let positiveStreak = 0;
      let negativeStreak = 0;
      let currentStreak = 0;
      let isPositiveStreak = true;

      // Calculate monthly returns and volumes
      for (let i = 0; i < months.length - 1; i++) {
        const monthStart = startOfMonth(months[i]);
        const monthEnd = endOfMonth(months[i]);
        
        // Find closest prices to month start and end
        const priceStart = findClosestPrice(stockData, monthStart);
        const priceEnd = findClosestPrice(stockData, monthEnd);

        // Calculate monthly average volume
        const monthVolumeData = stockData.filter(s => {
          const date = new Date(s.date);
          return date >= monthStart && date <= monthEnd && s.volume && s.volume > 0;
        }).map(s => s.volume || 0);
        
        const avgMonthlyVolume = monthVolumeData.length > 0
          ? monthVolumeData.reduce((sum, v) => sum + v, 0) / monthVolumeData.length
          : 0;

        monthlyVolumes.push({
          month: format(monthStart, 'MMM-yy'),
          avgVolume: avgMonthlyVolume
        });

        if (priceStart > 0 && priceEnd > 0) {
          const monthlyReturn = ((priceEnd - priceStart) / priceStart) * 100;
          monthlyReturns.push({
            month: format(monthStart, 'MMM-yy'),
            return: monthlyReturn
          });
          returns.push(monthlyReturn);

          // Track threshold
          if (monthlyReturn > 1.5) {
            aboveThresholdCount++;
          }

          // Track streaks
          if (monthlyReturn > 0) {
            if (isPositiveStreak) {
              currentStreak++;
            } else {
              negativeStreak = Math.max(negativeStreak, currentStreak);
              currentStreak = 1;
              isPositiveStreak = true;
            }
          } else {
            if (!isPositiveStreak) {
              currentStreak++;
            } else {
              positiveStreak = Math.max(positiveStreak, currentStreak);
              currentStreak = 1;
              isPositiveStreak = false;
            }
          }
        }
      }

      // Update final streaks
      if (isPositiveStreak) {
        positiveStreak = Math.max(positiveStreak, currentStreak);
      } else {
        negativeStreak = Math.max(negativeStreak, currentStreak);
      }

      if (returns.length === 0) continue;

      // Calculate average return
      const averageReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

      // Calculate volatility (standard deviation)
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - averageReturn, 2), 0) / returns.length;
      const volatility = Math.sqrt(variance);

      // Calculate consistency index (% of months > 1.5%)
      const consistencyIndex = (aboveThresholdCount / returns.length) * 100;

      stockPerformance.push({
        stockName,
        isin,
        monthlyReturns,
        monthlyVolumes,
        averageReturn,
        volatility,
        consistencyIndex,
        positiveStreak,
        negativeStreak,
        aboveThresholdCount,
        currentStreak,
        isPositiveStreak,
        volumeTrend: {
          avg3YearVolume,
          avgRecentVolume,
          percentChange: volumeTrendPercent
        }
      });
    }

    return NextResponse.json({ stockPerformance });
  } catch (error: any) {
    console.error('Error calculating stock analytics:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to calculate stock analytics' },
      { status: 500 }
    );
  }
}

function findClosestPrice(stockData: any[], targetDate: Date): number {
  if (stockData.length === 0) return 0;
  
  const targetTime = targetDate.getTime();
  let closest = stockData[0];
  let minDiff = Math.abs(new Date(closest.date).getTime() - targetTime);

  for (const data of stockData) {
    const diff = Math.abs(new Date(data.date).getTime() - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      closest = data;
    }
  }

  return closest.close || 0;
}

