'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ConsistencyTables from './ConsistencyTables';

/* ─── Types ──────────────────────────────────────────────────────────────── */
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
  volumeTrend?: { avg3YearVolume: number; avgRecentVolume: number; percentChange: number };
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
  transactions?: Array<{ isin?: string; stockName?: string; transactionDate: Date | string; buySell: string }>;
}
type PeriodType = '3M' | '6M' | '1Y' | '2Y' | '3Y' | '5Y';
type SortKey = 'rank' | 'stockName' | 'weightage' | 'currentReturn' | 'avgMonthlyReturn' | 'cagr' | 'volatility' | 'sharpe' | 'sortino';
type TooltipType = 'sharpe' | 'sortino' | 'avgMonthlyReturn';

/* ─── Pure calculation functions (outside component — no recreation on render) */
const RISK_FREE_RATE = 7.5;

function getPeriodMonths(p: PeriodType): number {
  return { '3M': 3, '6M': 6, '1Y': 12, '2Y': 24, '3Y': 36, '5Y': 60 }[p];
}

function calcCAGR(returns: Array<{ return: number }>, n: number): number {
  const slice = returns.slice(-n);
  if (!slice.length) return 0;
  const total = slice.reduce((p, m) => p * (1 + m.return / 100), 1);
  return (Math.pow(total, 12 / slice.length) - 1) * 100;
}

function calcConsistency(returns: Array<{ return: number }>, n: number): string {
  const slice = returns.slice(-n);
  if (!slice.length) return '0 / 0';
  return `${slice.filter(m => m.return >= 1.5).length} / ${slice.length}`;
}

function calcVolatility(returns: Array<{ return: number }>, n: number): number {
  const slice = returns.slice(-n);
  if (!slice.length) return 0;
  const avg = slice.reduce((s, m) => s + m.return, 0) / slice.length;
  return Math.sqrt(slice.reduce((s, m) => s + (m.return - avg) ** 2, 0) / slice.length);
}

function calcSharpe(returns: Array<{ return: number }>, vol: number, n: number): number {
  if (vol === 0 || !returns.length) return 0;
  const slice = returns.slice(-n);
  if (!slice.length) return 0;
  const total = slice.reduce((p, m) => p * (1 + m.return / 100), 1);
  const ann = (Math.pow(total, 12 / slice.length) - 1) * 100;
  const annVol = vol * Math.sqrt(12);
  return annVol === 0 ? 0 : (ann - RISK_FREE_RATE) / annVol;
}

function calcSortino(returns: Array<{ return: number }>, n: number): number {
  const slice = returns.slice(-n);
  if (!slice.length) return 0;
  const rs = slice.map(m => m.return);
  const total = rs.reduce((p, r) => p * (1 + r / 100), 1);
  const ann = (Math.pow(total, 12 / rs.length) - 1) * 100;
  const neg = rs.filter(r => r < 0);
  const dVar = rs.length > 0 ? neg.reduce((s, r) => s + r ** 2, 0) / rs.length : 0;
  const dDev = Math.sqrt(dVar) * Math.sqrt(12);
  if (dDev === 0) return ann > RISK_FREE_RATE ? 99 : 0;
  return (ann - RISK_FREE_RATE) / dDev;
}

function calcAvgMonthly(returns: Array<{ return: number }>, n: number): number {
  const slice = returns.slice(-n);
  return slice.length ? slice.reduce((s, m) => s + m.return, 0) / slice.length : 0;
}

function getStatus(cagr: number, consistency: string): { text: string; emoji: string; cssColor: string; bgColor: string } {
  const [above, total] = consistency.split(' / ').map(Number);
  const pct = total > 0 ? (above / total) * 100 : 0;
  if (cagr > 40 && pct >= 70)  return { text: 'Best Performer', emoji: '⭐', cssColor: '#f59e0b', bgColor: 'rgba(245,158,11,0.12)' };
  if (cagr > 20 && pct >= 50)  return { text: 'Positive',       emoji: '✅', cssColor: 'var(--gain)', bgColor: 'rgba(74,222,128,0.1)' };
  if (cagr > 10 && pct >= 40)  return { text: 'Moderate',       emoji: '⚠️', cssColor: 'var(--warn)', bgColor: 'rgba(251,191,36,0.1)' };
  if (cagr > 0 && pct < 40)    return { text: 'Volatile',       emoji: '⚠️', cssColor: 'var(--warn)', bgColor: 'rgba(251,191,36,0.1)' };
  if (cagr > -5)                return { text: 'Neutral',        emoji: '🟡', cssColor: 'var(--text-mid)', bgColor: 'rgba(148,163,184,0.1)' };
  if (cagr > -15)               return { text: 'Weak',           emoji: '🔴', cssColor: 'var(--loss)', bgColor: 'rgba(248,113,113,0.1)' };
  if (cagr > -30)               return { text: 'Poor',           emoji: '🔴', cssColor: 'var(--loss)', bgColor: 'rgba(248,113,113,0.1)' };
  return                               { text: 'Worst',          emoji: '🚨', cssColor: 'var(--loss)', bgColor: 'rgba(248,113,113,0.15)' };
}

function getTrend(stock: StockPerformance, n: number): { text: string; emoji: string; color: string } {
  if (stock.monthlyReturns.length < 3) return { text: 'Insufficient', emoji: '➡️', color: 'var(--text-lo)' };
  const slice = stock.monthlyReturns.slice(-n);
  if (!slice.length) return { text: 'Insufficient', emoji: '➡️', color: 'var(--text-lo)' };
  const recent3 = stock.monthlyReturns.slice(-3);
  const avgR = recent3.reduce((s, m) => s + m.return, 0) / recent3.length;
  const avgP = slice.reduce((s, m) => s + m.return, 0) / slice.length;
  if (avgR > avgP + 1 && avgR > 2)            return { text: 'Strong Uptrend', emoji: '📈', color: '#4ade80' };
  if (avgR > avgP + 0.5)                      return { text: 'Improving',      emoji: '📈', color: '#86efac' };
  if (Math.abs(avgR - avgP) < 0.5)            return { text: 'Stable',         emoji: '➡️', color: 'var(--text-mid)' };
  if (Math.abs(avgR) < 1)                     return { text: 'Sideways',       emoji: '🔄', color: 'var(--text-lo)' };
  if (avgR > avgP - 1 && avgR > 0)            return { text: 'Recovering',     emoji: '📈', color: '#fbbf24' };
  if (avgR < avgP - 1 && avgR < 0)            return { text: 'Weakening',      emoji: '🔽', color: '#fb923c' };
  if (avgR < -1)                              return { text: 'Downtrend',      emoji: '📉', color: '#f87171' };
  return                                             { text: 'Falling',        emoji: '📉', color: '#f87171' };
}

function calcHoldingPeriod(
  holding: Holding | undefined,
  transactions: Array<{ isin?: string; stockName?: string; transactionDate: Date | string; buySell: string }>
): string {
  if (!holding) return '-';
  if (holding.holdingPeriodYears !== undefined && holding.holdingPeriodMonths !== undefined) {
    const y = holding.holdingPeriodYears || 0, m = holding.holdingPeriodMonths || 0;
    return y === 0 && m === 0 ? '-' : `${y}Y ${m}M`;
  }
  if (holding.asOnDate) {
    const start = new Date(holding.asOnDate), now = new Date();
    const diff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    const y = Math.floor(diff / 12), m = diff % 12;
    return y === 0 && m === 0 ? '-' : `${y}Y ${m}M`;
  }
  if (transactions.length > 0) {
    const buys = transactions.filter(t =>
      t.buySell === 'BUY' && (
        (holding.isin && t.isin && t.isin === holding.isin) ||
        (t.stockName && holding.stockName && t.stockName === holding.stockName)
      )
    );
    if (buys.length > 0) {
      const first = buys.reduce<Date | null>((e, t) => {
        const d = new Date(t.transactionDate);
        return !e || d < e ? d : e;
      }, null);
      if (first) {
        const now = new Date();
        const diff = (now.getFullYear() - first.getFullYear()) * 12 + (now.getMonth() - first.getMonth());
        const y = Math.floor(diff / 12), m = diff % 12;
        return y === 0 && m === 0 ? '-' : `${y}Y ${m}M`;
      }
    }
  }
  return '-';
}

function calcActualMonthly(holding: Holding | undefined): number {
  if (!holding) return 0;
  let months = 0;
  if (holding.holdingPeriodYears !== undefined && holding.holdingPeriodMonths !== undefined) {
    months = (holding.holdingPeriodYears || 0) * 12 + (holding.holdingPeriodMonths || 0);
  } else if (holding.asOnDate) {
    const s = new Date(holding.asOnDate), n = new Date();
    months = (n.getFullYear() - s.getFullYear()) * 12 + (n.getMonth() - s.getMonth());
  }
  if (months === 0) return 0;
  const ret = holding.investmentAmount > 0
    ? ((holding.marketValue || 0) - holding.investmentAmount) / holding.investmentAmount * 100
    : (holding.profitLossTillDatePercent || 0);
  if (ret === 0) return 0;
  return (Math.pow(1 + ret / 100, 1 / months) - 1) * 100;
}

/* ─── Skeleton loader ────────────────────────────────────────────────────── */
function Skeleton() {
  return (
    <div className="card p-6 space-y-4 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-5 w-48 rounded-lg" style={{ background: 'var(--bg-raised)' }} />
          <div className="h-3 w-32 rounded-lg" style={{ background: 'var(--bg-raised)' }} />
        </div>
        <div className="flex gap-1.5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-7 w-9 rounded-md" style={{ background: 'var(--bg-raised)' }} />
          ))}
        </div>
      </div>
      {/* Aggregate tiles */}
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 rounded-xl" style={{ background: 'var(--bg-raised)' }} />
        ))}
      </div>
      {/* Table skeleton */}
      <div className="space-y-2 pt-2">
        <div className="h-8 rounded-lg" style={{ background: 'var(--bg-raised)' }} />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-11 rounded-lg" style={{ background: 'var(--bg-raised)', opacity: 1 - i * 0.08 }} />
        ))}
      </div>
    </div>
  );
}

/* ─── Sort icon ──────────────────────────────────────────────────────────── */
function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span className="ml-1 inline-flex flex-col" style={{ opacity: active ? 1 : 0.3, transform: 'translateY(1px)' }}>
      <svg width="8" height="5" viewBox="0 0 8 5" fill={active && dir === 'asc' ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 1 }}>
        <path d="M1 4L4 1L7 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <svg width="8" height="5" viewBox="0 0 8 5" fill={active && dir === 'desc' ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="1.5">
        <path d="M1 1L4 4L7 1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function PerformanceAnalyticsCharts({
  clientId = '994826', holdings = [], transactions = [],
}: PerformanceAnalyticsChartsProps) {
  const [stockPerformance, setStockPerformance] = useState<StockPerformance[]>([]);
  const [loading, setLoading]               = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('1Y');
  const [showTooltip, setShowTooltip]       = useState(false);
  const [tooltipContent, setTooltipContent] = useState<TooltipType>('sharpe');
  const [tooltipPos, setTooltipPos]         = useState({ top: 0, left: 0 });
  const [sortKey, setSortKey]               = useState<SortKey>('cagr');
  const [sortDir, setSortDir]               = useState<'asc' | 'desc'>('desc');

  /* Period-level cache — skip API if already fetched */
  const cache = useRef<Map<string, StockPerformance[]>>(new Map());

  const fetchData = useCallback(async () => {
    const key = `${clientId}-${selectedPeriod}`;
    if (cache.current.has(key)) {
      setStockPerformance(cache.current.get(key)!);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const n = getPeriodMonths(selectedPeriod);
      const res  = await fetch(`/api/stock-analytics?clientId=${clientId}&periodMonths=${n}`);
      const data = await res.json();
      const perf = data.stockPerformance || [];
      cache.current.set(key, perf);
      setStockPerformance(perf);
    } catch (e) {
      console.error('Error fetching performance analytics:', e);
    } finally {
      setLoading(false);
    }
  }, [clientId, selectedPeriod]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const periodMonths = useMemo(() => getPeriodMonths(selectedPeriod), [selectedPeriod]);
  const totalPortfolioValue = useMemo(() => holdings.reduce((s, h) => s + (h.marketValue || 0), 0), [holdings]);

  /* ── Build full leaderboard (memoised) ──────────────────────────────────── */
  const allLeaderboardEntries = useMemo(() => {
    const buildEntry = (stock: StockPerformance, holding: Holding | undefined) => {
      const vol         = calcVolatility(stock.monthlyReturns, periodMonths);
      const cagr        = calcCAGR(stock.monthlyReturns, periodMonths);
      const consistency = calcConsistency(stock.monthlyReturns, periodMonths);
      const sharpe      = calcSharpe(stock.monthlyReturns, vol, periodMonths);
      const sortino     = calcSortino(stock.monthlyReturns, periodMonths);
      const avgMonthly  = calcAvgMonthly(stock.monthlyReturns, periodMonths);
      const status      = getStatus(cagr, consistency);
      const trend       = getTrend(stock, periodMonths);
      const holdPeriod  = calcHoldingPeriod(holding, transactions);
      const actMonthly  = calcActualMonthly(holding);
      const weightage   = totalPortfolioValue > 0 && holding
        ? ((holding.marketValue || 0) / totalPortfolioValue) * 100 : 0;
      let currentReturn = 0;
      if (holding) {
        const inv = holding.investmentAmount || 0;
        const mv  = holding.marketValue || 0;
        currentReturn = inv > 0 ? ((mv - inv) / inv) * 100 : (holding.profitLossTillDatePercent || 0);
      }
      return { stockName: stock.stockName, isin: stock.isin, cagr, consistency, volatility: vol,
               sharpe, sortino, avgMonthlyReturn: avgMonthly, actualMonthlyReturn: actMonthly,
               currentReturn, status, trend, holdingPeriod: holdPeriod, weightage, holding };
    };

    const findHolding = (stock: StockPerformance) =>
      holdings.find(h =>
        (h.isin && stock.isin && h.isin === stock.isin) ||
        (h.stockName && stock.stockName &&
          h.stockName.trim().toLowerCase().replace(/[.\s]/g, '') ===
          stock.stockName.trim().toLowerCase().replace(/[.\s]/g, ''))
      );

    const noData = (h: Holding) => ({
      stockName: h.stockName, isin: h.isin || '',
      cagr: 0, consistency: 'N/A', volatility: 0, sharpe: 0, sortino: 0,
      avgMonthlyReturn: 0, actualMonthlyReturn: 0,
      currentReturn: h.investmentAmount > 0
        ? ((h.marketValue || 0) - h.investmentAmount) / h.investmentAmount * 100
        : (h.profitLossTillDatePercent || 0),
      status: { text: 'No Data', emoji: '❓', cssColor: 'var(--text-lo)', bgColor: 'rgba(148,163,184,0.08)' },
      trend: { text: 'No Data', emoji: '➡️', color: 'var(--text-lo)' },
      holdingPeriod: calcHoldingPeriod(h, transactions),
      weightage: totalPortfolioValue > 0 ? ((h.marketValue || 0) / totalPortfolioValue) * 100 : 0,
      holding: h,
    });

    const perfEntries   = stockPerformance.map(s => buildEntry(s, findHolding(s)));
    const matchedIsins  = new Set(perfEntries.map(e => e.isin).filter(Boolean));
    const noDataEntries = holdings.filter(h => h.isin && !matchedIsins.has(h.isin)).map(noData);

    const seen = new Set<string>();
    return [...perfEntries, ...noDataEntries]
      .filter(e => {
        if (!e.isin || !e.holding) return false;
        if (seen.has(e.isin)) return false;
        seen.add(e.isin);
        return true;
      })
      .sort((a, b) => {
        if (a.cagr === 0 && b.cagr === 0) return b.currentReturn - a.currentReturn;
        if (a.cagr === 0) return 1;
        if (b.cagr === 0) return -1;
        return b.cagr - a.cagr;
      })
      .map((e, i) => ({ ...e, rank: i + 1 }));
  }, [stockPerformance, holdings, transactions, periodMonths, totalPortfolioValue]);

  /* ── Aggregate metrics (memoised) ───────────────────────────────────────── */
  const agg = useMemo(() => {
    const withData   = allLeaderboardEntries.filter(e => e.cagr !== 0 || e.sharpe !== 0);
    const totalW     = withData.reduce((s, e) => s + e.weightage, 0) || 1;
    return {
      cagr:     withData.reduce((s, e) => s + e.cagr    * e.weightage, 0) / totalW,
      sharpe:   withData.reduce((s, e) => s + e.sharpe  * e.weightage, 0) / totalW,
      sortino:  withData.reduce((s, e) => s + e.sortino * e.weightage, 0) / totalW,
      uptrend:  allLeaderboardEntries.filter(e =>
        ['Strong Uptrend', 'Improving', 'Recovering'].includes(e.trend.text)).length,
      total:    allLeaderboardEntries.length,
    };
  }, [allLeaderboardEntries]);

  /* ── Sorted entries ─────────────────────────────────────────────────────── */
  const sortedEntries = useMemo(() => {
    const mul = sortDir === 'desc' ? -1 : 1;
    return [...allLeaderboardEntries].sort((a, b) => {
      switch (sortKey) {
        case 'rank':            return mul * (a.rank - b.rank);
        case 'stockName':       return mul * a.stockName.localeCompare(b.stockName);
        case 'weightage':       return mul * (a.weightage - b.weightage);
        case 'currentReturn':   return mul * (a.currentReturn - b.currentReturn);
        case 'avgMonthlyReturn':return mul * (a.avgMonthlyReturn - b.avgMonthlyReturn);
        case 'cagr':            return mul * (a.cagr - b.cagr);
        case 'volatility':      return mul * (a.volatility - b.volatility);
        case 'sharpe':          return mul * (a.sharpe - b.sharpe);
        case 'sortino':         return mul * (a.sortino - b.sortino);
        default:                return 0;
      }
    });
  }, [allLeaderboardEntries, sortKey, sortDir]);

  /* ── Handlers ───────────────────────────────────────────────────────────── */
  const toggleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d === 'desc' ? 'asc' : 'desc'); return key; }
      setSortDir('desc');
      return key;
    });
  }, []);

  const openTooltip = useCallback((e: React.MouseEvent, content: TooltipType) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTooltipPos({ top: r.top - 10, left: r.left + r.width / 2 });
    setTooltipContent(content);
    setShowTooltip(true);
  }, []);

  const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
  const rankEmoji = (r: number) => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`;
  const rankColor = (r: number) => r === 1 ? '#f59e0b' : r === 2 ? '#94a3b8' : r === 3 ? '#cd7f32' : 'var(--text-mid)';
  const periodLabel: Record<PeriodType, string> = {
    '3M': '3-month', '6M': '6-month', '1Y': '1-year', '2Y': '2-year', '3Y': '3-year', '5Y': '5-year',
  };

  /* ── Column definitions ─────────────────────────────────────────────────── */
  const cols: Array<{ label: string; key?: SortKey; align?: 'left' | 'center'; info?: TooltipType; fixed?: boolean }> = [
    { label: 'Rank',           key: 'rank',             align: 'center', fixed: true },
    { label: 'Stock',          key: 'stockName',        align: 'left'   },
    { label: 'Weight',         key: 'weightage',        align: 'center' },
    { label: 'Total Return',   key: 'currentReturn',    align: 'center' },
    { label: 'Avg Monthly',    key: 'avgMonthlyReturn', align: 'center', info: 'avgMonthlyReturn' },
    { label: 'CAGR',           key: 'cagr',             align: 'center' },
    { label: 'Consistency',                              align: 'center' },
    { label: 'Volatility',     key: 'volatility',       align: 'center' },
    { label: 'Sharpe',         key: 'sharpe',           align: 'center', info: 'sharpe' },
    { label: 'Sortino',        key: 'sortino',          align: 'center', info: 'sortino' },
    { label: 'Status',                                  align: 'center' },
    { label: 'Held',                                    align: 'center' },
    { label: 'Trend',                                   align: 'center' },
  ];

  /* ── Render ─────────────────────────────────────────────────────────────── */
  if (loading) return <Skeleton />;

  if (stockPerformance.length === 0 && allLeaderboardEntries.length === 0) return (
    <div className="card flex items-center justify-center h-40">
      <p style={{ color: 'var(--text-lo)' }}>No performance data available</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ── Performance Leaderboard ─────────────────────────────────────────── */}
      {allLeaderboardEntries.length > 0 && (
        <div className="card p-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
                  style={{ background: 'linear-gradient(135deg,#a78bfa,#38bdf8)' }}>🏆</div>
                <h3 className="text-base font-black" style={{ color: 'var(--text-hi)', letterSpacing: '-0.02em' }}>
                  Performance Leaderboard
                </h3>
              </div>
              <p className="text-xs mt-1 ml-10" style={{ color: 'var(--text-lo)' }}>
                Ranked by {periodLabel[selectedPeriod]} CAGR · click column headers to sort
              </p>
            </div>
            <div className="flex items-center gap-1">
              {(['3M', '6M', '1Y', '2Y', '3Y', '5Y'] as PeriodType[]).map(p => (
                <button key={p} onClick={() => setSelectedPeriod(p)}
                  className="px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all duration-150"
                  style={selectedPeriod === p
                    ? { background: 'var(--brand)', color: '#fff', boxShadow: '0 2px 8px rgba(99,102,241,0.35)' }
                    : { background: 'var(--bg-raised)', color: 'var(--text-mid)', border: '1px solid var(--border-sm)' }}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Aggregate tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Portfolio CAGR',  val: `${fmt(agg.cagr)}%`,              color: agg.cagr >= 0 ? '#4ade80' : '#f87171', icon: '📈', sub: 'Weighted avg' },
              { label: 'Avg Sharpe',      val: agg.sharpe.toFixed(2),             color: agg.sharpe >= 1 ? '#4ade80' : agg.sharpe >= 0 ? '#fbbf24' : '#f87171', icon: '📐', sub: 'Weighted avg' },
              { label: 'Avg Sortino',     val: agg.sortino.toFixed(2),            color: agg.sortino >= 1 ? '#4ade80' : agg.sortino >= 0 ? '#fbbf24' : '#f87171', icon: '🛡️', sub: 'Weighted avg' },
              { label: 'Uptrend Stocks',  val: `${agg.uptrend} / ${agg.total}`,  color: agg.uptrend > agg.total / 2 ? '#4ade80' : '#fbbf24', icon: '🚀', sub: '≥ Improving' },
            ].map(t => (
              <div key={t.label} className="rounded-xl p-3.5"
                style={{ background: `${t.color}08`, border: `1px solid ${t.color}22` }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">{t.icon}</span>
                  <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{t.label}</span>
                </div>
                <p className="text-xl font-black leading-none" style={{ color: t.color }}>{t.val}</p>
                <p className="text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>{t.sub}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-sm)' }}>
                  {cols.map(col => (
                    <th key={col.label}
                      onClick={() => col.key && toggleSort(col.key)}
                      className={`px-3 py-3 text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${col.align === 'left' ? 'text-left' : 'text-center'} ${col.key ? 'cursor-pointer select-none' : ''}`}
                      style={{ color: sortKey === col.key ? 'var(--brand)' : 'var(--text-muted)' }}>
                      {col.info ? (
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          <span className="cursor-help inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] font-black"
                            style={{ background: 'var(--brand-bg)', color: 'var(--brand)' }}
                            onMouseEnter={e => { e.stopPropagation(); openTooltip(e, col.info!); }}
                            onMouseLeave={() => setShowTooltip(false)}>?</span>
                          {col.key && <SortIcon active={sortKey === col.key} dir={sortDir} />}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          {col.key && <SortIcon active={sortKey === col.key} dir={sortDir} />}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((item, idx) => {
                  const isTop3    = item.rank <= 3 && item.currentReturn >= 0;
                  const isNeg     = item.currentReturn < 0;
                  const isBottom3 = item.rank > agg.total - 3;
                  const rowBg = isNeg
                    ? 'rgba(248,113,113,0.06)'
                    : isTop3   ? 'rgba(74,222,128,0.05)'
                    : isBottom3? 'rgba(248,113,113,0.03)'
                    : idx % 2  ? 'var(--bg-raised)' : 'transparent';

                  return (
                    <tr key={item.isin}
                      style={{ background: rowBg, borderTop: '1px solid var(--border-sm)', transition: 'background 0.1s' }}
                      className="hover:brightness-110">
                      {/* Rank */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className="text-sm font-black" style={{ color: rankColor(item.rank) }}>
                          {rankEmoji(item.rank)}
                        </span>
                      </td>
                      {/* Stock name */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-bold text-[12px]" style={{ color: 'var(--text-hi)' }}>{item.stockName}</span>
                      </td>
                      {/* Weight */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap text-[11px]" style={{ color: 'var(--text-mid)' }}>
                        {item.weightage.toFixed(1)}%
                      </td>
                      {/* Total Return */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className="font-bold text-[11px]" style={{ color: item.currentReturn >= 0 ? '#4ade80' : '#f87171' }}>
                          {fmt(item.currentReturn)}%
                        </span>
                      </td>
                      {/* Avg Monthly */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className="font-semibold text-[11px]" style={{ color: item.avgMonthlyReturn >= 0 ? '#4ade80' : '#f87171' }}>
                          {fmt(item.avgMonthlyReturn)}%
                        </span>
                      </td>
                      {/* CAGR */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className="font-black text-[12px]" style={{ color: item.cagr >= 0 ? '#4ade80' : '#f87171' }}>
                          {fmt(item.cagr)}%
                        </span>
                      </td>
                      {/* Consistency */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap text-[11px]" style={{ color: 'var(--text-mid)' }}>
                        {item.consistency}
                      </td>
                      {/* Volatility */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap text-[11px]" style={{ color: 'var(--text-mid)' }}>
                        {item.volatility.toFixed(1)}%
                      </td>
                      {/* Sharpe */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className="font-bold text-[11px]"
                          style={{ color: item.sharpe >= 1 ? '#4ade80' : item.sharpe >= 0 ? '#fbbf24' : '#f87171' }}>
                          {item.sharpe.toFixed(2)}
                        </span>
                      </td>
                      {/* Sortino */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className="font-bold text-[11px]"
                          style={{ color: item.sortino >= 1 ? '#4ade80' : item.sortino >= 0 ? '#fbbf24' : '#f87171' }}>
                          {item.sortino.toFixed(2)}
                        </span>
                      </td>
                      {/* Status badge */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black"
                          style={{ background: item.status.bgColor, color: item.status.cssColor, border: `1px solid ${item.status.cssColor}30` }}>
                          {item.status.emoji} {item.status.text}
                        </span>
                      </td>
                      {/* Holding period */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap text-[11px]" style={{ color: 'var(--text-mid)' }}>
                        {item.holdingPeriod}
                      </td>
                      {/* Trend */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: item.trend.color }}>
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

      {/* Tooltip portal */}
      {showTooltip && typeof window !== 'undefined' && createPortal(
        <div className="fixed z-[99999] w-80 text-xs rounded-xl shadow-2xl p-4 pointer-events-auto"
          style={{ top: tooltipPos.top, left: tooltipPos.left, transform: 'translate(-50%,-100%) translateY(-8px)',
                   background: 'var(--bg-surface)', border: '1px solid var(--border-md)', color: 'var(--text-hi)' }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}>
          {tooltipContent === 'sharpe' && <>
            <p className="font-black mb-2" style={{ color: 'var(--text-hi)' }}>Sharpe Ratio</p>
            <div className="space-y-1.5 text-[11px]" style={{ color: 'var(--text-mid)' }}>
              <p><strong style={{ color: 'var(--text-hi)' }}>Formula:</strong> (Annualised Return − 7.5%) ÷ Total Volatility</p>
              <div className="pt-2 mt-2 space-y-0.5" style={{ borderTop: '1px solid var(--border-sm)' }}>
                <p className="font-bold mb-1" style={{ color: 'var(--text-hi)' }}>Interpretation</p>
                <p>{'<'} 1.0 — Below average</p>
                <p>1.0 – 2.0 — Good · 2.0 – 3.0 — Very good · {'>'} 3.0 — Excellent</p>
              </div>
            </div>
          </>}
          {tooltipContent === 'sortino' && <>
            <p className="font-black mb-2" style={{ color: 'var(--text-hi)' }}>Sortino Ratio</p>
            <div className="space-y-1.5 text-[11px]" style={{ color: 'var(--text-mid)' }}>
              <p><strong style={{ color: 'var(--text-hi)' }}>Formula:</strong> (Annualised Return − 7.5%) ÷ Downside Deviation</p>
              <p><strong style={{ color: 'var(--text-hi)' }}>vs Sharpe:</strong> Only penalises negative months — upside volatility is good.</p>
              <div className="pt-2 mt-2 space-y-0.5" style={{ borderTop: '1px solid var(--border-sm)' }}>
                <p>Sortino ≥ Sharpe → most volatility is upside ✅</p>
              </div>
            </div>
          </>}
          {tooltipContent === 'avgMonthlyReturn' && <>
            <p className="font-black mb-2" style={{ color: 'var(--text-hi)' }}>Average Monthly Return</p>
            <div className="space-y-1.5 text-[11px]" style={{ color: 'var(--text-mid)' }}>
              <p>Arithmetic mean of monthly price movements over the selected period.</p>
              <div className="pt-2 mt-2" style={{ borderTop: '1px solid var(--border-sm)' }}>
                <p className="font-bold mb-1" style={{ color: 'var(--text-hi)' }}>vs CAGR</p>
                <p>Avg Monthly = arithmetic mean (simple). CAGR = geometric mean (compounds). With volatility, CAGR ≤ Avg Monthly.</p>
              </div>
            </div>
          </>}
          <div className="absolute left-1/2 top-full -translate-x-1/2">
            <div className="border-4 border-transparent" style={{ borderTopColor: 'var(--border-md)' }} />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
