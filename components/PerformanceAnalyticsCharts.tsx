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
  const [tooltipContent, setTooltipContent] = useState<'sharpe' | 'sortino' | 'avgMonthlyReturn'>('sharpe');
  const sharpeIconRef = useRef<HTMLSpanElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

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
        <div style={{ color: 'var(--text-lo)' }}>Loading performance analytics…</div>
      </div>
    );
  }

  if (stockPerformance.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div style={{ color: 'var(--text-lo)' }}>No performance data available</div>
      </div>
    );
  }

  const totalPortfolioValue = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0);

  const calculateCAGR = (monthlyReturns: Array<{ month: string; return: number }>, periodMonths: number): number => {
    if (monthlyReturns.length === 0) return 0;
    const periodMonthsData = monthlyReturns.slice(-periodMonths);
    if (periodMonthsData.length === 0) return 0;
    const totalReturn = periodMonthsData.reduce((product, m) => product * (1 + m.return / 100), 1);
    const annualizedReturn = Math.pow(totalReturn, 12 / periodMonthsData.length) - 1;
    return annualizedReturn * 100;
  };

  const calculateConsistency = (monthlyReturns: Array<{ month: string; return: number }>, periodMonths: number): string => {
    const periodMonthsData = monthlyReturns.slice(-periodMonths);
    const totalMonths = periodMonthsData.length;
    if (totalMonths === 0) return '0 / 0';
    const aboveThresholdMonths = periodMonthsData.filter(m => m.return >= 1.5).length;
    return `${aboveThresholdMonths} / ${totalMonths}`;
  };

  const RISK_FREE_RATE = 7.5;

  const calculateSharpe = (monthlyReturns: Array<{ month: string; return: number }>, volatility: number, periodMonths: number): number => {
    if (volatility === 0 || monthlyReturns.length === 0) return 0;
    const periodMonthsData = monthlyReturns.slice(-periodMonths);
    if (periodMonthsData.length === 0) return 0;
    const totalReturn = periodMonthsData.reduce((product, m) => product * (1 + m.return / 100), 1);
    const annualizedReturn = Math.pow(totalReturn, 12 / periodMonthsData.length) - 1;
    const annualizedReturnPercent = annualizedReturn * 100;
    const annualizedVolatility = volatility * Math.sqrt(12);
    if (annualizedVolatility === 0) return 0;
    return (annualizedReturnPercent - RISK_FREE_RATE) / annualizedVolatility;
  };

  // Sortino Ratio — penalises only downside deviation, not total volatility
  const calculateSortino = (monthlyReturns: Array<{ month: string; return: number }>, periodMonths: number): number => {
    const periodMonthsData = monthlyReturns.slice(-periodMonths);
    if (periodMonthsData.length === 0) return 0;
    const returns = periodMonthsData.map(m => m.return);
    const totalReturn = returns.reduce((product, r) => product * (1 + r / 100), 1);
    const annualizedReturn = (Math.pow(totalReturn, 12 / returns.length) - 1) * 100;
    // Downside variance uses total count in denominator (consistent with StockAnalytics)
    const downsideReturns = returns.filter(r => r < 0);
    const downsideVariance = returns.length > 0
      ? downsideReturns.reduce((s, r) => s + Math.pow(r, 2), 0) / returns.length
      : 0;
    const downsideDeviation = Math.sqrt(downsideVariance);
    const annualizedDD = downsideDeviation * Math.sqrt(12);
    if (annualizedDD === 0) return annualizedReturn > RISK_FREE_RATE ? 99 : 0;
    return (annualizedReturn - RISK_FREE_RATE) / annualizedDD;
  };

  // Status — returns cssColor (a CSS variable string) instead of a Tailwind class
  const getStatus = (cagr: number, consistency: string): { text: string; emoji: string; cssColor: string } => {
    const [aboveThreshold, total] = consistency.split(' / ').map(Number);
    const consistencyPercent = total > 0 ? (aboveThreshold / total) * 100 : 0;
    if (cagr > 40 && consistencyPercent >= 70)
      return { text: 'Best Performer', emoji: '⭐', cssColor: 'var(--warn)' };
    if (cagr > 20 && consistencyPercent >= 50)
      return { text: 'Positive', emoji: '✅', cssColor: 'var(--gain)' };
    if (cagr > 10 && consistencyPercent >= 40)
      return { text: 'Moderate', emoji: '⚠️', cssColor: 'var(--warn)' };
    if (cagr > 0 && consistencyPercent < 40)
      return { text: 'Volatile', emoji: '⚠️', cssColor: 'var(--warn)' };
    if (cagr > -5)
      return { text: 'Neutral', emoji: '🟡', cssColor: 'var(--text-mid)' };
    if (cagr > -15)
      return { text: 'Weak', emoji: '🔴', cssColor: 'var(--loss)' };
    if (cagr > -30)
      return { text: 'Poor', emoji: '🔴', cssColor: 'var(--loss)' };
    return { text: 'Worst Performer', emoji: '🚨', cssColor: 'var(--loss)' };
  };

  const calculateVolatility = (monthlyReturns: Array<{ month: string; return: number }>, periodMonths: number): number => {
    const periodMonthsData = monthlyReturns.slice(-periodMonths);
    if (periodMonthsData.length === 0) return 0;
    const returns = periodMonthsData.map(m => m.return);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    return Math.sqrt(variance);
  };

  const getTrend = (stock: StockPerformance, periodMonths: number): { text: string; emoji: string } => {
    if (stock.monthlyReturns.length < 3)
      return { text: 'Insufficient Data', emoji: '➡️' };
    const periodMonthsData = stock.monthlyReturns.slice(-periodMonths);
    if (periodMonthsData.length === 0)
      return { text: 'Insufficient Data', emoji: '➡️' };
    const recent3 = stock.monthlyReturns.slice(-3);
    const avgRecent = recent3.reduce((sum, m) => sum + m.return, 0) / recent3.length;
    const avgPeriod = periodMonthsData.reduce((sum, m) => sum + m.return, 0) / periodMonthsData.length;
    if (avgRecent > avgPeriod + 1 && avgRecent > 2) return { text: 'Strong Uptrend', emoji: '📈' };
    if (avgRecent > avgPeriod + 0.5) return { text: 'Improving', emoji: '📈' };
    if (Math.abs(avgRecent - avgPeriod) < 0.5) return { text: 'Stable', emoji: '➡️' };
    if (Math.abs(avgRecent) < 1) return { text: 'Sideways', emoji: '🔄' };
    if (avgRecent > avgPeriod - 1 && avgRecent > 0) return { text: 'Recovering', emoji: '📈' };
    if (avgRecent < avgPeriod - 1 && avgRecent < 0) return { text: 'Weakening', emoji: '🔽' };
    if (avgRecent < -1) return { text: 'Downtrend', emoji: '📉' };
    return { text: 'Falling', emoji: '📉' };
  };

  const calculateAvgMonthlyReturn = (monthlyReturns: Array<{ month: string; return: number }>, periodMonths: number): number => {
    const periodMonthsData = monthlyReturns.slice(-periodMonths);
    if (periodMonthsData.length === 0) return 0;
    return periodMonthsData.reduce((sum, m) => sum + m.return, 0) / periodMonthsData.length;
  };

  const calculateActualMonthlyReturnFromInvestment = (holding: Holding | undefined): number => {
    if (!holding) return 0;
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
    const currentReturn = holding.investmentAmount && holding.investmentAmount > 0
      ? ((holding.marketValue || 0) - holding.investmentAmount) / holding.investmentAmount * 100
      : (holding.profitLossTillDatePercent || 0);
    if (currentReturn === 0) return 0;
    const totalReturnFactor = 1 + (currentReturn / 100);
    const monthlyReturnFactor = Math.pow(totalReturnFactor, 1 / holdingMonths);
    return (monthlyReturnFactor - 1) * 100;
  };

  const calculateHoldingPeriod = (holding: Holding | undefined): string => {
    if (!holding) return '-';
    if (holding.holdingPeriodYears !== undefined && holding.holdingPeriodMonths !== undefined) {
      const years = holding.holdingPeriodYears || 0;
      const months = holding.holdingPeriodMonths || 0;
      if (years === 0 && months === 0) return '-';
      return `${years}Y ${months}M`;
    }
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
    if (transactions.length > 0) {
      const stockTransactions = transactions.filter(t => {
        if (holding.isin && t.isin) return t.isin === holding.isin;
        if (t.stockName && holding.stockName) return t.stockName === holding.stockName;
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

  const periodMonths = getPeriodMonths(selectedPeriod);

  // ── Build leaderboard ─────────────────────────────────────────────────────

  const performanceLeaderboard = stockPerformance.map(stock => {
    const holding = holdings.find(h => {
      if (h.isin && stock.isin && h.isin === stock.isin) return true;
      if (h.stockName && stock.stockName) {
        const holdingName = h.stockName.trim().toLowerCase();
        const sName = stock.stockName.trim().toLowerCase();
        if (holdingName === sName) return true;
        if (holdingName.replace(/[.\s]/g, '') === sName.replace(/[.\s]/g, '')) return true;
      }
      return false;
    });
    const cagr = calculateCAGR(stock.monthlyReturns, periodMonths);
    const consistency = calculateConsistency(stock.monthlyReturns, periodMonths);
    const volatility = calculateVolatility(stock.monthlyReturns, periodMonths);
    const sharpe = calculateSharpe(stock.monthlyReturns, volatility, periodMonths);
    const sortino = calculateSortino(stock.monthlyReturns, periodMonths);
    const status = getStatus(cagr, consistency);
    const trend = getTrend(stock, periodMonths);
    const avgMonthlyReturn = calculateAvgMonthlyReturn(stock.monthlyReturns, periodMonths);
    const actualMonthlyReturnFromInvestment = calculateActualMonthlyReturnFromInvestment(holding);
    const holdingPeriod = calculateHoldingPeriod(holding);
    const weightage = totalPortfolioValue > 0 && holding
      ? ((holding.marketValue || 0) / totalPortfolioValue) * 100
      : 0;
    let currentReturn = 0;
    if (holding && holding.investmentAmount !== undefined && holding.marketValue !== undefined) {
      const invested = holding.investmentAmount || 0;
      const currentValue = holding.marketValue || 0;
      if (invested > 0) {
        currentReturn = ((currentValue - invested) / invested) * 100;
      } else if (holding.profitLossTillDatePercent !== undefined) {
        currentReturn = holding.profitLossTillDatePercent || 0;
      }
    } else if (holding && holding.profitLossTillDatePercent !== undefined) {
      currentReturn = holding.profitLossTillDatePercent || 0;
    }
    return {
      stockName: stock.stockName,
      isin: stock.isin,
      avgMonthlyReturn,
      actualMonthlyReturnFromInvestment,
      cagr,
      currentReturn,
      consistency,
      volatility,
      sharpe,
      sortino,
      status,
      trend,
      holdingPeriod,
      weightage,
      holding,
    };
  });

  const holdingsWithoutPerformance = holdings.filter(h => {
    return !stockPerformance.some(s =>
      (s.isin && h.isin && s.isin === h.isin) ||
      (s.stockName && h.stockName &&
        s.stockName.trim().toLowerCase().replace(/[.\s]/g, '') ===
        h.stockName.trim().toLowerCase().replace(/[.\s]/g, ''))
    );
  });

  const noDataEntry = (holding: Holding) => {
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
      actualMonthlyReturnFromInvestment: 0,
      cagr: 0,
      currentReturn,
      consistency: 'N/A',
      volatility: 0,
      sharpe: 0,
      sortino: 0,
      status: { text: 'No Data', emoji: '❓', cssColor: 'var(--text-lo)' },
      trend: { text: 'No Data', emoji: '➡️' },
      holdingPeriod: calculateHoldingPeriod(holding),
      weightage,
      holding,
    };
  };

  const holdingsWithoutPerfEntries = holdingsWithoutPerformance.map(noDataEntry);

  const leaderboardIsins = new Set([
    ...performanceLeaderboard.map(p => p.isin).filter(Boolean),
    ...holdingsWithoutPerfEntries.map(h => h.isin).filter(Boolean),
  ]);
  const missingHoldingsEntries = holdings
    .filter(h => h.isin && !leaderboardIsins.has(h.isin))
    .map(noDataEntry);

  const allEntries = [...performanceLeaderboard, ...holdingsWithoutPerfEntries, ...missingHoldingsEntries];
  const seenIsins = new Set<string>();
  const allLeaderboardEntries = allEntries
    .filter(item => {
      if (!item.isin || !item.holding) return false;
      if (seenIsins.has(item.isin)) return false;
      seenIsins.add(item.isin);
      return true;
    })
    .sort((a, b) => {
      if (a.cagr === 0 && b.cagr === 0) return b.currentReturn - a.currentReturn;
      if (a.cagr === 0) return 1;
      if (b.cagr === 0) return -1;
      return b.cagr - a.cagr;
    })
    .map((item, index) => ({ ...item, rank: index + 1 }));

  // ── Portfolio aggregate metrics ───────────────────────────────────────────
  const entriesWithData = allLeaderboardEntries.filter(e => e.cagr !== 0 || e.sharpe !== 0);
  const totalWeight = entriesWithData.reduce((s, e) => s + e.weightage, 0) || 1;
  const wtAvgCAGR = entriesWithData.reduce((s, e) => s + e.cagr * e.weightage, 0) / totalWeight;
  const wtAvgSharpe = entriesWithData.reduce((s, e) => s + e.sharpe * e.weightage, 0) / totalWeight;
  const wtAvgSortino = entriesWithData.reduce((s, e) => s + e.sortino * e.weightage, 0) / totalWeight;
  const uptrendCount = allLeaderboardEntries.filter(e =>
    e.trend.text === 'Strong Uptrend' || e.trend.text === 'Improving' || e.trend.text === 'Recovering'
  ).length;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const formatPercent = (val: number): string => `${val >= 0 ? '+' : ''}${val.toFixed(1)}`;
  const getRankEmoji = (rank: number): string =>
    rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';

  const openTooltip = (e: React.MouseEvent, content: 'sharpe' | 'sortino' | 'avgMonthlyReturn') => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPosition({ top: rect.top - 10, left: rect.left + rect.width / 2 });
    setTooltipContent(content);
    setShowSharpeTooltip(true);
  };

  const periodLabel = {
    '3M': '3-month', '6M': '6-month', '1Y': '1-year',
    '2Y': '2-year', '3Y': '3-year', '5Y': '5-year',
  }[selectedPeriod];

  return (
    <div className="space-y-6">
      {/* Performance Leaderboard */}
      {allLeaderboardEntries.length > 0 && (
        <div className="card p-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div>
              <h3 className="text-base font-bold text-hi">
                Performance Leaderboard
                <span className="ml-2 text-sm font-normal" style={{ color: 'var(--text-mid)' }}>
                  Best ↔ Worst Ranking
                </span>
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
                Ranked by {periodLabel} CAGR and consistency
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-medium mr-1" style={{ color: 'var(--text-lo)' }}>Period:</span>
              {(['3M', '6M', '1Y', '2Y', '3Y', '5Y'] as PeriodType[]).map(period => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors"
                  style={selectedPeriod === period
                    ? { background: 'var(--brand)', color: '#fff' }
                    : { background: 'var(--bg-raised)', color: 'var(--text-mid)', border: '1px solid var(--border-sm)' }}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>

          {/* Portfolio aggregate bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 p-4 rounded-xl"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
            {[
              {
                label: 'Portfolio CAGR',
                value: `${wtAvgCAGR >= 0 ? '+' : ''}${wtAvgCAGR.toFixed(1)}%`,
                color: wtAvgCAGR >= 0 ? 'var(--gain)' : 'var(--loss)',
                sub: 'Weighted avg',
              },
              {
                label: 'Avg Sharpe',
                value: wtAvgSharpe.toFixed(2),
                color: wtAvgSharpe >= 1 ? 'var(--gain)' : wtAvgSharpe >= 0 ? 'var(--warn)' : 'var(--loss)',
                sub: 'Weighted avg',
              },
              {
                label: 'Avg Sortino',
                value: wtAvgSortino.toFixed(2),
                color: wtAvgSortino >= 1 ? 'var(--gain)' : wtAvgSortino >= 0 ? 'var(--warn)' : 'var(--loss)',
                sub: 'Weighted avg',
              },
              {
                label: 'Uptrend Stocks',
                value: `${uptrendCount} / ${allLeaderboardEntries.length}`,
                color: uptrendCount > allLeaderboardEntries.length / 2 ? 'var(--gain)' : 'var(--warn)',
                sub: 'Uptrend / Improving',
              },
            ].map(({ label, value, color, sub }) => (
              <div key={label} className="text-center">
                <p className="text-xs mb-1" style={{ color: 'var(--text-lo)' }}>{label}</p>
                <p className="text-lg font-bold metric-value" style={{ color }}>{value}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-lo)' }}>{sub}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  {[
                    { label: 'Rank', align: 'center' },
                    { label: 'Stock Name', align: 'left' },
                    { label: 'Weight %', align: 'center' },
                    { label: 'Total Return', align: 'center' },
                    {
                      label: 'Avg Monthly Return',
                      align: 'center',
                      info: { type: 'avgMonthlyReturn' as const },
                    },
                    { label: 'CAGR', align: 'center' },
                    { label: 'Consistent Months (≥1.5%)', align: 'center' },
                    { label: 'Volatility', align: 'center' },
                    {
                      label: 'Sharpe',
                      align: 'center',
                      info: { type: 'sharpe' as const },
                    },
                    {
                      label: 'Sortino',
                      align: 'center',
                      info: { type: 'sortino' as const },
                    },
                    { label: 'Status', align: 'center' },
                    { label: 'Time Held', align: 'center' },
                    { label: 'Trend (Last 12M)', align: 'center' },
                  ].map(col => (
                    <th key={col.label}
                      className={`px-3 py-3 text-xs font-semibold uppercase tracking-wide ${col.align === 'left' ? 'text-left' : 'text-center'}`}
                      style={{ color: 'var(--text-mid)' }}>
                      {col.info ? (
                        <span className="inline-flex items-center justify-center gap-1">
                          {col.label}
                          <span
                            ref={col.info.type === 'sharpe' ? sharpeIconRef : undefined}
                            className="cursor-help inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] font-bold"
                            style={{ background: 'var(--brand-bg)', color: 'var(--brand)' }}
                            onMouseEnter={e => openTooltip(e, col.info!.type)}
                            onMouseLeave={() => setShowSharpeTooltip(false)}
                          >?</span>
                        </span>
                      ) : col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allLeaderboardEntries.map((item, idx) => {
                  const hasNegativeReturn = item.currentReturn < 0;
                  const isTopPerformer = item.rank <= 3 && !hasNegativeReturn;
                  const isBottomPerformer = item.rank > allLeaderboardEntries.length - 3;

                  let rowBg: string;
                  if (hasNegativeReturn) {
                    rowBg = 'color-mix(in srgb, var(--loss) 10%, transparent)';
                  } else if (isTopPerformer) {
                    rowBg = 'color-mix(in srgb, var(--gain) 7%, transparent)';
                  } else if (isBottomPerformer) {
                    rowBg = 'color-mix(in srgb, var(--loss) 5%, transparent)';
                  } else {
                    rowBg = idx % 2 === 0 ? 'transparent' : 'var(--bg-raised)';
                  }

                  return (
                    <tr key={item.isin} style={{ background: rowBg }}>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className="font-bold text-hi text-sm">
                          {getRankEmoji(item.rank)} {item.rank}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-hi text-sm">
                        {item.stockName}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap text-sm metric-value"
                        style={{ color: 'var(--text-mid)' }}>
                        {item.weightage.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap font-semibold text-sm metric-value"
                        style={{ color: item.currentReturn >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                        {formatPercent(item.currentReturn)}%
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap font-semibold text-sm metric-value"
                        style={{ color: item.avgMonthlyReturn >= 0 ? 'var(--gain)' : 'var(--loss)' }}
                        title={`Price-based: ${formatPercent(item.avgMonthlyReturn)}%${'actualMonthlyReturnFromInvestment' in item && !isNaN((item as any).actualMonthlyReturnFromInvestment) ? ` | Investment-based: ${formatPercent((item as any).actualMonthlyReturnFromInvestment)}%` : ''}`}>
                        {formatPercent(item.avgMonthlyReturn)}%
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap font-semibold text-sm metric-value"
                        style={{ color: item.cagr >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                        {formatPercent(item.cagr)}%
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap text-sm"
                        style={{ color: 'var(--text-mid)' }}>
                        {item.consistency}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap text-sm metric-value"
                        style={{ color: 'var(--text-mid)' }}>
                        {item.volatility.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap font-semibold text-sm metric-value"
                        style={{ color: item.sharpe >= 1 ? 'var(--gain)' : item.sharpe >= 0 ? 'var(--warn)' : 'var(--loss)' }}>
                        {item.sharpe.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap font-semibold text-sm metric-value"
                        style={{ color: item.sortino >= 1 ? 'var(--gain)' : item.sortino >= 0 ? 'var(--warn)' : 'var(--loss)' }}>
                        {item.sortino.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap text-sm">
                        <span className="font-medium" style={{ color: item.status.cssColor }}>
                          {item.status.emoji} {item.status.text}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap text-sm font-medium"
                        style={{ color: 'var(--text-mid)' }}>
                        {item.holdingPeriod}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap text-sm"
                        style={{ color: 'var(--text-mid)' }}>
                        <span className="inline-flex items-center justify-center gap-1">
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

      {/* Tooltip via Portal */}
      {showSharpeTooltip && typeof window !== 'undefined' && createPortal(
        <div
          className="fixed z-[99999] w-80 text-xs rounded-xl shadow-xl p-4 pointer-events-auto"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            transform: 'translate(-50%, -100%)',
            marginTop: '-10px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-md)',
            color: 'var(--text-hi)',
          }}
          onMouseEnter={() => setShowSharpeTooltip(true)}
          onMouseLeave={() => setShowSharpeTooltip(false)}
        >
          {tooltipContent === 'sharpe' && (
            <>
              <div className="font-semibold mb-2 text-hi">Sharpe Ratio</div>
              <div className="space-y-2 text-left" style={{ color: 'var(--text-mid)' }}>
                <div><strong className="text-hi">Formula:</strong> (Annualized Return − Risk-Free Rate) ÷ Total Volatility</div>
                <div><strong className="text-hi">Risk-Free Rate:</strong> 7.5% (Indian govt. bonds)</div>
                <div className="pt-2 mt-2" style={{ borderTop: '1px solid var(--border-sm)' }}>
                  <div className="text-hi font-semibold mb-1">Interpretation:</div>
                  <div>• &lt; 1.0 — Below average</div>
                  <div>• 1.0 – 2.0 — Good</div>
                  <div>• 2.0 – 3.0 — Very good</div>
                  <div>• &gt; 3.0 — Excellent</div>
                </div>
              </div>
            </>
          )}
          {tooltipContent === 'sortino' && (
            <>
              <div className="font-semibold mb-2 text-hi">Sortino Ratio</div>
              <div className="space-y-2 text-left" style={{ color: 'var(--text-mid)' }}>
                <div><strong className="text-hi">Formula:</strong> (Annualized Return − Risk-Free Rate) ÷ Downside Deviation</div>
                <div><strong className="text-hi">Key difference vs Sharpe:</strong> Only penalises negative monthly returns, not upside volatility.</div>
                <div className="pt-2 mt-2" style={{ borderTop: '1px solid var(--border-sm)' }}>
                  <div className="text-hi font-semibold mb-1">Interpretation:</div>
                  <div>• &lt; 1.0 — Below average</div>
                  <div>• 1.0 – 2.0 — Good</div>
                  <div>• 2.0 – 3.0 — Very good</div>
                  <div>• &gt; 3.0 — Excellent</div>
                </div>
                <div className="pt-2 mt-2 text-[11px]" style={{ borderTop: '1px solid var(--border-sm)', color: 'var(--text-lo)' }}>
                  Sortino ≥ Sharpe means most volatility is upside — a healthy sign.
                </div>
              </div>
            </>
          )}
          {tooltipContent === 'avgMonthlyReturn' && (
            <>
              <div className="font-semibold mb-2 text-hi">Average Monthly Return</div>
              <div className="space-y-2 text-left" style={{ color: 'var(--text-mid)' }}>
                <div><strong className="text-hi">Definition:</strong> Arithmetic mean of monthly price movements over the selected period.</div>
                <div className="pt-2 mt-2" style={{ borderTop: '1px solid var(--border-sm)' }}>
                  <div className="text-hi font-semibold mb-1">Why it differs from CAGR:</div>
                  <div className="text-[11px] leading-relaxed">
                    • Avg Monthly Return is the arithmetic mean — simple average<br />
                    • CAGR is the geometric mean — compounds returns<br />
                    • With volatility, geometric mean is always ≤ arithmetic mean
                  </div>
                </div>
              </div>
            </>
          )}
          <div className="absolute left-1/2 top-full -translate-x-1/2">
            <div className="border-4 border-transparent" style={{ borderTopColor: 'var(--border-md)' }} />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
