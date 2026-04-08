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

function fmtDate(d: Date, short = false): string {
  if (short) return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtAmt(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000)       return `₹${(v / 1_000).toFixed(1)}k`;
  return `₹${v.toFixed(0)}`;
}

function retPalette(pct: number) {
  if (pct >= 50)  return { bar: 'linear-gradient(90deg,#14532d,#166534)', border: '#22c55e', text: '#4ade80', badge: '#052e16' };
  if (pct >= 20)  return { bar: 'linear-gradient(90deg,#166534,#15803d)', border: '#4ade80', text: '#86efac', badge: '#052e16' };
  if (pct >= 5)   return { bar: 'linear-gradient(90deg,#15803d,#16a34a)', border: '#86efac', text: '#bbf7d0', badge: '#052e16' };
  if (pct >= 0)   return { bar: 'linear-gradient(90deg,#1a3320,#166534)', border: '#4ade8077', text: '#86efac', badge: '#0a1f10' };
  if (pct >= -10) return { bar: 'linear-gradient(90deg,#7f1d1d,#991b1b)', border: '#fca5a5', text: '#fca5a5', badge: '#2d0a0a' };
  return               { bar: 'linear-gradient(90deg,#450a0a,#7f1d1d)', border: '#f87171', text: '#f87171', badge: '#2d0a0a' };
}

/* sector → accent dot colour */
const SECTOR_COLORS: Record<string, string> = {
  'Information Technology': '#38bdf8',
  'IT':                     '#38bdf8',
  'Banking':                '#a78bfa',
  'Financial Services':     '#a78bfa',
  'Finance':                '#a78bfa',
  'Pharmaceuticals':        '#34d399',
  'Healthcare':             '#34d399',
  'FMCG':                   '#fb923c',
  'Consumer':               '#fb923c',
  'Energy':                 '#fbbf24',
  'Oil & Gas':              '#fbbf24',
  'Automobile':             '#60a5fa',
  'Auto':                   '#60a5fa',
  'Metal':                  '#94a3b8',
  'Metals':                 '#94a3b8',
  'Infrastructure':         '#f97316',
  'Cement':                 '#d1d5db',
  'Telecom':                '#e879f9',
  'Media':                  '#fb7185',
  'Retail':                 '#f59e0b',
  'Chemical':               '#6ee7b7',
  'Chemicals':              '#6ee7b7',
};
function sectorColor(s: string): string {
  for (const [k, v] of Object.entries(SECTOR_COLORS)) {
    if (s.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return '#64748b';
}

/* ─── main ─── */
export default function PortfolioTimeline({ holdings, transactions }: Props) {
  const [view, setView]   = useState<'gantt' | 'cards'>('gantt');
  const [sort, setSort]   = useState<'entry' | 'return' | 'holding' | 'pl'>('entry');
  const [hoverId, setHoverId] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);

  /* Build per-stock rows */
  const rows = useMemo(() => {
    const buyMap = new Map<string, Date[]>();
    transactions.forEach(t => {
      if (!t.isin || !t.transactionDate) return;
      const u = (t.buySell || '').toUpperCase();
      if (!u.includes('BUY') && u !== 'P') return;
      const d = toDate(t.transactionDate);
      if (isNaN(d.getTime())) return;
      if (!buyMap.has(t.isin)) buyMap.set(t.isin, []);
      buyMap.get(t.isin)!.push(d);
    });

    return holdings.map(h => {
      const isin = h.isin || `${h.stockName}-${Math.random()}`;
      const buys = (buyMap.get(h.isin || '') || []).sort((a, b) => a.getTime() - b.getTime());

      let entryDate: Date;
      if (buys.length > 0) {
        entryDate = buys[0];
      } else {
        const months = (h.holdingPeriodYears || 0) * 12 + (h.holdingPeriodMonths || 0);
        entryDate = new Date(today.getTime() - months * 30.4375 * 24 * 3600 * 1000);
      }

      const pl       = h.profitLossTillDate ?? ((h.marketValue ?? 0) - (h.investmentAmount ?? 0));
      const ret      = h.profitLossTillDatePercent ?? 0;
      const daysHeld = Math.round((today.getTime() - entryDate.getTime()) / (24 * 3600 * 1000));
      const monthsHeld = Math.round(daysHeld / 30.4375);

      return { id: isin, name: h.stockName || 'Unknown', sector: h.sectorName || '', entryDate, buys, daysHeld, monthsHeld, ret, pl, invested: h.investmentAmount ?? 0 };
    });
  }, [holdings, transactions, today]);

  /* Sorted rows */
  const sorted = useMemo(() => {
    const r = [...rows];
    if (sort === 'entry')   return r.sort((a, b) => a.entryDate.getTime() - b.entryDate.getTime());
    if (sort === 'return')  return r.sort((a, b) => b.ret - a.ret);
    if (sort === 'holding') return r.sort((a, b) => b.daysHeld - a.daysHeld);
    return r.sort((a, b) => b.pl - a.pl);
  }, [rows, sort]);

  /* Timeline span */
  const minTs = useMemo(() => Math.min(...rows.map(r => r.entryDate.getTime())), [rows]);
  const span  = today.getTime() - minTs;

  /* Year band markers */
  const yearBands = useMemo(() => {
    const bands: { year: number; startPct: number; endPct: number }[] = [];
    const startYear = new Date(minTs).getFullYear();
    const endYear   = today.getFullYear();
    for (let y = startYear; y <= endYear; y++) {
      const yStart = Math.max(new Date(y, 0, 1).getTime(), minTs);
      const yEnd   = Math.min(new Date(y + 1, 0, 1).getTime(), today.getTime());
      bands.push({
        year: y,
        startPct: ((yStart - minTs) / span) * 100,
        endPct:   ((yEnd   - minTs) / span) * 100,
      });
    }
    return bands;
  }, [minTs, span, today]);

  /* Summary */
  const avgMonths = rows.length ? Math.round(rows.reduce((s, r) => s + r.monthsHeld, 0) / rows.length) : 0;
  const oldest    = [...rows].sort((a, b) => a.entryDate.getTime() - b.entryDate.getTime())[0];
  const newest    = [...rows].sort((a, b) => b.entryDate.getTime() - a.entryDate.getTime())[0];
  const bestRet   = [...rows].sort((a, b) => b.ret - a.ret)[0];

  /* Entry clustering */
  const clusterInsight = useMemo(() => {
    const qMap = new Map<string, number>();
    rows.forEach(r => {
      const q = `Q${Math.floor(r.entryDate.getMonth() / 3) + 1} ${r.entryDate.getFullYear()}`;
      qMap.set(q, (qMap.get(q) || 0) + 1);
    });
    const best = [...qMap.entries()].sort((a, b) => b[1] - a[1])[0];
    return best && best[1] >= 2 ? best : null;
  }, [rows]);

  if (!rows.length) return null;

  /* ══════════════════════════════════════════════
     GANTT VIEW
  ══════════════════════════════════════════════ */
  const GanttView = () => (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 560 }}>

        {/* Year band header */}
        <div className="relative flex mb-1" style={{ marginLeft: 148, marginRight: 108, height: 22 }}>
          {yearBands.map(b => (
            <div key={b.year}
              className="absolute flex items-center justify-center text-xs font-semibold"
              style={{
                left: `${b.startPct}%`,
                width: `${b.endPct - b.startPct}%`,
                height: '100%',
                color: 'var(--text-lo)',
                borderLeft: b.startPct > 0 ? '1px dashed var(--border)' : 'none',
                fontSize: 10,
                opacity: 0.7,
              }}>
              {b.endPct - b.startPct > 6 ? b.year : ''}
            </div>
          ))}
        </div>

        {/* Rows */}
        <div className="space-y-1.5">
          {sorted.map(row => {
            const pal       = retPalette(row.ret);
            const sc        = sectorColor(row.sector);
            const barStart  = ((row.entryDate.getTime() - minTs) / span) * 100;
            const barWidth  = Math.max(((today.getTime() - row.entryDate.getTime()) / span) * 100, 1);
            const isHovered = hoverId === row.id;
            const holdLabel = row.monthsHeld >= 12
              ? `${Math.floor(row.monthsHeld / 12)}y${row.monthsHeld % 12 > 0 ? ` ${row.monthsHeld % 12}m` : ''}`
              : `${row.monthsHeld}m`;

            return (
              <div key={row.id} className="flex items-center gap-2"
                onMouseEnter={() => setHoverId(row.id)}
                onMouseLeave={() => setHoverId(null)}>

                {/* Stock label */}
                <div className="flex items-center gap-1.5 shrink-0" style={{ width: 144 }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sc }} />
                  <span className="text-xs font-medium truncate"
                    style={{ color: isHovered ? 'var(--text-hi)' : 'var(--text-mid)' }}>
                    {row.name}
                  </span>
                </div>

                {/* Bar track */}
                <div className="flex-1 relative" style={{ height: 28 }}>
                  {/* Year band shading */}
                  {yearBands.map((b, bi) => (
                    <div key={b.year} className="absolute inset-y-0 rounded"
                      style={{
                        left: `${b.startPct}%`,
                        width: `${b.endPct - b.startPct}%`,
                        background: bi % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                      }} />
                  ))}

                  {/* Track */}
                  <div className="absolute inset-0 rounded-full"
                    style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }} />

                  {/* Holding bar */}
                  <div className="absolute rounded-full transition-opacity"
                    style={{
                      left:   `${barStart}%`,
                      width:  `${barWidth}%`,
                      top: 3, bottom: 3,
                      background: pal.bar,
                      border: `1px solid ${pal.border}55`,
                      opacity: isHovered ? 1 : 0.8,
                      boxShadow: isHovered ? `0 0 8px ${pal.border}44` : 'none',
                    }}>
                    {/* Duration label inside bar */}
                    {barWidth > 12 && (
                      <span className="absolute inset-0 flex items-center justify-center text-white/70 font-medium pointer-events-none"
                        style={{ fontSize: 9 }}>
                        {holdLabel}
                      </span>
                    )}
                  </div>

                  {/* Buy-event tick marks */}
                  {row.buys.map((d, bi) => {
                    const tPct = ((d.getTime() - minTs) / span) * 100;
                    return (
                      <div key={bi} className="absolute"
                        style={{ left: `calc(${tPct}% - 1px)`, top: 2, width: 2, bottom: 2, background: 'rgba(255,255,255,0.6)', borderRadius: 1, zIndex: 3 }}
                        title={`Buy ${fmtDate(d, true)}`} />
                    );
                  })}

                  {/* Hover detail card */}
                  {isHovered && (
                    <div className="absolute z-50 rounded-xl shadow-2xl text-xs"
                      style={{
                        top: 34, left: `${Math.min(Math.max(barStart + barWidth / 2, 15), 70)}%`,
                        transform: 'translateX(-50%)',
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        minWidth: 200, padding: '10px 12px',
                        pointerEvents: 'none',
                      }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: sc }} />
                        <span className="font-bold text-hi">{row.name}</span>
                      </div>
                      {row.sector && <p className="text-lo mb-2" style={{ fontSize: 10 }}>{row.sector}</p>}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1"
                        style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                        <span className="text-lo">Entry</span>
                        <span className="font-semibold text-hi">{fmtDate(row.entryDate, true)}</span>
                        <span className="text-lo">Held</span>
                        <span className="font-semibold text-hi">{holdLabel}</span>
                        <span className="text-lo">Buys</span>
                        <span className="font-semibold text-hi">{row.buys.length || '–'}</span>
                        <span className="text-lo">Invested</span>
                        <span className="font-semibold text-hi">{fmtAmt(row.invested)}</span>
                        <span className="text-lo">Return</span>
                        <span className="font-bold" style={{ color: pal.text }}>
                          {row.ret >= 0 ? '+' : ''}{row.ret.toFixed(1)}%
                        </span>
                        <span className="text-lo">P&L</span>
                        <span className="font-bold" style={{ color: pal.text }}>
                          {row.pl >= 0 ? '+' : ''}{fmtAmt(row.pl)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Return badge */}
                <div className="shrink-0 rounded-lg px-2 py-1 text-center" style={{ width: 100, background: pal.badge, border: `1px solid ${pal.border}33` }}>
                  <p className="text-xs font-bold leading-tight" style={{ color: pal.text }}>
                    {row.ret >= 0 ? '+' : ''}{row.ret.toFixed(1)}%
                  </p>
                  <p className="leading-tight" style={{ fontSize: 10, color: pal.text, opacity: 0.75 }}>
                    {row.pl >= 0 ? '+' : ''}{fmtAmt(row.pl)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom date axis */}
        <div className="relative mt-2" style={{ marginLeft: 148, marginRight: 108 }}>
          <div className="w-full" style={{ height: 1, background: 'var(--border)' }} />
          {yearBands.map(b => (
            <div key={b.year} className="absolute"
              style={{ left: `${b.startPct}%`, top: 1, width: 1, height: 5, background: 'var(--border)' }} />
          ))}
        </div>
      </div>
    </div>
  );

  /* ══════════════════════════════════════════════
     CARDS VIEW
  ══════════════════════════════════════════════ */
  const CardsView = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {sorted.map((row, idx) => {
        const pal = retPalette(row.ret);
        const sc  = sectorColor(row.sector);
        const holdLabel = row.monthsHeld >= 12
          ? `${Math.floor(row.monthsHeld / 12)}y${row.monthsHeld % 12 > 0 ? ` ${row.monthsHeld % 12}m` : ''}`
          : `${row.monthsHeld}m`;
        const maxMonths = Math.max(...rows.map(r => r.monthsHeld));
        const barW = maxMonths > 0 ? (row.monthsHeld / maxMonths) * 100 : 100;

        return (
          <div key={row.id}
            className="rounded-xl overflow-hidden transition-all"
            style={{
              background: 'var(--bg-card-alt)',
              border: `1px solid var(--border)`,
              borderLeft: `3px solid ${pal.border}`,
            }}>
            {/* Card header */}
            <div className="flex items-start justify-between px-4 pt-3 pb-2">
              <div className="min-w-0 flex-1">
                {/* Rank + name */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-lo font-medium shrink-0">#{idx + 1}</span>
                  <p className="text-sm font-bold text-hi truncate">{row.name}</p>
                </div>
                {/* Sector dot + label */}
                {row.sector && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sc }} />
                    <span className="text-lo truncate" style={{ fontSize: 10 }}>{row.sector}</span>
                  </div>
                )}
              </div>
              {/* Return badge */}
              <div className="shrink-0 ml-2 rounded-lg px-2 py-1 text-center" style={{ background: pal.badge }}>
                <p className="text-sm font-bold" style={{ color: pal.text }}>
                  {row.ret >= 0 ? '+' : ''}{row.ret.toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'var(--border)', margin: '0 16px' }} />

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-0 px-4 py-2">
              {[
                { label: 'Entry',    value: fmtDate(row.entryDate, true) },
                { label: 'Held',     value: holdLabel },
                { label: 'Buys',     value: row.buys.length > 0 ? `${row.buys.length}×` : '–' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-lo" style={{ fontSize: 9 }}>{s.label}</p>
                  <p className="text-xs font-semibold text-hi mt-0.5">{s.value}</p>
                </div>
              ))}
            </div>

            {/* P&L row */}
            <div className="flex items-center justify-between px-4 pb-2">
              <span className="text-lo" style={{ fontSize: 10 }}>Invested: {fmtAmt(row.invested)}</span>
              <span className="text-xs font-bold" style={{ color: pal.text }}>
                {row.pl >= 0 ? '+' : ''}{fmtAmt(row.pl)}
              </span>
            </div>

            {/* Holding period bar */}
            <div className="px-4 pb-3">
              <div className="w-full rounded-full overflow-hidden" style={{ height: 5, background: 'var(--border)' }}>
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${barW}%`, background: pal.bar }} />
              </div>
              <div className="flex justify-between mt-1" style={{ fontSize: 9 }}>
                <span className="text-lo">{fmtDate(row.entryDate, true)}</span>
                <span className="text-lo">Today</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  /* ══════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════ */
  return (
    <div className="card p-5 space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-hi">Portfolio Entry Timeline</h3>
          <p className="text-xs text-lo mt-0.5">
            When you entered each position · Accumulations · Hold duration · P&L
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* View toggle */}
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-card-alt)' }}>
            {([
              { k: 'gantt', l: '▬ Gantt' },
              { k: 'cards', l: '⊞ Cards' },
            ] as const).map(({ k, l }) => (
              <button key={k} onClick={() => setView(k)}
                className="text-xs px-3 py-1 rounded-md font-medium transition-all"
                style={{
                  background: view === k ? 'var(--brand)' : 'transparent',
                  color: view === k ? '#fff' : 'var(--text-lo)',
                }}>
                {l}
              </button>
            ))}
          </div>
          {/* Sort */}
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-card-alt)' }}>
            {([
              { k: 'entry',   l: 'Date' },
              { k: 'holding', l: 'Hold' },
              { k: 'return',  l: 'Return' },
              { k: 'pl',      l: 'P&L' },
            ] as const).map(({ k, l }) => (
              <button key={k} onClick={() => setSort(k)}
                className="text-xs px-2.5 py-1 rounded-md font-medium transition-all"
                style={{
                  background: sort === k ? 'var(--bg-card)' : 'transparent',
                  color: sort === k ? 'var(--text-hi)' : 'var(--text-lo)',
                }}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Summary strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: '⏱', label: 'Avg Hold',        value: `${avgMonths}m`,              sub: `${rows.length} positions`, color: 'var(--text-hi)' },
          { icon: '🌱', label: 'Oldest Entry',    value: oldest?.name ?? '–',          sub: oldest ? fmtDate(oldest.entryDate, true) : '',  color: '#a78bfa' },
          { icon: '🆕', label: 'Latest Entry',    value: newest?.name ?? '–',          sub: newest ? fmtDate(newest.entryDate, true) : '',  color: '#38bdf8' },
          { icon: '🏆', label: 'Best Performer',  value: bestRet ? `+${bestRet.ret.toFixed(1)}%` : '–', sub: bestRet?.name ?? '', color: '#4ade80' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            <span className="text-xl shrink-0">{s.icon}</span>
            <div className="min-w-0">
              <p className="text-xs text-lo">{s.label}</p>
              <p className="text-sm font-bold truncate" style={{ color: s.color }}>{s.value}</p>
              {s.sub && <p className="text-xs text-lo truncate">{s.sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* ── Return legend ── */}
      <div className="flex flex-wrap gap-3 text-xs text-lo">
        {[
          { label: '≥ +50%',    color: '#4ade80' },
          { label: '+20–50%',   color: '#86efac' },
          { label: '0–20%',     color: '#bbf7d0' },
          { label: '< 0%',      color: '#f87171' },
        ].map(c => (
          <span key={c.label} className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded inline-block" style={{ background: c.color, opacity: 0.8 }} />
            {c.label}
          </span>
        ))}
        {view === 'gantt' && (
          <span className="flex items-center gap-1.5 ml-2">
            <span className="inline-block" style={{ width: 2, height: 10, background: 'rgba(255,255,255,0.6)', borderRadius: 1 }} />
            Buy event
          </span>
        )}
      </div>

      {/* ── Chart area ── */}
      {view === 'gantt' ? <GanttView /> : <CardsView />}

      {/* ── Entry clustering insight ── */}
      {clusterInsight && (
        <div className="flex items-start gap-3 rounded-xl p-3"
          style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
          <span className="text-lg shrink-0">📅</span>
          <div>
            <p className="text-xs font-semibold text-mid">Entry Clustering Detected</p>
            <p className="text-xs text-lo mt-0.5 leading-relaxed">
              You opened <span className="text-hi font-semibold">{clusterInsight[1]} positions</span> in{' '}
              <span className="text-hi font-semibold">{clusterInsight[0]}</span> — your most active quarter.{' '}
              {clusterInsight[1] >= 5
                ? 'Heavy clustering may indicate FOMO-driven buying. Diversifying entry timing can reduce timing risk.'
                : 'Moderate clustering suggests deliberate accumulation during that period.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
