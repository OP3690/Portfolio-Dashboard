'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';

/* ═══════════════════════════════════════════════════════════════════════════
   AI INVESTMENT PLANNER — fetches active predictions, scores them, and
   builds a goal-based allocation plan for a given investment amount.
══════════════════════════════════════════════════════════════════════════════*/

interface AIPrediction {
  _id: string;
  stockSymbol: string;
  stockName: string;
  entryPrice: number;
  targetReturn: number;
  confidenceScore: number;
  bestReturn: number;
  status: string;
  regime?: string;
  mcProbability?: number;
  backtestWinRate?: number;
  recommendationCount?: number;
  tracking?: { currentPrice: number; totalReturn: number; dailyChange: number } | null;
}

/* Compact Indian formatter */
const fmtI = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1_00_00_000) return `${s}₹${(a / 1_00_00_000).toFixed(2)} Cr`;
  if (a >= 1_00_000)    return `${s}₹${(a / 1_00_000).toFixed(2)} L`;
  if (a >= 1_000)       return `${s}₹${(a / 1_000).toFixed(1)}k`;
  return `${s}₹${a.toFixed(0)}`;
};

const GOAL_PRESETS = [
  { label: '5 L',  value: 5_00_000 },
  { label: '10 L', value: 10_00_000 },
  { label: '25 L', value: 25_00_000 },
  { label: '50 L', value: 50_00_000 },
  { label: '1 Cr', value: 1_00_00_000 },
];

const REGIME_MULT: Record<string, number> = {
  trending: 1.20, 'mean-reverting': 0.90, volatile: 0.75, quiet: 1.00,
};

interface AllocItem {
  prediction:   AIPrediction;
  alloc:        number;   // ₹ to invest
  projTarget:   number;   // at target return
  projConserv:  number;   // at half-target
  projBest:     number;   // at best-case (1.5× target or backtestReturn)
  score:        number;   // 0-1 composite signal score
  signal:       'Strong Buy' | 'Buy' | 'Watch' | 'Avoid';
  signalColor:  string;
  signalBg:     string;
  signalBorder: string;
  whyBuy:       string;
  whyAvoid:     string;
}

function scoreAndSignal(p: AIPrediction): { score: number; signal: AllocItem['signal']; color: string; bg: string; border: string; whyBuy: string; whyAvoid: string } {
  const conf   = (p.confidenceScore ?? 0) / 100;
  const mc     = p.mcProbability   ?? 0.5;
  const bt     = p.backtestWinRate ?? 0.5;
  const regime = p.regime ?? 'quiet';
  const rm     = REGIME_MULT[regime] ?? 1.0;
  const score  = Math.min(1, conf * 0.40 + mc * 0.30 + bt * 0.30) * rm;

  const reasons: string[] = [];
  const warns:   string[] = [];

  if (conf >= 0.75) reasons.push(`${p.confidenceScore}% confidence`);
  else if (conf < 0.5) warns.push(`low confidence (${p.confidenceScore}%)`);

  if (mc >= 0.6)  reasons.push(`MC prob ${(mc * 100).toFixed(0)}%`);
  else if (mc < 0.4) warns.push(`weak MC signal`);

  if (bt >= 0.6)  reasons.push(`backtest ${(bt * 100).toFixed(0)}% win rate`);
  else if (bt < 0.4) warns.push(`low backtest`);

  if (regime === 'trending')        reasons.push('trending regime');
  else if (regime === 'volatile')   warns.push('volatile regime');
  else if (regime === 'mean-reverting') warns.push('mean-reverting regime');

  if ((p.recommendationCount ?? 0) > 1) reasons.push(`recommended ${p.recommendationCount}× days`);

  let signal: AllocItem['signal'];
  let color: string, bg: string, border: string;

  if (score >= 0.62) {
    signal = 'Strong Buy'; color = '#34d399'; bg = 'rgba(52,211,153,0.12)'; border = 'rgba(52,211,153,0.30)';
  } else if (score >= 0.45) {
    signal = 'Buy';        color = '#38bdf8'; bg = 'rgba(56,189,248,0.12)'; border = 'rgba(56,189,248,0.30)';
  } else if (score >= 0.30) {
    signal = 'Watch';      color = '#fbbf24'; bg = 'rgba(251,191,36,0.12)';  border = 'rgba(251,191,36,0.30)';
  } else {
    signal = 'Avoid';      color = '#f87171'; bg = 'rgba(248,113,113,0.12)'; border = 'rgba(248,113,113,0.30)';
  }

  return {
    score, signal, color, bg, border,
    whyBuy:   reasons.slice(0, 3).join(' · ') || 'Meets base criteria',
    whyAvoid: warns.slice(0, 2).join(' · ')   || '',
  };
}

function buildPlan(predictions: AIPrediction[], investAmount: number): AllocItem[] {
  if (!predictions.length || investAmount <= 0) return [];

  const scored = predictions.map(p => ({ p, ...scoreAndSignal(p) }));

  // Only include non-Avoid signals in the allocation; Avoid stocks still shown for awareness
  const eligible = scored.filter(s => s.signal !== 'Avoid');
  const totalScore = eligible.reduce((s, x) => s + x.score, 0);

  return scored.map(({ p, score, signal, color, bg, border, whyBuy, whyAvoid }) => {
    const weight = signal !== 'Avoid' && totalScore > 0 ? score / totalScore : 0;
    const alloc  = Math.round((investAmount * weight) / 1000) * 1000; // round to ₹1k

    const target = (p.targetReturn ?? 5) / 100;
    const projConserv = alloc * (1 + target * 0.5);
    const projTarget  = alloc * (1 + target);
    // Best-case: use 1.5× target or the model's best-seen return, whichever is higher
    const bestR  = Math.max(target * 1.5, (p.bestReturn ?? 0) / 100);
    const projBest = alloc * (1 + bestR);

    return { prediction: p, alloc, projTarget, projConserv, projBest, score, signal, signalColor: color, signalBg: bg, signalBorder: border, whyBuy, whyAvoid };
  });
}

/* ─── Signal chip ─────────────────────────────────────────────────────────── */
function SignalChip({ item, size = 'sm' }: { item: AllocItem; size?: 'sm' | 'lg' }) {
  const icons: Record<string, string> = { 'Strong Buy': '🚀', Buy: '📈', Watch: '👁', Avoid: '⚠️' };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-black whitespace-nowrap ${size === 'lg' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'}`}
      style={{ background: item.signalBg, color: item.signalColor, border: `1px solid ${item.signalBorder}` }}>
      {icons[item.signal]} {item.signal}
    </span>
  );
}

/* ─── Animated projection bar ─────────────────────────────────────────────── */
function ProjBar({ label, value, max, color, alloc }: { label: string; value: number; max: number; color: string; alloc: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const gain = value - alloc;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>{label}</span>
        <div className="flex items-center gap-2">
          {gain > 0 && <span className="text-[9px] font-bold" style={{ color }}>{`+${fmtI(gain)}`}</span>}
          <span className="text-[11px] font-black" style={{ color }}>{fmtI(value)}</span>
        </div>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg,${color}80,${color})` }} />
      </div>
    </div>
  );
}

/* ─── Main planner component ─────────────────────────────────────────────── */
function AIInvestmentPlanner({ portfolioValue }: { portfolioValue: number }) {
  const [predictions,  setPredictions]  = useState<AIPrediction[]>([]);
  const [loadingPreds, setLoadingPreds] = useState(true);
  const [investRaw,    setInvestRaw]    = useState('');
  const [goalRaw,      setGoalRaw]      = useState('');
  const [goalPreset,   setGoalPreset]   = useState<number | null>(null);
  const [plan,         setPlan]         = useState<AllocItem[] | null>(null);
  const [generated,    setGenerated]    = useState(false);
  const [generating,   setGenerating]   = useState(false);

  useEffect(() => {
    fetch('/api/ai-predictions?status=Active&limit=10')
      .then(r => r.json())
      .then(d => { if (d.success) setPredictions(d.predictions); })
      .finally(() => setLoadingPreds(false));
  }, []);

  const investAmount = parseFloat(investRaw.replace(/,/g, '')) || 0;
  const goalAmount   = goalPreset ?? (parseFloat(goalRaw.replace(/,/g, '')) || 0);

  const projectedTotal = useMemo(() => {
    if (!plan) return 0;
    return plan.reduce((s, item) => s + (item.alloc > 0 ? item.projTarget : 0), 0);
  }, [plan]);

  const totalAlloc     = plan ? plan.reduce((s, i) => s + i.alloc, 0) : 0;
  const totalGain      = projectedTotal - totalAlloc;
  const totalReturnPct = totalAlloc > 0 ? (totalGain / totalAlloc) * 100 : 0;
  const portfolioAfter = portfolioValue + projectedTotal;
  const goalProgress   = goalAmount > 0 ? Math.min(100, (portfolioAfter / goalAmount) * 100) : null;

  function generate() {
    if (!predictions.length || investAmount <= 0) return;
    setGenerating(true);
    setTimeout(() => {
      setPlan(buildPlan(predictions, investAmount));
      setGenerated(true);
      setGenerating(false);
    }, 600);
  }

  const canGenerate = investAmount > 0 && !loadingPreds && predictions.length > 0;

  return (
    <div className="rounded-3xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-card-alt)' }}>

      {/* ══ HERO HEADER ══════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden px-6 pt-6 pb-5"
        style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.15) 0%,rgba(129,140,248,0.08) 50%,rgba(168,139,250,0.12) 100%)' }}>
        {/* Decorative glow blobs */}
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle,rgba(129,140,248,0.25) 0%,transparent 70%)' }} />
        <div className="absolute -bottom-4 left-12 w-24 h-24 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle,rgba(52,211,153,0.15) 0%,transparent 70%)' }} />

        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Icon */}
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 shadow-lg"
              style={{ background: 'linear-gradient(135deg,#6366f1,#818cf8,#a78bfa)', boxShadow: '0 8px 24px rgba(99,102,241,0.35)' }}>
              🤖
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-black text-base" style={{ color: 'var(--text-hi)' }}>AI Investment Planner</h3>
                {!loadingPreds && predictions.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black"
                    style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                    {predictions.length} LIVE PICK{predictions.length !== 1 ? 'S' : ''}
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)', maxWidth: 420 }}>
                Tell me how much you want to invest → I'll score every AI pick and build a smart allocation with projected returns
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ══ INPUT SECTION ════════════════════════════════════════════════════ */}
      <div className="px-6 py-5 space-y-5" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* ── Investment Amount ── */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs"
                style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>₹</div>
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                I want to invest
              </span>
            </div>
            {/* Big number display */}
            <div className="relative">
              <input
                type="text" inputMode="numeric" placeholder="0"
                value={investRaw}
                onChange={e => { setInvestRaw(e.target.value); setGenerated(false); }}
                className="w-full bg-transparent text-3xl font-black outline-none placeholder-opacity-30"
                style={{ color: investAmount > 0 ? '#818cf8' : 'var(--text-lo)' }}
              />
              {investAmount > 0 && (
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {fmtI(investAmount)}
                </p>
              )}
            </div>
            {/* Preset pills */}
            <div className="flex flex-wrap gap-1.5">
              {[25000, 50000, 100000, 200000, 500000].map(v => {
                const active = investAmount === v;
                return (
                  <button key={v}
                    onClick={() => { setInvestRaw(v.toLocaleString('en-IN')); setGenerated(false); }}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                    style={{
                      background: active ? 'rgba(99,102,241,0.2)' : 'var(--bg-card-alt)',
                      border: `1px solid ${active ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
                      color: active ? '#818cf8' : 'var(--text-lo)',
                    }}>
                    {fmtI(v)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Wealth Goal ── */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs"
                style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>🎯</div>
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Wealth goal
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-card-alt)', color: 'var(--text-muted)' }}>
                optional
              </span>
            </div>
            {/* Big number */}
            <div className="relative">
              <input
                type="text" inputMode="numeric" placeholder="0"
                value={goalPreset ? goalPreset.toLocaleString('en-IN') : goalRaw}
                onChange={e => { setGoalRaw(e.target.value); setGoalPreset(null); }}
                className="w-full bg-transparent text-3xl font-black outline-none"
                style={{ color: goalAmount > 0 ? '#34d399' : 'var(--text-lo)' }}
              />
              {goalAmount > 0 && (
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {fmtI(goalAmount)}
                </p>
              )}
            </div>
            {/* Goal presets */}
            <div className="flex flex-wrap gap-1.5">
              {GOAL_PRESETS.map(g => {
                const active = goalPreset === g.value;
                return (
                  <button key={g.value}
                    onClick={() => setGoalPreset(g.value === goalPreset ? null : g.value)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                    style={{
                      background: active ? 'rgba(52,211,153,0.2)' : 'var(--bg-card-alt)',
                      border: `1px solid ${active ? 'rgba(52,211,153,0.5)' : 'var(--border)'}`,
                      color: active ? '#34d399' : 'var(--text-lo)',
                    }}>
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Generate Button ── */}
        <button
          onClick={generate}
          disabled={!canGenerate || generating}
          className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2.5 transition-all"
          style={{
            background: canGenerate
              ? 'linear-gradient(135deg,#6366f1 0%,#818cf8 50%,#a78bfa 100%)'
              : 'var(--bg-card)',
            color: canGenerate ? '#fff' : 'var(--text-muted)',
            border: canGenerate ? 'none' : '1px solid var(--border)',
            boxShadow: canGenerate ? '0 4px 20px rgba(99,102,241,0.4)' : 'none',
            opacity: generating ? 0.8 : 1,
          }}>
          {loadingPreds ? (
            <><div className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />Loading AI picks…</>
          ) : generating ? (
            <><div className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />Calculating allocations…</>
          ) : predictions.length === 0 ? (
            <>⚠️ No active AI picks — go to Predictions tab first</>
          ) : !canGenerate ? (
            <>Enter an investment amount to get started</>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Generate Allocation Plan
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-white/20">
                {predictions.length} picks
              </span>
            </>
          )}
        </button>
      </div>

      {/* ══ PLAN OUTPUT ══════════════════════════════════════════════════════ */}
      {generated && plan && plan.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)' }}>

          {/* ── Hero summary banner ── */}
          <div className="px-6 py-5"
            style={{ background: 'linear-gradient(135deg,rgba(52,211,153,0.08) 0%,rgba(99,102,241,0.06) 100%)' }}>
            <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
              📊 Allocation Summary
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'You Invest',      val: fmtI(investAmount),                                                       color: '#818cf8', icon: '💰' },
                { label: 'Projected Value', val: fmtI(projectedTotal),                                                      color: '#34d399', icon: '📈' },
                { label: 'Expected Gain',   val: totalGain >= 0 ? `+${fmtI(totalGain)}` : fmtI(totalGain),                 color: totalGain >= 0 ? '#34d399' : '#f87171', icon: '🎯' },
                { label: 'Return',          val: totalAlloc > 0 ? `+${totalReturnPct.toFixed(1)}%` : '—',                  color: '#a78bfa', icon: '🚀' },
              ].map(c => (
                <div key={c.label} className="rounded-2xl p-4 text-center"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <p className="text-lg mb-1">{c.icon}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{c.label}</p>
                  <p className="text-lg font-black" style={{ color: c.color }}>{c.val}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Goal progress ── */}
          {goalAmount > 0 && (
            <div className="px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="rounded-2xl p-5" style={{
                background: goalProgress! >= 100
                  ? 'linear-gradient(135deg,rgba(52,211,153,0.1),rgba(16,185,129,0.08))'
                  : 'linear-gradient(135deg,rgba(99,102,241,0.08),rgba(129,140,248,0.05))',
                border: `1px solid ${goalProgress! >= 100 ? 'rgba(52,211,153,0.25)' : 'rgba(99,102,241,0.2)'}`,
              }}>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="text-sm font-black" style={{ color: 'var(--text-hi)' }}>
                      {goalProgress! >= 100 ? '🎯 Goal Achieved!' : 'Wealth Goal Progress'}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {portfolioValue > 0
                        ? `Portfolio ${fmtI(portfolioValue)} + this plan → ${fmtI(portfolioAfter)}`
                        : `This plan projects ${fmtI(projectedTotal)} toward your ${fmtI(goalAmount)} goal`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-black" style={{ color: goalProgress! >= 100 ? '#34d399' : '#818cf8' }}>
                      {goalProgress!.toFixed(1)}%
                    </p>
                    <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>of {fmtI(goalAmount)}</p>
                  </div>
                </div>
                {/* Progress track */}
                <div className="h-3 rounded-full overflow-hidden mb-2" style={{ background: 'var(--bg-sunken)' }}>
                  <div className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${goalProgress}%`,
                      background: goalProgress! >= 100
                        ? 'linear-gradient(90deg,#10b981,#34d399)'
                        : 'linear-gradient(90deg,#6366f1,#818cf8,#a78bfa)',
                    }} />
                </div>
                <div className="flex justify-between">
                  <span className="text-[9px] font-bold" style={{ color: 'var(--text-muted)' }}>₹0</span>
                  <span className="text-[10px] font-black"
                    style={{ color: goalProgress! >= 100 ? '#34d399' : '#818cf8' }}>
                    {goalProgress! >= 100
                      ? `🎉 ${fmtI(portfolioAfter - goalAmount)} over goal`
                      : `${fmtI(goalAmount - portfolioAfter)} more needed`}
                  </span>
                  <span className="text-[9px] font-bold" style={{ color: 'var(--text-muted)' }}>{fmtI(goalAmount)}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Allocation cards ── */}
          <div className="px-6 pb-6" style={{ borderTop: goalAmount > 0 ? '1px solid var(--border)' : undefined }}>
            {goalAmount === 0 && <div style={{ borderTop: '1px solid var(--border)', marginBottom: 20, marginTop: 0 }} />}
            <p className="text-[10px] font-black uppercase tracking-widest mb-4 pt-4" style={{ color: 'var(--text-muted)' }}>
              Stock Allocation — {plan.filter(i => i.signal !== 'Avoid').length} recommended · {plan.filter(i => i.signal === 'Avoid').length} to avoid
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {plan.map(item => {
                const isAvoid = item.signal === 'Avoid';
                const allocPct = investAmount > 0 ? (item.alloc / investAmount) * 100 : 0;
                const multiplier = item.alloc > 0 ? (item.projTarget / item.alloc) : 1;
                return (
                  <div key={item.prediction._id} className="rounded-2xl overflow-hidden"
                    style={{
                      background: 'var(--bg-card)',
                      border: `1px solid ${isAvoid ? 'var(--border)' : item.signalBorder}`,
                      opacity: isAvoid ? 0.6 : 1,
                    }}>

                    {/* Gradient header strip */}
                    <div className="h-1.5" style={{
                      background: isAvoid
                        ? 'var(--bg-sunken)'
                        : `linear-gradient(90deg,${item.signalColor},${item.signalColor}50,transparent)`,
                    }} />

                    <div className="p-4 space-y-3">
                      {/* Stock name + signal */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-base font-black leading-none" style={{ color: 'var(--text-hi)' }}>
                              {item.prediction.stockSymbol}
                            </p>
                            {!isAvoid && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md"
                                style={{ background: `${item.signalColor}18`, color: item.signalColor, border: `1px solid ${item.signalBorder}` }}>
                                {allocPct.toFixed(0)}% of corpus
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                            {item.prediction.stockName}
                          </p>
                        </div>
                        <SignalChip item={item} />
                      </div>

                      {isAvoid ? (
                        /* ── Avoid state ── */
                        <div className="rounded-xl p-3"
                          style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)' }}>
                          <p className="text-xs font-black mb-1" style={{ color: '#f87171' }}>⚠️ Not Recommended</p>
                          <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                            {item.whyAvoid || 'Signal score below threshold'}
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* ── Invest → Becomes ── */}
                          <div className="rounded-xl p-3.5"
                            style={{ background: `${item.signalColor}0A`, border: `1px solid ${item.signalBorder}` }}>
                            <div className="flex items-center gap-3">
                              <div className="flex-1 text-center">
                                <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>Invest</p>
                                <p className="text-xl font-black" style={{ color: 'var(--text-hi)' }}>{fmtI(item.alloc)}</p>
                              </div>
                              <div className="flex flex-col items-center gap-1 shrink-0">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center"
                                  style={{ background: `${item.signalColor}20` }}>
                                  <svg className="w-4 h-4" style={{ color: item.signalColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                  </svg>
                                </div>
                                <span className="text-[9px] font-black" style={{ color: item.signalColor }}>
                                  {multiplier.toFixed(2)}×
                                </span>
                              </div>
                              <div className="flex-1 text-center">
                                <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>Becomes</p>
                                <p className="text-xl font-black" style={{ color: item.signalColor }}>{fmtI(item.projTarget)}</p>
                              </div>
                            </div>
                          </div>

                          {/* ── Projection scenarios ── */}
                          <div className="space-y-2.5">
                            <ProjBar label="🐢 Conservative" value={item.projConserv} max={item.projBest} color="#fbbf24" alloc={item.alloc} />
                            <ProjBar label="🎯 At Target"    value={item.projTarget}  max={item.projBest} color={item.signalColor} alloc={item.alloc} />
                            <ProjBar label="🚀 Best Case"    value={item.projBest}    max={item.projBest} color="#a78bfa" alloc={item.alloc} />
                          </div>

                          {/* ── Model metrics row ── */}
                          <div className="grid grid-cols-3 gap-1.5">
                            {[
                              { key: 'CONF', val: `${item.prediction.confidenceScore}%`, color: 'var(--text-hi)' },
                              { key: 'MC',   val: item.prediction.mcProbability != null ? `${(item.prediction.mcProbability * 100).toFixed(0)}%` : '—', color: '#818cf8' },
                              { key: 'BT',   val: item.prediction.backtestWinRate != null ? `${(item.prediction.backtestWinRate * 100).toFixed(0)}%` : '—', color: '#a78bfa' },
                            ].map(m => (
                              <div key={m.key} className="rounded-xl p-2 text-center"
                                style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
                                <p className="text-[8px] font-black uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>{m.key}</p>
                                <p className="text-xs font-black" style={{ color: m.color }}>{m.val}</p>
                              </div>
                            ))}
                          </div>

                          {/* ── Why buy ── */}
                          {item.whyBuy && (
                            <div className="rounded-lg px-2.5 py-2 flex items-start gap-1.5"
                              style={{ background: `${item.signalColor}08`, border: `1px solid ${item.signalBorder}` }}>
                              <span className="text-[10px] mt-px shrink-0" style={{ color: item.signalColor }}>✓</span>
                              <p className="text-[10px] leading-snug" style={{ color: 'var(--text-muted)' }}>{item.whyBuy}</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Disclaimer */}
            <div className="mt-5 rounded-xl px-4 py-3 flex items-start gap-2.5"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <span className="text-sm shrink-0 mt-0.5">⚠️</span>
              <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text-lo)' }}>Not financial advice.</strong> Projections are based on AI model targets and historical backtest data.
                Past performance does not guarantee future results. Always conduct your own research before investing.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loadingPreds && predictions.length === 0 && (
        <div className="px-6 py-8 text-center" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-3xl mb-3">🔭</p>
          <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-hi)' }}>No Active AI Picks</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Go to the <strong>Predictions</strong> tab and click "Run Predictions" to generate fresh AI picks.
          </p>
        </div>
      )}
    </div>
  );
}

interface Holding {
  stockName?: string; isin?: string; sectorName?: string;
  marketValue?: number; investmentAmount?: number;
  xirr?: number; cagr?: number;
  profitLossTillDatePercent?: number;
  holdingPeriodYears?: number; holdingPeriodMonths?: number;
}
interface Props { holdings: Holding[]; }

/* ─── Buying Opportunity Score ─────────────────────────────────────────────
   Scores each stock 0-100 across 5 dimensions using available data.
   No external price feed — derived from XIRR, CAGR, P&L%, hold period,
   and milestone position. Intended as a quantitative signal, not advice.
────────────────────────────────────────────────────────────────────────── */
interface BuySignal {
  score: number;
  label: string;
  emoji: string;
  color: string;
  bg:    string;
  border:string;
  reason: string;
}

function buySignal(h: Holding, pct: number): BuySignal {
  const xirr    = h.xirr    ?? 0;
  const cagr    = h.cagr    ?? 0;
  const plPct   = h.profitLossTillDatePercent ?? 0;
  const yrsFull = (h.holdingPeriodYears ?? 0) + (h.holdingPeriodMonths ?? 0) / 12;
  let score = 0;
  const reasons: string[] = [];

  /* ── 1. XIRR momentum (0-28 pts) ─────────────────────────────────────── */
  if      (xirr >= 30) { score += 28; reasons.push('exceptional XIRR'); }
  else if (xirr >= 20) { score += 24; reasons.push('strong XIRR'); }
  else if (xirr >= 12) { score += 18; reasons.push('healthy XIRR'); }
  else if (xirr >= 5)  { score += 12; reasons.push('moderate XIRR'); }
  else if (xirr >= 0)  { score +=  6; reasons.push('flat returns'); }
  else                 { score +=  0; reasons.push('negative XIRR'); }

  /* ── 2. P&L position — room to run vs stretched (0-24 pts) ───────────── */
  if      (plPct >= 5  && plPct <= 40)  { score += 24; reasons.push('healthy gain, room to grow'); }
  else if (plPct >  40 && plPct <= 80)  { score += 18; reasons.push('good gains, moderately extended'); }
  else if (plPct > -15 && plPct < 5)    { score += 20; reasons.push('near entry — attractive add'); }
  else if (plPct >= -30 && plPct < -15) { score += 10; reasons.push('in drawdown — recovery watch'); }
  else if (plPct > 80)                  { score += 10; reasons.push('large gains — caution on timing'); }
  else                                  { score +=  2; reasons.push('deep loss'); }

  /* ── 3. CAGR vs 12% market benchmark (0-22 pts) ─────────────────────── */
  if      (cagr >= 25) { score += 22; reasons.push('CAGR well above market'); }
  else if (cagr >= 18) { score += 18; reasons.push('CAGR above market'); }
  else if (cagr >= 12) { score += 13; reasons.push('CAGR at market level'); }
  else if (cagr >= 0)  { score +=  7; reasons.push('CAGR below market'); }
  else                 { score +=  0; reasons.push('negative CAGR'); }

  /* ── 4. Holding period maturity (0-16 pts) ───────────────────────────── */
  if      (yrsFull >= 1 && yrsFull <= 4) { score += 16; reasons.push('proven 1-4yr compounder'); }
  else if (yrsFull > 4 && yrsFull <= 7)  { score += 12; reasons.push('mature holding'); }
  else if (yrsFull < 1)                  { score +=  6; reasons.push('< 1yr — limited history'); }
  else                                   { score +=  8; reasons.push('long-term holding'); }

  /* ── 5. Milestone position — how much upside remains (0-10 pts) ─────── */
  if      (pct >= 20 && pct <= 65) { score += 10; reasons.push('strong upside to goal'); }
  else if (pct >  65 && pct < 90)  { score +=  6; reasons.push('moderate upside remaining'); }
  else if (pct < 20)               { score +=  7; reasons.push('large gap to goal'); }
  else                             { score +=  3; reasons.push('near goal value'); }

  /* ── Map score → signal ─────────────────────────────────────────────── */
  if (score >= 72) return { score, label: 'Strong Buy',  emoji: '🚀', color: '#4ade80', bg: 'rgba(74,222,128,.15)',  border: 'rgba(74,222,128,.35)',  reason: reasons.slice(0,2).join(' · ') };
  if (score >= 56) return { score, label: 'Buy',         emoji: '📈', color: '#38bdf8', bg: 'rgba(56,189,248,.15)', border: 'rgba(56,189,248,.35)',  reason: reasons.slice(0,2).join(' · ') };
  if (score >= 40) return { score, label: 'Watch',       emoji: '👁',  color: '#fbbf24', bg: 'rgba(251,191,36,.15)', border: 'rgba(251,191,36,.35)',  reason: reasons.slice(0,2).join(' · ') };
  return              { score, label: 'Caution',       emoji: '⚠️', color: '#f87171', bg: 'rgba(248,113,113,.15)',border: 'rgba(248,113,113,.35)', reason: reasons.slice(0,2).join(' · ') };
}

const STEP  = 50_000;
const GOALS = [3_00_000, 5_00_000, 10_00_000] as const;
const GL    : Record<number, string> = { 300000: '3L', 500000: '5L', 1000000: '10L' };

const fmtV = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_00_000) return `₹${(v / 1_00_000).toFixed(2)}L`;
  if (a >= 1_000)    return `₹${(v / 1_000).toFixed(1)}k`;
  return `₹${v.toFixed(0)}`;
};
const fmtS = (v: number) =>
  v >= 1_00_000 ? `₹${(v / 1_00_000).toFixed(1)}L` : v >= 1_000 ? `₹${(v / 1_000).toFixed(0)}k` : `₹${v}`;

const nextMs = (v: number) => { const n = Math.ceil(Math.max(v, 1) / STEP) * STEP; return n > v ? n : n + STEP; };

const pColor = (p: number) =>
  p >= 100 ? '#16a34a' : p >= 75 ? '#15803d' : p >= 50 ? '#0284c7' : p >= 25 ? '#b45309' : '#dc2626';

const pColorBright = (p: number) =>
  p >= 100 ? '#4ade80' : p >= 75 ? '#34d399' : p >= 50 ? '#38bdf8' : p >= 25 ? '#fbbf24' : '#f87171';

const pBadgeBg = (p: number) =>
  p >= 100 ? 'rgba(74,222,128,.18)' : p >= 75 ? 'rgba(52,211,153,.18)' : p >= 50 ? 'rgba(56,189,248,.18)' : p >= 25 ? 'rgba(251,191,36,.18)' : 'rgba(248,113,113,.18)';

/* ── Tooltip ── */
function ChartTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="card p-3 text-xs space-y-1" style={{ minWidth: 200, border: '1px solid var(--border)' }}>
      <p className="font-bold text-hi text-sm">{d.fullName}</p>
      {d.sector && <p className="text-lo">{d.sector}</p>}
      <div className="space-y-1 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex justify-between gap-4"><span className="text-lo">Current</span><span className="font-bold" style={{ color: pColorBright(d.pct) }}>{fmtV(d.value)}</span></div>
        <div className="flex justify-between gap-4"><span className="text-lo">Progress</span><span className="font-bold" style={{ color: pColorBright(d.pct) }}>{d.pct.toFixed(1)}%</span></div>
        <div className="flex justify-between gap-4"><span className="text-lo">Next MS</span><span className="font-bold text-hi">{fmtV(d.nxt)}</span></div>
        <div className="flex justify-between gap-4"><span className="text-lo">To Goal</span><span className="font-bold" style={{ color: d.atGoal ? '#4ade80' : '#f87171' }}>{d.atGoal ? '✓ Done' : fmtV(d.needed)}</span></div>
        {d.xirr != null && <div className="flex justify-between gap-4"><span className="text-lo">XIRR</span><span className="font-bold" style={{ color: d.xirr >= 0 ? '#4ade80' : '#f87171' }}>{d.xirr >= 0 ? '+' : ''}{d.xirr.toFixed(1)}% p.a.</span></div>}
      </div>
    </div>
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
  const [view,   setView]   = useState<'list' | 'chart'>('list');

  const data = useMemo(() =>
    valid.map(h => {
      const v   = h.marketValue ?? 0;
      const pct = Math.min(100, (v / goal) * 100);
      const nxt = nextMs(v);
      return {
        name:     (h.stockName || h.isin || '?').slice(0, 22),
        fullName:  h.stockName || h.isin || '?',
        sector:    h.sectorName || '',
        xirr:      h.xirr ?? null,
        value: v, pct,
        nxt,
        toNxt:   Math.max(0, nxt > goal ? 0 : nxt - v),
        needed:  Math.max(0, goal - v),
        msDone:  Math.floor(v / STEP),
        msTotal: Math.ceil(goal / STEP),
        atGoal:  v >= goal,
        signal:  buySignal(h, Math.min(100, (v / goal) * 100)),
      };
    }).sort((a, b) =>
      sortBy === 'value'  ? b.value - a.value
      : sortBy === 'pct'  ? b.pct - a.pct
      : sortBy === 'needed' ? a.needed - b.needed
      : a.fullName.localeCompare(b.fullName)
    ),
  [valid, goal, sortBy]);

  const totalCurrentValue = useMemo(() => valid.reduce((s, h) => s + (h.marketValue ?? 0), 0), [valid]);

  const msLines    = useMemo(() => { const r = []; for (let m = STEP; m <= goal; m += STEP) r.push(m); return r; }, [goal]);
  const atGoalCnt  = data.filter(d => d.atGoal).length;
  const avgPct     = data.length ? data.reduce((s, d) => s + d.pct, 0) / data.length : 0;
  const totalNeed  = data.reduce((s, d) => s + d.needed, 0);
  const closestStk = [...data].filter(d => !d.atGoal).sort((a, b) => a.toNxt - b.toNxt)[0] ?? null;

  /* ── Progress bar with tick marks + labels ── */
  const ProgBar = ({ value, pct }: { value: number; pct: number }) => {
    const col = pColorBright(pct);
    // Decide which ticks get a visible label based on goal density
    const labelEvery = goal <= 3_00_000 ? STEP : goal <= 5_00_000 ? 1_00_000 : 1_00_000;
    // All ticks including ₹0 and goal
    const allTicks = [0, ...msLines];

    return (
      <div style={{ position: 'relative', paddingBottom: 20 }}>
        {/* track */}
        <div style={{ position: 'relative', height: 12, borderRadius: 999, overflow: 'visible', backgroundColor: 'var(--bg-card-alt)' }}>
          {/* fill */}
          <div style={{ position: 'absolute', inset: 0, borderRadius: 999, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${Math.min(100, pct)}%`,
              background: `linear-gradient(90deg, ${col}80, ${col})`,
              borderRadius: 999, transition: 'width .3s ease',
            }} />
          </div>
          {/* ticks */}
          {msLines.filter(m => m < goal).map(m => {
            const tp = (m / goal) * 100;
            return (
              <div key={m} style={{
                position: 'absolute', top: -2, bottom: -2,
                left: `${tp}%`, transform: 'translateX(-50%)',
                width: 2, borderRadius: 2,
                backgroundColor: value >= m ? 'rgba(255,255,255,0.85)' : 'rgba(128,128,128,0.35)',
                zIndex: 2,
              }} />
            );
          })}
        </div>

        {/* labels row — pinned below the track */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 16 }}>
          {allTicks.filter(m => m % labelEvery === 0 || m === 0).map(m => {
            const lp  = (m / goal) * 100;
            const passed = value >= m;
            const isFirst = m === 0;
            const isLast  = m === goal;
            return (
              <span key={m} style={{
                position: 'absolute',
                left: `${lp}%`,
                transform: isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                fontSize: 9,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                color: passed ? col : 'var(--text-lo)',
                lineHeight: 1,
              }}>
                {fmtS(m)}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  const btnBase: React.CSSProperties = {
    padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', border: 'none', transition: 'all .15s',
  };
  const tabActive  : React.CSSProperties = { ...btnBase, background: 'var(--brand)', color: '#fff' };
  const tabInactive: React.CSSProperties = { ...btnBase, background: 'transparent', color: 'var(--text-lo)' };
  const sortActive  : React.CSSProperties = { ...btnBase, background: 'var(--bg-card-alt)', color: 'var(--text-hi)', border: '1px solid var(--border)' };
  const sortInactive: React.CSSProperties = { ...btnBase, background: 'transparent', color: 'var(--text-lo)' };

  return (
    <div className="space-y-6">

      {/* ══ AI INVESTMENT PLANNER ══ */}
      <AIInvestmentPlanner portfolioValue={totalCurrentValue} />

    <div className="card p-5 space-y-5">

      {/* ══ HEADER ══ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-hi" style={{ fontSize: 17 }}>Stock Milestone Tracker</h3>
          <p className="text-lo text-xs mt-1">₹50k milestones · goal per stock: ₹{GL[goal]}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="flex gap-0.5 p-1 rounded-xl" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            <button style={view === 'list'  ? tabActive : tabInactive} onClick={() => setView('list')}>☰ List</button>
            <button style={view === 'chart' ? tabActive : tabInactive} onClick={() => setView('chart')}>▦ Chart</button>
          </div>

          {/* Sort */}
          <div className="flex gap-0.5 p-1 rounded-xl" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            {([['value','Value'],['pct','Progress'],['needed','Closest'],['name','A–Z']] as const).map(([k,l]) => (
              <button key={k} style={sortBy === k ? sortActive : sortInactive} onClick={() => setSortBy(k)}>{l}</button>
            ))}
          </div>

          {/* Goal */}
          <div className="flex gap-0.5 p-1 rounded-xl" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            {GOALS.map(g => (
              <button key={g} style={goal === g ? { ...btnBase, background: 'var(--brand)', color: '#fff', fontSize: 13, fontWeight: 700 } : { ...btnBase, color: 'var(--text-lo)', fontSize: 13 }} onClick={() => setGoal(g)}>
                {GL[g]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══ SUMMARY STRIP ══ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: `At ₹${GL[goal]} Goal`, value: `${atGoalCnt} / ${data.length}`, sub: atGoalCnt === data.length ? '🎯 All reached!' : `${data.length - atGoalCnt} stocks to go`, col: pColorBright(atGoalCnt === data.length ? 100 : (atGoalCnt / data.length) * 100) },
          { label: 'Avg Progress',   value: `${avgPct.toFixed(1)}%`,   sub: `toward ₹${GL[goal]}`,             col: pColorBright(avgPct) },
          { label: 'Total Remaining', value: fmtV(totalNeed),          sub: `to bring all to ₹${GL[goal]}`,   col: '#f87171' },
          { label: 'Closest to ₹50k', value: closestStk ? fmtV(closestStk.nxt) : '—', sub: closestStk ? `${closestStk.name} · ${fmtV(closestStk.toNxt)} away` : 'All at goal', col: '#a78bfa' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            <p className="text-lo font-semibold uppercase tracking-wide" style={{ fontSize: 10, marginBottom: 6 }}>{s.label}</p>
            <p className="font-extrabold" style={{ color: s.col, fontSize: 22, lineHeight: 1, marginBottom: 4 }}>{s.value}</p>
            <p className="text-lo truncate" style={{ fontSize: 11 }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ══ BUY SIGNAL SUMMARY ══ */}
      {(() => {
        const sb  = data.filter(d => d.signal.label === 'Strong Buy').length;
        const b   = data.filter(d => d.signal.label === 'Buy').length;
        const w   = data.filter(d => d.signal.label === 'Watch').length;
        const c   = data.filter(d => d.signal.label === 'Caution').length;
        const top = [...data].sort((a,b) => b.signal.score - a.signal.score).slice(0,3);
        return (
          <div className="rounded-xl p-4 flex flex-wrap items-center justify-between gap-4"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            <div>
              <p className="font-bold text-hi text-sm mb-1">Buying Opportunity Signals</p>
              <p className="text-lo" style={{ fontSize: 11 }}>
                Algo-scored on XIRR · CAGR · P&L position · hold period · goal gap · Not financial advice
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {[
                { emoji:'🚀', label:'Strong Buy', count:sb, color:'#4ade80' },
                { emoji:'📈', label:'Buy',         count:b,  color:'#38bdf8' },
                { emoji:'👁',  label:'Watch',       count:w,  color:'#fbbf24' },
                { emoji:'⚠️', label:'Caution',     count:c,  color:'#f87171' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 14 }}>{s.emoji}</span>
                  <div>
                    <p style={{ color: s.color, fontWeight: 700, fontSize: 18, lineHeight: 1 }}>{s.count}</p>
                    <p className="text-lo" style={{ fontSize: 10 }}>{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
            {top.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-lo" style={{ fontSize: 11 }}>Top picks:</span>
                {top.map(d => (
                  <span key={d.fullName} style={{
                    display:'inline-flex', alignItems:'center', gap:4,
                    padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:600,
                    color: d.signal.color, background: d.signal.bg, border:`1px solid ${d.signal.border}`,
                  }}>
                    {d.signal.emoji} {d.fullName.slice(0,14)} <span style={{ opacity:0.6, fontSize:10 }}>({d.signal.score})</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ══ CHART VIEW ══ */}
      {view === 'chart' && (
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
            <p className="font-bold text-hi text-sm">Holdings vs ₹{GL[goal]} Goal</p>
            <div className="flex flex-wrap gap-4 text-xs text-lo">
              {[['#4ade80','≥ 75%'],['#38bdf8','50–75%'],['#fbbf24','25–50%'],['#f87171','< 25%']].map(([c,l])=>(
                <span key={l} className="flex items-center gap-1.5"><span style={{ width:10,height:10,borderRadius:3,background:c,display:'inline-block' }} />{l}</span>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(320, data.length * 38 + 50)}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 155, left: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
              <XAxis type="number" domain={[0, goal]} tickFormatter={fmtS}
                tick={{ fill: 'var(--text-lo)' as any, fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={140}
                tick={{ fill: 'var(--text-hi)' as any, fontSize: 12, fontWeight: 500 }} tickLine={false} axisLine={false} />
              {msLines.filter(m => m % 1_00_000 !== 0).map(m => (
                <ReferenceLine key={m} x={m} stroke="rgba(128,128,128,0.1)" strokeDasharray="2 4" />
              ))}
              {msLines.filter(m => m % 1_00_000 === 0 && m < goal).map(m => (
                <ReferenceLine key={m} x={m} stroke="rgba(128,128,128,0.25)" strokeDasharray="4 3"
                  label={{ value: fmtS(m), fill: 'var(--text-lo)', fontSize: 10, position: 'top' }} />
              ))}
              <ReferenceLine x={goal} stroke="#eab308" strokeWidth={2} strokeDasharray="6 3"
                label={{ value: `${GL[goal]} Goal`, fill: '#eab308', fontSize: 11, fontWeight: 700, position: 'insideTopRight' }} />
              <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(128,128,128,0.06)' }} />
              <Bar dataKey="value" radius={[0, 5, 5, 0]} barSize={26} background={{ fill: 'rgba(128,128,128,0.08)', radius: 5 }}>
                {data.map((d, i) => <Cell key={i} fill={pColorBright(d.pct)} fillOpacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ══ LIST VIEW ══ */}
      {view === 'list' && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>

          {/* thead */}
          <div className="grid items-center px-4 py-3 text-xs font-bold uppercase tracking-wide text-lo"
            style={{ gridTemplateColumns: '2fr 1fr 3fr 1fr 80px 1fr 1fr', background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)', gap: 12 }}>
            <div>Stock</div>
            <div>Value</div>
            <div>Milestone Progress</div>
            <div>Done</div>
            <div>XIRR</div>
            <div>Next</div>
            <div>Remaining</div>
          </div>

          {/* rows */}
          {data.map((d, i) => {
            const bc = pColorBright(d.pct);
            return (
              <div key={d.fullName}
                className="grid items-center px-4 py-3 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                style={{
                  gridTemplateColumns: '2fr 1fr 3fr 1fr 80px 1fr 1fr',
                  gap: 12,
                  background: i % 2 === 0 ? 'transparent' : 'var(--bg-card-alt)',
                  borderBottom: i < data.length - 1 ? '1px solid var(--border)' : 'none',
                }}>

                {/* Stock name + sector + buy signal */}
                <div className="flex items-center gap-3 min-w-0">
                  {/* avatar */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: pBadgeBg(d.pct), border: `1.5px solid ${bc}50`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 800, color: pColor(d.pct),
                  }}>
                    {d.fullName.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-hi truncate" style={{ fontSize: 13 }}>{d.fullName}</p>
                    {d.sector && <p className="text-lo truncate" style={{ fontSize: 11, marginTop: 1 }}>{d.sector}</p>}
                    {/* buy signal badge */}
                    <div className="flex items-center gap-1.5 mt-1.5" title={`Score ${d.signal.score}/100 · ${d.signal.reason}`}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700,
                        color: d.signal.color, background: d.signal.bg, border: `1px solid ${d.signal.border}`,
                        whiteSpace: 'nowrap', cursor: 'help',
                      }}>
                        {d.signal.emoji} {d.signal.label}
                      </span>
                      <span style={{ fontSize: 9, color: 'var(--text-lo)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>
                        {d.signal.reason}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Value */}
                <div>
                  <p className="font-bold" style={{ color: bc, fontSize: 14 }}>{fmtV(d.value)}</p>
                  <p className="text-lo" style={{ fontSize: 10, marginTop: 1 }}>{d.msDone}/{d.msTotal} MS</p>
                </div>

                {/* Progress bar */}
                <div>
                  <ProgBar value={d.value} pct={d.pct} />
                </div>

                {/* Done % */}
                <div className="flex items-center gap-2">
                  <div className="font-bold" style={{ color: bc, fontSize: 14 }}>{d.pct.toFixed(0)}%</div>
                </div>

                {/* XIRR */}
                <div>
                  {d.xirr != null
                    ? <>
                        <p className="font-bold" style={{
                          fontSize: 13,
                          color: d.xirr >= 20 ? '#4ade80' : d.xirr >= 10 ? '#34d399' : d.xirr >= 0 ? '#fbbf24' : '#f87171',
                        }}>
                          {d.xirr >= 0 ? '+' : ''}{d.xirr.toFixed(1)}%
                        </p>
                        <p className="text-lo" style={{ fontSize: 10, marginTop: 1 }}>XIRR p.a.</p>
                      </>
                    : <p className="text-lo" style={{ fontSize: 12 }}>—</p>
                  }
                </div>

                {/* Next milestone */}
                <div>
                  {d.atGoal
                    ? <span className="font-bold text-xs px-2 py-1 rounded-full" style={{ background: pBadgeBg(100), color: '#4ade80', border: '1px solid rgba(74,222,128,.3)' }}>🎯 Goal</span>
                    : <>
                        <p className="font-semibold text-hi" style={{ fontSize: 13 }}>{fmtV(d.nxt)}</p>
                        <p className="text-lo" style={{ fontSize: 10, marginTop: 1 }}>{fmtV(d.toNxt)} away</p>
                      </>
                  }
                </div>

                {/* Remaining to goal */}
                <div>
                  {d.atGoal
                    ? <p className="font-bold" style={{ color: '#4ade80', fontSize: 13 }}>✓ Done</p>
                    : <>
                        <p className="font-semibold" style={{ color: '#f87171', fontSize: 13 }}>{fmtV(d.needed)}</p>
                        <p className="text-lo" style={{ fontSize: 10, marginTop: 1 }}>{(100 - d.pct).toFixed(0)}% left</p>
                      </>
                  }
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
    </div>
  );
}
