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

const MEDALS = [
  { bg: 'linear-gradient(135deg,#fbbf24,#f59e0b)', shadow: 'rgba(251,191,36,0.5)',  label: '1st' },
  { bg: 'linear-gradient(135deg,#cbd5e1,#94a3b8)', shadow: 'rgba(148,163,184,0.45)', label: '2nd' },
  { bg: 'linear-gradient(135deg,#cd7c2f,#b45309)', shadow: 'rgba(180,83,9,0.40)',    label: '3rd' },
];

export default function TopPerformers({ title, performers, isPositive }: TopPerformersProps) {
  const accentVar = isPositive ? '--gain' : '--loss';
  const maxAbsPct = Math.max(...performers.map(p => Math.abs(p.profitLossPercent)), 1);

  return (
    <div className="card p-5 animate-fadeIn flex flex-col h-full">

      {/* ── Header ── */}
      <div className="flex items-center gap-2.5 mb-5">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `color-mix(in srgb, var(${accentVar}) 12%, transparent)`,
            border: `1px solid color-mix(in srgb, var(${accentVar}) 24%, transparent)`,
            color: `var(${accentVar})`,
          }}
        >
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

      {/* ── Performers ── */}
      {performers.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-8">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No data available</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 flex-1">
          {performers.map((p, i) => {
            const pct      = Math.abs(p.profitLossPercent);
            const barWidth = (pct / maxAbsPct) * 100;
            const medal    = MEDALS[i] ?? MEDALS[2];

            return (
              <div
                key={p.isin}
                className="rounded-xl p-3.5 transition-all duration-200"
                style={{
                  background: 'var(--bg-raised)',
                  border: '1px solid var(--border-sm)',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.background  = 'var(--bg-sunken)';
                  el.style.borderColor = `color-mix(in srgb, var(${accentVar}) 28%, transparent)`;
                  el.style.transform   = 'translateX(2px)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.background  = 'var(--bg-raised)';
                  el.style.borderColor = 'var(--border-sm)';
                  el.style.transform   = 'translateX(0)';
                }}
              >
                <div className="flex items-center gap-3">
                  {/* Rank medal */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white shrink-0"
                    style={{ background: medal.bg, boxShadow: `0 4px 10px ${medal.shadow}` }}
                  >
                    {i + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Name + % */}
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-semibold text-hi truncate pr-2 leading-tight">
                        {p.stockName}
                      </p>
                      <p
                        className="text-sm font-black metric-value shrink-0"
                        style={{ color: `var(${accentVar})` }}
                      >
                        {p.profitLossPercent >= 0 ? '+' : ''}{p.profitLossPercent.toFixed(2)}%
                      </p>
                    </div>

                    {/* Progress bar */}
                    <div className="progress-track mb-1.5">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${barWidth}%`,
                          background: isPositive
                            ? 'linear-gradient(90deg, var(--gain), var(--gain-mid))'
                            : 'linear-gradient(90deg, var(--loss), var(--loss-mid))',
                        }}
                      />
                    </div>

                    {/* MV + P&L */}
                    <div className="flex items-center justify-between">
                      <p className="text-xs metric-value" style={{ color: 'var(--text-lo)' }}>
                        MV {formatCurrency(p.marketValue)}
                      </p>
                      <p
                        className="text-xs metric-value font-semibold"
                        style={{ color: `var(${accentVar})` }}
                      >
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
