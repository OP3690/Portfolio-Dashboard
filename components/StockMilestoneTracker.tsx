'use client';

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES & SHARED HELPERS
══════════════════════════════════════════════════════════════════════════════*/

interface Holding {
  stockName?: string; isin?: string; sectorName?: string;
  marketValue?: number; investmentAmount?: number;
  xirr?: number; cagr?: number;
  profitLossTillDatePercent?: number;
  holdingPeriodYears?: number; holdingPeriodMonths?: number;
}

interface Props { holdings: Holding[]; }

interface BuySignal {
  score: number; label: string; emoji: string;
  color: string; bg: string; border: string; reason: string;
}

/* Compact Indian formatter */
const fmtI = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1_00_00_000) return `${s}₹${(a / 1_00_00_000).toFixed(2)} Cr`;
  if (a >= 1_00_000)    return `${s}₹${(a / 1_00_000).toFixed(2)} L`;
  if (a >= 1_000)       return `${s}₹${(a / 1_000).toFixed(1)}k`;
  return `${s}₹${a.toFixed(0)}`;
};

/* ─── Buying Opportunity Score ─────────────────────────────────────────────
   Scores each holding 0-100 across 5 dimensions: XIRR, P&L position,
   CAGR, holding period, and milestone proximity.
────────────────────────────────────────────────────────────────────────── */
function buySignal(h: Holding, pct: number): BuySignal {
  const xirr    = h.xirr    ?? 0;
  const cagr    = h.cagr    ?? 0;
  const plPct   = h.profitLossTillDatePercent ?? 0;
  const yrsFull = (h.holdingPeriodYears ?? 0) + (h.holdingPeriodMonths ?? 0) / 12;
  let score = 0;
  const reasons: string[] = [];

  if      (xirr >= 30) { score += 28; reasons.push('exceptional XIRR'); }
  else if (xirr >= 20) { score += 24; reasons.push('strong XIRR'); }
  else if (xirr >= 12) { score += 18; reasons.push('healthy XIRR'); }
  else if (xirr >= 5)  { score += 12; reasons.push('moderate XIRR'); }
  else if (xirr >= 0)  { score +=  6; reasons.push('flat returns'); }

  if      (plPct >= 5  && plPct <= 40)  { score += 24; reasons.push('healthy gain, room to grow'); }
  else if (plPct >  40 && plPct <= 80)  { score += 18; reasons.push('good gains, moderately extended'); }
  else if (plPct > -15 && plPct < 5)    { score += 20; reasons.push('near entry — attractive add'); }
  else if (plPct >= -30 && plPct < -15) { score += 10; reasons.push('in drawdown — recovery watch'); }
  else if (plPct > 80)                  { score += 10; reasons.push('large gains — caution on timing'); }
  else                                  { score +=  2; reasons.push('deep loss'); }

  if      (cagr >= 25) { score += 22; reasons.push('CAGR well above market'); }
  else if (cagr >= 18) { score += 18; reasons.push('CAGR above market'); }
  else if (cagr >= 12) { score += 13; reasons.push('CAGR at market level'); }
  else if (cagr >= 0)  { score +=  7; reasons.push('CAGR below market'); }

  if      (yrsFull >= 1 && yrsFull <= 4) { score += 16; reasons.push('proven 1-4yr compounder'); }
  else if (yrsFull > 4 && yrsFull <= 7)  { score += 12; reasons.push('mature holding'); }
  else if (yrsFull < 1)                  { score +=  6; reasons.push('< 1yr — limited history'); }
  else                                   { score +=  8; reasons.push('long-term holding'); }

  if      (pct >= 20 && pct <= 65) { score += 10; reasons.push('strong upside to goal'); }
  else if (pct >  65 && pct < 90)  { score +=  6; reasons.push('moderate upside remaining'); }
  else if (pct < 20)               { score +=  7; reasons.push('large gap to goal'); }
  else                             { score +=  3; reasons.push('near goal value'); }

  if (score >= 72) return { score, label: 'Strong Buy', emoji: '🚀', color: '#4ade80', bg: 'rgba(74,222,128,.15)',   border: 'rgba(74,222,128,.35)',   reason: reasons.slice(0,2).join(' · ') };
  if (score >= 56) return { score, label: 'Buy',        emoji: '📈', color: '#38bdf8', bg: 'rgba(56,189,248,.15)',  border: 'rgba(56,189,248,.35)',   reason: reasons.slice(0,2).join(' · ') };
  if (score >= 40) return { score, label: 'Watch',      emoji: '👁',  color: '#fbbf24', bg: 'rgba(251,191,36,.15)',  border: 'rgba(251,191,36,.35)',   reason: reasons.slice(0,2).join(' · ') };
  return             { score, label: 'Caution',      emoji: '⚠️', color: '#f87171', bg: 'rgba(248,113,113,.15)', border: 'rgba(248,113,113,.35)', reason: reasons.slice(0,2).join(' · ') };
}

/* ═══════════════════════════════════════════════════════════════════════════
   MILESTONE PLANNER — allocates fresh capital across portfolio holdings
   to complete the per-stock milestone goal as quickly as possible.
══════════════════════════════════════════════════════════════════════════════*/

interface PortfolioPlanItem {
  stockName: string; sector: string;
  currentValue: number; alloc: number; projectedValue: number;
  currentPct: number; projectedPct: number;
  gap: number; remainingGap: number; reachesGoal: boolean;
  allocPct: number; signal: BuySignal; xirr: number | null;
}

function buildPortfolioPlan(
  holdings: Holding[], milestoneGoal: number, investAmount: number,
): { items: PortfolioPlanItem[]; unallocated: number } {
  const eligible = holdings.filter(h => (h.marketValue ?? 0) > 0 && (h.marketValue ?? 0) < milestoneGoal);
  if (!eligible.length || investAmount <= 0 || milestoneGoal <= 0) return { items: [], unallocated: investAmount };

  const items = eligible.map(h => {
    const value = h.marketValue ?? 0;
    const pct   = Math.min(100, (value / milestoneGoal) * 100);
    const sig   = buySignal(h, pct);
    const gap   = milestoneGoal - value;
    // Score: 60% buy quality + 40% proximity (closer = higher priority)
    const score = (sig.score / 100) * 0.6 + (value / milestoneGoal) * 0.4;
    return { h, value, pct, sig, gap, score, alloc: 0 };
  });

  // Iterative: distribute proportionally, cap at gap, redistribute leftover
  let budget = investAmount;
  for (let iter = 0; iter < 6 && budget > 100; iter++) {
    const uncapped   = items.filter(it => it.alloc < it.gap - 100);
    if (!uncapped.length) break;
    const totalScore = uncapped.reduce((s, it) => s + it.score, 0);
    let used = 0;
    for (const it of uncapped) {
      const share = totalScore > 0 ? (it.score / totalScore) * budget : budget / uncapped.length;
      const add   = Math.min(share, it.gap - it.alloc);
      it.alloc += add;
      used     += add;
    }
    budget -= used;
  }

  const result: PortfolioPlanItem[] = items.map(it => {
    const alloc          = Math.round(it.alloc / 500) * 500;
    const projectedValue = it.value + alloc;
    return {
      stockName:    it.h.stockName || it.h.isin || '?',
      sector:       it.h.sectorName || '',
      currentValue: it.value, alloc, projectedValue,
      currentPct:   it.pct,
      projectedPct: Math.min(100, (projectedValue / milestoneGoal) * 100),
      gap:           it.gap,
      remainingGap:  Math.max(0, it.gap - alloc),
      reachesGoal:   projectedValue >= milestoneGoal,
      allocPct:      investAmount > 0 ? (alloc / investAmount) * 100 : 0,
      signal:        it.sig,
      xirr:          it.h.xirr ?? null,
    };
  }).sort((a, b) => {
    if (a.reachesGoal !== b.reachesGoal) return a.reachesGoal ? -1 : 1;
    return a.remainingGap - b.remainingGap;
  });

  const totalRounded = result.reduce((s, it) => s + it.alloc, 0);
  return { items: result, unallocated: Math.max(0, investAmount - totalRounded) };
}

/* ─── Animated milestone bar ─────────────────────────────────────────────── */
function MilestoneBar({ value, goal, color }: { value: number; goal: number; color: string }) {
  const pct = Math.min(100, (value / goal) * 100);
  return (
    <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
      <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: `linear-gradient(90deg,${color}70,${color})` }} />
    </div>
  );
}

/* ─── Milestone Planner component ────────────────────────────────────────── */
function AIInvestmentPlanner({
  portfolioValue,
  holdings,
  milestoneGoal,
}: {
  portfolioValue: number;
  holdings: Holding[];
  milestoneGoal: number;
}) {
  const [investRaw,  setInvestRaw]  = useState('');
  const [plan,       setPlan]       = useState<{ items: PortfolioPlanItem[]; unallocated: number } | null>(null);
  const [generated,  setGenerated]  = useState(false);
  const [generating, setGenerating] = useState(false);

  const investAmount = parseFloat(investRaw.replace(/,/g, '')) || 0;
  const eligible     = holdings.filter(h => (h.marketValue ?? 0) > 0 && (h.marketValue ?? 0) < milestoneGoal);
  const atGoalCount  = holdings.filter(h => (h.marketValue ?? 0) >= milestoneGoal).length;
  const totalNeeded  = eligible.reduce((s, h) => s + milestoneGoal - (h.marketValue ?? 0), 0);
  const canGenerate  = investAmount > 0 && eligible.length > 0;

  const INVEST_PRESETS = [25_000, 50_000, 1_00_000, 2_00_000, 5_00_000];

  function generate() {
    if (!canGenerate) return;
    setGenerating(true);
    setTimeout(() => {
      setPlan(buildPortfolioPlan(holdings, milestoneGoal, investAmount));
      setGenerated(true);
      setGenerating(false);
    }, 500);
  }

  const reachCount = plan?.items.filter(i => i.reachesGoal).length ?? 0;
  const totalAlloc = plan?.items.reduce((s, i) => s + i.alloc, 0) ?? 0;
  const totalGapAfter = plan?.items.reduce((s, i) => s + i.remainingGap, 0) ?? 0;

  return (
    <div className="rounded-3xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-card-alt)' }}>

      {/* ══ HERO HEADER ══ */}
      <div className="relative overflow-hidden px-6 pt-6 pb-5"
        style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(129,140,248,0.08),rgba(52,211,153,0.08))' }}>
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle,rgba(129,140,248,0.22) 0%,transparent 70%)' }} />
        <div className="absolute -bottom-6 left-20 w-32 h-32 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle,rgba(52,211,153,0.14) 0%,transparent 70%)' }} />

        <div className="relative flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
            style={{ background: 'linear-gradient(135deg,#6366f1,#818cf8,#a78bfa)', boxShadow: '0 8px 24px rgba(99,102,241,0.35)' }}>
            🎯
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-black text-base" style={{ color: 'var(--text-hi)' }}>Milestone Planner</h3>
              <span className="text-[10px] font-black px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}>
                Goal: {fmtI(milestoneGoal)} / stock
              </span>
              {atGoalCount > 0 && (
                <span className="text-[10px] font-black px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)' }}>
                  🎯 {atGoalCount} at goal
                </span>
              )}
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)', maxWidth: 480 }}>
              Enter how much you have to invest → I'll show exactly which of your holdings to top-up to reach the {fmtI(milestoneGoal)} milestone
            </p>
          </div>
        </div>

        {/* Mini stats */}
        <div className="relative flex flex-wrap gap-5 mt-4">
          {[
            { label: 'Below Goal',       val: String(eligible.length),    color: '#f87171' },
            { label: 'Total Gap',        val: fmtI(totalNeeded),          color: '#fbbf24' },
            { label: 'Portfolio Value',  val: fmtI(portfolioValue),       color: '#818cf8' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{s.label}:</span>
              <span className="text-[11px] font-black" style={{ color: s.color }}>{s.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══ INVESTMENT INPUT ══ */}
      <div className="px-6 py-5 space-y-4" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>₹</div>
            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              I have this much to invest
            </span>
          </div>
          <input
            type="text" inputMode="numeric" placeholder="Enter amount…"
            value={investRaw}
            onChange={e => { setInvestRaw(e.target.value); setGenerated(false); }}
            className="w-full bg-transparent text-4xl font-black outline-none"
            style={{ color: investAmount > 0 ? '#818cf8' : 'var(--text-lo)' }}
          />
          {investAmount > 0 && (
            <p className="text-xs font-bold -mt-1" style={{ color: 'var(--text-muted)' }}>{fmtI(investAmount)}</p>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {INVEST_PRESETS.map(v => {
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

        <button
          onClick={generate}
          disabled={!canGenerate || generating}
          className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2.5 transition-all"
          style={{
            background: canGenerate ? 'linear-gradient(135deg,#6366f1,#818cf8,#a78bfa)' : 'var(--bg-card)',
            color: canGenerate ? '#fff' : 'var(--text-muted)',
            border: canGenerate ? 'none' : '1px solid var(--border)',
            boxShadow: canGenerate ? '0 4px 20px rgba(99,102,241,0.4)' : 'none',
            opacity: generating ? 0.8 : 1,
          }}>
          {generating ? (
            <><div className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />Calculating plan…</>
          ) : eligible.length === 0 ? (
            <>🏆 All stocks already at {fmtI(milestoneGoal)} goal!</>
          ) : !canGenerate ? (
            <>Enter an amount to generate your plan</>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Show Me the Plan
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/20">
                {eligible.length} stocks
              </span>
            </>
          )}
        </button>
      </div>

      {/* ══ PLAN OUTPUT ══ */}
      {generated && plan && plan.items.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)' }}>

          {/* Summary banner */}
          <div className="px-6 py-5"
            style={{ background: 'linear-gradient(135deg,rgba(52,211,153,0.07),rgba(99,102,241,0.05))' }}>
            <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
              📊 Plan Summary
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'You Invest',     val: fmtI(totalAlloc),                                                     icon: '💰', color: '#818cf8' },
                { label: 'Hit Milestone',  val: `${reachCount} / ${plan.items.length}`,                               icon: '🎯', color: '#34d399' },
                { label: 'Unallocated',    val: plan.unallocated > 0 ? fmtI(plan.unallocated) : '₹0 (fully used)',   icon: '💼', color: plan.unallocated > 0 ? '#fbbf24' : '#34d399' },
                { label: 'Gap Remaining',  val: fmtI(totalGapAfter),                                                  icon: '📏', color: totalGapAfter === 0 ? '#34d399' : '#f87171' },
              ].map(c => (
                <div key={c.label} className="rounded-2xl p-3.5 text-center"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <p className="text-xl mb-1">{c.icon}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{c.label}</p>
                  <p className="text-sm font-black" style={{ color: c.color }}>{c.val}</p>
                </div>
              ))}
            </div>
            {plan.unallocated > 0 && (
              <p className="text-[10px] mt-3 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
                ℹ️ {fmtI(plan.unallocated)} unallocated — all eligible stocks reach their milestone with less than your full budget.
              </p>
            )}
          </div>

          {/* Per-stock allocation cards */}
          <div className="px-6 pb-6 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-[10px] font-black uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
              {reachCount > 0
                ? `🎯 ${reachCount} stock${reachCount > 1 ? 's' : ''} will reach ${fmtI(milestoneGoal)}`
                : 'Allocation breakdown'}
              {plan.items.length - reachCount > 0
                ? ` · ${plan.items.length - reachCount} will get closer`
                : ''}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {plan.items.map((item, idx) => {
                const sc = item.signal.color;
                const sb = item.signal.bg;
                const sr = item.signal.border;
                return (
                  <div key={item.stockName + idx} className="rounded-2xl overflow-hidden"
                    style={{
                      background: 'var(--bg-card)',
                      border: `1px solid ${item.reachesGoal ? 'rgba(52,211,153,0.35)' : sr}`,
                    }}>

                    {/* Colored top strip */}
                    <div className="h-1" style={{
                      background: item.reachesGoal
                        ? 'linear-gradient(90deg,#34d399,#10b981,transparent)'
                        : `linear-gradient(90deg,${sc},${sc}40,transparent)`,
                    }} />

                    <div className="p-4 space-y-3">

                      {/* Stock name + signal chip */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-base font-black" style={{ color: 'var(--text-hi)' }}>
                              {item.stockName.length > 20 ? item.stockName.slice(0, 20) + '…' : item.stockName}
                            </p>
                            {item.reachesGoal && (
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full"
                                style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                                🎯 Reaches Goal!
                              </span>
                            )}
                          </div>
                          {item.sector && (
                            <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{item.sector}</p>
                          )}
                        </div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black shrink-0"
                          style={{ background: sb, color: sc, border: `1px solid ${sr}` }}>
                          {item.signal.emoji} {item.signal.label}
                        </span>
                      </div>

                      {/* Before → After progress */}
                      <div className="rounded-xl p-3 space-y-2"
                        style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>

                        {/* Current state */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Now</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold" style={{ color: 'var(--text-lo)' }}>{item.currentPct.toFixed(0)}%</span>
                              <span className="text-xs font-black" style={{ color: 'var(--text-hi)' }}>{fmtI(item.currentValue)}</span>
                            </div>
                          </div>
                          <MilestoneBar value={item.currentValue} goal={milestoneGoal} color={sc} />
                        </div>

                        {/* Investment badge */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 border-t border-dashed" style={{ borderColor: 'var(--border)' }} />
                          <span className="text-[10px] font-black px-2.5 py-1 rounded-lg whitespace-nowrap"
                            style={{ background: `${sc}18`, color: sc, border: `1px solid ${sr}` }}>
                            + {fmtI(item.alloc)}
                          </span>
                          <div className="flex-1 border-t border-dashed" style={{ borderColor: 'var(--border)' }} />
                        </div>

                        {/* After state */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>After</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold"
                                style={{ color: item.reachesGoal ? '#34d399' : sc }}>
                                {item.projectedPct.toFixed(0)}%
                              </span>
                              <span className="text-xs font-black"
                                style={{ color: item.reachesGoal ? '#34d399' : sc }}>
                                {fmtI(item.projectedValue)}{item.reachesGoal ? ' 🎯' : ''}
                              </span>
                            </div>
                          </div>
                          <MilestoneBar
                            value={item.projectedValue}
                            goal={milestoneGoal}
                            color={item.reachesGoal ? '#34d399' : sc}
                          />
                        </div>
                      </div>

                      {/* Allocation % + still needed */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl p-2.5 text-center"
                          style={{ background: `${sc}0A`, border: `1px solid ${sr}` }}>
                          <p className="text-[8px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>of budget</p>
                          <p className="text-sm font-black" style={{ color: sc }}>{item.allocPct.toFixed(0)}%</p>
                        </div>
                        <div className="rounded-xl p-2.5 text-center"
                          style={{
                            background: item.reachesGoal ? 'rgba(52,211,153,0.08)' : 'var(--bg-card-alt)',
                            border: `1px solid ${item.reachesGoal ? 'rgba(52,211,153,0.2)' : 'var(--border)'}`,
                          }}>
                          <p className="text-[8px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>still needed</p>
                          <p className="text-sm font-black"
                            style={{ color: item.reachesGoal ? '#34d399' : '#f87171' }}>
                            {item.reachesGoal ? '✓ Done' : fmtI(item.remainingGap)}
                          </p>
                        </div>
                      </div>

                      {/* XIRR + signal reason */}
                      {(item.xirr != null || item.signal.reason) && (
                        <div className="flex flex-wrap items-center gap-2">
                          {item.xirr != null && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-md"
                              style={{
                                background: item.xirr >= 0 ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                                color: item.xirr >= 0 ? '#34d399' : '#f87171',
                              }}>
                              XIRR {item.xirr >= 0 ? '+' : ''}{item.xirr.toFixed(1)}%
                            </span>
                          )}
                          {item.signal.reason && (
                            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                              {item.signal.emoji} {item.signal.reason}
                            </span>
                          )}
                        </div>
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
                <strong style={{ color: 'var(--text-lo)' }}>Not financial advice.</strong> Allocation is based on XIRR, CAGR, P&L position and milestone proximity scores.
                Investing in a holding increases its portfolio value proportionally at current market price.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* All-at-goal state */}
      {eligible.length === 0 && holdings.length > 0 && (
        <div className="px-6 py-10 text-center" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-4xl mb-3">🏆</p>
          <p className="text-base font-black mb-1" style={{ color: '#34d399' }}>All Stocks at Goal!</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Every stock has reached the {fmtI(milestoneGoal)} milestone. Try increasing the goal above.
          </p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   STOCK MILESTONE TRACKER
══════════════════════════════════════════════════════════════════════════════*/

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

/* ── Chart tooltip ── */
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
        name:      (h.stockName || h.isin || '?').slice(0, 22),
        fullName:   h.stockName || h.isin || '?',
        sector:     h.sectorName || '',
        xirr:       h.xirr ?? null,
        value: v, pct,
        nxt,
        toNxt:    Math.max(0, nxt > goal ? 0 : nxt - v),
        needed:   Math.max(0, goal - v),
        msDone:   Math.floor(v / STEP),
        msTotal:  Math.ceil(goal / STEP),
        atGoal:   v >= goal,
        signal:   buySignal(h, Math.min(100, (v / goal) * 100)),
      };
    }).sort((a, b) =>
      sortBy === 'value'  ? b.value - a.value
      : sortBy === 'pct'  ? b.pct - a.pct
      : sortBy === 'needed' ? a.needed - b.needed
      : a.fullName.localeCompare(b.fullName)
    ),
  [valid, goal, sortBy]);

  const totalCurrentValue = useMemo(() => valid.reduce((s, h) => s + (h.marketValue ?? 0), 0), [valid]);

  const msLines    = useMemo(() => { const r: number[] = []; for (let m = STEP; m <= goal; m += STEP) r.push(m); return r; }, [goal]);
  const atGoalCnt  = data.filter(d => d.atGoal).length;
  const avgPct     = data.length ? data.reduce((s, d) => s + d.pct, 0) / data.length : 0;
  const totalNeed  = data.reduce((s, d) => s + d.needed, 0);
  const closestStk = [...data].filter(d => !d.atGoal).sort((a, b) => a.toNxt - b.toNxt)[0] ?? null;

  /* ── Progress bar with tick marks + labels ── */
  const ProgBar = ({ value, pct }: { value: number; pct: number }) => {
    const col = pColorBright(pct);
    const labelEvery = goal <= 3_00_000 ? STEP : 1_00_000;
    const allTicks = [0, ...msLines];
    return (
      <div style={{ position: 'relative', paddingBottom: 20 }}>
        <div style={{ position: 'relative', height: 12, borderRadius: 999, overflow: 'visible', backgroundColor: 'var(--bg-card-alt)' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 999, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${Math.min(100, pct)}%`,
              background: `linear-gradient(90deg, ${col}80, ${col})`,
              borderRadius: 999, transition: 'width .3s ease',
            }} />
          </div>
          {msLines.filter(m => m < goal).map(m => (
            <div key={m} style={{
              position: 'absolute', top: -2, bottom: -2,
              left: `${(m / goal) * 100}%`, transform: 'translateX(-50%)',
              width: 2, borderRadius: 2,
              backgroundColor: value >= m ? 'rgba(255,255,255,0.85)' : 'rgba(128,128,128,0.35)',
              zIndex: 2,
            }} />
          ))}
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 16 }}>
          {allTicks.filter(m => m % labelEvery === 0 || m === 0).map(m => {
            const lp     = (m / goal) * 100;
            const passed  = value >= m;
            const isFirst = m === 0;
            const isLast  = m === goal;
            return (
              <span key={m} style={{
                position: 'absolute', left: `${lp}%`,
                transform: isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                fontSize: 9, fontWeight: 600, whiteSpace: 'nowrap',
                color: passed ? col : 'var(--text-lo)', lineHeight: 1,
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

      {/* ══ MILESTONE PLANNER ══ */}
      <AIInvestmentPlanner
        portfolioValue={totalCurrentValue}
        holdings={valid}
        milestoneGoal={goal}
      />

      <div className="card p-5 space-y-5">

        {/* ══ HEADER ══ */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-hi" style={{ fontSize: 17 }}>Stock Milestone Tracker</h3>
            <p className="text-lo text-xs mt-1">₹50k milestones · goal per stock: ₹{GL[goal]}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-0.5 p-1 rounded-xl" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
              <button style={view === 'list'  ? tabActive : tabInactive} onClick={() => setView('list')}>☰ List</button>
              <button style={view === 'chart' ? tabActive : tabInactive} onClick={() => setView('chart')}>▦ Chart</button>
            </div>

            <div className="flex gap-0.5 p-1 rounded-xl" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
              {([['value','Value'],['pct','Progress'],['needed','Closest'],['name','A–Z']] as const).map(([k,l]) => (
                <button key={k} style={sortBy === k ? sortActive : sortInactive} onClick={() => setSortBy(k)}>{l}</button>
              ))}
            </div>

            <div className="flex gap-0.5 p-1 rounded-xl" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
              {GOALS.map(g => (
                <button key={g}
                  style={goal === g
                    ? { ...btnBase, background: 'var(--brand)', color: '#fff', fontSize: 13, fontWeight: 700 }
                    : { ...btnBase, color: 'var(--text-lo)', fontSize: 13 }}
                  onClick={() => setGoal(g)}>
                  {GL[g]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ══ SUMMARY STRIP ══ */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: `At ₹${GL[goal]} Goal`,  value: `${atGoalCnt} / ${data.length}`, sub: atGoalCnt === data.length ? '🎯 All reached!' : `${data.length - atGoalCnt} stocks to go`, col: pColorBright(atGoalCnt === data.length ? 100 : (atGoalCnt / data.length) * 100) },
            { label: 'Avg Progress',           value: `${avgPct.toFixed(1)}%`,          sub: `toward ₹${GL[goal]}`,                                                                        col: pColorBright(avgPct) },
            { label: 'Total Remaining',        value: fmtV(totalNeed),                  sub: `to bring all to ₹${GL[goal]}`,                                                               col: '#f87171' },
            { label: 'Closest to ₹50k',       value: closestStk ? fmtV(closestStk.nxt) : '—', sub: closestStk ? `${closestStk.name} · ${fmtV(closestStk.toNxt)} away` : 'All at goal',  col: '#a78bfa' },
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
          const top = [...data].sort((a, b) => b.signal.score - a.signal.score).slice(0, 3);
          return (
            <div className="rounded-xl p-4 flex flex-wrap items-center justify-between gap-4"
              style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
              <div>
                <p className="font-bold text-hi text-sm mb-1">Buying Opportunity Signals</p>
                <p className="text-lo" style={{ fontSize: 11 }}>Algo-scored on XIRR · CAGR · P&L · hold period · goal gap · Not financial advice</p>
              </div>
              <div className="flex flex-wrap gap-3">
                {[
                  { emoji: '🚀', label: 'Strong Buy', count: sb, color: '#4ade80' },
                  { emoji: '📈', label: 'Buy',         count: b,  color: '#38bdf8' },
                  { emoji: '👁',  label: 'Watch',       count: w,  color: '#fbbf24' },
                  { emoji: '⚠️', label: 'Caution',     count: c,  color: '#f87171' },
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
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                      color: d.signal.color, background: d.signal.bg, border: `1px solid ${d.signal.border}`,
                    }}>
                      {d.signal.emoji} {d.fullName.slice(0, 14)} <span style={{ opacity: 0.6, fontSize: 10 }}>({d.signal.score})</span>
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
                {[['#4ade80','≥ 75%'],['#38bdf8','50–75%'],['#fbbf24','25–50%'],['#f87171','< 25%']].map(([c,l]) => (
                  <span key={l} className="flex items-center gap-1.5">
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: c, display: 'inline-block' }} />{l}
                  </span>
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
            <div className="grid items-center px-4 py-3 text-xs font-bold uppercase tracking-wide text-lo"
              style={{ gridTemplateColumns: '2fr 1fr 3fr 1fr 80px 1fr 1fr', background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)', gap: 12 }}>
              <div>Stock</div><div>Value</div><div>Milestone Progress</div>
              <div>Done</div><div>XIRR</div><div>Next</div><div>Remaining</div>
            </div>

            {data.map((d, i) => {
              const bc = pColorBright(d.pct);
              return (
                <div key={d.fullName}
                  className="grid items-center px-4 py-3 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  style={{
                    gridTemplateColumns: '2fr 1fr 3fr 1fr 80px 1fr 1fr', gap: 12,
                    background: i % 2 === 0 ? 'transparent' : 'var(--bg-card-alt)',
                    borderBottom: i < data.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>

                  {/* Stock name + signal */}
                  <div className="flex items-center gap-3 min-w-0">
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

                  <div>
                    <p className="font-bold" style={{ color: bc, fontSize: 14 }}>{fmtV(d.value)}</p>
                    <p className="text-lo" style={{ fontSize: 10, marginTop: 1 }}>{d.msDone}/{d.msTotal} MS</p>
                  </div>

                  <div><ProgBar value={d.value} pct={d.pct} /></div>

                  <div className="flex items-center">
                    <div className="font-bold" style={{ color: bc, fontSize: 14 }}>{d.pct.toFixed(0)}%</div>
                  </div>

                  <div>
                    {d.xirr != null
                      ? <>
                          <p className="font-bold" style={{ fontSize: 13, color: d.xirr >= 20 ? '#4ade80' : d.xirr >= 10 ? '#34d399' : d.xirr >= 0 ? '#fbbf24' : '#f87171' }}>
                            {d.xirr >= 0 ? '+' : ''}{d.xirr.toFixed(1)}%
                          </p>
                          <p className="text-lo" style={{ fontSize: 10, marginTop: 1 }}>XIRR p.a.</p>
                        </>
                      : <p className="text-lo" style={{ fontSize: 12 }}>—</p>
                    }
                  </div>

                  <div>
                    {d.atGoal
                      ? <span className="font-bold text-xs px-2 py-1 rounded-full" style={{ background: pBadgeBg(100), color: '#4ade80', border: '1px solid rgba(74,222,128,.3)' }}>🎯 Goal</span>
                      : <>
                          <p className="font-semibold text-hi" style={{ fontSize: 13 }}>{fmtV(d.nxt)}</p>
                          <p className="text-lo" style={{ fontSize: 10, marginTop: 1 }}>{fmtV(d.toNxt)} away</p>
                        </>
                    }
                  </div>

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
