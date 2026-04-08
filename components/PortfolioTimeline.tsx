'use client';

import { useMemo, useState } from 'react';

/* ─── types ─── */
interface Holding {
  stockName?: string;
  isin?: string;
  sectorName?: string;
  investmentAmount?: number;
  marketValue?: number;
  profitLossTillDate?: number;
  profitLossTillDatePercent?: number;
  holdingPeriodYears?: number;
  holdingPeriodMonths?: number;
  openQty?: number;
}

interface Transaction {
  isin: string;
  transactionDate: Date | string;
  buySell: string;
  tradePriceAdjusted?: number;
  tradedQty?: number;
  tradeValueAdjusted?: number;
}

interface Props {
  holdings: Holding[];
  transactions: Transaction[];
}

/* ─── helpers ─── */
function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

function fmtAmt(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000)       return `₹${(v / 1_000).toFixed(1)}k`;
  return `₹${v.toFixed(0)}`;
}

function retColor(pct: number): { bar: string; text: string } {
  if (pct >= 50)  return { bar: '#166534', text: '#4ade80' };
  if (pct >= 20)  return { bar: '#14532d', text: '#86efac' };
  if (pct >= 0)   return { bar: '#134e24', text: '#bbf7d0' };
  if (pct >= -15) return { bar: '#7f1d1d', text: '#fca5a5' };
  return               { bar: '#450a0a', text: '#f87171' };
}

/* ─── main ─── */
export default function PortfolioTimeline({ holdings, transactions }: Props) {
  const [sort, setSort] = useState<'entry' | 'return' | 'holding' | 'pl'>('entry');
  const [hover, setHover] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);

  /* Build entry data per stock */
  const rows = useMemo(() => {
    // Group BUY transactions by ISIN
    const buyMap = new Map<string, Date[]>();
    transactions.forEach(t => {
      if (!t.isin || !t.transactionDate) return;
      const u = (t.buySell || '').toUpperCase();
      if (!u.includes('BUY') && u !== 'P') return; // skip sells/dividends
      const d = toDate(t.transactionDate);
      if (isNaN(d.getTime())) return;
      if (!buyMap.has(t.isin)) buyMap.set(t.isin, []);
      buyMap.get(t.isin)!.push(d);
    });

    return holdings.map(h => {
      const isin = h.isin || '';
      const buys = (buyMap.get(isin) || []).sort((a, b) => a.getTime() - b.getTime());

      // Determine entry date: first buy transaction OR approximate from holding period
      let entryDate: Date;
      if (buys.length > 0) {
        entryDate = buys[0];
      } else {
        const months = (h.holdingPeriodYears || 0) * 12 + (h.holdingPeriodMonths || 0);
        entryDate = new Date(today.getTime() - months * 30 * 24 * 60 * 60 * 1000);
      }

      const pl    = h.profitLossTillDate ?? ((h.marketValue ?? 0) - (h.investmentAmount ?? 0));
      const ret   = h.profitLossTillDatePercent ?? 0;
      const daysHeld = Math.round((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));

      return {
        name:      h.stockName || 'Unknown',
        isin,
        sector:    h.sectorName || '',
        entryDate,
        buys,          // all buy events
        daysHeld,
        ret,
        pl,
        invested:  h.investmentAmount ?? 0,
        current:   h.marketValue ?? 0,
      };
    });
  }, [holdings, transactions, today]);

  /* Sort */
  const sorted = useMemo(() => {
    const r = [...rows];
    if (sort === 'entry')   return r.sort((a, b) => a.entryDate.getTime() - b.entryDate.getTime());
    if (sort === 'return')  return r.sort((a, b) => b.ret - a.ret);
    if (sort === 'holding') return r.sort((a, b) => b.daysHeld - a.daysHeld);
    return r.sort((a, b) => b.pl - a.pl);
  }, [rows, sort]);

  /* Timeline axis range */
  const minDate = useMemo(
    () => new Date(Math.min(...rows.map(r => r.entryDate.getTime()))),
    [rows],
  );
  const totalSpan = today.getTime() - minDate.getTime();

  /* Month axis ticks */
  const axisTicks = useMemo(() => {
    const ticks: { label: string; pct: number }[] = [];
    const d = new Date(minDate);
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    while (d <= today) {
      const pct = ((d.getTime() - minDate.getTime()) / totalSpan) * 100;
      const isJan = d.getMonth() === 0;
      ticks.push({ label: isJan ? d.getFullYear().toString() : (d.getMonth() % 3 === 0 ? fmtDate(d) : ''), pct });
      d.setMonth(d.getMonth() + 1);
    }
    return ticks;
  }, [minDate, today, totalSpan]);

  /* Summary stats */
  const avgDays  = rows.length ? Math.round(rows.reduce((s, r) => s + r.daysHeld, 0) / rows.length) : 0;
  const oldest   = rows.length ? [...rows].sort((a, b) => a.entryDate.getTime() - b.entryDate.getTime())[0] : null;
  const newest   = rows.length ? [...rows].sort((a, b) => b.entryDate.getTime() - a.entryDate.getTime())[0] : null;
  const longestH = rows.length ? [...rows].sort((a, b) => b.daysHeld - a.daysHeld)[0] : null;

  if (!rows.length) return null;

  return (
    <div className="card p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-hi">Portfolio Entry Timeline</h3>
          <p className="text-xs text-lo mt-0.5">
            When you entered each position · Accumulation events · Holding duration
          </p>
        </div>
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-card-alt)' }}>
          {([
            { k: 'entry',   l: 'Entry Date' },
            { k: 'holding', l: 'Longest Hold' },
            { k: 'return',  l: 'Best Return' },
            { k: 'pl',      l: 'Best P&L' },
          ] as const).map(({ k, l }) => (
            <button key={k} onClick={() => setSort(k)}
              className="text-xs px-2.5 py-1 rounded-md font-medium transition-all"
              style={{
                background: sort === k ? 'var(--brand)' : 'transparent',
                color: sort === k ? '#fff' : 'var(--text-lo)',
              }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Avg Hold',       value: `${Math.round(avgDays / 30)}m`, sub: `${avgDays} days avg`,            color: 'var(--text-hi)' },
          { label: 'Oldest Position', value: oldest?.name ?? '–',           sub: oldest ? fmtDate(oldest.entryDate) : '', color: 'var(--gain)' },
          { label: 'Newest Entry',    value: newest?.name ?? '–',           sub: newest ? fmtDate(newest.entryDate) : '', color: '#38bdf8' },
          { label: 'Longest Holder', value: longestH?.name ?? '–',         sub: longestH ? `${Math.round(longestH.daysHeld / 30)}m held` : '', color: '#a78bfa' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            <p className="text-xs text-lo mb-1">{s.label}</p>
            <p className="text-sm font-bold truncate px-1" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-lo mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Gantt chart */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: 520 }}>

          {/* X-axis ticks */}
          <div className="relative mb-1" style={{ marginLeft: 132, marginRight: 120, height: 20 }}>
            {axisTicks.filter(t => t.label).map((t, i) => (
              <div key={i} className="absolute text-xs text-lo"
                style={{ left: `${t.pct}%`, transform: 'translateX(-50%)', fontSize: 9, whiteSpace: 'nowrap' }}>
                {t.label}
              </div>
            ))}
          </div>

          {/* Rows */}
          <div className="space-y-1">
            {sorted.map(row => {
              const col = retColor(row.ret);
              const barStart = ((row.entryDate.getTime() - minDate.getTime()) / totalSpan) * 100;
              const barWidth = ((today.getTime() - row.entryDate.getTime()) / totalSpan) * 100;
              const isHovered = hover === row.isin;

              return (
                <div
                  key={row.isin || row.name}
                  className="flex items-center gap-2 group"
                  style={{ height: 28 }}
                  onMouseEnter={() => setHover(row.isin)}
                  onMouseLeave={() => setHover(null)}
                >
                  {/* Stock name */}
                  <div className="text-right shrink-0 truncate text-xs font-medium"
                    style={{ width: 128, color: isHovered ? 'var(--text-hi)' : 'var(--text-lo)' }}>
                    {row.name}
                  </div>

                  {/* Bar track */}
                  <div className="flex-1 relative" style={{ height: 18 }}>
                    {/* Track background */}
                    <div className="absolute inset-0 rounded-full" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }} />

                    {/* Holding bar */}
                    <div
                      className="absolute rounded-full transition-all"
                      style={{
                        left:   `${barStart}%`,
                        width:  `${Math.max(barWidth, 0.5)}%`,
                        top: 2, bottom: 2,
                        background: col.bar,
                        border: `1px solid ${col.text}44`,
                        opacity: isHovered ? 1 : 0.75,
                      }}
                    />

                    {/* Buy event markers (dots on the bar) */}
                    {row.buys.map((buyDate, bi) => {
                      const dotPct = ((buyDate.getTime() - minDate.getTime()) / totalSpan) * 100;
                      return (
                        <div key={bi}
                          className="absolute rounded-full"
                          style={{
                            left:   `calc(${dotPct}% - 3px)`,
                            top:    3, width: 6, height: 12,
                            background: col.text,
                            opacity: 0.8,
                            border: '1px solid #00000033',
                            zIndex: 2,
                          }}
                          title={`Buy on ${fmtDate(buyDate)}`}
                        />
                      );
                    })}

                    {/* Today marker (right edge) */}
                    <div className="absolute rounded-full"
                      style={{ right: `${100 - (barStart + barWidth)}%`, top: 1, width: 4, height: 16, background: col.text, zIndex: 3 }}
                    />

                    {/* Hover tooltip */}
                    {isHovered && (
                      <div className="absolute z-50 rounded-xl p-3 text-xs space-y-1 shadow-xl"
                        style={{
                          top: 24, left: `${Math.min(barStart + barWidth / 2, 65)}%`,
                          transform: 'translateX(-50%)',
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border)',
                          minWidth: 190,
                          pointerEvents: 'none',
                        }}>
                        <p className="font-bold text-hi">{row.name}</p>
                        {row.sector && <p className="text-lo">{row.sector}</p>}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                          <span className="text-lo">Entry</span>
                          <span className="text-hi font-semibold">{fmtDate(row.entryDate)}</span>
                          <span className="text-lo">Holding</span>
                          <span className="text-hi font-semibold">{Math.round(row.daysHeld / 30)}m ({row.daysHeld}d)</span>
                          <span className="text-lo">Buys</span>
                          <span className="text-hi font-semibold">{row.buys.length > 0 ? row.buys.length : 'N/A'}</span>
                          <span className="text-lo">Invested</span>
                          <span className="text-hi font-semibold">{fmtAmt(row.invested)}</span>
                          <span className="text-lo">Return</span>
                          <span className="font-bold" style={{ color: col.text }}>
                            {row.ret >= 0 ? '+' : ''}{row.ret.toFixed(1)}%
                          </span>
                          <span className="text-lo">P&L</span>
                          <span className="font-bold" style={{ color: col.text }}>
                            {row.pl >= 0 ? '+' : ''}{fmtAmt(row.pl)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right badge */}
                  <div className="shrink-0 text-right" style={{ width: 116 }}>
                    <span className="text-xs font-bold" style={{ color: col.text }}>
                      {row.ret >= 0 ? '+' : ''}{row.ret.toFixed(1)}%
                    </span>
                    <span className="text-xs text-lo ml-1">
                      {row.pl >= 0 ? '+' : ''}{fmtAmt(row.pl)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* X-axis bottom line */}
          <div className="relative mt-2" style={{ marginLeft: 132, marginRight: 120 }}>
            <div className="w-full h-px" style={{ background: 'var(--border)' }} />
            {axisTicks.filter(t => t.label).map((t, i) => (
              <div key={i} className="absolute" style={{ left: `${t.pct}%`, top: 0, width: 1, height: 4, background: 'var(--border)' }} />
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-5 text-xs text-lo">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-2 rounded-full" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }} />
          <span>Timeline bar = holding period</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-3 rounded-sm" style={{ background: '#4ade80', opacity: 0.8 }} />
          <span>Vertical tick = buy event</span>
        </div>
        <div className="flex items-center gap-4 ml-2">
          {[
            { label: '≥ +50%', color: '#4ade80' },
            { label: '+20–50%', color: '#86efac' },
            { label: '0–20%', color: '#bbf7d0' },
            { label: '< 0%', color: '#f87171' },
          ].map(c => (
            <span key={c.label} className="flex items-center gap-1">
              <span className="w-3 h-2 rounded-sm inline-block" style={{ background: c.color, opacity: 0.8 }} />
              {c.label}
            </span>
          ))}
        </div>
      </div>

      {/* Entry clustering insight */}
      {(() => {
        // find if many stocks entered in same 3-month window
        const quarterMap = new Map<string, number>();
        rows.forEach(r => {
          const q = `Q${Math.floor(r.entryDate.getMonth() / 3) + 1}-${r.entryDate.getFullYear()}`;
          quarterMap.set(q, (quarterMap.get(q) || 0) + 1);
        });
        const busiest = [...quarterMap.entries()].sort((a, b) => b[1] - a[1])[0];
        if (!busiest || busiest[1] < 2) return null;
        return (
          <div className="rounded-xl p-3 text-xs" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            <span className="font-semibold text-mid">📅 Entry Clustering: </span>
            <span className="text-lo">
              You opened <span className="text-hi font-semibold">{busiest[1]} positions</span> in {busiest[0]} — your most active entry quarter.
              {busiest[1] >= 4
                ? ' Heavy clustering can indicate FOMO-driven buying in a single market phase.'
                : ' Moderate clustering suggests deliberate accumulation during that period.'}
            </span>
          </div>
        );
      })()}
    </div>
  );
}
