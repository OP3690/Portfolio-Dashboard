'use client';

import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Line, ComposedChart, Area,
} from 'recharts';
import { useMemo, useState } from 'react';

/* ─────────────────── types ─────────────────── */
interface ActiveHolding {
  stockName?: string;
  sectorName?: string;
  holdingPeriodYears?: number;
  holdingPeriodMonths?: number;
  profitLossTillDatePercent?: number;
  xirr?: number;
  investmentAmount?: number;
  marketValue?: number;
  openQty?: number;
}

interface RealizedStock {
  stockName?: string;
  totalPLPercent?: number;
  holdingPeriodYears?: number;
  holdingPeriodMonths?: number;
  holdingPeriodDays?: number;
  totalInvested?: number;
  realizedProfitLoss?: number;
}

interface Props {
  holdings: ActiveHolding[];
  realizedStocks?: RealizedStock[];
}

/* ─────────────────── math helpers ─────────────────── */
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dxSq = 0, dySq = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dxSq += dx * dx; dySq += dy * dy;
  }
  const denom = Math.sqrt(dxSq * dySq);
  return denom === 0 ? 0 : num / denom;
}

function olsRegression(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  if (n < 2) return { a: 0, b: 0 };
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) * (xs[i] - mx);
  }
  const b = den === 0 ? 0 : num / den;
  return { a: my - b * mx, b };
}

function bucket(months: number): string {
  if (months < 6)   return '0–6 m';
  if (months < 12)  return '6–12 m';
  if (months < 24)  return '1–2 y';
  if (months < 36)  return '2–3 y';
  return '3 + y';
}
const BUCKET_ORDER = ['0–6 m', '6–12 m', '1–2 y', '2–3 y', '3 + y'];

/* ─────────────────── custom tooltip ─────────────────── */
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="card p-3 text-xs space-y-1" style={{ minWidth: 160, border: '1px solid var(--border)' }}>
      <p className="font-bold text-hi">{d.name}</p>
      {d.sector && <p className="text-lo">{d.sector}</p>}
      <div className="flex justify-between gap-4">
        <span className="text-lo">Holding</span>
        <span className="font-semibold text-hi">{d.x.toFixed(1)} m</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-lo">Return</span>
        <span className={`font-semibold ${d.y >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {d.y >= 0 ? '+' : ''}{d.y.toFixed(1)}%
        </span>
      </div>
      {d.invested != null && (
        <div className="flex justify-between gap-4">
          <span className="text-lo">Invested</span>
          <span className="font-semibold text-hi">
            ₹{d.invested >= 1_00_000 ? `${(d.invested / 1_00_000).toFixed(1)}L` : `${(d.invested / 1_000).toFixed(0)}k`}
          </span>
        </div>
      )}
      <div className="mt-1 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${d.type === 'active' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'}`}>
          {d.type === 'active' ? '● Active' : '◆ Realized'}
        </span>
      </div>
    </div>
  );
}

/* ─────────────────── main component ─────────────────── */
export default function HoldingPeriodAnalysis({ holdings, realizedStocks = [] }: Props) {
  const [showRealized, setShowRealized] = useState(true);
  const [metric, setMetric] = useState<'return' | 'xirr'>('return');

  /* Build scatter data */
  const { activePoints, realizedPoints, allPoints } = useMemo(() => {
    const active = holdings
      .filter(h => (h.openQty || 0) > 0)
      .map(h => {
        const months = (h.holdingPeriodYears || 0) * 12 + (h.holdingPeriodMonths || 0);
        const y = metric === 'xirr' ? (h.xirr ?? 0) * 100 : (h.profitLossTillDatePercent ?? 0);
        return {
          x: months,
          y,
          name: h.stockName || 'Unknown',
          sector: h.sectorName || '',
          invested: h.investmentAmount,
          type: 'active' as const,
        };
      })
      .filter(p => p.x > 0);

    const realized = (showRealized ? realizedStocks : [])
      .map(r => {
        const months =
          (r.holdingPeriodYears || 0) * 12 +
          (r.holdingPeriodMonths || 0) +
          Math.floor((r.holdingPeriodDays || 0) / 30);
        const y = r.totalPLPercent ?? 0;
        return {
          x: months,
          y,
          name: r.stockName || 'Unknown',
          sector: '',
          invested: r.totalInvested,
          type: 'realized' as const,
        };
      })
      .filter(p => p.x > 0);

    return { activePoints: active, realizedPoints: realized, allPoints: [...active, ...realized] };
  }, [holdings, realizedStocks, showRealized, metric]);

  /* Regression on ALL points combined */
  const { r, rSquared, slope, intercept, regressionLine } = useMemo(() => {
    if (allPoints.length < 3) return { r: 0, rSquared: 0, slope: 0, intercept: 0, regressionLine: [] };
    const xs = allPoints.map(p => p.x);
    const ys = allPoints.map(p => p.y);
    const r = pearson(xs, ys);
    const { a, b } = olsRegression(xs, ys);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const steps = 40;
    const line = Array.from({ length: steps + 1 }, (_, i) => {
      const x = xMin + (xMax - xMin) * (i / steps);
      return { x: parseFloat(x.toFixed(1)), y: parseFloat((a + b * x).toFixed(2)) };
    });
    return { r, rSquared: r * r, slope: b, intercept: a, regressionLine: line };
  }, [allPoints]);

  /* Bucket analysis */
  const bucketData = useMemo(() => {
    const map = new Map<string, number[]>();
    BUCKET_ORDER.forEach(b => map.set(b, []));
    allPoints.forEach(p => {
      const bk = bucket(p.x);
      map.get(bk)!.push(p.y);
    });
    return BUCKET_ORDER.map(bk => {
      const vals = map.get(bk)!;
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return { bucket: bk, avg, count: vals.length };
    });
  }, [allPoints]);

  /* Axis domains */
  const xMax = allPoints.length ? Math.ceil(Math.max(...allPoints.map(p => p.x)) * 1.05) : 60;
  const yVals = allPoints.map(p => p.y);
  const yMin = yVals.length ? Math.floor(Math.min(...yVals) * 1.1) : -50;
  const yMax = yVals.length ? Math.ceil(Math.max(...yVals) * 1.1) : 100;

  /* Correlation label */
  const corrLabel = Math.abs(r) >= 0.6 ? 'Strong' : Math.abs(r) >= 0.3 ? 'Moderate' : 'Weak';
  const corrDir   = r >= 0 ? 'positive' : 'negative';
  const corrColor = r >= 0.3 ? 'var(--gain)' : r <= -0.3 ? 'var(--loss)' : 'var(--text-mid)';

  if (allPoints.length < 3) {
    return (
      <div className="card p-6 text-center text-lo text-sm">
        Not enough data to run Holding Period Return Analysis (need ≥ 3 stocks).
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-hi">Patience Premium Analysis</h3>
          <p className="text-xs text-lo mt-0.5">
            Does holding longer pay off in your portfolio? · OLS Regression + Pearson Correlation
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* metric toggle */}
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-card-alt)' }}>
            {(['return', 'xirr'] as const).map(m => (
              <button key={m} onClick={() => setMetric(m)}
                className="text-xs px-3 py-1 rounded-md font-medium transition-all"
                style={{
                  background: metric === m ? 'var(--brand)' : 'transparent',
                  color: metric === m ? '#fff' : 'var(--text-lo)',
                }}>
                {m === 'return' ? 'Abs Return %' : 'XIRR %'}
              </button>
            ))}
          </div>
          {/* realized toggle */}
          <button onClick={() => setShowRealized(v => !v)}
            className="text-xs px-3 py-1 rounded-md font-medium border transition-all"
            style={{
              borderColor: showRealized ? 'var(--brand)' : 'var(--border)',
              color: showRealized ? 'var(--brand)' : 'var(--text-lo)',
              background: showRealized ? 'var(--brand-bg)' : 'transparent',
            }}>
            ◆ Realized {showRealized ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Pearson r',
            value: r.toFixed(3),
            sub: `${corrLabel} ${corrDir}`,
            color: corrColor,
          },
          {
            label: 'R² (Explained)',
            value: `${(rSquared * 100).toFixed(1)}%`,
            sub: 'of return variance',
            color: 'var(--text-hi)',
          },
          {
            label: 'Trend Slope',
            value: `${slope >= 0 ? '+' : ''}${slope.toFixed(2)}%/m`,
            sub: 'per extra month held',
            color: slope >= 0 ? 'var(--gain)' : 'var(--loss)',
          },
          {
            label: 'Stocks Analysed',
            value: allPoints.length,
            sub: `${activePoints.length} active · ${realizedPoints.length} realized`,
            color: 'var(--text-hi)',
          },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            <p className="text-xs text-lo mb-1">{s.label}</p>
            <p className="text-lg font-bold" style={{ color: s.color as string }}>{s.value}</p>
            <p className="text-xs text-lo mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Scatter chart */}
      <div style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 16, right: 20, bottom: 36, left: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
            <XAxis
              dataKey="x"
              type="number"
              domain={[0, xMax]}
              tickFormatter={v => `${v}m`}
              label={{ value: 'Holding Period (months)', position: 'insideBottom', offset: -20, fill: 'var(--text-lo)', fontSize: 11 }}
              tick={{ fill: 'var(--text-lo)', fontSize: 10 }}
            />
            <YAxis
              dataKey="y"
              type="number"
              domain={[yMin, yMax]}
              tickFormatter={v => `${v}%`}
              tick={{ fill: 'var(--text-lo)', fontSize: 10 }}
              width={46}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Break-even line */}
            <ReferenceLine y={0} stroke="var(--text-lo)" strokeDasharray="4 2" strokeOpacity={0.5} />

            {/* OLS regression line */}
            <Line
              data={regressionLine}
              dataKey="y"
              type="monotone"
              dot={false}
              strokeWidth={2}
              stroke={r >= 0 ? 'var(--gain)' : 'var(--loss)'}
              strokeDasharray="6 3"
              legendType="none"
              isAnimationActive={false}
            />

            {/* Active holdings scatter */}
            <Scatter
              name="Active"
              data={activePoints}
              fill="var(--brand)"
              fillOpacity={0.75}
              stroke="var(--brand)"
              strokeWidth={1}
              shape={(props: any) => {
                const { cx, cy, fill, stroke } = props;
                const r = Math.max(4, Math.min(10, 5));
                return <circle cx={cx} cy={cy} r={r} fill={fill} fillOpacity={0.7} stroke={stroke} strokeWidth={1.5} />;
              }}
            />

            {/* Realized stocks scatter */}
            {showRealized && (
              <Scatter
                name="Realized"
                data={realizedPoints}
                fill="#a78bfa"
                fillOpacity={0.65}
                stroke="#a78bfa"
                strokeWidth={1}
                shape={(props: any) => {
                  const { cx, cy } = props;
                  const s = 7;
                  return (
                    <polygon
                      points={`${cx},${cy - s} ${cx + s},${cy + s} ${cx - s},${cy + s}`}
                      fill="#a78bfa"
                      fillOpacity={0.65}
                      stroke="#a78bfa"
                      strokeWidth={1.5}
                    />
                  );
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center text-xs text-lo">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full inline-block" style={{ background: 'var(--brand)', opacity: 0.8 }} />
          Active Holding
        </span>
        {showRealized && (
          <span className="flex items-center gap-1.5">
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
              <polygon points="6,0 12,10 0,10" fill="#a78bfa" fillOpacity={0.75} />
            </svg>
            Realized Stock
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <svg width="20" height="4" viewBox="0 0 20 4">
            <line x1="0" y1="2" x2="20" y2="2" stroke={r >= 0 ? 'var(--gain)' : 'var(--loss)'} strokeWidth="2" strokeDasharray="5 2" />
          </svg>
          OLS Trend Line (y = {intercept.toFixed(1)} + {slope.toFixed(2)}x)
        </span>
      </div>

      {/* Bucket analysis bar */}
      <div>
        <p className="text-xs font-semibold text-mid mb-3">Average Return by Holding Duration</p>
        <div className="grid grid-cols-5 gap-2">
          {bucketData.map(b => {
            const isPositive = (b.avg ?? 0) >= 0;
            const barH = b.avg != null ? Math.min(Math.abs(b.avg) * 1.2, 80) : 0;
            return (
              <div key={b.bucket} className="flex flex-col items-center gap-1">
                {/* positive bar (above) */}
                <div className="w-full flex flex-col justify-end" style={{ height: 60 }}>
                  {isPositive && b.avg != null && (
                    <div
                      className="w-full rounded-t-md transition-all"
                      style={{ height: `${barH}%`, background: 'var(--gain)', opacity: 0.75 }}
                    />
                  )}
                </div>
                {/* centre label */}
                <div className="text-center">
                  <p className={`text-sm font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {b.avg != null ? `${b.avg >= 0 ? '+' : ''}${b.avg.toFixed(1)}%` : '–'}
                  </p>
                </div>
                {/* negative bar (below) */}
                <div className="w-full flex flex-col justify-start" style={{ height: 60 }}>
                  {!isPositive && b.avg != null && (
                    <div
                      className="w-full rounded-b-md transition-all"
                      style={{ height: `${barH}%`, background: 'var(--loss)', opacity: 0.75 }}
                    />
                  )}
                </div>
                <p className="text-xs text-lo font-medium">{b.bucket}</p>
                <p className="text-xs text-lo">{b.count} stock{b.count !== 1 ? 's' : ''}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Insight callout */}
      <div className="rounded-xl p-4" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold text-mid mb-2">📐 Statistical Insight</p>
        {Math.abs(r) < 0.2 ? (
          <p className="text-xs text-lo leading-relaxed">
            <span className="text-hi font-semibold">No significant pattern detected.</span>{' '}
            Holding period alone (r = {r.toFixed(2)}) explains only {(rSquared * 100).toFixed(1)}% of return variance in your portfolio — stock selection and entry timing matter more than duration.
          </p>
        ) : r > 0 ? (
          <p className="text-xs text-lo leading-relaxed">
            <span className="text-hi font-semibold">Patience pays off in your portfolio.</span>{' '}
            A {corrLabel.toLowerCase()} positive correlation (r = {r.toFixed(2)}) shows that longer-held stocks tend to deliver better returns. The OLS trend adds ~{slope.toFixed(2)}% per extra month held, explaining {(rSquared * 100).toFixed(1)}% of return variance.
          </p>
        ) : (
          <p className="text-xs text-lo leading-relaxed">
            <span className="text-hi font-semibold">Quick trades outperform in your portfolio.</span>{' '}
            A {corrLabel.toLowerCase()} negative correlation (r = {r.toFixed(2)}) suggests shorter holding periods have historically yielded better results for you. Longer holds drag performance by ~{Math.abs(slope).toFixed(2)}% per month on average.
          </p>
        )}
      </div>
    </div>
  );
}
