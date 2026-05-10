'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, ReferenceLine,
} from 'recharts';

/* ─── types ───────────────────────────────────────────────────── */
interface MonthlyDividend {
  month: string;        // "Mar-24"
  amount: number;
  sortKey?: number;
  stockDetails: Array<{ stockName: string; amount: number }>;
}

interface Props {
  monthlyDividends: MonthlyDividend[];
  avgMonthlyDividendsLast12M: number;
  medianMonthlyDividendsLast12M: number;
  totalInvested: number;
}

/* ─── helpers ─────────────────────────────────────────────────── */
const fmt = (n: number) => {
  if (n >= 100000)  return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)    return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

const parseMonthKey = (m: string): Date => {
  // "Mar-24" → Date
  const [mon, yr] = m.split('-');
  const months: Record<string, number> = {
    Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,
    Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11,
  };
  const year = parseInt(yr) + (parseInt(yr) < 50 ? 2000 : 1900);
  return new Date(year, months[mon] ?? 0, 1);
};

/* ─── mini stat card ──────────────────────────────────────────── */
function Chip({ label, value, sub, accent, icon }: {
  label: string; value: string; sub?: string;
  accent: string; icon: React.ReactNode;
}) {
  return (
    <div className="card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{label}</p>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: `color-mix(in srgb,${accent} 14%,transparent)`,
            border: `1px solid color-mix(in srgb,${accent} 28%,transparent)`,
            color: accent,
          }}>
          {icon}
        </div>
      </div>
      <p className="text-xl font-black tracking-tight text-hi leading-none">{value}</p>
      {sub && <p className="text-[11px] leading-snug" style={{ color: 'var(--text-lo)' }}>{sub}</p>}
    </div>
  );
}

/* ─── custom tooltip ──────────────────────────────────────────── */
function DivTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="card p-3 text-xs shadow-lg" style={{ minWidth: 160 }}>
      <p className="font-bold text-hi mb-1.5">{label}</p>
      <p style={{ color: 'var(--gain)' }}>Total: {fmt(payload[0]?.value || 0)}</p>
      {row?.stockDetails?.slice(0, 4).map((sd: any, i: number) => (
        <p key={i} className="mt-0.5" style={{ color: 'var(--text-lo)' }}>
          · {sd.stockName}: {fmt(sd.amount)}
        </p>
      ))}
    </div>
  );
}

/* ─── main component ──────────────────────────────────────────── */
export default function DividendInsights({
  monthlyDividends, avgMonthlyDividendsLast12M,
  medianMonthlyDividendsLast12M, totalInvested,
}: Props) {

  /* ── last-12M slice ── */
  const last12M = useMemo(() => {
    if (!monthlyDividends?.length) return [];
    const sorted = [...monthlyDividends].sort(
      (a, b) => parseMonthKey(a.month).getTime() - parseMonthKey(b.month).getTime()
    );
    return sorted.slice(-12);
  }, [monthlyDividends]);

  /* ── aggregate stats ── */
  const stats = useMemo(() => {
    const total12M        = last12M.reduce((s, m) => s + m.amount, 0);
    const paidMonths      = last12M.filter(m => m.amount > 0).length;
    const droughtMonths   = 12 - paidMonths;
    const bestMonth       = [...last12M].sort((a, b) => b.amount - a.amount)[0];
    const worstDividendM  = last12M.filter(m => m.amount > 0).sort((a, b) => a.amount - b.amount)[0];

    /* per-stock totals over last 12M */
    const stockTotals: Record<string, number> = {};
    last12M.forEach(m =>
      m.stockDetails?.forEach(sd => {
        stockTotals[sd.stockName] = (stockTotals[sd.stockName] || 0) + sd.amount;
      })
    );
    const byStock = Object.entries(stockTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount }));

    /* longest consecutive streak of months that paid */
    let maxStreak = 0, cur = 0;
    last12M.forEach(m => {
      if (m.amount > 0) { cur++; maxStreak = Math.max(maxStreak, cur); }
      else cur = 0;
    });

    /* YoY comparison: last-6M vs prev-6M within last12M */
    const first6  = last12M.slice(0, 6).reduce((s, m) => s + m.amount, 0);
    const second6 = last12M.slice(6).reduce((s, m) => s + m.amount, 0);
    const halfYoY = first6 > 0 ? ((second6 - first6) / first6) * 100 : 0;

    const yieldOnCost = totalInvested > 0 ? (total12M / totalInvested) * 100 : 0;

    return {
      total12M, paidMonths, droughtMonths, bestMonth, worstDividendM,
      byStock, maxStreak, halfYoY, yieldOnCost,
    };
  }, [last12M, totalInvested]);

  const hasData = last12M.length > 0 && stats.total12M > 0;

  /* ── month label short ── */
  const shortLabel = (m: string) => m; // already "Mar-24"

  if (!hasData) {
    return (
      <div className="card p-8 text-center">
        <span className="text-4xl">🌱</span>
        <p className="text-sm font-semibold text-hi mt-3">No dividend data found</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-lo)' }}>
          Dividend transactions will appear here once recorded in your portfolio.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── 4 KPI chips ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Chip
          label="Total Dividends (12M)"
          value={fmt(stats.total12M)}
          sub={`Across ${stats.paidMonths} months`}
          accent="var(--gain)"
          icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <Chip
          label="Avg Monthly (12M)"
          value={fmt(avgMonthlyDividendsLast12M)}
          sub={`Median ${fmt(medianMonthlyDividendsLast12M)}/mo`}
          accent="var(--brand)"
          icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
        />
        <Chip
          label="Yield on Cost"
          value={`${stats.yieldOnCost.toFixed(2)}%`}
          sub="Annual dividend / invested"
          accent="var(--info)"
          icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
        />
        <Chip
          label="H2 vs H1 Growth"
          value={`${stats.halfYoY >= 0 ? '+' : ''}${stats.halfYoY.toFixed(1)}%`}
          sub="Recent 6M vs prior 6M"
          accent={stats.halfYoY >= 0 ? 'var(--gain)' : 'var(--loss)'}
          icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" /></svg>}
        />
      </div>

      {/* ── Monthly bar chart ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h4 className="text-sm font-bold text-hi">Monthly Dividend Income · Last 12 Months</h4>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
              Bar = monthly total · dashed line = 12M average ({fmt(avgMonthlyDividendsLast12M)})
            </p>
          </div>
          {/* streak badge */}
          {stats.maxStreak > 0 && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
              style={{ background: 'color-mix(in srgb,var(--gain) 12%,transparent)', color: 'var(--gain)', border: '1px solid color-mix(in srgb,var(--gain) 25%,transparent)' }}>
              🔥 {stats.maxStreak}-month streak
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={last12M} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-sm)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-lo)' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => fmt(v)} tick={{ fontSize: 10, fill: 'var(--text-lo)' }} axisLine={false} tickLine={false} width={52} />
            <Tooltip content={<DivTooltip />} />
            <ReferenceLine y={avgMonthlyDividendsLast12M} stroke="var(--brand)" strokeDasharray="5 3" strokeWidth={1.5} />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
              {last12M.map((m, i) => (
                <Cell key={i} fill={m.amount >= avgMonthlyDividendsLast12M ? 'var(--gain)' : m.amount > 0 ? 'var(--brand)' : 'var(--border-md)'} fillOpacity={m.amount > 0 ? 0.85 : 0.3} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* drought indicator */}
        {stats.droughtMonths > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
            style={{ background: 'color-mix(in srgb,var(--warn) 10%,transparent)', border: '1px solid color-mix(in srgb,var(--warn) 22%,transparent)' }}>
            <span>⚠️</span>
            <span style={{ color: 'var(--warn)' }}>
              <strong>{stats.droughtMonths} month{stats.droughtMonths > 1 ? 's' : ''}</strong> with no dividend received in the last 12 months
            </span>
          </div>
        )}
      </div>

      {/* ── Top payers + insights row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Top payer stocks */}
        <div className="card p-5">
          <h4 className="text-sm font-bold text-hi mb-1">Top Dividend Payers · 12M</h4>
          <p className="text-xs mb-4" style={{ color: 'var(--text-lo)' }}>Stocks ranked by total dividend received</p>
          <div className="space-y-2.5">
            {stats.byStock.slice(0, 7).map((s, i) => {
              const pct = stats.total12M > 0 ? (s.amount / stats.total12M) * 100 : 0;
              const barColor = i === 0 ? 'var(--gain)' : i === 1 ? 'var(--brand)' : 'var(--info)';
              return (
                <div key={s.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-black w-4 shrink-0" style={{ color: barColor }}>#{i + 1}</span>
                      <span className="text-xs font-semibold text-hi truncate">{s.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-xs font-bold" style={{ color: barColor }}>{fmt(s.amount)}</span>
                      <span className="text-[10px]" style={{ color: 'var(--text-lo)' }}>{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-sm)' }}>
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: barColor, opacity: 0.85 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Insight cards */}
        <div className="space-y-3">
          {/* Best month */}
          {stats.bestMonth && (
            <div className="card p-4 flex items-start gap-3"
              style={{ borderLeft: '3px solid var(--gain)' }}>
              <span className="text-xl shrink-0">🏆</span>
              <div>
                <p className="text-xs font-bold text-hi">Best Dividend Month</p>
                <p className="text-lg font-black mt-0.5" style={{ color: 'var(--gain)' }}>
                  {stats.bestMonth.month} · {fmt(stats.bestMonth.amount)}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-lo)' }}>
                  {stats.bestMonth.stockDetails?.slice(0, 2).map(sd => sd.stockName).join(', ') || '—'}
                </p>
              </div>
            </div>
          )}

          {/* Consistency */}
          <div className="card p-4 flex items-start gap-3"
            style={{ borderLeft: `3px solid ${stats.paidMonths >= 10 ? 'var(--gain)' : stats.paidMonths >= 7 ? 'var(--brand)' : 'var(--warn)'}` }}>
            <span className="text-xl shrink-0">📅</span>
            <div>
              <p className="text-xs font-bold text-hi">Dividend Consistency</p>
              <p className="text-lg font-black mt-0.5"
                style={{ color: stats.paidMonths >= 10 ? 'var(--gain)' : stats.paidMonths >= 7 ? 'var(--brand)' : 'var(--warn)' }}>
                {stats.paidMonths}/12 months
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-lo)' }}>
                {stats.paidMonths >= 10 ? 'Excellent — near-monthly income' :
                  stats.paidMonths >= 7 ? 'Good consistency' :
                  'Irregular — consider more dividend stocks'}
              </p>
            </div>
          </div>

          {/* YoC context */}
          <div className="card p-4 flex items-start gap-3"
            style={{ borderLeft: `3px solid ${stats.yieldOnCost >= 2 ? 'var(--gain)' : 'var(--info)'}` }}>
            <span className="text-xl shrink-0">📈</span>
            <div>
              <p className="text-xs font-bold text-hi">Yield on Cost vs Benchmarks</p>
              <div className="flex gap-4 mt-1.5">
                <div>
                  <p className="text-[10px]" style={{ color: 'var(--text-lo)' }}>Your YoC</p>
                  <p className="text-base font-black" style={{ color: stats.yieldOnCost >= 2 ? 'var(--gain)' : 'var(--text-hi)' }}>{stats.yieldOnCost.toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-[10px]" style={{ color: 'var(--text-lo)' }}>Nifty avg</p>
                  <p className="text-base font-bold text-hi">~1.5%</p>
                </div>
                <div>
                  <p className="text-[10px]" style={{ color: 'var(--text-lo)' }}>FD rate</p>
                  <p className="text-base font-bold text-hi">~7%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Half-year momentum */}
          <div className="card p-4 flex items-start gap-3"
            style={{ borderLeft: `3px solid ${stats.halfYoY >= 0 ? 'var(--gain)' : 'var(--loss)'}` }}>
            <span className="text-xl shrink-0">{stats.halfYoY >= 0 ? '🚀' : '📉'}</span>
            <div>
              <p className="text-xs font-bold text-hi">Recent Half-Year vs Prior</p>
              <p className="text-lg font-black mt-0.5"
                style={{ color: stats.halfYoY >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                {stats.halfYoY >= 0 ? '+' : ''}{stats.halfYoY.toFixed(1)}% growth
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-lo)' }}>
                {stats.halfYoY >= 20 ? 'Strong dividend acceleration' :
                  stats.halfYoY >= 0 ? 'Steady dividend growth' :
                  'Dividend income has declined — review holdings'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Per-stock monthly heatmap strip ── */}
      {stats.byStock.length > 0 && (
        <div className="card p-5">
          <h4 className="text-sm font-bold text-hi mb-1">Dividend Payer Activity · Last 12M</h4>
          <p className="text-xs mb-4" style={{ color: 'var(--text-lo)' }}>
            Each cell = dividend received from that stock in that month · deeper green = higher amount
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]" style={{ borderCollapse: 'separate', borderSpacing: '2px' }}>
              <thead>
                <tr>
                  <th className="text-left font-semibold pr-3 pb-1.5 whitespace-nowrap" style={{ color: 'var(--text-lo)', minWidth: 110 }}>Stock</th>
                  {last12M.map(m => (
                    <th key={m.month} className="text-center font-semibold pb-1.5 whitespace-nowrap" style={{ color: 'var(--text-lo)', minWidth: 36 }}>{m.month}</th>
                  ))}
                  <th className="text-right font-semibold pl-3 pb-1.5 whitespace-nowrap" style={{ color: 'var(--text-lo)' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.byStock.slice(0, 10).map((stk) => {
                  const maxAmt = Math.max(...last12M.map(m =>
                    m.stockDetails?.find(sd => sd.stockName === stk.name)?.amount || 0
                  ), 1);
                  return (
                    <tr key={stk.name}>
                      <td className="pr-3 py-0.5 font-semibold truncate" style={{ color: 'var(--text-hi)', maxWidth: 110 }}
                        title={stk.name}>
                        {stk.name.length > 16 ? stk.name.slice(0, 15) + '…' : stk.name}
                      </td>
                      {last12M.map(m => {
                        const amt = m.stockDetails?.find(sd => sd.stockName === stk.name)?.amount || 0;
                        const intensity = amt > 0 ? Math.max(0.18, amt / maxAmt) : 0;
                        return (
                          <td key={m.month} className="text-center py-0.5">
                            <div className="mx-auto rounded"
                              style={{
                                width: 30, height: 18,
                                background: amt > 0
                                  ? `color-mix(in srgb,var(--gain) ${Math.round(intensity * 80)}%,transparent)`
                                  : 'var(--border-sm)',
                              }}
                              title={amt > 0 ? fmt(amt) : '—'}
                            />
                          </td>
                        );
                      })}
                      <td className="pl-3 py-0.5 text-right font-bold" style={{ color: 'var(--gain)' }}>
                        {fmt(stk.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
