'use client';

import { useMemo, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer, Label,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';

/* ─── Types ──────────────────────────────────────────────── */
interface Holding {
  stockName: string;
  openQty: number;
  marketValue?: number;
  profitLossTillDate?: number;
  profitLossTillDatePercent?: number;
  industry?: string;
  xirr?: number;
  cagr?: number;
  holdingPeriodYears?: number;
  holdingPeriodMonths?: number;
}
interface Props { holdings: Holding[] }

/* ─── Helpers ────────────────────────────────────────────── */
const INDUSTRY_COLORS: Record<string, string> = {
  'Banking':            '#818cf8', 'Financial':          '#a78bfa',
  'IT':                 '#22d3ee', 'Technology':         '#22d3ee',
  'Software':           '#38bdf8', 'Pharma':             '#34d399',
  'Healthcare':         '#34d399', 'FMCG':               '#fbbf24',
  'Consumer':           '#fbbf24', 'Auto':               '#f87171',
  'Automobile':         '#f87171', 'Energy':             '#fb923c',
  'Oil':                '#fb923c', 'Metals':             '#a1a1aa',
  'Infrastructure':     '#a3e635', 'Real Estate':        '#f472b6',
  'Telecom':            '#2dd4bf', 'Media':              '#c084fc',
  'Chemicals':          '#fdba74', 'Cement':             '#d4d4d8',
  'Defence':            '#60a5fa', 'Power':              '#facc15',
};
function industryColor(ind: string): string {
  for (const [k, v] of Object.entries(INDUSTRY_COLORS))
    if (ind?.toLowerCase().includes(k.toLowerCase())) return v;
  const h = [...(ind || 'X')].reduce((a, c) => a + c.charCodeAt(0), 0);
  return ['#f43f5e','#e879f9','#38bdf8','#34d399','#fbbf24','#a3e635','#fb923c'][h % 7];
}

const QUADRANT_COLORS = {
  stars: '#10b981', gems: '#818cf8', flags: '#f43f5e', dead: '#6b7280',
} as const;

function quadrantOf(weight: number, ret: number, xRef: number) {
  if (weight >= xRef) return ret > 0 ? 'stars'  : 'flags';
  return                       ret > 0 ? 'gems'   : 'dead';
}
function quadrantLabel(q: string) {
  return q === 'stars' ? '⭐ Star' : q === 'gems' ? '💎 Hidden Gem'
       : q === 'flags' ? '🚨 Red Flag' : '🪦 Dead Weight';
}

function abbrev(name: string, maxChars = 13): string {
  const s = name.replace(/\s+(LIMITED|LTD\.?|INDUSTRIES|ENTERPRISES|CORPORATION|CORP\.?|INC\.?|PVT\.?|PRIVATE)\.?\s*$/i,'').trim();
  return s.length > maxChars ? s.slice(0, maxChars - 1) + '…' : s;
}
function holdStr(m: number) {
  if (!m) return '—';
  const y = Math.floor(m / 12), mo = m % 12;
  return y > 0 ? `${y}y ${mo}m` : `${mo}m`;
}

/* ─── Custom dot (rendered inside SVG) ──────────────────── */
function Dot(props: any) {
  const { cx, cy, payload, colorBy, xRef, hoveredName, onHover } = props;
  if (cx == null || cy == null || !payload) return null;

  const q     = quadrantOf(payload.weight, payload.ret, xRef);
  const color = colorBy === 'quadrant' ? QUADRANT_COLORS[q as keyof typeof QUADRANT_COLORS] : industryColor(payload.industry);
  const r     = Math.max(8, Math.min(30, Math.sqrt((payload.invested || 1) / 4500)));
  const isHov = hoveredName === payload.name;

  return (
    <g style={{ cursor: 'pointer' }}
      onMouseEnter={() => onHover(payload.name)}
      onMouseLeave={() => onHover(null)}>
      {/* glow ring */}
      {isHov && <circle cx={cx} cy={cy} r={r + 7} fill={color} opacity={0.18} />}
      {/* outer pulse ring */}
      <circle cx={cx} cy={cy} r={r + 3} fill={color} opacity={isHov ? 0.25 : 0.12} />
      {/* main bubble */}
      <circle cx={cx} cy={cy} r={r}
        fill={color} fillOpacity={isHov ? 1 : 0.82}
        stroke={isHov ? '#fff' : 'rgba(255,255,255,0.3)'}
        strokeWidth={isHov ? 2 : 1}
      />
      {/* label inside bubble (only if big enough) */}
      {r >= 13 && (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
          fontSize={Math.min(10, r * 0.65)} fontWeight={700} fill="#fff"
          style={{ pointerEvents: 'none', userSelect: 'none' }}>
          {abbrev(payload.name, Math.max(5, Math.floor(r / 5.5)))}
        </text>
      )}
      {/* small dot label below bubble (when hovered or medium-sized) */}
      {(isHov && r < 13) && (
        <text x={cx} y={cy + r + 9} textAnchor="middle"
          fontSize={9} fontWeight={600} fill="#e2e8f0"
          style={{ pointerEvents: 'none', userSelect: 'none' }}>
          {abbrev(payload.name, 12)}
        </text>
      )}
    </g>
  );
}

/* ─── Main component ─────────────────────────────────────── */
export default function PortfolioQuadrant({ holdings }: Props) {
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const [colorBy, setColorBy]         = useState<'industry' | 'quadrant'>('industry');
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);

  /* ── Derived data ── */
  const { data, xRef, yMin, yMax, xMax, industries, summary, topPerformers, worstPerformers } = useMemo(() => {
    const active = (holdings || []).filter(h => (h.openQty || 0) > 0 && (h.marketValue || 0) > 0);
    const totalMV = active.reduce((s, h) => s + (h.marketValue ?? 0), 0);
    if (!totalMV) return { data: [], xRef: 5, yMin: -20, yMax: 20, xMax: 15, industries: [], summary: null, topPerformers: [], worstPerformers: [] };

    const mapped = active.map(h => {
      const mv   = h.marketValue ?? 0;
      const pl   = h.profitLossTillDate ?? 0;
      const inv  = Math.max(mv - pl, 1);
      return {
        name:     h.stockName,
        weight:   +(mv / totalMV * 100).toFixed(2),
        ret:      +(h.profitLossTillDatePercent ?? 0).toFixed(2),
        invested: inv,
        mv,
        plAbs:    pl,
        industry: h.industry || 'Other',
        xirr:     h.xirr ?? 0,
        cagr:     h.cagr ?? 0,
        holdM:    (h.holdingPeriodYears ?? 0) * 12 + (h.holdingPeriodMonths ?? 0),
      };
    });

    const xRef = +(100 / mapped.length).toFixed(2);
    const rets = mapped.map(d => d.ret);
    const yPad = 8;
    const yMin = Math.min(...rets, -5) - yPad;
    const yMax = Math.max(...rets,  5) + yPad;
    const xMax = Math.max(...mapped.map(d => d.weight), xRef * 1.2) * 1.12;

    const counts = { stars: 0, gems: 0, flags: 0, dead: 0, total: mapped.length };
    mapped.forEach(d => { counts[quadrantOf(d.weight, d.ret, xRef) as keyof typeof counts]++; });

    const inds = [...new Set(mapped.map(d => d.industry))].sort();
    const sorted = [...mapped].sort((a, b) => b.ret - a.ret);
    const topPerformers  = sorted.slice(0, 3);
    const worstPerformers = sorted.slice(-3).reverse();

    return { data: mapped, xRef, yMin, yMax, xMax, industries: inds, summary: counts, topPerformers, worstPerformers };
  }, [holdings]);

  /* ── Filtered display data ── */
  const displayData = useMemo(() =>
    selectedIndustry ? data.map(d => ({ ...d, _dim: d.industry !== selectedIndustry })) : data
  , [data, selectedIndustry]);

  if (!data.length) return null;

  const quadCards = [
    { key: 'stars', emoji: '⭐', label: 'Stars',       count: summary?.stars ?? 0,  color: QUADRANT_COLORS.stars, bg: 'rgba(16,185,129,0.09)', border: 'rgba(16,185,129,0.25)', tip: 'Overweight & outperforming — keep & add' },
    { key: 'gems',  emoji: '💎', label: 'Hidden Gems', count: summary?.gems  ?? 0,  color: QUADRANT_COLORS.gems,  bg: 'rgba(129,140,248,0.09)', border: 'rgba(129,140,248,0.25)', tip: 'Underweight & outperforming — scale up?' },
    { key: 'flags', emoji: '🚨', label: 'Red Flags',   count: summary?.flags ?? 0,  color: QUADRANT_COLORS.flags, bg: 'rgba(244,63,94,0.09)',   border: 'rgba(244,63,94,0.25)',  tip: 'Overweight & underperforming — review' },
    { key: 'dead',  emoji: '🪦', label: 'Dead Weight', count: summary?.dead  ?? 0,  color: QUADRANT_COLORS.dead,  bg: 'rgba(107,114,128,0.09)', border: 'rgba(107,114,128,0.2)', tip: 'Underweight & underperforming — exit?' },
  ];

  return (
    <div className="card p-6 animate-fadeIn" style={{ background: 'var(--bg-card)' }}>

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(180deg,#818cf8,#10b981)' }} />
            <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--text-hi)' }}>
              Portfolio Quadrant Matrix
            </h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(129,140,248,0.15)', color: '#818cf8' }}>
              BCG-Style Analysis
            </span>
          </div>
          <p className="text-xs ml-3" style={{ color: 'var(--text-lo)' }}>
            Bubble size = invested · X = portfolio weight % · Y = return % · Hover for details
          </p>
        </div>
        {/* Controls */}
        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
            {(['industry', 'quadrant'] as const).map(opt => (
              <button key={opt} onClick={() => setColorBy(opt)}
                className="px-3 py-1 rounded-md text-xs font-semibold transition-all"
                style={{
                  background: colorBy === opt ? 'var(--bg-card)' : 'transparent',
                  color:      colorBy === opt ? 'var(--brand)'   : 'var(--text-lo)',
                  boxShadow:  colorBy === opt ? '0 1px 3px rgba(0,0,0,0.25)' : 'none',
                }}>
                {opt === 'industry' ? '🏭 Industry' : '🎯 Quadrant'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 4 quadrant stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {quadCards.map(q => (
          <div key={q.key} className="rounded-2xl p-4 transition-transform hover:scale-[1.02]"
            style={{ background: q.bg, border: `1px solid ${q.border}` }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xl">{q.emoji}</span>
              <span className="text-2xl font-black" style={{ color: q.color }}>{q.count}</span>
            </div>
            <p className="text-sm font-bold" style={{ color: q.color }}>{q.label}</p>
            <p className="text-[10px] mt-0.5 leading-snug" style={{ color: 'var(--text-lo)' }}>{q.tip}</p>
          </div>
        ))}
      </div>

      {/* ── Main chart ── */}
      <div className="rounded-2xl p-3 mb-5"
        style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
        <div style={{ width: '100%', height: 440 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 24, right: 40, bottom: 44, left: 16 }}>

              {/* Quadrant background fills */}
              <ReferenceArea x1={xRef} x2={xMax} y1={0}    y2={yMax} fill="#10b981" fillOpacity={0.05} />
              <ReferenceArea x1={0}    x2={xRef} y1={0}    y2={yMax} fill="#818cf8" fillOpacity={0.05} />
              <ReferenceArea x1={xRef} x2={xMax} y1={yMin} y2={0}    fill="#f43f5e" fillOpacity={0.05} />
              <ReferenceArea x1={0}    x2={xRef} y1={yMin} y2={0}    fill="#6b7280" fillOpacity={0.04} />

              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />

              <XAxis type="number" dataKey="weight" domain={[0, xMax]}
                tickFormatter={v => `${v.toFixed(1)}%`}
                tick={{ fill: '#6b7280', fontSize: 11 }} stroke="#374151">
                <Label value="Portfolio Weight  (%)" position="insideBottom" offset={-28}
                  style={{ fill: '#6b7280', fontSize: 12 }} />
              </XAxis>

              <YAxis type="number" dataKey="ret" domain={[yMin, yMax]}
                tickFormatter={v => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
                tick={{ fill: '#6b7280', fontSize: 11 }} stroke="#374151" width={46}>
                <Label value="Return (%)" angle={-90} position="insideLeft" offset={14}
                  style={{ fill: '#6b7280', fontSize: 12 }} />
              </YAxis>

              {/* Divider: 0% return */}
              <ReferenceLine y={0} stroke="#f43f5e" strokeWidth={1.5}
                strokeDasharray="8 4" opacity={0.55}>
                <Label value="Break-even" position="insideBottomRight"
                  style={{ fill: '#f43f5e', fontSize: 10, fontWeight: 600 }} />
              </ReferenceLine>

              {/* Divider: equal-weight benchmark */}
              <ReferenceLine x={xRef} stroke="#818cf8" strokeWidth={1.5}
                strokeDasharray="8 4" opacity={0.55}>
                <Label value={`Equal weight  ${xRef.toFixed(1)}%`} position="insideTopRight"
                  style={{ fill: '#818cf8', fontSize: 10, fontWeight: 600 }} />
              </ReferenceLine>

              {/* Quadrant corner watermarks */}
              <ReferenceLine x={xMax * 0.72} y={yMax * 0.75} stroke="none">
                <Label value="⭐ STARS"
                  style={{ fill: 'rgba(16,185,129,0.45)', fontSize: 13, fontWeight: 800, letterSpacing: 1 }} />
              </ReferenceLine>
              <ReferenceLine x={xMax * 0.08} y={yMax * 0.75} stroke="none">
                <Label value="💎 GEMS"
                  style={{ fill: 'rgba(129,140,248,0.45)', fontSize: 13, fontWeight: 800, letterSpacing: 1 }} />
              </ReferenceLine>
              <ReferenceLine x={xMax * 0.72} y={yMin * 0.72} stroke="none">
                <Label value="🚨 RED FLAGS"
                  style={{ fill: 'rgba(244,63,94,0.45)', fontSize: 13, fontWeight: 800, letterSpacing: 1 }} />
              </ReferenceLine>
              <ReferenceLine x={xMax * 0.06} y={yMin * 0.72} stroke="none">
                <Label value="🪦 DEAD WEIGHT"
                  style={{ fill: 'rgba(107,114,128,0.40)', fontSize: 13, fontWeight: 800, letterSpacing: 1 }} />
              </ReferenceLine>

              {/* Rich tooltip */}
              <Tooltip cursor={false}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  if (!d) return null;
                  const pos = d.ret >= 0;
                  const q   = quadrantOf(d.weight, d.ret, xRef);
                  const qc  = QUADRANT_COLORS[q as keyof typeof QUADRANT_COLORS];
                  return (
                    <div className="rounded-2xl overflow-hidden shadow-2xl text-sm"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', minWidth: 230 }}>
                      {/* colour band top */}
                      <div className="px-4 pt-3 pb-2" style={{ background: `${qc}18`, borderBottom: `1px solid ${qc}30` }}>
                        <p className="font-black text-[13px] leading-tight" style={{ color: 'var(--text-hi)' }}>{d.name}</p>
                        <div className="flex items-center justify-between mt-1 gap-3">
                          <span className="text-[10px]" style={{ color: 'var(--text-lo)' }}>{d.industry}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: `${qc}25`, color: qc }}>
                            {quadrantLabel(q)}
                          </span>
                        </div>
                      </div>
                      {/* data rows */}
                      <div className="px-4 py-3 space-y-1.5">
                        {[
                          { l: 'Return',           v: `${pos?'+':''}${d.ret.toFixed(2)}%`,          c: pos?'var(--gain)':'var(--loss)' },
                          { l: 'Gain / Loss',      v: `${pos?'+':''}${formatCurrency(d.plAbs)}`,    c: pos?'var(--gain)':'var(--loss)' },
                          { l: 'Portfolio Weight', v: `${d.weight.toFixed(2)}%`,                    c: 'var(--text-hi)' },
                          { l: 'Market Value',     v: formatCurrency(d.mv),                         c: 'var(--text-hi)' },
                          { l: 'Invested',         v: formatCurrency(d.invested),                   c: 'var(--text-lo)' },
                          { l: 'Holding Period',   v: holdStr(d.holdM),                             c: 'var(--text-hi)' },
                          { l: 'XIRR',             v: d.xirr ? `${d.xirr.toFixed(1)}%` : '—',     c: d.xirr>0?'var(--gain)':'var(--loss)' },
                        ].map(({ l, v, c }) => (
                          <div key={l} className="flex justify-between gap-6">
                            <span style={{ color: 'var(--text-lo)' }}>{l}</span>
                            <span className="font-semibold" style={{ color: c }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }}
              />

              <Scatter data={displayData} isAnimationActive={false}
                shape={(p: any) => (
                  <Dot {...p} colorBy={colorBy} xRef={xRef}
                    hoveredName={hoveredName} onHover={setHoveredName} />
                )}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Industry legend / filter ── */}
      {colorBy === 'industry' && industries.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2"
            style={{ color: 'var(--text-lo)' }}>Filter by industry</p>
          <div className="flex flex-wrap gap-2">
            {industries.map(ind => {
              const active = selectedIndustry === ind;
              return (
                <button key={ind} onClick={() => setSelectedIndustry(active ? null : ind)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all"
                  style={{
                    background: active ? `${industryColor(ind)}22` : 'var(--bg-raised)',
                    border:     `1px solid ${active ? industryColor(ind) : 'var(--border-sm)'}`,
                    color:      active ? industryColor(ind) : 'var(--text-lo)',
                  }}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: industryColor(ind) }} />
                  {ind}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Top / Worst performers strip ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        {/* Top performers */}
        <div className="rounded-2xl p-4"
          style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)' }}>
          <p className="text-[11px] font-bold uppercase tracking-wide mb-3"
            style={{ color: '#10b981' }}>🏆 Top Performers</p>
          <div className="space-y-2">
            {topPerformers.map((s, i) => (
              <div key={s.name} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-black w-4 flex-shrink-0"
                    style={{ color: '#10b981' }}>{i + 1}</span>
                  <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-hi)' }}>
                    {abbrev(s.name, 18)}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px]" style={{ color: 'var(--text-lo)' }}>
                    {s.weight.toFixed(1)}%
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                    +{s.ret.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Worst performers */}
        <div className="rounded-2xl p-4"
          style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.18)' }}>
          <p className="text-[11px] font-bold uppercase tracking-wide mb-3"
            style={{ color: '#f43f5e' }}>📉 Needs Attention</p>
          <div className="space-y-2">
            {worstPerformers.map((s, i) => (
              <div key={s.name} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-black w-4 flex-shrink-0"
                    style={{ color: '#f43f5e' }}>{i + 1}</span>
                  <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-hi)' }}>
                    {abbrev(s.name, 18)}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px]" style={{ color: 'var(--text-lo)' }}>
                    {s.weight.toFixed(1)}%
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(244,63,94,0.15)', color: '#f43f5e' }}>
                    {s.ret.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Actionable Insights ── */}
      {summary && (summary.flags > 0 || summary.gems > 0 || summary.dead > 0) && (
        <div className="rounded-2xl p-4 space-y-2"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
          <p className="text-[11px] font-bold uppercase tracking-widest mb-3"
            style={{ color: 'var(--text-lo)' }}>💡 Actionable Insights</p>
          <div className="space-y-2">
            {summary.flags > 0 && (
              <div className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-xs"
                style={{ background: 'rgba(244,63,94,0.07)', border: '1px solid rgba(244,63,94,0.2)' }}>
                <span className="mt-0.5">🚨</span>
                <span style={{ color: '#fca5a5' }}>
                  <strong style={{ color: '#f87171' }}>{summary.flags} Red Flag{summary.flags > 1 ? 's' : ''}</strong>
                  {' '}— heavy positions with negative returns. These are dragging your overall portfolio.
                  Consider trimming allocation or setting stop-loss targets.
                </span>
              </div>
            )}
            {summary.gems > 0 && (
              <div className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-xs"
                style={{ background: 'rgba(129,140,248,0.07)', border: '1px solid rgba(129,140,248,0.2)' }}>
                <span className="mt-0.5">💎</span>
                <span style={{ color: '#c7d2fe' }}>
                  <strong style={{ color: '#a5b4fc' }}>{summary.gems} Hidden Gem{summary.gems > 1 ? 's' : ''}</strong>
                  {' '}— small allocations outperforming the benchmark. These deserve more capital.
                  Consider increasing their portfolio weight.
                </span>
              </div>
            )}
            {summary.dead > 0 && (
              <div className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-xs"
                style={{ background: 'rgba(107,114,128,0.07)', border: '1px solid rgba(107,114,128,0.2)' }}>
                <span className="mt-0.5">🪦</span>
                <span style={{ color: '#d1d5db' }}>
                  <strong style={{ color: '#9ca3af' }}>{summary.dead} Dead Weight stock{summary.dead > 1 ? 's' : ''}</strong>
                  {' '}— small, underperforming positions consuming mental bandwidth.
                  Consider exiting and redeploying capital into Gems or Stars.
                </span>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
