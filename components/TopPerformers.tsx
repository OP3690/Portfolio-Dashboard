'use client';

import { formatCurrency } from '@/lib/utils';

interface TopPerformersProps {
  title: string;
  performers: Array<{
    stockName: string;
    isin: string;
    profitLossPercent: number;
    profitLoss: number;
    marketValue: number;
  }>;
  isPositive: boolean;
}

export default function TopPerformers({ title, performers, isPositive }: TopPerformersProps) {
  const accentVar  = isPositive ? '--gain' : '--loss';
  const maxAbsPct  = Math.max(...performers.map(p => Math.abs(p.profitLossPercent)), 1);

  return (
    <div className="card p-5 animate-fadeIn">

      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `color-mix(in srgb, var(${accentVar}) 12%, transparent)`,
            border: `1px solid color-mix(in srgb, var(${accentVar}) 25%, transparent)`,
            color: `var(${accentVar})`,
          }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isPositive
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
            }
          </svg>
        </div>
        <div>
          <h2 className="section-title">{title}</h2>
          <p className="section-sub">
            {isPositive ? 'Top gainers by return %' : 'Worst performers by return %'}
          </p>
        </div>
      </div>

      {performers.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted">No data available</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {performers.map((p, i) => {
            const pct      = Math.abs(p.profitLossPercent);
            const barWidth = (pct / maxAbsPct) * 100;

            // Rank medal colors
            const medals = [
              { bg: 'linear-gradient(135deg,#fbbf24,#f59e0b)', shadow: 'rgba(251,191,36,0.45)' },
              { bg: 'linear-gradient(135deg,#cbd5e1,#94a3b8)', shadow: 'rgba(148,163,184,0.4)'  },
              { bg: 'linear-gradient(135deg,#cd7c2f,#b45309)', shadow: 'rgba(180,83,9,0.4)'     },
            ];
            const medal = medals[i] ?? medals[2];

            return (
              <div key={p.isin}
                className="rounded-xl p-3.5 transition-all duration-200"
                style={{
                  background: 'var(--bg-raised)',
                  border: '1px solid var(--border-sm)',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.background   = 'var(--bg-sunken)';
                  el.style.borderColor  = `color-mix(in srgb, var(${accentVar}) 30%, transparent)`;
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.background   = 'var(--bg-raised)';
                  el.style.borderColor  = 'var(--border-sm)';
                }}
              >
                <div className="flex items-center gap-3">
                  {/* Rank badge */}
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white shrink-0"
                    style={{ background: medal.bg, boxShadow: `0 4px 10px ${medal.shadow}` }}>
                    {i + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-semibold text-hi truncate pr-2">{p.stockName}</p>
                      <p className="text-sm font-black metric-value shrink-0"
                        style={{ color: `var(${accentVar})` }}>
                        {p.profitLossPercent >= 0 ? '+' : ''}{p.profitLossPercent.toFixed(2)}%
                      </p>
                    </div>

                    {/* Progress bar */}
                    <div className="progress-track mb-1.5">
                      <div className="progress-fill"
                        style={{
                          width: `${barWidth}%`,
                          background: isPositive
                            ? 'linear-gradient(90deg, var(--gain), var(--gain-mid))'
                            : 'linear-gradient(90deg, var(--loss), var(--loss-mid))',
                        }} />
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-xs metric-value text-lo">MV {formatCurrency(p.marketValue)}</p>
                      <p className="text-xs metric-value font-semibold" style={{ color: `var(${accentVar})` }}>
                        {p.profitLoss >= 0 ? '+' : ''}{formatCurrency(p.profitLoss)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
