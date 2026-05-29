'use client';

import { useMemo, useState } from 'react';

/* ─── Shared types (mirrored from StockPredictions) ─────────────────────── */
interface SellLot {
  sellDate: string; sellPrice: number; sellQuantity: number;
  realizedPnL: number; realizedPnLPct: number;
}
interface Trade {
  _id: string; stockSymbol: string; stockName: string;
  buyDate: string; totalInvested: number;
  realizedPnL: number; realizedPnLPct: number;
  status: 'holding' | 'partial' | 'closed';
  sells: SellLot[];
  unrealizedPnL: number; unrealizedPnLPct: number;
  totalPnL: number; totalPnLPct: number;
  buyPrice: number; buyQuantity: number; remainingQuantity: number;
}
interface Prediction {
  _id: string; stockSymbol: string;
  confidenceScore: number;
  status: 'Active' | 'Achieved' | 'OverAchieved' | 'MissedSlightly' | 'Missed' | 'Expired';
  bestReturn: number; finalReturn?: number;
  tracking?: { totalReturn: number } | null;
}
interface Stats {
  totalEvaluated: number; successCount: number;
  successRate: number; avgReturn: number;
}
export interface PredictionIntelligenceProps {
  predictions: Prediction[];
  stats: Stats | null;
  trades: Trade[];
  monthlyTarget?: number; // default 5
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const fmtI = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1_00_00_000) return `${s}₹${(a / 1_00_00_000).toFixed(2)} Cr`;
  if (a >= 1_00_000)    return `${s}₹${(a / 1_00_000).toFixed(2)} L`;
  if (a >= 1_000)       return `${s}₹${(a / 1_000).toFixed(1)}k`;
  return `${s}₹${a.toFixed(0)}`;
};
const fmtPnl = (n: number) => {
  const a = Math.abs(n), s = n >= 0 ? '+' : '−';
  if (a >= 1_00_00_000) return `${s}₹${(a / 1_00_00_000).toFixed(2)} Cr`;
  if (a >= 1_00_000)    return `${s}₹${(a / 1_00_000).toFixed(2)} L`;
  if (a >= 1_000)       return `${s}₹${(a / 1_000).toFixed(1)}k`;
  return `${s}₹${a.toFixed(0)}`;
};
const pclr  = (n: number) => n > 0 ? '#4ade80' : n < 0 ? '#f87171' : '#94a3b8';
const month0 = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const tradingDaysLeft = () => {
  const now = new Date(), end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  let c = 0;
  const cur = new Date(now); cur.setDate(cur.getDate() + 1);
  while (cur <= end) { if (cur.getDay() !== 0 && cur.getDay() !== 6) c++; cur.setDate(cur.getDate() + 1); }
  return c;
};
const tradingDaysInMonth = () => {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth();
  const start = new Date(y, m, 1), end = new Date(y, m + 1, 0);
  let c = 0; const cur = new Date(start);
  while (cur <= end) { if (cur.getDay() !== 0 && cur.getDay() !== 6) c++; cur.setDate(cur.getDate() + 1); }
  return c;
};
const tradingDaysDone = () => tradingDaysInMonth() - tradingDaysLeft();
function holdingDays(buy: string, sell?: string): number {
  const a = new Date(buy), b = sell ? new Date(sell) : new Date();
  let c = 0; const cur = new Date(a);
  while (cur <= b) { if (cur.getDay() !== 0 && cur.getDay() !== 6) c++; cur.setDate(cur.getDate() + 1); }
  return Math.max(1, c - 1);
}

/* ─── Section header ─────────────────────────────────────────────────────── */
function SectionHead({ icon, title, sub, color = '#818cf8' }: { icon: string; title: string; sub: string; color?: string }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
        style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
        {icon}
      </div>
      <div>
        <p className="font-black text-sm" style={{ color: 'var(--text-hi)', letterSpacing: '-0.01em' }}>{title}</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>
      </div>
    </div>
  );
}

/* ─── Metric tile ────────────────────────────────────────────────────────── */
function Tile({ label, value, sub, color, size = 'md' }: { label: string; value: string; sub?: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  const fs = size === 'lg' ? 26 : size === 'md' ? 18 : 14;
  return (
    <div className="rounded-xl p-3.5" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
      <p className="text-[9px] font-black uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="font-black leading-none" style={{ color, fontSize: fs, letterSpacing: '-0.02em' }}>{value}</p>
      {sub && <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  );
}

/* ─── Mini sparkline bar ─────────────────────────────────────────────────── */
function Bar({ pct, color, height = 6 }: { pct: number; color: string; height?: number }) {
  return (
    <div className="rounded-full overflow-hidden" style={{ height, background: 'var(--bg-sunken)' }}>
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: `linear-gradient(90deg,${color}70,${color})` }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODULE 1 — Monthly 5% Target Tracker
══════════════════════════════════════════════════════════════════════════════*/
function MonthlyTargetTracker({ trades, monthlyTarget }: { trades: Trade[]; monthlyTarget: number }) {
  const cur = month0();

  const { thisMonthRealized, openUnrealized, totalInvested, effectivePortfolio } = useMemo(() => {
    let realized = 0;
    trades.forEach(t => {
      t.sells.forEach(s => {
        if (s.sellDate.startsWith(cur)) realized += s.realizedPnL;
      });
    });
    const openUnrealized = trades
      .filter(t => t.status !== 'closed')
      .reduce((sum, t) => sum + t.unrealizedPnL, 0);
    const totalInvested  = trades.reduce((sum, t) => sum + t.totalInvested, 0);
    const effectivePortfolio = totalInvested + trades.reduce((sum, t) => sum + t.totalPnL, 0);
    return { thisMonthRealized: realized, openUnrealized, totalInvested, effectivePortfolio };
  }, [trades, cur]);

  const portfolioBase  = effectivePortfolio > 0 ? effectivePortfolio : totalInvested;
  const targetAmount   = portfolioBase * (monthlyTarget / 100);
  const currentMTD     = thisMonthRealized + openUnrealized;
  const progress       = targetAmount > 0 ? Math.min(100, (currentMTD / targetAmount) * 100) : 0;
  const shortfall      = Math.max(0, targetAmount - currentMTD);
  const daysLeft       = tradingDaysLeft();
  const daysDone       = tradingDaysDone();
  const dailyNeeded    = daysLeft > 0 ? shortfall / daysLeft : 0;
  const dailyRunRate   = daysDone > 0 ? currentMTD / daysDone : 0;
  const projectedMTD   = dailyRunRate * tradingDaysInMonth();
  const onPace         = projectedMTD >= targetAmount;
  const projPct        = portfolioBase > 0 ? (projectedMTD / portfolioBase) * 100 : 0;
  const clr            = progress >= 100 ? '#4ade80' : progress >= 60 ? '#fbbf24' : '#f87171';

  if (portfolioBase === 0) return (
    <div className="text-center py-8" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
      Record trades to activate the target tracker.
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Progress hero */}
      <div className="rounded-2xl p-5 relative overflow-hidden"
        style={{ background: `${clr}08`, border: `1px solid ${clr}25` }}>
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle,${clr}18 0%,transparent 70%)` }} />
        <div className="relative flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
              Month-to-date P&L
            </p>
            <p className="font-black leading-none" style={{ fontSize: 32, color: clr, letterSpacing: '-0.03em' }}>
              {fmtPnl(currentMTD)}
            </p>
            <p className="text-xs mt-1.5 font-semibold" style={{ color: 'var(--text-muted)' }}>
              {currentMTD >= 0 ? '+' : ''}{portfolioBase > 0 ? ((currentMTD / portfolioBase) * 100).toFixed(2) : '0.00'}% of portfolio
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Target</p>
            <p className="font-black" style={{ fontSize: 20, color: 'var(--text-hi)', letterSpacing: '-0.02em' }}>{fmtI(targetAmount)}</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{monthlyTarget}% of {fmtI(portfolioBase)}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-[9px] font-bold mb-1.5" style={{ color: 'var(--text-muted)' }}>
            <span>{progress.toFixed(1)}% of target</span>
            <span>{progress >= 100 ? '🎯 Target hit!' : `${fmtI(shortfall)} to go`}</span>
          </div>
          <div className="relative h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
            <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
              style={{ width: `${progress}%`, background: `linear-gradient(90deg,${clr}70,${clr})` }} />
            {/* 50% marker */}
            <div className="absolute top-0 bottom-0 w-px" style={{ left: '50%', background: 'rgba(255,255,255,0.15)' }} />
          </div>
        </div>
      </div>

      {/* Key metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Trading Days Left"   value={String(daysLeft)}        sub="in this month"                       color="#38bdf8" />
        <Tile label="Daily Run Rate"      value={fmtPnl(dailyRunRate)}    sub="avg per trading day so far"          color={pclr(dailyRunRate)} />
        <Tile label="Daily Target Needed" value={fmtI(dailyNeeded)}       sub={`to close shortfall in ${daysLeft}d`} color={dailyNeeded > 0 ? '#fbbf24' : '#4ade80'} />
        <Tile label="Projected Month-End" value={fmtPnl(projectedMTD)}    sub={`≈ ${projPct.toFixed(1)}% · ${onPace ? '✅ on pace' : '⚠️ off pace'}`} color={onPace ? '#4ade80' : '#f87171'} />
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-3.5" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
          <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>This Month's Realized</p>
          <p className="font-black text-base" style={{ color: pclr(thisMonthRealized) }}>{fmtPnl(thisMonthRealized)}</p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>From closed lots</p>
        </div>
        <div className="rounded-xl p-3.5" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
          <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Open Unrealized</p>
          <p className="font-black text-base" style={{ color: pclr(openUnrealized) }}>{fmtPnl(openUnrealized)}</p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Live positions (mark-to-market)</p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODULE 2 — Kelly Criterion Position Sizer
══════════════════════════════════════════════════════════════════════════════*/
function KellyCriterion({ stats, trades }: { stats: Stats | null; trades: Trade[] }) {
  const [capital, setCapital] = useState('');

  const { W, b, kelly, halfKelly, avgWin, avgLoss, sampleSize } = useMemo(() => {
    // Use evaluated predictions stats + closed trades for win/loss sizes
    const closed = trades.filter(t => t.status === 'closed');
    const wins   = closed.filter(t => t.totalPnLPct > 0);
    const losses = closed.filter(t => t.totalPnLPct <= 0);

    const W = stats ? stats.successRate / 100
              : closed.length > 0 ? wins.length / closed.length : 0.55;

    const avgWin  = wins.length   > 0 ? wins.reduce((s, t)   => s + t.totalPnLPct, 0) / wins.length   : (stats?.avgReturn ?? 5);
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.totalPnLPct, 0) / losses.length) : 3;

    // b = avg win / avg loss (the payoff ratio)
    const b = avgLoss > 0 ? avgWin / avgLoss : 1;

    // Kelly formula: f* = (W×b − (1−W)) / b  =  W − (1−W)/b
    const kelly = Math.max(0, W - (1 - W) / b);
    const halfKelly = kelly / 2;
    const sampleSize = closed.length || stats?.totalEvaluated || 0;

    return { W, b, kelly, halfKelly, avgWin, avgLoss, sampleSize };
  }, [stats, trades]);

  const cap     = parseFloat(capital.replace(/,/g, '')) || 0;
  const fullAmt = cap * kelly;
  const halfAmt = cap * halfKelly;

  const PRESETS = [1_00_000, 5_00_000, 10_00_000, 25_00_000];

  return (
    <div className="space-y-4">
      {/* Formula display */}
      <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg,rgba(167,139,250,0.08),rgba(99,102,241,0.05))', border: '1px solid rgba(167,139,250,0.2)' }}>
        <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: '#a78bfa' }}>Kelly Formula</p>
        <div className="flex items-center gap-2 flex-wrap font-mono text-xs" style={{ color: 'var(--text-lo)' }}>
          <span style={{ color: '#c4b5fd' }}>f* = W − (1−W) / b</span>
          <span style={{ color: 'var(--text-muted)' }}>→</span>
          <span style={{ color: '#a78bfa' }}>{(W * 100).toFixed(1)}% − {((1 - W) * 100).toFixed(1)}% / {b.toFixed(2)}</span>
          <span style={{ color: 'var(--text-muted)' }}>→</span>
          <span className="font-black" style={{ color: '#c4b5fd', fontSize: 14 }}>{(kelly * 100).toFixed(1)}%</span>
        </div>
        <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
          Based on {sampleSize} evaluated trade{sampleSize !== 1 ? 's' : ''} · {(W * 100).toFixed(1)}% win rate · avg win +{avgWin.toFixed(1)}% / avg loss −{avgLoss.toFixed(1)}%
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Win Rate (W)"       value={`${(W * 100).toFixed(1)}%`}         color="#4ade80"  sub={`${sampleSize} trades`} />
        <Tile label="Payoff Ratio (b)"   value={b.toFixed(2)}                        color="#38bdf8"  sub={`win ÷ loss size`} />
        <Tile label="Full Kelly"         value={`${(kelly * 100).toFixed(1)}%`}      color="#a78bfa"  sub="per trade (aggressive)" />
        <Tile label="Half Kelly"         value={`${(halfKelly * 100).toFixed(1)}%`}  color="#34d399"  sub="recommended (safer)" />
      </div>

      {/* Capital calculator */}
      <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          💰 Position Size Calculator
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-black" style={{ color: 'var(--text-muted)' }}>₹</span>
          <input type="text" inputMode="numeric" placeholder="Your trading capital…"
            value={capital}
            onChange={e => setCapital(e.target.value)}
            className="flex-1 bg-transparent font-black outline-none"
            style={{ fontSize: 28, letterSpacing: '-0.02em', color: cap > 0 ? '#a78bfa' : 'var(--text-lo)', minWidth: 0 }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(v => (
            <button key={v} onClick={() => setCapital(v.toLocaleString('en-IN'))}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
              style={{
                background: cap === v ? 'rgba(167,139,250,0.2)' : 'var(--bg-sunken)',
                border: `1px solid ${cap === v ? 'rgba(167,139,250,0.5)' : 'var(--border-sm)'}`,
                color: cap === v ? '#a78bfa' : 'var(--text-lo)',
              }}>
              {fmtI(v)}
            </button>
          ))}
        </div>

        {cap > 0 && (
          <div className="grid grid-cols-2 gap-3 pt-2" style={{ borderTop: '1px solid var(--border-sm)' }}>
            <div className="rounded-xl p-3.5" style={{ background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)' }}>
              <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Full Kelly / trade</p>
              <p className="font-black text-lg" style={{ color: '#f87171' }}>{fmtI(fullAmt)}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>High risk — can cause drawdown</p>
            </div>
            <div className="rounded-xl p-3.5" style={{ background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.2)' }}>
              <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Half Kelly / trade ✅</p>
              <p className="font-black text-lg" style={{ color: '#34d399' }}>{fmtI(halfAmt)}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Recommended — smoother equity curve</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODULE 3 — Compounding Projector
══════════════════════════════════════════════════════════════════════════════*/
function CompoundingProjector({ trades }: { trades: Trade[] }) {
  const [rate,    setRate]    = useState('5');
  const [baseRaw, setBaseRaw] = useState('');

  const derivedBase = useMemo(() => {
    const inv = trades.reduce((s, t) => s + t.totalInvested, 0);
    const pnl = trades.reduce((s, t) => s + t.totalPnL, 0);
    return inv + pnl;
  }, [trades]);

  const base = parseFloat(baseRaw.replace(/,/g, '')) || (derivedBase > 0 ? derivedBase : 5_00_000);
  const r    = parseFloat(rate) / 100 || 0.05;

  const milestones = [10_00_000, 25_00_000, 50_00_000, 1_00_00_000, 5_00_00_000];

  const months = [1, 3, 6, 12, 18, 24, 36, 48, 60];
  const rows   = months.map(m => ({ m, val: base * Math.pow(1 + r, m) }));

  const reachMs = milestones
    .filter(ms => ms > base)
    .map(ms => ({
      ms,
      mths: Math.ceil(Math.log(ms / base) / Math.log(1 + r)),
    }));

  const ratePresets = ['3', '5', '7', '10'];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
          <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Starting Capital</p>
          <div className="flex items-baseline gap-1">
            <span className="font-bold" style={{ color: 'var(--text-muted)' }}>₹</span>
            <input type="text" inputMode="numeric"
              placeholder={fmtI(base).replace('₹', '')}
              value={baseRaw}
              onChange={e => setBaseRaw(e.target.value)}
              className="flex-1 bg-transparent font-black outline-none text-xl"
              style={{ color: '#818cf8', minWidth: 0 }}
            />
          </div>
          {!baseRaw && derivedBase > 0 && (
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Auto from trades: {fmtI(derivedBase)}</p>
          )}
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
          <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Monthly Rate</p>
          <div className="flex items-baseline gap-1 mb-2">
            <input type="number" min="0.1" max="50" step="0.1"
              value={rate}
              onChange={e => setRate(e.target.value)}
              className="bg-transparent font-black outline-none text-xl"
              style={{ color: '#34d399', width: 60 }}
            />
            <span className="font-black text-xl" style={{ color: '#34d399' }}>%</span>
          </div>
          <div className="flex gap-1.5">
            {ratePresets.map(v => (
              <button key={v} onClick={() => setRate(v)}
                className="px-2 py-0.5 rounded text-[10px] font-bold"
                style={{
                  background: rate === v ? 'rgba(52,211,153,0.2)' : 'var(--bg-sunken)',
                  border: `1px solid ${rate === v ? 'rgba(52,211,153,0.4)' : 'var(--border-sm)'}`,
                  color: rate === v ? '#34d399' : 'var(--text-muted)',
                }}>
                {v}%
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Compound table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-sm)' }}>
        <div className="px-4 py-2.5" style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-sm)' }}>
          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Compounding Growth — {fmtI(base)} @ {rate}%/month
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-raised)' }}>
                {rows.map(r => (
                  <th key={r.m} className="px-3 py-2 text-center"
                    style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em',
                      borderBottom: '1px solid var(--border-sm)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    {r.m < 12 ? `${r.m}M` : `${r.m / 12}Y`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {rows.map((row, i) => {
                  const gain = row.val - base;
                  const gPct = (gain / base) * 100;
                  const intensity = Math.min(1, gPct / 200);
                  return (
                    <td key={row.m} className="px-3 py-3 text-center"
                      style={{ borderRight: i < rows.length - 1 ? '1px solid var(--border-sm)' : 'none' }}>
                      <p className="font-black" style={{ color: '#34d399', fontSize: 11, letterSpacing: '-0.01em' }}>{fmtI(row.val)}</p>
                      <p className="text-[9px] mt-0.5 font-semibold" style={{ color: `rgba(52,211,153,${0.4 + intensity * 0.5})` }}>
                        +{gPct.toFixed(0)}%
                      </p>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Milestone countdown */}
      {reachMs.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
            📍 Milestone Countdown at {rate}%/month
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {reachMs.slice(0, 4).map(({ ms, mths }) => (
              <div key={ms} className="rounded-xl p-3.5" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
                <p className="text-[9px] font-black uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  Reach {fmtI(ms)}
                </p>
                <p className="font-black text-lg" style={{ color: '#a78bfa' }}>
                  {mths < 12 ? `${mths}M` : `${(mths / 12).toFixed(1)}Y`}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {mths} compound months
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODULE 4 — Confidence Score vs Actual Win Rate
══════════════════════════════════════════════════════════════════════════════*/
function ConfidenceAnalysis({ predictions }: { predictions: Prediction[] }) {
  const buckets = useMemo(() => {
    const evaluated = predictions.filter(p =>
      ['Achieved', 'OverAchieved', 'MissedSlightly', 'Missed', 'Expired'].includes(p.status)
    );

    const BUCKETS = [
      { label: '< 50', min: 0,  max: 50  },
      { label: '50–60', min: 50, max: 60 },
      { label: '60–70', min: 60, max: 70 },
      { label: '70–80', min: 70, max: 80 },
      { label: '80+',   min: 80, max: 101 },
    ];

    return BUCKETS.map(bkt => {
      const group = evaluated.filter(p => p.confidenceScore >= bkt.min && p.confidenceScore < bkt.max);
      const wins  = group.filter(p => ['Achieved', 'OverAchieved'].includes(p.status));
      const rets  = group.map(p => p.finalReturn ?? p.bestReturn ?? p.tracking?.totalReturn ?? 0);
      const avgRet = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
      return {
        ...bkt,
        total:   group.length,
        wins:    wins.length,
        winRate: group.length > 0 ? (wins.length / group.length) * 100 : 0,
        avgRet,
      };
    }).filter(b => b.total > 0);
  }, [predictions]);

  if (buckets.length === 0) return (
    <div className="text-center py-8" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
      Need at least one evaluated prediction to show confidence analysis.
    </div>
  );

  const best = buckets.reduce((a, b) => b.winRate > a.winRate ? b : a, buckets[0]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)' }}>
        <p className="text-[11px] font-black" style={{ color: '#34d399' }}>
          🏆 Sweet spot: Score {best.label} → {best.winRate.toFixed(0)}% win rate · avg {best.avgRet >= 0 ? '+' : ''}{best.avgRet.toFixed(1)}% return
        </p>
        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
          Focus capital on predictions with confidence ≥ {best.min} for highest probability of hitting target.
        </p>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-sm)' }}>
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-raised)' }}>
              {['Confidence', 'Trades', 'Wins', 'Win Rate', 'Avg Return', 'Signal Strength'].map((h, i) => (
                <th key={h} style={{
                  padding: '10px 14px', fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                  textTransform: 'uppercase', color: 'var(--text-muted)',
                  textAlign: i > 1 ? 'right' : 'left',
                  borderBottom: '1px solid var(--border-sm)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {buckets.map((bkt, i) => {
              const isB = bkt.label === best.label;
              return (
                <tr key={bkt.label} style={{
                  background: isB ? 'rgba(52,211,153,0.05)' : i % 2 ? 'var(--bg-raised)' : 'transparent',
                  borderBottom: '1px solid var(--border-sm)',
                }}>
                  <td style={{ padding: '10px 14px' }}>
                    <div className="flex items-center gap-2">
                      {isB && <span style={{ fontSize: 12 }}>⭐</span>}
                      <span className="font-black text-xs" style={{ color: isB ? '#34d399' : 'var(--text-hi)' }}>
                        Score {bkt.label}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-lo)' }}>{bkt.total}</span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>{bkt.wins}</span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <span className="font-black" style={{
                      fontSize: 12,
                      color: bkt.winRate >= 60 ? '#4ade80' : bkt.winRate >= 40 ? '#fbbf24' : '#f87171',
                    }}>{bkt.winRate.toFixed(0)}%</span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <span className="font-bold text-xs" style={{ color: pclr(bkt.avgRet) }}>
                      {bkt.avgRet >= 0 ? '+' : ''}{bkt.avgRet.toFixed(1)}%
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', minWidth: 120 }}>
                    <Bar pct={bkt.winRate} color={bkt.winRate >= 60 ? '#4ade80' : bkt.winRate >= 40 ? '#fbbf24' : '#f87171'} height={6} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODULE 5 — Trade Efficiency (Return per Trading Day)
══════════════════════════════════════════════════════════════════════════════*/
function TradeEfficiency({ trades }: { trades: Trade[] }) {
  const scored = useMemo(() => {
    const closed = trades.filter(t => t.status === 'closed' && t.sells.length > 0);
    return closed.map(t => {
      const lastSell = t.sells[t.sells.length - 1];
      const days     = holdingDays(t.buyDate, lastSell.sellDate);
      const retPerDay = t.totalPnLPct / days;
      return { ...t, days, retPerDay };
    }).sort((a, b) => b.retPerDay - a.retPerDay);
  }, [trades]);

  if (scored.length === 0) return (
    <div className="text-center py-8" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
      Close at least one trade to see efficiency analysis.
    </div>
  );

  const avgRpd = scored.reduce((s, t) => s + t.retPerDay, 0) / scored.length;
  const avgDays = scored.reduce((s, t) => s + t.days, 0) / scored.length;
  const bestTrade = scored[0];

  function grade(rpd: number) {
    if (rpd >= 0.5)  return { label: 'S+', color: '#a78bfa' };
    if (rpd >= 0.3)  return { label: 'A',  color: '#4ade80' };
    if (rpd >= 0.15) return { label: 'B',  color: '#38bdf8' };
    if (rpd >= 0.0)  return { label: 'C',  color: '#fbbf24' };
    return            { label: 'D',  color: '#f87171' };
  }

  return (
    <div className="space-y-4">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Closed Trades"    value={String(scored.length)}             color="#818cf8" />
        <Tile label="Avg Holding"      value={`${avgDays.toFixed(0)} days`}       color="#38bdf8"  sub="per trade" />
        <Tile label="Avg Return/Day"   value={`${avgRpd >= 0 ? '+' : ''}${avgRpd.toFixed(2)}%`} color={pclr(avgRpd)} sub="capital efficiency" />
        <Tile label="Best Efficiency"  value={`${bestTrade.retPerDay.toFixed(2)}%/d`} color="#a78bfa" sub={bestTrade.stockSymbol} />
      </div>

      {/* Efficiency leaderboard */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-sm)' }}>
        <div className="px-4 py-2.5" style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-sm)' }}>
          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Return / Trading Day — Capital Efficiency Leaderboard
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-raised)' }}>
                {['#', 'Stock', 'Return', 'Days Held', 'Return/Day', 'Annualised', 'Grade', 'Efficiency'].map((h, i) => (
                  <th key={h} style={{
                    padding: '8px 12px', fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                    textTransform: 'uppercase', color: 'var(--text-muted)',
                    textAlign: i <= 1 ? 'left' : 'right',
                    borderBottom: '1px solid var(--border-sm)', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scored.slice(0, 10).map((t, i) => {
                const g      = grade(t.retPerDay);
                const annual = ((1 + t.retPerDay / 100) ** 252 - 1) * 100;
                const maxRpd = scored[0].retPerDay;
                return (
                  <tr key={t._id} style={{
                    background: i === 0 ? 'rgba(167,139,250,0.06)' : i % 2 ? 'var(--bg-raised)' : 'transparent',
                    borderBottom: '1px solid var(--border-sm)',
                  }}>
                    <td style={{ padding: '10px 12px' }}>
                      <span className="font-black" style={{ fontSize: 12, color: i === 0 ? '#a78bfa' : 'var(--text-muted)' }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <p className="font-black text-xs" style={{ color: 'var(--text-hi)' }}>{t.stockSymbol}</p>
                      <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{t.stockName?.slice(0, 18)}</p>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span className="font-bold text-xs" style={{ color: pclr(t.totalPnLPct) }}>
                        {t.totalPnLPct >= 0 ? '+' : ''}{t.totalPnLPct.toFixed(2)}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-lo)' }}>{t.days}d</span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span className="font-black text-xs" style={{ color: pclr(t.retPerDay) }}>
                        {t.retPerDay >= 0 ? '+' : ''}{t.retPerDay.toFixed(3)}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: pclr(annual) }}>
                        {annual >= 0 ? '+' : ''}{annual.toFixed(0)}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span className="font-black px-2 py-0.5 rounded-lg text-xs"
                        style={{ background: `${g.color}15`, color: g.color }}>{g.label}</span>
                    </td>
                    <td style={{ padding: '10px 20px 10px 12px', minWidth: 80 }}>
                      <Bar pct={maxRpd > 0 ? (t.retPerDay / maxRpd) * 100 : 0} color={g.color} height={5} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl px-4 py-3 text-[10px] leading-relaxed" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)', color: 'var(--text-muted)' }}>
        <strong style={{ color: 'var(--text-lo)' }}>Grade key:</strong>{' '}
        <span style={{ color: '#a78bfa' }}>S+ ≥ 0.5%/d</span> · <span style={{ color: '#4ade80' }}>A ≥ 0.3%/d</span> · <span style={{ color: '#38bdf8' }}>B ≥ 0.15%/d</span> · <span style={{ color: '#fbbf24' }}>C ≥ 0%/d</span> · <span style={{ color: '#f87171' }}>D negative</span>
        {' '}· Annualised = (1 + r/day)^252 − 1
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN EXPORT
══════════════════════════════════════════════════════════════════════════════*/
const TABS = [
  { key: 'target',    label: '🎯 Target',      title: '5% Monthly Target Tracker',        sub: 'MTD P&L · daily run rate · on-pace analysis',                         color: '#f87171' },
  { key: 'kelly',     label: '📐 Kelly',       title: 'Kelly Criterion Position Sizer',    sub: 'Optimal trade size from your win rate + payoff ratio',                color: '#a78bfa' },
  { key: 'compound',  label: '📈 Compound',    title: 'Compounding Projector',             sub: 'Corpus goals · growth table · milestone countdown',                   color: '#34d399' },
  { key: 'confidence',label: '🔬 Signals',     title: 'Confidence Score vs Win Rate',      sub: 'Which score bucket actually predicts winners',                        color: '#38bdf8' },
  { key: 'efficiency',label: '⚡ Efficiency',  title: 'Return per Trading Day',            sub: 'Capital efficiency leaderboard · annualised return · grade',          color: '#fbbf24' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function PredictionIntelligence({ predictions, stats, trades, monthlyTarget = 5 }: PredictionIntelligenceProps) {
  const [tab, setTab] = useState<TabKey>('target');
  const meta = TABS.find(t => t.key === tab)!;

  return (
    <div className="rounded-3xl overflow-hidden" style={{ border: '1px solid var(--border-md)', background: 'var(--bg-surface)' }}>

      {/* Header */}
      <div className="px-6 pt-6 pb-5 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,rgba(248,113,113,0.07),rgba(167,139,250,0.05),rgba(52,211,153,0.04))' }}>
        <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle,rgba(167,139,250,0.12) 0%,transparent 70%)' }} />
        <div className="relative flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
            style={{ background: 'linear-gradient(135deg,#f87171,#a78bfa)', boxShadow: '0 8px 20px rgba(248,113,113,0.25)' }}>
            🧠
          </div>
          <div>
            <h2 className="font-black text-base" style={{ color: 'var(--text-hi)', letterSpacing: '-0.02em' }}>
              Prediction Intelligence
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              5 mathematical engines to help you hit {monthlyTarget}% every month
            </p>
          </div>
        </div>

        {/* Tab strip */}
        <div className="relative flex flex-wrap gap-1.5 mt-5">
          {TABS.map(t => {
            const active = t.key === tab;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all duration-150"
                style={{
                  background: active ? `${t.color}20` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${active ? `${t.color}45` : 'rgba(255,255,255,0.07)'}`,
                  color: active ? t.color : 'var(--text-muted)',
                  transform: active ? 'scale(1.03)' : 'scale(1)',
                }}>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6" style={{ borderTop: '1px solid var(--border-sm)' }}>
        <SectionHead icon={meta.label.split(' ')[0]} title={meta.title} sub={meta.sub} color={meta.color} />

        {tab === 'target'     && <MonthlyTargetTracker  trades={trades}      monthlyTarget={monthlyTarget} />}
        {tab === 'kelly'      && <KellyCriterion        stats={stats}        trades={trades} />}
        {tab === 'compound'   && <CompoundingProjector  trades={trades} />}
        {tab === 'confidence' && <ConfidenceAnalysis     predictions={predictions} />}
        {tab === 'efficiency' && <TradeEfficiency        trades={trades} />}
      </div>
    </div>
  );
}
