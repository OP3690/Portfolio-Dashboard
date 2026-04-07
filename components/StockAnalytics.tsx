'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency } from '@/lib/utils';
import PerformanceAnalyticsCharts from './PerformanceAnalyticsCharts';
import DetailedAnalysis from './DetailedAnalysis';
import StockScorecard from './StockScorecard';

interface StockAnalyticsProps {
  holdings: Array<{
    stockName: string;
    isin?: string;
    marketValue: number;
    investmentAmount: number;
    profitLossTillDatePercent: number;
    profitLossTillDate: number;
    sectorName?: string;
    xirr?: number;
    cagr?: number;
    holdingPeriodYears?: number;
    holdingPeriodMonths?: number;
  }>;
  transactions: Array<{
    isin: string;
    transactionDate: Date | string;
    buySell: string;
    tradePriceAdjusted?: number;
    tradedQty?: number;
    tradeValueAdjusted?: number;
  }>;
}

export default function StockAnalytics({ holdings, transactions }: StockAnalyticsProps) {
  // ── Base calculations ────────────────────────────────────────
  const totalStocks = holdings.length;
  const totalCurrentValue = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0);

  const positiveStocks = holdings.filter(h => (h.profitLossTillDatePercent || 0) > 0);
  const negativeStocks = holdings.filter(h => (h.profitLossTillDatePercent || 0) < 0);
  const positiveCount   = positiveStocks.length;
  const negativeCount   = negativeStocks.length;
  const positiveCurrentValue = positiveStocks.reduce((sum, h) => sum + (h.marketValue || 0), 0);
  const negativeCurrentValue = negativeStocks.reduce((sum, h) => sum + (h.marketValue || 0), 0);

  // ── Dividends ───────────────────────────────────────────────
  const dividendTransactions = transactions.filter(t => {
    if (!t?.buySell) return false;
    const u = (t.buySell || '').toUpperCase();
    return u.includes('DIVIDEND') || u === 'DIV';
  });
  const dividendByStockAndYear: Record<string, Record<string, number>> = {};
  dividendTransactions.forEach(t => {
    if (!t.isin) return;
    const year = new Date(t.transactionDate).getFullYear().toString();
    if (!dividendByStockAndYear[t.isin]) dividendByStockAndYear[t.isin] = {};
    dividendByStockAndYear[t.isin][year] = (dividendByStockAndYear[t.isin][year] || 0) + 1;
  });
  const dividendStocksWith3Plus = new Set<string>();
  Object.keys(dividendByStockAndYear).forEach(isin => {
    if (Object.values(dividendByStockAndYear[isin]).some(c => c >= 3))
      dividendStocksWith3Plus.add(isin);
  });
  const dividendCount = dividendStocksWith3Plus.size;
  const annualDividendPayout = dividendTransactions
    .filter(t => t.isin && dividendStocksWith3Plus.has(t.isin))
    .reduce((sum, t) => {
      const amt = t.tradeValueAdjusted && t.tradeValueAdjusted > 0
        ? t.tradeValueAdjusted
        : (t.tradePriceAdjusted || 0) * (t.tradedQty || 0);
      return sum + amt;
    }, 0);

  // ── Returns / volatility ─────────────────────────────────────
  const totalInvested   = holdings.reduce((sum, h) => sum + (h.investmentAmount || 0), 0);
  const returns         = holdings.map(h => h.profitLossTillDatePercent || 0);
  const weightedAvgReturn = totalInvested > 0
    ? holdings.reduce((sum, h) => sum + (h.profitLossTillDatePercent || 0) * ((h.investmentAmount || 0) / totalInvested), 0)
    : 0;
  const simpleAvgReturn   = returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
  const averageReturn     = weightedAvgReturn;

  const sortedReturns = [...returns].sort((a, b) => a - b);
  const medianReturn  = sortedReturns.length > 0
    ? sortedReturns.length % 2 === 0
      ? (sortedReturns[sortedReturns.length / 2 - 1] + sortedReturns[sortedReturns.length / 2]) / 2
      : sortedReturns[Math.floor(sortedReturns.length / 2)]
    : 0;

  const maxReturn      = returns.length > 0 ? Math.max(...returns) : 0;
  const minReturn      = returns.length > 0 ? Math.min(...returns) : 0;
  const spread         = maxReturn - minReturn;
  const maxReturnStock = holdings.find(h => Math.abs((h.profitLossTillDatePercent || 0) - maxReturn) < 0.01);
  const minReturnStock = holdings.find(h => Math.abs((h.profitLossTillDatePercent || 0) - minReturn) < 0.01);

  const positiveReturnsCount = returns.filter(r => r > 0).length;
  const consistencyIndex     = returns.length > 0 ? (positiveReturnsCount / returns.length) * 100 : 0;

  const positiveInvested = positiveStocks.reduce((sum, h) => sum + (h.investmentAmount || 0), 0);
  const negativeInvested = negativeStocks.reduce((sum, h) => sum + (h.investmentAmount || 0), 0);
  const riskRatio        = negativeInvested > 0 ? positiveInvested / negativeInvested : positiveInvested > 0 ? 99 : 0;

  const mean          = averageReturn;
  const variance      = returns.length > 0 ? returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length : 0;
  const volatilityIdx = Math.sqrt(variance);

  // ── Sortino Ratio (downside-only risk) ───────────────────────
  // Sortino = (Portfolio Return - Risk Free Rate) / Downside Deviation
  // Downside deviation uses only negative deviations from 0 (MAR = 0)
  const RISK_FREE_RATE     = 7.5;
  const downsideReturns    = returns.filter(r => r < 0);
  const downsideVariance   = downsideReturns.length > 0
    ? downsideReturns.reduce((s, r) => s + Math.pow(r, 2), 0) / returns.length
    : 0;
  const downsideDeviation  = Math.sqrt(downsideVariance);
  const sortinoRatio       = downsideDeviation > 0
    ? (averageReturn - RISK_FREE_RATE) / downsideDeviation
    : averageReturn > RISK_FREE_RATE ? 99 : 0;

  // ── Concentration Risk ───────────────────────────────────────
  const sortedByValue    = [...holdings].sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0));
  const top1Stock        = sortedByValue[0];
  const top1Pct          = totalCurrentValue > 0 ? ((top1Stock?.marketValue || 0) / totalCurrentValue) * 100 : 0;
  const top5Value        = sortedByValue.slice(0, 5).reduce((s, h) => s + (h.marketValue || 0), 0);
  const top5Pct          = totalCurrentValue > 0 ? (top5Value / totalCurrentValue) * 100 : 0;
  const concentrationRisk = top1Pct > 20 ? 'High' : top1Pct > 12 ? 'Moderate' : 'Low';

  // ── Sector breakdown ─────────────────────────────────────────
  const sectorMap: Record<string, number> = {};
  holdings.forEach(h => {
    const s = (h as any).sectorName || 'Unknown';
    sectorMap[s] = (sectorMap[s] || 0) + (h.marketValue || 0);
  });
  const uniqueSectors   = Object.keys(sectorMap).filter(s => s !== 'Unknown').length;
  const topSector       = Object.entries(sectorMap).sort((a, b) => b[1] - a[1])[0];
  const topSectorPct    = topSector && totalCurrentValue > 0 ? (topSector[1] / totalCurrentValue) * 100 : 0;

  // ── Health / Diversification ─────────────────────────────────
  const positiveRatio      = returns.length > 0 ? (positiveCount / returns.length) * 100 : 0;
  const returnScore        = Math.max(0, Math.min(100, 50 + averageReturn * 2));
  const volatilityScore    = Math.max(0, Math.min(100, 100 - volatilityIdx * 5));
  const healthScore        = Math.round(positiveRatio * 0.4 + returnScore * 0.4 + volatilityScore * 0.2);
  const healthLabel        = healthScore >= 75 ? 'Excellent' : healthScore >= 60 ? 'Healthy' : healthScore >= 45 ? 'Moderate' : 'Needs Attention';

  const stockCountScore    = Math.min(10, totalStocks / 3);
  const sectorScore        = Math.min(10, uniqueSectors * 2);
  const diversificationScore = ((stockCountScore + sectorScore) / 2).toFixed(1);
  const diversificationLabel = parseFloat(diversificationScore) >= 7.5 ? 'Well diversified'
    : parseFloat(diversificationScore) >= 5 ? 'Moderately diversified' : 'Needs diversification';

  // ── Utilities ────────────────────────────────────────────────
  const formatShort = (amount: number): string => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
    if (amount >= 100000)   return `₹${(amount / 100000).toFixed(0)}L`;
    if (amount >= 1000)     return `₹${(amount / 1000).toFixed(0)}K`;
    return formatCurrency(amount);
  };

  // ── InfoTooltip ──────────────────────────────────────────────
  const InfoTooltip = ({ description }: { description: string }) => {
    const [showTooltip, setShowTooltip]   = useState(false);
    const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
    const timeoutRef   = useRef<NodeJS.Timeout | null>(null);
    const buttonRef    = useRef<HTMLButtonElement>(null);
    const tooltipIdRef = useRef(`tooltip-${Math.random().toString(36).substr(2, 9)}`);

    const updatePos = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const W = 288, H = 400, sp = 8, mg = 20;
      const vw = window.innerWidth, vh = window.innerHeight;
      let top  = rect.bottom + sp;
      let left = rect.left;
      if (left + W > vw - mg) left = rect.right - W;
      if (left < mg)          left = mg;
      if (left + W > vw - mg) left = mg;
      if (rect.bottom + H > vh - mg) top = rect.top - H - sp;
      if (top < mg) top = mg;
      const maxH = Math.min(vh - top - mg, H);
      setTooltipStyle({ position: 'fixed', top: `${top}px`, left: `${left}px`, zIndex: 99999, maxHeight: `${maxH}px`, overflow: 'hidden', wordWrap: 'break-word', overflowWrap: 'break-word', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' });
    };

    const onEnter = () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); setShowTooltip(true); requestAnimationFrame(() => requestAnimationFrame(updatePos)); };
    const onLeave = () => { timeoutRef.current = setTimeout(() => setShowTooltip(false), 200); };

    useEffect(() => {
      if (showTooltip && buttonRef.current) {
        updatePos();
        const h = () => { if (buttonRef.current) updatePos(); };
        window.addEventListener('scroll', h, true);
        window.addEventListener('resize', h);
        return () => { window.removeEventListener('scroll', h, true); window.removeEventListener('resize', h); };
      }
    }, [showTooltip]);

    const fallback: React.CSSProperties = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 99999 };

    const content = showTooltip ? (
      <div key={tooltipIdRef.current} id={tooltipIdRef.current}
        className="w-72 max-w-[85vw] text-xs rounded-2xl shadow-2xl"
        style={{
          ...(Object.keys(tooltipStyle).length > 0 ? tooltipStyle : fallback),
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-md)',
          boxShadow: 'var(--shadow-xl)',
          backdropFilter: 'blur(8px)',
          pointerEvents: 'auto',
        }}
        onMouseEnter={() => { if (timeoutRef.current) clearTimeout(timeoutRef.current); setShowTooltip(true); }}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <div className="p-4 space-y-2.5 overflow-y-auto" style={{ maxHeight: 'inherit' }}>
          {description.replace(/\\n/g, '\n').split('\n').map((line, i) => {
            const t = line.trim();
            if (!t) return null;
            if (t.endsWith(':')) {
              const words = t.slice(0, -1).toLowerCase().split(' ');
              const header = words.map(w => w[0].toUpperCase() + w.slice(1)).join(' ') + ':';
              return <div key={i} className="font-bold text-sm pt-2 first:pt-0" style={{ color: 'var(--brand)', borderTop: i > 0 ? '1px solid var(--border-sm)' : 'none', paddingTop: i > 0 ? '8px' : '0' }}>{header}</div>;
            }
            if (t.startsWith('•') || t.startsWith('-')) {
              return (
                <div key={i} className="flex items-start gap-2">
                  <span className="shrink-0 mt-0.5 font-bold" style={{ color: 'var(--brand)' }}>•</span>
                  <span className="leading-relaxed" style={{ color: 'var(--text-mid)' }}>{t.replace(/^[•\-]\s*/, '')}</span>
                </div>
              );
            }
            if (t.includes('=') || t.includes('×') || t.includes('√') || t.includes('Σ') || t.includes('÷')) {
              return <div key={i} className="font-mono text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--brand-bg)', color: 'var(--brand)', border: '1px solid var(--brand-glow)' }}>{t}</div>;
            }
            return <div key={i} className="leading-relaxed" style={{ color: 'var(--text-mid)', fontSize: '0.8125rem' }}>{t}</div>;
          })}
        </div>
      </div>
    ) : null;

    return (
      <>
        <button ref={buttonRef} type="button"
          className="inline-flex items-center justify-center w-4 h-4 ml-1.5 rounded transition-colors focus:outline-none"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={onEnter} onMouseLeave={onLeave}
          onClick={e => { e.preventDefault(); e.stopPropagation(); onEnter(); }}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        </button>
        {typeof window !== 'undefined' && showTooltip && content && createPortal(content, document.body)}
      </>
    );
  };

  // ── StatCard ─────────────────────────────────────────────────
  const StatCard = ({ title, value, subtitle, isPositive, isNeutral = false, infoDescription }: {
    title: string; value: string | number; subtitle?: string;
    isPositive?: boolean; isNeutral?: boolean; infoDescription?: string;
  }) => {
    const valueColor = isNeutral ? 'var(--text-hi)'
      : isPositive === undefined ? 'var(--text-hi)'
      : isPositive ? 'var(--gain)' : 'var(--loss)';
    return (
      <div className="card p-4 relative overflow-visible">
        <h3 className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center" style={{ color: 'var(--text-muted)' }}>
          <span>{title}</span>
          {infoDescription && <InfoTooltip description={infoDescription} />}
        </h3>
        <div className="text-xl font-black metric-value leading-none" style={{ color: valueColor }}>{value}</div>
        {subtitle && <div className="text-xs mt-1.5" style={{ color: 'var(--text-lo)' }}>{subtitle}</div>}
      </div>
    );
  };

  // ── SectionTitle ─────────────────────────────────────────────
  const SectionTitle = ({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) => (
    <h3 className="section-title text-base mb-4 flex items-center gap-2">
      <div className="w-1 h-5 rounded-full" style={{ background: 'var(--brand)' }} />
      {icon && <span style={{ color: 'var(--brand)' }}>{icon}</span>}
      {children}
    </h3>
  );

  return (
    <div className="space-y-8 px-1 py-2">

      {/* ── Portfolio Overview ──────────────────────────────── */}
      <div>
        <SectionTitle>Portfolio Overview</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard title="Total Stocks" value={totalStocks} subtitle={formatCurrency(totalCurrentValue)} isNeutral
            infoDescription="WHAT IT MEANS:\nTotal number of unique stocks in your portfolio and their combined current market value.\n\nREPRESENTS:\nThe breadth of your investment holdings across different companies." />
          <StatCard title="Positive Stocks" value={positiveCount} subtitle={formatCurrency(positiveCurrentValue)} isPositive={true}
            infoDescription="WHAT IT MEANS:\nNumber of stocks with positive returns (profit) and their combined current market value.\n\nCALCULATION:\nCounts all stocks where Profit/Loss Percentage > 0%" />
          <StatCard title="Negative Stocks" value={negativeCount} subtitle={formatCurrency(negativeCurrentValue)} isPositive={false}
            infoDescription="WHAT IT MEANS:\nNumber of stocks with negative returns (loss) and their combined current market value.\n\nCALCULATION:\nCounts all stocks where Profit/Loss Percentage < 0%" />
          <StatCard title="Dividend Stocks" value={dividendCount} subtitle={formatCurrency(annualDividendPayout)} isNeutral
            infoDescription="WHAT IT MEANS:\nStocks that have provided dividends at least 3 times in any calendar year.\n\nCALCULATION:\n• Identifies stocks with 3+ dividend transactions in a single year\n• Shows count of qualifying stocks\n• Displays total dividend payout from actual transactions" />
          <StatCard
            title="Health Score"
            value={`${healthScore}/100`}
            subtitle={healthLabel}
            isPositive={healthScore >= 60}
            infoDescription={`WHAT IT MEANS:\nComposite metric (0-100) combining multiple portfolio health factors.\n\nCALCULATION BREAKDOWN:\n• Positive Ratio (40%): Percentage of positive-return stocks\n• Return Score (40%): Normalized average return performance\n• Volatility Score (20%): Lower volatility = higher score\n\nYOUR VALUES:\n• Positive Ratio: ${positiveRatio.toFixed(1)}%\n• Return Score: ${returnScore.toFixed(1)}/100\n• Volatility Score: ${volatilityScore.toFixed(1)}/100`}
          />
          <StatCard
            title="Diversification"
            value={`${diversificationScore}/10`}
            subtitle={diversificationLabel}
            isPositive={parseFloat(diversificationScore) >= 5}
            infoDescription={`WHAT IT MEANS:\nMeasures how well your portfolio is spread across stocks and sectors.\n\nCALCULATION:\n• Stock Count: ${totalStocks} stocks (full score at 30+)\n• Sector Spread: ${uniqueSectors} sectors (full score at 5+)\n\nFORMULA:\nScore = (Stock Count Score + Sector Score) ÷ 2\n\nYOUR BREAKDOWN:\n• Stock Count Score: ${stockCountScore.toFixed(1)}/10\n• Sector Score: ${sectorScore.toFixed(1)}/10`}
          />
        </div>
      </div>

      {/* ── Performance Metrics ──────────────────────────────── */}
      <div>
        <SectionTitle>Performance Metrics</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            title="Weighted Avg Return"
            value={`${averageReturn >= 0 ? '+' : ''}${averageReturn.toFixed(1)}%`}
            isPositive={averageReturn >= 0}
            infoDescription={`WHAT IT MEANS:\nWeighted average return across all stocks, weighted by investment amount.\n\nCALCULATION:\nWeighted Avg = Σ(Return × Investment Weight)\nInvestment Weight = Stock Investment ÷ Total Investment\n\nYOUR VALUES:\n• Weighted Average: ${averageReturn.toFixed(1)}%\n• Simple Average: ${simpleAvgReturn.toFixed(1)}%\n• Total Invested: ${formatCurrency(totalInvested)}`}
          />
          <StatCard
            title="Median Return"
            value={`${medianReturn >= 0 ? '+' : ''}${medianReturn.toFixed(1)}%`}
            isPositive={medianReturn >= 0}
            infoDescription={`WHAT IT MEANS:\nMiddle return value when all stocks are sorted — less sensitive to outliers than the weighted average.\n\nYOUR VALUES:\n• Median: ${medianReturn.toFixed(1)}%\n• Weighted Avg: ${averageReturn.toFixed(1)}%\n\nNOTE: When Median > Average, most stocks perform well but large positions may pull the average down.`}
          />
          <StatCard
            title="Best / Worst"
            value={`${maxReturn >= 0 ? '+' : ''}${maxReturn.toFixed(0)}% / ${minReturn.toFixed(0)}%`}
            subtitle={`${spread.toFixed(0)}% spread`}
            isNeutral
            infoDescription={`WHAT IT MEANS:\nBest and worst performing stocks with their return spread.\n\nCURRENT VALUES:\n• Best: ${maxReturn >= 0 ? '+' : ''}${maxReturn.toFixed(1)}%${maxReturnStock ? ` (${maxReturnStock.stockName})` : ''}\n• Worst: ${minReturn.toFixed(1)}%${minReturnStock ? ` (${minReturnStock.stockName})` : ''}\n• Spread: ${spread.toFixed(1)}%`}
          />
          <StatCard
            title="Consistency Index"
            value={`${consistencyIndex.toFixed(0)}%`}
            isPositive={consistencyIndex >= 60}
            infoDescription={`WHAT IT MEANS:\nRatio of positive-return stocks to total — how consistently your picks are working.\n\nCALCULATION:\n• Positive Stocks: ${positiveReturnsCount}\n• Total Stocks: ${returns.length}\n• Formula: (Positive ÷ Total) × 100 = ${consistencyIndex.toFixed(0)}%`}
          />
          <StatCard
            title="Volatility Index"
            value={`${volatilityIdx.toFixed(1)}%`}
            isPositive={volatilityIdx < 30}
            infoDescription={`WHAT IT MEANS:\nStandard deviation of all stock returns — measures how widely returns vary from the mean.\n\nFORMULA:\nVolatility = √(Σ(Return - Mean)² ÷ N)\n• Mean Return: ${averageReturn.toFixed(1)}%\n• Volatility: ${volatilityIdx.toFixed(1)}%\n\nLower = more consistent returns`}
          />
          <StatCard
            title="Risk Ratio"
            value={`${Math.min(riskRatio, 99).toFixed(1)}:1`}
            subtitle={`${formatShort(positiveInvested)} vs ${formatShort(negativeInvested)}`}
            isPositive={riskRatio >= 2}
            infoDescription={`WHAT IT MEANS:\nCapital in positive stocks vs negative stocks — measures how your investment is distributed by outcome.\n\nVALUES:\n• Positive Invested: ${formatCurrency(positiveInvested)}\n• Negative Invested: ${formatCurrency(negativeInvested)}\n• Ratio: ${riskRatio.toFixed(1)}:1\n\nHigher ratio (e.g. 3:1+) = more capital in winning positions`}
          />
        </div>
      </div>

      {/* ── Risk Intelligence ────────────────────────────────── */}
      <div>
        <SectionTitle icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        }>Risk Intelligence</SectionTitle>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">

          {/* Sortino Ratio */}
          <StatCard
            title="Sortino Ratio"
            value={sortinoRatio > 50 ? '>50' : sortinoRatio.toFixed(2)}
            subtitle={sortinoRatio > 2 ? 'Excellent downside mgmt' : sortinoRatio > 1 ? 'Good' : sortinoRatio > 0 ? 'Acceptable' : 'Below benchmark'}
            isPositive={sortinoRatio > 1}
            infoDescription={`WHAT IT MEANS:\nLike Sharpe Ratio but only penalises DOWNSIDE volatility. Better for portfolios where "upside volatility" (big gains) is welcome.\n\nFORMULA:\nSortino = (Portfolio Return - Risk Free Rate) ÷ Downside Deviation\n• Portfolio Return: ${averageReturn.toFixed(1)}%\n• Risk Free Rate: ${RISK_FREE_RATE}% (Indian govt. bonds)\n• Downside Deviation: ${downsideDeviation.toFixed(2)}%\n• Your Sortino: ${sortinoRatio.toFixed(2)}\n\nINTERPRETATION:\n• < 1.0: Below average risk adjustment\n• 1.0 - 2.0: Good\n• 2.0 - 3.0: Very good\n• > 3.0: Excellent`}
          />

          {/* Concentration Risk */}
          <StatCard
            title="Concentration Risk"
            value={concentrationRisk}
            subtitle={`Top: ${top1Stock?.stockName?.split(' ')[0] || 'N/A'} = ${top1Pct.toFixed(1)}%`}
            isPositive={concentrationRisk === 'Low'}
            infoDescription={`WHAT IT MEANS:\nHow much capital is concentrated in a single stock. High concentration increases single-company risk.\n\nYOUR VALUES:\n• Top stock (${top1Stock?.stockName || 'N/A'}): ${top1Pct.toFixed(1)}% of portfolio\n• Top 5 stocks combined: ${top5Pct.toFixed(1)}% of portfolio\n\nRISK THRESHOLDS:\n• Low Risk: Top stock < 12% of portfolio\n• Moderate Risk: 12–20%\n• High Risk: > 20%`}
          />

          {/* Top 5 Concentration */}
          <StatCard
            title="Top 5 Concentration"
            value={`${top5Pct.toFixed(1)}%`}
            subtitle={`${sortedByValue.slice(0, 5).map(h => h.stockName.split(' ')[0]).join(', ')}`}
            isPositive={top5Pct < 50}
            infoDescription={`WHAT IT MEANS:\nPercentage of total portfolio value held in your 5 largest positions. High concentration in top-5 amplifies both gains and losses.\n\nYOUR TOP 5:\n${sortedByValue.slice(0, 5).map((h, i) => `• #${i+1} ${h.stockName}: ${totalCurrentValue > 0 ? ((h.marketValue / totalCurrentValue) * 100).toFixed(1) : 0}%`).join('\n')}\n\nTotal Top-5: ${top5Pct.toFixed(1)}%\n\nBest practice: Keep top-5 below 50% for moderate risk`}
          />

          {/* Sector Concentration */}
          <StatCard
            title="Top Sector Exposure"
            value={topSector ? `${topSectorPct.toFixed(1)}%` : 'N/A'}
            subtitle={topSector ? topSector[0] : 'No sector data'}
            isPositive={topSectorPct < 40}
            infoDescription={`WHAT IT MEANS:\nYour largest sector allocation as a % of total portfolio value. High sector concentration means sector-specific risk.\n\nYOUR BREAKDOWN:\n${Object.entries(sectorMap).sort((a,b) => b[1]-a[1]).slice(0,5).map(([s,v]) => `• ${s}: ${totalCurrentValue > 0 ? ((v/totalCurrentValue)*100).toFixed(1) : 0}%`).join('\n')}\n\nBest practice: Keep any single sector below 40%`}
          />

          {/* Downside Deviation */}
          <StatCard
            title="Downside Deviation"
            value={`${downsideDeviation.toFixed(1)}%`}
            subtitle={`${downsideReturns.length} stocks in loss`}
            isPositive={downsideDeviation < 20}
            infoDescription={`WHAT IT MEANS:\nMeasures volatility of ONLY the losing stocks — the "bad" side of volatility used in the Sortino Ratio calculation.\n\nFORMULA:\nDownside Dev = √(Σ(negative returns²) ÷ total stocks)\n• Negative return stocks: ${downsideReturns.length}\n• Total stocks: ${returns.length}\n• Downside Deviation: ${downsideDeviation.toFixed(2)}%\n\nLower downside deviation = better downside protection\n(Unlike regular volatility, upside moves don't increase this.)`}
          />
        </div>
      </div>

      {/* ── Performance Analytics Charts ─────────────────────── */}
      <div>
        <SectionTitle>Performance Analytics & Trend Detection</SectionTitle>
        <PerformanceAnalyticsCharts clientId="994826" holdings={holdings} transactions={transactions} />
      </div>

      {/* ── Stock Intelligence Scorecard ──────────────────────── */}
      <div>
        <SectionTitle>Stock Intelligence Scorecard</SectionTitle>
        <StockScorecard holdings={holdings} transactions={transactions} />
      </div>

      {/* ── Detailed Analysis ─────────────────────────────────── */}
      <div>
        <SectionTitle>Individual Stock Deep-Dive</SectionTitle>
        <DetailedAnalysis holdings={holdings} />
      </div>
    </div>
  );
}
