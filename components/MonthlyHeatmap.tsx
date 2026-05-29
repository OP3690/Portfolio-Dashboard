'use client';

import { useMemo, useState } from 'react';
import { formatCurrency } from '@/lib/utils';

/* ─── Types ─────────────────────────────────────────────── */
interface MonthlyReturn     { month: string; returnPercent: number; returnAmount: number }
interface MonthlyDividend   { month: string; amount: number }
interface MonthlyInvestment { month: string; investments: number; withdrawals: number }

interface Props {
  monthlyReturns:      MonthlyReturn[];
  monthlyDividends?:   MonthlyDividend[];
  monthlyInvestments?: MonthlyInvestment[];
}

interface TooltipState {
  ret:  MonthlyReturn;
  div?: number;
  inv?: MonthlyInvestment;
  year: number;
  mi:   number;
  cx:   number; // clientX
  cy:   number; // clientY
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* Parse "MMM-YY" → { year, mi 0-11 } */
function parse(m: string): { year: number; mi: number } | null {
  const d = m.match(/^([A-Za-z]{3})-(\d{2})$/);
  if (!d) return null;
  const mi   = MONTHS.findIndex(x => x.toLowerCase() === d[1].toLowerCase());
  const year = 2000 + parseInt(d[2], 10);
  return mi >= 0 ? { year, mi } : null;
}

/* Return % → cell background */
function cellBg(pct: number | undefined): string {
  if (pct === undefined) return 'transparent';
  if (pct <= -8)  return '#9f1239';
  if (pct <= -4)  return '#be123c';
  if (pct <= -1)  return '#f43f5e';
  if (pct <   0)  return '#fb7185';
  if (pct === 0)  return '#334155';
  if (pct <   1)  return '#bbf7d0';
  if (pct <   3)  return '#4ade80';
  if (pct <   6)  return '#16a34a';
  return                  '#064e3b';
}

/* Text colour for legibility on cell */
function cellText(pct: number | undefined): string {
  if (pct === undefined) return 'var(--text-lo)';
  if (pct >= -1 && pct < 1) return '#14532d';
  if (Math.abs(pct) >= 1)   return '#ffffff';
  return '#14532d';
}

/* Tooltip heading text colour against cell background */
function tipHeadText(pct: number): string {
  if (pct <= -1 || pct >= 3) return '#fff';
  return '#0f172a';
}

/* ── Fixed-position floating tooltip ─────────────────────── */
function HeatTooltip({ tip }: { tip: TooltipState }) {
  const { ret, div, inv, year, mi, cx, cy } = tip;
  const pct  = ret.returnPercent;
  const bg   = cellBg(pct);
  const isUp = pct >= 0;

  /* Smart position: keep 240px tooltip inside viewport */
  const tw = 240;
  const th = 180; // rough height
  const left = typeof window !== 'undefined'
    ? (cx + tw + 20 > window.innerWidth ? cx - tw - 12 : cx + 16)
    : cx + 16;
  const top  = typeof window !== 'undefined'
    ? Math.min(cy - 20, window.innerHeight - th - 12)
    : cy - 20;

  return (
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{ left, top, width: tw }}>

      {/* Card */}
      <div className="rounded-2xl overflow-hidden"
        style={{
          background: '#0d1117',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 4px 16px rgba(0,0,0,0.5)',
        }}>

        {/* Coloured header — matches the cell */}
        <div className="px-4 pt-3.5 pb-3" style={{ background: bg }}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-0.5"
                style={{ color: tipHeadText(pct), opacity: 0.75 }}>
                {MONTHS[mi]} {year}
              </p>
              <p className="font-black leading-none"
                style={{ fontSize: 26, letterSpacing: '-0.03em', color: '#fff',
                  textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
                {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
              </p>
            </div>
            {/* Signal dot */}
            <div className="w-8 h-8 rounded-xl flex items-center justify-center mt-0.5"
              style={{
                background: 'rgba(0,0,0,0.2)',
                fontSize: 16,
              }}>
              {div ? '💛' : isUp ? '📈' : '📉'}
            </div>
          </div>
        </div>

        {/* Details rows */}
        <div className="px-4 py-3 space-y-2.5">
          {/* Return ₹ */}
          <div className="flex items-center justify-between gap-3">
            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Return ₹</span>
            <span style={{
              fontSize: 13, fontWeight: 800,
              color: isUp ? '#4ade80' : '#f87171',
            }}>
              {isUp ? '+' : ''}{formatCurrency(ret.returnAmount)}
            </span>
          </div>

          {/* Dividend */}
          {div != null && (
            <div className="flex items-center justify-between gap-3">
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>💛 Dividend</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fbbf24' }}>
                +{formatCurrency(div)}
              </span>
            </div>
          )}

          {/* Investment */}
          {inv && inv.investments > 0 && (
            <div className="flex items-center justify-between gap-3">
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Invested</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#94a3b8' }}>
                {formatCurrency(inv.investments)}
              </span>
            </div>
          )}

          {/* Divider + combined */}
          {div != null && (
            <div className="pt-2 mt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between gap-3">
                <span style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>Total incl. dividend</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#c4b5fd' }}>
                  {isUp ? '+' : ''}{formatCurrency(ret.returnAmount + div)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Arrow (simple triangle) */}
      <div style={{
        position: 'absolute',
        top: 28,
        left: (left === cx + 16) ? -6 : tw + 2,
        width: 8, height: 8,
        background: bg,
        transform: 'rotate(45deg)',
        borderLeft: (left !== cx + 16) ? '1px solid rgba(255,255,255,0.1)' : 'none',
        borderBottom: (left !== cx + 16) ? '1px solid rgba(255,255,255,0.1)' : 'none',
        borderRight: (left === cx + 16) ? '1px solid rgba(255,255,255,0.1)' : 'none',
        borderTop: (left === cx + 16) ? '1px solid rgba(255,255,255,0.1)' : 'none',
      }} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

export default function MonthlyHeatmap({
  monthlyReturns,
  monthlyDividends  = [],
  monthlyInvestments = [],
}: Props) {
  const [mode,    setMode]    = useState<'pct' | 'amt'>('pct');
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  /* ── Build lookup maps ── */
  const returnMap = useMemo(() => {
    const m = new Map<string, MonthlyReturn>();
    monthlyReturns.forEach(r => { const p = parse(r.month); if (p) m.set(`${p.year}-${p.mi}`, r); });
    return m;
  }, [monthlyReturns]);

  const divMap = useMemo(() => {
    const m = new Map<string, number>();
    monthlyDividends.forEach(d => { const p = parse(d.month); if (p) m.set(`${p.year}-${p.mi}`, d.amount); });
    return m;
  }, [monthlyDividends]);

  const invMap = useMemo(() => {
    const m = new Map<string, MonthlyInvestment>();
    monthlyInvestments.forEach(d => { const p = parse(d.month); if (p) m.set(`${p.year}-${p.mi}`, d); });
    return m;
  }, [monthlyInvestments]);

  /* ── Derive years + stats ── */
  const { years, stats, yearlyTotals, monthlyAvg } = useMemo(() => {
    if (!monthlyReturns.length) return { years: [], stats: null, yearlyTotals: {}, monthlyAvg: [] };

    const parsed = monthlyReturns.map(r => ({ ...r, p: parse(r.month) })).filter(r => r.p);
    const allYears = [...new Set(parsed.map(r => r.p!.year))].sort();

    const yearlyTotals: Record<number, { amount: number; months: number; positive: number }> = {};
    parsed.forEach(r => {
      const y = r.p!.year;
      if (!yearlyTotals[y]) yearlyTotals[y] = { amount: 0, months: 0, positive: 0 };
      yearlyTotals[y].amount  += r.returnAmount;
      yearlyTotals[y].months  += 1;
      if (r.returnPercent > 0) yearlyTotals[y].positive += 1;
    });

    const monthlyAvg = MONTHS.map((_, mi) => {
      const cells = parsed.filter(r => r.p!.mi === mi);
      if (!cells.length) return null;
      return +(cells.reduce((s, c) => s + c.returnPercent, 0) / cells.length).toFixed(2);
    });

    const allRets  = parsed.map(r => r.returnPercent);
    const positive = allRets.filter(r => r > 0);
    const best     = parsed.reduce((a, b) => b.returnPercent > a.returnPercent ? b : a);
    const worst    = parsed.reduce((a, b) => b.returnPercent < a.returnPercent ? b : a);
    const totalDiv = monthlyDividends.reduce((s, d) => s + d.amount, 0);

    return {
      years: allYears,
      yearlyTotals,
      monthlyAvg,
      stats: {
        total: allRets.length,
        positiveCount: positive.length,
        negativeCount: allRets.filter(r => r < 0).length,
        winRate:       +((positive.length / allRets.length) * 100).toFixed(1),
        avgReturn:     +(allRets.reduce((s,v) => s+v, 0) / allRets.length).toFixed(2),
        best, worst,
        totalDiv,
        totalReturn:   parsed.reduce((s,r) => s + r.returnAmount, 0),
        streak: (() => {
          const sorted = [...parsed].sort((a,b) => (a.p!.year*12+a.p!.mi) - (b.p!.year*12+b.p!.mi));
          let cur = 0, max = 0, curType = '';
          sorted.forEach(r => {
            const t = r.returnPercent > 0 ? '+' : '-';
            if (t === curType) { cur++; max = Math.max(max, cur); } else { cur = 1; curType = t; }
          });
          return max;
        })(),
      },
    };
  }, [monthlyReturns, monthlyDividends]);

  if (!years.length || !stats) return null;

  const fmtCell = (ret: MonthlyReturn) => {
    if (mode === 'pct') {
      const p = ret.returnPercent;
      return `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;
    }
    const a = Math.abs(ret.returnAmount);
    const s = ret.returnPercent < 0 ? '−' : '+';
    if (a >= 100_000) return `${s}₹${(a/100_000).toFixed(1)}L`;
    if (a >= 1_000)   return `${s}₹${(a/1_000).toFixed(0)}k`;
    return `${s}₹${a.toFixed(0)}`;
  };

  return (
    <div className="card animate-fadeIn overflow-hidden" onMouseLeave={() => setTooltip(null)}>

      {/* ── Fixed tooltip (outside overflow containers) ── */}
      {tooltip && <HeatTooltip tip={tooltip} />}

      {/* ── Header ── */}
      <div className="px-6 pt-5 pb-4"
        style={{
          borderBottom: '1px solid var(--border-sm)',
          background: 'linear-gradient(135deg,rgba(16,185,129,0.06) 0%,rgba(99,102,241,0.05) 100%)',
        }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-1 h-6 rounded-full flex-shrink-0"
                style={{ background: 'linear-gradient(180deg,#4ade80 0%,#e11d48 100%)' }} />
              <h2 className="text-[15px] font-black tracking-tight" style={{ color: 'var(--text-hi)' }}>
                Monthly Performance Heatmap
              </h2>
              <span className="hidden sm:inline text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' }}>
                {years.length} Years
              </span>
            </div>
            <p className="text-[11px] ml-3.5" style={{ color: 'var(--text-lo)' }}>
              Portfolio return month-by-month · 💛 = dividend received · hover for details
            </p>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-1 p-1 rounded-xl"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
            {([['pct','% Return'], ['amt','₹ Amount']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setMode(v)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                style={{
                  background: mode === v ? 'var(--bg-card)' : 'transparent',
                  color:      mode === v ? 'var(--brand)'   : 'var(--text-lo)',
                  boxShadow:  mode === v ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                }}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-6 pt-5 pb-6">

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {[
            {
              label: 'Win Rate',
              val:   `${stats.winRate}%`,
              color: stats.winRate >= 60 ? '#4ade80' : stats.winRate >= 50 ? '#fbbf24' : '#f87171',
              sub:   `${stats.positiveCount} green months`,
              icon:  '🎯',
            },
            {
              label: 'Avg / Month',
              val:   `${stats.avgReturn >= 0 ? '+' : ''}${stats.avgReturn}%`,
              color: stats.avgReturn >= 0 ? '#4ade80' : '#f87171',
              sub:   `over ${stats.total} months`,
              icon:  '📊',
            },
            {
              label: 'Best Month',
              val:   `+${stats.best.returnPercent.toFixed(1)}%`,
              color: '#10b981',
              sub:   stats.best.month,
              icon:  '🚀',
            },
            {
              label: 'Worst Month',
              val:   `${stats.worst.returnPercent.toFixed(1)}%`,
              color: '#f43f5e',
              sub:   stats.worst.month,
              icon:  '📉',
            },
            {
              label: 'Total Returns',
              val:   `${stats.totalReturn >= 0 ? '+' : ''}${formatCurrency(stats.totalReturn)}`,
              color: stats.totalReturn >= 0 ? '#4ade80' : '#f87171',
              sub:   'cumulative P&L',
              icon:  '💰',
            },
            {
              label: 'Total Dividends',
              val:   formatCurrency(stats.totalDiv),
              color: '#fbbf24',
              sub:   `across ${monthlyDividends.length} months`,
              icon:  '💛',
            },
          ].map(({ label, val, color, sub, icon }) => (
            <div key={label} className="rounded-xl p-3.5 space-y-1"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
              <div className="flex items-center justify-between gap-1">
                <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-lo)' }}>{label}</p>
                <span style={{ fontSize: 12 }}>{icon}</span>
              </div>
              <p className="text-sm font-black leading-none" style={{ color }}>{val}</p>
              <p className="text-[9px]" style={{ color: 'var(--text-lo)' }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* ── Heatmap grid ── */}
        <div className="overflow-x-auto" style={{ overflowY: 'visible' }}>
          <div style={{ minWidth: 660 }}>

            {/* Month headers */}
            <div className="flex mb-2 items-center">
              <div style={{ width: 52, flexShrink: 0 }} />
              {MONTHS.map(m => (
                <div key={m} className="flex-1 text-center"
                  style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-lo)', letterSpacing: '0.06em', textTransform: 'uppercase', paddingBottom: 4 }}>
                  {m}
                </div>
              ))}
              <div style={{ width: 72, flexShrink: 0, fontSize: 10, fontWeight: 700, color: 'var(--text-lo)', letterSpacing: '0.06em', textAlign: 'center', textTransform: 'uppercase' }}>
                Total
              </div>
            </div>

            {/* Year rows */}
            {years.map(year => {
              const yt = yearlyTotals[year];
              return (
                <div key={year} className="flex mb-1.5 items-center">

                  {/* Year label */}
                  <div className="text-right pr-2.5 flex-shrink-0 font-bold"
                    style={{ width: 52, fontSize: 12, color: 'var(--text-lo)' }}>
                    {year}
                  </div>

                  {/* Month cells */}
                  {MONTHS.map((_, mi) => {
                    const key = `${year}-${mi}`;
                    const ret = returnMap.get(key);
                    const div = divMap.get(key);
                    const inv = invMap.get(key);
                    const pct = ret?.returnPercent;
                    const isHov = tooltip?.year === year && tooltip?.mi === mi;

                    return (
                      <div key={mi} className="flex-1 mx-[1.5px]"
                        onMouseEnter={e => ret
                          ? setTooltip({ ret, div, inv, year, mi, cx: e.clientX, cy: e.clientY })
                          : setTooltip(null)
                        }
                        onMouseMove={e => tooltip && setTooltip(prev => prev ? { ...prev, cx: e.clientX, cy: e.clientY } : null)}
                        onMouseLeave={() => setTooltip(null)}>

                        <div className="rounded-lg flex flex-col items-center justify-center transition-all duration-150 select-none"
                          style={{
                            height: 46,
                            background:  pct !== undefined ? cellBg(pct) : 'var(--bg-raised)',
                            border:      isHov
                              ? '1.5px solid rgba(255,255,255,0.55)'
                              : `1px solid ${pct !== undefined ? 'rgba(0,0,0,0.18)' : 'var(--border-sm)'}`,
                            cursor:      pct !== undefined ? 'pointer' : 'default',
                            transform:   isHov ? 'scale(1.1)' : 'scale(1)',
                            zIndex:      isHov ? 10 : 1,
                            position:    'relative',
                            boxShadow:   isHov ? '0 6px 18px rgba(0,0,0,0.5)' : 'none',
                          }}>

                          {pct !== undefined ? (
                            <>
                              <span className="leading-none font-black"
                                style={{ fontSize: 10, color: cellText(pct) }}>
                                {fmtCell(ret!)}
                              </span>
                              {div ? (
                                <span style={{ fontSize: 8, lineHeight: 1, marginTop: 2 }} title="Dividend received">💛</span>
                              ) : null}
                            </>
                          ) : (
                            <span style={{ fontSize: 10, color: 'var(--border-md)' }}>—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Year total */}
                  <div className="rounded-xl flex flex-col items-center justify-center ml-1.5 flex-shrink-0"
                    style={{
                      width: 72, height: 46,
                      background: yt
                        ? (yt.amount >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)')
                        : 'var(--bg-raised)',
                      border: yt
                        ? `1px solid ${yt.amount >= 0 ? 'rgba(16,185,129,0.35)' : 'rgba(244,63,94,0.35)'}`
                        : '1px solid var(--border-sm)',
                    }}>
                    {yt ? (
                      <>
                        <span className="font-black leading-none"
                          style={{ fontSize: 10, color: yt.amount >= 0 ? '#4ade80' : '#f87171' }}>
                          {yt.amount >= 0 ? '+' : '−'}₹{Math.abs(yt.amount) >= 100_000
                            ? `${(Math.abs(yt.amount)/100_000).toFixed(1)}L`
                            : Math.abs(yt.amount) >= 1_000
                            ? `${(Math.abs(yt.amount)/1_000).toFixed(0)}k`
                            : Math.abs(yt.amount).toFixed(0)}
                        </span>
                        <span className="mt-0.5" style={{ fontSize: 9, color: 'var(--text-lo)' }}>
                          {yt.positive}/{yt.months} ✓
                        </span>
                      </>
                    ) : (
                      <span style={{ fontSize: 10, color: 'var(--border-md)' }}>—</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Average row */}
            <div className="flex mt-3 pt-3 items-center" style={{ borderTop: '1px solid var(--border-sm)' }}>
              <div className="text-right pr-2.5 flex-shrink-0 font-bold"
                style={{ width: 52, fontSize: 10, color: 'var(--text-lo)', lineHeight: 1.2 }}>
                Avg
              </div>
              {monthlyAvg.map((avg, mi) => (
                <div key={mi} className="flex-1 mx-[1.5px]">
                  <div className="rounded-lg flex items-center justify-center"
                    style={{
                      height: 30,
                      background: avg !== null ? cellBg(avg) : 'var(--bg-raised)',
                      border: `1px solid ${avg !== null ? 'rgba(0,0,0,0.15)' : 'var(--border-sm)'}`,
                    }}>
                    {avg !== null ? (
                      <span className="font-black leading-none"
                        style={{ fontSize: 9, color: cellText(avg) }}>
                        {avg >= 0 ? '+' : ''}{avg.toFixed(1)}%
                      </span>
                    ) : (
                      <span style={{ color: 'var(--border-md)', fontSize: 8 }}>—</span>
                    )}
                  </div>
                </div>
              ))}
              <div style={{ width: 72, flexShrink: 0 }} />
            </div>

            {/* Trophy row */}
            <div className="flex" style={{ paddingLeft: 52 }}>
              {MONTHS.map((_, mi) => {
                const avg  = monthlyAvg[mi];
                const best = avg !== null && monthlyAvg.every(a => a === null || a <= avg);
                return (
                  <div key={mi} className="flex-1 mx-[1.5px] text-center mt-0.5" style={{ fontSize: 9 }}>
                    {best && <span title="Best avg month">🏆</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Colour legend ── */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-5 pt-4"
          style={{ borderTop: '1px solid var(--border-sm)' }}>
          <span className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: 'var(--text-lo)' }}>Return Scale</span>
          {[
            { label: '< −8%',  color: '#9f1239', text: '#fff' },
            { label: '−4–8%',  color: '#be123c', text: '#fff' },
            { label: '−1–4%',  color: '#f43f5e', text: '#fff' },
            { label: '0–1%',   color: '#bbf7d0', text: '#14532d' },
            { label: '1–3%',   color: '#4ade80', text: '#14532d' },
            { label: '3–6%',   color: '#16a34a', text: '#fff' },
            { label: '> 6%',   color: '#064e3b', text: '#fff' },
          ].map(({ label, color, text }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="rounded flex items-center justify-center flex-shrink-0"
                style={{ width: 28, height: 16, background: color }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: text }}>{label}</span>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ml-1">
            <span style={{ fontSize: 12 }}>💛</span>
            <span className="text-[10px]" style={{ color: 'var(--text-lo)' }}>Dividend received</span>
          </div>
        </div>

        {/* ── Seasonality insight ── */}
        <div className="mt-4 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-sm)' }}>
          <div className="px-4 py-2.5"
            style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-sm)' }}>
            <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--text-lo)' }}>
              💡 Seasonality Insight
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x"
            style={{ borderColor: 'var(--border-sm)' }}>
            {(() => {
              const valid = monthlyAvg
                .map((a, mi) => ({ mi, avg: a }))
                .filter(x => x.avg !== null) as { mi: number; avg: number }[];
              if (!valid.length) return null;
              const best3     = [...valid].sort((a,b) => b.avg - a.avg).slice(0, 3);
              const worst3    = [...valid].sort((a,b) => a.avg - b.avg).slice(0, 3);
              const consistent = valid.filter(v => v.avg > 0).sort((a,b) => b.avg - a.avg).slice(0,3);
              return [
                {
                  emoji: '🌟', title: 'Strongest Months', color: '#4ade80',
                  items: best3.map(x => ({ label: MONTHS[x.mi], val: `+${x.avg.toFixed(1)}%`, c: '#4ade80' })),
                },
                {
                  emoji: '⚠️', title: 'Weakest Months', color: '#f87171',
                  items: worst3.map(x => ({ label: MONTHS[x.mi], val: `${x.avg.toFixed(1)}%`, c: '#f87171' })),
                },
                {
                  emoji: '✅', title: 'Consistently Positive', color: '#a5b4fc',
                  items: consistent.length
                    ? consistent.map(x => ({ label: MONTHS[x.mi], val: `avg +${x.avg.toFixed(1)}%`, c: '#a5b4fc' }))
                    : [{ label: 'No consistently positive months yet', val: '', c: 'var(--text-lo)' }],
                },
              ].map(({ emoji, title, color, items }) => (
                <div key={title} className="px-4 py-4">
                  <p className="text-[11px] font-black mb-3 flex items-center gap-1.5" style={{ color }}>
                    <span>{emoji}</span> {title}
                  </p>
                  <div className="space-y-2">
                    {items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold" style={{ color: 'var(--text-hi)' }}>{item.label}</span>
                        {item.val && (
                          <span className="text-[11px] font-black" style={{ color: item.c }}>{item.val}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>

      </div>
    </div>
  );
}
