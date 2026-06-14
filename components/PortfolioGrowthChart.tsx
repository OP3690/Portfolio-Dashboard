'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';

interface MonthlyInvestment {
  month: string;
  investments: number;
  withdrawals: number;
}

interface MonthlyReturn {
  month: string;
  returnPercent: number;
  returnAmount: number;
}

interface PortfolioGrowthChartProps {
  monthlyInvestments: MonthlyInvestment[];
  monthlyReturns: MonthlyReturn[];
  currentValue: number;
  totalInvested: number;
  totalPL: number;
}

function parseMonthStr(m: string): number {
  if (!m) return 0;
  const dashShort = m.trim().match(/^([A-Za-z]{3})-(\d{2})$/);
  if (dashShort) {
    const yr = 2000 + parseInt(dashShort[2], 10);
    return new Date(`${dashShort[1]} 1, ${yr}`).getTime();
  }
  const d = new Date(m);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}


export default function PortfolioGrowthChart({
  monthlyInvestments,
  monthlyReturns,
  currentValue,
  totalInvested,
  totalPL,
}: PortfolioGrowthChartProps) {
  const chartData = useMemo(() => {
    if (!monthlyInvestments?.length) return [];

    const monthSet = new Set([
      ...monthlyInvestments.map(m => m.month),
      ...monthlyReturns.map(m => m.month),
    ]);
    const sortedMonths = [...monthSet].sort((a, b) => parseMonthStr(a) - parseMonthStr(b));
    const investMap = new Map(monthlyInvestments.map(m => [m.month, m]));
    const returnMap  = new Map(monthlyReturns.map(m => [m.month, m]));

    let cumulativeInvested = 0;
    let cumulativeReturn   = 0;

    return sortedMonths.map(month => {
      const inv = investMap.get(month);
      const ret = returnMap.get(month);
      const netFlow = (inv?.investments ?? 0) - (inv?.withdrawals ?? 0);
      cumulativeInvested += netFlow;
      cumulativeReturn   += (ret?.returnAmount ?? 0);

      const portfolioValue = Math.max(0, cumulativeInvested + cumulativeReturn);
      const invested       = Math.max(0, cumulativeInvested);
      const gainLoss       = portfolioValue - invested;
      const gainLossPct    = invested > 0 ? (gainLoss / invested) * 100 : 0;
      const gainBand       = Math.max(0, gainLoss);   // stacked on top of invested

      return {
        month,
        invested,
        portfolioValue,
        gainBand,
        gainLoss,
        gainLossPct,
        monthReturn: ret?.returnAmount ?? 0,
        netFlow,
        inLoss: portfolioValue < invested,
      };
    });
  }, [monthlyInvestments, monthlyReturns]);

  // Loss periods — for ReferenceArea shading
  const lossPeriods = useMemo(() => {
    const periods: { x1: string; x2: string }[] = [];
    let start: string | null = null;
    chartData.forEach((d, i) => {
      if (d.inLoss && !start) start = d.month;
      if (!d.inLoss && start) {
        periods.push({ x1: start, x2: chartData[i - 1]?.month ?? d.month });
        start = null;
      }
    });
    if (start) periods.push({ x1: start, x2: chartData[chartData.length - 1].month });
    return periods;
  }, [chartData]);

  // Max drawdown from high-watermark (only meaningful months where invested > ₹5k)
  const maxDrawdown = useMemo(() => {
    let hwm = 0;
    let md  = 0;
    chartData.forEach(d => {
      if (d.invested < 5_000) return;    // skip early micro-positions
      if (d.portfolioValue > hwm) hwm = d.portfolioValue;
      if (hwm > 0 && d.portfolioValue < hwm) {
        const dd = (hwm - d.portfolioValue) / hwm;
        if (dd > md) md = dd;
      }
    });
    return md;
  }, [chartData]);

  if (!chartData.length) return null;

  const totalGain  = totalPL;
  const gainPct    = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
  const isPositive = totalGain >= 0;

  const best  = [...chartData].sort((a, b) => b.gainLossPct - a.gainLossPct)[0];
  const worst = [...chartData].sort((a, b) => a.gainLossPct - b.gainLossPct)[0];
  // Include live currentValue so peak is never lower than what we show
  const peak  = Math.max(currentValue, ...chartData.map(d => d.portfolioValue));

  const monthsInProfit = chartData.filter(d => d.gainLoss > 0).length;
  const profitRate     = chartData.length > 0 ? (monthsInProfit / chartData.length) * 100 : 0;

  const xInterval = Math.max(0, Math.floor(chartData.length / 14));

  return (
    <div className="card p-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="section-title text-base flex items-center gap-2">
            <div className="w-1 h-5 rounded-full" style={{ background: 'var(--brand)' }} />
            Portfolio Wealth Journey
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
            Cumulative capital invested vs portfolio market value · gain zone shaded
          </p>
        </div>

        {/* Summary pills */}
        <div className="flex flex-wrap gap-2.5">
          {[
            { label: 'Current Value',   val: formatCurrency(currentValue),  color: 'var(--brand)' },
            { label: 'Total Invested',  val: formatCurrency(totalInvested), color: 'var(--text-mid)' },
            {
              label: 'Total Gain/Loss',
              val: `${isPositive ? '+' : ''}${formatCurrency(totalGain)}`,
              sub: `${isPositive ? '+' : ''}${gainPct.toFixed(2)}%`,
              color: isPositive ? 'var(--gain)' : 'var(--loss)',
            },
            { label: 'Portfolio Peak', val: formatCurrency(peak), color: 'var(--warn)' },
          ].map(({ label, val, sub, color }: any) => (
            <div key={label} className="stat-pill">
              <p className="stat-pill-label">{label}</p>
              <p className="stat-pill-value metric-value" style={{ color }}>{val}</p>
              {sub && <p className="text-[10px] font-semibold metric-value" style={{ color }}>{sub}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ width: '100%', height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 58 }}>
            <defs>
              {/* Invested base — indigo */}
              <linearGradient id="pgInvestedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#818cf8" stopOpacity={0.55} />
                <stop offset="85%"  stopColor="#6366f1" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
              {/* Gain band on top — emerald */}
              <linearGradient id="pgGainGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#34d399" stopOpacity={0.80} />
                <stop offset="60%"  stopColor="#10b981" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#059669" stopOpacity={0.15} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-sm)" opacity={0.5} />

            {/* Loss period backgrounds */}
            {lossPeriods.map((p, i) => (
              <ReferenceArea
                key={i}
                x1={p.x1}
                x2={p.x2}
                fill="#ef4444"
                fillOpacity={0.07}
                stroke="#ef4444"
                strokeOpacity={0.2}
                strokeDasharray="3 3"
              />
            ))}

            {/* Peak reference line */}
            <ReferenceLine
              y={peak}
              stroke="#f59e0b"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              label={{ value: '▲ Peak', position: 'right', fontSize: 10, fill: '#f59e0b', fontWeight: 700 }}
            />

            <XAxis
              dataKey="month"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              stroke="#9ca3af"
              angle={-35}
              textAnchor="end"
              height={60}
              interval={xInterval}
            />
            <YAxis
              tickFormatter={v =>
                v >= 1_00_000 ? `₹${(v / 1_00_000).toFixed(1)}L`
                              : `₹${(v / 1_000).toFixed(0)}k`
              }
              tick={{ fill: '#6b7280', fontSize: 11 }}
              stroke="#9ca3af"
              width={68}
            />

            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                if (!d) return null;
                const gl    = d.gainLoss;
                const glPct = d.gainLossPct;
                const isUp  = gl >= 0;
                const ac    = isUp ? 'var(--gain)' : 'var(--loss)';
                const ab    = isUp ? 'var(--gain-bg)' : 'var(--loss-bg)';
                const abr   = isUp ? 'var(--gain-border)' : 'var(--loss-border)';
                return (
                  <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-md)',
                    borderRadius: 16,
                    boxShadow: 'var(--shadow-lg)',
                    minWidth: 250,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid var(--border-md)',
                      background: 'var(--bg-raised)',
                      borderTop: `3px solid ${ac}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-hi)' }}>📅 {label}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                        color: ac, background: ab, border: `1px solid ${abr}`,
                      }}>
                        {isUp ? '▲' : '▼'} {isUp ? 'Gain' : 'Loss'}
                      </span>
                    </div>
                    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Portfolio value */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 10, background: ab, border: `1px solid ${abr}` }}>
                        <div>
                          <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 2 }}>Portfolio Value</p>
                          <p style={{ fontSize: 18, fontWeight: 900, color: ac, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{formatCurrency(d.portfolioValue)}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 2 }}>vs Invested</p>
                          <p style={{ fontSize: 14, fontWeight: 900, color: ac, fontVariantNumeric: 'tabular-nums' }}>
                            {gl >= 0 ? '+' : ''}{formatCurrency(gl)}
                          </p>
                          <p style={{ fontSize: 11, fontWeight: 700, color: ac }}>
                            {glPct >= 0 ? '+' : ''}{glPct.toFixed(2)}%
                          </p>
                        </div>
                      </div>
                      {/* Invested */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', borderRadius: 10, background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-lo)' }}>Capital Invested</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#818cf8', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(d.invested)}</span>
                      </div>
                      {/* Month return */}
                      {d.monthReturn !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 12px', borderRadius: 8, background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-lo)' }}>This Month's Return</span>
                          <span style={{ fontSize: 11, fontWeight: 800, color: d.monthReturn >= 0 ? 'var(--gain)' : 'var(--loss)', fontVariantNumeric: 'tabular-nums' }}>
                            {d.monthReturn >= 0 ? '+' : ''}{formatCurrency(d.monthReturn)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }}
            />

            <Legend
              wrapperStyle={{ paddingTop: 10 }}
              formatter={v => <span className="text-xs font-semibold">{v}</span>}
            />

            {/* ── Stacked areas: invested base + gain band ── */}
            <Area
              type="monotone"
              dataKey="invested"
              stackId="wealth"
              name="Capital Invested"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#pgInvestedGrad)"
              dot={false}
              activeDot={{ r: 5, stroke: '#6366f1', strokeWidth: 2, fill: '#fff' }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="gainBand"
              stackId="wealth"
              name="Gain Zone"
              stroke="none"
              strokeWidth={0}
              fill="url(#pgGainGrad)"
              dot={false}
              activeDot={false}
              legendType="none"
              isAnimationActive={false}
            />

            {/* Portfolio value boundary line — bright green */}
            <Line
              type="monotone"
              dataKey="portfolioValue"
              name="Portfolio Value"
              stroke="#059669"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, stroke: '#059669', strokeWidth: 2, fill: '#fff' }}
              isAnimationActive={false}
              legendType="line"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom insight row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5 pt-4"
        style={{ borderTop: '1px solid var(--border-sm)' }}>
        {[
          {
            label: 'Best Month',
            val:   best ? `${best.month}` : '—',
            sub:   best ? `+${best.gainLossPct.toFixed(1)}%` : '',
            color: 'var(--gain)',
          },
          {
            label: 'Worst Month',
            val:   worst ? `${worst.month}` : '—',
            sub:   worst ? `${worst.gainLossPct.toFixed(1)}%` : '',
            color: 'var(--loss)',
          },
          {
            label: 'Months Tracked',
            val:   `${chartData.length}`,
            sub:   'months',
            color: 'var(--brand)',
          },
          {
            label: 'In Profit',
            val:   `${profitRate.toFixed(0)}%`,
            sub:   `${monthsInProfit}/${chartData.length} months`,
            color: profitRate >= 60 ? 'var(--gain)' : 'var(--warn)',
          },
          {
            label: 'Max Drawdown',
            val:   `−${(maxDrawdown * 100).toFixed(1)}%`,
            sub:   'from peak',
            color: maxDrawdown > 0.2 ? 'var(--loss)' : maxDrawdown > 0.1 ? 'var(--warn)' : 'var(--gain)',
          },
          {
            label: 'Wealth Multiplier',
            val:   totalInvested > 0 ? `${(currentValue / totalInvested).toFixed(2)}×` : '—',
            sub:   'current / invested',
            color: isPositive ? 'var(--gain)' : 'var(--loss)',
          },
        ].map(({ label, val, sub, color }) => (
          <div key={label} className="rounded-xl p-3 text-center"
            style={{
              background: `color-mix(in srgb,${color} 6%,transparent)`,
              border: `1px solid color-mix(in srgb,${color} 16%,transparent)`,
            }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5"
              style={{ color: 'var(--text-lo)' }}>{label}</p>
            <p className="text-sm font-black metric-value leading-none" style={{ color }}>{val}</p>
            {sub && <p className="text-[10px] font-medium mt-0.5 metric-value" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
