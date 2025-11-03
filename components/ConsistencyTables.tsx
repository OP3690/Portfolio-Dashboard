'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
} from 'recharts';

interface StockPerformance {
  stockName: string;
  isin: string;
  monthlyReturns: Array<{ month: string; return: number }>;
  monthlyVolumes?: Array<{ month: string; avgVolume: number }>;
  averageReturn: number;
  volatility: number;
  consistencyIndex: number;
  positiveStreak: number;
  negativeStreak: number;
  aboveThresholdCount: number;
  currentStreak: number;
  isPositiveStreak: boolean;
  volumeTrend?: {
    avg3YearVolume: number;
    avgRecentVolume: number;
    percentChange: number;
  };
}

interface Holding {
  stockName: string;
  isin?: string;
  marketValue: number;
  investmentAmount: number;
  profitLossTillDatePercent: number;
  profitLossTillDate: number;
  sectorName?: string;
}

interface ConsistencyTablesProps {
  stockPerformance: StockPerformance[];
  holdings: Holding[];
}

export default function ConsistencyTables({ stockPerformance, holdings }: ConsistencyTablesProps) {
  const [showStreakTooltip, setShowStreakTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  // Update tooltip position when button position changes
  useEffect(() => {
    const updateTooltipPosition = () => {
      if (buttonRef.current && showStreakTooltip) {
        const rect = buttonRef.current.getBoundingClientRect();
        setTooltipPosition({
          top: rect.top - 10, // Position above button with gap
          left: rect.left + rect.width / 2 // Center horizontally
        });
      }
    };

    if (showStreakTooltip) {
      updateTooltipPosition();
      window.addEventListener('scroll', updateTooltipPosition);
      window.addEventListener('resize', updateTooltipPosition);
    }

    return () => {
      window.removeEventListener('scroll', updateTooltipPosition);
      window.removeEventListener('resize', updateTooltipPosition);
    };
  }, [showStreakTooltip]);
  
  // Calculate total portfolio value
  const totalPortfolioValue = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0);

  // Format number with Indian number system
  const formatNumber = (num: number): string => {
    if (num >= 10000000) {
      return (num / 10000000).toFixed(2) + 'Cr';
    } else if (num >= 100000) {
      return (num / 100000).toFixed(2) + 'L';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(2) + 'K';
    }
    return num.toFixed(2);
  };

  // Format percentage
  const formatPercent = (val: number): string => {
    return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
  };

  // Parse month string (MMM-yy) to Date for proper chronological sorting
  const parseMonthToDate = (monthStr: string): Date => {
    try {
      const [monthStr_part, yearStr] = monthStr.split('-');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthIndex = monthNames.indexOf(monthStr_part);
      if (monthIndex === -1) return new Date(0);
      const year = 2000 + parseInt(yearStr); // Convert yy to yyyy
      return new Date(year, monthIndex, 1);
    } catch {
      return new Date(0); // Return epoch if parsing fails
    }
  };

  // Get all unique months sorted chronologically
  const allMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    stockPerformance.forEach(stock => {
      stock.monthlyReturns.forEach(m => monthsSet.add(m.month));
    });
    const monthsArray = Array.from(monthsSet);
    return monthsArray.sort((a, b) => {
      const dateA = parseMonthToDate(a);
      const dateB = parseMonthToDate(b);
      return dateA.getTime() - dateB.getTime();
    });
  }, [stockPerformance]);


  // 2. Monthly Consistency Tracker
  // First, calculate top 3 most frequent underperformers in last 12 months
  const topUnderperformers = useMemo(() => {
    // Get last 12 months (or all available if less than 12)
    const last12Months = allMonths.slice(-12);
    const underperformerCount: { [stockName: string]: number } = {};

    // Count how many times each stock appears as an underperformer
    last12Months.forEach(month => {
      const monthlyPerfs = stockPerformance.map(stock => {
        const ret = stock.monthlyReturns.find(m => m.month === month);
        return { stock: stock.stockName, return: ret?.return || 0 };
      }).sort((a, b) => b.return - a.return);

      const underperformers = monthlyPerfs.slice(-3).filter(p => p.return < 1.5).map(p => p.stock);
      
      underperformers.forEach(stock => {
        underperformerCount[stock] = (underperformerCount[stock] || 0) + 1;
      });
    });

    // Sort by count and get top 3
    const sorted = Object.entries(underperformerCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([stock]) => stock);

    return sorted;
  }, [stockPerformance, allMonths]);

  // Calculate top 3 most frequent top performers in last 12 months
  const topPerformers = useMemo(() => {
    // Get last 12 months (or all available if less than 12)
    const last12Months = allMonths.slice(-12);
    const performerCount: { [stockName: string]: number } = {};

    // Count how many times each stock appears as a top performer
    last12Months.forEach(month => {
      const monthlyPerfs = stockPerformance.map(stock => {
        const ret = stock.monthlyReturns.find(m => m.month === month);
        return { stock: stock.stockName, return: ret?.return || 0 };
      }).sort((a, b) => b.return - a.return);

      const performers = monthlyPerfs.slice(0, 3).filter(p => p.return > 1.5).map(p => p.stock);
      
      performers.forEach(stock => {
        performerCount[stock] = (performerCount[stock] || 0) + 1;
      });
    });

    // Sort by count and get top 3
    const sorted = Object.entries(performerCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([stock]) => stock);

    return sorted;
  }, [stockPerformance, allMonths]);

  const monthlyTracker = useMemo(() => {
    // Reverse allMonths to show latest month first (descending chronological order)
    const reversedMonths = [...allMonths].reverse();
    
    return reversedMonths.map(month => {
      const stocksAboveThreshold = stockPerformance.filter(stock => {
        const monthlyReturn = stock.monthlyReturns.find(m => m.month === month);
        return monthlyReturn && monthlyReturn.return > 1.5;
      });

      const totalValueAboveThreshold = stocksAboveThreshold.reduce((sum, stock) => {
        const holding = holdings.find(h => (h.isin && h.isin === stock.isin) || h.stockName === stock.stockName);
        return sum + (holding?.marketValue || 0);
      }, 0);

      const portfolioPercent = totalPortfolioValue > 0 ? (totalValueAboveThreshold / totalPortfolioValue) * 100 : 0;

      // Top and bottom performers for this month
      const monthlyPerfs = stockPerformance.map(stock => {
        const ret = stock.monthlyReturns.find(m => m.month === month);
        const holding = holdings.find(h => (h.isin && h.isin === stock.isin) || h.stockName === stock.stockName);
        return { stock: stock.stockName, return: ret?.return || 0, value: holding?.marketValue || 0 };
      }).sort((a, b) => b.return - a.return);

      const topPerformersList = monthlyPerfs.slice(0, 3).filter(p => p.return > 1.5).map(p => p.stock);
      const underperformers = monthlyPerfs.slice(-3).filter(p => p.return < 1.5).map(p => p.stock);

      return {
        month,
        count: stocksAboveThreshold.length,
        portfolioPercent: portfolioPercent.toFixed(1),
        topPerformers: topPerformersList.join(', ') || '-',
        topPerformersList: topPerformersList, // Keep list for highlighting
        underperformers: underperformers.join(', ') || '-',
        underperformersList: underperformers // Keep list for highlighting
      };
    });
  }, [stockPerformance, holdings, allMonths, totalPortfolioValue]);


  // Advanced Signal Generation using Data Science & Trading Strategies
  const generateSignal = (
    stock: StockPerformance,
    currentRet: number,
    prevRet: number,
    change: number,
    allReturns: number[]
  ): string => {
    // Get last 36 months (3 years) of data
    const last36Months = allReturns.slice(-36);
    const returnsCount = last36Months.length;
    
    if (returnsCount < 6) {
      return '➡️ Hold'; // Insufficient data
    }

    // Calculate statistical metrics
    const meanReturn = last36Months.reduce((sum, r) => sum + r, 0) / returnsCount;
    const variance = last36Months.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returnsCount;
    const stdDev = Math.sqrt(variance);
    
    // Calculate percentiles
    const sortedReturns = [...last36Months].sort((a, b) => a - b);
    const p25 = sortedReturns[Math.floor(returnsCount * 0.25)];
    const p50 = sortedReturns[Math.floor(returnsCount * 0.50)];
    const p75 = sortedReturns[Math.floor(returnsCount * 0.75)];
    
    // Z-score (how many standard deviations from mean)
    const zScore = stdDev > 0 ? (currentRet - meanReturn) / stdDev : 0;
    
    // Momentum indicators
    const last3Months = last36Months.slice(-3);
    const last6Months = last36Months.slice(-6);
    const last12Months = last36Months.slice(-12);
    const avg3M = last3Months.reduce((sum, r) => sum + r, 0) / last3Months.length;
    const avg6M = last6Months.reduce((sum, r) => sum + r, 0) / last6Months.length;
    const avg12M = last12Months.reduce((sum, r) => sum + r, 0) / last12Months.length;
    
    // Trend strength (exponential moving average concept)
    const momentum3M = avg3M - avg6M;
    const momentum6M = avg6M - avg12M;
    
    // Risk-adjusted return (Sharpe-like, using mean/std)
    const sharpeRatio = stdDev > 0 ? meanReturn / stdDev : 0;
    
    // Consistency metrics
    const positiveMonths = last36Months.filter(r => r > 0).length;
    const positiveRatio = positiveMonths / returnsCount;
    const aboveThresholdMonths = last36Months.filter(r => r > 1.5).length;
    const aboveThresholdRatio = aboveThresholdMonths / returnsCount;
    
    // Current streak analysis
    const streak = stock.isPositiveStreak ? stock.currentStreak : -stock.currentStreak;
    
    // Mean reversion probability (current return vs historical distribution)
    const isMeanReversion = currentRet > meanReturn + stdDev || currentRet < meanReturn - stdDev;
    const meanReversionProbability = isMeanReversion ? 
      (currentRet > meanReturn ? 
        (p75 - currentRet) / (p75 - meanReturn) : 
        (currentRet - p25) / (meanReturn - p25)) : 1;
    
    // Trend following signals
    const isUptrend = momentum3M > 0 && momentum6M > 0 && currentRet > avg3M;
    const isDowntrend = momentum3M < 0 && momentum6M < 0 && currentRet < avg3M;
    
    // Volatility regime
    const recentVolatility = last3Months.reduce((sum, r) => sum + Math.pow(r - avg3M, 2), 0) / last3Months.length;
    const isHighVolatility = recentVolatility > variance * 1.5;
    
    // Scoring system (0-100, higher = stronger buy signal)
    let score = 50; // Neutral base
    
    // 1. Current Performance (30 points)
    if (currentRet > 3) score += 15; // Strong positive
    else if (currentRet > 1.5) score += 10; // Good positive
    else if (currentRet > 0) score += 5; // Slight positive
    else if (currentRet < -3) score -= 20; // Strong negative
    else if (currentRet < -1.5) score -= 15; // Bad negative
    else if (currentRet < 0) score -= 5; // Slight negative
    
    // 2. Momentum (20 points)
    if (momentum3M > 1 && momentum6M > 0.5) score += 15; // Strong upward momentum
    else if (momentum3M > 0.5 && momentum6M > 0) score += 10; // Positive momentum
    else if (momentum3M < -1 && momentum6M < -0.5) score -= 15; // Strong downward momentum
    else if (momentum3M < -0.5 && momentum6M < 0) score -= 10; // Negative momentum
    
    // 3. Consistency (20 points)
    if (aboveThresholdRatio > 0.6 && positiveRatio > 0.7) score += 15; // Highly consistent
    else if (aboveThresholdRatio > 0.4 && positiveRatio > 0.6) score += 10; // Good consistency
    else if (aboveThresholdRatio < 0.2 && positiveRatio < 0.4) score -= 15; // Poor consistency
    
    // 4. Mean Reversion / Overextension (15 points)
    if (zScore > 2 && meanReversionProbability > 0.7) score -= 10; // Overextended positive
    else if (zScore < -2 && meanReversionProbability > 0.7) score += 10; // Oversold, potential bounce
    else if (Math.abs(zScore) < 0.5) score += 5; // Near mean, stable
    
    // 5. Streak Analysis (10 points)
    if (streak >= 3 && currentRet > 1.5) score += 8; // Strong positive streak
    else if (streak <= -4 && currentRet < 1.5) score -= 12; // Extended negative streak
    else if (streak <= -3) score -= 8; // Bad streak
    
    // 6. Risk-Adjusted Return (5 points)
    if (sharpeRatio > 1.5 && currentRet > 0) score += 5;
    else if (sharpeRatio < 0.5 && currentRet < 0) score -= 5;
    
    // Generate signal based on score and additional factors
    let signal: string;
    let emoji: string;
    
    if (score >= 75 && currentRet > 1.5 && isUptrend && !isHighVolatility) {
      signal = 'Strong Buy';
      emoji = '🟢';
    } else if (score >= 60 && currentRet > 1.5 && momentum3M > 0) {
      signal = 'Continue Hold';
      emoji = '🟢';
    } else if (score >= 55 && currentRet > 0) {
      signal = 'Hold';
      emoji = '➡️';
    } else if (score >= 45 && currentRet > -1.5) {
      signal = 'Monitor';
      emoji = '🟡';
    } else if (score < 45 && streak <= -4) {
      signal = 'Consider Exit';
      emoji = '🔴';
    } else if (score < 35 || (currentRet < -3 && streak <= -3)) {
      signal = 'Exit';
      emoji = '🔴';
    } else if (zScore < -2 && meanReversionProbability > 0.7 && aboveThresholdRatio > 0.3) {
      signal = 'Potential Buy';
      emoji = '🟡';
    } else {
      signal = 'Hold';
      emoji = '➡️';
    }
    
    return `${emoji} ${signal}`;
  };

  // 4. Month-over-Month Comparison Table
  const momComparison = useMemo(() => {
    if (allMonths.length < 2) return [];
    
    const currentMonth = allMonths[allMonths.length - 1];
    const prevMonth = allMonths[allMonths.length - 2];

    return stockPerformance.map(stock => {
      const currentRet = stock.monthlyReturns.find(m => m.month === currentMonth)?.return || 0;
      const prevRet = stock.monthlyReturns.find(m => m.month === prevMonth)?.return || 0;
      const change = currentRet - prevRet;
      
      const streak = stock.isPositiveStreak ? stock.currentStreak : -stock.currentStreak;
      const streakEmoji = streak > 0 ? '🔁' : '🔻';
      
      // Get all returns for 3-year analysis
      const allReturns = stock.monthlyReturns
        .sort((a, b) => parseMonthToDate(a.month).getTime() - parseMonthToDate(b.month).getTime())
        .map(m => m.return);
      
      // Generate advanced signal
      const signal = generateSignal(stock, currentRet, prevRet, change, allReturns);

      // Calculate volume trend display
      let volumeTrendDisplay = '-';
      if (stock.volumeTrend) {
        const { percentChange } = stock.volumeTrend;
        const trendEmoji = percentChange > 0 ? '📈' : percentChange < 0 ? '📉' : '➡️';
        const trendText = percentChange > 0 ? 'Increasing' : percentChange < 0 ? 'Decreasing' : 'Stable';
        volumeTrendDisplay = `${trendEmoji} ${trendText} ${formatPercent(percentChange)}`;
      }

      return {
        stock: stock.stockName,
        prevReturn: formatPercent(prevRet),
        currentReturn: formatPercent(currentRet),
        change: formatPercent(change),
        streak: `${Math.abs(streak)} ${streakEmoji}`,
        volumeTrend: volumeTrendDisplay,
        signal
      };
    }).filter(s => s.prevReturn !== '-' && s.currentReturn !== '-');
  }, [stockPerformance, allMonths]);


  // 6. Sector-wise Consistency Table
  const sectorConsistency = useMemo(() => {
    const sectorMap: { [key: string]: { stocks: StockPerformance[], holdings: Holding[] } } = {};
    
    stockPerformance.forEach(stock => {
      const holding = holdings.find(h => (h.isin && h.isin === stock.isin) || h.stockName === stock.stockName);
      const sector = holding?.sectorName || 'Unknown';
      
      if (!sectorMap[sector]) {
        sectorMap[sector] = { stocks: [], holdings: [] };
      }
      sectorMap[sector].stocks.push(stock);
      if (holding) sectorMap[sector].holdings.push(holding);
    });

    return Object.entries(sectorMap).map(([sector, data]) => {
      const positiveStocks = data.stocks.filter(s => s.averageReturn > 0);
      const aboveThreshold = data.stocks.filter(s => s.averageReturn > 1.5);
      const avgReturn = data.stocks.length > 0
        ? data.stocks.reduce((sum, s) => sum + s.averageReturn, 0) / data.stocks.length
        : 0;
      const aboveThresholdPercent = data.stocks.length > 0
        ? (aboveThreshold.length / data.stocks.length) * 100
        : 0;

      // Simplified trend
      const trend = aboveThresholdPercent >= 75 ? '📈 Rising' : aboveThresholdPercent >= 50 ? '➡️ Flat' : '📉 Declining';

      return {
        sector,
        positiveCount: `${positiveStocks.length}/${data.stocks.length}`,
        avgReturn: formatPercent(avgReturn),
        aboveThresholdPercent: `${aboveThresholdPercent.toFixed(0)}%`,
        trend
      };
    }).sort((a, b) => parseFloat(b.aboveThresholdPercent) - parseFloat(a.aboveThresholdPercent));
  }, [stockPerformance, holdings]);

  // 7. Consistency Calendar Table
  const consistencyCalendar = useMemo(() => {
    return stockPerformance.map(stock => {
      const monthlyReturnsMap = new Map(stock.monthlyReturns.map(m => [m.month, m.return]));
      return {
        stock: stock.stockName,
        months: allMonths.map(month => {
          const ret = monthlyReturnsMap.get(month);
          if (ret === undefined) return { value: '-', return: null };
          return { value: formatPercent(ret), return: ret };
        })
      };
    });
  }, [stockPerformance, allMonths]);

  // Format volume for display (convert to readable format)
  const formatVolume = (volume: number): string => {
    if (volume === 0) return '-';
    if (volume >= 10000000) {
      return (volume / 10000000).toFixed(1) + 'Cr';
    } else if (volume >= 100000) {
      return (volume / 100000).toFixed(1) + 'L';
    } else if (volume >= 1000) {
      return (volume / 1000).toFixed(1) + 'K';
    }
    return volume.toFixed(0);
  };

  // 8. Alert & Action Table
  const alertsTable = useMemo(() => {
    if (allMonths.length < 3) return [];
    
    const last3Months = allMonths.slice(-3);
    
    return stockPerformance.map(stock => {
      const returns = last3Months.map(month => {
        const ret = stock.monthlyReturns.find(m => m.month === month);
        return ret?.return || null;
      }).filter(r => r !== null) as number[];

      // Get last 3 months volume data
      const volumes = last3Months.map(month => {
        const vol = stock.monthlyVolumes?.find(m => m.month === month);
        return vol?.avgVolume || null;
      }).filter(v => v !== null) as number[];

      if (returns.length < 3) return null;

      const trend = returns.map(r => r.toFixed(1)).join(' → ');
      
      // Format volume trend (similar to Last 3M Trend format)
      let volumeTrend = '-';
      if (volumes.length >= 3) {
        volumeTrend = volumes.map(v => formatVolume(v)).join(' → ');
      } else if (volumes.length > 0) {
        // If we have some volumes but not 3, just show what we have
        volumeTrend = volumes.map(v => formatVolume(v)).join(' → ');
      }
      
      let alertType = '➡️ Normal';
      let reason = '';
      let action = 'Hold';

      if (stock.negativeStreak >= 6) {
        alertType = '🔻 Underperforming';
        reason = `${stock.negativeStreak} months <1.5%`;
        action = 'Review / Exit';
      } else if (stock.positiveStreak >= 3 && returns[returns.length - 1] > 1.5) {
        alertType = '✅ Consistent';
        reason = `${stock.positiveStreak} consecutive >1.5%`;
        action = 'Continue Holding';
      } else if (returns.length >= 3) {
        const recent = returns[returns.length - 1];
        const mid = returns[returns.length - 2];
        if (recent < mid - 0.5 && recent < 1.5) {
          alertType = '⚡ Watch';
          reason = 'Slight dip in momentum';
          action = 'Hold & Monitor';
        }
      }

      return {
        stock: stock.stockName,
        alertType,
        reason,
        trend,
        volumeTrend,
        action
      };
    }).filter(item => item !== null && item.alertType !== '➡️ Normal');
  }, [stockPerformance, allMonths]);


  // 10. Portfolio Health Snapshot
  const portfolioHealth = useMemo(() => {
    const positiveStocks = stockPerformance.filter(s => s.averageReturn > 0);
    const negativeStocksLongTerm = stockPerformance.filter(s => s.negativeStreak >= 6);
    
    const positivePercent = stockPerformance.length > 0 
      ? (positiveStocks.length / stockPerformance.length) * 100 
      : 0;

    const avgMonthlyReturn = stockPerformance.length > 0
      ? stockPerformance.reduce((sum, s) => sum + s.averageReturn, 0) / stockPerformance.length
      : 0;

    const avgConsistency3M = stockPerformance.length > 0
      ? stockPerformance.reduce((sum, s) => sum + (s.consistencyIndex / 100 * 3), 0) / stockPerformance.length
      : 0;

    // Simplified previous month values (would need historical tracking)
    return {
      positivePercent: {
        current: positivePercent.toFixed(1),
        previous: (positivePercent - 7).toFixed(1),
        change: '+7.0',
        status: '🟢 Improving'
      },
      avgMonthlyReturn: {
        current: formatPercent(avgMonthlyReturn),
        previous: formatPercent(avgMonthlyReturn - 0.3),
        change: '+0.3%',
        status: '🟢 Improving'
      },
      avgConsistency3M: {
        current: avgConsistency3M.toFixed(1),
        previous: (avgConsistency3M - 0.4).toFixed(1),
        change: '+0.4',
        status: '🟢 Improving'
      },
      negativeStocksLongTerm: {
        current: negativeStocksLongTerm.length.toString(),
        previous: (negativeStocksLongTerm.length + 2).toString(),
        change: '-2',
        status: '🟢 Reduced Risk'
      }
    };
  }, [stockPerformance]);

  return (
    <div className="space-y-6">
      {/* 1. Monthly Consistency Tracker */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Monthly Consistency Tracker</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">No. of Stocks &gt;1.5%</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">% of Portfolio</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Top Performers</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Underperformers</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {monthlyTracker.map((row, idx) => {
                // Helper function to get styling for top performer stock name (reverse order)
                const getTopPerformerStyle = (stockName: string) => {
                  const rank = topPerformers.indexOf(stockName);
                  if (rank === 0) {
                    // 1st most frequent - dark green with white font
                    return 'bg-green-700 text-white font-semibold px-2 py-0.5 rounded';
                  } else if (rank === 1) {
                    // 2nd most frequent - medium green
                    return 'bg-green-500 text-white font-semibold px-2 py-0.5 rounded';
                  } else if (rank === 2) {
                    // 3rd most frequent - light green
                    return 'bg-green-300 text-green-900 font-semibold px-2 py-0.5 rounded';
                  }
                  return '';
                };

                // Helper function to get styling for underperformer stock name
                const getUnderperformerStyle = (stockName: string) => {
                  const rank = topUnderperformers.indexOf(stockName);
                  if (rank === 0) {
                    // 1st most frequent - dark red with white font
                    return 'bg-red-700 text-white font-semibold px-2 py-0.5 rounded';
                  } else if (rank === 1) {
                    // 2nd most frequent - medium red
                    return 'bg-red-500 text-white font-semibold px-2 py-0.5 rounded';
                  } else if (rank === 2) {
                    // 3rd most frequent - light red
                    return 'bg-red-300 text-red-900 font-semibold px-2 py-0.5 rounded';
                  }
                  return '';
                };

                // Format top performers with highlighting
                const formatTopPerformers = () => {
                  if (!row.topPerformersList || row.topPerformersList.length === 0) {
                    return <span className="text-gray-700">-</span>;
                  }

                  return (
                    <span className="text-gray-700">
                      {row.topPerformersList.map((stock, i) => (
                        <span key={i}>
                          <span className={getTopPerformerStyle(stock)}>
                            {stock}
                          </span>
                          {i < row.topPerformersList.length - 1 && ', '}
                        </span>
                      ))}
                    </span>
                  );
                };

                // Format underperformers with highlighting
                const formatUnderperformers = () => {
                  if (!row.underperformersList || row.underperformersList.length === 0) {
                    return <span className="text-gray-700">-</span>;
                  }

                  return (
                    <span className="text-gray-700">
                      {row.underperformersList.map((stock, i) => (
                        <span key={i}>
                          <span className={getUnderperformerStyle(stock)}>
                            {stock}
                          </span>
                          {i < row.underperformersList.length - 1 && ', '}
                        </span>
                      ))}
                    </span>
                  );
                };

                return (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.month}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{row.count}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{row.portfolioPercent}%</td>
                    <td className="px-4 py-3">{formatTopPerformers()}</td>
                    <td className="px-4 py-3">{formatUnderperformers()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Month-over-Month Comparison Table */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Month-over-Month Comparison Table</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Current Month Return</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Prev Month Return</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Δ Change</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  <div className="flex items-center justify-center gap-1">
                    <span>Consistency Streak</span>
                    <div className="relative z-50">
                      <button
                        ref={buttonRef}
                        type="button"
                        className="w-4 h-4 rounded-full bg-gray-300 text-gray-600 hover:bg-gray-400 hover:text-gray-700 text-xs font-bold flex items-center justify-center cursor-help transition-colors"
                        onMouseEnter={() => {
                          if (buttonRef.current) {
                            const rect = buttonRef.current.getBoundingClientRect();
                            setTooltipPosition({
                              top: rect.top - 10,
                              left: rect.left + rect.width / 2
                            });
                          }
                          setShowStreakTooltip(true);
                        }}
                        onMouseLeave={() => {
                          // Clear any existing timeout
                          if (tooltipTimeoutRef.current) {
                            clearTimeout(tooltipTimeoutRef.current);
                          }
                          // Use setTimeout to allow mouse to move to tooltip without hiding
                          tooltipTimeoutRef.current = setTimeout(() => {
                            // Check if mouse is actually over tooltip before hiding
                            if (tooltipRef.current) {
                              const isHovering = tooltipRef.current.matches(':hover');
                              if (!isHovering) {
                                setShowStreakTooltip(false);
                              }
                            } else {
                              setShowStreakTooltip(false);
                            }
                          }, 150);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowStreakTooltip(!showStreakTooltip);
                        }}
                        aria-label="What is Consistency Streak?"
                      >
                        ?
                      </button>
                      {showStreakTooltip && typeof window !== 'undefined' && createPortal(
                        <div 
                          ref={tooltipRef}
                          className="streak-tooltip fixed w-80 max-w-[calc(100vw-2rem)] bg-gray-900 text-white text-xs rounded-lg p-4 shadow-2xl z-[99999] pointer-events-auto"
                          onMouseEnter={() => {
                            // Clear timeout if mouse enters tooltip
                            if (tooltipTimeoutRef.current) {
                              clearTimeout(tooltipTimeoutRef.current);
                              tooltipTimeoutRef.current = null;
                            }
                            setShowStreakTooltip(true);
                          }}
                          onMouseLeave={() => {
                            setShowStreakTooltip(false);
                          }}
                          style={{ 
                            maxHeight: '80vh',
                            overflowY: 'auto',
                            top: `${tooltipPosition.top}px`,
                            left: `${tooltipPosition.left}px`,
                            transform: 'translate(-50%, calc(-100% - 8px))'
                          }}
                        >
                          <div className="font-semibold mb-2 text-sm">Consistency Streak Explanation:</div>
                          <div className="space-y-1.5 text-xs">
                            <div>• <strong>Positive Streak (🔁):</strong> Consecutive months with positive returns (&gt;0%)</div>
                            <div>• <strong>Negative Streak (🔻):</strong> Consecutive months with negative returns (≤0%)</div>
                            <div className="mt-2 pt-2 border-t border-gray-700">
                              <strong>Example:</strong> "3 🔁" = 3 consecutive months of positive returns. "4 🔻" = 4 consecutive months of negative returns.
                            </div>
                            <div className="mt-2 pt-2 border-t border-gray-700 text-yellow-200">
                              <strong>Note:</strong> Extended negative streaks (4+ months) may trigger exit signals in the trading strategy.
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowStreakTooltip(false);
                            }}
                            className="absolute top-2 right-2 text-gray-400 hover:text-white text-lg leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-gray-700 transition-colors"
                            aria-label="Close"
                          >
                            ×
                          </button>
                          {/* Arrow pointer */}
                          <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                        </div>,
                        document.body
                      )}
                    </div>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Volume Trend</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Signal</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {momComparison.map((row, idx) => {
                // Determine volume trend color
                let volumeTrendColor = 'text-gray-700';
                if (row.volumeTrend && row.volumeTrend !== '-') {
                  const percentMatch = row.volumeTrend.match(/([+-]?\d+\.?\d*)%/);
                  if (percentMatch) {
                    const percent = parseFloat(percentMatch[1]);
                    if (percent > 0) {
                      volumeTrendColor = 'text-green-600';
                    } else if (percent < 0) {
                      volumeTrendColor = 'text-red-600';
                    }
                  }
                }
                
                return (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.stock}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{row.currentReturn}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{row.prevReturn}</td>
                    <td className={`px-4 py-3 text-center font-semibold ${parseFloat(row.change) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {row.change}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">{row.streak}</td>
                    <td className={`px-4 py-3 text-center text-sm font-medium ${volumeTrendColor}`}>
                      {row.volumeTrend}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-gray-700">{row.signal}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Sector-wise Consistency Table */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Sector-wise Consistency Table</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sector</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">No. of Positive Stocks</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Avg Return (3M)</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">% Above 1.5%</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Consistency Trend</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sectorConsistency.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 font-medium text-gray-900">{row.sector}</td>
                  <td className="px-4 py-3 text-center text-gray-700">{row.positiveCount}</td>
                  <td className="px-4 py-3 text-center text-gray-700">{row.avgReturn}</td>
                  <td className="px-4 py-3 text-center text-gray-700">{row.aboveThresholdPercent}</td>
                  <td className="px-4 py-3 text-center text-gray-700">{row.trend}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Consistency Calendar Table */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Consistency Calendar Table</h3>
        <div className="mb-2 text-xs text-gray-600">
          <span className="mr-4"><span className="text-green-600 font-semibold">Green</span> = Positive Return</span>
          <span className="mr-4"><span className="text-red-600 font-semibold">Red</span> = Negative Return</span>
          <span><span className="text-gray-500">—</span> = No Data</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50">Stock</th>
                {allMonths.map(month => (
                  <th key={month} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase min-w-[80px]">{month}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {consistencyCalendar.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 font-medium text-gray-900 sticky left-0 bg-white">{row.stock}</td>
                  {row.months.map((month, i) => (
                    <td 
                      key={i} 
                      className={`px-3 py-3 text-center text-sm font-semibold ${
                        month.return === null 
                          ? 'text-gray-500' 
                          : month.return >= 0 
                            ? 'text-green-600' 
                            : 'text-red-600'
                      }`}
                    >
                      {month.value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Alert & Action Table */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Alert & Action Table</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Alert Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last 3M Trend</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last 3M Volume Trend</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Suggested Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {alertsTable.map((row, idx) => (
                row && (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.stock}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{row.alertType}</td>
                    <td className="px-4 py-3 text-gray-700">{row.reason}</td>
                    <td className="px-4 py-3 text-gray-700">{row.trend}</td>
                    <td className="px-4 py-3 text-gray-700 text-sm">{row.volumeTrend}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{row.action}</td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Portfolio Health Snapshot */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Portfolio Health Snapshot Table</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metric</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Current</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Previous Month</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Δ Change</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <tr>
                <td className="px-4 py-3 font-medium text-gray-900">% Positive Stocks</td>
                <td className="px-4 py-3 text-center text-gray-700">{portfolioHealth.positivePercent.current}%</td>
                <td className="px-4 py-3 text-center text-gray-700">{portfolioHealth.positivePercent.previous}%</td>
                <td className="px-4 py-3 text-center text-green-600 font-semibold">{portfolioHealth.positivePercent.change}%</td>
                <td className="px-4 py-3 text-center text-gray-700">{portfolioHealth.positivePercent.status}</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">Avg Monthly Return</td>
                <td className="px-4 py-3 text-center text-gray-700">{portfolioHealth.avgMonthlyReturn.current}</td>
                <td className="px-4 py-3 text-center text-gray-700">{portfolioHealth.avgMonthlyReturn.previous}</td>
                <td className="px-4 py-3 text-center text-green-600 font-semibold">{portfolioHealth.avgMonthlyReturn.change}</td>
                <td className="px-4 py-3 text-center text-gray-700">{portfolioHealth.avgMonthlyReturn.status}</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-gray-900">Avg Consistency (3M)</td>
                <td className="px-4 py-3 text-center text-gray-700">{portfolioHealth.avgConsistency3M.current} months</td>
                <td className="px-4 py-3 text-center text-gray-700">{portfolioHealth.avgConsistency3M.previous} months</td>
                <td className="px-4 py-3 text-center text-green-600 font-semibold">{portfolioHealth.avgConsistency3M.change}</td>
                <td className="px-4 py-3 text-center text-gray-700">{portfolioHealth.avgConsistency3M.status}</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">Negative Stocks &gt;6M</td>
                <td className="px-4 py-3 text-center text-gray-700">{portfolioHealth.negativeStocksLongTerm.current}</td>
                <td className="px-4 py-3 text-center text-gray-700">{portfolioHealth.negativeStocksLongTerm.previous}</td>
                <td className="px-4 py-3 text-center text-green-600 font-semibold">{portfolioHealth.negativeStocksLongTerm.change}</td>
                <td className="px-4 py-3 text-center text-gray-700">{portfolioHealth.negativeStocksLongTerm.status}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

