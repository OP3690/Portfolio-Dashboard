'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { useMemo, useState } from 'react';

interface Holding {
  stockName?: string;
  sectorName?: string;
  investmentAmount?: number;
  marketValue?: number;
  profitLossTillDate?: number;
  profitLossTillDatePercent?: number;
  openQty?: number;
}

interface Props {
  holdings: Holding[];
}

function fmt(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000)       return `₹${(v / 1_000).toFixed(1)}k`;
  return `₹${v.toFixed(0)}`;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const invested   = payload.find((p: any) => p.dataKey === 'invested')?.value ?? 0;
  const current    = payload.find((p: any) => p.dataKey === 'current')?.value ?? 0;
  const pl         = current - invested;
  const plPct      = invested > 0 ? (pl / invested) * 100 : 0;
  return (
    <div className="card p-3 text-xs space-y-1.5" style={{ minWidth: 170, border: '1px solid var(--border)' }}>
      <p className="font-bold text-hi">{label}</p>
      <div className="flex justify-between gap-4">
        <span className="text-lo">Invested</span>
        <span className="font-semibold text-hi">{fmt(invested)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-lo">Current Value</span>
        <span className="font-semibold text-hi">{fmt(current)}</span>
      </div>
      <div className="flex justify-between gap-4 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
        <span className="text-lo">P&amp;L</span>
        <span className={`font-bold ${pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {pl >= 0 ? '+' : ''}{fmt(pl)} ({plPct >= 0 ? '+' : ''}{plPct.toFixed(1)}%)
        </span>
      </div>
    </div>
  );
}

export default function SectorPerformance({ holdings }: Props) {
  const [sort, setSort] = useState<'pl' | 'invested' | 'sector'>('pl');

  const sectors = useMemo(() => {
    const map = new Map<string, { invested: number; current: number; stocks: string[] }>();

    holdings.forEach(h => {
      const sec = h.sectorName?.trim() || 'Others';
      if (!map.has(sec)) map.set(sec, { invested: 0, current: 0, stocks: [] });
      const entry = map.get(sec)!;
      entry.invested += h.investmentAmount ?? 0;
      entry.current  += h.marketValue ?? 0;
      if (h.stockName) entry.stocks.push(h.stockName);
    });

    const rows = Array.from(map.entries()).map(([sector, v]) => {
      const pl    = v.current - v.invested;
      const plPct = v.invested > 0 ? (pl / v.invested) * 100 : 0;
      return { sector, invested: v.invested, current: v.current, pl, plPct, count: v.stocks.length };
    });

    if (sort === 'pl')       return [...rows].sort((a, b) => b.pl - a.pl);
    if (sort === 'invested') return [...rows].sort((a, b) => b.invested - a.invested);
    return [...rows].sort((a, b) => a.sector.localeCompare(b.sector));
  }, [holdings, sort]);

  const totalInvested = sectors.reduce((s, r) => s + r.invested, 0);
  const totalCurrent  = sectors.reduce((s, r) => s + r.current, 0);
  const totalPL       = totalCurrent - totalInvested;
  const totalPLPct    = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  const best  = [...sectors].sort((a, b) => b.plPct - a.plPct)[0];
  const worst = [...sectors].sort((a, b) => a.plPct - b.plPct)[0];

  if (!sectors.length) return null;

  return (
    <div className="card p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-hi">Sector Performance Breakdown</h3>
          <p className="text-xs text-lo mt-0.5">Invested vs Current Value across all sectors</p>
        </div>
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-card-alt)' }}>
          {(['pl', 'invested', 'sector'] as const).map(s => (
            <button key={s} onClick={() => setSort(s)}
              className="text-xs px-3 py-1 rounded-md font-medium transition-all"
              style={{
                background: sort === s ? 'var(--brand)' : 'transparent',
                color: sort === s ? '#fff' : 'var(--text-lo)',
              }}>
              {s === 'pl' ? 'By P&L' : s === 'invested' ? 'By Size' : 'A–Z'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Invested',  value: fmt(totalInvested), color: 'var(--text-hi)' },
          {
            label: 'Total Value',
            value: fmt(totalCurrent),
            sub: `${totalPLPct >= 0 ? '+' : ''}${totalPLPct.toFixed(1)}%`,
            color: totalPL >= 0 ? 'var(--gain)' : 'var(--loss)',
          },
          { label: 'Best Sector',    value: best?.sector  || '–', sub: best  ? `+${best.plPct.toFixed(1)}%`  : '', color: 'var(--gain)' },
          { label: 'Worst Sector',   value: worst?.sector || '–', sub: worst ? `${worst.plPct.toFixed(1)}%` : '', color: 'var(--loss)' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            <p className="text-xs text-lo mb-1">{s.label}</p>
            <p className="text-sm font-bold truncate" style={{ color: s.color }}>{s.value}</p>
            {s.sub && <p className="text-xs mt-0.5" style={{ color: s.color }}>{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div style={{ height: Math.max(240, sectors.length * 48) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={sectors}
            margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            barCategoryGap="28%"
            barGap={3}
          >
            <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
            <XAxis
              type="number"
              tickFormatter={fmt}
              tick={{ fill: 'var(--text-lo)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="sector"
              width={110}
              tick={{ fill: 'var(--text-lo)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--border)', fillOpacity: 0.15 }} />

            {/* Invested bar */}
            <Bar dataKey="invested" name="Invested" radius={[0, 4, 4, 0]} maxBarSize={14}>
              {sectors.map(s => (
                <Cell key={s.sector} fill="var(--brand)" fillOpacity={0.35} />
              ))}
            </Bar>

            {/* Current value bar */}
            <Bar dataKey="current" name="Current Value" radius={[0, 4, 4, 0]} maxBarSize={14}>
              {sectors.map(s => (
                <Cell
                  key={s.sector}
                  fill={s.pl >= 0 ? 'var(--gain)' : 'var(--loss)'}
                  fillOpacity={0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center text-xs text-lo">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded inline-block" style={{ background: 'var(--brand)', opacity: 0.4 }} />
          Invested
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded inline-block" style={{ background: 'var(--gain)', opacity: 0.8 }} />
          Current Value (Gain)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded inline-block" style={{ background: 'var(--loss)', opacity: 0.8 }} />
          Current Value (Loss)
        </span>
      </div>

      {/* Sector table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Sector', 'Stocks', 'Invested', 'Current Value', 'P&L', 'Return %', 'Share'].map(h => (
                <th key={h} className="text-left py-2 px-2 text-lo font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sectors.map((s, i) => {
              const share = totalInvested > 0 ? (s.invested / totalInvested) * 100 : 0;
              return (
                <tr key={s.sector}
                  className="transition-colors"
                  style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-card-alt)' }}>
                  <td className="py-2 px-2 font-medium text-hi">{s.sector}</td>
                  <td className="py-2 px-2 text-lo">{s.count}</td>
                  <td className="py-2 px-2 text-hi">{fmt(s.invested)}</td>
                  <td className="py-2 px-2 text-hi">{fmt(s.current)}</td>
                  <td className={`py-2 px-2 font-semibold ${s.pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {s.pl >= 0 ? '+' : ''}{fmt(s.pl)}
                  </td>
                  <td className={`py-2 px-2 font-semibold ${s.plPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {s.plPct >= 0 ? '+' : ''}{s.plPct.toFixed(1)}%
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 4, background: 'var(--border)' }}>
                        <div className="h-full rounded-full" style={{ width: `${share}%`, background: 'var(--brand)', opacity: 0.7 }} />
                      </div>
                      <span className="text-lo w-8 text-right">{share.toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* Totals row */}
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border)' }}>
              <td className="py-2 px-2 font-bold text-hi">Total</td>
              <td className="py-2 px-2 text-lo">{holdings.length}</td>
              <td className="py-2 px-2 font-bold text-hi">{fmt(totalInvested)}</td>
              <td className="py-2 px-2 font-bold text-hi">{fmt(totalCurrent)}</td>
              <td className={`py-2 px-2 font-bold ${totalPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalPL >= 0 ? '+' : ''}{fmt(totalPL)}
              </td>
              <td className={`py-2 px-2 font-bold ${totalPLPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalPLPct >= 0 ? '+' : ''}{totalPLPct.toFixed(1)}%
              </td>
              <td className="py-2 px-2 text-lo">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
