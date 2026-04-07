'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';

interface Holding {
  stockName: string;
  isin?: string;
  openQty: number;
  marketValue?: number;
  investedValue?: number;
  profitLossTillDate?: number;
  profitLossTillDatePercent?: number;
  industry?: string;
}

interface StockPLContributionProps {
  holdings: Holding[];
}

/* Abbreviate long stock names for axis label */
function abbrev(name: string, max = 16): string {
  if (!name) return '';
  // Strip common suffixes
  const cleaned = name
    .replace(/\s+(LIMITED|LTD|INDUSTRIES|ENTERPRISES|CORPORATION|CORP|INC|PVT|PRIVATE)\.?$/i, '')
    .trim();
  return cleaned.length > max ? cleaned.slice(0, max - 1) + '…' : cleaned;
}

export default function StockPLContribution({ holdings }: StockPLContributionProps) {
  const chartData = useMemo(() => {
    const active = (holdings || []).filter(h => (h.openQty || 0) > 0 && (h.profitLossTillDate ?? 0) !== 0);
    return [...active]
      .sort((a, b) => (b.profitLossTillDate ?? 0) - (a.profitLossTillDate ?? 0))
      .map(h => ({
        name:    h.stockName,
        label:   abbrev(h.stockName),
        pl:      h.profitLossTillDate ?? 0,
        plPct:   h.profitLossTillDatePercent ?? 0,
        value:   h.marketValue ?? 0,
        industry: h.industry || 'Other',
      }));
  }, [holdings]);

  const stats = useMemo(() => {
    if (!chartData.length) return null;
    const winners = chartData.filter(d => d.pl > 0);
    const losers  = chartData.filter(d => d.pl < 0);
    const totalPL = chartData.reduce((s, d) => s + d.pl, 0);
    const bigWin  = winners[0];
    const bigLoss = losers[losers.length - 1];
    return { winners: winners.length, losers: losers.length, totalPL, bigWin, bigLoss };
  }, [chartData]);

  if (!chartData.length) return null;

  /* Dynamic height — min 300, 36px per bar */
  const chartHeight = Math.max(300, chartData.length * 36 + 60);

  return (
    <div className="card p-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="section-title text-base flex items-center gap-2">
            <div className="w-1 h-5 rounded-full" style={{ background: 'var(--brand)' }} />
            Stock P&L Contribution
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
            Unrealised gain / loss per holding — sorted from biggest winner to biggest drag
          </p>
        </div>

        {/* Summary pills */}
        {stats && (
          <div className="flex flex-wrap gap-3">
            {[
              {
                label: 'Winners',
                val: `${stats.winners} stocks`,
                color: 'var(--gain)',
              },
              {
                label: 'Losers',
                val: `${stats.losers} stocks`,
                color: 'var(--loss)',
              },
              {
                label: 'Net Unrealised P&L',
                val: `${stats.totalPL >= 0 ? '+' : ''}${formatCurrency(stats.totalPL)}`,
                color: stats.totalPL >= 0 ? 'var(--gain)' : 'var(--loss)',
              },
            ].map(({ label, val, color }) => (
              <div key={label} className="px-4 py-2 rounded-xl"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
                <p className="text-[10px] font-medium mb-0.5" style={{ color: 'var(--text-lo)' }}>{label}</p>
                <p className="text-sm font-bold metric-value" style={{ color }}>{val}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chart */}
      <div style={{ width: '100%', height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 100, left: 10, bottom: 4 }}
            barSize={18}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-sm)" horizontal={false} opacity={0.6} />

            <XAxis
              type="number"
              tickFormatter={v => {
                const abs = Math.abs(v);
                if (abs >= 1_00_000) return `${v < 0 ? '-' : ''}₹${(abs / 1_00_000).toFixed(1)}L`;
                if (abs >= 1_000)   return `${v < 0 ? '-' : ''}₹${(abs / 1_000).toFixed(0)}k`;
                return `₹${v.toFixed(0)}`;
              }}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              stroke="#9ca3af"
            />

            <YAxis
              type="category"
              dataKey="label"
              width={120}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              stroke="none"
            />

            <ReferenceLine x={0} stroke="var(--border-md)" strokeWidth={1.5} />

            <Tooltip
              cursor={{ fill: 'var(--bg-raised)', opacity: 0.5 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                if (!d) return null;
                const isPos = d.pl >= 0;
                return (
                  <div className="card p-3 text-sm min-w-[210px]">
                    <p className="font-bold text-hi mb-2 pb-1.5 leading-tight"
                      style={{ borderBottom: '1px solid var(--border-sm)' }}>
                      {d.name}
                    </p>
                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-lo)' }}>{d.industry}</p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between gap-6">
                        <span style={{ color: 'var(--text-lo)' }}>Gain / Loss</span>
                        <span className="font-bold" style={{ color: isPos ? 'var(--gain)' : 'var(--loss)' }}>
                          {isPos ? '+' : ''}{formatCurrency(d.pl)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span style={{ color: 'var(--text-lo)' }}>Return %</span>
                        <span className="font-semibold" style={{ color: isPos ? 'var(--gain)' : 'var(--loss)' }}>
                          {isPos ? '+' : ''}{d.plPct.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span style={{ color: 'var(--text-lo)' }}>Market Value</span>
                        <span className="font-semibold text-hi">{formatCurrency(d.value)}</span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />

            <Bar dataKey="pl" radius={[0, 4, 4, 0]} isAnimationActive={false}
              label={{
                position: 'right',
                formatter: (v: unknown) => {
                  const n = Number(v);
                  const abs = Math.abs(n);
                  return abs >= 1_00_000
                    ? `${n < 0 ? '-' : '+'}₹${(abs / 1_00_000).toFixed(1)}L`
                    : `${n < 0 ? '-' : '+'}₹${(abs / 1_000).toFixed(1)}k`;
                },
                style: { fontSize: 10, fontWeight: 600, fill: '#9ca3af' },
              }}
            >
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.pl >= 0 ? '#059669' : '#e11d48'}
                  fillOpacity={0.82}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom insight row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4" style={{ borderTop: '1px solid var(--border-sm)' }}>
          {[
            {
              label: 'Biggest Winner',
              val: stats.bigWin
                ? `${abbrev(stats.bigWin.name, 18)} (+${formatCurrency(stats.bigWin.pl)})`
                : '—',
              color: 'var(--gain)',
            },
            {
              label: 'Biggest Drag',
              val: stats.bigLoss
                ? `${abbrev(stats.bigLoss.name, 18)} (${formatCurrency(stats.bigLoss.pl)})`
                : '—',
              color: 'var(--loss)',
            },
            {
              label: 'Win Rate',
              val: chartData.length > 0
                ? `${((stats.winners / chartData.length) * 100).toFixed(0)}%`
                : '—',
              color: stats.winners >= stats.losers ? 'var(--gain)' : 'var(--loss)',
            },
            {
              label: 'Stocks Tracked',
              val: `${chartData.length} active`,
              color: 'var(--brand)',
            },
          ].map(({ label, val, color }) => (
            <div key={label} className="rounded-xl p-3 text-center"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-lo)' }}>{label}</p>
              <p className="text-sm font-bold metric-value leading-tight" style={{ color }}>{val}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
