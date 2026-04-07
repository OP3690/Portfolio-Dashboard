'use client';

import { useMemo, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell, Label,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';

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

/* Consistent color per industry */
const INDUSTRY_COLORS: Record<string, string> = {
  'Banking':             '#6366f1',
  'Financial Services':  '#8b5cf6',
  'IT':                  '#06b6d4',
  'Technology':          '#06b6d4',
  'Pharma':              '#10b981',
  'Healthcare':          '#10b981',
  'FMCG':                '#f59e0b',
  'Consumer':            '#f59e0b',
  'Auto':                '#ef4444',
  'Automobile':          '#ef4444',
  'Energy':              '#f97316',
  'Oil & Gas':           '#f97316',
  'Metals':              '#a1a1aa',
  'Infrastructure':      '#84cc16',
  'Real Estate':         '#ec4899',
  'Telecom':             '#14b8a6',
  'Media':               '#a78bfa',
  'Chemicals':           '#fb923c',
  'Cement':              '#d4d4d8',
};
function industryColor(ind: string): string {
  for (const [key, val] of Object.entries(INDUSTRY_COLORS)) {
    if (ind?.toLowerCase().includes(key.toLowerCase())) return val;
  }
  // Deterministic fallback from string hash
  const hash = [...(ind || 'Other')].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const palette = ['#f43f5e','#e879f9','#38bdf8','#34d399','#fbbf24','#a3e635','#fb923c'];
  return palette[hash % palette.length];
}

function abbrev(name: string, max = 14): string {
  const cleaned = name
    .replace(/\s+(LIMITED|LTD|INDUSTRIES|ENTERPRISES|CORPORATION|CORP|INC|PVT|PRIVATE)\.?$/i, '')
    .trim();
  return cleaned.length > max ? cleaned.slice(0, max - 2) + '…' : cleaned;
}

/* Custom scatter dot — sized by investment */
const CustomDot = (props: any) => {
  const { cx, cy, payload, highlighted } = props;
  if (cx == null || cy == null) return null;
  const r = Math.max(6, Math.min(28, Math.sqrt(payload.invested / 5000)));
  const color = industryColor(payload.industry || '');
  const isHighlighted = highlighted === payload.name;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 3} fill={color} opacity={0.15} />
      <circle cx={cx} cy={cy} r={r}
        fill={color}
        stroke={isHighlighted ? '#fff' : color}
        strokeWidth={isHighlighted ? 2 : 0.8}
        opacity={0.88}
        style={{ cursor: 'pointer' }}
      />
      {r > 14 && (
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fontSize={9} fontWeight={700} fill="#fff" style={{ pointerEvents: 'none', userSelect: 'none' }}>
          {abbrev(payload.name, 8)}
        </text>
      )}
    </g>
  );
};

/* Quadrant background overlay using a custom SVG layer */
const QuadrantOverlay = ({ xRef, yRef, xMax, yMin, yMax, width, height, xScale, yScale }: any) => {
  if (!xScale || !yScale) return null;
  const x0 = xScale(0);
  const xR = xScale(xRef);
  const y0 = yScale(0);
  return (
    <g>
      {/* Stars: right of xRef, above y=0 */}
      <rect x={xR} y={0} width={width - xR} height={y0}
        fill="#05966920" stroke="none" />
      {/* Hidden Gems: left of xRef, above y=0 */}
      <rect x={x0} y={0} width={xR - x0} height={y0}
        fill="#6366f112" stroke="none" />
      {/* Red Flags: right of xRef, below y=0 */}
      <rect x={xR} y={y0} width={width - xR} height={height - y0}
        fill="#e11d4820" stroke="none" />
      {/* Dead Weight: left of xRef, below y=0 */}
      <rect x={x0} y={y0} width={xR - x0} height={height - y0}
        fill="#9ca3af10" stroke="none" />
    </g>
  );
};

export default function PortfolioQuadrant({ holdings }: Props) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [colorBy, setColorBy] = useState<'industry' | 'quadrant'>('industry');

  const { data, xRef, industries, summary } = useMemo(() => {
    const active = (holdings || []).filter(
      h => (h.openQty || 0) > 0 && (h.marketValue || 0) > 0
    );
    const totalMV = active.reduce((s, h) => s + (h.marketValue ?? 0), 0);
    if (!totalMV) return { data: [], xRef: 5, industries: [], summary: null };

    const mapped = active.map(h => {
      const mv       = h.marketValue ?? 0;
      const pl       = h.profitLossTillDate ?? 0;
      const invested = Math.max(mv - pl, 1);
      const weight   = (mv / totalMV) * 100;
      const ret      = h.profitLossTillDatePercent ?? 0;
      const holdM    = (h.holdingPeriodYears ?? 0) * 12 + (h.holdingPeriodMonths ?? 0);
      return {
        name:     h.stockName,
        weight:   +weight.toFixed(2),
        ret:      +ret.toFixed(2),
        invested,
        mv,
        plAbs:    pl,
        industry: h.industry || 'Other',
        xirr:     h.xirr ?? 0,
        cagr:     h.cagr ?? 0,
        holdM,
      };
    });

    const avgWeight = 100 / mapped.length;  // equal-weight benchmark
    const xRef = +avgWeight.toFixed(2);

    const stars  = mapped.filter(d => d.weight >= xRef && d.ret > 0);
    const gems   = mapped.filter(d => d.weight < xRef && d.ret > 0);
    const flags  = mapped.filter(d => d.weight >= xRef && d.ret <= 0);
    const dead   = mapped.filter(d => d.weight < xRef && d.ret <= 0);

    const inds = [...new Set(mapped.map(d => d.industry))].sort();

    return {
      data:       mapped,
      xRef,
      industries: inds,
      summary: { stars: stars.length, gems: gems.length, flags: flags.length, dead: dead.length, total: mapped.length },
    };
  }, [holdings]);

  const yMin = useMemo(() => Math.min(...data.map(d => d.ret), -5) - 5, [data]);
  const yMax = useMemo(() => Math.max(...data.map(d => d.ret), 5) + 5, [data]);
  const xMax = useMemo(() => Math.max(...data.map(d => d.weight), xRef) + 2, [data, xRef]);

  if (!data.length) return null;

  const quadrantConfig = [
    { key: 'stars',  emoji: '⭐', label: 'Stars',        count: summary?.stars ?? 0,  color: '#059669', bg: 'rgba(5,150,105,0.1)',   desc: 'High weight · High return' },
    { key: 'gems',   emoji: '💎', label: 'Hidden Gems',  count: summary?.gems ?? 0,   color: '#6366f1', bg: 'rgba(99,102,241,0.1)',  desc: 'Low weight · High return' },
    { key: 'flags',  emoji: '🚨', label: 'Red Flags',    count: summary?.flags ?? 0,  color: '#e11d48', bg: 'rgba(225,29,72,0.1)',   desc: 'High weight · Poor return' },
    { key: 'dead',   emoji: '🪦', label: 'Dead Weight',  count: summary?.dead ?? 0,   color: '#6b7280', bg: 'rgba(107,114,128,0.1)', desc: 'Low weight · Poor return' },
  ];

  return (
    <div className="card p-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="section-title text-base flex items-center gap-2">
            <div className="w-1 h-5 rounded-full" style={{ background: 'var(--brand)' }} />
            Portfolio Quadrant Matrix
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
            Each bubble = one stock · Size = invested value · X = portfolio weight % · Y = return %
          </p>
        </div>
        {/* Colour toggle */}
        <div className="flex gap-1.5 p-1 rounded-lg" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
          {(['industry', 'quadrant'] as const).map(opt => (
            <button key={opt} onClick={() => setColorBy(opt)}
              className="px-3 py-1 rounded-md text-xs font-semibold transition-all capitalize"
              style={{
                background: colorBy === opt ? 'var(--bg-card)' : 'transparent',
                color:      colorBy === opt ? 'var(--brand)' : 'var(--text-lo)',
                boxShadow:  colorBy === opt ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
              }}>
              {opt === 'industry' ? 'By Industry' : 'By Quadrant'}
            </button>
          ))}
        </div>
      </div>

      {/* Quadrant legend pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {quadrantConfig.map(q => (
          <div key={q.key} className="rounded-xl p-3 flex items-start gap-2"
            style={{ background: q.bg, border: `1px solid ${q.color}30` }}>
            <span className="text-lg leading-none mt-0.5">{q.emoji}</span>
            <div>
              <p className="text-xs font-bold" style={{ color: q.color }}>{q.label}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-lo)' }}>{q.desc}</p>
              <p className="text-sm font-bold mt-1" style={{ color: q.color }}>{q.count} stocks</p>
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ width: '100%', height: 420 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-sm)" opacity={0.5} />

            <XAxis
              type="number" dataKey="weight"
              domain={[0, xMax]}
              tickFormatter={v => `${v.toFixed(1)}%`}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              stroke="#4b5563"
              label={{ value: 'Portfolio Weight (%)', position: 'insideBottom', offset: -25, fill: '#6b7280', fontSize: 12 }}
            />
            <YAxis
              type="number" dataKey="ret"
              domain={[yMin, yMax]}
              tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              stroke="#4b5563"
              label={{ value: 'Return (%)', angle: -90, position: 'insideLeft', offset: 10, fill: '#6b7280', fontSize: 12 }}
            />

            {/* Divider lines */}
            <ReferenceLine y={0} stroke="#e11d48" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.7}>
              <Label value="0% Return" position="right" fill="#e11d48" fontSize={10} />
            </ReferenceLine>
            <ReferenceLine x={xRef} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.7}>
              <Label value={`Avg weight ${xRef.toFixed(1)}%`} position="top" fill="#6366f1" fontSize={10} />
            </ReferenceLine>

            {/* Quadrant corner labels */}
            <ReferenceLine y={yMax * 0.75} stroke="none">
              <Label
                value="⭐ STARS"
                position="insideTopRight"
                fill="#059669" fontSize={11} fontWeight={700}
              />
            </ReferenceLine>
            <ReferenceLine y={yMax * 0.75} stroke="none">
              <Label
                value="💎 HIDDEN GEMS"
                position="insideTopLeft"
                fill="#6366f1" fontSize={11} fontWeight={700}
              />
            </ReferenceLine>
            <ReferenceLine y={yMin * 0.6} stroke="none">
              <Label
                value="🚨 RED FLAGS"
                position="insideBottomRight"
                fill="#e11d48" fontSize={11} fontWeight={700}
              />
            </ReferenceLine>
            <ReferenceLine y={yMin * 0.6} stroke="none">
              <Label
                value="🪦 DEAD WEIGHT"
                position="insideBottomLeft"
                fill="#6b7280" fontSize={11} fontWeight={700}
              />
            </ReferenceLine>

            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                if (!d) return null;
                const isPos = d.ret >= 0;
                const holdStr = d.holdM > 0
                  ? d.holdM >= 12
                    ? `${Math.floor(d.holdM / 12)}y ${d.holdM % 12}m`
                    : `${d.holdM}m`
                  : '—';
                const quad = d.weight >= xRef
                  ? (d.ret > 0 ? '⭐ Star' : '🚨 Red Flag')
                  : (d.ret > 0 ? '💎 Hidden Gem' : '🪦 Dead Weight');
                return (
                  <div className="card p-3 text-sm min-w-[220px]">
                    <p className="font-bold text-hi mb-1.5 pb-1.5 leading-tight"
                      style={{ borderBottom: '1px solid var(--border-sm)' }}>
                      {d.name}
                    </p>
                    <p className="text-[10px] mb-2 flex justify-between">
                      <span style={{ color: 'var(--text-lo)' }}>{d.industry}</span>
                      <span className="font-bold ml-2">{quad}</span>
                    </p>
                    <div className="space-y-1.5">
                      {[
                        { label: 'Return',          val: `${isPos ? '+' : ''}${d.ret.toFixed(2)}%`,       color: isPos ? 'var(--gain)' : 'var(--loss)' },
                        { label: 'Portfolio Weight', val: `${d.weight.toFixed(2)}%`,                       color: 'var(--text-hi)' },
                        { label: 'Gain / Loss',     val: `${isPos ? '+' : ''}${formatCurrency(d.plAbs)}`, color: isPos ? 'var(--gain)' : 'var(--loss)' },
                        { label: 'Invested',        val: formatCurrency(d.invested),                      color: 'var(--text-hi)' },
                        { label: 'Market Value',    val: formatCurrency(d.mv),                            color: 'var(--text-hi)' },
                        { label: 'Holding Period',  val: holdStr,                                         color: 'var(--text-hi)' },
                        { label: 'XIRR',            val: d.xirr ? `${d.xirr.toFixed(1)}%` : '—',        color: d.xirr > 0 ? 'var(--gain)' : 'var(--loss)' },
                      ].map(({ label, val, color }) => (
                        <div key={label} className="flex justify-between gap-5">
                          <span style={{ color: 'var(--text-lo)' }}>{label}</span>
                          <span className="font-semibold" style={{ color }}>{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }}
            />

            <Scatter
              data={data}
              shape={(props: any) => (
                <CustomDot {...props} highlighted={highlighted} />
              )}
              onMouseEnter={(d: any) => setHighlighted(d.name)}
              onMouseLeave={() => setHighlighted(null)}
            >
              {data.map((entry, i) => {
                const color = colorBy === 'quadrant'
                  ? entry.weight >= xRef
                    ? (entry.ret > 0 ? '#059669' : '#e11d48')
                    : (entry.ret > 0 ? '#6366f1' : '#6b7280')
                  : industryColor(entry.industry);
                return <Cell key={i} fill={color} />;
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Industry legend (only in By Industry mode) */}
      {colorBy === 'industry' && industries.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-4 pt-3" style={{ borderTop: '1px solid var(--border-sm)' }}>
          <span className="text-[10px] font-semibold uppercase tracking-wide mr-1 self-center" style={{ color: 'var(--text-lo)' }}>Industry</span>
          {industries.map(ind => (
            <div key={ind} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: industryColor(ind) }} />
              <span className="text-[10px]" style={{ color: 'var(--text-lo)' }}>{ind}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action insights */}
      {summary && (summary.flags > 0 || summary.gems > 0) && (
        <div className="mt-4 pt-3 space-y-2" style={{ borderTop: '1px solid var(--border-sm)' }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-lo)' }}>Actionable Insights</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {summary.flags > 0 && (
              <div className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
                style={{ background: 'rgba(225,29,72,0.07)', border: '1px solid rgba(225,29,72,0.2)' }}>
                <span className="text-sm">🚨</span>
                <span style={{ color: '#f87171' }}>
                  <strong>{summary.flags} Red Flag{summary.flags > 1 ? 's' : ''}</strong> — large positions
                  with negative returns. Review allocation or set stop-loss targets.
                </span>
              </div>
            )}
            {summary.gems > 0 && (
              <div className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
                style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <span className="text-sm">💎</span>
                <span style={{ color: '#a5b4fc' }}>
                  <strong>{summary.gems} Hidden Gem{summary.gems > 1 ? 's' : ''}</strong> — small positions
                  outperforming the benchmark. Consider increasing allocation.
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
