'use client';

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';

/* ─── Types ─────────────────────────────────────────────── */
interface RealizedStock {
  stockName: string;
  totalPL?: number;
  totalPLPercent?: number;
  realizedProfitLoss?: number;
  totalInvested?: number;
  holdingPeriodYears?: number;
  holdingPeriodMonths?: number;
  holdingPeriodDays?: number;
}
interface Props {
  summary: {
    currentValue?: number;
    totalInvested?: number;
    totalProfitLoss?: number;
  };
  realizedStocks: RealizedStock[];
  monthlyDividends: { month: string; amount: number }[];
}

function abbrev(n: string, max = 16) {
  const s = n.replace(/\s+(LIMITED|LTD\.?|INDUSTRIES|ENTERPRISES|CORP\.?|INC\.?|PVT\.?|PRIVATE)\.?\s*$/i, '').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
function hStr(y = 0, m = 0, d = 0) {
  const totalM = y * 12 + m;
  if (totalM === 0) return d ? `${d}d` : '—';
  return y > 0 ? `${y}y ${m}m` : `${m}m`;
}

/* ─── Main ───────────────────────────────────────────────── */
export default function WealthBreakdown({ summary, realizedStocks, monthlyDividends }: Props) {
  const [view, setView] = useState<'waterfall' | 'trades'>('waterfall');

  /* ── Core numbers ── */
  const {
    activeInvested, unrealizedPL, realizedPL, totalDividends,
    totalDeployed, totalWealthCreated, activeCurrentValue,
    winCount, lossCount, winRate,
    avgHoldWin, avgHoldLoss,
    topWins, topLosses,
    waterfallData,
  } = useMemo(() => {
    const activeInvested    = summary?.totalInvested   ?? 0;
    const unrealizedPL      = summary?.totalProfitLoss ?? 0;
    const activeCurrentValue = summary?.currentValue   ?? 0;

    const realizedPL        = realizedStocks.reduce((s, r) => s + (r.totalPL ?? r.realizedProfitLoss ?? 0), 0);
    const totalRealInvested = realizedStocks.reduce((s, r) => s + (r.totalInvested ?? 0), 0);
    const totalDeployed     = activeInvested + totalRealInvested;
    const totalDividends    = monthlyDividends.reduce((s, d) => s + (d.amount || 0), 0);
    const totalWealthCreated = unrealizedPL + realizedPL + totalDividends;

    /* Realized trade analytics */
    const winners = realizedStocks.filter(r => (r.totalPL ?? r.realizedProfitLoss ?? 0) > 0);
    const losers  = realizedStocks.filter(r => (r.totalPL ?? r.realizedProfitLoss ?? 0) < 0);
    const winCount  = winners.length;
    const lossCount = losers.length;
    const winRate   = realizedStocks.length > 0 ? (winCount / realizedStocks.length) * 100 : 0;

    const avgHold = (stocks: RealizedStock[]) => {
      if (!stocks.length) return 0;
      const totalM = stocks.reduce((s, r) => s + (r.holdingPeriodYears ?? 0) * 12 + (r.holdingPeriodMonths ?? 0), 0);
      return Math.round(totalM / stocks.length);
    };
    const avgHoldWin  = avgHold(winners);
    const avgHoldLoss = avgHold(losers);

    /* Sort by total PL */
    const sorted    = [...realizedStocks].sort((a, b) =>
      (b.totalPL ?? b.realizedProfitLoss ?? 0) - (a.totalPL ?? a.realizedProfitLoss ?? 0));
    const topWins   = sorted.slice(0, 3).filter(r => (r.totalPL ?? r.realizedProfitLoss ?? 0) > 0);
    const topLosses = [...realizedStocks]
      .sort((a, b) => (a.totalPL ?? a.realizedProfitLoss ?? 0) - (b.totalPL ?? b.realizedProfitLoss ?? 0))
      .slice(0, 3)
      .filter(r => (r.totalPL ?? r.realizedProfitLoss ?? 0) < 0);

    /* Waterfall chart data */
    const waterfallData = [
      { name: 'Active\nInvested',  value: activeInvested,   type: 'invested',  label: '💼 Active Capital' },
      { name: 'Realized\nInvested',value: totalRealInvested,type: 'invested2', label: '📤 Exited Capital' },
      { name: 'Unrealized\nGain',  value: unrealizedPL,     type: unrealizedPL >= 0 ? 'gain' : 'loss', label: '📈 Unrealised' },
      { name: 'Realized\nGain',    value: realizedPL,       type: realizedPL   >= 0 ? 'gain' : 'loss', label: '🏧 Realised' },
      { name: 'Dividends',         value: totalDividends,   type: 'dividend',  label: '💛 Dividends' },
    ].filter(d => Math.abs(d.value) > 0);

    return {
      activeInvested, unrealizedPL, realizedPL, totalDividends,
      totalDeployed, totalWealthCreated, activeCurrentValue,
      winCount, lossCount, winRate,
      avgHoldWin, avgHoldLoss,
      topWins, topLosses,
      waterfallData,
    };
  }, [summary, realizedStocks, monthlyDividends]);

  const barColor = (type: string) => ({
    invested:  '#6366f1', invested2: '#818cf8',
    gain:      '#10b981', loss:      '#f43f5e',
    dividend:  '#fbbf24',
  }[type] || '#94a3b8');

  const isOverallPos = totalWealthCreated >= 0;

  /* ── Stat cards ── */
  const statCards = [
    {
      label: 'Total Capital Deployed',
      val:   formatCurrency(totalDeployed),
      sub:   'Active + Exited positions',
      color: '#818cf8',
      icon:  '💼',
    },
    {
      label: 'Unrealised P&L',
      val:   `${unrealizedPL >= 0 ? '+' : ''}${formatCurrency(unrealizedPL)}`,
      sub:   `Current open positions`,
      color: unrealizedPL >= 0 ? '#10b981' : '#f43f5e',
      icon:  '📈',
    },
    {
      label: 'Realised P&L',
      val:   `${realizedPL >= 0 ? '+' : ''}${formatCurrency(realizedPL)}`,
      sub:   `${realizedStocks.length} closed positions`,
      color: realizedPL >= 0 ? '#10b981' : '#f43f5e',
      icon:  '🏧',
    },
    {
      label: 'Dividend Income',
      val:   formatCurrency(totalDividends),
      sub:   `${monthlyDividends.length} months of income`,
      color: '#fbbf24',
      icon:  '💛',
    },
    {
      label: 'Total Wealth Created',
      val:   `${isOverallPos ? '+' : ''}${formatCurrency(totalWealthCreated)}`,
      sub:   'Unrealised + Realised + Dividends',
      color: isOverallPos ? '#10b981' : '#f43f5e',
      icon:  isOverallPos ? '🚀' : '📉',
    },
    {
      label: 'Closed Trade Win Rate',
      val:   realizedStocks.length ? `${winRate.toFixed(1)}%` : '—',
      sub:   `${winCount} wins · ${lossCount} losses`,
      color: winRate >= 60 ? '#10b981' : winRate >= 50 ? '#fbbf24' : '#f43f5e',
      icon:  '🎯',
    },
  ];

  return (
    <div className="card animate-fadeIn overflow-hidden">

      {/* ── Header ── */}
      <div className="px-6 pt-5 pb-4"
        style={{ borderBottom: '1px solid var(--border-sm)', background: 'linear-gradient(135deg,rgba(99,102,241,0.06) 0%,rgba(251,191,36,0.04) 100%)' }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-1 h-6 rounded-full flex-shrink-0"
                style={{ background: 'linear-gradient(180deg,#818cf8 0%,#fbbf24 100%)' }} />
              <h2 className="text-[15px] font-black tracking-tight" style={{ color: 'var(--text-hi)' }}>
                Complete Wealth Breakdown
              </h2>
              <span className="hidden sm:inline text-[10px] font-bold px-2 py-0.5 rounded-full border"
                style={{ background: 'rgba(99,102,241,0.12)', borderColor: 'rgba(99,102,241,0.3)', color: '#818cf8' }}>
                Full Picture
              </span>
            </div>
            <p className="text-[11px] ml-3.5" style={{ color: 'var(--text-lo)' }}>
              Every rupee deployed · Unrealised + Realised gains · Dividend income · Closed trade report card
            </p>
          </div>
          {/* View toggle */}
          <div className="flex gap-1 p-1 rounded-lg"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
            {([['waterfall', '📊 Waterfall'], ['trades', '🏧 Trade Report']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setView(v)}
                className="px-3 py-1 rounded-md text-[11px] font-semibold transition-all"
                style={{
                  background: view === v ? 'var(--bg-card)' : 'transparent',
                  color:      view === v ? 'var(--brand)'   : 'var(--text-lo)',
                  boxShadow:  view === v ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6">

        {/* ── 6 stat cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {statCards.map(({ label, val, sub, color, icon }) => (
            <div key={label} className="rounded-2xl p-3 flex flex-col gap-1"
              style={{ background: `${color}0d`, border: `1px solid ${color}28` }}>
              <div className="flex items-center justify-between">
                <span className="text-lg leading-none">{icon}</span>
              </div>
              <p className="text-[13px] font-black leading-tight mt-1" style={{ color }}>{val}</p>
              <p className="text-[10px] font-semibold" style={{ color: 'var(--text-lo)' }}>{label}</p>
              <p className="text-[9px] leading-snug" style={{ color: 'var(--text-lo)', opacity: 0.7 }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* ── Wealth composition strip ── */}
        <div className="rounded-2xl p-4 mb-6"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-lo)' }}>
            Total Wealth Composition
          </p>
          {/* Stacked horizontal bar */}
          {(() => {
            const totalBar = Math.max(
              totalDeployed + Math.max(unrealizedPL, 0) + Math.max(realizedPL, 0) + totalDividends,
              1
            );
            const segments = [
              { label: 'Capital Deployed', val: totalDeployed,                   color: '#6366f1' },
              { label: 'Unrealised Gain',  val: Math.max(unrealizedPL, 0),       color: '#10b981' },
              { label: 'Realised Gain',    val: Math.max(realizedPL, 0),         color: '#34d399' },
              { label: 'Dividends',        val: totalDividends,                   color: '#fbbf24' },
              { label: 'Unrealised Loss',  val: Math.abs(Math.min(unrealizedPL, 0)), color: '#f43f5e' },
              { label: 'Realised Loss',    val: Math.abs(Math.min(realizedPL, 0)),   color: '#fb7185' },
            ].filter(s => s.val > 0);
            const totalPositive = segments.reduce((s, seg) => s + seg.val, 0);
            return (
              <>
                <div className="flex rounded-xl overflow-hidden h-6 mb-2" style={{ gap: 1 }}>
                  {segments.map(seg => (
                    <div key={seg.label}
                      style={{
                        width:      `${(seg.val / totalPositive) * 100}%`,
                        background: seg.color,
                        minWidth:   seg.val > 0 ? 2 : 0,
                      }}
                      title={`${seg.label}: ${formatCurrency(seg.val)}`}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {segments.map(seg => (
                    <div key={seg.label} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: seg.color }} />
                      <span className="text-[10px]" style={{ color: 'var(--text-lo)' }}>
                        {seg.label} <strong style={{ color: 'var(--text-hi)' }}>{formatCurrency(seg.val)}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>

        {view === 'waterfall' ? (
          <>
            {/* ── Capital breakdown bar chart ── */}
            <div className="rounded-2xl p-4 mb-6"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-lo)' }}>
                Return Component Breakdown
              </p>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={waterfallData} margin={{ top: 8, right: 16, bottom: 8, left: 16 }} barSize={48}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} stroke="none" />
                    <YAxis
                      tickFormatter={v => {
                        const a = Math.abs(v);
                        return a >= 100000 ? `${v < 0 ? '-' : ''}₹${(a/100000).toFixed(1)}L` : `${v < 0 ? '-' : ''}₹${(a/1000).toFixed(0)}k`;
                      }}
                      tick={{ fill: '#64748b', fontSize: 10 }} stroke="none" />
                    <ReferenceLine y={0} stroke="#374151" strokeWidth={1} />
                    <Tooltip
                      cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload;
                        const pos = d.value >= 0;
                        return (
                          <div className="rounded-xl p-3 shadow-2xl"
                            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
                            <p className="font-bold text-[12px] mb-1.5" style={{ color: 'var(--text-hi)' }}>{d.label}</p>
                            <p className="text-[12px] font-black" style={{ color: pos ? '#10b981' : '#f43f5e' }}>
                              {pos ? '+' : ''}{formatCurrency(d.value)}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {waterfallData.map((entry, i) => (
                        <Cell key={i} fill={barColor(entry.type)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Active vs Realized comparison ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  title:  '📊 Active Portfolio',
                  color:  '#818cf8',
                  bg:     'rgba(129,140,248,0.07)',
                  border: 'rgba(129,140,248,0.22)',
                  rows: [
                    { l: 'Invested',       v: formatCurrency(activeInvested),      c: 'var(--text-hi)' },
                    { l: 'Current Value',  v: formatCurrency(activeCurrentValue),  c: 'var(--text-hi)' },
                    { l: 'Unrealised P&L', v: `${unrealizedPL >= 0 ? '+' : ''}${formatCurrency(unrealizedPL)}`, c: unrealizedPL >= 0 ? '#10b981' : '#f43f5e' },
                    { l: 'Return',        v: activeInvested > 0 ? `${((unrealizedPL/activeInvested)*100).toFixed(1)}%` : '—', c: unrealizedPL >= 0 ? '#10b981' : '#f43f5e' },
                  ],
                },
                {
                  title:  '🏧 Closed Positions',
                  color:  '#34d399',
                  bg:     'rgba(52,211,153,0.07)',
                  border: 'rgba(52,211,153,0.22)',
                  rows: [
                    { l: 'Positions Closed', v: `${realizedStocks.length} stocks`,           c: 'var(--text-hi)' },
                    { l: 'Realised P&L',     v: `${realizedPL >= 0 ? '+' : ''}${formatCurrency(realizedPL)}`, c: realizedPL >= 0 ? '#10b981' : '#f43f5e' },
                    { l: 'Win Rate',         v: realizedStocks.length ? `${winRate.toFixed(1)}%` : '—', c: winRate >= 60 ? '#10b981' : '#fbbf24' },
                    { l: 'Avg Hold (Wins)',  v: avgHoldWin ? (avgHoldWin >= 12 ? `${Math.floor(avgHoldWin/12)}y ${avgHoldWin%12}m` : `${avgHoldWin}m`) : '—', c: 'var(--text-hi)' },
                  ],
                },
              ].map(({ title, color, bg, border, rows }) => (
                <div key={title} className="rounded-2xl p-4"
                  style={{ background: bg, border: `1px solid ${border}` }}>
                  <p className="text-[12px] font-bold mb-3" style={{ color }}>{title}</p>
                  <div className="space-y-2">
                    {rows.map(({ l, v, c }) => (
                      <div key={l} className="flex justify-between items-center gap-3 py-1.5"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <span className="text-[11px]" style={{ color: 'var(--text-lo)' }}>{l}</span>
                        <span className="text-[12px] font-bold" style={{ color: c }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* ── Trade Report Card ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Trades Closed', val: `${realizedStocks.length}`, color: 'var(--brand)',                            icon: '📋' },
                { label: 'Win Rate',      val: `${winRate.toFixed(1)}%`,   color: winRate >= 60 ? '#10b981' : '#fbbf24',      icon: '🎯' },
                { label: 'Avg Hold (W)',  val: avgHoldWin  ? hStr(Math.floor(avgHoldWin/12), avgHoldWin%12) : '—',  color: '#10b981', icon: '⏱️' },
                { label: 'Avg Hold (L)',  val: avgHoldLoss ? hStr(Math.floor(avgHoldLoss/12), avgHoldLoss%12) : '—', color: '#f43f5e', icon: '⏱️' },
              ].map(({ label, val, color, icon }) => (
                <div key={label} className="rounded-2xl p-4 text-center"
                  style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
                  <span className="text-2xl mb-2 block">{icon}</span>
                  <p className="text-[16px] font-black" style={{ color }}>{val}</p>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-lo)' }}>{label}</p>
                </div>
              ))}
            </div>

            {/* ── Top wins and losses ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  title: '🏆 Best Closed Trades',
                  stocks: topWins,
                  color: '#10b981', bg: 'rgba(16,185,129,0.07)', border: 'rgba(16,185,129,0.2)',
                  getVal: (r: RealizedStock) => r.totalPL ?? r.realizedProfitLoss ?? 0,
                  getPct: (r: RealizedStock) => r.totalPLPercent ?? 0,
                  sign: '+',
                },
                {
                  title: '📉 Worst Closed Trades',
                  stocks: topLosses,
                  color: '#f43f5e', bg: 'rgba(244,63,94,0.07)', border: 'rgba(244,63,94,0.2)',
                  getVal: (r: RealizedStock) => r.totalPL ?? r.realizedProfitLoss ?? 0,
                  getPct: (r: RealizedStock) => r.totalPLPercent ?? 0,
                  sign: '',
                },
              ].map(({ title, stocks, color, bg, border, getVal, getPct, sign }) => (
                <div key={title} className="rounded-2xl p-4"
                  style={{ background: bg, border: `1px solid ${border}` }}>
                  <p className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color }}>{title}</p>
                  {stocks.length === 0 ? (
                    <p className="text-[11px]" style={{ color: 'var(--text-lo)' }}>No data available</p>
                  ) : (
                    <div className="space-y-3">
                      {stocks.map((r, i) => {
                        const pl  = getVal(r);
                        const pct = getPct(r);
                        const totalM = (r.holdingPeriodYears ?? 0) * 12 + (r.holdingPeriodMonths ?? 0);
                        return (
                          <div key={r.stockName} className="flex items-start gap-3">
                            <span className="text-[11px] font-black w-4 flex-shrink-0 mt-0.5"
                              style={{ color }}>{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-bold truncate" style={{ color: 'var(--text-hi)' }}>
                                {abbrev(r.stockName)}
                              </p>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-[10px]" style={{ color: 'var(--text-lo)' }}>
                                  {hStr(r.holdingPeriodYears, r.holdingPeriodMonths, r.holdingPeriodDays)} held
                                </span>
                                {pct !== 0 && (
                                  <span className="text-[10px] font-semibold" style={{ color }}>
                                    {sign}{Math.abs(pct).toFixed(1)}% return
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-[12px] font-black flex-shrink-0" style={{ color }}>
                              {sign}{formatCurrency(Math.abs(pl))}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ── All realized table (if many) ── */}
            {realizedStocks.length > 3 && (
              <div className="mt-5 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-sm)' }}>
                <div className="px-4 py-2.5" style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-sm)' }}>
                  <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--text-lo)' }}>
                    All Closed Positions ({realizedStocks.length})
                  </p>
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-raised)', position: 'sticky', top: 0 }}>
                        {['Stock', 'Held', 'Realised P&L', '% Return'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-lo)', textAlign: h === 'Stock' ? 'left' : 'right', borderBottom: '1px solid var(--border-sm)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...realizedStocks]
                        .sort((a, b) => (b.totalPL ?? b.realizedProfitLoss ?? 0) - (a.totalPL ?? a.realizedProfitLoss ?? 0))
                        .map((r, i) => {
                          const pl  = r.totalPL ?? r.realizedProfitLoss ?? 0;
                          const pct = r.totalPLPercent ?? 0;
                          const pos = pl >= 0;
                          return (
                            <tr key={r.stockName}
                              style={{ borderBottom: '1px solid var(--border-sm)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                              <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text-hi)' }}>{abbrev(r.stockName)}</td>
                              <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-lo)', textAlign: 'right' }}>{hStr(r.holdingPeriodYears, r.holdingPeriodMonths, r.holdingPeriodDays)}</td>
                              <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, color: pos ? '#10b981' : '#f43f5e', textAlign: 'right' }}>{pos ? '+' : ''}{formatCurrency(pl)}</td>
                              <td style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: pos ? '#10b981' : '#f43f5e', textAlign: 'right' }}>{pos ? '+' : ''}{pct.toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
