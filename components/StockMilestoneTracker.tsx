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
   Scores each holding 0-100 across 5 dimensions.
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
   MILESTONE PLANNER — Top-3 stock selector with allocation engine
══════════════════════════════════════════════════════════════════════════════*/

interface PortfolioPlanItem {
  stockName: string; sector: string;
  currentValue: number; alloc: number; projectedValue: number;
  currentPct: number; projectedPct: number;
  gap: number; remainingGap: number; reachesGoal: boolean;
  allocPct: number; signal: BuySignal; xirr: number | null;
}

/* Rank metadata: gold / silver / bronze */
const RANK_META = [
  {
    strip:  'linear-gradient(90deg,#F59E0B,#FCD34D,#F59E0B)',
    badge:  'linear-gradient(135deg,#F59E0B,#D97706)',
    glow:   'rgba(245,158,11,0.22)',
    border: 'rgba(245,158,11,0.38)',
    bg:     'rgba(245,158,11,0.07)',
    text:   '#F59E0B',
  },
  {
    strip:  'linear-gradient(90deg,#94A3B8,#CBD5E1,#94A3B8)',
    badge:  'linear-gradient(135deg,#94A3B8,#64748B)',
    glow:   'rgba(148,163,184,0.22)',
    border: 'rgba(148,163,184,0.38)',
    bg:     'rgba(148,163,184,0.07)',
    text:   '#94A3B8',
  },
  {
    strip:  'linear-gradient(90deg,#CD7F32,#E8A96A,#CD7F32)',
    badge:  'linear-gradient(135deg,#CD7F32,#92400E)',
    glow:   'rgba(205,127,50,0.22)',
    border: 'rgba(205,127,50,0.38)',
    bg:     'rgba(205,127,50,0.07)',
    text:   '#CD7F32',
  },
] as const;

function buildPortfolioPlan(
  holdings: Holding[], milestoneGoal: number, investAmount: number, topN = Infinity,
): { items: PortfolioPlanItem[]; unallocated: number } {
  const eligible = holdings.filter(h => (h.marketValue ?? 0) > 0 && (h.marketValue ?? 0) < milestoneGoal);
  if (!eligible.length || investAmount <= 0 || milestoneGoal <= 0) return { items: [], unallocated: investAmount };

  let scored = eligible.map(h => {
    const value = h.marketValue ?? 0;
    const pct   = Math.min(100, (value / milestoneGoal) * 100);
    const sig   = buySignal(h, pct);
    const gap   = milestoneGoal - value;
    const score = (sig.score / 100) * 0.6 + (value / milestoneGoal) * 0.4;
    return { h, value, pct, sig, gap, score, alloc: 0 };
  });

  /* Sort by composite score, then keep top N */
  scored.sort((a, b) => b.score - a.score);
  if (isFinite(topN)) scored = scored.slice(0, topN);

  /* Iterative allocation: proportional → cap at gap → redistribute */
  let budget = investAmount;
  for (let iter = 0; iter < 6 && budget > 100; iter++) {
    const uncapped   = scored.filter(it => it.alloc < it.gap - 100);
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

  const result: PortfolioPlanItem[] = scored.map(it => {
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
  });

  const totalRounded = result.reduce((s, it) => s + it.alloc, 0);
  return { items: result, unallocated: Math.max(0, investAmount - totalRounded) };
}

/* ─── Milestone progress bar ─────────────────────────────────────────────── */
function MilestoneBar({
  value, goal, color, height = 6,
}: { value: number; goal: number; color: string; height?: number }) {
  const pct = Math.min(100, (value / goal) * 100);
  return (
    <div className="relative rounded-full overflow-hidden"
      style={{ height, background: 'rgba(128,128,128,0.12)' }}>
      <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: `linear-gradient(90deg,${color}55,${color})` }} />
    </div>
  );
}

/* ─── Score ring ─────────────────────────────────────────────────────────── */
function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 14, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <svg width={36} height={36} className="shrink-0">
      <circle cx={18} cy={18} r={r} fill="none" stroke="rgba(128,128,128,0.15)" strokeWidth={3} />
      <circle cx={18} cy={18} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 18 18)" style={{ transition: 'stroke-dasharray .6s ease' }} />
      <text x={18} y={22} textAnchor="middle" fontSize={9} fontWeight={800} fill={color}>{score}</text>
    </svg>
  );
}

/* ─── Top-3 Investment Planner ───────────────────────────────────────────── */
function AIInvestmentPlanner({
  portfolioValue, holdings, milestoneGoal,
}: {
  portfolioValue: number; holdings: Holding[]; milestoneGoal: number;
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

  const PRESETS = [25_000, 50_000, 1_00_000, 2_00_000, 5_00_000];

  function generate() {
    if (!canGenerate) return;
    setGenerating(true);
    setTimeout(() => {
      setPlan(buildPortfolioPlan(holdings, milestoneGoal, investAmount, 3));
      setGenerated(true);
      setGenerating(false);
    }, 650);
  }

  const topItems   = plan?.items ?? [];
  const reachCount = topItems.filter(i => i.reachesGoal).length;
  const totalAlloc = topItems.reduce((s, i) => s + i.alloc, 0);

  return (
    <div className="rounded-3xl overflow-hidden"
      style={{ border: '1px solid var(--border)', background: 'var(--bg-card-alt)' }}>

      {/* ══ HERO HEADER ══ */}
      <div className="relative overflow-hidden px-6 pt-6 pb-5"
        style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.13),rgba(139,92,246,0.07),rgba(52,211,153,0.06))' }}>
        {/* decorative blobs */}
        <div className="absolute -top-14 -right-14 w-52 h-52 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle,rgba(129,140,248,0.16) 0%,transparent 70%)' }} />
        <div className="absolute -bottom-10 left-20 w-40 h-40 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle,rgba(52,211,153,0.1) 0%,transparent 70%)' }} />

        <div className="relative flex items-start gap-4">
          {/* Icon */}
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
            style={{
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              boxShadow: '0 8px 24px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}>
            🏆
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <h3 className="font-black text-xl" style={{ color: 'var(--text-hi)', letterSpacing: '-0.025em' }}>
                Top 3 Picks
              </h3>
              <span className="text-[10px] font-black px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(99,102,241,0.18)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }}>
                Goal {fmtI(milestoneGoal)} / stock
              </span>
              {atGoalCount > 0 && (
                <span className="text-[10px] font-black px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                  🎯 {atGoalCount} at goal
                </span>
              )}
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)', maxWidth: 500 }}>
              Tell me your budget — I'll score all {eligible.length} eligible holdings and surface the best 3 to top-up toward the {fmtI(milestoneGoal)} milestone
            </p>
          </div>
        </div>

        {/* Stats strip */}
        <div className="relative flex flex-wrap gap-6 mt-5 pt-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          {[
            { label: 'Stocks Below Goal', val: String(eligible.length), color: '#f87171' },
            { label: 'Total Gap',          val: fmtI(totalNeeded),       color: '#fbbf24' },
            { label: 'Portfolio Value',    val: fmtI(portfolioValue),    color: '#818cf8' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
              <span className="text-xs font-black" style={{ color: s.color }}>{s.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══ INPUT SECTION ══ */}
      <div className="px-6 py-6 space-y-4" style={{ borderTop: '1px solid var(--border)' }}>

        {/* Amount card */}
        <div className="rounded-2xl p-5 space-y-4"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            💰 How much do you want to invest?
          </p>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black" style={{ color: 'var(--text-lo)' }}>₹</span>
            <input
              type="text" inputMode="numeric" placeholder="0"
              value={investRaw}
              onChange={e => { setInvestRaw(e.target.value); setGenerated(false); }}
              className="flex-1 bg-transparent font-black outline-none"
              style={{
                color: investAmount > 0 ? '#818cf8' : 'var(--text-lo)',
                fontSize: 42, lineHeight: 1, minWidth: 0,
                letterSpacing: '-0.03em',
              }}
            />
          </div>

          {investAmount > 0 && (
            <p className="text-xs font-bold -mt-2" style={{ color: 'var(--text-muted)' }}>{fmtI(investAmount)}</p>
          )}

          {/* Preset chips */}
          <div className="flex flex-wrap gap-2 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            {PRESETS.map(v => {
              const active = investAmount === v;
              return (
                <button key={v}
                  onClick={() => { setInvestRaw(v.toLocaleString('en-IN')); setGenerated(false); }}
                  className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all duration-150"
                  style={{
                    background: active ? 'rgba(99,102,241,0.2)' : 'var(--bg-card-alt)',
                    border: `1px solid ${active ? 'rgba(99,102,241,0.55)' : 'var(--border)'}`,
                    color: active ? '#818cf8' : 'var(--text-lo)',
                    transform: active ? 'scale(1.05)' : 'scale(1)',
                    boxShadow: active ? '0 2px 8px rgba(99,102,241,0.2)' : 'none',
                  }}>
                  {fmtI(v)}
                </button>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={generate}
          disabled={!canGenerate || generating}
          className="w-full py-4 rounded-2xl font-black flex items-center justify-center gap-3 transition-all duration-200"
          style={{
            fontSize: 15,
            background: canGenerate
              ? 'linear-gradient(135deg,#6366f1 0%,#818cf8 55%,#a78bfa 100%)'
              : 'var(--bg-card)',
            color:  canGenerate ? '#fff' : 'var(--text-muted)',
            border: canGenerate ? 'none' : '1px solid var(--border)',
            boxShadow: canGenerate
              ? '0 6px 28px rgba(99,102,241,0.45), inset 0 1px 0 rgba(255,255,255,0.15)'
              : 'none',
            opacity: generating ? 0.75 : 1,
          }}>
          {generating ? (
            <>
              <div className="w-5 h-5 border-2 border-white/35 border-t-white rounded-full animate-spin" />
              Scoring your portfolio…
            </>
          ) : eligible.length === 0 ? (
            <>🏆 All stocks already at {fmtI(milestoneGoal)}!</>
          ) : !canGenerate ? (
            <>Enter an amount to find your top 3</>
          ) : (
            <>
              <span style={{ fontSize: 20 }}>✨</span>
              Find My Top 3 Picks
              <span className="text-sm px-2.5 py-1 rounded-full font-black"
                style={{ background: 'rgba(255,255,255,0.18)' }}>
                {eligible.length} stocks
              </span>
            </>
          )}
        </button>
      </div>

      {/* ══ RESULTS ══ */}
      {generated && plan && topItems.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)' }}>

          {/* Results header */}
          <div className="px-6 pt-6 pb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-black" style={{ color: 'var(--text-hi)', fontSize: 17, letterSpacing: '-0.02em' }}>
                🏆 Your Top 3 Picks
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Ranked by signal score · {fmtI(totalAlloc)} allocated across 3 stocks
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {reachCount > 0 && (
                <span className="text-[11px] font-black px-3 py-1.5 rounded-full"
                  style={{ background: 'rgba(52,211,153,0.14)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                  🎯 {reachCount} hit{reachCount > 1 ? 's' : ''} milestone
                </span>
              )}
              {(plan.unallocated ?? 0) > 0 && (
                <span className="text-[11px] font-black px-3 py-1.5 rounded-full"
                  style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }}>
                  {fmtI(plan.unallocated)} leftover
                </span>
              )}
            </div>
          </div>

          {/* ── 3 Ranked Cards ── */}
          <div className="px-6 pb-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {topItems.map((item, idx) => {
              const rk = RANK_META[Math.min(idx, 2)];
              const sc = item.signal.color;

              return (
                <div key={item.stockName + idx}
                  className="rounded-2xl overflow-hidden flex flex-col"
                  style={{
                    background: 'var(--bg-card)',
                    border: `1px solid ${rk.border}`,
                    boxShadow: `0 6px 24px ${rk.glow}`,
                  }}>

                  {/* Gradient top strip */}
                  <div style={{ height: 4, background: rk.strip }} />

                  <div className="p-4 flex flex-col gap-3.5 flex-1">

                    {/* Rank badge + name + signal */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Metallic rank badge */}
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black shrink-0"
                          style={{
                            background: rk.badge,
                            boxShadow: `0 4px 14px ${rk.glow}`,
                            color: '#fff',
                            fontSize: 16,
                            letterSpacing: '-0.02em',
                          }}>
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="font-black leading-snug"
                            style={{ color: 'var(--text-hi)', fontSize: 13 }}>
                            {item.stockName.length > 20
                              ? item.stockName.slice(0, 20) + '…'
                              : item.stockName}
                          </p>
                          {item.sector && (
                            <p className="text-[10px] truncate mt-0.5"
                              style={{ color: 'var(--text-muted)' }}>{item.sector}</p>
                          )}
                        </div>
                      </div>
                      {/* Signal chip */}
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap"
                        style={{ background: item.signal.bg, color: sc, border: `1px solid ${item.signal.border}` }}>
                        {item.signal.emoji} {item.signal.label}
                      </span>
                    </div>

                    {/* Big invest amount */}
                    <div className="rounded-2xl py-4 px-5 text-center"
                      style={{ background: rk.bg, border: `1px solid ${rk.border}` }}>
                      <p className="text-[9px] font-black uppercase tracking-widest mb-1.5"
                        style={{ color: 'var(--text-muted)' }}>Suggested Investment</p>
                      <p className="font-black" style={{ color: 'var(--text-hi)', fontSize: 28, lineHeight: 1, letterSpacing: '-0.03em' }}>
                        {fmtI(item.alloc)}
                      </p>
                      <p className="text-[10px] mt-1.5 font-semibold" style={{ color: 'var(--text-muted)' }}>
                        {item.allocPct.toFixed(0)}% of your {fmtI(investAmount)} budget
                      </p>
                    </div>

                    {/* Before → After progress */}
                    <div className="rounded-xl p-3.5 space-y-3"
                      style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>

                      {/* Now */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase tracking-wider"
                            style={{ color: 'var(--text-muted)' }}>Now</span>
                          <span className="text-[11px] font-black" style={{ color: 'var(--text-lo)' }}>
                            {fmtI(item.currentValue)}&nbsp;
                            <span style={{ opacity: 0.45 }}>·</span>&nbsp;
                            {item.currentPct.toFixed(0)}%
                          </span>
                        </div>
                        <MilestoneBar value={item.currentValue} goal={milestoneGoal} color={sc} height={6} />
                      </div>

                      {/* Divider with amount badge */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                        <span className="text-[10px] font-black px-2.5 py-1 rounded-lg whitespace-nowrap"
                          style={{ background: `${sc}18`, color: sc, border: `1px solid ${sc}30` }}>
                          +&nbsp;{fmtI(item.alloc)}
                        </span>
                        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                      </div>

                      {/* After */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase tracking-wider"
                            style={{ color: item.reachesGoal ? '#34d399' : sc }}>After</span>
                          <span className="text-[11px] font-black"
                            style={{ color: item.reachesGoal ? '#34d399' : sc }}>
                            {fmtI(item.projectedValue)}&nbsp;
                            <span style={{ opacity: 0.45 }}>·</span>&nbsp;
                            {item.projectedPct.toFixed(0)}%
                            {item.reachesGoal ? ' 🎯' : ''}
                          </span>
                        </div>
                        <MilestoneBar
                          value={item.projectedValue} goal={milestoneGoal}
                          color={item.reachesGoal ? '#34d399' : sc} height={6} />
                      </div>
                    </div>

                    {/* Score ring + status pill + XIRR */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <ScoreRing score={item.signal.score} color={sc} />
                      <span className="text-[10px] font-black px-2.5 py-1 rounded-full"
                        style={{
                          background: item.reachesGoal ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.1)',
                          color:      item.reachesGoal ? '#34d399' : '#f87171',
                          border: `1px solid ${item.reachesGoal ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.2)'}`,
                        }}>
                        {item.reachesGoal ? '✓ Hits milestone' : `${fmtI(item.remainingGap)} needed`}
                      </span>
                      {item.xirr != null && (
                        <span className="text-[9px] font-bold px-2 py-1 rounded-full"
                          style={{
                            background: item.xirr >= 0 ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                            color:      item.xirr >= 0 ? '#34d399' : '#f87171',
                            border: `1px solid ${item.xirr >= 0 ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
                          }}>
                          XIRR {item.xirr >= 0 ? '+' : ''}{item.xirr.toFixed(1)}%
                        </span>
                      )}
                    </div>

                    {/* Signal reason */}
                    {item.signal.reason && (
                      <p className="text-[9px] leading-relaxed -mt-1" style={{ color: 'var(--text-muted)' }}>
                        {item.signal.emoji} {item.signal.reason}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Summary bar ── */}
          <div className="mx-6 mb-5 rounded-2xl overflow-hidden"
            style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            <div className="grid grid-cols-3 divide-x" style={{ borderColor: 'var(--border)' }}>
              {[
                { icon: '💰', label: 'Total Invested',   val: fmtI(totalAlloc),                                                             color: '#818cf8' },
                { icon: '🎯', label: 'Hits Milestone',   val: `${reachCount} / ${topItems.length}`,                                         color: '#34d399' },
                { icon: '💼', label: 'Unallocated',      val: (plan.unallocated ?? 0) > 0 ? fmtI(plan.unallocated) : 'Fully used',          color: (plan.unallocated ?? 0) > 0 ? '#fbbf24' : '#34d399' },
              ].map((c, i) => (
                <div key={c.label} className="py-4 px-3 text-center"
                  style={{ borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
                  <p className="text-base mb-1.5">{c.icon}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{c.label}</p>
                  <p className="font-black text-sm" style={{ color: c.color }}>{c.val}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <div className="mx-6 mb-6 rounded-xl px-4 py-3 flex items-start gap-2.5"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            <span className="text-sm shrink-0 mt-0.5">⚠️</span>
            <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text-lo)' }}>Not financial advice.</strong>{' '}
              Rankings are algorithm-scored on XIRR, CAGR, P&L position, holding period and milestone proximity.
              Consult a SEBI-registered financial advisor before investing.
            </p>
          </div>
        </div>
      )}

      {/* All-at-goal empty state */}
      {eligible.length === 0 && holdings.length > 0 && (
        <div className="px-6 py-14 text-center" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-5xl mb-4">🏆</p>
          <p className="font-black text-base mb-2" style={{ color: '#34d399' }}>All Stocks at Goal!</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Every holding has crossed the {fmtI(milestoneGoal)} milestone. Try a higher goal to keep growing.
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
            const lp      = (m / goal) * 100;
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

      {/* ══ TOP-3 MILESTONE PLANNER ══ */}
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
