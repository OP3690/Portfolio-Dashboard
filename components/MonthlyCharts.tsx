'use client';

import { useState, useMemo } from 'react';
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
  monthlyReturns: Array<{ month: string; returnPercent: number; returnAmount: number }>;
  returnStatistics?: {
    xirr: number;
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

  // Enrich filtered data with per-month net cashflow
  const chartInvData = useMemo(() =>
    filteredMonthlyInvestments.map(d => ({
      ...d,
      net: (d.investments || 0) - (d.withdrawals || 0),
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
        const totalInv  = chartInvData.reduce((s, d) => s + d.investments, 0);
        const totalWdl  = chartInvData.reduce((s, d) => s + d.withdrawals, 0);
        const netInv    = totalInv - totalWdl;
        const activeMos = chartInvData.filter(d => d.investments > 0).length || 1;
        const avgInv    = totalInv / activeMos;
        const dateFrom  = chartInvData[0]?.month ?? '';
        const dateTo    = chartInvData[chartInvData.length - 1]?.month ?? '';
        const xInterval = chartInvData.length > 48 ? 5
                        : chartInvData.length > 24 ? 2
                        : chartInvData.length > 12 ? 1 : 0;

        return (
        <div className="card overflow-hidden" style={{ padding: 0 }}>

          {/* ── Top accent strip ── */}
          <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, var(--brand) 0%, #6366f1 50%, var(--info) 100%)' }} />

          <div className="p-5 pb-0">
            {/* ── Header row ── */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-sm font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--text-hi)' }}>
                  <div className="w-1.5 h-5 rounded-full" style={{ background: 'var(--brand)' }} />
                  Month on Month Investments &amp; Withdrawals
                </h2>
                {/* date range badge */}
                {dateFrom && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--bg-raised)', color: 'var(--text-lo)', border: '1px solid var(--border-md)' }}>
                    {dateFrom} → {dateTo}
                  </span>
                )}
              </div>

              {/* Period toggle */}
              <div className="flex items-center rounded-full p-[3px] gap-0.5"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
                {(['all', '5y'] as const).map(opt => (
                  <button key={opt} onClick={() => setInvPeriod(opt)}
                    className="text-[11px] font-bold px-3 py-1 rounded-full transition-all duration-200"
                    style={invPeriod === opt
                      ? { background: 'var(--brand)', color: '#fff', boxShadow: '0 1px 8px color-mix(in srgb,var(--brand) 50%,transparent)' }
                      : { background: 'transparent', color: 'var(--text-lo)' }}>
                    {opt === 'all' ? 'All Time' : 'Last 5 Yr'}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Stat cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Total Invested',   val: totalInv, color: 'var(--brand)', bg: 'color-mix(in srgb,var(--brand) 8%,transparent)',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /> },
                { label: 'Total Withdrawn',  val: totalWdl, color: 'var(--loss)',  bg: 'color-mix(in srgb,var(--loss) 8%,transparent)',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /> },
                { label: 'Net Deployed',     val: netInv,   color: netInv >= 0 ? 'var(--gain)' : 'var(--loss)',
                  bg: netInv >= 0 ? 'color-mix(in srgb,var(--gain) 8%,transparent)' : 'color-mix(in srgb,var(--loss) 8%,transparent)',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
                { label: 'Avg / Active Mo',  val: avgInv,   color: 'var(--info)',  bg: 'color-mix(in srgb,var(--info) 8%,transparent)',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
              ].map(({ label, val, color, bg, icon }) => (
                <div key={label} className="rounded-xl p-3 flex items-center gap-3"
                  style={{ background: bg, border: `1px solid color-mix(in srgb,${color} 20%,transparent)` }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `color-mix(in srgb,${color} 15%,transparent)` }}>
                    <svg className="w-4 h-4" fill="none" stroke={color} viewBox="0 0 24 24">{icon}</svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] truncate" style={{ color: 'var(--text-muted)' }}>{label}</p>
                    <p className="text-sm font-black leading-tight metric-value" style={{ color }}>{formatCurrency(val)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Chart ── */}
          <div className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart
                key={`inv-${invPeriod}`}
                data={chartInvData}
                margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                onMouseMove={(e: any) => { if (e?.activeLabel) { setActiveMonth(e.activeLabel); setActiveChart('investments'); } }}
                onMouseLeave={() => { setActiveMonth(null); setActiveChart(null); }}
                barGap={2}
                barCategoryGap="30%"
              >
                <defs>
                  <linearGradient id="invGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0.7} />
                  </linearGradient>
                  <linearGradient id="wdlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={1} />
                    <stop offset="100%" stopColor="#e11d48" stopOpacity={0.7} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-sm)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 500 }}
                  stroke="var(--border-md)"
                  angle={-35}
                  textAnchor="end"
                  height={52}
                  interval={xInterval}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => v >= 1000 ? `₹${(v/1000).toFixed(0)}k` : `₹${v}`}
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                  stroke="transparent"
                  tickLine={false}
                  axisLine={false}
                  width={52}
                />
                <ReferenceLine y={0} stroke="var(--border-md)" strokeWidth={1} />

                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = chartInvData.find(r => r.month === label);
                    const inv  = d?.investments  || 0;
                    const wdl  = d?.withdrawals  || 0;
                    const net  = inv - wdl;
                    const invRows = d?.investmentDetails  || [];
                    const wdlRows = d?.withdrawalDetails  || [];
                    const hasBoth = inv > 0 && wdl > 0;

                    const ColSection = ({ title, amt, rows, color }: any) => (
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:5 }}>
                          <div style={{ width:6, height:6, borderRadius:2, background:color }} />
                          <span style={{ fontSize:9, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{title}</span>
                        </div>
                        <div style={{ padding:'4px 8px', borderRadius:7, textAlign:'center', background:`color-mix(in srgb,${color} 10%,transparent)`, border:`1px solid color-mix(in srgb,${color} 25%,transparent)`, marginBottom: rows.length ? 5 : 0 }}>
                          <span style={{ fontSize:13, fontWeight:900, color, fontVariantNumeric:'tabular-nums' }}>{formatCurrency(amt)}</span>
                        </div>
                        {rows.length > 0 && (
                          <div style={{ display:'flex', flexDirection:'column', gap:2, maxHeight:140, overflowY:'auto' }}>
                            {rows.map((r: any, i: number) => (
                              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'2px 6px', borderRadius:5, background:'var(--bg-raised)', gap:4 }}>
                                <span style={{ fontSize:10, fontWeight:600, color:'var(--text-hi)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:85 }}>{r.stockName}</span>
                                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', flexShrink:0 }}>
                                  <span style={{ fontSize:9, color:'var(--text-muted)' }}>{r.qty?.toLocaleString()} sh</span>
                                  <span style={{ fontSize:10, fontWeight:800, color, fontVariantNumeric:'tabular-nums' }}>{formatCurrency(r.amount)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );

                    return (
                      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-md)', borderRadius:14, boxShadow:'var(--shadow-lg)', width: hasBoth ? 500 : 280, overflow:'hidden' }}>
                        {/* Header */}
                        <div style={{ padding:'8px 13px', background:'var(--bg-raised)', borderBottom:'1px solid var(--border-md)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                          <span style={{ fontSize:12, fontWeight:800, color:'var(--text-hi)' }}>📅 {label}</span>
                          <span style={{ fontSize:11, fontWeight:700, color: net>=0?'var(--gain)':'var(--loss)', background: net>=0?'var(--gain-bg)':'var(--loss-bg)', padding:'2px 8px', borderRadius:99, border:`1px solid ${net>=0?'var(--gain-border)':'var(--loss-border)'}` }}>
                            Net {net>=0?'+':'-'}{formatCurrency(Math.abs(net))}
                          </span>
                        </div>
                        {/* Body */}
                        <div style={{ padding:'11px 13px', display:'flex', gap:10 }}>
                          {inv > 0 && <ColSection title="Invested (Buy)" amt={inv} rows={invRows} color="var(--brand)" />}
                          {hasBoth && <div style={{ width:1, background:'var(--border-md)', alignSelf:'stretch' }} />}
                          {wdl > 0 && <ColSection title="Withdrawn (Sell)" amt={wdl} rows={wdlRows} color="var(--loss)" />}
                        </div>
                      </div>
                    );
                  }}
                />

                <Legend
                  wrapperStyle={{ paddingTop: 8, paddingBottom: 4 }}
                  iconSize={10}
                  formatter={(value) => (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-lo)' }}>{value}</span>
                  )}
                />
                <Bar dataKey="investments" name="Invested" fill="url(#invGrad)" radius={[3,3,0,0]} maxBarSize={28} isAnimationActive={true} />
                <Bar dataKey="withdrawals"  name="Withdrawn" fill="url(#wdlGrad)"  radius={[3,3,0,0]} maxBarSize={28} isAnimationActive={true} />
                <Line
                  type="monotone"
                  dataKey="net"
                  name="Net Cashflow"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                  isAnimationActive={true}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        );
      })()}

      {/* Monthly Dividends Chart */}
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 className="section-title text-base flex items-center gap-2">
            <div className="w-1 h-5 rounded-full" style={{ background: 'var(--gain)' }}></div>
            Month on Month Dividends Earned
          </h2>
          <div className="flex flex-wrap gap-2.5">
            {[
              { label: 'Total Earned',      val: safeMonthlyDividends.reduce((s, i) => s + (i.amount || 0), 0), show: true },
              { label: 'Avg. Monthly',      val: avgMonthlyDividends ?? 0,          show: avgMonthlyDividends !== undefined },
              { label: 'Avg. (Last 12M)',   val: avgMonthlyDividendsLast12M ?? 0,   show: avgMonthlyDividendsLast12M !== undefined },
              { label: 'Median (Last 12M)', val: medianMonthlyDividendsLast12M ?? 0,show: medianMonthlyDividendsLast12M !== undefined },
              { label: 'Median (Last 6M)',  val: medianLast6M,                       show: safeMonthlyDividends.length >= 6 },
              { label: 'Median (Last 3M)',  val: medianLast3M,                       show: safeMonthlyDividends.length >= 3 },
            ].filter(p => p.show).map(({ label, val }) => (
              <div key={label} className="stat-pill">
                <p className="stat-pill-label">{label}</p>
                <p className="stat-pill-value metric-value" style={{ color: 'var(--gain)' }}>{formatCurrency(val)}</p>
              </div>
            ))}
          </div>
        </div>
        {safeMonthlyDividends.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
              style={{ background: 'color-mix(in srgb, var(--gain) 12%, transparent)' }}>
              <span className="text-2xl">💰</span>
            </div>
            <p className="font-semibold text-hi">No dividend records found</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-lo)' }}>
              Re-upload your portfolio Excel — ensure dividend rows have "Buy/Sell = Dividend" and a valid amount.
            </p>
          </div>
        ) : (
        <div style={{ position: 'relative', zIndex: 10, width: '100%', height: '300px' }}>
          {/* Cross-chart companion overlay */}
          {activeMonth && activeChart !== 'dividends' && (() => {
            const md = safeMonthlyDividends.find(d => d.month === activeMonth);
            return (
              <div className="absolute top-2 right-2 z-30 rounded-xl px-3 py-2 text-xs shadow-lg animate-fadeIn"
                style={{ background: 'var(--bg-card)', border: '1px solid color-mix(in srgb,var(--gain) 40%,transparent)', minWidth: 180 }}>
                <p className="font-bold mb-1.5 pb-1" style={{ color: 'var(--gain)', borderBottom: '1px solid var(--border-sm)' }}>
                  📅 {activeMonth}
                </p>
                {md ? (
                  <p className="text-lo">Dividend: <span className="font-bold" style={{ color: 'var(--gain)' }}>{formatCurrency(md.amount)}</span></p>
                ) : <p className="text-lo italic">No dividend this month</p>}
              </div>
            );
          })()}
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart
              data={safeMonthlyDividends}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              onMouseMove={(e: any) => { if (e?.activeLabel) { setActiveMonth(e.activeLabel); setActiveChart('dividends'); } }}
              onMouseLeave={() => { setActiveMonth(null); setActiveChart(null); }}
            >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="month"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              stroke="#9ca3af"
              angle={-35}
              textAnchor="end"
              height={55}
              interval={0}
            />
            <YAxis
              tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
              tick={{ fill: '#6b7280', fontSize: 12 }}
              stroke="#9ca3af"
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const d = safeMonthlyDividends.find(r => r.month === label);
                const stocks = d?.stockDetails || [];
                const total  = d?.amount || 0;
                const sorted = [...stocks].sort((a: any, b: any) => b.amount - a.amount);
                const maxAmt = sorted[0]?.amount || 1;

                return (
                  <div style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border-md)',
                    borderRadius: 16, boxShadow: 'var(--shadow-lg)', minWidth: 280, maxWidth: 340, overflow: 'hidden',
                  }}>
                    {/* Header */}
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-md)', background: 'var(--bg-raised)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <svg width="13" height="13" fill="none" stroke="var(--gain)" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-hi)' }}>{label}</span>
                        </div>
                        <span style={{
                          fontSize: 15, fontWeight: 900, color: 'var(--gain)', fontVariantNumeric: 'tabular-nums',
                          background: 'var(--gain-bg)', padding: '2px 10px', borderRadius: 99,
                          border: '1px solid var(--gain-border)',
                        }}>{formatCurrency(total)}</span>
                      </div>
                    </div>

                    {/* Stock breakdown */}
                    {sorted.length > 0 && (
                      <div style={{ padding: '10px 14px' }}>
                        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 7 }}>
                          By Stock ({sorted.length})
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                          {sorted.map((s: any, i: number) => {
                            const barPct = Math.round((s.amount / maxAmt) * 100);
                            return (
                              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-hi)' }}>{s.stockName}</span>
                                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--gain)', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(s.amount)}</span>
                                </div>
                                <div style={{ height: 3, borderRadius: 99, background: 'var(--border-md)', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${barPct}%`, borderRadius: 99, background: 'linear-gradient(90deg, var(--gain), var(--gain-mid))' }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }}
              filterNull={true}
            />
            <Legend />
            <Bar
              dataKey="amount"
              fill="#10b981"
              name="Dividend Amount"
              isAnimationActive={false}
              radius={[4, 4, 0, 0]}
              stroke="#059669"
              strokeWidth={1}
            />
            <Line
              type="monotone"
              dataKey="amount"
              stroke="#059669"
              strokeWidth={2}
              dot={{ fill: '#059669', r: 3 }}
              strokeDasharray="5 5"
              name="Dividends Trend"
              legendType="line"
              isAnimationActive={false}
            />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>

      {/* Monthly Returns Chart */}
      {safeMonthlyReturns.length > 0 && (
      <div className="card p-6">
        <div className="mb-6">
          <h2 className="section-title text-base flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full" style={{ background: 'var(--brand)' }}></div>
            Month on Month Returns
          </h2>
          {returnStatistics && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* XIRR */}
              <div className="card p-4">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">XIRR</p>
                <p className="text-xl font-black metric-value"
                  style={{ color: returnStatistics.xirr >= 9 ? 'var(--gain)' : returnStatistics.xirr >= 5 ? 'var(--warn)' : 'var(--loss)' }}>
                  {returnStatistics.xirr >= 0 ? '+' : ''}{returnStatistics.xirr.toFixed(2)}%
                </p>
              </div>
              {/* CAGR */}
              <div className="card p-4">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">CAGR</p>
                <p className="text-xl font-black metric-value"
                  style={{ color: returnStatistics.cagr >= 9 ? 'var(--gain)' : returnStatistics.cagr >= 5 ? 'var(--warn)' : 'var(--loss)' }}>
                  {returnStatistics.cagr >= 0 ? '+' : ''}{returnStatistics.cagr.toFixed(2)}%
                </p>
              </div>
              {/* Avg Monthly Return */}
              <div className="card p-4">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Avg. Monthly Return</p>
                <p className="text-lg font-black metric-value mb-1"
                  style={{ color: returnStatistics.avgReturnOverall.percent >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                  {returnStatistics.avgReturnOverall.percent >= 0 ? '+' : ''}{returnStatistics.avgReturnOverall.percent.toFixed(2)}%
                </p>
                <p className="text-xs metric-value font-semibold"
                  style={{ color: returnStatistics.avgReturnOverall.amount >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                  {returnStatistics.avgReturnOverall.amount >= 0 ? '+' : ''}{formatCurrency(returnStatistics.avgReturnOverall.amount)}
                </p>
              </div>
              {/* Current Year Avg */}
              <div className="card p-4">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Current Year Avg.</p>
                <p className="text-lg font-black metric-value mb-1"
                  style={{ color: returnStatistics.avgReturnCurrentYear.percent >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                  {returnStatistics.avgReturnCurrentYear.percent >= 0 ? '+' : ''}{returnStatistics.avgReturnCurrentYear.percent.toFixed(2)}%
                </p>
                <p className="text-xs metric-value font-semibold"
                  style={{ color: returnStatistics.avgReturnCurrentYear.amount >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                  {returnStatistics.avgReturnCurrentYear.amount >= 0 ? '+' : ''}{formatCurrency(returnStatistics.avgReturnCurrentYear.amount)}
                </p>
              </div>
              {/* Best Month */}
              <div className="card p-4">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
                  Best Month: <span className="font-bold normal-case" style={{ color: 'var(--gain)' }}>{returnStatistics.bestMonthCurrentYear.month}</span>
                </p>
                <p className="text-lg font-black metric-value mb-1"
                  style={{ color: returnStatistics.bestMonthCurrentYear.percent >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                  {returnStatistics.bestMonthCurrentYear.percent >= 0 ? '+' : ''}{returnStatistics.bestMonthCurrentYear.percent.toFixed(2)}%
                </p>
                <p className="text-xs metric-value font-semibold"
                  style={{ color: returnStatistics.bestMonthCurrentYear.amount >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                  {returnStatistics.bestMonthCurrentYear.amount >= 0 ? '+' : ''}{formatCurrency(returnStatistics.bestMonthCurrentYear.amount)}
                </p>
              </div>
              {/* Worst Month */}
              <div className="card p-4">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
                  Worst Month: <span className="font-bold normal-case" style={{ color: 'var(--loss)' }}>{returnStatistics.worstMonthCurrentYear.month}</span>
                </p>
                <p className="text-lg font-black metric-value mb-1"
                  style={{ color: returnStatistics.worstMonthCurrentYear.percent >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                  {returnStatistics.worstMonthCurrentYear.percent >= 0 ? '+' : ''}{returnStatistics.worstMonthCurrentYear.percent.toFixed(2)}%
                </p>
                <p className="text-xs metric-value font-semibold"
                  style={{ color: returnStatistics.worstMonthCurrentYear.amount >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                  {returnStatistics.worstMonthCurrentYear.amount >= 0 ? '+' : ''}{formatCurrency(returnStatistics.worstMonthCurrentYear.amount)}
                </p>
              </div>
            </div>
          )}
        </div>
        <div style={{ position: 'relative', zIndex: 10, width: '100%', height: '400px', backgroundColor: '#f9fafb' }}>
          {/* Cross-chart companion overlay */}
          {activeMonth && activeChart !== 'returns' && (() => {
            const md = safeMonthlyReturns.find(d => d.month === activeMonth);
            return (
              <div className="absolute top-2 right-2 z-30 rounded-xl px-3 py-2 text-xs shadow-lg animate-fadeIn"
                style={{ background: 'var(--bg-card)', border: '1px solid color-mix(in srgb,var(--brand) 40%,transparent)', minWidth: 190 }}>
                <p className="font-bold mb-1.5 pb-1" style={{ color: 'var(--brand)', borderBottom: '1px solid var(--border-sm)' }}>
                  📅 {activeMonth}
                </p>
                {md ? (
                  <>
                    <p className="text-lo mb-0.5">Return: <span className="font-bold" style={{ color: md.returnPercent >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{md.returnPercent >= 0 ? '+' : ''}{md.returnPercent.toFixed(2)}%</span></p>
                    <p className="text-lo">Amount: <span className="font-bold" style={{ color: md.returnAmount >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{formatCurrency(md.returnAmount)}</span></p>
                  </>
                ) : <p className="text-lo italic">No return data for this month</p>}
              </div>
            );
          })()}
          <ResponsiveContainer width="100%" height={400}>
            <LineChart
              data={safeMonthlyReturns}
              margin={{ top: 20, right: 40, left: 20, bottom: 20 }}
              onMouseMove={(e: any) => { if (e?.activeLabel) { setActiveMonth(e.activeLabel); setActiveChart('returns'); } }}
              onMouseLeave={() => { setActiveMonth(null); setActiveChart(null); }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
              <XAxis 
                dataKey="month"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                stroke="#9ca3af"
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis 
                yAxisId="left" 
                tickFormatter={(value) => `${value}%`}
                tick={{ fill: '#8b5cf6', fontSize: 11, fontWeight: 600 }}
                stroke="#8b5cf6"
                label={{ value: 'Return %', angle: -90, position: 'insideLeft', fill: '#8b5cf6', fontSize: 12, fontWeight: 600 }}
                domain={[
                  (dataMin: number) => {
                    const min = Math.min(...safeMonthlyReturns.map(r => r.returnPercent));
                    return Math.floor(min / 10) * 10 - 5; // Round down to nearest 10, add padding
                  },
                  (dataMax: number) => {
                    const max = Math.max(...safeMonthlyReturns.map(r => r.returnPercent));
                    return Math.ceil(max / 10) * 10 + 5; // Round up to nearest 10, add padding
                  }
                ]}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right" 
                tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
                tick={{ fill: '#f59e0b', fontSize: 11, fontWeight: 600 }}
                stroke="#f59e0b"
                label={{ value: 'Return Amount', angle: 90, position: 'insideRight', fill: '#f59e0b', fontSize: 12, fontWeight: 600 }}
                domain={[
                  (dataMin: number) => {
                    const min = Math.min(...safeMonthlyReturns.map(r => r.returnAmount));
                    return Math.floor(min / 10000) * 10000 - 10000; // Round down to nearest 10k, add padding
                  },
                  (dataMax: number) => {
                    const max = Math.max(...safeMonthlyReturns.map(r => r.returnAmount));
                    return Math.ceil(max / 10000) * 10000 + 10000; // Round up to nearest 10k, add padding
                  }
                ]}
              />
              <ReferenceLine yAxisId="left" y={0} stroke="#9ca3af" strokeDasharray="2 2" strokeWidth={1.5} />
              <ReferenceLine yAxisId="right" y={0} stroke="#9ca3af" strokeDasharray="2 2" strokeWidth={1.5} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null;
                  const pctEntry    = payload.find((e: any) => e.name === 'Return %' || e.dataKey === 'returnPercent');
                  const amtEntry    = payload.find((e: any) => e.name === 'Return Amount' || e.dataKey === 'returnAmount');
                  const pct         = pctEntry?.value ?? 0;
                  const amt         = amtEntry?.value ?? 0;
                  const isUp        = pct >= 0;
                  const accentColor = isUp ? 'var(--gain)' : 'var(--loss)';
                  const accentBg    = isUp ? 'var(--gain-bg)' : 'var(--loss-bg)';
                  const accentBorder= isUp ? 'var(--gain-border)' : 'var(--loss-border)';

                  return (
                    <div style={{
                      background: 'var(--bg-surface)', border: '1px solid var(--border-md)',
                      borderRadius: 16, boxShadow: 'var(--shadow-lg)', minWidth: 240, overflow: 'hidden',
                    }}>
                      {/* Colored accent header */}
                      <div style={{
                        padding: '10px 14px', borderBottom: '1px solid var(--border-md)',
                        background: accentBg, borderTop: `3px solid ${accentColor}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <svg width="13" height="13" fill="none" stroke={accentColor} viewBox="0 0 24 24">
                              {isUp
                                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                              }
                            </svg>
                            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-hi)' }}>{label}</span>
                          </div>
                          <span style={{
                            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                            letterSpacing: '0.08em', color: accentColor,
                            background: accentBorder, padding: '2px 7px', borderRadius: 99,
                          }}>
                            {isUp ? '▲ Gain' : '▼ Loss'}
                          </span>
                        </div>
                      </div>

                      {/* Metrics */}
                      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {/* Return % */}
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '8px 12px', borderRadius: 10,
                          background: accentBg, border: `1px solid ${accentBorder}`,
                        }}>
                          <div>
                            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 2 }}>Return %</p>
                            <p style={{ fontSize: 22, fontWeight: 900, color: accentColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                              {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                            </p>
                          </div>
                          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                            <circle cx="16" cy="16" r="15" stroke={accentColor} strokeWidth="1.5" strokeOpacity="0.3" />
                            <text x="16" y="20" textAnchor="middle" fontSize="13" fontWeight="900" fill={accentColor}>%</text>
                          </svg>
                        </div>

                        {/* Return Amount */}
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '8px 12px', borderRadius: 10,
                          background: 'var(--bg-raised)', border: '1px solid var(--border-md)',
                        }}>
                          <div>
                            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 2 }}>Return Amount</p>
                            <p style={{ fontSize: 16, fontWeight: 900, color: accentColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                              {amt >= 0 ? '+' : '−'}{formatCurrency(Math.abs(amt))}
                            </p>
                          </div>
                          <svg width="28" height="28" fill="none" stroke={accentColor} viewBox="0 0 24 24" opacity="0.5">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="line"
                formatter={(value) => <span className="text-sm font-semibold">{value}</span>}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="returnPercent"
                stroke="#8b5cf6"
                name="Return %"
                strokeWidth={3}
                dot={{ fill: '#8b5cf6', r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                activeDot={{ r: 7, strokeWidth: 2, stroke: '#ffffff' }}
                isAnimationActive={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="returnAmount"
                stroke="#f59e0b"
                name="Return Amount"
                strokeWidth={3}
                dot={{ fill: '#f59e0b', r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                activeDot={{ r: 7, strokeWidth: 2, stroke: '#ffffff' }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}
    </div>
  );
}

