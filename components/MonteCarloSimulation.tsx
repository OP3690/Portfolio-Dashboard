'use client';

import { useMemo, useState, useCallback } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Label,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';

/* ════════════════════════════════════════════════════════════
   MATHEMATICS ENGINE
   ════════════════════════════════════════════════════════════ */

/** Box-Muller transform: U(0,1) → N(0,1) */
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Sample percentile (linear interpolation) */
function pct(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Mean of array */
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

/** Sample std-dev */
function stddev(a: number[], mu: number): number {
  const variance = a.reduce((s, v) => s + (v - mu) ** 2, 0) / (a.length - 1);
  return Math.sqrt(variance);
}

interface SimResult {
  chartData:    ChartPoint[];
  mu:           number;   // mean monthly return (decimal)
  sigma:        number;   // monthly volatility (decimal)
  annualized:   number;   // annualized return %
  annualVol:    number;   // annualized volatility %
  sharpe:       number;   // (annualized return - rf) / annualVol
  var95:        number;   // Value at Risk 95% (monthly ₹)
  probProfit:   number;   // P(V_T > V_0)
  probTarget:   number;   // P(V_T > target)
  median1Y:     number;
  median2Y:     number;
  median3Y:     number;
  best1Y:       number;   // 90th pct at 1Y
  worst1Y:      number;   // 10th pct at 1Y
  finalValues:  number[]; // all 1000 final values (for histogram)
}

interface ChartPoint {
  label:  string;
  p5:     number;        // floor of outer band
  p25_w:  number;        // width: p25 - p5
  p50_w:  number;        // width: p50 - p25
  p75_w:  number;        // width: p75 - p50
  p95_w:  number;        // width: p95 - p75
  median: number;        // p50 (actual value — for line)
  current: number;       // flat line: currentValue
  target?: number;
}

function runMonteCarlo(
  returns:      number[],   // historical monthly returns as percentages
  currentValue: number,
  horizonMonths: number,
  N:            number,     // simulations
  targetValue:  number,
): SimResult {
  /* ── Parameters from history ── */
  const rets  = returns.map(r => r / 100);          // decimal
  const mu    = mean(rets);                          // mean monthly return
  const sigma = stddev(rets, mu);                    // monthly sigma

  /* GBM drift term: μ - σ²/2 (Itô correction) */
  const drift = mu - (sigma ** 2) / 2;

  /* ── Run N simulation paths ── */
  const paths: number[][] = [];
  for (let s = 0; s < N; s++) {
    const path: number[] = [currentValue];
    for (let t = 1; t <= horizonMonths; t++) {
      const z      = randn();
      const factor = Math.exp(drift + sigma * z);
      path.push(path[t - 1] * factor);
    }
    paths.push(path);
  }

  /* ── Percentile bands at each month ── */
  const today = new Date();
  const chartData: ChartPoint[] = Array.from({ length: horizonMonths + 1 }, (_, t) => {
    const vals   = paths.map(p => p[t]).sort((a, b) => a - b);
    const P5     = pct(vals, 5);
    const P25    = pct(vals, 25);
    const P50    = pct(vals, 50);
    const P75    = pct(vals, 75);
    const P95    = pct(vals, 95);
    const d      = new Date(today);
    d.setMonth(d.getMonth() + t);
    const label  = t === 0 ? 'Now' :
      d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    return {
      label,
      p5:    P5,
      p25_w: P25 - P5,
      p50_w: P50 - P25,
      p75_w: P75 - P50,
      p95_w: P95 - P75,
      median: P50,
      current: currentValue,
      ...(targetValue > 0 ? { target: targetValue } : {}),
    };
  });

  /* ── Summary stats ── */
  const annualized = ((1 + mu) ** 12 - 1) * 100;
  const annualVol  = sigma * Math.sqrt(12) * 100;
  const RF         = 6.5;   // risk-free rate (India 10Y ~6.5%)
  const sharpe     = annualVol > 0 ? (annualized - RF) / annualVol : 0;

  /* VaR 95%: worst 5th pct 1-month loss in ₹ */
  const oneMonthFinals = paths.map(p => p[1]).sort((a, b) => a - b);
  const var95 = currentValue - pct(oneMonthFinals, 5);

  /* Probabilities at horizon */
  const horizonFinals = paths.map(p => p[horizonMonths]);
  const probProfit    = horizonFinals.filter(v => v > currentValue).length / N * 100;
  const probTarget    = targetValue > 0
    ? horizonFinals.filter(v => v >= targetValue).length / N * 100
    : 0;

  const m12 = Math.min(12, horizonMonths);
  const m24 = Math.min(24, horizonMonths);
  const finals12 = paths.map(p => p[m12]).sort((a, b) => a - b);
  const finals24 = paths.map(p => p[m24]).sort((a, b) => a - b);
  const finals36 = paths.map(p => p[horizonMonths]).sort((a, b) => a - b);

  return {
    chartData,
    mu, sigma,
    annualized, annualVol, sharpe, var95,
    probProfit, probTarget,
    median1Y:  pct(finals12, 50),
    median2Y:  pct(finals24, 50),
    median3Y:  pct(finals36, 50),
    best1Y:    pct(finals12, 90),
    worst1Y:   pct(finals12, 10),
    finalValues: finals36,
  };
}

/* ════════════════════════════════════════════════════════════
   MINI HISTOGRAM of final portfolio values
   ════════════════════════════════════════════════════════════ */
function Histogram({ values, current }: { values: number[]; current: number }) {
  const bins = 20;
  const min  = values[0];
  const max  = values[values.length - 1];
  const step = (max - min) / bins || 1;
  const counts = Array(bins).fill(0);
  values.forEach(v => {
    const i = Math.min(Math.floor((v - min) / step), bins - 1);
    counts[i]++;
  });
  const maxCount = Math.max(...counts);
  return (
    <div className="flex items-end gap-0.5 h-14 w-full">
      {counts.map((c, i) => {
        const midVal = min + (i + 0.5) * step;
        const isProfit = midVal > current;
        return (
          <div key={i} className="flex-1 rounded-sm"
            style={{
              height:     `${(c / maxCount) * 100}%`,
              background: isProfit ? 'rgba(16,185,129,0.6)' : 'rgba(244,63,94,0.5)',
              minHeight:  c > 0 ? 2 : 0,
            }}
            title={`${formatCurrency(midVal)}: ${c} paths`}
          />
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════ */
interface Props {
  monthlyReturns: { month: string; returnPercent: number; returnAmount: number }[];
  currentValue:   number;
  totalInvested:  number;
}

const HORIZON_OPTIONS = [
  { label: '1 Year',  months: 12 },
  { label: '2 Years', months: 24 },
  { label: '3 Years', months: 36 },
];
const N_SIMULATIONS = 1000;
const RISK_FREE     = 6.5;

export default function MonteCarloSimulation({ monthlyReturns, currentValue, totalInvested }: Props) {
  const [horizonIdx, setHorizonIdx] = useState(1);      // default: 2Y
  const [target, setTarget]         = useState('');
  const [simCount, setSimCount]     = useState(0);      // increment to re-run

  const horizon = HORIZON_OPTIONS[horizonIdx];
  const targetVal = parseFloat(target.replace(/[^0-9.]/g, '')) * 100000 || 0; // input in Lakhs

  /* Historical returns array */
  const histReturns = useMemo(
    () => monthlyReturns.map(r => r.returnPercent).filter(r => isFinite(r)),
    [monthlyReturns]
  );

  /* Run simulation — memoized on horizon + target + simCount */
  const sim = useMemo<SimResult | null>(() => {
    if (histReturns.length < 3 || currentValue <= 0) return null;
    return runMonteCarlo(histReturns, currentValue, horizon.months, N_SIMULATIONS, targetVal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histReturns, currentValue, horizon.months, targetVal, simCount]);

  const rerun = useCallback(() => setSimCount(c => c + 1), []);

  if (!sim) return null;

  const { chartData, mu, sigma, annualized, annualVol, sharpe, var95,
    probProfit, probTarget, median1Y, median2Y, median3Y, best1Y, worst1Y, finalValues } = sim;

  /* Format helpers */
  const fmtPct  = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  const fmtCr   = (v: number) => {
    if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
    if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
    return formatCurrency(v);
  };

  return (
    <div className="card animate-fadeIn overflow-hidden">

      {/* ── Header ── */}
      <div className="px-6 pt-5 pb-4"
        style={{ borderBottom: '1px solid var(--border-sm)', background: 'linear-gradient(135deg,rgba(16,185,129,0.05) 0%,rgba(99,102,241,0.05) 100%)' }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-1 h-6 rounded-full flex-shrink-0"
                style={{ background: 'linear-gradient(180deg,#10b981 0%,#818cf8 100%)' }} />
              <h2 className="text-[15px] font-black tracking-tight" style={{ color: 'var(--text-hi)' }}>
                Monte Carlo Portfolio Simulation
              </h2>
              <span className="hidden sm:inline text-[10px] font-bold px-2 py-0.5 rounded-full border"
                style={{ background: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.3)', color: '#10b981' }}>
                {N_SIMULATIONS.toLocaleString()} Paths · GBM Model
              </span>
            </div>
            <p className="text-[11px] ml-3.5" style={{ color: 'var(--text-lo)' }}>
              Geometric Brownian Motion · Box-Muller sampling · {histReturns.length} months of historical data
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Target input */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
              <span className="text-[11px]" style={{ color: 'var(--text-lo)' }}>Target ₹</span>
              <input type="text" placeholder="e.g. 50L" value={target}
                onChange={e => setTarget(e.target.value)}
                className="w-20 text-[11px] font-bold bg-transparent outline-none"
                style={{ color: 'var(--text-hi)' }} />
            </div>
            {/* Horizon */}
            <div className="flex gap-1 p-1 rounded-lg"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
              {HORIZON_OPTIONS.map((h, i) => (
                <button key={h.label} onClick={() => setHorizonIdx(i)}
                  className="px-3 py-1 rounded-md text-[11px] font-semibold transition-all"
                  style={{
                    background: horizonIdx === i ? 'var(--bg-card)' : 'transparent',
                    color:      horizonIdx === i ? 'var(--brand)'   : 'var(--text-lo)',
                    boxShadow:  horizonIdx === i ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                  }}>{h.label}</button>
              ))}
            </div>
            {/* Re-run */}
            <button onClick={rerun}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}>
              🎲 Re-run
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">

        {/* ── Model parameters strip ── */}
        <div className="flex flex-wrap gap-3 mb-5 p-3 rounded-xl"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
          <span className="text-[10px] font-bold uppercase tracking-widest self-center mr-1"
            style={{ color: 'var(--text-lo)' }}>Model Parameters</span>
          {[
            { k: 'μ (Monthly)',       v: fmtPct(mu * 100),        color: mu >= 0 ? '#10b981' : '#f43f5e' },
            { k: 'σ (Monthly Vol)',   v: `${(sigma * 100).toFixed(2)}%`, color: '#818cf8' },
            { k: 'Annualised Return', v: fmtPct(annualized),      color: annualized >= 0 ? '#10b981' : '#f43f5e' },
            { k: 'Annual Volatility', v: `${annualVol.toFixed(1)}%`,    color: '#fb923c' },
            { k: 'Sharpe Ratio',      v: sharpe.toFixed(2),              color: sharpe >= 1 ? '#10b981' : sharpe >= 0 ? '#fbbf24' : '#f43f5e' },
            { k: 'Monthly VaR (95%)', v: `-${fmtCr(var95)}`,           color: '#f43f5e' },
            { k: 'Data Points',       v: `${histReturns.length}m`,       color: 'var(--text-lo)' },
          ].map(({ k, v, color }) => (
            <div key={k} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-sm)' }}>
              <span className="text-[9px] font-semibold uppercase" style={{ color: 'var(--text-lo)' }}>{k}</span>
              <span className="text-[11px] font-black" style={{ color }}>{v}</span>
            </div>
          ))}
        </div>

        {/* ── Fan chart ── */}
        <div className="rounded-2xl p-4 mb-5"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-lo)' }}>
              {N_SIMULATIONS.toLocaleString()}-Path Simulation Fan — {horizon.label} Horizon
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { color: 'rgba(16,185,129,0.15)', label: '5–95th pct' },
                { color: 'rgba(16,185,129,0.30)', label: '25–75th pct' },
                { color: '#10b981',               label: 'Median (P50)' },
                { color: '#818cf8',               label: 'Current Value' },
                ...(targetVal > 0 ? [{ color: '#fbbf24', label: 'Target' }] : []),
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }} />
                  <span className="text-[9px]" style={{ color: 'var(--text-lo)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: 340 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.07)" />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} stroke="none"
                  interval={Math.floor(horizon.months / 6)} />
                <YAxis
                  tickFormatter={v => fmtCr(v)}
                  tick={{ fill: '#64748b', fontSize: 10 }} stroke="none" width={68} />

                {/* Current value reference */}
                <ReferenceLine y={currentValue} stroke="#818cf8" strokeDasharray="6 3"
                  strokeWidth={1.5} opacity={0.7}>
                  <Label value="Current" position="right" style={{ fill: '#818cf8', fontSize: 9 }} />
                </ReferenceLine>

                {/* Target reference */}
                {targetVal > 0 && (
                  <ReferenceLine y={targetVal} stroke="#fbbf24" strokeDasharray="6 3"
                    strokeWidth={1.5} opacity={0.8}>
                    <Label value="Target" position="right" style={{ fill: '#fbbf24', fontSize: 9 }} />
                  </ReferenceLine>
                )}

                {/* Stacked bands: p5 (invisible base) → each band width */}
                <Area type="monotone" dataKey="p5"    stackId="mc" fill="transparent" stroke="none" />
                <Area type="monotone" dataKey="p25_w" stackId="mc" fill="rgba(16,185,129,0.12)" stroke="none" />
                <Area type="monotone" dataKey="p50_w" stackId="mc" fill="rgba(16,185,129,0.22)" stroke="none" />
                <Area type="monotone" dataKey="p75_w" stackId="mc" fill="rgba(16,185,129,0.22)" stroke="none" />
                <Area type="monotone" dataKey="p95_w" stackId="mc" fill="rgba(16,185,129,0.12)" stroke="none" />

                {/* Median line */}
                <Line type="monotone" dataKey="median" stroke="#10b981" strokeWidth={2.5}
                  dot={false} strokeLinejoin="round" />

                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload.find(p => p.dataKey === 'median')?.payload;
                    if (!d) return null;
                    const p50 = d.median;
                    const p5  = d.p5;
                    const p25 = d.p5 + d.p25_w;
                    const p75 = d.p5 + d.p25_w + d.p50_w + d.p75_w;
                    const p95 = p75 + d.p95_w;
                    const gain = p50 - currentValue;
                    return (
                      <div className="rounded-2xl shadow-2xl overflow-hidden"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', minWidth: 210 }}>
                        <div className="px-4 py-2.5" style={{ background: 'rgba(16,185,129,0.1)', borderBottom: '1px solid rgba(16,185,129,0.2)' }}>
                          <p className="font-black text-[12px]" style={{ color: '#10b981' }}>{label}</p>
                        </div>
                        <div className="px-4 py-3 space-y-1.5">
                          {[
                            { l: 'Median (P50)', v: fmtCr(p50),  c: gain >= 0 ? '#10b981' : '#f43f5e' },
                            { l: 'Best (P95)',   v: fmtCr(p95),  c: '#4ade80' },
                            { l: 'Good (P75)',   v: fmtCr(p75),  c: '#86efac' },
                            { l: 'Poor (P25)',   v: fmtCr(p25),  c: '#fca5a5' },
                            { l: 'Worst (P5)',   v: fmtCr(p5),   c: '#f43f5e' },
                            { l: 'Median Gain',  v: `${gain >= 0 ? '+' : ''}${fmtCr(gain)}`, c: gain >= 0 ? '#10b981' : '#f43f5e' },
                          ].map(({ l, v, c }) => (
                            <div key={l} className="flex justify-between gap-5">
                              <span className="text-[10px]" style={{ color: 'var(--text-lo)' }}>{l}</span>
                              <span className="text-[10px] font-bold" style={{ color: c }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Outcome forecast cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            {
              label: `Median at ${horizon.months <= 12 ? '1Y' : horizon.months <= 24 ? '2Y' : '3Y'}`,
              val:   fmtCr(median1Y),
              sub:   `${fmtPct(((median1Y - currentValue) / currentValue) * 100)} from today`,
              color: median1Y >= currentValue ? '#10b981' : '#f43f5e',
              icon:  '📈', bg: 'rgba(16,185,129,0.07)', border: 'rgba(16,185,129,0.2)',
            },
            {
              label: 'Best Case (P90)',
              val:   fmtCr(best1Y),
              sub:   `${fmtPct(((best1Y - currentValue) / currentValue) * 100)} upside`,
              color: '#4ade80',
              icon:  '🚀', bg: 'rgba(74,222,128,0.07)', border: 'rgba(74,222,128,0.2)',
            },
            {
              label: 'Worst Case (P10)',
              val:   fmtCr(worst1Y),
              sub:   `${fmtPct(((worst1Y - currentValue) / currentValue) * 100)} downside`,
              color: '#f43f5e',
              icon:  '⚠️', bg: 'rgba(244,63,94,0.07)', border: 'rgba(244,63,94,0.2)',
            },
            {
              label: `P(Profit) at ${horizon.label}`,
              val:   `${probProfit.toFixed(1)}%`,
              sub:   `${Math.round((probProfit / 100) * N_SIMULATIONS)} of ${N_SIMULATIONS} paths profitable`,
              color: probProfit >= 70 ? '#10b981' : probProfit >= 50 ? '#fbbf24' : '#f43f5e',
              icon:  probProfit >= 60 ? '✅' : '⚡',
              bg:    'rgba(129,140,248,0.07)', border: 'rgba(129,140,248,0.2)',
            },
          ].map(({ label, val, sub, color, icon, bg, border }) => (
            <div key={label} className="rounded-2xl p-4"
              style={{ background: bg, border: `1px solid ${border}` }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{icon}</span>
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-lo)' }}>{label}</p>
              </div>
              <p className="text-[17px] font-black" style={{ color }}>{val}</p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-lo)' }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* ── Target probability + histogram row ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">

          {/* Target section */}
          <div className="rounded-2xl p-4"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-lo)' }}>
              🎯 Target Probability
            </p>
            {targetVal > 0 ? (
              <>
                <div className="flex items-end gap-3 mb-3">
                  <p className="text-[28px] font-black leading-none" style={{ color: probTarget >= 60 ? '#10b981' : probTarget >= 40 ? '#fbbf24' : '#f43f5e' }}>
                    {probTarget.toFixed(1)}%
                  </p>
                  <p className="text-[12px] mb-1" style={{ color: 'var(--text-lo)' }}>
                    chance of reaching {fmtCr(targetVal)}<br />
                    by {horizon.label}
                  </p>
                </div>
                <div className="w-full rounded-full overflow-hidden mb-2" style={{ height: 8, background: 'var(--bg-card)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${probTarget}%`,
                      background: probTarget >= 60 ? '#10b981' : probTarget >= 40 ? '#fbbf24' : '#f43f5e',
                    }} />
                </div>
                <p className="text-[10px]" style={{ color: 'var(--text-lo)' }}>
                  Gap to target: {fmtCr(targetVal - currentValue)} ({fmtPct(((targetVal - currentValue) / currentValue) * 100)})
                </p>
              </>
            ) : (
              <p className="text-[12px]" style={{ color: 'var(--text-lo)' }}>
                Enter a target amount above (in Lakhs, e.g. "50L") to see the probability of reaching it within {horizon.label}.
              </p>
            )}
          </div>

          {/* Histogram */}
          <div className="rounded-2xl p-4"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-lo)' }}>
              📊 Distribution of Final Values ({horizon.label})
            </p>
            <Histogram values={finalValues} current={currentValue} />
            <div className="flex justify-between mt-2">
              <span className="text-[9px]" style={{ color: '#f43f5e' }}>← Loss</span>
              <span className="text-[9px]" style={{ color: 'var(--text-lo)' }}>
                {fmtCr(finalValues[Math.floor(finalValues.length / 2)])} median
              </span>
              <span className="text-[9px]" style={{ color: '#10b981' }}>Gain →</span>
            </div>
            <div className="flex gap-2 mt-2">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm" style={{ background: 'rgba(16,185,129,0.6)' }} /><span className="text-[9px]" style={{ color: 'var(--text-lo)' }}>Above current (profitable)</span></div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm" style={{ background: 'rgba(244,63,94,0.5)' }} /><span className="text-[9px]" style={{ color: 'var(--text-lo)' }}>Below current (loss)</span></div>
            </div>
          </div>
        </div>

        {/* ── Multi-horizon forecast table ── */}
        <div className="rounded-2xl overflow-hidden mb-5"
          style={{ border: '1px solid var(--border-sm)' }}>
          <div className="px-4 py-2.5" style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-sm)' }}>
            <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--text-lo)' }}>
              Multi-Horizon Forecast
            </p>
          </div>
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-sm)' }}>
                  {['Horizon', 'Worst (P10)', 'Conservative (P25)', 'Median (P50)', 'Optimistic (P75)', 'Best (P90)'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-lo)', textAlign: h === 'Horizon' ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: '1 Year',  m: 12 },
                  { label: '2 Years', m: 24 },
                  { label: '3 Years', m: 36 },
                ].map(({ label, m }) => {
                  const paths = Array.from({ length: m }, (_, t) => {
                    const vals = chartData[Math.min(t + 1, chartData.length - 1)];
                    return vals;
                  });
                  const last = chartData[Math.min(m, chartData.length - 1)];
                  const P10 = last.p5;
                  const P25 = last.p5 + last.p25_w;
                  const P50 = last.median;
                  const P75 = last.p5 + last.p25_w + last.p50_w + last.p75_w;
                  const P90 = P75 + last.p95_w * 0.5;
                  return (
                    <tr key={label} style={{ borderBottom: '1px solid var(--border-sm)' }}>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--text-hi)' }}>{label}</td>
                      {[
                        { v: P10, c: '#f43f5e' },
                        { v: P25, c: '#fb923c' },
                        { v: P50, c: P50 >= currentValue ? '#10b981' : '#f43f5e' },
                        { v: P75, c: '#4ade80' },
                        { v: P90, c: '#10b981' },
                      ].map(({ v, c }, i) => (
                        <td key={i} style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <div className="flex flex-col items-end">
                            <span className="text-[12px] font-bold" style={{ color: c }}>{fmtCr(v)}</span>
                            <span className="text-[9px]" style={{ color: 'var(--text-lo)' }}>
                              {fmtPct(((v - currentValue) / currentValue) * 100)}
                            </span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Methodology disclaimer ── */}
        <div className="rounded-2xl px-4 py-3 flex items-start gap-3"
          style={{ background: 'rgba(129,140,248,0.06)', border: '1px solid rgba(129,140,248,0.18)' }}>
          <span className="text-lg flex-shrink-0">ℹ️</span>
          <div>
            <p className="text-[11px] font-bold mb-1" style={{ color: '#818cf8' }}>Methodology</p>
            <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-lo)' }}>
              This simulation uses <strong style={{ color: 'var(--text-hi)' }}>Geometric Brownian Motion (GBM)</strong> with Itô correction:
              {' '}<em>dV = V·μ·dt + V·σ·dW</em>, where μ={fmtPct(mu * 100)} and σ={fmtPct(sigma * 100)} per month,
              derived from {histReturns.length} months of actual portfolio history.
              {' '}<strong style={{ color: 'var(--text-hi)' }}>Normal random numbers</strong> are generated via the Box-Muller transform.
              Simulations are <strong style={{ color: 'var(--text-hi)' }}>forward-looking estimates only</strong> —
              past performance does not guarantee future results.
              Sharpe Ratio uses {RISK_FREE}% as the risk-free rate (India 10Y G-Sec).
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
