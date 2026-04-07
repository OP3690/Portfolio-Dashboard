'use client';

import { useMemo, useState } from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/utils';

interface Holding {
  stockName: string;
  openQty: number;
  marketValue?: number;
  profitLossTillDate?: number;
  profitLossTillDatePercent?: number;
  industry?: string;
  avgBuyPrice?: number;
}

interface PortfolioTreemapProps {
  holdings: Holding[];
}

/* Return % → hex color (deep red → amber → deep green) */
function returnColor(pct: number): string {
  if (pct <= -20) return '#be123c';
  if (pct <= -10) return '#e11d48';
  if (pct <= -3)  return '#fb7185';
  if (pct < 3)    return '#d97706';
  if (pct < 10)   return '#4ade80';
  if (pct < 20)   return '#16a34a';
  return '#14532d';
}

/* Text color for contrast on tile */
function textColor(pct: number): string {
  if (pct < -10 || pct > 15) return '#fff';
  return '#fff';
}

function abbrev(name: string, max = 14): string {
  const cleaned = name
    .replace(/\s+(LIMITED|LTD|INDUSTRIES|ENTERPRISES|CORPORATION|CORP|INC|PVT|PRIVATE)\.?$/i, '')
    .trim();
  return cleaned.length > max ? cleaned.slice(0, max - 1) + '…' : cleaned;
}

/* Custom tile renderer */
const CustomContent = (props: any) => {
  const { x, y, width, height, name, plPct, plAbs, mv, industry } = props;
  if (width < 20 || height < 20) return null;

  const bg = returnColor(plPct ?? 0);
  const fg = textColor(plPct ?? 0);
  const showLabel = width > 55 && height > 36;
  const showPct   = width > 55 && height > 52;

  return (
    <g>
      <rect x={x} y={y} width={width} height={height}
        fill={bg} stroke="#111827" strokeWidth={1.5} rx={4} />
      {showLabel && (
        <>
          <text x={x + 8} y={y + 18}
            fill={fg} fontSize={Math.min(12, width / 7)}
            fontWeight={600} style={{ userSelect: 'none' }}>
            {abbrev(name, Math.max(6, Math.floor(width / 9)))}
          </text>
          {showPct && (
            <text x={x + 8} y={y + 32}
              fill={fg} fontSize={Math.min(11, width / 8)}
              opacity={0.88} style={{ userSelect: 'none' }}>
              {(plPct ?? 0) >= 0 ? '+' : ''}{(plPct ?? 0).toFixed(1)}%
            </text>
          )}
        </>
      )}
    </g>
  );
};

export default function PortfolioTreemap({ holdings }: PortfolioTreemapProps) {
  const [filter, setFilter] = useState<'all' | 'gainers' | 'losers'>('all');

  const data = useMemo(() => {
    const active = (holdings || []).filter(h => (h.openQty || 0) > 0 && (h.marketValue || 0) > 0);
    const mapped = active.map(h => {
      const mv       = h.marketValue ?? 0;
      const pl       = h.profitLossTillDate ?? 0;
      const plPct    = h.profitLossTillDatePercent ?? 0;
      const invested = mv - pl;
      return {
        name:     h.stockName,
        size:     Math.max(invested, 1),  // treemap needs positive size
        mv,
        plAbs:    pl,
        plPct,
        invested,
        industry: h.industry || 'Other',
      };
    });

    const filtered = filter === 'gainers'
      ? mapped.filter(d => d.plPct > 0)
      : filter === 'losers'
      ? mapped.filter(d => d.plPct < 0)
      : mapped;

    return [{ name: 'root', children: filtered }];
  }, [holdings, filter]);

  const stats = useMemo(() => {
    const active = (holdings || []).filter(h => (h.openQty || 0) > 0 && (h.marketValue || 0) > 0);
    const totalInvested = active.reduce((s, h) => s + ((h.marketValue ?? 0) - (h.profitLossTillDate ?? 0)), 0);
    const totalMV       = active.reduce((s, h) => s + (h.marketValue ?? 0), 0);
    const gainers       = active.filter(h => (h.profitLossTillDatePercent ?? 0) > 0);
    const losers        = active.filter(h => (h.profitLossTillDatePercent ?? 0) < 0);
    // Biggest by invested
    const sorted = [...active].sort((a,b) => {
      const ia = (a.marketValue ?? 0) - (a.profitLossTillDate ?? 0);
      const ib = (b.marketValue ?? 0) - (b.profitLossTillDate ?? 0);
      return ib - ia;
    });
    const top3 = sorted.slice(0, 3).map(h => ({
      name: abbrev(h.stockName, 15),
      pct: (((h.marketValue ?? 0) - (h.profitLossTillDate ?? 0)) / totalInvested * 100),
    }));
    return { totalInvested, totalMV, gainers: gainers.length, losers: losers.length, top3, total: active.length };
  }, [holdings]);

  const legends = [
    { label: '> +20%', color: '#14532d' },
    { label: '+10–20%', color: '#16a34a' },
    { label: '0–10%', color: '#4ade80' },
    { label: '±3%', color: '#d97706' },
    { label: '-3–10%', color: '#fb7185' },
    { label: '-10–20%', color: '#e11d48' },
    { label: '< -20%', color: '#be123c' },
  ];

  return (
    <div className="card p-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="section-title text-base flex items-center gap-2">
            <div className="w-1 h-5 rounded-full" style={{ background: 'var(--brand)' }} />
            Portfolio Concentration Map
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
            Tile size = invested value · Colour = return % · Spot concentration risk at a glance
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 p-1 rounded-lg" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
          {(['all', 'gainers', 'losers'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1 rounded-md text-xs font-semibold transition-all capitalize"
              style={{
                background:  filter === f ? 'var(--bg-card)' : 'transparent',
                color:       filter === f
                  ? f === 'gainers' ? 'var(--gain)' : f === 'losers' ? 'var(--loss)' : 'var(--brand)'
                  : 'var(--text-lo)',
                boxShadow:   filter === f ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
              }}>
              {f === 'all' ? 'All' : f === 'gainers' ? `Gainers (${stats.gainers})` : `Losers (${stats.losers})`}
            </button>
          ))}
        </div>
      </div>

      {/* Treemap */}
      <div style={{ width: '100%', height: 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="size"
            aspectRatio={4 / 3}
            isAnimationActive={false}
            content={<CustomContent />}
          >
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                if (!d || !d.name || d.name === 'root') return null;
                const isPos = (d.plPct ?? 0) >= 0;
                return (
                  <div className="card p-3 text-sm min-w-[200px]">
                    <p className="font-bold mb-1.5 pb-1.5 leading-tight text-hi"
                      style={{ borderBottom: '1px solid var(--border-sm)' }}>
                      {d.name}
                    </p>
                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-lo)' }}>{d.industry}</p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between gap-5">
                        <span style={{ color: 'var(--text-lo)' }}>Invested</span>
                        <span className="font-semibold text-hi">{formatCurrency(d.invested)}</span>
                      </div>
                      <div className="flex justify-between gap-5">
                        <span style={{ color: 'var(--text-lo)' }}>Market Value</span>
                        <span className="font-semibold text-hi">{formatCurrency(d.mv)}</span>
                      </div>
                      <div className="flex justify-between gap-5">
                        <span style={{ color: 'var(--text-lo)' }}>Gain / Loss</span>
                        <span className="font-bold" style={{ color: isPos ? 'var(--gain)' : 'var(--loss)' }}>
                          {isPos ? '+' : ''}{formatCurrency(d.plAbs)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-5">
                        <span style={{ color: 'var(--text-lo)' }}>Return</span>
                        <span className="font-bold" style={{ color: isPos ? 'var(--gain)' : 'var(--loss)' }}>
                          {isPos ? '+' : ''}{(d.plPct ?? 0).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>

      {/* Colour legend */}
      <div className="flex flex-wrap items-center gap-3 mt-4 pt-3" style={{ borderTop: '1px solid var(--border-sm)' }}>
        <span className="text-[10px] font-semibold uppercase tracking-wide mr-1" style={{ color: 'var(--text-lo)' }}>Return</span>
        {legends.map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: l.color }} />
            <span className="text-[10px]" style={{ color: 'var(--text-lo)' }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Insight row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {[
          {
            label: 'Stocks Mapped',
            val: `${stats.total}`,
            color: 'var(--brand)',
          },
          {
            label: 'Portfolio Invested',
            val: formatCurrency(stats.totalInvested),
            color: 'var(--text-hi)',
          },
          {
            label: 'Top 3 Concentration',
            val: `${stats.top3.reduce((s, t) => s + t.pct, 0).toFixed(1)}%`,
            sub: stats.top3.map(t => `${t.name} ${t.pct.toFixed(0)}%`).join(' · '),
            color: stats.top3.reduce((s, t) => s + t.pct, 0) > 50 ? 'var(--warn)' : 'var(--gain)',
          },
          {
            label: 'Win Rate',
            val: stats.total > 0 ? `${((stats.gainers / stats.total) * 100).toFixed(0)}%` : '—',
            sub: `${stats.gainers} gainers / ${stats.losers} losers`,
            color: stats.gainers >= stats.losers ? 'var(--gain)' : 'var(--loss)',
          },
        ].map(({ label, val, sub, color }) => (
          <div key={label} className="rounded-xl p-3"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-lo)' }}>{label}</p>
            <p className="text-sm font-bold metric-value leading-tight" style={{ color }}>{val}</p>
            {sub && <p className="text-[9px] mt-0.5 leading-tight" style={{ color: 'var(--text-lo)' }}>{sub}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
