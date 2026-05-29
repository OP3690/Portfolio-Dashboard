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
  const pct    = ret.returnPercent;
  const accentBg = cellBg(pct);
  const isUp   = pct >= 0;
  const hasDiv = div != null && div > 0;
  const hasInv = inv != null && inv.investments > 0;
  const retClr = isUp ? '#4ade80' : '#f87171';
  const quarter = `Q${Math.floor(mi / 3) + 1}`;

  /* Smart position: keep tooltip inside viewport */
  const tw = 264;
  const th = hasDiv || hasInv ? 260 : 180;
  const left = typeof window !== 'undefined'
    ? (cx + tw + 20 > window.innerWidth ? cx - tw - 12 : cx + 16)
    : cx + 16;
  const top = typeof window !== 'undefined'
    ? Math.min(cy - 30, window.innerHeight - th - 12)
    : cy - 30;

  /* Return bar: pct mapped from -15..+15 → 0..100% width, pivot at 50% */
  const barPct    = Math.min(100, (Math.abs(pct) / 15) * 50);
  const barLeft   = isUp ? 50 : Math.max(0, 50 - barPct);
  const barWidth  = barPct;

  return (
    <div className="fixed z-[9999] pointer-events-none" style={{ left, top, width: tw }}>
      <div className="rounded-2xl overflow-hidden"
        style={{
          background: '#0d1320',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: `0 24px 72px rgba(0,0,0,0.8), 0 6px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)`,
        }}>

        {/* ── Coloured accent strip ── */}
        <div style={{ height: 5, background: `linear-gradient(90deg, ${accentBg}cc, ${accentBg})` }} />

        {/* ── Header ── */}
        <div className="px-4 pt-4 pb-3">
          {/* Month + quarter row */}
          <div className="flex items-center gap-2 mb-3">
            <span style={{ fontSize: 13, lineHeight: 1 }}>📅</span>
            <span className="font-black" style={{ fontSize: 13, color: '#e2e8f0', letterSpacing: '-0.01em' }}>
              {MONTHS[mi]} {year}
            </span>
            <span className="font-bold px-2 py-0.5 rounded-md"
              style={{ fontSize: 10, background: 'rgba(255,255,255,0.07)', color: '#64748b', letterSpacing: '0.04em' }}>
              {quarter}
            </span>
            {/* Indicator badges */}
            <div className="ml-auto flex items-center gap-1">
              {hasInv && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-bold"
                  style={{ fontSize: 10, background: 'rgba(148,163,184,0.12)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)' }}>
                  💼
                </span>
              )}
              {hasDiv && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-bold"
                  style={{ fontSize: 10, background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
                  💛
                </span>
              )}
            </div>
          </div>

          {/* Big return % */}
          <div className="flex items-end gap-3 mb-3">
            <p className="font-black leading-none"
              style={{
                fontSize: 38, letterSpacing: '-0.04em', color: retClr,
                textShadow: isUp ? '0 0 28px rgba(74,222,128,0.4)' : '0 0 28px rgba(248,113,113,0.4)',
              }}>
              {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
            </p>
            <div className="pb-1">
              <span style={{ fontSize: 22 }}>{isUp ? '📈' : '📉'}</span>
            </div>
          </div>

          {/* Return intensity bar */}
          <div className="relative h-1.5 rounded-full overflow-hidden mb-1"
            style={{ background: 'rgba(255,255,255,0.07)' }}>
            {/* pivot line at center */}
            <div className="absolute top-0 bottom-0 w-px"
              style={{ left: '50%', background: 'rgba(255,255,255,0.2)' }} />
            {/* fill */}
            <div className="absolute top-0 bottom-0 rounded-full transition-all duration-500"
              style={{
                left: `${barLeft}%`,
                width: `${barWidth}%`,
                background: `linear-gradient(90deg, ${retClr}80, ${retClr})`,
              }} />
          </div>
          <div className="flex justify-between">
            <span style={{ fontSize: 8, color: '#475569', fontWeight: 600 }}>−15%</span>
            <span style={{ fontSize: 8, color: '#475569', fontWeight: 600 }}>0</span>
            <span style={{ fontSize: 8, color: '#475569', fontWeight: 600 }}>+15%</span>
          </div>
        </div>

        {/* ── Metrics ── */}
        <div className="px-4 pb-4 space-y-2"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>

          {/* Return ₹ */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center font-black"
                style={{ background: `${retClr}18`, color: retClr, fontSize: 12 }}>
                {isUp ? '↑' : '↓'}
              </div>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Return ₹</span>
            </div>
            <span className="font-black px-2.5 py-1 rounded-xl"
              style={{ fontSize: 12, color: retClr, background: `${retClr}15`, border: `1px solid ${retClr}25` }}>
              {isUp ? '+' : ''}{formatCurrency(ret.returnAmount)}
            </span>
          </div>

          {/* Dividend */}
          {hasDiv && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(251,191,36,0.15)', fontSize: 13 }}>
                  💛
                </div>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Dividend</span>
              </div>
              <span className="font-black px-2.5 py-1 rounded-xl"
                style={{ fontSize: 12, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.22)' }}>
                +{formatCurrency(div!)}
              </span>
            </div>
          )}

          {/* Invested */}
          {hasInv && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(148,163,184,0.12)', fontSize: 13 }}>
                  💼
                </div>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Invested</span>
              </div>
              <span className="font-black px-2.5 py-1 rounded-xl"
                style={{ fontSize: 12, color: '#94a3b8', background: 'rgba(148,163,184,0.12)', border: '1px solid rgba(148,163,184,0.2)' }}>
                {formatCurrency(inv!.investments)}
              </span>
            </div>
          )}

          {/* Net total footer */}
          {hasDiv && (
            <div className="flex items-center justify-between gap-2 pt-2 mt-1"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center font-black"
                  style={{ background: 'rgba(196,181,253,0.12)', color: '#c4b5fd', fontSize: 11 }}>
                  Σ
                </div>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Total incl. div</span>
              </div>
              <span className="font-black px-2.5 py-1 rounded-xl"
                style={{ fontSize: 12, color: '#c4b5fd', background: 'rgba(196,181,253,0.1)', border: '1px solid rgba(196,181,253,0.2)' }}>
                {isUp ? '+' : ''}{formatCurrency(ret.returnAmount + div!)}
              </span>
            </div>
          )}
        </div>
      </div>
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
                              {(div || (inv && inv.investments > 0)) ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 2, lineHeight: 1 }}>
                                  {div ? <span style={{ fontSize: 8 }} title="Dividend received">💛</span> : null}
                                  {inv && inv.investments > 0 ? <span style={{ fontSize: 8 }} title="Invested this month">💼</span> : null}
                                </div>
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

        {/* ── Colour legend — spectrum bar ── */}
        <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border-sm)' }}>

          {/* Title row */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black uppercase tracking-widest"
              style={{ color: 'var(--text-lo)' }}>Return Scale</p>
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
              style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)' }}>
              <span style={{ fontSize: 13 }}>💛</span>
              <span className="text-[11px] font-bold" style={{ color: '#fbbf24' }}>Dividend received</span>
            </div>
          </div>

          {/* Zone labels above the bar */}
          <div className="flex items-center mb-2">
            {/* LOSS side — 3 segments */}
            <div className="flex items-center gap-1.5" style={{ flex: 3 }}>
              <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap"
                style={{ color: '#f87171' }}>◄ Loss</span>
              <div className="flex-1 h-px"
                style={{ background: 'linear-gradient(90deg,rgba(248,113,113,0.12),rgba(248,113,113,0.45))' }} />
            </div>
            {/* Centre divider */}
            <div className="mx-2 flex-shrink-0"
              style={{ width: 1, height: 14, background: 'var(--border-md)', borderRadius: 99 }} />
            {/* GAIN side — 4 segments */}
            <div className="flex items-center gap-1.5" style={{ flex: 4 }}>
              <div className="flex-1 h-px"
                style={{ background: 'linear-gradient(90deg,rgba(74,222,128,0.45),rgba(74,222,128,0.12))' }} />
              <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap"
                style={{ color: '#4ade80' }}>Gain ►</span>
            </div>
          </div>

          {/* Spectrum bar */}
          <div className="flex rounded-xl overflow-hidden"
            style={{ height: 38, border: '1px solid rgba(255,255,255,0.07)' }}>
            {[
              '#9f1239','#be123c','#f43f5e',
              '#bbf7d0',
              '#4ade80','#16a34a','#064e3b',
            ].map((color, i, arr) => (
              <div key={i} className="flex-1"
                style={{
                  background: color,
                  borderRight: i < arr.length - 1
                    ? '1px solid rgba(255,255,255,0.1)'
                    : 'none',
                }} />
            ))}
          </div>

          {/* Tick lines + labels */}
          <div className="flex mt-1">
            {[
              { label: '< −8%', c: '#fca5a5' },
              { label: '−4–8%', c: '#fca5a5' },
              { label: '−1–4%', c: '#fca5a5' },
              { label: '0–1%',  c: '#86efac' },
              { label: '1–3%',  c: '#86efac' },
              { label: '3–6%',  c: '#86efac' },
              { label: '> 6%',  c: '#86efac' },
            ].map(({ label, c }) => (
              <div key={label} className="flex-1 flex flex-col items-center gap-0.5">
                <div style={{ width: 1, height: 5, background: 'var(--border-md)', borderRadius: 1 }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: c, whiteSpace: 'nowrap' }}>
                  {label}
                </span>
              </div>
            ))}
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
