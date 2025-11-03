'use client';

import { useEffect, useState, useRef } from 'react';
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
  ReferenceLine,
} from 'recharts';
import ConsistencyTables from './ConsistencyTables';

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
  asOnDate?: Date | string;
  holdingPeriodYears?: number;
  holdingPeriodMonths?: number;
}

interface PerformanceAnalyticsChartsProps {
  clientId?: string;
  holdings?: Holding[];
  transactions?: Array<{
    isin?: string;
    stockName?: string;
    transactionDate: Date | string;
    buySell: string;
  }>;
}

type PeriodType = '3M' | '6M' | '1Y' | '2Y' | '3Y' | '5Y';

export default function PerformanceAnalyticsCharts({ clientId = '994826', holdings = [], transactions = [] }: PerformanceAnalyticsChartsProps) {
  const [stockPerformance, setStockPerformance] = useState<StockPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('1Y');
  const [showSharpeTooltip, setShowSharpeTooltip] = useState(false);
  const [tooltipContent, setTooltipContent] = useState<'sharpe' | 'avgMonthlyReturn'>('sharpe');
  const sharpeIconRef = useRef<HTMLSpanElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

  // Get number of months based on selected period (moved before useEffect)
  const getPeriodMonths = (period: PeriodType): number => {
    switch (period) {
      case '3M': return 3;
      case '6M': return 6;
      case '1Y': return 12;
      case '2Y': return 24;
      case '3Y': return 36;
      case '5Y': return 60;
      default: return 12;
    }
  };

  useEffect(() => {
    fetchStockPerformance();
  }, [clientId, selectedPeriod]);

  const fetchStockPerformance = async () => {
    try {
      setLoading(true);
      // Get period months to pass to API
      const periodMonths = getPeriodMonths(selectedPeriod);
      const response = await fetch(`/api/stock-analytics?clientId=${clientId}&periodMonths=${periodMonths}`);
      const data = await response.json();
      setStockPerformance(data.stockPerformance || []);
    } catch (error) {
      console.error('Error fetching stock performance:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading performance analytics...</div>
      </div>
    );
  }

  if (stockPerformance.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">No performance data available</div>
      </div>
    );
  }

  // Calculate total portfolio value for weightage
  const totalPortfolioValue = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0);

  // Calculate CAGR from monthly returns for selected period
  // CAGR = (Ending Value / Beginning Value)^(1/n) - 1
  // For monthly returns: (1 + r1) * (1 + r2) * ... * (1 + rn) = Ending Value / Beginning Value
  // Then annualize: (Total Return)^(12/n) - 1
  const calculateCAGR = (monthlyReturns: Array<{ month: string; return: number }>, periodMonths: number): number => {
    if (monthlyReturns.length === 0) return 0;
    // Get last N months based on selected period
    const periodMonthsData = monthlyReturns.slice(-periodMonths);
    if (periodMonthsData.length === 0) return 0;
    
    // Compound monthly returns: (1 + r1/100) * (1 + r2/100) * ... * (1 + rn/100)
    const totalReturn = periodMonthsData.reduce((product, m) => product * (1 + m.return / 100), 1);
    
    // Annualize: (totalReturn ^ (12 / n)) - 1
    const annualizedReturn = Math.pow(totalReturn, 12 / periodMonthsData.length) - 1;
    return annualizedReturn * 100; // Convert to percentage
  };

  // Calculate consistency (months with >= 1.5% return) for selected period
  const calculateConsistency = (monthlyReturns: Array<{ month: string; return: number }>, periodMonths: number): string => {
    // Get only the last N months based on selected period
    const periodMonthsData = monthlyReturns.slice(-periodMonths);
    const totalMonths = periodMonthsData.length;
    if (totalMonths === 0) return '0 / 0';
    const aboveThresholdMonths = periodMonthsData.filter(m => m.return >= 1.5).length;
    return `${aboveThresholdMonths} / ${totalMonths}`;
  };

  // Calculate Sharpe Ratio for selected period
  // Sharpe = (Annualized Return - Risk Free Rate) / Annualized Volatility
  // Risk Free Rate = 7.5% (typical for Indian government bonds)
  const RISK_FREE_RATE = 7.5;
  const calculateSharpe = (monthlyReturns: Array<{ month: string; return: number }>, volatility: number, periodMonths: number): number => {
    if (volatility === 0 || monthlyReturns.length === 0) return 0;
    
    // Use last N months based on selected period
    const periodMonthsData = monthlyReturns.slice(-periodMonths);
    if (periodMonthsData.length === 0) return 0;
    
    // Calculate CAGR (annualized return)
    const totalReturn = periodMonthsData.reduce((product, m) => product * (1 + m.return / 100), 1);
    const annualizedReturn = Math.pow(totalReturn, 12 / periodMonthsData.length) - 1;
    const annualizedReturnPercent = annualizedReturn * 100;
    
    // Annualize volatility: monthly volatility * sqrt(12)
    const annualizedVolatility = volatility * Math.sqrt(12);
    
    if (annualizedVolatility === 0) return 0;
    
    // Sharpe Ratio = (Annualized Return - Risk Free Rate) / Annualized Volatility
    const excessReturn = annualizedReturnPercent - RISK_FREE_RATE;
    return excessReturn / annualizedVolatility;
  };

  // Determine status badge
  const getStatus = (cagr: number, consistency: string): { text: string; emoji: string; color: string } => {
    const [aboveThreshold, total] = consistency.split(' / ').map(Number);
    const consistencyPercent = total > 0 ? (aboveThreshold / total) * 100 : 0;
    
    if (cagr > 40 && consistencyPercent >= 70) {
      return { text: 'Best Performer', emoji: '⭐', color: 'text-yellow-600' };
    } else if (cagr > 20 && consistencyPercent >= 50) {
      return { text: 'Positive', emoji: '✅', color: 'text-green-600' };
    } else if (cagr > 10 && consistencyPercent >= 40) {
      return { text: 'Moderate', emoji: '⚠️', color: 'text-yellow-600' };
    } else if (cagr > 0 && consistencyPercent < 40) {
      return { text: 'Volatile', emoji: '⚠️', color: 'text-yellow-600' };
    } else if (cagr > -5) {
      return { text: 'Neutral', emoji: '🟡', color: 'text-gray-600' };
    } else if (cagr > -15) {
      return { text: 'Weak', emoji: '🔴', color: 'text-red-600' };
    } else if (cagr > -30) {
      return { text: 'Poor', emoji: '🔴', color: 'text-red-600' };
    } else {
      return { text: 'Worst Performer', emoji: '🚨', color: 'text-red-700' };
    }
  };

  // Calculate volatility for selected period
  const calculateVolatility = (monthlyReturns: Array<{ month: string; return: number }>, periodMonths: number): number => {
    const periodMonthsData = monthlyReturns.slice(-periodMonths);
    if (periodMonthsData.length === 0) return 0;
    
    const returns = periodMonthsData.map(m => m.return);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    return Math.sqrt(variance);
  };

  // Determine trend based on last 3 months vs selected period average
  const getTrend = (stock: StockPerformance, periodMonths: number): { text: string; emoji: string } => {
    if (stock.monthlyReturns.length < 3) {
      return { text: 'Insufficient Data', emoji: '➡️' };
    }
    
    const periodMonthsData = stock.monthlyReturns.slice(-periodMonths);
    if (periodMonthsData.length === 0) {
      return { text: 'Insufficient Data', emoji: '➡️' };
    }
    
    const recent3 = stock.monthlyReturns.slice(-3);
    const avgRecent = recent3.reduce((sum, m) => sum + m.return, 0) / recent3.length;
    const avgPeriod = periodMonthsData.reduce((sum, m) => sum + m.return, 0) / periodMonthsData.length;
    
    // Determine trend direction
    if (avgRecent > avgPeriod + 1 && avgRecent > 2) {
      return { text: 'Strong Uptrend', emoji: '📈' };
    } else if (avgRecent > avgPeriod + 0.5) {
      return { text: 'Improving', emoji: '📈' };
    } else if (Math.abs(avgRecent - avgPeriod) < 0.5) {
      return { text: 'Stable', emoji: '➡️' };
    } else if (Math.abs(avgRecent) < 1) {
      return { text: 'Sideways', emoji: '🔄' };
    } else if (avgRecent > avgPeriod - 1 && avgRecent > 0) {
      return { text: 'Recovering', emoji: '📈' };
    } else if (avgRecent < avgPeriod - 1 && avgRecent < 0) {
      return { text: 'Weakening', emoji: '🔽' };
    } else if (avgRecent < -1) {
      return { text: 'Downtrend', emoji: '📉' };
    } else {
      return { text: 'Falling', emoji: '📉' };
    }
  };

  // Calculate average monthly return for selected period
  const calculateAvgMonthlyReturn = (monthlyReturns: Array<{ month: string; return: number }>, periodMonths: number): number => {
    const periodMonthsData = monthlyReturns.slice(-periodMonths);
    if (periodMonthsData.length === 0) return 0;
    const sum = periodMonthsData.reduce((sum, m) => sum + m.return, 0);
    return sum / periodMonthsData.length;
  };

  // Calculate actual monthly return based on holding period and current return
  // This shows what the monthly return would be if evenly distributed over the holding period
  const calculateActualMonthlyReturnFromInvestment = (holding: Holding | undefined): number => {
    if (!holding) return 0;
    
    // Get holding period in months
    let holdingMonths = 0;
    if (holding.holdingPeriodYears !== undefined && holding.holdingPeriodMonths !== undefined) {
      holdingMonths = (holding.holdingPeriodYears || 0) * 12 + (holding.holdingPeriodMonths || 0);
    } else if (holding.asOnDate) {
      const startDate = new Date(holding.asOnDate);
      const endDate = new Date();
      holdingMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                      (endDate.getMonth() - startDate.getMonth());
    }
    
    if (holdingMonths === 0) return 0;
    
    // Calculate from current return
    const currentReturn = holding.investmentAmount && holding.investmentAmount > 0
      ? ((holding.marketValue || 0) - holding.investmentAmount) / holding.investmentAmount * 100
      : (holding.profitLossTillDatePercent || 0);
    
    if (currentReturn === 0) return 0;
    
    // Convert total return to average monthly return
    // If total return is R over N months: (1 + R/100) = (1 + monthlyReturn/100)^N
    // monthlyReturn = 100 * ((1 + R/100)^(1/N) - 1)
    const totalReturnFactor = 1 + (currentReturn / 100);
    const monthlyReturnFactor = Math.pow(totalReturnFactor, 1 / holdingMonths);
    return (monthlyReturnFactor - 1) * 100;
  };

  // Calculate holding period from transactions or holdings data
  const calculateHoldingPeriod = (holding: Holding | undefined): string => {
    if (!holding) return '-';
    
    // Use holdingPeriodYears and holdingPeriodMonths if available
    if (holding.holdingPeriodYears !== undefined && holding.holdingPeriodMonths !== undefined) {
      const years = holding.holdingPeriodYears || 0;
      const months = holding.holdingPeriodMonths || 0;
      if (years === 0 && months === 0) return '-';
      return `${years}Y ${months}M`;
    }
    
    // Calculate from asOnDate if available
    if (holding.asOnDate) {
      const startDate = new Date(holding.asOnDate);
      const endDate = new Date();
      const monthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                         (endDate.getMonth() - startDate.getMonth());
      const years = Math.floor(monthsDiff / 12);
      const months = monthsDiff % 12;
      if (years === 0 && months === 0) return '-';
      return `${years}Y ${months}M`;
    }
    
    // Calculate from first transaction date
    if (transactions.length > 0) {
      const stockTransactions = transactions.filter(t => {
        // Match by ISIN first (preferred)
        if (holding.isin && t.isin) {
          return t.isin === holding.isin;
        }
        // Fallback to stockName matching
        if (t.stockName && holding.stockName) {
          return t.stockName === holding.stockName;
        }
        return false;
      });
      
      if (stockTransactions.length > 0) {
        const buyTransactions = stockTransactions.filter(t => t.buySell === 'BUY');
        if (buyTransactions.length > 0) {
          const firstBuyDate = buyTransactions.reduce((earliest, t) => {
            const txnDate = new Date(t.transactionDate);
            return !earliest || txnDate < earliest ? txnDate : earliest;
          }, null as Date | null);
          
          if (firstBuyDate) {
            const endDate = new Date();
            const monthsDiff = (endDate.getFullYear() - firstBuyDate.getFullYear()) * 12 + 
                               (endDate.getMonth() - firstBuyDate.getMonth());
            const years = Math.floor(monthsDiff / 12);
            const months = monthsDiff % 12;
            if (years === 0 && months === 0) return '-';
            return `${years}Y ${months}M`;
          }
        }
      }
    }
    
    return '-';
  };

  // Get selected period months
  const periodMonths = getPeriodMonths(selectedPeriod);

  // Create a set of ISINs that have performance data
  const stocksWithPerformanceData = new Set(stockPerformance.map(s => s.isin));

  // Include all holdings in leaderboard, even if they don't have performance data
  // Stocks without performance data will show 0 or N/A for calculated metrics
  // Don't filter out holdings - show all holdings even without performance data
  const allHoldingsForLeaderboard = holdings.map(holding => {
    const stockPerf = stockPerformance.find(s => 
      (s.isin && holding.isin && s.isin === holding.isin) ||
      (s.stockName && holding.stockName && 
       s.stockName.trim().toLowerCase().replace(/[.\s]/g, '') === 
       holding.stockName.trim().toLowerCase().replace(/[.\s]/g, ''))
    );
    
    // Always return the holding, with or without performance data
    return stockPerf || {
      isin: holding.isin,
      stockName: holding.stockName,
      monthlyReturns: [],
      averageReturn: 0,
      volatility: 0,
      consistencyIndex: 0,
      positiveStreak: 0,
      negativeStreak: 0,
      aboveThresholdCount: 0,
      currentStreak: 0,
      isPositiveStreak: false,
    };
  });

  // Create performance leaderboard from stocks with performance data
  const performanceLeaderboard = stockPerformance.map(stock => {
    // Try to find matching holding - use case-insensitive matching and handle variations
    const holding = holdings.find(h => {
      // Try ISIN match first (most reliable)
      if (h.isin && stock.isin && h.isin === stock.isin) return true;
      
      // Try stock name match (case-insensitive, handle common variations)
      if (h.stockName && stock.stockName) {
        const holdingName = h.stockName.trim().toLowerCase();
        const stockName = stock.stockName.trim().toLowerCase();
        if (holdingName === stockName) return true;
        
        // Handle common variations (e.g., "Dec.Gold Mines" vs "Dec Gold Mines")
        const holdingNameNormalized = holdingName.replace(/[.\s]/g, '');
        const stockNameNormalized = stockName.replace(/[.\s]/g, '');
        if (holdingNameNormalized === stockNameNormalized) return true;
      }
      
      return false;
    });
    const cagr = calculateCAGR(stock.monthlyReturns, periodMonths);
    const consistency = calculateConsistency(stock.monthlyReturns, periodMonths);
    // Calculate volatility for selected period
    const volatility = calculateVolatility(stock.monthlyReturns, periodMonths);
    const sharpe = calculateSharpe(stock.monthlyReturns, volatility, periodMonths);
    const status = getStatus(cagr, consistency);
    const trend = getTrend(stock, periodMonths);
    // Use selected period average return (based on price movements)
    const avgMonthlyReturn = calculateAvgMonthlyReturn(stock.monthlyReturns, periodMonths);
    // Also calculate actual monthly return based on investment (holding period based)
    const actualMonthlyReturnFromInvestment = calculateActualMonthlyReturnFromInvestment(holding);
    const holdingPeriod = calculateHoldingPeriod(holding);
    
    // Use the price-based avg monthly return, but we'll show actual in a tooltip or use it if it makes more sense
    // For now, keep showing price-based, but we can add actual as a comparison
    
    // Calculate weightage
    const weightage = totalPortfolioValue > 0 && holding
      ? ((holding.marketValue || 0) / totalPortfolioValue) * 100
      : 0;
    
    // Calculate current return from holdings data (calculate it to ensure accuracy)
    let currentReturn = 0;
    if (holding && holding.investmentAmount !== undefined && holding.marketValue !== undefined) {
      const invested = holding.investmentAmount || 0;
      const currentValue = holding.marketValue || 0;
      if (invested > 0) {
        currentReturn = ((currentValue - invested) / invested) * 100;
      } else if (holding.profitLossTillDatePercent !== undefined) {
        // Fallback to stored value if investmentAmount is 0
        currentReturn = holding.profitLossTillDatePercent || 0;
      }
    } else if (holding && holding.profitLossTillDatePercent !== undefined) {
      // Use stored value as fallback
      currentReturn = holding.profitLossTillDatePercent || 0;
    }
    
    // Use price-based CAGR that changes with selected period (not investment-based CAGR)
    // This shows the annualized return based on price movements over the selected period
    const displayCAGR = cagr;
    
    return {
      stockName: stock.stockName,
      isin: stock.isin,
      avgMonthlyReturn,
      actualMonthlyReturnFromInvestment,
      cagr: displayCAGR,
      currentReturn,
      consistency,
      volatility,
      sharpe,
      status,
      trend,
      holdingPeriod,
      weightage,
      holding
    };
  });
  
  // Add holdings that don't have performance data (so they appear in leaderboard)
  const holdingsWithoutPerformance = holdings.filter(h => {
    const hasPerformance = stockPerformance.some(s => 
      (s.isin && h.isin && s.isin === h.isin) ||
      (s.stockName && h.stockName && 
       s.stockName.trim().toLowerCase().replace(/[.\s]/g, '') === 
       h.stockName.trim().toLowerCase().replace(/[.\s]/g, ''))
    );
    return !hasPerformance;
  });
  
  // Add holdings without performance data to leaderboard
  const holdingsWithoutPerfEntries = holdingsWithoutPerformance.map(holding => {
    const currentReturn = holding.investmentAmount && holding.investmentAmount > 0
      ? ((holding.marketValue || 0) - holding.investmentAmount) / holding.investmentAmount * 100
      : (holding.profitLossTillDatePercent || 0);
    
    const weightage = totalPortfolioValue > 0
      ? ((holding.marketValue || 0) / totalPortfolioValue) * 100
      : 0;
    
    return {
      stockName: holding.stockName,
      isin: holding.isin || '',
      avgMonthlyReturn: 0,
      cagr: 0,
      currentReturn,
      consistency: 'N/A',
      volatility: 0,
      sharpe: 0,
      status: { text: 'No Data', emoji: '❓', color: 'text-gray-500' },
      trend: { text: 'No Data', emoji: '➡️' },
      holdingPeriod: calculateHoldingPeriod(holding),
      weightage,
      holding
    };
  });
  
  // Combine both lists - ensure all holdings are included
  // Create a set of all ISINs that are already in the leaderboard
  const leaderboardIsins = new Set([
    ...performanceLeaderboard.map(p => p.isin).filter(Boolean),
    ...holdingsWithoutPerfEntries.map(h => h.isin).filter(Boolean)
  ]);
  
  // Find any holdings that are missing from the leaderboard
  const missingHoldings = holdings.filter(h => 
    h.isin && !leaderboardIsins.has(h.isin)
  );
  
  // Add missing holdings to the leaderboard (these are holdings that somehow got missed)
  const missingHoldingsEntries = missingHoldings.map(holding => {
    const currentReturn = holding.investmentAmount && holding.investmentAmount > 0
      ? ((holding.marketValue || 0) - holding.investmentAmount) / holding.investmentAmount * 100
      : (holding.profitLossTillDatePercent || 0);
    
    const weightage = totalPortfolioValue > 0
      ? ((holding.marketValue || 0) / totalPortfolioValue) * 100
      : 0;
    
    return {
      stockName: holding.stockName,
      isin: holding.isin || '',
      avgMonthlyReturn: 0,
      cagr: 0,
      currentReturn,
      consistency: 'N/A',
      volatility: 0,
      sharpe: 0,
      status: { text: 'No Data', emoji: '❓', color: 'text-gray-500' },
      trend: { text: 'No Data', emoji: '➡️' },
      holdingPeriod: calculateHoldingPeriod(holding),
      weightage,
      holding
    };
  });
  
  // Combine all entries and deduplicate by ISIN (keep the first occurrence)
  const allEntries = [...performanceLeaderboard, ...holdingsWithoutPerfEntries, ...missingHoldingsEntries];
  const seenIsins = new Set<string>();
  const deduplicatedEntries = allEntries.filter(item => {
    if (!item.isin || !item.holding) {
      if (!item.holding) {
        console.warn(`Stock excluded from leaderboard (no matching holding): ${item.stockName} (ISIN: ${item.isin})`);
      }
      return false;
    }
    if (seenIsins.has(item.isin)) {
      return false; // Skip duplicates
    }
    seenIsins.add(item.isin);
    return true;
  });
  
  const allLeaderboardEntries = deduplicatedEntries
    .sort((a, b) => {
      // Sort by CAGR, but put stocks with no data at the end
      if (a.cagr === 0 && b.cagr === 0) {
        // Both have no data, sort by current return
        return b.currentReturn - a.currentReturn;
      }
      if (a.cagr === 0) return 1; // a has no data, put it after
      if (b.cagr === 0) return -1; // b has no data, put it after
      return b.cagr - a.cagr; // Sort by CAGR descending
    })
    .map((item, index) => ({
      ...item,
      rank: index + 1
    }));

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
    return `${val >= 0 ? '+' : ''}${val.toFixed(1)}`;
  };

  // Get rank emoji
  const getRankEmoji = (rank: number): string => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '';
  };

  return (
    <div className="space-y-6">
      {/* 1. Performance Leaderboard */}
      {allLeaderboardEntries.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">
                Performance Leaderboard (Best ↔ Worst Stock Ranking)
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Rank all stocks by {selectedPeriod === '1Y' ? '1-year' : selectedPeriod === '3M' ? '3-month' : selectedPeriod === '6M' ? '6-month' : selectedPeriod === '2Y' ? '2-year' : selectedPeriod === '3Y' ? '3-year' : '5-year'} CAGR and consistency, with clear separation of top and bottom performers.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 font-medium">Period:</span>
              {(['3M', '6M', '1Y', '2Y', '3Y', '5Y'] as PeriodType[]).map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    selectedPeriod === period
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Rank</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Stock Name</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Portfolio Weight (%)</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Total Return % (to date)</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    <div className="flex items-center justify-center gap-1 relative">
                      Avg. Monthly Return
                      <div className="relative inline-block">
                        <span 
                          className="cursor-help text-blue-500 hover:text-blue-700 font-bold text-xs"
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltipPosition({
                              top: rect.top - 10,
                              left: rect.left + rect.width / 2
                            });
                            setTooltipContent('avgMonthlyReturn');
                            setShowSharpeTooltip(true);
                          }}
                          onMouseLeave={() => setShowSharpeTooltip(false)}
                        >
                          ?
                        </span>
                      </div>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">CAGR</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Consistent Months (&gt; 1.5% Gain)</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Volatility</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    <div className="flex items-center justify-center gap-1 relative">
                      Sharpe Ratio
                      <div className="relative inline-block">
                        <span 
                          ref={sharpeIconRef}
                          className="cursor-help text-blue-500 hover:text-blue-700 font-bold"
                          onMouseEnter={(e) => {
                            if (sharpeIconRef.current) {
                              const rect = sharpeIconRef.current.getBoundingClientRect();
                              setTooltipPosition({
                                top: rect.top - 10,
                                left: rect.left + rect.width / 2
                              });
                            }
                            setTooltipContent('sharpe');
                            setShowSharpeTooltip(true);
                          }}
                          onMouseLeave={() => setShowSharpeTooltip(false)}
                        >
                          ?
                        </span>
                      </div>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Technical / Sentiment Status</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Time Held</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    <div>Recent Trend</div>
                    <div className="text-[10px] font-normal normal-case">(Last 12 Months)</div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {allLeaderboardEntries.map((item, idx) => {
                  const isTopPerformer = item.rank <= 3;
                  const isBottomPerformer = item.rank > allLeaderboardEntries.length - 3;
                  const hasNegativeReturn = item.currentReturn < 0;
                  
                  // Prioritize negative returns with strong red background
                  let rowBgClass = '';
                  if (hasNegativeReturn) {
                    rowBgClass = 'bg-red-200'; // Stronger red background for negative returns
                  } else if (isTopPerformer) {
                    rowBgClass = 'bg-green-50';
                  } else if (isBottomPerformer) {
                    rowBgClass = 'bg-red-50';
                  } else {
                    rowBgClass = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                  }
                  
                  return (
                    <tr key={item.isin} className={`${rowBgClass} hover:bg-opacity-80 transition-colors`}>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className="font-bold text-gray-700">
                          {getRankEmoji(item.rank)} {item.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                        {item.stockName}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-gray-700 font-medium">
                        {item.weightage.toFixed(2)}%
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-center font-semibold ${item.currentReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPercent(item.currentReturn)}%
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-center font-semibold ${item.avgMonthlyReturn >= 0 ? 'text-green-600' : 'text-red-600'}`} title={`Price-based: ${formatPercent(item.avgMonthlyReturn)}%${item.actualMonthlyReturnFromInvestment !== undefined && !isNaN(item.actualMonthlyReturnFromInvestment) ? ` | Investment-based: ${formatPercent(item.actualMonthlyReturnFromInvestment)}%` : ''}`}>
                        {formatPercent(item.avgMonthlyReturn)}%
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-center font-semibold ${item.cagr >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPercent(item.cagr)}%
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-gray-700">
                        {item.consistency}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-gray-700">
                        {item.volatility.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-gray-700">
                        {item.sharpe.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className={`font-medium ${item.status.color}`}>
                          {item.status.emoji} {item.status.text}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-gray-700 font-medium">
                        {item.holdingPeriod}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-gray-700">
                        <span className="flex items-center justify-center gap-1">
                          {item.trend.emoji} {item.trend.text}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Consistency Tables */}
      <ConsistencyTables stockPerformance={stockPerformance} holdings={holdings} />
      
      {/* Tooltip using Portal */}
      {showSharpeTooltip && typeof window !== 'undefined' && createPortal(
        <div 
          className="fixed z-[99999] w-80 bg-gray-900 text-white text-xs rounded-lg shadow-lg p-4 pointer-events-auto"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            transform: 'translate(-50%, -100%)',
            marginTop: '-10px'
          }}
          onMouseEnter={() => setShowSharpeTooltip(true)}
          onMouseLeave={() => setShowSharpeTooltip(false)}
        >
          {tooltipContent === 'sharpe' ? (
            <>
              <div className="font-semibold mb-2">Sharpe Ratio</div>
              <div className="space-y-2 text-left">
                <div><strong>Formula:</strong> (Annualized Return - Risk-Free Rate) ÷ Volatility</div>
                <div><strong>Risk-Free Rate:</strong> 7.5% (Indian govt. bonds)</div>
                <div className="border-t border-gray-700 pt-2 mt-2">
                  <div><strong>Interpretation:</strong></div>
                  <div>• &lt; 1.0: Below average</div>
                  <div>• 1.0 - 2.0: Good</div>
                  <div>• 2.0 - 3.0: Very good</div>
                  <div>• &gt; 3.0: Excellent</div>
                </div>
                <div className="border-t border-gray-700 pt-2 mt-2 text-xs">
                  Shows risk-adjusted return: how much extra return per unit of risk
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold mb-2">Average Monthly Return</div>
              <div className="space-y-2 text-left">
                <div><strong>Definition:</strong> Arithmetic mean of monthly price movements over the <strong>selected period</strong> (e.g., 1Y, 2Y).</div>
                <div className="border-t border-gray-700 pt-2 mt-2">
                  <div><strong>How it's calculated:</strong></div>
                  <div>Arithmetic Mean = (Sum of all monthly returns) ÷ Number of months</div>
                  <div className="text-xs mt-1 text-gray-400">⚠️ This is NOT the same as CAGR's geometric mean</div>
                </div>
                <div className="border-t border-gray-700 pt-2 mt-2">
                  <div><strong>Why Avg Monthly Return ≠ CAGR:</strong></div>
                  <div className="text-xs mt-1">
                    • <strong>Avg Monthly Return (2.3%):</strong> Arithmetic mean - simple average<br/>
                    • <strong>CAGR (24.7%):</strong> Geometric mean - compounds returns<br/>
                    • With volatility, geometric mean is always ≤ arithmetic mean<br/>
                    • Example: If avg is 2.3%, geometric CAGR ≈ 24.7% (lower due to volatility)
                  </div>
                </div>
              </div>
            </>
          )}
          <div className="absolute left-1/2 top-full transform -translate-x-1/2 -mt-1">
            <div className="border-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}


