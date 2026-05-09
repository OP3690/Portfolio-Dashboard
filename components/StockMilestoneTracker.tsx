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
const STEP  = 50_000;
const GOALS = [3_00_000, 5_00_000, 10_00_000] as const;
const G_LABEL: Record<number, string> = { 300000: '3L', 500000: '5L', 1000000: '10L' };
const COL = 'minmax(160px,2fr) 96px 200px 84px 110px 110px';

/* ── helpers ── */
const fmtV = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
  if (a >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(2)}L`;
  if (a >= 1_000)       return `₹${(v / 1_000).toFixed(1)}k`;
  return `₹${v.toFixed(0)}`;
};
const fmtS = (v: number) => {
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (v >= 1_000)    return `₹${(v / 1_000).toFixed(0)}k`;
  return `₹${v.toFixed(0)}`;
};
const nextMs = (v: number) => {
  if (v <= 0) return STEP;
  const n = Math.ceil(v / STEP) * STEP;
  return n > v ? n : n + STEP;
};
const pColor = (p: number) => {
  if (p >= 100) return '#4ade80';
  if (p >= 75)  return '#34d399';
  if (p >= 50)  return '#38bdf8';
  if (p >= 25)  return '#facc15';
  return '#f87171';
};
const pBg = (p: number) => {
  if (p >= 100) return 'rgba(74,222,128,0.12)';
  if (p >= 75)  return 'rgba(52,211,153,0.12)';
  if (p >= 50)  return 'rgba(56,189,248,0.12)';
  if (p >= 25)  return 'rgba(250,204,21,0.12)';
  return 'rgba(248,113,113,0.12)';
};

/* ── tooltip ── */
function Tip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: '#0f1117', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '12px 16px', minWidth: 230 }}>
      <p style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{d.fullName}</p>
      {d.sector && <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 8 }}>{d.sector}</p>}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Row label="Current Value"   val={fmtV(d.value)}      c={d.color} />
        <Row label="Goal Progress"   val={`${d.pct.toFixed(1)}%`} c={d.color} />
        <Row label="Next Milestone"  val={fmtV(d.nxt)}         c="#a78bfa" />
        <Row label="Need for Next"   val={fmtV(d.toNxt)}       c="rgba(255,255,255,0.7)" />
        <Row label="Remaining to Goal" val={d.atGoal ? '✓ Achieved' : fmtV(d.needed)} c={d.atGoal ? '#4ade80' : '#f87171'} />
      </div>
    </div>
  );
}
const Row = ({ label, val, c }: { label: string; val: string; c: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
    <span style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
    <span style={{ color: c, fontWeight: 700 }}>{val}</span>
  </div>
);

/* ── segmented milestone bar ── */
function MsBar({ value, goal, color }: { value: number; goal: number; color: string }) {
  const total  = Math.ceil(goal / STEP);
  const done   = Math.floor(value / STEP);
  const partPct = ((value % STEP) / STEP) * 100;
  return (
    <div style={{ display: 'flex', gap: 2, height: 10, borderRadius: 6, overflow: 'hidden' }}>
      {Array.from({ length: total }).map((_, i) => {
        const filled  = i < done;
        const partial = i === done;
        return (
          <div key={i} style={{
            flex: 1, borderRadius: 3, position: 'relative', overflow: 'hidden',
            background: 'rgba(255,255,255,0.08)',
          }}>
            {filled && (
              <div style={{ position: 'absolute', inset: 0, background: color, opacity: 0.9 }} />
            )}
            {partial && partPct > 0 && (
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${partPct}%`, background: color, opacity: 0.75 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── mini progress ring ── */
function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 13, circ = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100) * circ;
  return (
    <svg width={32} height={32} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={16} cy={16} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
      <circle cx={16} cy={16} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
    </svg>
  );
}

/* ══ COMPONENT ══ */
export default function StockMilestoneTracker({ holdings }: Props) {
  const valid = holdings.filter(h => (h.marketValue ?? 0) > 0);

  const defaultGoal = useMemo<number>(() => {
    if (valid.every(h => (h.marketValue ?? 0) >= 5_00_000)) return 10_00_000;
    if (valid.every(h => (h.marketValue ?? 0) >= 3_00_000)) return 5_00_000;
    return 3_00_000;
  }, [valid]);

  const [goal,   setGoal]   = useState<number>(defaultGoal);
  const [sortBy, setSortBy] = useState<'value' | 'pct' | 'needed' | 'name'>('value');

  const data = useMemo(() =>
    valid.map(h => {
      const v   = h.marketValue ?? 0;
      const pct = Math.min(100, (v / goal) * 100);
      const nxt = nextMs(v);
      return {
        name:    (h.stockName || h.isin || '?').slice(0, 18),
        fullName: h.stockName || h.isin || '?',
        sector:   h.sectorName || '',
        value:    v, pct,
        nxt,
        toNxt:    Math.max(0, nxt > goal ? 0 : nxt - v),
        needed:   Math.max(0, goal - v),
        msDone:   Math.floor(v / STEP),
        msTotal:  Math.ceil(goal / STEP),
        atGoal:   v >= goal,
        color:    pColor(pct),
      };
    }).sort((a, b) => {
      if (sortBy === 'value')  return b.value - a.value;
      if (sortBy === 'pct')    return b.pct - a.pct;
      if (sortBy === 'needed') return a.needed - b.needed;
      return a.fullName.localeCompare(b.fullName);
    }),
  [valid, goal, sortBy]);

  const msLines    = useMemo(() => { const r=[]; for(let m=STEP; m<=goal; m+=STEP) r.push(m); return r; }, [goal]);
  const atGoalCnt  = data.filter(d => d.atGoal).length;
  const avgPct     = data.length ? data.reduce((s,d)=>s+d.pct,0)/data.length : 0;
  const totalNeed  = data.reduce((s,d)=>s+d.needed,0);
  const closestStk = data.filter(d => !d.atGoal).sort((a,b) => a.toNxt - b.toNxt)[0] ?? null;
  const chartH     = Math.max(340, data.length * 38 + 70);

  const SORT_OPTS = [
    { k: 'value'  as const, label: 'Value'    },
    { k: 'pct'    as const, label: 'Progress' },
    { k: 'needed' as const, label: 'Closest'  },
    { k: 'name'   as const, label: 'A–Z'      },
  ];

  return (
    <div className="card p-6 space-y-6">

      {/* ══ HEADER ══ */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 style={{ color: '#ffffff', fontWeight: 700, fontSize: 16, marginBottom: 2 }}>
            Stock Milestone Tracker
          </h3>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
            Each stock's progress toward ₹{G_LABEL[goal]} · milestones every ₹50k
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Sort */}
          <div className="flex gap-0.5 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {SORT_OPTS.map(o => (
              <button key={o.k} onClick={() => setSortBy(o.k)}
                className="px-3 py-1.5 rounded-lg transition-all"
                style={{
                  fontSize: 12, fontWeight: sortBy === o.k ? 700 : 500,
                  background: sortBy === o.k ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: sortBy === o.k ? '#ffffff' : 'rgba(255,255,255,0.5)',
                }}>
                {o.label}
              </button>
            ))}
          </div>

          {/* Goal pills */}
          <div className="flex gap-0.5 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {GOALS.map(g => (
              <button key={g} onClick={() => setGoal(g)}
                className="px-4 py-1.5 rounded-lg transition-all"
                style={{
                  fontSize: 13, fontWeight: 700,
                  background: goal === g ? 'var(--brand)' : 'transparent',
                  color: goal === g ? '#fff' : 'rgba(255,255,255,0.55)',
                }}>
                {G_LABEL[g]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══ SUMMARY CARDS ══ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: `At ${G_LABEL[goal]} Goal`,
            value: `${atGoalCnt} / ${data.length}`,
            sub:   atGoalCnt === data.length ? '🎯 All stocks reached!' : `${data.length - atGoalCnt} stocks still to go`,
            color: atGoalCnt === data.length ? '#4ade80' : '#facc15',
          },
          {
            label: 'Avg Progress',
            value: `${avgPct.toFixed(1)}%`,
            sub:   `toward ₹${G_LABEL[goal]} per stock`,
            color: pColor(avgPct),
          },
          {
            label: 'Total Remaining',
            value: fmtV(totalNeed),
            sub:   `to bring all to ₹${G_LABEL[goal]}`,
            color: '#f87171',
          },
          {
            label: 'Closest to Milestone',
            value: closestStk ? fmtV(closestStk.nxt) : '—',
            sub:   closestStk ? `${closestStk.fullName.slice(0,18)} · ₹${fmtV(closestStk.toNxt)} away` : 'All at goal',
            color: '#a78bfa',
          },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>
              {s.label}
            </p>
            <p style={{ color: s.color, fontWeight: 800, fontSize: 22, lineHeight: 1, marginBottom: 4 }}>{s.value}</p>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }} className="truncate">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ══ BAR CHART ══ */}
      <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>

        {/* chart header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <p style={{ color: '#ffffff', fontWeight: 700, fontSize: 14 }}>
            Holdings vs ₹{G_LABEL[goal]} Goal
          </p>
          <div className="flex flex-wrap gap-5">
            {[
              { c: '#4ade80', label: '≥ 75%' },
              { c: '#38bdf8', label: '50–75%' },
              { c: '#facc15', label: '25–50%' },
              { c: '#f87171', label: '< 25%' },
            ].map(({ c, label }) => (
              <span key={label} className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: c, display: 'inline-block' }} />
                {label}
              </span>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={chartH}>
          <BarChart data={data} layout="vertical" margin={{ top: 6, right: 165, left: 6, bottom: 6 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              type="number"
              domain={[0, goal]}
              tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              tickFormatter={fmtS}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 500 }}
              tickLine={false}
              axisLine={false}
              width={130}
            />

            {/* 50K lines */}
            {msLines.filter(m => m % 1_00_000 !== 0).map(m => (
              <ReferenceLine key={`s${m}`} x={m} stroke="rgba(255,255,255,0.04)" strokeDasharray="2 4" />
            ))}
            {/* 1L lines with labels */}
            {msLines.filter(m => m % 1_00_000 === 0 && m < goal).map(m => (
              <ReferenceLine key={`l${m}`} x={m} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 3"
                label={{ value: fmtS(m), fill: 'rgba(255,255,255,0.4)', fontSize: 10, position: 'top' }} />
            ))}
            {/* Goal line */}
            <ReferenceLine x={goal} stroke="#facc15" strokeWidth={2} strokeDasharray="6 3"
              label={{ value: `${G_LABEL[goal]} Goal`, fill: '#facc15', fontSize: 11, fontWeight: 700, position: 'insideTopRight' }} />

            <Tooltip content={<Tip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />

            <Bar dataKey="value" radius={[0, 5, 5, 0]} barSize={24}
              background={{ fill: 'rgba(255,255,255,0.04)', radius: 5 }}>
              {data.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.88} />)}

              <LabelList content={({ x, y, width, height, index }: any) => {
                const d = data[index];
                if (!d) return null;
                const lx = (x as number) + (width as number) + 10;
                const my = (y as number) + (height as number) / 2;
                return (
                  <g>
                    <text x={lx} y={my - 5} fill={d.color} fontSize={11} fontWeight={700} dominantBaseline="middle">
                      {fmtS(d.value)}
                    </text>
                    <text x={lx} y={my + 7} fill="rgba(255,255,255,0.5)" fontSize={10} dominantBaseline="middle">
                      {d.pct.toFixed(0)}% · next {fmtS(d.nxt)}
                    </text>
                  </g>
                );
              }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ══ DETAIL TABLE ══ */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>

        {/* table header */}
        <div className="grid items-center px-5 py-3"
          style={{ gridTemplateColumns: COL, background: 'rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {['Stock', 'Current Value', 'Milestone Progress', 'Done %', 'Next Target', 'Still Needed'].map(h => (
            <p key={h} style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {h}
            </p>
          ))}
        </div>

        {/* rows */}
        {data.map((d, i) => (
          <div key={d.fullName}
            className="grid items-center px-5 py-3 transition-colors hover:bg-white/[0.04]"
            style={{
              gridTemplateColumns: COL,
              background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
              borderBottom: i < data.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
            }}>

            {/* Stock name + sector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: pBg(d.pct), border: `1px solid ${d.color}30`,
                fontSize: 12, fontWeight: 800, color: d.color,
              }}>
                {d.fullName.charAt(0)}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: '#ffffff', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {d.fullName}
                </p>
                {d.sector && (
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 1 }}>{d.sector}</p>
                )}
              </div>
            </div>

            {/* Current value */}
            <div>
              <p style={{ color: d.color, fontWeight: 800, fontSize: 14 }}>{fmtV(d.value)}</p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 1 }}>
                {d.msDone} milestone{d.msDone !== 1 ? 's' : ''} hit
              </p>
            </div>

            {/* Milestone bar */}
            <div>
              <MsBar value={d.value} goal={goal} color={d.color} />
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 5 }}>
                {d.msDone} / {d.msTotal} milestones
              </p>
            </div>

            {/* Progress % with ring */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0 }}>
                <Ring pct={d.pct} color={d.color} />
                <span style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 7, fontWeight: 800, color: d.color,
                }}>
                  {d.pct.toFixed(0)}
                </span>
              </div>
              <div>
                <p style={{ color: d.color, fontWeight: 700, fontSize: 13 }}>{d.pct.toFixed(1)}%</p>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>of goal</p>
              </div>
            </div>

            {/* Next milestone */}
            <div>
              {d.atGoal
                ? <span style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80', padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700, border: '1px solid rgba(74,222,128,0.25)' }}>
                    🎯 Goal!
                  </span>
                : <>
                    <p style={{ color: '#a78bfa', fontWeight: 700, fontSize: 13 }}>{fmtV(d.nxt)}</p>
                    <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 1 }}>
                      ₹{fmtV(d.toNxt)} away
                    </p>
                  </>
              }
            </div>

            {/* Remaining to goal */}
            <div>
              {d.atGoal
                ? <span style={{ color: '#4ade80', fontWeight: 700, fontSize: 13 }}>✓ Achieved</span>
                : <>
                    <p style={{ color: '#f87171', fontWeight: 700, fontSize: 13 }}>{fmtV(d.needed)}</p>
                    <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 1 }}>
                      {(100 - d.pct).toFixed(1)}% left
                    </p>
                  </>
              }
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
