'use client';

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, LabelList,
} from 'recharts';

/* ── types ── */
interface Holding {
  stockName?: string;
  isin?: string;
  sectorName?: string;
  marketValue?: number;
  investmentAmount?: number;
}
interface Props { holdings: Holding[]; }

/* ── constants ── */
const STEP   = 50_000;
const GOALS  = [3_00_000, 5_00_000, 10_00_000] as const;
const G_LABEL: Record<number, string> = { 300000: '3L', 500000: '5L', 1000000: '10L' };

/* ── helpers ── */
function fmtAmt(v: number) {
  const a = Math.abs(v);
  if (a >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
  if (a >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(2)}L`;
  if (a >= 1_000)       return `₹${(v / 1_000).toFixed(1)}k`;
  return `₹${v.toFixed(0)}`;
}
function fmtShort(v: number) {
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (v >= 1_000)    return `₹${(v / 1_000).toFixed(0)}k`;
  return `₹${v.toFixed(0)}`;
}
function nextMilestone(v: number): number {
  if (v <= 0) return STEP;
  const n = Math.ceil(v / STEP) * STEP;
  return n > v ? n : n + STEP;
}
function progressColor(pct: number): string {
  if (pct >= 100) return '#4ade80';
  if (pct >= 75)  return '#34d399';
  if (pct >= 50)  return '#38bdf8';
  if (pct >= 25)  return '#facc15';
  return '#f87171';
}
function milestonesUpto(goal: number) {
  const ms: number[] = [];
  for (let m = STEP; m <= goal; m += STEP) ms.push(m);
  return ms;
}

/* ── custom tooltip ── */
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: '#0f1117', border: '1px solid rgba(255,255,255,0.13)', borderRadius: 10, padding: '10px 14px', minWidth: 220, fontSize: 12 }}>
      <p style={{ color: '#fff', fontWeight: 700, marginBottom: 6 }}>{d.fullName}</p>
      <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>Sector: {d.sector || '—'}</p>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 6, paddingTop: 6, display: 'grid', gap: 3 }}>
        <p><span style={{ color: 'rgba(255,255,255,0.55)' }}>Current Value: </span>
          <span style={{ color: d.color, fontWeight: 700 }}>{fmtAmt(d.value)}</span></p>
        <p><span style={{ color: 'rgba(255,255,255,0.55)' }}>Goal Progress: </span>
          <span style={{ color: d.color, fontWeight: 700 }}>{d.pct.toFixed(1)}%</span></p>
        <p><span style={{ color: 'rgba(255,255,255,0.55)' }}>Next Milestone: </span>
          <span style={{ color: '#a78bfa', fontWeight: 600 }}>{fmtAmt(d.nextMs)}</span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}> (need {fmtAmt(d.toNextMs)})</span></p>
        <p><span style={{ color: 'rgba(255,255,255,0.55)' }}>To Reach Goal: </span>
          <span style={{ color: d.atGoal ? '#4ade80' : '#f87171', fontWeight: 700 }}>
            {d.atGoal ? '✓ Achieved' : fmtAmt(d.needed)}
          </span></p>
      </div>
    </div>
  );
}

/* ══ COMPONENT ══ */
export default function StockMilestoneTracker({ holdings }: Props) {
  const valid = holdings.filter(h => (h.marketValue ?? 0) > 0);

  /* smart default goal */
  const defaultGoal = useMemo<number>(() => {
    const allAbove5L = valid.every(h => (h.marketValue ?? 0) >= 5_00_000);
    const allAbove3L = valid.every(h => (h.marketValue ?? 0) >= 3_00_000);
    return allAbove5L ? 10_00_000 : allAbove3L ? 5_00_000 : 3_00_000;
  }, [valid]);

  const [goal, setGoal] = useState<number>(defaultGoal);
  const [sortBy, setSortBy] = useState<'value' | 'pct' | 'needed' | 'name'>('value');

  /* per-stock data */
  const data = useMemo(() => {
    return valid
      .map(h => {
        const value  = h.marketValue ?? 0;
        const pct    = Math.min(100, (value / goal) * 100);
        const nextMs = nextMilestone(value);
        const needed = Math.max(0, goal - value);
        const toNextMs = Math.max(0, nextMs > goal ? 0 : nextMs - value);
        const milestonesDone = Math.floor(value / STEP);
        return {
          name:        (h.stockName || h.isin || '?').slice(0, 16),
          fullName:    h.stockName || h.isin || '?',
          sector:      h.sectorName || '',
          value,
          pct,
          nextMs,
          toNextMs,
          needed,
          milestonesDone,
          atGoal:      value >= goal,
          color:       progressColor(pct),
        };
      })
      .sort((a, b) => {
        if (sortBy === 'value')  return b.value - a.value;
        if (sortBy === 'pct')    return b.pct - a.pct;
        if (sortBy === 'needed') return a.needed - b.needed;
        if (sortBy === 'name')   return a.fullName.localeCompare(b.fullName);
        return 0;
      });
  }, [valid, goal, sortBy]);

  const milestones  = milestonesUpto(goal);
  const atGoalCount = data.filter(d => d.atGoal).length;
  const avgPct      = data.length > 0 ? data.reduce((s, d) => s + d.pct, 0) / data.length : 0;
  const totalNeeded = data.reduce((s, d) => s + d.needed, 0);
  const closestToMs = data.reduce<typeof data[0] | null>((best, d) => {
    if (d.atGoal) return best;
    const diff = d.nextMs - d.value;
    return !best || diff < (best.nextMs - best.value) ? d : best;
  }, null);

  const chartHeight = Math.max(320, data.length * 36 + 60);

  /* ── milestone inline bar ── */
  const MilestoneBar = ({ d }: { d: typeof data[0] }) => {
    const segments = milestones.length;
    const completedSegs = Math.floor(d.value / STEP);
    const partialPct = ((d.value % STEP) / STEP) * 100;
    return (
      <div className="flex gap-0.5 h-2 rounded-full overflow-hidden" style={{ minWidth: 120 }}>
        {milestones.map((_, si) => {
          const done = si < completedSegs;
          const partial = si === completedSegs;
          return (
            <div key={si} className="flex-1 rounded-sm relative overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.07)' }}>
              {done && <div className="absolute inset-0" style={{ background: d.color, opacity: 0.9 }} />}
              {partial && <div className="absolute inset-y-0 left-0" style={{ background: d.color, width: `${partialPct}%`, opacity: 0.9 }} />}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="card p-5 space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-hi">Stock Milestone Tracker</h3>
          <p className="text-xs text-lo mt-0.5">Progress of each holding toward value milestones · every ₹50k step</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Sort */}
          <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            {(['value', 'pct', 'needed', 'name'] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)}
                className="text-xs px-2.5 py-1 rounded-md font-medium transition-all capitalize"
                style={{ background: sortBy === s ? 'rgba(255,255,255,0.1)' : 'transparent', color: sortBy === s ? 'var(--text-hi)' : 'var(--text-lo)' }}>
                {s === 'pct' ? 'Progress' : s === 'needed' ? 'Closest' : s === 'value' ? 'Value' : 'A–Z'}
              </button>
            ))}
          </div>
          {/* Goal */}
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            {GOALS.map(g => (
              <button key={g} onClick={() => setGoal(g)}
                className="text-xs px-4 py-1.5 rounded-md font-semibold transition-all"
                style={{ background: goal === g ? 'var(--brand)' : 'transparent', color: goal === g ? '#fff' : 'var(--text-lo)' }}>
                {G_LABEL[g]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Summary strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: `At ${G_LABEL[goal]} Goal`,
            value: `${atGoalCount} / ${data.length}`,
            sub:   atGoalCount === data.length ? '🎯 All reached!' : `${data.length - atGoalCount} stocks remaining`,
            color: atGoalCount === data.length ? '#4ade80' : '#facc15',
          },
          {
            label: 'Avg Progress',
            value: `${avgPct.toFixed(1)}%`,
            sub:   `toward ${G_LABEL[goal]} goal`,
            color: progressColor(avgPct),
          },
          {
            label: 'Total Remaining',
            value: fmtAmt(totalNeeded),
            sub:   `to reach ${G_LABEL[goal]} across all`,
            color: '#f87171',
          },
          {
            label: 'Closest to Next',
            value: closestToMs ? fmtAmt(closestToMs.nextMs) : '—',
            sub:   closestToMs ? `${closestToMs.fullName.slice(0, 16)} · needs ${fmtAmt(closestToMs.toNextMs)}` : 'all at goal',
            color: '#a78bfa',
          },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            <p className="text-xs text-lo mb-0.5">{s.label}</p>
            <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-lo mt-0.5 truncate">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Main Chart ── */}
      <div className="rounded-xl p-4" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-sm font-semibold text-hi">Holdings vs {G_LABEL[goal]} Goal</p>
          <div className="flex flex-wrap gap-4 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#4ade80' }} />≥75% done
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#38bdf8' }} />50–75%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#facc15' }} />25–50%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#f87171' }} />&lt;25%
            </span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 130, left: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              type="number"
              domain={[0, goal]}
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              tickFormatter={fmtShort}
              tickCount={milestones.length + 1}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 500 }}
              tickLine={false}
              axisLine={false}
              width={110}
            />

            {/* 50K milestone lines — subtle */}
            {milestones.filter(m => m % 1_00_000 !== 0).map(m => (
              <ReferenceLine key={`ms-${m}`} x={m} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
            ))}
            {/* 1L, 1.5L etc — slightly more visible */}
            {milestones.filter(m => m % 1_00_000 === 0 && m < goal).map(m => (
              <ReferenceLine key={`ml-${m}`} x={m} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4"
                label={{ value: fmtShort(m), fill: 'rgba(255,255,255,0.3)', fontSize: 9, position: 'top' }} />
            ))}
            {/* Goal line */}
            <ReferenceLine x={goal} stroke="rgba(250,204,21,0.6)" strokeWidth={2} strokeDasharray="6 3"
              label={{ value: `${G_LABEL[goal]} Goal`, fill: '#facc15', fontSize: 10, position: 'insideTopRight', offset: 4 }} />

            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />

            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={22} background={{ fill: 'rgba(255,255,255,0.03)', radius: 4 }}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} fillOpacity={0.85} />
              ))}
              {/* Right-side labels: value · % · next milestone */}
              <LabelList
                content={({ x, y, width, height, index }: any) => {
                  const d = data[index as number];
                  if (!d) return null;
                  const rx = (x as number) + (width as number) + 8;
                  const ry = (y as number) + (height as number) / 2;
                  return (
                    <g>
                      <text x={rx} y={ry - 4} fill={d.color} fontSize={10} fontWeight={700}
                        dominantBaseline="middle">
                        {fmtShort(d.value)}
                      </text>
                      <text x={rx} y={ry + 7} fill="rgba(255,255,255,0.45)" fontSize={9}
                        dominantBaseline="middle">
                        {d.pct.toFixed(0)}% · next {fmtShort(d.nextMs)}
                      </text>
                    </g>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Per-stock detail list ── */}
      <div className="space-y-1">
        <p className="text-xs font-semibold text-lo uppercase tracking-wider px-1">Milestone Breakdown</p>

        {/* header row */}
        <div className="grid text-xs font-semibold uppercase tracking-wide px-3 py-1.5 rounded-lg"
          style={{ gridTemplateColumns: '1fr 80px 120px 90px 90px 90px', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.03)' }}>
          <div>Stock</div>
          <div>Value</div>
          <div>Milestones</div>
          <div>Progress</div>
          <div>Next</div>
          <div>To Goal</div>
        </div>

        {data.map((d, i) => (
          <div key={d.fullName}
            className="grid items-center px-3 py-2.5 rounded-lg text-xs transition-colors hover:bg-white/5"
            style={{ gridTemplateColumns: '1fr 80px 120px 90px 90px 90px', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>

            {/* name + sector */}
            <div>
              <p className="font-semibold" style={{ color: '#fff' }}>{d.fullName}</p>
              {d.sector && <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{d.sector}</p>}
            </div>

            {/* current value */}
            <div className="font-bold" style={{ color: d.color }}>{fmtAmt(d.value)}</div>

            {/* milestone progress bar */}
            <div className="flex flex-col gap-1">
              <MilestoneBar d={d} />
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>
                {d.milestonesDone} of {milestones.length} milestones
              </p>
            </div>

            {/* % to goal */}
            <div>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)', maxWidth: 48 }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, d.pct)}%`, background: d.color }} />
                </div>
                <span className="font-bold" style={{ color: d.color }}>{d.pct.toFixed(0)}%</span>
              </div>
            </div>

            {/* next milestone */}
            <div>
              {d.atGoal
                ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>🎯 Goal!</span>
                : (
                  <div>
                    <p className="font-semibold" style={{ color: '#a78bfa' }}>{fmtAmt(d.nextMs)}</p>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>need {fmtAmt(d.toNextMs)}</p>
                  </div>
                )
              }
            </div>

            {/* remaining to goal */}
            <div>
              {d.atGoal
                ? <span style={{ color: '#4ade80', fontWeight: 700 }}>✓ Done</span>
                : (
                  <div>
                    <p className="font-semibold" style={{ color: '#f87171' }}>{fmtAmt(d.needed)}</p>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>{(100 - d.pct).toFixed(0)}% remaining</p>
                  </div>
                )
              }
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
