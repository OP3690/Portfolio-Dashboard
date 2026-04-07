'use client';

import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { useMemo, useState } from 'react';

interface MonthlyReturn {
  month: string;
  returnPercent: number;
  returnAmount: number;
}

interface Props {
  monthlyReturns: MonthlyReturn[];
  currentValue: number;
}

/* ── helpers ── */
function parseMonthIndex(m: string): number {
  const MONTHS: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const match = m.match(/^([A-Za-z]{3})-(\d{2})$/);
  if (!match) return 0;
  const year = 2000 + parseInt(match[2], 10);
  return year * 12 + (MONTHS[match[1]] ?? 0);
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/* ── custom tooltips ── */
function DrawdownTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const dd  = payload.find((p: any) => p.dataKey === 'drawdown')?.value ?? 0;
  const ret = payload.find((p: any) => p.dataKey === 'ret')?.value ?? null;
  return (
    <div className="card p-3 text-xs space-y-1" style={{ border: '1px solid var(--border)', minWidth: 150 }}>
      <p className="font-bold text-hi">{label}</p>
      <div className="flex justify-between gap-4">
        <span className="text-lo">Drawdown</span>
        <span className="font-semibold text-red-400">{dd.toFixed(2)}%</span>
      </div>
      {ret !== null && (
        <div className="flex justify-between gap-4">
          <span className="text-lo">Monthly Return</span>
          <span className={`font-semibold ${ret >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
          </span>
        </div>
      )}
    </div>
  );
}

function DistTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const count = payload[0]?.value ?? 0;
  return (
    <div className="card p-3 text-xs" style={{ border: '1px solid var(--border)' }}>
      <p className="font-bold text-hi">{label}</p>
      <p className="text-lo mt-1">{count} month{count !== 1 ? 's' : ''}</p>
    </div>
  );
}

/* ── main component ── */
export default function DrawdownAnalysis({ monthlyReturns, currentValue }: Props) {
  const [view, setView] = useState<'drawdown' | 'distribution'>('drawdown');

  const sorted = useMemo(
    () => [...monthlyReturns].sort((a, b) => parseMonthIndex(a.month) - parseMonthIndex(b.month)),
    [monthlyReturns],
  );

  /* ── drawdown series ── */
  const { drawdownSeries, maxDrawdown, maxDrawdownMonth, recoveries } = useMemo(() => {
    if (!sorted.length) return { drawdownSeries: [], maxDrawdown: 0, maxDrawdownMonth: '', recoveries: 0 };

    let peak = 100; // index starting at 100
    let value = 100;
    let maxDD = 0;
    let maxDDMonth = '';
    let inDrawdown = false;
    let recoveryCount = 0;

    const series = sorted.map(r => {
      value = value * (1 + r.returnPercent / 100);
      if (value > peak) {
        if (inDrawdown) { recoveryCount++; inDrawdown = false; }
        peak = value;
      }
      const dd = ((value - peak) / peak) * 100; // always ≤ 0
      if (dd < 0) inDrawdown = true;
      if (dd < maxDD) { maxDD = dd; maxDDMonth = r.month; }
      return { month: r.month, drawdown: parseFloat(dd.toFixed(3)), ret: r.returnPercent };
    });

    return { drawdownSeries: series, maxDrawdown: maxDD, maxDrawdownMonth: maxDDMonth, recoveries: recoveryCount };
  }, [sorted]);

  /* ── distribution buckets ── */
  const distData = useMemo(() => {
    const buckets = [
      { label: '< −15%', min: -Infinity, max: -15, color: '#dc2626' },
      { label: '−15 to −10%', min: -15, max: -10, color: '#ef4444' },
      { label: '−10 to −5%', min: -10, max: -5, color: '#f97316' },
      { label: '−5 to 0%', min: -5, max: 0, color: '#fbbf24' },
      { label: '0 to +5%', min: 0, max: 5, color: '#4ade80' },
      { label: '+5 to +10%', min: 5, max: 10, color: '#22c55e' },
      { label: '> +10%', min: 10, max: Infinity, color: '#16a34a' },
    ];
    return buckets.map(b => ({
      ...b,
      count: sorted.filter(r => r.returnPercent >= b.min && r.returnPercent < b.max).length,
    }));
  }, [sorted]);

  /* ── key stats ── */
  const stats = useMemo(() => {
    if (!sorted.length) return null;
    const rets = sorted.map(r => r.returnPercent);
    const pos  = rets.filter(r => r > 0);
    const neg  = rets.filter(r => r < 0);
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const sd   = stdDev(rets);
    const sharpe = sd > 0 ? mean / sd : 0; // simplified monthly sharpe

    // Streak analysis
    let curStreak = 0; let curType = '';
    let bestWin = 0; let bestLoss = 0;
    let tmpWin = 0; let tmpLoss = 0;
    rets.forEach(r => {
      if (r > 0) { tmpWin++; tmpLoss = 0; }
      else if (r < 0) { tmpLoss++; tmpWin = 0; }
      else { tmpWin = 0; tmpLoss = 0; }
      if (tmpWin > bestWin) bestWin = tmpWin;
      if (tmpLoss > bestLoss) bestLoss = tmpLoss;
    });
    // current streak (from end)
    let i = rets.length - 1;
    if (i >= 0) {
      curType = rets[i] >= 0 ? 'up' : 'down';
      while (i >= 0 && (curType === 'up' ? rets[i] >= 0 : rets[i] < 0)) { curStreak++; i--; }
    }

    return {
      mean: mean.toFixed(2),
      sd: sd.toFixed(2),
      sharpe: sharpe.toFixed(2),
      winRate: rets.length > 0 ? ((pos.length / rets.length) * 100).toFixed(1) : '0',
      avgGain: pos.length ? (pos.reduce((a, b) => a + b, 0) / pos.length).toFixed(2) : '0',
      avgLoss: neg.length ? (neg.reduce((a, b) => a + b, 0) / neg.length).toFixed(2) : '0',
      best: Math.max(...rets).toFixed(2),
      worst: Math.min(...rets).toFixed(2),
      bestMonth: sorted[rets.indexOf(Math.max(...rets))]?.month || '',
      worstMonth: sorted[rets.indexOf(Math.min(...rets))]?.month || '',
      curStreak, curType,
      bestWin, bestLoss,
      total: rets.length,
      painGainRatio: pos.length && neg.length
        ? Math.abs(neg.reduce((a, b) => a + b, 0) / neg.length / (pos.reduce((a, b) => a + b, 0) / pos.length)).toFixed(2)
        : '–',
    };
  }, [sorted]);

  if (!sorted.length || !stats) {
    return (
      <div className="card p-6 text-center text-lo text-sm">
        No monthly return data available for risk analysis.
      </div>
    );
  }

  const ddMin = Math.min(...drawdownSeries.map(d => d.drawdown));
  const ddDomain: [number, number] = [Math.floor(ddMin * 1.1), 2];

  return (
    <div className="card p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-hi">Portfolio Drawdown &amp; Risk Analysis</h3>
          <p className="text-xs text-lo mt-0.5">
            Peak-to-trough drawdown · Return distribution · Volatility · Streaks
          </p>
        </div>
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-card-alt)' }}>
          {(['drawdown', 'distribution'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className="text-xs px-3 py-1 rounded-md font-medium transition-all"
              style={{
                background: view === v ? 'var(--brand)' : 'transparent',
                color: view === v ? '#fff' : 'var(--text-lo)',
              }}>
              {v === 'drawdown' ? '📉 Drawdown' : '📊 Distribution'}
            </button>
          ))}
        </div>
      </div>

      {/* Key metric cards — row 1 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Max Drawdown',
            value: `${maxDrawdown.toFixed(1)}%`,
            sub: maxDrawdownMonth,
            color: 'var(--loss)',
          },
          {
            label: 'Volatility (σ)',
            value: `${stats.sd}%`,
            sub: 'Std dev of monthly returns',
            color: 'var(--text-hi)',
          },
          {
            label: 'Win Rate',
            value: `${stats.winRate}%`,
            sub: `${sorted.filter(r => r.returnPercent > 0).length} of ${stats.total} months`,
            color: parseFloat(stats.winRate) >= 50 ? 'var(--gain)' : 'var(--loss)',
          },
          {
            label: 'Sharpe (Monthly)',
            value: stats.sharpe,
            sub: 'Avg return ÷ Volatility',
            color: parseFloat(stats.sharpe) >= 0.3 ? 'var(--gain)' : parseFloat(stats.sharpe) >= 0 ? 'var(--text-hi)' : 'var(--loss)',
          },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            <p className="text-xs text-lo mb-1">{s.label}</p>
            <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-lo mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Key metric cards — row 2 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Best Month',
            value: `+${stats.best}%`,
            sub: stats.bestMonth,
            color: 'var(--gain)',
          },
          {
            label: 'Worst Month',
            value: `${stats.worst}%`,
            sub: stats.worstMonth,
            color: 'var(--loss)',
          },
          {
            label: 'Avg Gain',
            value: `+${stats.avgGain}%`,
            sub: `Pain/Gain ratio: ${stats.painGainRatio}`,
            color: 'var(--gain)',
          },
          {
            label: 'Current Streak',
            value: `${stats.curStreak} ${stats.curType === 'up' ? '▲' : '▼'}`,
            sub: `Best win: ${stats.bestWin}m · Worst loss: ${stats.bestLoss}m`,
            color: stats.curType === 'up' ? 'var(--gain)' : 'var(--loss)',
          },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            <p className="text-xs text-lo mb-1">{s.label}</p>
            <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-lo mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      {view === 'drawdown' ? (
        <div>
          <p className="text-xs text-lo mb-2">
            Drawdown from peak &nbsp;·&nbsp; {recoveries} full recover{recoveries === 1 ? 'y' : 'ies'} recorded
          </p>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={drawdownSeries} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: 'var(--text-lo)', fontSize: 9 }}
                  interval={Math.floor(drawdownSeries.length / 8)}
                  label={{ value: 'Month', position: 'insideBottom', offset: -12, fill: 'var(--text-lo)', fontSize: 10 }}
                />
                <YAxis
                  domain={ddDomain}
                  tickFormatter={v => `${v}%`}
                  tick={{ fill: 'var(--text-lo)', fontSize: 10 }}
                  width={44}
                />
                <Tooltip content={<DrawdownTooltip />} />
                <ReferenceLine y={0} stroke="var(--text-lo)" strokeOpacity={0.4} />
                <Area
                  type="monotone"
                  dataKey="drawdown"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  fill="url(#ddGrad)"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-xs text-lo mb-2">
            Monthly return frequency distribution across {stats.total} months
          </p>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distData} margin={{ top: 8, right: 16, bottom: 32, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--text-lo)', fontSize: 9 }}
                  angle={-30}
                  textAnchor="end"
                  interval={0}
                  height={48}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: 'var(--text-lo)', fontSize: 10 }}
                  label={{ value: 'Months', angle: -90, position: 'insideLeft', fill: 'var(--text-lo)', fontSize: 10, dy: 30 }}
                  width={40}
                />
                <Tooltip content={<DistTooltip />} cursor={{ fill: 'var(--border)', fillOpacity: 0.2 }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {distData.map(d => (
                    <Cell key={d.label} fill={d.color} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Pain/Gain summary bar */}
      <div className="rounded-xl p-4" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
        <div className="flex justify-between text-xs text-lo mb-2">
          <span>Loss months &nbsp;<span className="font-bold text-red-400">{sorted.filter(r => r.returnPercent < 0).length}</span></span>
          <span className="font-semibold text-mid">Monthly Return Profile</span>
          <span>Gain months &nbsp;<span className="font-bold text-green-400">{sorted.filter(r => r.returnPercent > 0).length}</span></span>
        </div>
        <div className="flex rounded-full overflow-hidden h-3">
          {(() => {
            const loss = sorted.filter(r => r.returnPercent < 0).length;
            const flat = sorted.filter(r => r.returnPercent === 0).length;
            const gain = sorted.filter(r => r.returnPercent > 0).length;
            const total = sorted.length || 1;
            return (
              <>
                <div style={{ width: `${(loss / total) * 100}%`, background: 'var(--loss)', opacity: 0.8 }} />
                {flat > 0 && <div style={{ width: `${(flat / total) * 100}%`, background: 'var(--text-lo)', opacity: 0.4 }} />}
                <div style={{ width: `${(gain / total) * 100}%`, background: 'var(--gain)', opacity: 0.8 }} />
              </>
            );
          })()}
        </div>
        <div className="flex justify-between text-xs text-lo mt-2">
          <span>Avg loss: <span className="text-red-400 font-semibold">{stats.avgLoss}%</span></span>
          <span>Mean: <span className="text-hi font-semibold">{stats.mean}%/mo</span></span>
          <span>Avg gain: <span className="text-green-400 font-semibold">+{stats.avgGain}%</span></span>
        </div>
      </div>
    </div>
  );
}
