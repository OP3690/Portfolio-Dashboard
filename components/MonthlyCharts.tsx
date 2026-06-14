'use client';

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  Area,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';

interface MonthlyChartsProps {
  monthlyInvestments: Array<{ 
    month: string; 
    investments: number; 
    withdrawals: number;
    investmentDetails?: Array<{stockName: string; qty: number; amount: number}>;
    withdrawalDetails?: Array<{stockName: string; qty: number; amount: number}>;
  }>;
  monthlyInvestmentAverages?: {
    avgMonthlyInvestment: number;
    avgMonthlyWithdrawal: number;
    netCashflow: number;
  };
  monthlyDividends: Array<{ month: string; amount: number; stockDetails?: Array<{stockName: string; amount: number}> }>;
  avgMonthlyDividends?: number;
  medianMonthlyDividendsLast12M?: number;
  avgMonthlyDividendsLast12M?: number;
  totalInvested?: number;
  monthlyReturns: Array<{ month: string; returnPercent: number; returnAmount: number }>;
  returnStatistics?: {
    xirr: number;
    weightedXirr?: number;
    cagr: number;
    avgReturnOverall: { percent: number; amount: number };
    avgReturnCurrentYear: { percent: number; amount: number };
    bestMonthCurrentYear: { month: string; percent: number; amount: number };
    worstMonthCurrentYear: { month: string; percent: number; amount: number };
  };
}

export default function MonthlyCharts({
  monthlyInvestments,
  monthlyInvestmentAverages,
  monthlyDividends,
  avgMonthlyDividends,
  medianMonthlyDividendsLast12M,
  avgMonthlyDividendsLast12M,
  totalInvested,
  monthlyReturns,
  returnStatistics,
}: MonthlyChartsProps) {
  // Parse month strings into timestamps for chronological sorting.
  // Handles multiple formats:
  //   "Nov-25"   → MMM-YY  (2-digit year, e.g. 25 → 2025)
  //   "Nov 2025" → MMM YYYY
  //   "2025-11"  → YYYY-MM  (ISO-style)
  const parseMonthStr = (m: string): number => {
    if (!m) return 0;
    const s = m.trim();

    // "MMM-YY"  e.g. "Jan-21", "Nov-25"
    const dashShort = s.match(/^([A-Za-z]{3})-(\d{2})$/);
    if (dashShort) {
      const yr = parseInt(dashShort[2], 10);
      const fullYear = yr >= 0 && yr <= 99 ? 2000 + yr : yr;
      return new Date(`${dashShort[1]} 1, ${fullYear}`).getTime();
    }

    // "MMM YYYY" e.g. "Jan 2021"
    const spaceYY = s.match(/^([A-Za-z]{3})\s+(\d{4})$/);
    if (spaceYY) return new Date(`${spaceYY[1]} 1, ${spaceYY[2]}`).getTime();

    // "YYYY-MM" e.g. "2021-01"
    const isoStyle = s.match(/^(\d{4})-(\d{2})$/);
    if (isoStyle) return new Date(`${isoStyle[1]}-${isoStyle[2]}-01`).getTime();

    // Generic fallback
    const d = new Date(s);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };

  // Guard against undefined/null data, ensure proper data structure, sort oldest → latest.
  // Memoised so the RAF animation loop's constant re-renders don't create new array
  // references every frame (which confuses Recharts into ignoring data prop changes).
  const safeMonthlyInvestments = useMemo(() =>
    (monthlyInvestments || [])
      .map(item => ({
        ...item,
        investments: Number(item.investments || 0),
        withdrawals: Number(item.withdrawals || 0),
      }))
      .sort((a, b) => parseMonthStr(a.month) - parseMonthStr(b.month)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [monthlyInvestments]);

  const safeMonthlyDividends = (monthlyDividends || [])
    .map(item => ({
      ...item,
      amount: Number(item.amount || 0),
    }))
    .sort((a, b) => parseMonthStr(a.month) - parseMonthStr(b.month));

  const safeMonthlyReturns = (monthlyReturns || [])
    .map(item => ({
      ...item,
      returnPercent: Number(item.returnPercent || 0),
      returnAmount: Number(item.returnAmount || 0),
    }))
    .sort((a, b) => parseMonthStr(a.month) - parseMonthStr(b.month));

  // Median helper
  const computeMedian = (arr: number[]) => {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const medianLast6M = computeMedian(safeMonthlyDividends.slice(-6).map(d => d.amount));
  const medianLast3M = computeMedian(safeMonthlyDividends.slice(-3).map(d => d.amount));

  // Investments & Withdrawals period toggle: 'all' | '5y'
  const [invPeriod, setInvPeriod] = useState<'all' | '5y'>('all');

  // Last-5-year slice: keep only the most recent 60 months.
  // Stable reference — only changes when invPeriod or source data changes.
  const filteredMonthlyInvestments = useMemo(() =>
    invPeriod === '5y' ? safeMonthlyInvestments.slice(-60) : safeMonthlyInvestments,
  [invPeriod, safeMonthlyInvestments]);

  // Cross-chart hover sync
  const [activeMonth, setActiveMonth]   = useState<string | null>(null);
  const [activeChart, setActiveChart]   = useState<string | null>(null);
  const [activeExplain, setActiveExplain] = useState<'xirr' | 'wxirr' | 'cagr' | null>(null);

  // Enrich filtered data with per-month net cashflow + mirrored withdrawals
  const chartInvData = useMemo(() =>
    filteredMonthlyInvestments.map(d => ({
      ...d,
      net:              (d.investments || 0) - (d.withdrawals || 0),
      negWithdrawals:   -(d.withdrawals || 0),   // downward bars
    })),
  [filteredMonthlyInvestments]);

  // Don't render charts if there's no data
  if (safeMonthlyInvestments.length === 0 && safeMonthlyDividends.length === 0 && safeMonthlyReturns.length === 0) {
    return (
      <div className="mt-6">
        <div className="card p-8 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
            <svg className="w-8 h-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-lo font-medium">No chart data available</p>
          <p className="text-sm text-muted mt-1">Please upload your portfolio data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6" style={{ position: 'relative', zIndex: 1 }}>
      {/* ── Month on Month Investments & Withdrawals ── */}
      {safeMonthlyInvestments.length > 0 && (() => {
        const totalInv   = chartInvData.reduce((s, d) => s + d.investments, 0);
        const totalWdl   = chartInvData.reduce((s, d) => s + d.withdrawals, 0);
        const netInv     = totalInv - totalWdl;
        const activeMos  = chartInvData.filter(d => d.investments > 0).length || 1;
        const avgInv     = totalInv / activeMos;
        const avgWdl     = totalWdl / (chartInvData.filter(d => d.withdrawals > 0).length || 1);
        const xInterval  = chartInvData.length > 48 ? 5
                         : chartInvData.length > 24 ? 2
                         : chartInvData.length > 12 ? 1 : 0;

        // Use the authoritative totalInvested from the API summary when available;
        // fall back to chart-computed (gross buys − gross sells) only if not passed.
        const netDeployedVal = totalInvested !== undefined ? totalInvested : netInv;

        const pills = [
          { label: 'Gross Invested',      val: totalInv,       color: '#3b82f6' },
          { label: 'Total Withdrawal',    val: totalWdl,       color: '#ef4444' },
          { label: 'Total Invested',      val: netDeployedVal, color: netDeployedVal >= 0 ? 'var(--gain)' : 'var(--loss)' },
          { label: 'Avg Monthly Invest',  val: avgInv,         color: '#3b82f6' },
          { label: 'Avg Monthly Withdraw',val: avgWdl,         color: '#ef4444' },
        ];

        return (
        <div className="card p-6">
          {/* ── Header: title + toggle ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="section-title text-base flex items-center gap-2">
              <div className="w-1 h-5 rounded-full" style={{ background: 'var(--brand)' }} />
              Month on Month Investments &amp; Withdrawals
            </h2>
            {/* Period toggle */}
            <div className="flex items-center rounded-full p-[3px]"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)', gap: 2 }}>
              {(['all', '5y'] as const).map(opt => (
                <button key={opt} onClick={() => setInvPeriod(opt)}
                  className="text-[11px] font-bold px-3.5 py-1 rounded-full transition-all duration-200"
                  style={invPeriod === opt
                    ? { background: 'var(--brand)', color: '#fff', boxShadow: '0 1px 8px color-mix(in srgb,var(--brand) 45%,transparent)' }
                    : { background: 'transparent', color: 'var(--text-lo)' }}>
                  {opt === 'all' ? 'All Time' : 'Last 5 Yr'}
                </button>
              ))}
            </div>
          </div>

          {/* ── Stat pills row ── */}
          <div className="flex flex-wrap gap-2.5 mb-5">
            {pills.map(({ label, val, color }) => (
              <div key={label} className="stat-pill">
                <p className="stat-pill-label">{label}</p>
                <p className="stat-pill-value metric-value" style={{ color }}>{formatCurrency(val)}</p>
              </div>
            ))}
          </div>

          {/* ── Chart ── */}
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              key={`inv-${invPeriod}`}
              data={chartInvData}
              margin={{ top: 8, right: 30, left: 20, bottom: 8 }}
              onMouseMove={(e: any) => { if (e?.activeLabel) { setActiveMonth(e.activeLabel); setActiveChart('investments'); } }}
              onMouseLeave={() => { setActiveMonth(null); setActiveChart(null); }}
              barGap={2}
              barCategoryGap="32%"
            >
              <defs>
                {/* Investment bars — blue, top-heavy */}
                <linearGradient id="invGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#60a5fa" stopOpacity={1} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0.85} />
                </linearGradient>
                {/* Withdrawal bars — rose, bottom-heavy (bars go downward) */}
                <linearGradient id="wdlGrad" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%"   stopColor="#fb7185" stopOpacity={1} />
                  <stop offset="100%" stopColor="#dc2626" stopOpacity={0.85} />
                </linearGradient>
                {/* Net positive line */}
                <linearGradient id="netPosGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#34d399" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0.05} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-sm)" opacity={0.6} />

              {/* Zero baseline */}
              <ReferenceLine y={0} stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="0" />

              <XAxis
                dataKey="month"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                stroke="#9ca3af"
                angle={-35}
                textAnchor="end"
                height={55}
                interval={xInterval}
              />
              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={(v) => {
                  const abs = Math.abs(v);
                  const fmt = abs >= 1_00_000
                    ? `₹${(abs/1_00_000).toFixed(1)}L`
                    : `₹${(abs/1_000).toFixed(0)}k`;
                  return v < 0 ? `−${fmt}` : fmt;
                }}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                stroke="#9ca3af"
                width={72}
              />

              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d       = chartInvData.find(r => r.month === label);
                  const inv     = d?.investments  || 0;
                  const wdl     = d?.withdrawals  || 0;
                  const net     = inv - wdl;
                  const invRows = d?.investmentDetails  || [];
                  const wdlRows = d?.withdrawalDetails  || [];
                  const hasBoth = inv > 0 && wdl > 0;

                  const ColSection = ({ title, amt, rows, color }: any) => (
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
                        <div style={{ width: 7, height: 7, borderRadius: 2, background: color }} />
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</span>
                      </div>
                      <div style={{ padding: '4px 10px', borderRadius: 8, textAlign: 'center', marginBottom: rows.length ? 6 : 0, background: `color-mix(in srgb,${color} 10%,transparent)`, border: `1px solid color-mix(in srgb,${color} 25%,transparent)` }}>
                        <span style={{ fontSize: 14, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(amt)}</span>
                      </div>
                      {rows.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 150, overflowY: 'auto' }}>
                          {rows.map((r: any, i: number) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 6px', borderRadius: 5, background: 'var(--bg-raised)', gap: 4 }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: hasBoth ? 85 : 140 }}>{r.stockName}</span>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{r.qty?.toLocaleString()} sh</span>
                                <span style={{ fontSize: 10, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(r.amount)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );

                  return (
                    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-md)', borderRadius: 16, boxShadow: 'var(--shadow-lg)', width: hasBoth ? 520 : 300, overflow: 'hidden' }}>
                      <div style={{ padding: '9px 14px', background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-hi)' }}>📅 {label}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99, color: net >= 0 ? 'var(--gain)' : 'var(--loss)', background: net >= 0 ? 'var(--gain-bg)' : 'var(--loss-bg)', border: `1px solid ${net >= 0 ? 'var(--gain-border)' : 'var(--loss-border)'}` }}>
                          Net {net >= 0 ? '+' : '−'}{formatCurrency(Math.abs(net))}
                        </span>
                      </div>
                      <div style={{ padding: '11px 14px', display: 'flex', gap: 12 }}>
                        {inv > 0 && <ColSection title="Invested (Buy)" amt={inv} rows={invRows} color="#3b82f6" />}
                        {hasBoth && <div style={{ width: 1, background: 'var(--border-md)', alignSelf: 'stretch', flexShrink: 0 }} />}
                        {wdl > 0 && <ColSection title="Withdrawn (Sell)" amt={wdl} rows={wdlRows} color="#ef4444" />}
                      </div>
                    </div>
                  );
                }}
              />

              <Legend
                wrapperStyle={{ paddingTop: 14 }}
                iconSize={10}
                formatter={(value) => <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-lo)' }}>{value}</span>}
              />

              {/* Investment bars — go UP */}
              <Bar dataKey="investments" name="Invested (Buy)" fill="url(#invGrad)" radius={[5,5,0,0]} maxBarSize={28} />

              {/* Withdrawal bars — go DOWN (negative values) */}
              <Bar dataKey="negWithdrawals" name="Withdrawn (Sell)" fill="url(#wdlGrad)" radius={[0,0,5,5]} maxBarSize={28} />

              {/* Net cashflow trend line — green, dotted */}
              <Line
                type="natural"
                dataKey="net"
                name="Net / Month"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3, fill: '#10b981', stroke: '#fff', strokeWidth: 1.5 }}
                activeDot={{ r: 5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                legendType="line"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        );
      })()}

      {/* ── Month on Month Dividends Earned ── */}
      {(() => {
        const divXInterval = safeMonthlyDividends.length > 48 ? 5
                           : safeMonthlyDividends.length > 24 ? 2
                           : safeMonthlyDividends.length > 12 ? 1 : 0;
        const totalDiv = safeMonthlyDividends.reduce((s, d) => s + d.amount, 0);

        return (
        <div className="card p-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="section-title text-base flex items-center gap-2">
              <div className="w-1 h-5 rounded-full" style={{ background: 'var(--gain)' }} />
              Month on Month Dividends Earned
            </h2>
          </div>

          {/* Stat pills */}
          <div className="flex flex-wrap gap-2.5 mb-5">
            {[
              { label: 'Total Earned',      val: totalDiv,                        show: true },
              { label: 'Avg. Monthly',      val: avgMonthlyDividends ?? 0,        show: avgMonthlyDividends !== undefined },
              { label: 'Avg. (Last 12M)',   val: avgMonthlyDividendsLast12M ?? 0, show: avgMonthlyDividendsLast12M !== undefined },
              { label: 'Median (Last 12M)', val: medianMonthlyDividendsLast12M ?? 0, show: medianMonthlyDividendsLast12M !== undefined },
              { label: 'Median (Last 6M)',  val: medianLast6M,  show: safeMonthlyDividends.length >= 6 },
              { label: 'Median (Last 3M)',  val: medianLast3M,  show: safeMonthlyDividends.length >= 3 },
            ].filter(p => p.show).map(({ label, val }) => (
              <div key={label} className="stat-pill">
                <p className="stat-pill-label">{label}</p>
                <p className="stat-pill-value metric-value" style={{ color: 'var(--gain)' }}>{formatCurrency(val)}</p>
              </div>
            ))}
          </div>

          {safeMonthlyDividends.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
                style={{ background: 'color-mix(in srgb,var(--gain) 12%,transparent)' }}>
                <span className="text-2xl">💰</span>
              </div>
              <p className="font-semibold" style={{ color: 'var(--text-hi)' }}>No dividend records found</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-lo)' }}>
                Re-upload your portfolio Excel — ensure dividend rows have "Buy/Sell = Dividend" and a valid amount.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart
                data={safeMonthlyDividends}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                barCategoryGap="30%"
                onMouseMove={(e: any) => { if (e?.activeLabel) { setActiveMonth(e.activeLabel); setActiveChart('dividends'); } }}
                onMouseLeave={() => { setActiveMonth(null); setActiveChart(null); }}
              >
                <defs>
                  <linearGradient id="divGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} stroke="#9ca3af"
                  angle={-35} textAnchor="end" height={55} interval={divXInterval} />
                <YAxis tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`}
                  tick={{ fill: '#6b7280', fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d      = safeMonthlyDividends.find(r => r.month === label);
                    const total  = d?.amount || 0;
                    const sorted = [...(d?.stockDetails || [])].sort((a: any, b: any) => b.amount - a.amount);
                    const maxAmt = sorted[0]?.amount || 1;
                    return (
                      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-md)', borderRadius: 16, boxShadow: 'var(--shadow-lg)', minWidth: 280, maxWidth: 340, overflow: 'hidden' }}>
                        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-md)', background: 'var(--bg-raised)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-hi)' }}>💰 {label}</span>
                          <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--gain)', fontVariantNumeric: 'tabular-nums', background: 'var(--gain-bg)', padding: '2px 10px', borderRadius: 99, border: '1px solid var(--gain-border)' }}>{formatCurrency(total)}</span>
                        </div>
                        {sorted.length > 0 && (
                          <div style={{ padding: '10px 14px' }}>
                            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 7 }}>By Stock ({sorted.length})</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 190, overflowY: 'auto' }}>
                              {sorted.map((s: any, i: number) => (
                                <div key={i}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-hi)' }}>{s.stockName}</span>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--gain)', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(s.amount)}</span>
                                  </div>
                                  <div style={{ height: 3, borderRadius: 99, background: 'var(--border-md)', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${Math.round((s.amount/maxAmt)*100)}%`, borderRadius: 99, background: 'linear-gradient(90deg,#34d399,#059669)' }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <Legend iconSize={10} wrapperStyle={{ paddingTop: 12 }}
                  formatter={(v) => <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-lo)' }}>{v}</span>} />
                <Bar dataKey="amount" name="Dividend" fill="url(#divGrad)" radius={[4,4,0,0]} maxBarSize={36} />
                <Line type="monotone" dataKey="amount" name="Trend" stroke="#059669" strokeWidth={2}
                  strokeDasharray="5 4" dot={false}
                  activeDot={{ r: 4, fill: '#059669', stroke: '#fff', strokeWidth: 2 }}
                  legendType="line" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        );
      })()}

      {/* ── Month on Month Returns ── */}
      {safeMonthlyReturns.length > 0 && (() => {
        const retXInterval = safeMonthlyReturns.length > 48 ? 5
                           : safeMonthlyReturns.length > 24 ? 2
                           : safeMonthlyReturns.length > 12 ? 1 : 0;
        const gainCount = safeMonthlyReturns.filter(r => r.returnPercent >= 0).length;
        const lossCount = safeMonthlyReturns.length - gainCount;
        const hitRate   = safeMonthlyReturns.length > 0 ? (gainCount / safeMonthlyReturns.length * 100) : 0;

        return (
        <div className="card p-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <h2 className="section-title text-base flex items-center gap-2">
              <div className="w-1 h-5 rounded-full" style={{ background: 'var(--brand)' }} />
              Month on Month Returns
            </h2>
            {/* Win/Loss pill */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                style={{ background: 'color-mix(in srgb,var(--gain) 12%,transparent)', color: 'var(--gain)', border: '1px solid color-mix(in srgb,var(--gain) 25%,transparent)' }}>
                ▲ {gainCount} Gain months
              </span>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                style={{ background: 'color-mix(in srgb,var(--loss) 12%,transparent)', color: 'var(--loss)', border: '1px solid color-mix(in srgb,var(--loss) 25%,transparent)' }}>
                ▼ {lossCount} Loss months
              </span>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                style={{ background: 'color-mix(in srgb,var(--brand) 10%,transparent)', color: 'var(--brand)', border: '1px solid color-mix(in srgb,var(--brand) 25%,transparent)' }}>
                🎯 {hitRate.toFixed(0)}% Hit Rate
              </span>
            </div>
          </div>

          {/* Stats grid */}
          {returnStatistics && (() => {
            const wxirr = returnStatistics.weightedXirr ?? 0;
            const xirrDelta = wxirr - returnStatistics.xirr;

            type ExplainKey = 'xirr' | 'wxirr' | 'cagr';
            const explainContent: Record<ExplainKey, { title: string; lines: string[]; example: { steps: string[]; result: string } }> = {
              xirr: {
                title: 'Portfolio XIRR — Extended Internal Rate of Return',
                lines: [
                  'XIRR finds the single annual return rate that makes the net present value of all your cash flows equal to zero.',
                  'Unlike simple return %, it accounts for exactly when each rupee was invested or withdrawn — so a large investment made 3 months ago counts less "time" than one made 3 years ago.',
                  'Calculated using Newton-Raphson iteration on all BUY and SELL transactions plus today\'s portfolio value.',
                ],
                example: {
                  steps: [
                    'Jan 2024: Invest ₹1,00,000',
                    'Jul 2024: Invest ₹2,00,000',
                    'Dec 2024: Portfolio value = ₹3,60,000',
                    'XIRR solves for r where: −1L/(1+r)^0 − 2L/(1+r)^0.5 + 3.6L/(1+r)^1 = 0',
                  ],
                  result: 'r ≈ 27.4% per year — even though simple return is only 20% on total invested.',
                },
              },
              wxirr: {
                title: 'Weighted XIRR — Investment-Weighted Average',
                lines: [
                  'Each stock\'s individual XIRR is computed, then averaged weighted by how much money you put into that stock.',
                  'Formula: Σ (Stock XIRR × Amount Invested) ÷ Total Invested',
                  'Useful for spotting if a few large positions are inflating or dragging your Portfolio XIRR — compare the delta badge below to see how your big bets are performing relative to the rest.',
                ],
                example: {
                  steps: [
                    'Stock A: ₹1L invested, XIRR = +50%',
                    'Stock B: ₹3L invested, XIRR = +10%',
                    'Weighted XIRR = (50 × 1L + 10 × 3L) ÷ (1L + 3L)',
                    '= (50 + 30) ÷ 4 = 80 ÷ 4',
                  ],
                  result: '= 20% — the large ₹3L position in Stock B pulls the average down from 50%.',
                },
              },
              cagr: {
                title: 'CAGR — Compound Annual Growth Rate',
                lines: [
                  'CAGR answers: "If my net invested capital earned the same fixed rate every year, what rate would give me today\'s portfolio value?"',
                  'Formula: (Current Value ÷ Net Invested) ^ (1 ÷ Holding Years) − 1',
                  'Holding Years uses the amount-weighted average of your BUY dates — so a ₹10L investment in 2024 gets far more weight than a ₹10K trade in 2016, giving a fair effective holding period.',
                  'CAGR will typically be lower than XIRR when you\'ve been adding capital over time, because XIRR rewards the good timing of recent deployments while CAGR treats all money equivalently.',
                ],
                example: {
                  steps: [
                    'Jan 2020: Invest ₹1L → weight 10%',
                    'Jan 2024: Invest ₹9L → weight 90%',
                    'Weighted avg date ≈ Oct 2023 → Holding period ≈ 2.2 years',
                    'Today\'s portfolio value = ₹13L; Net invested = ₹10L',
                    'CAGR = (13 ÷ 10) ^ (1 ÷ 2.2) − 1',
                  ],
                  result: '≈ 12.9% per year — reflects the ~2.2 year effective holding period, not 4 years.',
                },
              },
            };

            const statCards: { label: string; pct: number; color: string; sub: string | null; explainKey?: ExplainKey }[] = [
              {
                label: 'Portfolio XIRR',
                pct: returnStatistics.xirr,
                color: returnStatistics.xirr >= 15 ? 'var(--gain)' : returnStatistics.xirr >= 8 ? 'var(--warn)' : 'var(--loss)',
                sub: null,
                explainKey: 'xirr',
              },
              {
                label: 'Weighted XIRR',
                pct: wxirr,
                color: wxirr >= 15 ? 'var(--gain)' : wxirr >= 8 ? 'var(--warn)' : 'var(--loss)',
                sub: xirrDelta !== 0 ? `${xirrDelta >= 0 ? '+' : ''}${xirrDelta.toFixed(1)}% vs Portfolio` : null,
                explainKey: 'wxirr',
              },
              {
                label: 'CAGR',
                pct: returnStatistics.cagr,
                color: returnStatistics.cagr >= 15 ? 'var(--gain)' : returnStatistics.cagr >= 8 ? 'var(--warn)' : 'var(--loss)',
                sub: null,
                explainKey: 'cagr',
              },
              {
                label: 'Avg Monthly',
                pct: returnStatistics.avgReturnOverall.percent,
                color: returnStatistics.avgReturnOverall.percent >= 0 ? 'var(--gain)' : 'var(--loss)',
                sub: formatCurrency(returnStatistics.avgReturnOverall.amount),
              },
              {
                label: 'Cur Year Avg',
                pct: returnStatistics.avgReturnCurrentYear.percent,
                color: returnStatistics.avgReturnCurrentYear.percent >= 0 ? 'var(--gain)' : 'var(--loss)',
                sub: formatCurrency(returnStatistics.avgReturnCurrentYear.amount),
              },
              {
                label: `Best · ${returnStatistics.bestMonthCurrentYear.month}`,
                pct: returnStatistics.bestMonthCurrentYear.percent,
                color: 'var(--gain)',
                sub: formatCurrency(returnStatistics.bestMonthCurrentYear.amount),
              },
              {
                label: `Worst · ${returnStatistics.worstMonthCurrentYear.month}`,
                pct: returnStatistics.worstMonthCurrentYear.percent,
                color: 'var(--loss)',
                sub: formatCurrency(returnStatistics.worstMonthCurrentYear.amount),
              },
            ];

            return (
              <>
                {/* Explain modal — portalled to body so fixed positioning is viewport-relative */}
                {activeExplain && explainContent[activeExplain] && typeof document !== 'undefined' && createPortal((() => {
                  const ec = explainContent[activeExplain]!;
                  return (
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
                      onClick={() => setActiveExplain(null)}
                    >
                      <div
                        style={{ position: 'relative', borderRadius: '1rem', width: '100%', maxWidth: '32rem', background: 'var(--bg-surface)', border: '1px solid var(--border-md)', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', overflowY: 'auto' }}
                        onClick={e => e.stopPropagation()}
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3 p-5 pb-3">
                          <h3 className="text-sm font-bold leading-snug" style={{ color: 'var(--text-hi)' }}>{ec.title}</h3>
                          <button
                            onClick={() => setActiveExplain(null)}
                            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                            style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}
                          >✕</button>
                        </div>

                        {/* Body */}
                        <div className="px-5 pb-4 space-y-2">
                          {ec.lines.map((line, i) => (
                            <p key={i} className="text-[13px] leading-relaxed" style={{ color: 'var(--text-lo)' }}>{line}</p>
                          ))}
                        </div>

                        {/* Example */}
                        <div className="mx-5 mb-5 rounded-xl p-4" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border-md)' }}>
                          <p className="text-[10px] font-bold uppercase tracking-[0.1em] mb-3" style={{ color: 'var(--text-muted)' }}>Example</p>
                          <div className="space-y-1.5 mb-3">
                            {ec.example.steps.map((step, i) => (
                              <div key={i} className="flex gap-2 items-start">
                                <span className="text-[10px] font-bold mt-0.5 shrink-0 w-4 text-right" style={{ color: 'var(--text-muted)' }}>{i + 1}.</span>
                                <p className="text-[12px] font-mono leading-snug" style={{ color: 'var(--text-lo)' }}>{step}</p>
                              </div>
                            ))}
                          </div>
                          <div className="rounded-lg px-3 py-2" style={{ background: 'color-mix(in srgb,var(--gain) 12%,transparent)', border: '1px solid color-mix(in srgb,var(--gain) 25%,transparent)' }}>
                            <p className="text-[12px] font-semibold" style={{ color: 'var(--gain)' }}>→ {ec.example.result}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })(), document.body)}

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
                  {statCards.map(({ label, pct, color, sub, explainKey }) => (
                    <div key={label} className="rounded-xl p-3 text-center relative"
                      style={{ background: `color-mix(in srgb,${color} 7%,transparent)`, border: `1px solid color-mix(in srgb,${color} 18%,transparent)` }}>
                      {explainKey && (
                        <button
                          onClick={() => setActiveExplain(explainKey)}
                          className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors hover:opacity-80"
                          style={{ background: 'color-mix(in srgb,var(--text-muted) 15%,transparent)', color: 'var(--text-muted)', lineHeight: 1 }}
                          title="What is this?"
                        >?</button>
                      )}
                      <p className="text-[10px] font-bold uppercase tracking-[0.08em] mb-1.5 truncate" style={{ color: 'var(--text-muted)' }}>{label}</p>
                      <p className="text-lg font-black metric-value leading-none" style={{ color }}>
                        {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                      </p>
                      {sub && <p className="text-[10px] font-semibold mt-1 metric-value" style={{ color }}>{sub}</p>}
                    </div>
                  ))}
                </div>
              </>
            );
          })()}

          {/* Chart: color-coded bars for Return % + line for Return Amount */}
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart
              data={safeMonthlyReturns}
              margin={{ top: 8, right: 50, left: 10, bottom: 8 }}
              barCategoryGap="28%"
              onMouseMove={(e: any) => { if (e?.activeLabel) { setActiveMonth(e.activeLabel); setActiveChart('returns'); } }}
              onMouseLeave={() => { setActiveMonth(null); setActiveChart(null); }}
            >
              <defs>
                <linearGradient id="retGainGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" /><stop offset="100%" stopColor="#059669" />
                </linearGradient>
                <linearGradient id="retLossGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fb7185" /><stop offset="100%" stopColor="#dc2626" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} stroke="#9ca3af"
                angle={-35} textAnchor="end" height={55} interval={retXInterval} />
              <YAxis yAxisId="left"
                tickFormatter={(v) => `${v}%`}
                tick={{ fill: '#6b7280', fontSize: 11 }} stroke="#9ca3af"
                domain={[
                  () => { const mn = Math.min(...safeMonthlyReturns.map(r => r.returnPercent)); return Math.floor(mn/5)*5 - 2; },
                  () => { const mx = Math.max(...safeMonthlyReturns.map(r => r.returnPercent)); return Math.ceil(mx/5)*5 + 2; },
                ]}
              />
              <YAxis yAxisId="right" orientation="right"
                tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`}
                tick={{ fill: '#f59e0b', fontSize: 11 }} stroke="#f59e0b" />
              <ReferenceLine yAxisId="left" y={0} stroke="#9ca3af" strokeDasharray="3 3" strokeWidth={1.5} />
              <ReferenceLine yAxisId="right" y={0} stroke="#9ca3af" strokeDasharray="3 3" strokeWidth={1} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const pct = (payload.find((e: any) => e.dataKey === 'returnPercent')?.value ?? 0) as number;
                  const amt = (payload.find((e: any) => e.dataKey === 'returnAmount')?.value ?? 0) as number;
                  const isUp = pct >= 0;
                  const ac = isUp ? 'var(--gain)' : 'var(--loss)';
                  const ab = isUp ? 'var(--gain-bg)' : 'var(--loss-bg)';
                  const abr = isUp ? 'var(--gain-border)' : 'var(--loss-border)';
                  return (
                    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-md)', borderRadius: 16, boxShadow: 'var(--shadow-lg)', minWidth: 240, overflow: 'hidden' }}>
                      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-md)', background: ab, borderTop: `3px solid ${ac}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <svg width="13" height="13" fill="none" stroke={ac} viewBox="0 0 24 24">
                            {isUp ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />}
                          </svg>
                          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-hi)' }}>{label}</span>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: ac, background: abr, padding: '2px 7px', borderRadius: 99 }}>
                          {isUp ? '▲ Gain' : '▼ Loss'}
                        </span>
                      </div>
                      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 10, background: ab, border: `1px solid ${abr}` }}>
                          <div>
                            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 2 }}>Return %</p>
                            <p style={{ fontSize: 22, fontWeight: 900, color: ac, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{pct >= 0 ? '+' : ''}{(pct as number).toFixed(2)}%</p>
                          </div>
                          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                            <circle cx="16" cy="16" r="15" stroke={ac} strokeWidth="1.5" strokeOpacity="0.3" />
                            <text x="16" y="20" textAnchor="middle" fontSize="13" fontWeight="900" fill={ac}>%</text>
                          </svg>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 10, background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
                          <div>
                            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 2 }}>Return Amount</p>
                            <p style={{ fontSize: 16, fontWeight: 900, color: ac, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{amt >= 0 ? '+' : '−'}{formatCurrency(Math.abs(amt as number))}</p>
                          </div>
                          <svg width="28" height="28" fill="none" stroke={ac} viewBox="0 0 24 24" opacity="0.5">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Legend iconSize={10} wrapperStyle={{ paddingTop: 12 }}
                formatter={(v) => <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-lo)' }}>{v}</span>} />
              {/* Color-coded bars: green for gain months, red for loss months */}
              <Bar yAxisId="left" dataKey="returnPercent" name="Return %" maxBarSize={28} radius={[3,3,0,0]}>
                {safeMonthlyReturns.map((entry, i) => (
                  <Cell key={i} fill={entry.returnPercent >= 0 ? 'url(#retGainGrad)' : 'url(#retLossGrad)'} />
                ))}
              </Bar>
              {/* Return Amount line on right axis */}
              <Line yAxisId="right" type="monotone" dataKey="returnAmount" name="Return Amount (₹)"
                stroke="#f59e0b" strokeWidth={2.5}
                dot={false} activeDot={{ r: 5, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        );
      })()}
    </div>
  );
}

