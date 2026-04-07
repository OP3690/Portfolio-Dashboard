'use client';

import { useMemo, useState } from 'react';
import { formatCurrency } from '@/lib/utils';

/* ─── Types ─────────────────────────────────────────────── */
interface MonthlyReturn     { month: string; returnPercent: number; returnAmount: number }
interface MonthlyDividend   { month: string; amount: number }
interface MonthlyInvestment { month: string; investments: number; withdrawals: number }

interface Props {
  monthlyReturns:     MonthlyReturn[];
  monthlyDividends?:  MonthlyDividend[];
  monthlyInvestments?: MonthlyInvestment[];
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* Parse "MMM-YY" → { year, monthIdx 0-11 } */
function parse(m: string): { year: number; mi: number } | null {
  const d = m.match(/^([A-Za-z]{3})-(\d{2})$/);
  if (!d) return null;
  const mi   = MONTHS.findIndex(x => x.toLowerCase() === d[1].toLowerCase());
  const year = 2000 + parseInt(d[2], 10);
  return mi >= 0 ? { year, mi } : null;
}

/* Return % → background color */
function cellColor(pct: number | undefined): string {
  if (pct === undefined) return 'transparent';
  if (pct <= -8)  return '#9f1239';
  if (pct <= -4)  return '#e11d48';
  if (pct <= -1)  return '#fb7185';
  if (pct < 0)    return '#fda4af';
  if (pct === 0)  return '#374151';
  if (pct < 1)    return '#bbf7d0';
  if (pct < 3)    return '#4ade80';
  if (pct < 6)    return '#16a34a';
  return                 '#064e3b';
}
function textColor(pct: number | undefined): string {
  if (pct === undefined) return 'var(--text-lo)';
  if (Math.abs(pct) >= 3) return '#fff';
  if (pct < 0) return '#ffe4e6';
  return '#14532d';
}

export default function MonthlyHeatmap({ monthlyReturns, monthlyDividends = [], monthlyInvestments = [] }: Props) {
  const [mode, setMode] = useState<'pct' | 'amt'>('pct');
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

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

  /* ── Derive years range ── */
  const { years, stats, yearlyTotals, monthlyAvg } = useMemo(() => {
    if (!monthlyReturns.length) return { years: [], stats: null, yearlyTotals: {}, monthlyAvg: [] };

    const parsed = monthlyReturns.map(r => ({ ...r, p: parse(r.month) })).filter(r => r.p);
    const allYears = [...new Set(parsed.map(r => r.p!.year))].sort();

    // Yearly totals (sum of monthly returnAmounts)
    const yearlyTotals: Record<number, { amount: number; months: number; positive: number }> = {};
    parsed.forEach(r => {
      const y = r.p!.year;
      if (!yearlyTotals[y]) yearlyTotals[y] = { amount: 0, months: 0, positive: 0 };
      yearlyTotals[y].amount  += r.returnAmount;
      yearlyTotals[y].months  += 1;
      if (r.returnPercent > 0) yearlyTotals[y].positive += 1;
    });

    // Monthly averages across all years (by month index)
    const monthlyAvg = MONTHS.map((_, mi) => {
      const cells = parsed.filter(r => r.p!.mi === mi);
      if (!cells.length) return null;
      const avg = cells.reduce((s, c) => s + c.returnPercent, 0) / cells.length;
      return +avg.toFixed(2);
    });

    // Overall stats
    const allRets  = parsed.map(r => r.returnPercent);
    const positive = allRets.filter(r => r > 0);
    const negative = allRets.filter(r => r < 0);
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
        negativeCount: negative.length,
        winRate: +((positive.length / allRets.length) * 100).toFixed(1),
        avgReturn: +(allRets.reduce((s,v) => s+v, 0) / allRets.length).toFixed(2),
        best,  worst,
        totalDiv,
        totalReturn: parsed.reduce((s,r) => s + r.returnAmount, 0),
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

  return (
    <div className="card animate-fadeIn overflow-hidden">

      {/* ── Header ── */}
      <div className="px-6 pt-5 pb-4"
        style={{ borderBottom: '1px solid var(--border-sm)', background: 'linear-gradient(135deg,rgba(16,185,129,0.05) 0%,rgba(99,102,241,0.04) 100%)' }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-1 h-6 rounded-full flex-shrink-0"
                style={{ background: 'linear-gradient(180deg,#4ade80 0%,#e11d48 100%)' }} />
              <h2 className="text-[15px] font-black tracking-tight" style={{ color: 'var(--text-hi)' }}>
                Monthly Performance Heatmap
              </h2>
              <span className="hidden sm:inline text-[10px] font-bold px-2 py-0.5 rounded-full border"
                style={{ background: 'rgba(74,222,128,0.12)', borderColor: 'rgba(74,222,128,0.3)', color: '#4ade80' }}>
                {years.length} Years
              </span>
            </div>
            <p className="text-[11px] ml-3.5" style={{ color: 'var(--text-lo)' }}>
              Portfolio return month-by-month · 💛 = dividend received · hover for details
            </p>
          </div>
          {/* Mode toggle */}
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
            {([['pct','% Return'], ['amt','₹ Amount']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setMode(v)}
                className="px-3 py-1 rounded-md text-[11px] font-semibold transition-all"
                style={{
                  background: mode === v ? 'var(--bg-card)' : 'transparent',
                  color:      mode === v ? 'var(--brand)'   : 'var(--text-lo)',
                  boxShadow:  mode === v ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6">

        {/* ── Top stat strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          {[
            { label: 'Win Rate',        val: `${stats.winRate}%`,               color: stats.winRate >= 60 ? '#4ade80' : stats.winRate >= 50 ? '#fbbf24' : '#f87171', sub: `${stats.positiveCount} green months` },
            { label: 'Avg / Month',     val: `${stats.avgReturn >= 0 ? '+' : ''}${stats.avgReturn}%`, color: stats.avgReturn >= 0 ? '#4ade80' : '#f87171', sub: `over ${stats.total} months` },
            { label: 'Best Month',      val: `+${stats.best.returnPercent.toFixed(1)}%`, color: '#10b981', sub: stats.best.month },
            { label: 'Worst Month',     val: `${stats.worst.returnPercent.toFixed(1)}%`, color: '#f43f5e', sub: stats.worst.month },
            { label: 'Total Returns',   val: `${stats.totalReturn >= 0 ? '+' : ''}${formatCurrency(stats.totalReturn)}`, color: stats.totalReturn >= 0 ? '#4ade80' : '#f87171', sub: 'cumulative P&L' },
            { label: 'Total Dividends', val: formatCurrency(stats.totalDiv),    color: '#fbbf24', sub: `across ${monthlyDividends.length} months` },
          ].map(({ label, val, color, sub }) => (
            <div key={label} className="rounded-xl p-3"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-lo)' }}>{label}</p>
              <p className="text-sm font-black" style={{ color }}>{val}</p>
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-lo)' }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* ── Heatmap grid ── */}
        <div className="overflow-x-auto">
          <div style={{ minWidth: 640 }}>

            {/* Month headers */}
            <div className="flex mb-1">
              <div style={{ width: 48, flexShrink: 0 }} />
              {MONTHS.map(m => (
                <div key={m} className="flex-1 text-center text-[10px] font-bold uppercase tracking-wider py-1"
                  style={{ color: 'var(--text-lo)' }}>{m}</div>
              ))}
              <div className="text-[10px] font-bold uppercase tracking-wider py-1 text-center"
                style={{ width: 68, flexShrink: 0, color: 'var(--text-lo)' }}>Total</div>
            </div>

            {/* Year rows */}
            {years.map(year => {
              const yt = yearlyTotals[year];
              return (
                <div key={year} className="flex mb-1.5 items-center">
                  {/* Year label */}
                  <div className="text-[11px] font-bold text-right pr-2 flex-shrink-0"
                    style={{ width: 48, color: 'var(--text-lo)' }}>{year}</div>

                  {/* Month cells */}
                  {MONTHS.map((_, mi) => {
                    const key = `${year}-${mi}`;
                    const ret = returnMap.get(key);
                    const div = divMap.get(key);
                    const inv = invMap.get(key);
                    const pct = ret?.returnPercent;
                    const isHov = hoveredKey === key;

                    return (
                      <div key={mi} className="flex-1 mx-0.5"
                        style={{ position: 'relative' }}
                        onMouseEnter={() => setHoveredKey(key)}
                        onMouseLeave={() => setHoveredKey(null)}>
                        <div className="rounded-md flex flex-col items-center justify-center transition-all"
                          style={{
                            height: 44,
                            background:  pct !== undefined ? cellColor(pct) : 'var(--bg-raised)',
                            border:      isHov ? '1px solid rgba(255,255,255,0.5)' : `1px solid ${pct !== undefined ? 'rgba(0,0,0,0.15)' : 'var(--border-sm)'}`,
                            cursor:      pct !== undefined ? 'pointer' : 'default',
                            transform:   isHov ? 'scale(1.08)' : 'scale(1)',
                            zIndex:      isHov ? 10 : 1,
                            boxShadow:   isHov ? '0 4px 12px rgba(0,0,0,0.4)' : 'none',
                          }}>
                          {pct !== undefined ? (
                            <>
                              <span className="text-[10px] font-black leading-none"
                                style={{ color: textColor(pct) }}>
                                {mode === 'pct'
                                  ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
                                  : (() => {
                                      const a = Math.abs(ret!.returnAmount);
                                      return `${pct < 0 ? '-' : '+'}${a >= 100000 ? `₹${(a/100000).toFixed(1)}L` : a >= 1000 ? `₹${(a/1000).toFixed(0)}k` : `₹${a.toFixed(0)}`}`;
                                    })()
                                }
                              </span>
                              {div ? (
                                <span className="text-[8px] leading-none mt-0.5" title="Dividend received">💛</span>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-[10px]" style={{ color: 'var(--border-md)' }}>—</span>
                          )}
                        </div>

                        {/* Hover tooltip */}
                        {isHov && ret && (
                          <div className="absolute z-50 rounded-2xl shadow-2xl p-3 pointer-events-none"
                            style={{
                              top: '110%', left: '50%', transform: 'translateX(-50%)',
                              background: 'var(--bg-card)', border: '1px solid var(--border-md)',
                              minWidth: 180,
                            }}>
                            <p className="text-[12px] font-black mb-2" style={{ color: 'var(--text-hi)' }}>
                              {MONTHS[mi]} {year}
                            </p>
                            <div className="space-y-1.5">
                              {[
                                { l: 'Return %',   v: `${pct! >= 0 ? '+' : ''}${pct!.toFixed(2)}%`, c: pct! >= 0 ? '#4ade80' : '#f87171' },
                                { l: 'Return ₹',   v: `${pct! >= 0 ? '+' : ''}${formatCurrency(ret.returnAmount)}`, c: pct! >= 0 ? '#4ade80' : '#f87171' },
                                ...(div  ? [{ l: 'Dividend', v: formatCurrency(div),  c: '#fbbf24' }] : []),
                                ...(inv  ? [{ l: 'Invested', v: formatCurrency(inv.investments), c: 'var(--text-hi)' }] : []),
                              ].map(({ l, v, c }) => (
                                <div key={l} className="flex justify-between gap-4">
                                  <span className="text-[10px]" style={{ color: 'var(--text-lo)' }}>{l}</span>
                                  <span className="text-[10px] font-bold" style={{ color: c }}>{v}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Year total */}
                  <div className="rounded-lg flex flex-col items-center justify-center ml-1 flex-shrink-0"
                    style={{
                      width: 68, height: 44,
                      background: yt ? (yt.amount >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)') : 'var(--bg-raised)',
                      border:     yt ? `1px solid ${yt.amount >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}` : '1px solid var(--border-sm)',
                    }}>
                    {yt ? (
                      <>
                        <span className="text-[9px] font-black leading-none"
                          style={{ color: yt.amount >= 0 ? '#4ade80' : '#f87171' }}>
                          {yt.amount >= 0 ? '+' : ''}{formatCurrency(yt.amount).replace('₹','')}
                        </span>
                        <span className="text-[8px] mt-0.5" style={{ color: 'var(--text-lo)' }}>
                          {yt.positive}/{yt.months} ✓
                        </span>
                      </>
                    ) : <span className="text-[10px]" style={{ color: 'var(--border-md)' }}>—</span>}
                  </div>
                </div>
              );
            })}

            {/* Monthly average row */}
            <div className="flex mt-3 pt-3" style={{ borderTop: '1px solid var(--border-sm)' }}>
              <div className="text-[10px] font-bold text-right pr-2 flex-shrink-0 self-center"
                style={{ width: 48, color: 'var(--text-lo)', lineHeight: 1.3 }}>Avg</div>
              {monthlyAvg.map((avg, mi) => (
                <div key={mi} className="flex-1 mx-0.5">
                  <div className="rounded-md flex items-center justify-center"
                    style={{
                      height: 28,
                      background:  avg !== null ? cellColor(avg) : 'var(--bg-raised)',
                      border:      `1px solid ${avg !== null ? 'rgba(0,0,0,0.15)' : 'var(--border-sm)'}`,
                    }}>
                    {avg !== null ? (
                      <span className="text-[9px] font-black"
                        style={{ color: textColor(avg) }}>
                        {avg >= 0 ? '+' : ''}{avg.toFixed(1)}%
                      </span>
                    ) : <span style={{ color: 'var(--border-md)', fontSize: 8 }}>—</span>}
                  </div>
                </div>
              ))}
              <div style={{ width: 68, flexShrink: 0 }} />
            </div>
            <div className="flex ml-12">
              {MONTHS.map((m, mi) => {
                const avg = monthlyAvg[mi];
                const best = avg !== null && monthlyAvg.every(a => a === null || a <= avg);
                return (
                  <div key={m} className="flex-1 text-center mt-0.5">
                    {best && <span className="text-[8px]" title="Best avg month">🏆</span>}
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
            { label: '< -8%',  color: '#9f1239' },
            { label: '-4–8%',  color: '#e11d48' },
            { label: '-1–4%',  color: '#fb7185' },
            { label: '0–1%',   color: '#bbf7d0', text: '#14532d' },
            { label: '1–3%',   color: '#4ade80', text: '#14532d' },
            { label: '3–6%',   color: '#16a34a' },
            { label: '> 6%',   color: '#064e3b' },
          ].map(({ label, color, text }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-6 h-4 rounded flex-shrink-0" style={{ background: color }} />
              <span className="text-[10px]" style={{ color: 'var(--text-lo)' }}>{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-[11px]">💛</span>
            <span className="text-[10px]" style={{ color: 'var(--text-lo)' }}>Dividend received</span>
          </div>
        </div>

        {/* ── Seasonal insight ── */}
        <div className="mt-4 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-sm)' }}>
          <div className="px-4 py-2.5" style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-sm)' }}>
            <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--text-lo)' }}>
              💡 Seasonality Insight
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x"
            style={{ borderColor: 'var(--border-sm)' }}>
            {(() => {
              const valid = monthlyAvg.map((a, mi) => ({ mi, avg: a })).filter(x => x.avg !== null) as { mi: number; avg: number }[];
              if (!valid.length) return null;
              const best3  = [...valid].sort((a,b) => b.avg - a.avg).slice(0, 3);
              const worst3 = [...valid].sort((a,b) => a.avg - b.avg).slice(0, 3);
              const consistent = valid.filter(v => v.avg > 0);
              return [
                {
                  title: '🌟 Strongest Months',
                  color: '#4ade80',
                  items: best3.map(x => `${MONTHS[x.mi]} (+${x.avg.toFixed(1)}%)`),
                },
                {
                  title: '⚠️ Weakest Months',
                  color: '#f87171',
                  items: worst3.map(x => `${MONTHS[x.mi]} (${x.avg.toFixed(1)}%)`),
                },
                {
                  title: '✅ Consistently Positive',
                  color: '#a5b4fc',
                  items: consistent.length
                    ? consistent.sort((a,b) => b.avg - a.avg).slice(0,3).map(x => `${MONTHS[x.mi]} (avg +${x.avg.toFixed(1)}%)`)
                    : ['No consistently positive months yet'],
                },
              ].map(({ title, color, items }) => (
                <div key={title} className="px-4 py-3">
                  <p className="text-[11px] font-bold mb-2" style={{ color }}>{title}</p>
                  <div className="space-y-1">
                    {items.map(item => (
                      <p key={item} className="text-[11px]" style={{ color: 'var(--text-hi)' }}>{item}</p>
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
