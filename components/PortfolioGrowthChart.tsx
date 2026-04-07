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

// Parse "MMM-YY" → timestamp (same logic as MonthlyCharts)
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

    // Build sorted union of all months
    const monthSet = new Set([
      ...monthlyInvestments.map(m => m.month),
      ...monthlyReturns.map(m => m.month),
    ]);
    const sortedMonths = [...monthSet].sort((a, b) => parseMonthStr(a) - parseMonthStr(b));

    // Index lookup maps
    const investMap = new Map(monthlyInvestments.map(m => [m.month, m]));
    const returnMap = new Map(monthlyReturns.map(m => [m.month, m]));

    let cumulativeInvested = 0;
    let cumulativeReturn   = 0;

    return sortedMonths.map(month => {
      const inv = investMap.get(month);
      const ret = returnMap.get(month);

      const netFlow = (inv?.investments ?? 0) - (inv?.withdrawals ?? 0);
      cumulativeInvested += netFlow;
      cumulativeReturn   += (ret?.returnAmount ?? 0);

      const portfolioValue = cumulativeInvested + cumulativeReturn;
      const gainLoss       = portfolioValue - cumulativeInvested;
      const gainLossPct    = cumulativeInvested > 0 ? (gainLoss / cumulativeInvested) * 100 : 0;

      return {
        month,
        invested:      Math.max(0, cumulativeInvested),
        portfolioValue: Math.max(0, portfolioValue),
        gainLoss,
        gainLossPct,
        monthReturn:   ret?.returnAmount ?? 0,
        netFlow,
      };
    });
  }, [monthlyInvestments, monthlyReturns]);

  if (!chartData.length) return null;

  const totalGain   = totalPL;
  const gainPct     = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
  const isPositive  = totalGain >= 0;

  // Stats
  const best  = [...chartData].sort((a, b) => b.gainLossPct - a.gainLossPct)[0];
  const worst = [...chartData].sort((a, b) => a.gainLossPct - b.gainLossPct)[0];
  const peak  = Math.max(...chartData.map(d => d.portfolioValue));

  return (
    <div className="card p-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="section-title text-base flex items-center gap-2">
            <div className="w-1 h-5 rounded-full" style={{ background: 'var(--brand)' }} />
            Portfolio Wealth Journey
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
            Cumulative capital invested vs portfolio market value over time
          </p>
        </div>

        {/* Summary pills */}
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'Current Value',    val: formatCurrency(currentValue),  color: 'var(--brand)' },
            { label: 'Total Invested',   val: formatCurrency(totalInvested), color: 'var(--text-mid)' },
            {
              label: 'Total Gain/Loss',
              val: `${isPositive ? '+' : ''}${formatCurrency(totalGain)} (${isPositive ? '+' : ''}${gainPct.toFixed(2)}%)`,
              color: isPositive ? 'var(--gain)' : 'var(--loss)',
            },
            { label: 'Portfolio Peak',   val: formatCurrency(peak),          color: 'var(--warn)' },
          ].map(({ label, val, color }) => (
            <div key={label} className="px-4 py-2 rounded-xl"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
              <p className="text-[10px] font-medium mb-0.5" style={{ color: 'var(--text-lo)' }}>{label}</p>
              <p className="text-sm font-bold metric-value" style={{ color }}>{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 55 }}>
            <defs>
              <linearGradient id="investedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="valueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#059669" stopOpacity={0.30} />
                <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-sm)" opacity={0.6} />

            <XAxis
              dataKey="month"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              stroke="#9ca3af"
              angle={-35}
              textAnchor="end"
              height={60}
              interval={Math.floor(chartData.length / 14)}
            />

            <YAxis
              tickFormatter={v => `₹${v >= 1_00_000 ? (v / 1_00_000).toFixed(1) + 'L' : (v / 1000).toFixed(0) + 'k'}`}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              stroke="#9ca3af"
              width={68}
            />

            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                if (!d) return null;
                const gl = d.gainLoss;
                const glPct = d.gainLossPct;
                return (
                  <div className="card p-3 text-sm min-w-[220px]">
                    <p className="font-bold text-hi mb-2 pb-1.5" style={{ borderBottom: '1px solid var(--border-sm)' }}>
                      {label}
                    </p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between gap-6">
                        <span style={{ color: 'var(--text-lo)' }}>Portfolio Value</span>
                        <span className="font-semibold" style={{ color: 'var(--gain)' }}>{formatCurrency(d.portfolioValue)}</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span style={{ color: 'var(--text-lo)' }}>Invested</span>
                        <span className="font-semibold" style={{ color: 'var(--brand)' }}>{formatCurrency(d.invested)}</span>
                      </div>
                      <div className="flex justify-between gap-6 pt-1" style={{ borderTop: '1px solid var(--border-sm)' }}>
                        <span style={{ color: 'var(--text-lo)' }}>Gain / Loss</span>
                        <span className="font-bold" style={{ color: gl >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                          {gl >= 0 ? '+' : ''}{formatCurrency(gl)} ({glPct >= 0 ? '+' : ''}{glPct.toFixed(2)}%)
                        </span>
                      </div>
                      {d.monthReturn !== 0 && (
                        <div className="flex justify-between gap-6">
                          <span style={{ color: 'var(--text-lo)' }}>Month Return</span>
                          <span className="font-semibold text-xs" style={{ color: d.monthReturn >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
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
              wrapperStyle={{ paddingTop: 8 }}
              formatter={v => <span className="text-xs font-semibold">{v}</span>}
            />

            {/* Invested area (below) */}
            <Area
              type="monotone"
              dataKey="invested"
              name="Capital Invested"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#investedGrad)"
              dot={false}
              activeDot={{ r: 5, stroke: '#6366f1', strokeWidth: 2, fill: '#fff' }}
              isAnimationActive={false}
            />

            {/* Portfolio value area (above) */}
            <Area
              type="monotone"
              dataKey="portfolioValue"
              name="Portfolio Value"
              stroke="#059669"
              strokeWidth={2.5}
              fill="url(#valueGrad)"
              dot={false}
              activeDot={{ r: 5, stroke: '#059669', strokeWidth: 2, fill: '#fff' }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom insight cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4" style={{ borderTop: '1px solid var(--border-sm)' }}>
        {[
          {
            label: 'Best Month',
            val: best ? `${best.month} (+${best.gainLossPct.toFixed(1)}%)` : '—',
            color: 'var(--gain)',
          },
          {
            label: 'Worst Month',
            val: worst ? `${worst.month} (${worst.gainLossPct.toFixed(1)}%)` : '—',
            color: 'var(--loss)',
          },
          {
            label: 'Months Tracked',
            val: `${chartData.length} months`,
            color: 'var(--brand)',
          },
          {
            label: 'Wealth Multiplier',
            val: totalInvested > 0 ? `${(currentValue / totalInvested).toFixed(2)}×` : '—',
            color: isPositive ? 'var(--gain)' : 'var(--loss)',
          },
        ].map(({ label, val, color }) => (
          <div key={label} className="rounded-xl p-3 text-center"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-lo)' }}>{label}</p>
            <p className="text-sm font-bold metric-value" style={{ color }}>{val}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
