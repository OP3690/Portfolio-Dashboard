'use client';

import { useMemo, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer, Label,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';

/* ─── Types ─────────────────────────────────────────────── */
interface Holding {
  stockName: string;
  openQty: number;
  marketValue?: number;
  profitLossTillDate?: number;
  profitLossTillDatePercent?: number;
  sectorName?: string;
  industry?: string;          // fallback alias
  xirr?: number;
  cagr?: number;
  holdingPeriodYears?: number;
  holdingPeriodMonths?: number;
}
interface Props { holdings: Holding[] }

/* ─── Sector → colour map ────────────────────────────────── */
const SECTOR_COLORS: Record<string, string> = {
  'Banking':            '#818cf8', 'Financial':          '#a78bfa',
  'IT':                 '#22d3ee', 'Technology':         '#22d3ee',
  'Software':           '#38bdf8', 'Pharma':             '#34d399',
  'Healthcare':         '#34d399', 'FMCG':               '#fbbf24',
  'Consumer':           '#fbbf24', 'Auto':               '#f87171',
  'Automobile':         '#f87171', 'Energy':             '#fb923c',
  'Oil':                '#fb923c', 'Metals':             '#94a3b8',
  'Infrastructure':     '#a3e635', 'Real Estate':        '#f472b6',
  'Telecom':            '#2dd4bf', 'Media':              '#c084fc',
  'Chemicals':          '#fdba74', 'Cement':             '#d4d4d8',
  'Defence':            '#60a5fa', 'Power':              '#facc15',
  'Mining':             '#a8a29e', 'Capital Goods':      '#4ade80',
  'Diversified':        '#e879f9',
};
function sectorColor(s: string): string {
  for (const [k, v] of Object.entries(SECTOR_COLORS))
    if (s?.toLowerCase().includes(k.toLowerCase())) return v;
  const h = [...(s || 'X')].reduce((a, c) => a + c.charCodeAt(0), 0);
  return ['#f43f5e','#e879f9','#38bdf8','#34d399','#fbbf24','#a3e635','#fb923c','#818cf8'][h % 8];
}

/* ─── Quadrant logic ─────────────────────────────────────── */
const Q = {
  stars: { color: '#10b981', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.28)', fill: '#10b981', label: '⭐ Stars',       tip: 'Overweight & outperforming — keep & add' },
  gems:  { color: '#818cf8', bg: 'rgba(129,140,248,0.10)', border: 'rgba(129,140,248,0.28)', fill: '#818cf8', label: '💎 Hidden Gems', tip: 'Underweight & outperforming — scale up?' },
  flags: { color: '#f43f5e', bg: 'rgba(244,63,94,0.10)',   border: 'rgba(244,63,94,0.28)',  fill: '#f43f5e', label: '🚨 Red Flags',   tip: 'Overweight & underperforming — review' },
  dead:  { color: '#64748b', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.22)', fill: '#64748b', label: '🪦 Dead Weight', tip: 'Underweight & underperforming — exit?' },
} as const;
type QKey = keyof typeof Q;
function qOf(w: number, r: number, xRef: number): QKey {
  return w >= xRef ? (r > 0 ? 'stars' : 'flags') : (r > 0 ? 'gems' : 'dead');
}

function abbrev(name: string, max = 14): string {
  const s = name
    .replace(/\s+(LIMITED|LTD\.?|INDUSTRIES|ENTERPRISES|CORPORATION|CORP\.?|INC\.?|PVT\.?|PRIVATE)\.?\s*$/i, '')
    .trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
function hStr(m: number) {
  if (!m) return '—';
  const y = Math.floor(m / 12), mo = m % 12;
  return y > 0 ? `${y}y ${mo}m` : `${mo}m`;
}

/* ─── Custom bubble dot ──────────────────────────────────── */
function Dot(props: any) {
  const { cx, cy, payload, colorMode, xRef, hovered, onHover } = props;
  if (cx == null || cy == null || !payload) return null;
  const q = qOf(payload.weight, payload.ret, xRef);
  const color = colorMode === 'quadrant' ? Q[q].color : sectorColor(payload.sector);
  const r = Math.max(7, Math.min(32, Math.sqrt((payload.invested || 1) / 4000)));
  const isHov = hovered === payload.name;

  return (
    <g style={{ cursor: 'pointer' }}
      onMouseEnter={() => onHover(payload.name)}
      onMouseLeave={() => onHover(null)}>
      {isHov && <circle cx={cx} cy={cy} r={r + 10} fill={color} opacity={0.12} />}
      <circle cx={cx} cy={cy} r={r + 3.5} fill={color} opacity={isHov ? 0.22 : 0.1} />
      <circle cx={cx} cy={cy} r={r}
        fill={color} fillOpacity={isHov ? 1 : 0.85}
        stroke={isHov ? '#ffffff' : 'rgba(255,255,255,0.25)'}
        strokeWidth={isHov ? 2.5 : 1}
      />
      {r >= 14 && (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
          fontSize={Math.min(10, r * 0.6)} fontWeight={700} fill="#fff"
          style={{ pointerEvents: 'none', userSelect: 'none' }}>
          {abbrev(payload.name, Math.max(4, Math.floor(r / 5)))}
        </text>
      )}
      {isHov && r < 14 && (
        <text x={cx} y={cy + r + 10} textAnchor="middle"
          fontSize={10} fontWeight={700} fill="#e2e8f0"
          style={{ pointerEvents: 'none', userSelect: 'none' }}>
          {abbrev(payload.name, 14)}
        </text>
      )}
    </g>
  );
}

/* ─── Main ───────────────────────────────────────────────── */
export default function PortfolioQuadrant({ holdings }: Props) {
  const [hovered,    setHovered]    = useState<string | null>(null);
  const [colorMode,  setColorMode]  = useState<'quadrant' | 'sector'>('quadrant');
  const [activeSec,  setActiveSec]  = useState<string | null>(null);
  const [zoomed,     setZoomed]     = useState(false);   // clip extreme outliers

  /* ── derived ── */
  const { data, xRef, fullYMin, fullYMax, xMax, sectors, counts, top3, bot3, hasOutlier } = useMemo(() => {
    const active = (holdings || []).filter(h => (h.openQty || 0) > 0 && (h.marketValue || 0) > 0);
    const totalMV = active.reduce((s, h) => s + (h.marketValue ?? 0), 0);
    if (!totalMV) return { data:[], xRef:5, fullYMin:-20, fullYMax:20, xMax:15, sectors:[], counts:{stars:0,gems:0,flags:0,dead:0,total:0}, top3:[], bot3:[], hasOutlier:false };

    const mapped = active.map(h => {
      const mv  = h.marketValue ?? 0;
      const pl  = h.profitLossTillDate ?? 0;
      const inv = Math.max(mv - pl, 1);
      return {
        name:     h.stockName,
        weight:   +(mv / totalMV * 100).toFixed(2),
        ret:      +(h.profitLossTillDatePercent ?? 0).toFixed(2),
        invested: inv, mv, plAbs: pl,
        sector:   h.sectorName || h.industry || 'Other',
        xirr:     h.xirr  ?? 0,
        holdM:    (h.holdingPeriodYears ?? 0) * 12 + (h.holdingPeriodMonths ?? 0),
      };
    });

    const xRef    = +(100 / mapped.length).toFixed(2);
    const rets    = mapped.map(d => d.ret);
    const fullYMin = Math.floor(Math.min(...rets, -5) - 6);
    const fullYMax = Math.ceil(Math.max(...rets,  5) + 6);
    const xMax    = +(Math.max(...mapped.map(d => d.weight), xRef) * 1.14).toFixed(2);

    const c = { stars:0, gems:0, flags:0, dead:0, total: mapped.length };
    mapped.forEach(d => c[qOf(d.weight, d.ret, xRef)]++);

    const secSet  = [...new Set(mapped.map(d => d.sector))].sort();
    const sorted  = [...mapped].sort((a,b) => b.ret - a.ret);
    const hasOut  = fullYMax - fullYMin > 200;

    return { data:mapped, xRef, fullYMin, fullYMax, xMax, sectors:secSet, counts:c, top3:sorted.slice(0,3), bot3:sorted.slice(-3).reverse(), hasOutlier:hasOut };
  }, [holdings]);

  /* ── clip Y for zoomed mode ── */
  const yMin = zoomed ? Math.max(fullYMin, -60)  : fullYMin;
  const yMax = zoomed ? Math.min(fullYMax,  150) : fullYMax;

  /* ── dim non-active sector ── */
  const display = useMemo(() =>
    activeSec ? data.map(d => ({ ...d, _dim: d.sector !== activeSec })) : data
  , [data, activeSec]);

  if (!data.length) return null;

  const quadCards = (Object.entries(Q) as [QKey, typeof Q.stars][]).map(([k, v]) => ({
    key: k, ...v, count: counts[k],
  }));

  return (
    <div className="card animate-fadeIn overflow-hidden">

      {/* ── Gradient header bar ─── */}
      <div className="px-6 pt-5 pb-4"
        style={{ borderBottom: '1px solid var(--border-sm)', background: 'linear-gradient(135deg,rgba(129,140,248,0.06) 0%,rgba(16,185,129,0.04) 100%)' }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-1 h-6 rounded-full flex-shrink-0"
                style={{ background: 'linear-gradient(180deg,#818cf8 0%,#10b981 100%)' }} />
              <h2 className="text-[15px] font-black tracking-tight" style={{ color: 'var(--text-hi)' }}>
                Portfolio Quadrant Matrix
              </h2>
              <span className="hidden sm:inline text-[10px] font-bold px-2 py-0.5 rounded-full border"
                style={{ background: 'rgba(129,140,248,0.12)', borderColor: 'rgba(129,140,248,0.3)', color: '#818cf8' }}>
                BCG-Style
              </span>
            </div>
            <p className="text-[11px] ml-3.5 leading-relaxed" style={{ color: 'var(--text-lo)' }}>
              Bubble size = invested amount · X axis = portfolio weight % · Y axis = total return %
            </p>
          </div>
          {/* Controls row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Zoom toggle */}
            {hasOutlier && (
              <button onClick={() => setZoomed(z => !z)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                style={{
                  background: zoomed ? 'rgba(251,191,36,0.15)' : 'var(--bg-raised)',
                  border:     `1px solid ${zoomed ? 'rgba(251,191,36,0.4)' : 'var(--border-md)'}`,
                  color:      zoomed ? '#fbbf24' : 'var(--text-lo)',
                }}>
                {zoomed ? '🔍 Zoomed' : '🔭 Full Range'}
              </button>
            )}
            {/* Color toggle */}
            <div className="flex gap-1 p-1 rounded-lg"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
              {(['quadrant', 'sector'] as const).map(m => (
                <button key={m} onClick={() => setColorMode(m)}
                  className="px-3 py-1 rounded-md text-[11px] font-semibold transition-all"
                  style={{
                    background: colorMode === m ? 'var(--bg-card)' : 'transparent',
                    color:      colorMode === m ? 'var(--brand)'   : 'var(--text-lo)',
                    boxShadow:  colorMode === m ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                  }}>
                  {m === 'quadrant' ? '🎯 Quadrant' : '🏭 Sector'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">

        {/* ── 4 stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {quadCards.map(q => (
            <div key={q.key} className="rounded-2xl p-4 flex flex-col gap-1 transition-transform duration-200 hover:scale-[1.03] hover:-translate-y-0.5"
              style={{ background: q.bg, border: `1px solid ${q.border}` }}>
              <div className="flex items-center justify-between">
                <span className="text-[22px] leading-none">{q.label.split(' ')[0]}</span>
                <span className="text-3xl font-black leading-none" style={{ color: q.color }}>{q.count}</span>
              </div>
              <p className="text-[13px] font-bold mt-1" style={{ color: q.color }}>
                {q.label.replace(/^[^ ]+ /, '')}
              </p>
              <p className="text-[10px] leading-snug mt-0.5" style={{ color: 'var(--text-lo)' }}>{q.tip}</p>
            </div>
          ))}
        </div>

        {/* ── Chart container with relative positioned corner labels ── */}
        <div className="relative rounded-2xl overflow-hidden mb-6"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>

          {/* Corner quadrant labels (HTML overlay — precise positioning) */}
          <div className="absolute inset-0 pointer-events-none" style={{ padding: '24px 40px 60px 62px' }}>
            <div className="relative w-full h-full">
              {/* Top-right: Stars */}
              <div className="absolute top-1 right-1 flex items-center gap-1 px-2 py-0.5 rounded-lg"
                style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <span className="text-[10px]">⭐</span>
                <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: 'rgba(16,185,129,0.8)' }}>Stars</span>
              </div>
              {/* Top-left: Gems */}
              <div className="absolute top-1 left-1 flex items-center gap-1 px-2 py-0.5 rounded-lg"
                style={{ background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.25)' }}>
                <span className="text-[10px]">💎</span>
                <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: 'rgba(129,140,248,0.8)' }}>Gems</span>
              </div>
              {/* Bottom-right: Red Flags */}
              <div className="absolute bottom-1 right-1 flex items-center gap-1 px-2 py-0.5 rounded-lg"
                style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.25)' }}>
                <span className="text-[10px]">🚨</span>
                <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: 'rgba(244,63,94,0.8)' }}>Red Flags</span>
              </div>
              {/* Bottom-left: Dead Weight */}
              <div className="absolute bottom-1 left-1 flex items-center gap-1 px-2 py-0.5 rounded-lg"
                style={{ background: 'rgba(100,116,139,0.12)', border: '1px solid rgba(100,116,139,0.22)' }}>
                <span className="text-[10px]">🪦</span>
                <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: 'rgba(100,116,139,0.7)' }}>Dead Weight</span>
              </div>
            </div>
          </div>

          {/* Zoom notice */}
          {zoomed && hasOutlier && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold pointer-events-none"
              style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.35)', color: '#fbbf24' }}>
              ⚡ Zoomed — outliers above {yMax}% hidden for clarity
            </div>
          )}

          {/* Bubble size legend */}
          <div className="absolute bottom-14 right-4 z-10 pointer-events-none">
            <div className="rounded-xl p-2.5 flex flex-col gap-2"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-sm)' }}>
              <p className="text-[8px] uppercase tracking-widest font-bold text-center" style={{ color: 'var(--text-lo)' }}>Bubble = Invested</p>
              {[['₹5L','14'], ['₹2L','10'], ['₹50k','7']].map(([label, r]) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="flex items-center justify-center" style={{ width: 28, height: 28 }}>
                    <div className="rounded-full" style={{ width: +r * 2, height: +r * 2, background: 'rgba(148,163,184,0.35)', border: '1px solid rgba(148,163,184,0.5)' }} />
                  </div>
                  <span className="text-[9px]" style={{ color: 'var(--text-lo)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ width: '100%', height: 460 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 28, right: 44, bottom: 48, left: 18 }}>

                {/* Quadrant fills */}
                <ReferenceArea x1={xRef} x2={xMax} y1={0}    y2={yMax} fill="#10b981" fillOpacity={0.07} />
                <ReferenceArea x1={0}    x2={xRef} y1={0}    y2={yMax} fill="#818cf8" fillOpacity={0.07} />
                <ReferenceArea x1={xRef} x2={xMax} y1={yMin} y2={0}    fill="#f43f5e" fillOpacity={0.07} />
                <ReferenceArea x1={0}    x2={xRef} y1={yMin} y2={0}    fill="#64748b" fillOpacity={0.05} />

                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.08)" />

                <XAxis type="number" dataKey="weight" domain={[0, xMax]}
                  tickFormatter={v => `${v.toFixed(1)}%`}
                  tick={{ fill: '#64748b', fontSize: 11 }} stroke="#334155">
                  <Label value="Portfolio Weight (%)" position="insideBottom" offset={-30}
                    style={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} />
                </XAxis>

                <YAxis type="number" dataKey="ret" domain={[yMin, yMax]}
                  tickFormatter={v => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
                  tick={{ fill: '#64748b', fontSize: 11 }} stroke="#334155" width={50}>
                  <Label value="Return (%)" angle={-90} position="insideLeft" offset={16}
                    style={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} />
                </YAxis>

                {/* Break-even line */}
                <ReferenceLine y={0} stroke="#f43f5e" strokeWidth={2}
                  strokeDasharray="8 5" opacity={0.6} />

                {/* Equal-weight divider */}
                <ReferenceLine x={xRef} stroke="#818cf8" strokeWidth={2}
                  strokeDasharray="8 5" opacity={0.6}>
                  <Label value={`≈ Equal weight ${xRef.toFixed(1)}%`}
                    position="insideTopRight" offset={6}
                    style={{ fill: '#818cf8', fontSize: 10, fontWeight: 700 }} />
                </ReferenceLine>

                <Tooltip cursor={false}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    if (!d) return null;
                    const pos = d.ret >= 0;
                    const q   = qOf(d.weight, d.ret, xRef);
                    const qd  = Q[q];
                    return (
                      <div className="rounded-2xl overflow-hidden shadow-2xl"
                        style={{ background: 'var(--bg-card)', border: `1px solid ${qd.border}`, minWidth: 230, maxWidth: 260 }}>
                        {/* header band */}
                        <div className="px-4 pt-3 pb-2.5"
                          style={{ background: `${qd.color}14`, borderBottom: `1px solid ${qd.color}28` }}>
                          <p className="font-black text-[13px] leading-tight mb-1" style={{ color: 'var(--text-hi)' }}>
                            {d.name}
                          </p>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px]" style={{ color: 'var(--text-lo)' }}>{d.sector}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: `${qd.color}22`, color: qd.color }}>
                              {qd.label}
                            </span>
                          </div>
                        </div>
                        {/* data grid */}
                        <div className="px-4 py-3">
                          {[
                            ['Return',           `${pos?'+':''}${d.ret.toFixed(2)}%`,         pos?'var(--gain)':'var(--loss)'],
                            ['Gain / Loss',      `${pos?'+':''}${formatCurrency(d.plAbs)}`,   pos?'var(--gain)':'var(--loss)'],
                            ['Portfolio Weight', `${d.weight.toFixed(2)}%`,                   'var(--text-hi)'],
                            ['Market Value',     formatCurrency(d.mv),                         'var(--text-hi)'],
                            ['Invested',         formatCurrency(d.invested),                   'var(--text-lo)'],
                            ['Holding Period',   hStr(d.holdM),                               'var(--text-hi)'],
                            ['XIRR',             d.xirr ? `${d.xirr.toFixed(1)}%` : '—',     d.xirr>0?'var(--gain)':'var(--loss)'],
                          ].map(([l,v,c]) => (
                            <div key={l} className="flex justify-between items-center py-1 gap-5"
                              style={{ borderBottom: '1px solid var(--border-sm)' }}>
                              <span className="text-[11px]" style={{ color: 'var(--text-lo)' }}>{l}</span>
                              <span className="text-[11px] font-semibold" style={{ color: c as string }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }}
                />

                <Scatter data={display} isAnimationActive={false}
                  shape={(p: any) => (
                    <Dot {...p} colorMode={colorMode} xRef={xRef} hovered={hovered} onHover={setHovered} />
                  )}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Sector legend / filter ── */}
        {colorMode === 'sector' && sectors.length > 0 && (
          <div className="mb-6 p-4 rounded-2xl" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2.5" style={{ color: 'var(--text-lo)' }}>
              Filter by Sector
            </p>
            <div className="flex flex-wrap gap-2">
              {sectors.map(sec => {
                const active = activeSec === sec;
                return (
                  <button key={sec} onClick={() => setActiveSec(active ? null : sec)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all"
                    style={{
                      background: active ? `${sectorColor(sec)}18` : 'var(--bg-card)',
                      border:     `1px solid ${active ? sectorColor(sec) : 'var(--border-sm)'}`,
                      color:      active ? sectorColor(sec) : 'var(--text-lo)',
                    }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: sectorColor(sec) }} />
                    {sec}
                  </button>
                );
              })}
              {activeSec && (
                <button onClick={() => setActiveSec(null)}
                  className="px-2.5 py-1 rounded-full text-[11px] font-medium"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', color: 'var(--text-lo)' }}>
                  ✕ Clear
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Top & Bottom performers ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {[
            { title: '🏆 Top Performers', stocks: top3, color: '#10b981', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.2)', badge: (r:number) => `+${r.toFixed(1)}%`, badgeBg: 'rgba(16,185,129,0.14)', badgeColor: '#10b981' },
            { title: '📉 Needs Attention', stocks: bot3, color: '#f43f5e', bg: 'rgba(244,63,94,0.06)', border: 'rgba(244,63,94,0.2)',  badge: (r:number) => `${r.toFixed(1)}%`,  badgeBg: 'rgba(244,63,94,0.14)',  badgeColor: '#f43f5e' },
          ].map(({ title, stocks, color, bg, border, badge, badgeBg, badgeColor }) => (
            <div key={title} className="rounded-2xl p-4" style={{ background: bg, border: `1px solid ${border}` }}>
              <p className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color }}>{title}</p>
              <div className="space-y-2.5">
                {stocks.map((s, i) => (
                  <div key={s.name} className="flex items-center gap-3">
                    <span className="text-[11px] font-black w-4 flex-shrink-0 text-center"
                      style={{ color }}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-hi)' }}>
                        {abbrev(s.name, 20)}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--text-lo)' }}>
                        {s.sector} · {s.weight.toFixed(1)}% weight
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-full"
                        style={{ background: badgeBg, color: badgeColor }}>
                        {badge(s.ret)}
                      </span>
                      <span className="text-[9px]" style={{ color: 'var(--text-lo)' }}>
                        {s.xirr ? `XIRR ${s.xirr.toFixed(0)}%` : hStr(s.holdM)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Actionable insights ── */}
        {(counts.flags > 0 || counts.gems > 0 || counts.dead > 0) && (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-sm)' }}>
            <div className="px-4 py-3" style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-sm)' }}>
              <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--text-lo)' }}>
                💡 Actionable Insights
              </p>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border-sm)' }}>
              {counts.flags > 0 && (
                <div className="flex items-start gap-3 px-4 py-3 text-[12px]">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: 'rgba(244,63,94,0.12)' }}>🚨</div>
                  <div>
                    <span className="font-bold" style={{ color: '#f87171' }}>
                      {counts.flags} Red Flag{counts.flags > 1 ? 's' : ''} detected —
                    </span>
                    <span style={{ color: 'var(--text-lo)' }}>
                      {' '}overweight positions with negative returns. Consider trimming allocation or setting stop-loss targets.
                    </span>
                  </div>
                </div>
              )}
              {counts.gems > 0 && (
                <div className="flex items-start gap-3 px-4 py-3 text-[12px]">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: 'rgba(129,140,248,0.12)' }}>💎</div>
                  <div>
                    <span className="font-bold" style={{ color: '#a5b4fc' }}>
                      {counts.gems} Hidden Gem{counts.gems > 1 ? 's' : ''} found —
                    </span>
                    <span style={{ color: 'var(--text-lo)' }}>
                      {' '}underweight positions outperforming the benchmark. These deserve more capital.
                    </span>
                  </div>
                </div>
              )}
              {counts.dead > 0 && (
                <div className="flex items-start gap-3 px-4 py-3 text-[12px]">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: 'rgba(100,116,139,0.12)' }}>🪦</div>
                  <div>
                    <span className="font-bold" style={{ color: '#94a3b8' }}>
                      {counts.dead} Dead Weight stock{counts.dead > 1 ? 's' : ''} —
                    </span>
                    <span style={{ color: 'var(--text-lo)' }}>
                      {' '}small, underperforming positions. Consider exiting and redeploying capital into Gems or Stars.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
