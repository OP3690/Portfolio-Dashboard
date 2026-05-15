'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency } from '@/lib/utils';
import PerformanceAnalyticsCharts from './PerformanceAnalyticsCharts';
import DetailedAnalysis from './DetailedAnalysis';
import StockScorecard from './StockScorecard';
import CapitalEfficiency from './CapitalEfficiency';
import PortfolioTimeline from './PortfolioTimeline';
import StockMilestoneTracker from './StockMilestoneTracker';
import DividendInsights from './DividendInsights';
import PortfolioInsights from './PortfolioInsights';

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
  realizedStocks?: Array<{
    isin?: string;
    stockName?: string;
  }>;
  monthlyDividends?: Array<{ month: string; amount: number; sortKey?: number; stockDetails: Array<{ stockName: string; amount: number }> }>;
  avgMonthlyDividendsLast12M?: number;
  medianMonthlyDividendsLast12M?: number;
}

export default function StockAnalytics({ holdings, transactions, realizedStocks = [], monthlyDividends = [], avgMonthlyDividendsLast12M = 0, medianMonthlyDividendsLast12M = 0 }: StockAnalyticsProps) {
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Card 1 – Composition */}
          <div className="card p-5 flex flex-col gap-4 relative overflow-visible">
            {/* header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'color-mix(in srgb,var(--brand) 12%,transparent)', border: '1px solid color-mix(in srgb,var(--brand) 22%,transparent)' }}>
                  <svg className="w-4 h-4" style={{ color: 'var(--brand)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Composition</p>
                  <p className="text-2xl font-black metric-value leading-none" style={{ color: 'var(--text-hi)' }}>{totalStocks} <span className="text-sm font-semibold" style={{ color: 'var(--text-lo)' }}>stocks</span></p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Current Value</p>
                <p className="text-sm font-bold metric-value" style={{ color: 'var(--text-hi)' }}>{formatShort(totalCurrentValue)}</p>
              </div>
            </div>

            {/* Win/Loss split bar */}
            <div>
              <div className="flex justify-between text-[10px] font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--gain)' }}>▲ {positiveCount} Profitable</span>
                <span style={{ color: 'var(--loss)' }}>{negativeCount} In Loss ▼</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--bg-sunken)' }}>
                <div style={{ width: `${totalStocks > 0 ? (positiveCount / totalStocks) * 100 : 0}%`, background: 'linear-gradient(90deg,var(--gain),var(--gain-mid))', borderRadius: '999px 0 0 999px', transition: 'width .5s ease' }} />
                <div style={{ width: `${totalStocks > 0 ? (negativeCount / totalStocks) * 100 : 0}%`, background: 'linear-gradient(90deg,var(--loss-mid),var(--loss))', borderRadius: '0 999px 999px 0', transition: 'width .5s ease' }} />
              </div>
            </div>

            {/* 3-col breakdown */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Profitable', count: positiveCount, val: formatShort(positiveCurrentValue), color: 'var(--gain)', bg: 'color-mix(in srgb,var(--gain) 10%,transparent)' },
                { label: 'Dividend', count: dividendCount, val: formatShort(annualDividendPayout), color: 'var(--brand)', bg: 'color-mix(in srgb,var(--brand) 10%,transparent)' },
                { label: 'In Loss', count: negativeCount, val: formatShort(negativeCurrentValue), color: 'var(--loss)', bg: 'color-mix(in srgb,var(--loss) 10%,transparent)' },
              ].map(({ label, count, val, color, bg }) => (
                <div key={label} className="rounded-xl p-2.5 text-center" style={{ background: bg }}>
                  <p className="text-lg font-black metric-value leading-none" style={{ color }}>{count}</p>
                  <p className="text-[9px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
                  <p className="text-[10px] font-semibold mt-1 metric-value" style={{ color }}>{val}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2 – Health Score */}
          <div className="card p-5 flex flex-col gap-4 relative overflow-visible">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `color-mix(in srgb,${healthScore >= 75 ? 'var(--gain)' : healthScore >= 45 ? 'var(--brand)' : 'var(--loss)'} 12%,transparent)`, border: `1px solid color-mix(in srgb,${healthScore >= 75 ? 'var(--gain)' : healthScore >= 45 ? 'var(--brand)' : 'var(--loss)'} 22%,transparent)` }}>
                <svg className="w-4 h-4" style={{ color: healthScore >= 75 ? 'var(--gain)' : healthScore >= 45 ? 'var(--brand)' : 'var(--loss)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Portfolio Health <InfoTooltip description={`WHAT IT MEANS:\nComposite metric (0-100) combining multiple portfolio health factors.\n\nCALCULATION BREAKDOWN:\n• Positive Ratio (40%): Percentage of positive-return stocks\n• Return Score (40%): Normalized average return performance\n• Volatility Score (20%): Lower volatility = higher score\n\nYOUR VALUES:\n• Positive Ratio: ${positiveRatio.toFixed(1)}%\n• Return Score: ${returnScore.toFixed(1)}/100\n• Volatility Score: ${volatilityScore.toFixed(1)}/100`} /></p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-black metric-value leading-none" style={{ color: healthScore >= 75 ? 'var(--gain)' : healthScore >= 45 ? 'var(--brand)' : 'var(--loss)' }}>{healthScore}</p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-lo)' }}>/100</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `color-mix(in srgb,${healthScore >= 75 ? 'var(--gain)' : healthScore >= 45 ? 'var(--brand)' : 'var(--loss)'} 15%,transparent)`, color: healthScore >= 75 ? 'var(--gain)' : healthScore >= 45 ? 'var(--brand)' : 'var(--loss)' }}>{healthLabel}</span>
                </div>
              </div>
            </div>

            {/* Overall bar */}
            <div>
              <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
                <div style={{ width: `${healthScore}%`, height: '100%', background: healthScore >= 75 ? 'linear-gradient(90deg,var(--gain),var(--gain-mid))' : healthScore >= 45 ? 'linear-gradient(90deg,var(--brand),#818cf8)' : 'linear-gradient(90deg,var(--loss),var(--loss-mid))', borderRadius: '999px', transition: 'width .5s ease' }} />
              </div>
            </div>

            {/* Component breakdown */}
            <div className="space-y-2.5">
              {[
                { label: 'Win Rate (40%)', val: positiveRatio, max: 100, color: 'var(--gain)' },
                { label: 'Return Score (40%)', val: returnScore, max: 100, color: 'var(--brand)' },
                { label: 'Stability Score (20%)', val: volatilityScore, max: 100, color: '#f59e0b' },
              ].map(({ label, val, max, color }) => (
                <div key={label}>
                  <div className="flex justify-between text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                    <span>{label}</span>
                    <span style={{ color }}>{val.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
                    <div style={{ width: `${(val / max) * 100}%`, height: '100%', background: color, borderRadius: '999px', transition: 'width .5s ease' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3 – Diversification */}
          <div className="card p-5 flex flex-col gap-4 relative overflow-visible">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'color-mix(in srgb,#f59e0b 12%,transparent)', border: '1px solid color-mix(in srgb,#f59e0b 22%,transparent)' }}>
                <svg className="w-4 h-4" style={{ color: '#f59e0b' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Diversification <InfoTooltip description={`WHAT IT MEANS:\nMeasures how well your portfolio is spread across stocks and sectors.\n\nCALCULATION:\n• Stock Count: ${totalStocks} stocks (full score at 30+)\n• Sector Spread: ${uniqueSectors} sectors (full score at 5+)\n\nFORMULA:\nScore = (Stock Count Score + Sector Score) ÷ 2\n\nYOUR BREAKDOWN:\n• Stock Count Score: ${stockCountScore.toFixed(1)}/10\n• Sector Score: ${sectorScore.toFixed(1)}/10`} /></p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-black metric-value leading-none" style={{ color: parseFloat(diversificationScore) >= 7.5 ? 'var(--gain)' : parseFloat(diversificationScore) >= 5 ? '#f59e0b' : 'var(--loss)' }}>{diversificationScore}</p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-lo)' }}>/10</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `color-mix(in srgb,${parseFloat(diversificationScore) >= 7.5 ? 'var(--gain)' : parseFloat(diversificationScore) >= 5 ? '#f59e0b' : 'var(--loss)'} 15%,transparent)`, color: parseFloat(diversificationScore) >= 7.5 ? 'var(--gain)' : parseFloat(diversificationScore) >= 5 ? '#f59e0b' : 'var(--loss)' }}>{diversificationLabel}</span>
                </div>
              </div>
            </div>

            <div>
              <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
                <div style={{ width: `${(parseFloat(diversificationScore) / 10) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#f59e0b,#fcd34d)', borderRadius: '999px', transition: 'width .5s ease' }} />
              </div>
            </div>

            <div className="space-y-2.5">
              {[
                { label: `Stock Breadth — ${totalStocks} stocks`, val: stockCountScore, max: 10, color: 'var(--brand)', caption: `${totalStocks}/30 target` },
                { label: `Sector Spread — ${uniqueSectors} sectors`, val: sectorScore, max: 10, color: '#f59e0b', caption: `${uniqueSectors}/5 target` },
              ].map(({ label, val, max, color, caption }) => (
                <div key={label}>
                  <div className="flex justify-between text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                    <span>{label}</span>
                    <span style={{ color }}>{val.toFixed(1)}/10</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
                    <div style={{ width: `${(val / max) * 100}%`, height: '100%', background: color, borderRadius: '999px', transition: 'width .5s ease' }} />
                  </div>
                  <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{caption}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Performance Metrics ──────────────────────────────── */}
      <div>
        <SectionTitle>Performance Metrics</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Weighted Avg Return */}
          <div className="card p-5 flex flex-col gap-3 relative overflow-visible">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>Weighted Avg Return <InfoTooltip description={`WHAT IT MEANS:\nWeighted average return across all stocks, weighted by investment amount.\n\nCALCULATION:\nWeighted Avg = Σ(Return × Investment Weight)\nInvestment Weight = Stock Investment ÷ Total Investment\n\nYOUR VALUES:\n• Weighted Average: ${averageReturn.toFixed(1)}%\n• Simple Average: ${simpleAvgReturn.toFixed(1)}%\n• Total Invested: ${formatCurrency(totalInvested)}`} /></p>
                <p className="text-3xl font-black metric-value mt-1 leading-none" style={{ color: averageReturn >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{averageReturn >= 0 ? '+' : ''}{averageReturn.toFixed(1)}%</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb,${averageReturn >= 0 ? 'var(--gain)' : 'var(--loss)'} 12%,transparent)`, border: `1px solid color-mix(in srgb,${averageReturn >= 0 ? 'var(--gain)' : 'var(--loss)'} 22%,transparent)` }}>
                <svg className="w-5 h-5" style={{ color: averageReturn >= 0 ? 'var(--gain)' : 'var(--loss)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {averageReturn >= 0
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />}
                </svg>
              </div>
            </div>
            <div className="flex gap-3 text-xs" style={{ color: 'var(--text-lo)' }}>
              <span>Simple avg: <span className="font-semibold metric-value" style={{ color: simpleAvgReturn >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{simpleAvgReturn >= 0 ? '+' : ''}{simpleAvgReturn.toFixed(1)}%</span></span>
              <span className="opacity-40">·</span>
              <span>Invested: <span className="font-semibold" style={{ color: 'var(--text-mid)' }}>{formatShort(totalInvested)}</span></span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
              <div style={{ width: `${Math.min(100, Math.max(0, 50 + averageReturn))}%`, height: '100%', background: averageReturn >= 0 ? 'linear-gradient(90deg,var(--gain),var(--gain-mid))' : 'linear-gradient(90deg,var(--loss),var(--loss-mid))', borderRadius: '999px' }} />
            </div>
          </div>

          {/* Median Return */}
          <div className="card p-5 flex flex-col gap-3 relative overflow-visible">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>Median Return <InfoTooltip description={`WHAT IT MEANS:\nMiddle return value when all stocks are sorted — less sensitive to outliers than the weighted average.\n\nYOUR VALUES:\n• Median: ${medianReturn.toFixed(1)}%\n• Weighted Avg: ${averageReturn.toFixed(1)}%\n\nNOTE: When Median > Average, most stocks perform well but large positions may pull the average down.`} /></p>
                <p className="text-3xl font-black metric-value mt-1 leading-none" style={{ color: medianReturn >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{medianReturn >= 0 ? '+' : ''}{medianReturn.toFixed(1)}%</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'color-mix(in srgb,var(--brand) 12%,transparent)', border: '1px solid color-mix(in srgb,var(--brand) 22%,transparent)' }}>
                <svg className="w-5 h-5" style={{ color: 'var(--brand)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
            <div className="text-xs" style={{ color: 'var(--text-lo)' }}>
              {medianReturn > averageReturn
                ? <span style={{ color: 'var(--gain)' }}>↑ Median &gt; Avg — majority outperform</span>
                : <span style={{ color: 'var(--text-lo)' }}>Median ≤ Avg — outliers lift average</span>}
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
              <div style={{ width: `${Math.min(100, Math.max(0, 50 + medianReturn))}%`, height: '100%', background: medianReturn >= 0 ? 'linear-gradient(90deg,var(--gain),var(--gain-mid))' : 'linear-gradient(90deg,var(--loss),var(--loss-mid))', borderRadius: '999px' }} />
            </div>
          </div>

          {/* Best / Worst */}
          <div className="card p-5 flex flex-col gap-3 relative overflow-visible">
            <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>Best & Worst Stock <InfoTooltip description={`WHAT IT MEANS:\nBest and worst performing stocks with their return spread.\n\nCURRENT VALUES:\n• Best: ${maxReturn >= 0 ? '+' : ''}${maxReturn.toFixed(1)}%${maxReturnStock ? ` (${maxReturnStock.stockName})` : ''}\n• Worst: ${minReturn.toFixed(1)}%${minReturnStock ? ` (${minReturnStock.stockName})` : ''}\n• Spread: ${spread.toFixed(1)}%`} /></p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl p-3" style={{ background: 'color-mix(in srgb,var(--gain) 8%,transparent)', border: '1px solid color-mix(in srgb,var(--gain) 18%,transparent)' }}>
                <p className="text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--gain)' }}>Best</p>
                <p className="text-xl font-black metric-value leading-none" style={{ color: 'var(--gain)' }}>+{maxReturn.toFixed(0)}%</p>
                <p className="text-[10px] truncate mt-1" style={{ color: 'var(--text-lo)' }}>{maxReturnStock?.stockName?.split(' ')[0] || 'N/A'}</p>
              </div>
              <div className="rounded-xl p-3" style={{ background: 'color-mix(in srgb,var(--loss) 8%,transparent)', border: '1px solid color-mix(in srgb,var(--loss) 18%,transparent)' }}>
                <p className="text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--loss)' }}>Worst</p>
                <p className="text-xl font-black metric-value leading-none" style={{ color: 'var(--loss)' }}>{minReturn.toFixed(0)}%</p>
                <p className="text-[10px] truncate mt-1" style={{ color: 'var(--text-lo)' }}>{minReturnStock?.stockName?.split(' ')[0] || 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
                <div style={{ width: `${Math.min(100, (spread / 200) * 100)}%`, height: '100%', background: 'linear-gradient(90deg,var(--gain),var(--loss))', borderRadius: '999px' }} />
              </div>
              <span className="text-[10px] font-bold shrink-0" style={{ color: 'var(--text-muted)' }}>{spread.toFixed(0)}% spread</span>
            </div>
          </div>

          {/* Consistency Index */}
          <div className="card p-5 flex flex-col gap-3 relative overflow-visible">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>Consistency Index <InfoTooltip description={`WHAT IT MEANS:\nRatio of positive-return stocks to total — how consistently your picks are working.\n\nCALCULATION:\n• Positive Stocks: ${positiveReturnsCount}\n• Total Stocks: ${returns.length}\n• Formula: (Positive ÷ Total) × 100 = ${consistencyIndex.toFixed(0)}%`} /></p>
                <p className="text-3xl font-black metric-value mt-1 leading-none" style={{ color: consistencyIndex >= 60 ? 'var(--gain)' : consistencyIndex >= 40 ? '#f59e0b' : 'var(--loss)' }}>{consistencyIndex.toFixed(0)}%</p>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: `color-mix(in srgb,${consistencyIndex >= 60 ? 'var(--gain)' : consistencyIndex >= 40 ? '#f59e0b' : 'var(--loss)'} 15%,transparent)`, color: consistencyIndex >= 60 ? 'var(--gain)' : consistencyIndex >= 40 ? '#f59e0b' : 'var(--loss)' }}>
                {consistencyIndex >= 60 ? 'Consistent' : consistencyIndex >= 40 ? 'Mixed' : 'Weak'}
              </span>
            </div>
            <div>
              <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
                <span>{positiveReturnsCount} profitable</span><span>{returns.length - positiveReturnsCount} in loss</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
                <div style={{ width: `${consistencyIndex}%`, height: '100%', background: consistencyIndex >= 60 ? 'linear-gradient(90deg,var(--gain),var(--gain-mid))' : consistencyIndex >= 40 ? 'linear-gradient(90deg,#f59e0b,#fcd34d)' : 'linear-gradient(90deg,var(--loss),var(--loss-mid))', borderRadius: '999px' }} />
              </div>
            </div>
          </div>

          {/* Volatility Index */}
          <div className="card p-5 flex flex-col gap-3 relative overflow-visible">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>Volatility Index <InfoTooltip description={`WHAT IT MEANS:\nStandard deviation of all stock returns — measures how widely returns vary from the mean.\n\nFORMULA:\nVolatility = √(Σ(Return - Mean)² ÷ N)\n• Mean Return: ${averageReturn.toFixed(1)}%\n• Volatility: ${volatilityIdx.toFixed(1)}%\n\nLower = more consistent returns`} /></p>
                <p className="text-3xl font-black metric-value mt-1 leading-none" style={{ color: volatilityIdx < 20 ? 'var(--gain)' : volatilityIdx < 40 ? '#f59e0b' : 'var(--loss)' }}>{volatilityIdx.toFixed(1)}%</p>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: `color-mix(in srgb,${volatilityIdx < 20 ? 'var(--gain)' : volatilityIdx < 40 ? '#f59e0b' : 'var(--loss)'} 15%,transparent)`, color: volatilityIdx < 20 ? 'var(--gain)' : volatilityIdx < 40 ? '#f59e0b' : 'var(--loss)' }}>
                {volatilityIdx < 20 ? 'Low Risk' : volatilityIdx < 40 ? 'Moderate' : 'High Risk'}
              </span>
            </div>
            <div>
              <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
                <span>Low &lt;20%</span><span>High &gt;40%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
                <div style={{ width: `${Math.min(100, (volatilityIdx / 60) * 100)}%`, height: '100%', background: volatilityIdx < 20 ? 'linear-gradient(90deg,var(--gain),var(--gain-mid))' : volatilityIdx < 40 ? 'linear-gradient(90deg,#f59e0b,#fcd34d)' : 'linear-gradient(90deg,var(--loss-mid),var(--loss))', borderRadius: '999px' }} />
              </div>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-lo)' }}>Mean: {averageReturn.toFixed(1)}% | σ = {volatilityIdx.toFixed(1)}%</p>
          </div>

          {/* Risk Ratio */}
          <div className="card p-5 flex flex-col gap-3 relative overflow-visible">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>Risk Ratio <InfoTooltip description={`WHAT IT MEANS:\nCapital in positive stocks vs negative stocks — measures how your investment is distributed by outcome.\n\nVALUES:\n• Positive Invested: ${formatCurrency(positiveInvested)}\n• Negative Invested: ${formatCurrency(negativeInvested)}\n• Ratio: ${riskRatio.toFixed(1)}:1\n\nHigher ratio (e.g. 3:1+) = more capital in winning positions`} /></p>
                <p className="text-3xl font-black metric-value mt-1 leading-none" style={{ color: riskRatio >= 2 ? 'var(--gain)' : riskRatio >= 1 ? '#f59e0b' : 'var(--loss)' }}>{Math.min(riskRatio, 99).toFixed(1)}<span className="text-lg">:1</span></p>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: `color-mix(in srgb,${riskRatio >= 2 ? 'var(--gain)' : riskRatio >= 1 ? '#f59e0b' : 'var(--loss)'} 15%,transparent)`, color: riskRatio >= 2 ? 'var(--gain)' : riskRatio >= 1 ? '#f59e0b' : 'var(--loss)' }}>
                {riskRatio >= 3 ? 'Excellent' : riskRatio >= 2 ? 'Good' : riskRatio >= 1 ? 'Fair' : 'Poor'}
              </span>
            </div>
            <div>
              <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--gain)' }}>+ {formatShort(positiveInvested)}</span>
                <span style={{ color: 'var(--loss)' }}>{formatShort(negativeInvested)} −</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--bg-sunken)' }}>
                {(() => {
                  const tot = positiveInvested + negativeInvested;
                  const posPct = tot > 0 ? (positiveInvested / tot) * 100 : 50;
                  return (
                    <>
                      <div style={{ width: `${posPct}%`, height: '100%', background: 'linear-gradient(90deg,var(--gain),var(--gain-mid))', borderRadius: '999px 0 0 999px' }} />
                      <div style={{ width: `${100 - posPct}%`, height: '100%', background: 'linear-gradient(90deg,var(--loss-mid),var(--loss))', borderRadius: '0 999px 999px 0' }} />
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">

          {/* Sortino Ratio */}
          {(() => {
            const sRating = sortinoRatio > 3 ? 'Excellent' : sortinoRatio > 2 ? 'Very Good' : sortinoRatio > 1 ? 'Good' : sortinoRatio > 0 ? 'Acceptable' : 'Below Avg';
            const sColor  = sortinoRatio > 2 ? 'var(--gain)' : sortinoRatio > 1 ? '#f59e0b' : 'var(--loss)';
            const sBarW   = Math.min(100, (Math.min(sortinoRatio, 5) / 5) * 100);
            return (
              <div className="card p-5 flex flex-col gap-3 relative overflow-visible">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    Sortino Ratio <InfoTooltip description={`WHAT IT MEANS:\nLike Sharpe Ratio but only penalises DOWNSIDE volatility. Better for portfolios where "upside volatility" (big gains) is welcome.\n\nFORMULA:\nSortino = (Portfolio Return - Risk Free Rate) ÷ Downside Deviation\n• Portfolio Return: ${averageReturn.toFixed(1)}%\n• Risk Free Rate: ${RISK_FREE_RATE}% (Indian govt. bonds)\n• Downside Deviation: ${downsideDeviation.toFixed(2)}%\n• Your Sortino: ${sortinoRatio.toFixed(2)}\n\nINTERPRETATION:\n• < 1.0: Below average risk adjustment\n• 1.0 - 2.0: Good\n• 2.0 - 3.0: Very good\n• > 3.0: Excellent`} />
                  </p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `color-mix(in srgb,${sColor} 15%,transparent)`, color: sColor }}>{sRating}</span>
                </div>
                <p className="text-3xl font-black metric-value leading-none" style={{ color: sColor }}>{sortinoRatio > 50 ? '>50' : sortinoRatio.toFixed(2)}</p>
                <div>
                  <div className="flex justify-between text-[9px] mb-1" style={{ color: 'var(--text-muted)' }}><span>0</span><span>1 Good</span><span>3+ Exc.</span></div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
                    <div style={{ width: `${sBarW}%`, height: '100%', background: `linear-gradient(90deg,var(--loss),#f59e0b,var(--gain))`, borderRadius: '999px' }} />
                  </div>
                </div>
                <p className="text-[10px]" style={{ color: 'var(--text-lo)' }}>Downside dev: {downsideDeviation.toFixed(1)}% · RFR: {RISK_FREE_RATE}%</p>
              </div>
            );
          })()}

          {/* Concentration Risk */}
          {(() => {
            const crColor = concentrationRisk === 'Low' ? 'var(--gain)' : concentrationRisk === 'Moderate' ? '#f59e0b' : 'var(--loss)';
            return (
              <div className="card p-5 flex flex-col gap-3 relative overflow-visible">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    Concentration Risk <InfoTooltip description={`WHAT IT MEANS:\nHow much capital is concentrated in a single stock. High concentration increases single-company risk.\n\nYOUR VALUES:\n• Top stock (${top1Stock?.stockName || 'N/A'}): ${top1Pct.toFixed(1)}% of portfolio\n• Top 5 stocks combined: ${top5Pct.toFixed(1)}% of portfolio\n\nRISK THRESHOLDS:\n• Low Risk: Top stock < 12% of portfolio\n• Moderate Risk: 12–20%\n• High Risk: > 20%`} />
                  </p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `color-mix(in srgb,${crColor} 15%,transparent)`, color: crColor }}>{concentrationRisk}</span>
                </div>
                <p className="text-3xl font-black metric-value leading-none" style={{ color: crColor }}>{top1Pct.toFixed(1)}%</p>
                <div>
                  <div className="flex justify-between text-[9px] mb-1" style={{ color: 'var(--text-muted)' }}><span>Low &lt;12%</span><span>Mod 12–20%</span><span>High &gt;20%</span></div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
                    <div style={{ width: `${Math.min(100, (top1Pct / 30) * 100)}%`, height: '100%', background: `linear-gradient(90deg,var(--gain),#f59e0b,var(--loss))`, borderRadius: '999px' }} />
                  </div>
                </div>
                <p className="text-[10px] truncate" style={{ color: 'var(--text-lo)' }}>Top: {top1Stock?.stockName?.split(' ')[0] || 'N/A'} — {top1Pct.toFixed(1)}% of portfolio</p>
              </div>
            );
          })()}

          {/* Top 5 Concentration */}
          {(() => {
            const t5Color = top5Pct < 40 ? 'var(--gain)' : top5Pct < 60 ? '#f59e0b' : 'var(--loss)';
            return (
              <div className="card p-5 flex flex-col gap-3 relative overflow-visible">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    Top 5 Concentration <InfoTooltip description={`WHAT IT MEANS:\nPercentage of total portfolio value held in your 5 largest positions.\n\nYOUR TOP 5:\n${sortedByValue.slice(0, 5).map((h, i) => `• #${i+1} ${h.stockName}: ${totalCurrentValue > 0 ? ((h.marketValue / totalCurrentValue) * 100).toFixed(1) : 0}%`).join('\n')}\n\nTotal Top-5: ${top5Pct.toFixed(1)}%\n\nBest practice: Keep top-5 below 50% for moderate risk`} />
                  </p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `color-mix(in srgb,${t5Color} 15%,transparent)`, color: t5Color }}>{top5Pct < 40 ? 'Diversified' : top5Pct < 60 ? 'Moderate' : 'Concentrated'}</span>
                </div>
                <p className="text-3xl font-black metric-value leading-none" style={{ color: t5Color }}>{top5Pct.toFixed(1)}%</p>
                <div>
                  <div className="flex justify-between text-[9px] mb-1" style={{ color: 'var(--text-muted)' }}><span>Good &lt;40%</span><span>Moderate</span><span>&gt;60%</span></div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
                    <div style={{ width: `${Math.min(100, top5Pct)}%`, height: '100%', background: `linear-gradient(90deg,var(--gain),#f59e0b,var(--loss))`, borderRadius: '999px' }} />
                  </div>
                </div>
                <p className="text-[10px] truncate" style={{ color: 'var(--text-lo)' }}>{sortedByValue.slice(0, 3).map(h => h.stockName.split(' ')[0]).join(' · ')}</p>
              </div>
            );
          })()}

          {/* Top Sector Exposure */}
          {(() => {
            const tsColor = topSectorPct < 30 ? 'var(--gain)' : topSectorPct < 50 ? '#f59e0b' : 'var(--loss)';
            return (
              <div className="card p-5 flex flex-col gap-3 relative overflow-visible">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    Top Sector Exposure <InfoTooltip description={`WHAT IT MEANS:\nYour largest sector allocation as a % of total portfolio value.\n\nYOUR BREAKDOWN:\n${Object.entries(sectorMap).sort((a,b) => b[1]-a[1]).slice(0,5).map(([s,v]) => `• ${s}: ${totalCurrentValue > 0 ? ((v/totalCurrentValue)*100).toFixed(1) : 0}%`).join('\n')}\n\nBest practice: Keep any single sector below 40%`} />
                  </p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `color-mix(in srgb,${tsColor} 15%,transparent)`, color: tsColor }}>{topSectorPct < 30 ? 'Balanced' : topSectorPct < 50 ? 'Watch' : 'High'}</span>
                </div>
                <p className="text-3xl font-black metric-value leading-none" style={{ color: tsColor }}>{topSector ? `${topSectorPct.toFixed(1)}%` : 'N/A'}</p>
                <div>
                  <div className="flex justify-between text-[9px] mb-1" style={{ color: 'var(--text-muted)' }}><span>Good &lt;30%</span><span>Watch 30–50%</span><span>&gt;50%</span></div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
                    <div style={{ width: `${Math.min(100, topSectorPct)}%`, height: '100%', background: `linear-gradient(90deg,var(--gain),#f59e0b,var(--loss))`, borderRadius: '999px' }} />
                  </div>
                </div>
                <p className="text-[10px] font-semibold truncate" style={{ color: 'var(--text-lo)' }}>{topSector ? topSector[0] : 'No sector data'} · {uniqueSectors} sectors total</p>
              </div>
            );
          })()}

          {/* Downside Deviation */}
          {(() => {
            const ddColor = downsideDeviation < 15 ? 'var(--gain)' : downsideDeviation < 30 ? '#f59e0b' : 'var(--loss)';
            return (
              <div className="card p-5 flex flex-col gap-3 relative overflow-visible">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    Downside Deviation <InfoTooltip description={`WHAT IT MEANS:\nMeasures volatility of ONLY the losing stocks — the "bad" side of volatility used in the Sortino Ratio calculation.\n\nFORMULA:\nDownside Dev = √(Σ(negative returns²) ÷ total stocks)\n• Negative return stocks: ${downsideReturns.length}\n• Total stocks: ${returns.length}\n• Downside Deviation: ${downsideDeviation.toFixed(2)}%\n\nLower = better downside protection`} />
                  </p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `color-mix(in srgb,${ddColor} 15%,transparent)`, color: ddColor }}>{downsideDeviation < 15 ? 'Protected' : downsideDeviation < 30 ? 'Moderate' : 'Exposed'}</span>
                </div>
                <p className="text-3xl font-black metric-value leading-none" style={{ color: ddColor }}>{downsideDeviation.toFixed(1)}%</p>
                <div>
                  <div className="flex justify-between text-[9px] mb-1" style={{ color: 'var(--text-muted)' }}><span>Low &lt;15%</span><span>Mod 15–30%</span><span>High &gt;30%</span></div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
                    <div style={{ width: `${Math.min(100, (downsideDeviation / 45) * 100)}%`, height: '100%', background: `linear-gradient(90deg,var(--gain),#f59e0b,var(--loss))`, borderRadius: '999px' }} />
                  </div>
                </div>
                <p className="text-[10px]" style={{ color: 'var(--text-lo)' }}>{downsideReturns.length} stocks in loss · σ↓ = {downsideDeviation.toFixed(1)}%</p>
              </div>
            );
          })()}

        </div>
      </div>

      {/* ── Portfolio Deep Insights ──────────────────────────── */}
      <div>
        <SectionTitle>Portfolio Deep Insights</SectionTitle>
        <PortfolioInsights holdings={holdings} />
      </div>

      {/* ── Performance Analytics Charts ─────────────────────── */}
      <div>
        <SectionTitle>Performance Analytics & Trend Detection</SectionTitle>
        <PerformanceAnalyticsCharts clientId="994826" holdings={holdings} transactions={transactions} />
      </div>

      {/* ── Portfolio Entry Timeline ──────────────────────────── */}
      <div>
        <SectionTitle>Portfolio Entry Timeline</SectionTitle>
        <PortfolioTimeline holdings={holdings} transactions={transactions} realizedStocks={realizedStocks} />
      </div>

      {/* ── Stock Milestone Tracker ──────────────────────────── */}
      <div>
        <SectionTitle>Stock Milestone Tracker</SectionTitle>
        <StockMilestoneTracker holdings={holdings} />
      </div>

      {/* ── Dividend Insights ─────────────────────────────────── */}
      <div>
        <SectionTitle>Dividend Income Insights · Last 12 Months</SectionTitle>
        <DividendInsights
          monthlyDividends={monthlyDividends}
          avgMonthlyDividendsLast12M={avgMonthlyDividendsLast12M}
          medianMonthlyDividendsLast12M={medianMonthlyDividendsLast12M}
          totalInvested={totalInvested}
        />
      </div>

      {/* ── Capital Allocation Efficiency ────────────────────── */}
      <div>
        <SectionTitle>Capital Allocation Efficiency</SectionTitle>
        <CapitalEfficiency holdings={holdings} />
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
