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

const RANK_STYLES = [
  { bg: 'linear-gradient(135deg,#fbbf24,#f59e0b)', shadow: 'rgba(251,191,36,0.4)' },  // Gold
  { bg: 'linear-gradient(135deg,#e2e8f0,#94a3b8)', shadow: 'rgba(148,163,184,0.35)' },  // Silver
  { bg: 'linear-gradient(135deg,#d97706,#b45309)', shadow: 'rgba(180,83,9,0.35)' },     // Bronze
];

export default function TopPerformers({ title, performers, isPositive }: TopPerformersProps) {
  const accentColor = isPositive ? '#10b981' : '#f43f5e';
  const maxAbsPct   = Math.max(...performers.map(p => Math.abs(p.profitLossPercent)), 1);

  return (
    <div className="rounded-2xl p-5 animate-fadeIn"
      style={{
        background: 'linear-gradient(145deg, #1a2240 0%, #0f1629 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}>

      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${accentColor}15`, border: `1px solid ${accentColor}28` }}>
          <svg className="w-4 h-4" style={{ color: accentColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isPositive
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
            }
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-bold text-white leading-none">{title}</h2>
          <p className="text-[10px] mt-0.5" style={{ color: '#4b5d78' }}>
            {isPositive ? 'Top gainers by return %' : 'Worst performers by return %'}
          </p>
        </div>
      </div>

      {performers.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm" style={{ color: '#4b5d78' }}>No data available</p>
        </div>
      ) : (
        <div className="space-y-3">
          {performers.map((p, i) => {
            const pct       = Math.abs(p.profitLossPercent);
            const barWidth  = (pct / maxAbsPct) * 100;
            const rankStyle = RANK_STYLES[i] ?? RANK_STYLES[2];

            return (
              <div key={p.isin}
                className="rounded-xl p-3.5 group transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  transition: 'background 0.2s ease, border-color 0.2s ease',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.background   = 'rgba(255,255,255,0.055)';
                  (e.currentTarget as HTMLDivElement).style.borderColor  = `${accentColor}30`;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.background   = 'rgba(255,255,255,0.03)';
                  (e.currentTarget as HTMLDivElement).style.borderColor  = 'rgba(255,255,255,0.06)';
                }}
              >
                <div className="flex items-center gap-3">
                  {/* Rank badge */}
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-black shrink-0"
                    style={{ background: rankStyle.bg, boxShadow: `0 4px 10px ${rankStyle.shadow}` }}>
                    {i + 1}
                  </div>

                  {/* Stock info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-semibold text-white truncate pr-2">{p.stockName}</p>
                      <p className="text-sm font-black font-mono shrink-0"
                        style={{ color: accentColor }}>
                        {p.profitLossPercent >= 0 ? '+' : ''}{p.profitLossPercent.toFixed(2)}%
                      </p>
                    </div>

                    {/* Progress bar */}
                    <div className="h-1 rounded-full mb-1.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${barWidth}%`,
                          background: isPositive
                            ? 'linear-gradient(90deg, #059669, #10b981)'
                            : 'linear-gradient(90deg, #be123c, #f43f5e)',
                          boxShadow: `0 0 8px ${accentColor}60`,
                        }} />
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-xs font-mono" style={{ color: '#4b5d78' }}>
                        MV {formatCurrency(p.marketValue)}
                      </p>
                      <p className="text-xs font-mono font-semibold" style={{ color: accentColor }}>
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
