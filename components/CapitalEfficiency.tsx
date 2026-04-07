'use client';

import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ZAxis, Cell,
} from 'recharts';
import { useMemo, useState } from 'react';

/* ─── types ─── */
interface Holding {
  stockName?: string;
  sectorName?: string;
  investmentAmount?: number;
  marketValue?: number;
  profitLossTillDate?: number;
  profitLossTillDatePercent?: number;
  xirr?: number;
  holdingPeriodYears?: number;
  holdingPeriodMonths?: number;
  openQty?: number;
}

interface Props {
  holdings: Holding[];
}

/* ─── helpers ─── */
function fmt(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000)       return `₹${(v / 1_000).toFixed(1)}k`;
  return `₹${v.toFixed(0)}`;
}

function quadrant(weight: number, ret: number, avgWeight: number): {
  label: string; color: string; bg: string; icon: string;
} {
  const highW = weight >= avgWeight;
  const highR = ret >= 0;
  if (highW && highR)  return { label: 'Capital Champion', color: '#22c55e', bg: '#052e16', icon: '🏆' };
  if (!highW && highR) return { label: 'Hidden Gem',       color: '#38bdf8', bg: '#0c1a2e', icon: '💎' };
  if (highW && !highR) return { label: 'Capital Trap',     color: '#f87171', bg: '#2d0a0a', icon: '🚨' };
  return                      { label: 'Small Loser',      color: '#fbbf24', bg: '#1f1200', icon: '⚠️' };
}

/* ─── custom tooltip ─── */
function ScatterTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="card p-3 text-xs space-y-1.5" style={{ minWidth: 180, border: '1px solid var(--border)' }}>
      <p className="font-bold text-hi truncate">{d.name}</p>
      {d.sector && <p className="text-lo">{d.sector}</p>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
        <span className="text-lo">Weight</span>
        <span className="font-semibold text-hi text-right">{d.weight.toFixed(1)}%</span>
        <span className="text-lo">Return</span>
        <span className={`font-semibold text-right ${d.ret >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {d.ret >= 0 ? '+' : ''}{d.ret.toFixed(1)}%
        </span>
        <span className="text-lo">P&L</span>
        <span className={`font-semibold text-right ${d.pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {d.pl >= 0 ? '+' : ''}{fmt(d.pl)}
        </span>
        {d.xirr != null && (
          <>
            <span className="text-lo">XIRR</span>
            <span className={`font-semibold text-right ${d.xirr >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {(d.xirr * 100).toFixed(1)}%
            </span>
          </>
        )}
        <span className="text-lo">Efficiency</span>
        <span className="font-semibold text-hi text-right">{d.efficiency.toFixed(1)}</span>
      </div>
      <div className="mt-1 pt-1 flex items-center gap-1" style={{ borderTop: '1px solid var(--border)' }}>
        <span>{d.q.icon}</span>
        <span className="font-semibold" style={{ color: d.q.color }}>{d.q.label}</span>
      </div>
    </div>
  );
}

/* ─── main ─── */
export default function CapitalEfficiency({ holdings }: Props) {
  const [sort, setSort] = useState<'efficiency' | 'return' | 'weight' | 'pl'>('efficiency');
  const [filter, setFilter] = useState<'all' | 'champion' | 'gem' | 'trap' | 'loser'>('all');

  const totalInvested = useMemo(
    () => holdings.reduce((s, h) => s + (h.investmentAmount ?? 0), 0),
    [holdings],
  );

  const points = useMemo(() => {
    const avgWeight = 100 / (holdings.length || 1);
    return holdings.map(h => {
      const weight = totalInvested > 0 ? ((h.investmentAmount ?? 0) / totalInvested) * 100 : 0;
      const ret    = h.profitLossTillDatePercent ?? 0;
      const pl     = h.profitLossTillDate ?? ((h.marketValue ?? 0) - (h.investmentAmount ?? 0));
      const xirr   = h.xirr ?? null;
      // Efficiency = return per unit of weight (positive = good use of capital)
      const efficiency = weight > 0 ? ret / weight : 0;
      const q = quadrant(weight, ret, avgWeight);
      return {
        name: h.stockName || 'Unknown',
        sector: h.sectorName || '',
        weight, ret, pl, xirr, efficiency, q,
        invested: h.investmentAmount ?? 0,
        // bubble size proportional to absolute P&L (min 200, max 2000)
        z: Math.max(200, Math.min(2000, Math.abs(pl) / 500 + 200)),
      };
    });
  }, [holdings, totalInvested]);

  /* summary counts */
  const counts = useMemo(() => {
    const c = { champion: 0, gem: 0, trap: 0, loser: 0 };
    points.forEach(p => {
      if (p.q.label === 'Capital Champion') c.champion++;
      else if (p.q.label === 'Hidden Gem')  c.gem++;
      else if (p.q.label === 'Capital Trap') c.trap++;
      else c.loser++;
    });
    return c;
  }, [points]);

  /* axis domains */
  const weights = points.map(p => p.weight);
  const rets    = points.map(p => p.ret);
  const xMax = Math.ceil(Math.max(...weights, 20) * 1.1);
  const yMin = Math.floor(Math.min(...rets, -10) * 1.1);
  const yMax = Math.ceil(Math.max(...rets, 10)  * 1.1);
  const avgWeight = 100 / (holdings.length || 1);

  /* table data */
  const tableData = useMemo(() => {
    let rows = [...points];
    if (filter === 'champion') rows = rows.filter(p => p.q.label === 'Capital Champion');
    else if (filter === 'gem') rows = rows.filter(p => p.q.label === 'Hidden Gem');
    else if (filter === 'trap') rows = rows.filter(p => p.q.label === 'Capital Trap');
    else if (filter === 'loser') rows = rows.filter(p => p.q.label === 'Small Loser');

    if (sort === 'efficiency') return [...rows].sort((a, b) => b.efficiency - a.efficiency);
    if (sort === 'return')     return [...rows].sort((a, b) => b.ret - a.ret);
      if (sort === 'weight')   return [...rows].sort((a, b) => b.weight - a.weight);
    return [...rows].sort((a, b) => b.pl - a.pl);
  }, [points, sort, filter]);

  /* top/bottom insight */
  const bestGem  = [...points].filter(p => p.q.label === 'Hidden Gem').sort((a, b) => b.ret - a.ret)[0];
  const worstTrap = [...points].filter(p => p.q.label === 'Capital Trap').sort((a, b) => a.ret - b.ret)[0];
  const topChamp = [...points].filter(p => p.q.label === 'Capital Champion').sort((a, b) => b.pl - a.pl)[0];

  if (!points.length) return null;

  return (
    <div className="card p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-hi">Capital Allocation Efficiency</h3>
          <p className="text-xs text-lo mt-0.5">
            Are you putting your money in the right stocks? · Weight vs Return analysis
          </p>
        </div>
      </div>

      {/* Quadrant summary pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'champion', label: 'Capital Champions', icon: '🏆', count: counts.champion, color: '#22c55e', sub: 'High weight, high return', bg: '#052e16' },
          { key: 'gem',      label: 'Hidden Gems',       icon: '💎', count: counts.gem,      color: '#38bdf8', sub: 'Low weight, high return', bg: '#0c1a2e' },
          { key: 'trap',     label: 'Capital Traps',     icon: '🚨', count: counts.trap,     color: '#f87171', sub: 'High weight, low return', bg: '#2d0a0a' },
          { key: 'loser',    label: 'Small Losers',      icon: '⚠️', count: counts.loser,    color: '#fbbf24', sub: 'Low weight, low return',  bg: '#1f1200' },
        ].map(q => (
          <div key={q.key} className="rounded-xl p-3 text-center cursor-pointer transition-all"
            style={{
              background: q.bg,
              border: `1px solid ${filter === q.key ? q.color : 'var(--border)'}`,
              opacity: filter !== 'all' && filter !== q.key ? 0.5 : 1,
            }}
            onClick={() => setFilter(f => f === q.key as any ? 'all' : q.key as any)}>
            <p className="text-lg">{q.icon}</p>
            <p className="text-lg font-bold mt-0.5" style={{ color: q.color }}>{q.count}</p>
            <p className="text-xs font-semibold" style={{ color: q.color }}>{q.label}</p>
            <p className="text-xs text-lo mt-0.5">{q.sub}</p>
          </div>
        ))}
      </div>

      {/* Scatter chart */}
      <div className="relative">
        <div style={{ height: 380 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 36, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
              <XAxis
                type="number"
                dataKey="weight"
                domain={[0, xMax]}
                tickFormatter={v => `${v.toFixed(0)}%`}
                tick={{ fill: 'var(--text-lo)', fontSize: 10 }}
                label={{ value: 'Portfolio Weight %', position: 'insideBottom', offset: -22, fill: 'var(--text-lo)', fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="ret"
                domain={[yMin, yMax]}
                tickFormatter={v => `${v}%`}
                tick={{ fill: 'var(--text-lo)', fontSize: 10 }}
                width={48}
                label={{ value: 'Return %', angle: -90, position: 'insideLeft', fill: 'var(--text-lo)', fontSize: 11, dy: 36 }}
              />
              <ZAxis type="number" dataKey="z" range={[60, 600]} />
              <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />

              {/* Zero-return line */}
              <ReferenceLine y={0} stroke="var(--text-lo)" strokeDasharray="4 2" strokeOpacity={0.5} />
              {/* Average weight line */}
              <ReferenceLine x={avgWeight} stroke="var(--brand)" strokeDasharray="4 2" strokeOpacity={0.4} />

              <Scatter data={points} isAnimationActive={false}>
                {points.map((p, i) => (
                  <Cell
                    key={i}
                    fill={p.q.color}
                    fillOpacity={filter === 'all' || filter === (
                      p.q.label === 'Capital Champion' ? 'champion' :
                      p.q.label === 'Hidden Gem' ? 'gem' :
                      p.q.label === 'Capital Trap' ? 'trap' : 'loser'
                    ) ? 0.75 : 0.15}
                    stroke={p.q.color}
                    strokeWidth={1}
                    strokeOpacity={0.9}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Quadrant labels — absolute overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{ padding: '20px 20px 56px 64px' }}>
          <div className="relative w-full h-full">
            {/* top-left: Hidden Gems */}
            <div className="absolute" style={{ left: '2%', top: '4%' }}>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#0c1a2e', color: '#38bdf8', border: '1px solid #38bdf8', opacity: 0.85 }}>
                💎 Hidden Gems
              </span>
            </div>
            {/* top-right: Capital Champions */}
            <div className="absolute" style={{ right: '2%', top: '4%' }}>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#052e16', color: '#22c55e', border: '1px solid #22c55e', opacity: 0.85 }}>
                🏆 Capital Champions
              </span>
            </div>
            {/* bottom-left: Small Losers */}
            <div className="absolute" style={{ left: '2%', bottom: '4%' }}>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#1f1200', color: '#fbbf24', border: '1px solid #fbbf24', opacity: 0.85 }}>
                ⚠️ Small Losers
              </span>
            </div>
            {/* bottom-right: Capital Traps */}
            <div className="absolute" style={{ right: '2%', bottom: '4%' }}>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#2d0a0a', color: '#f87171', border: '1px solid #f87171', opacity: 0.85 }}>
                🚨 Capital Traps
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Insight callouts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {topChamp && (
          <div className="rounded-xl p-3" style={{ background: '#052e16', border: '1px solid #22c55e33' }}>
            <p className="text-xs text-lo mb-1">🏆 Top Capital Champion</p>
            <p className="text-sm font-bold text-green-400 truncate">{topChamp.name}</p>
            <p className="text-xs text-lo mt-0.5">
              {topChamp.weight.toFixed(1)}% weight · +{topChamp.ret.toFixed(1)}% return · {fmt(topChamp.pl)} P&L
            </p>
          </div>
        )}
        {bestGem && (
          <div className="rounded-xl p-3" style={{ background: '#0c1a2e', border: '1px solid #38bdf833' }}>
            <p className="text-xs text-lo mb-1">💎 Best Hidden Gem (Under-allocated)</p>
            <p className="text-sm font-bold text-sky-400 truncate">{bestGem.name}</p>
            <p className="text-xs text-lo mt-0.5">
              Only {bestGem.weight.toFixed(1)}% weight but +{bestGem.ret.toFixed(1)}% return
            </p>
          </div>
        )}
        {worstTrap && (
          <div className="rounded-xl p-3" style={{ background: '#2d0a0a', border: '1px solid #f8717133' }}>
            <p className="text-xs text-lo mb-1">🚨 Biggest Capital Trap</p>
            <p className="text-sm font-bold text-red-400 truncate">{worstTrap.name}</p>
            <p className="text-xs text-lo mt-0.5">
              {worstTrap.weight.toFixed(1)}% weight but {worstTrap.ret.toFixed(1)}% return · {fmt(worstTrap.pl)}
            </p>
          </div>
        )}
      </div>

      {/* Table */}
      <div>
        {/* Sort + filter controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-xs font-semibold text-mid">
            Efficiency Ranking
            <span className="text-lo font-normal ml-1">(Return % ÷ Weight %)</span>
          </p>
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-card-alt)' }}>
            {([
              { k: 'efficiency', l: 'Efficiency' },
              { k: 'return',     l: 'Return' },
              { k: 'weight',     l: 'Weight' },
              { k: 'pl',         l: 'P&L' },
            ] as const).map(({ k, l }) => (
              <button key={k} onClick={() => setSort(k)}
                className="text-xs px-2.5 py-1 rounded-md font-medium transition-all"
                style={{
                  background: sort === k ? 'var(--brand)' : 'transparent',
                  color: sort === k ? '#fff' : 'var(--text-lo)',
                }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['#', 'Stock', 'Sector', 'Weight %', 'Return %', 'P&L', 'Efficiency', 'Category'].map(h => (
                  <th key={h} className="text-left py-2 px-2 text-lo font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, i) => (
                <tr key={row.name}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: i % 2 === 0 ? 'transparent' : 'var(--bg-card-alt)',
                  }}>
                  <td className="py-2 px-2 text-lo">{i + 1}</td>
                  <td className="py-2 px-2 font-semibold text-hi whitespace-nowrap max-w-32 truncate">{row.name}</td>
                  <td className="py-2 px-2 text-lo whitespace-nowrap">{row.sector || '–'}</td>
                  <td className="py-2 px-2 text-hi">{row.weight.toFixed(1)}%</td>
                  <td className={`py-2 px-2 font-semibold ${row.ret >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {row.ret >= 0 ? '+' : ''}{row.ret.toFixed(1)}%
                  </td>
                  <td className={`py-2 px-2 font-semibold ${row.pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {row.pl >= 0 ? '+' : ''}{fmt(row.pl)}
                  </td>
                  <td className="py-2 px-2">
                    <span className="font-bold" style={{ color: row.efficiency >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                      {row.efficiency >= 0 ? '+' : ''}{row.efficiency.toFixed(1)}
                    </span>
                  </td>
                  <td className="py-2 px-2">
                    <span className="px-1.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                      style={{ background: row.q.bg, color: row.q.color, border: `1px solid ${row.q.color}44` }}>
                      {row.q.icon} {row.q.label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer note */}
      <p className="text-xs text-lo">
        <span className="font-semibold text-mid">Efficiency Score</span> = Return% ÷ Weight% · A score &gt; 1 means the stock earns more return than its portfolio share deserves. Bubble size = absolute P&L. Avg weight line (dashed) = {avgWeight.toFixed(1)}%.
      </p>
    </div>
  );
}
