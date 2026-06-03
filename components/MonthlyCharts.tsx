'use client';

import { useEffect, useState, useRef } from 'react';
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

  // Guard against undefined/null data, ensure proper data structure, sort oldest → latest
  const safeMonthlyInvestments = (monthlyInvestments || [])
    .map(item => ({
      ...item,
      investments: Number(item.investments || 0),
      withdrawals: Number(item.withdrawals || 0),
    }))
    .sort((a, b) => parseMonthStr(a.month) - parseMonthStr(b.month));

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

  // Last-5-year slice: keep only the most recent 60 months
  const filteredMonthlyInvestments = invPeriod === '5y'
    ? safeMonthlyInvestments.slice(-60)
    : safeMonthlyInvestments;

  // Cross-chart hover sync
  const [activeMonth, setActiveMonth]   = useState<string | null>(null);
  const [activeChart, setActiveChart]   = useState<string | null>(null);

  // Background animation state
  const [animationFrame, setAnimationFrame] = useState(0);
  const animationRef = useRef<number>();
  const isVisibleRef = useRef(true);

  // Continuous background animation
  useEffect(() => {
    const animate = () => {
      setAnimationFrame(prev => prev + 1);
      animationRef.current = requestAnimationFrame(animate);
    };
    
    // Start animation loop
    animationRef.current = requestAnimationFrame(animate);
    
    // Keep running even when tab is not visible
    document.addEventListener('visibilitychange', () => {
      isVisibleRef.current = !document.hidden;
    });

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);
  
  // Debug: Log data to console to verify it's being passed
  useEffect(() => {
    console.log('📊 MonthlyCharts - Data received:');
    console.log('  - monthlyInvestments:', safeMonthlyInvestments.length, 'items');
    if (safeMonthlyInvestments.length > 0) {
      console.log('  - Sample investment data:', JSON.stringify(safeMonthlyInvestments[0], null, 2));
      console.log('  - First item investments value:', safeMonthlyInvestments[0].investments, typeof safeMonthlyInvestments[0].investments);
      console.log('  - First item withdrawals value:', safeMonthlyInvestments[0].withdrawals, typeof safeMonthlyInvestments[0].withdrawals);
      console.log('  - All investments values:', safeMonthlyInvestments.map((item: any) => ({ month: item.month, investments: item.investments, withdrawals: item.withdrawals })));
    }
    console.log('  - monthlyDividends:', safeMonthlyDividends.length, 'items');
    if (safeMonthlyDividends.length > 0) {
      console.log('  - Sample dividend data:', JSON.stringify(safeMonthlyDividends[0], null, 2));
      console.log('  - First item amount value:', safeMonthlyDividends[0].amount, typeof safeMonthlyDividends[0].amount);
      console.log('  - All dividend values:', safeMonthlyDividends.map((item: any) => ({ month: item.month, amount: item.amount })));
    }
    console.log('  - monthlyReturns:', safeMonthlyReturns.length, 'items');
    if (safeMonthlyReturns.length > 0) {
      console.log('  - Sample returns data:', JSON.stringify(safeMonthlyReturns[0], null, 2));
    }
  }, [safeMonthlyInvestments, safeMonthlyDividends, safeMonthlyReturns]);

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
      {/* Monthly Investments Chart */}
      {safeMonthlyInvestments.length > 0 && (
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          {/* Title + toggle */}
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="section-title text-base flex items-center gap-2">
              <div className="w-1 h-5 rounded-full" style={{ background: 'var(--brand)' }}></div>
              Month on Month Investments &amp; Withdrawals
            </h2>
            {/* Period toggle pill */}
            <div
              className="flex items-center rounded-full p-0.5 gap-0.5"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}
            >
              {(['all', '5y'] as const).map(opt => (
                <button
                  key={opt}
                  onClick={() => setInvPeriod(opt)}
                  className="text-[11px] font-bold px-3 py-1 rounded-full transition-all duration-200"
                  style={invPeriod === opt ? {
                    background: 'var(--brand)',
                    color: '#fff',
                    boxShadow: '0 1px 6px color-mix(in srgb, var(--brand) 45%, transparent)',
                  } : {
                    background: 'transparent',
                    color: 'var(--text-lo)',
                  }}
                >
                  {opt === 'all' ? 'All' : 'Last 5 Yr'}
                </button>
              ))}
            </div>
          </div>

          {/* Stat pills — reflect filtered data */}
          <div className="flex flex-wrap gap-2.5">
            {(() => {
              const totalInv = filteredMonthlyInvestments.reduce((s, i) => s + (i.investments || 0), 0);
              const totalWdl = filteredMonthlyInvestments.reduce((s, i) => s + (i.withdrawals || 0), 0);
              const n = filteredMonthlyInvestments.filter(i => i.investments > 0).length || 1;
              const m = filteredMonthlyInvestments.filter(i => i.withdrawals > 0).length || 1;
              const avgInv = totalInv / n;
              const avgWdl = totalWdl / m;
              return [
                { label: invPeriod === '5y' ? 'Total Invested (5 Yr)' : 'Gross Total Invested', val: totalInv, color: 'var(--brand)' },
                { label: invPeriod === '5y' ? 'Total Withdrawal (5 Yr)' : 'Total Withdrawal',   val: totalWdl, color: 'var(--loss)' },
                { label: 'Avg Monthly Investment', val: avgInv, color: 'var(--brand)' },
                { label: 'Avg Monthly Withdrawal', val: avgWdl, color: 'var(--loss)' },
              ];
            })().map(({ label, val, color }) => (
              <div key={label} className="stat-pill">
                <p className="stat-pill-label">{label}</p>
                <p className="stat-pill-value metric-value" style={{ color }}>{formatCurrency(val)}</p>
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: 'relative', zIndex: 10, width: '100%', height: '300px' }}>
          {/* Cross-chart companion overlay */}
          {activeMonth && activeChart !== 'investments' && (() => {
            const md = filteredMonthlyInvestments.find(d => d.month === activeMonth);
            return (
              <div className="absolute top-2 right-2 z-30 rounded-xl px-3 py-2 text-xs shadow-lg animate-fadeIn"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-glow)', minWidth: 190 }}>
                <p className="font-bold mb-1.5 pb-1" style={{ color: 'var(--brand)', borderBottom: '1px solid var(--border-sm)' }}>
                  📅 {activeMonth}
                </p>
                {md ? (
                  <>
                    <p className="text-lo mb-0.5">Invested: <span className="font-bold" style={{ color: 'var(--brand)' }}>{formatCurrency(md.investments)}</span></p>
                    <p className="text-lo">Withdrew: <span className="font-bold" style={{ color: 'var(--loss)' }}>{formatCurrency(md.withdrawals)}</span></p>
                  </>
                ) : <p className="text-lo italic">No data for this month</p>}
              </div>
            );
          })()}
          {/* key forces full remount when period or data length changes — required because
              isAnimationActive=false prevents Recharts from diffing data prop updates */}
          <ResponsiveContainer key={`inv-${invPeriod}-${filteredMonthlyInvestments.length}`} width="100%" height={300}>
            <ComposedChart
              data={filteredMonthlyInvestments}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              onMouseMove={(e: any) => { if (e?.activeLabel) { setActiveMonth(e.activeLabel); setActiveChart('investments'); } }}
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
              interval={filteredMonthlyInvestments.length > 36 ? Math.ceil(filteredMonthlyInvestments.length / 36) - 1 : 0}
            />
            <YAxis 
              tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
              tick={{ fill: '#6b7280', fontSize: 12 }}
              stroke="#9ca3af"
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const d = filteredMonthlyInvestments.find(r => r.month === label);
                const investDetails   = d?.investmentDetails  || [];
                const withdrawDetails = d?.withdrawalDetails  || [];
                const investAmt   = d?.investments  || 0;
                const withdrawAmt = d?.withdrawals  || 0;
                const net = investAmt - withdrawAmt;
                const hasBoth = investAmt > 0 && withdrawAmt > 0;

                /* One stock row — narrower for side-by-side columns */
                const StockRow = ({ r, color, compact }: { r: any; color: string; compact?: boolean }) => (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: compact ? '2px 6px' : '3px 8px', borderRadius: 6,
                    background: 'var(--bg-raised)', gap: 4,
                  }}>
                    <span style={{ fontSize: compact ? 10 : 11, fontWeight: 600, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: compact ? 90 : 140 }}>{r.stockName}</span>
                    <div style={{ display: 'flex', flexDirection: compact ? 'column' : 'row', alignItems: compact ? 'flex-end' : 'center', gap: compact ? 0 : 6, flexShrink: 0 }}>
                      <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{r.qty?.toLocaleString()} sh</span>
                      <span style={{ fontSize: compact ? 10 : 11, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(r.amount)}</span>
                    </div>
                  </div>
                );

                /* Column section — used in the two-column layout */
                const ColSection = ({ title, amt, rows, color, dotColor }: { title: string; amt: number; rows: any[]; color: string; dotColor: string }) => (
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* Section header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 7, height: 7, borderRadius: 2, background: dotColor, flexShrink: 0 }} />
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</span>
                    </div>
                    {/* Amount badge */}
                    <div style={{
                      padding: '4px 8px', borderRadius: 8, textAlign: 'center',
                      background: `color-mix(in srgb, ${dotColor} 10%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${dotColor} 25%, transparent)`,
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(amt)}</span>
                    </div>
                    {/* Stock rows */}
                    {rows.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 160, overflowY: 'auto' }}>
                        {rows.map((r: any, i: number) => <StockRow key={i} r={r} color={color} compact />)}
                      </div>
                    )}
                  </div>
                );

                return (
                  <div style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border-md)',
                    borderRadius: 16, boxShadow: 'var(--shadow-lg)',
                    width: hasBoth ? 520 : 300,
                    overflow: 'hidden',
                  }}>
                    {/* Header */}
                    <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--border-md)', background: 'var(--bg-raised)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="13" height="13" fill="none" stroke="var(--text-muted)" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-hi)', letterSpacing: '-0.01em' }}>{label}</span>
                    </div>

                    {/* Body — 2 columns when both sides present, 1 column otherwise */}
                    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 12 }}>
                        {investAmt > 0 && (
                          <ColSection title="Investments (Buy)" amt={investAmt} rows={investDetails} color="var(--brand)" dotColor="var(--brand)" />
                        )}
                        {hasBoth && (
                          <div style={{ width: 1, background: 'var(--border-md)', alignSelf: 'stretch', flexShrink: 0 }} />
                        )}
                        {withdrawAmt > 0 && (
                          <ColSection title="Withdrawals (Sell)" amt={withdrawAmt} rows={withdrawDetails} color="var(--loss)" dotColor="var(--loss)" />
                        )}
                      </div>

                      {/* Net cashflow footer */}
                      {(investAmt > 0 || withdrawAmt > 0) && (
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '6px 10px', borderRadius: 8,
                          background: net >= 0 ? 'var(--brand-bg)' : 'var(--loss-bg)',
                          border: `1px solid ${net >= 0 ? 'var(--brand-glow)' : 'var(--loss-border)'}`,
                        }}>
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-lo)' }}>Net Cashflow</span>
                          <span style={{ fontSize: 13, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: net >= 0 ? 'var(--brand)' : 'var(--loss)' }}>
                            {net >= 0 ? '+' : '−'}{formatCurrency(Math.abs(net))}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }}
              filterNull={true}
            />
            <Legend />
            <Bar 
              dataKey="investments" 
              fill="#3b82f6" 
              name="Investments (Buy)"
              isAnimationActive={false}
              radius={[4, 4, 0, 0]}
              stroke="#2563eb"
              strokeWidth={1}
            />
            <Bar 
              dataKey="withdrawals" 
              fill="#ef4444" 
              name="Withdrawals (Sell)"
              isAnimationActive={false}
              radius={[4, 4, 0, 0]}
              stroke="#dc2626"
              strokeWidth={1}
            />
            <Line 
              type="monotone" 
              dataKey="investments" 
              stroke="#2563eb" 
              strokeWidth={2}
              dot={{ fill: '#2563eb', r: 3 }}
              strokeDasharray="5 5"
              name="Investments Trend"
              legendType="line"
              isAnimationActive={false}
            />
            <Line 
              type="monotone" 
              dataKey="withdrawals" 
              stroke="#dc2626" 
              strokeWidth={2}
              dot={{ fill: '#dc2626', r: 3 }}
              strokeDasharray="5 5"
              name="Withdrawals Trend"
              legendType="line"
              isAnimationActive={false}
            />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

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

