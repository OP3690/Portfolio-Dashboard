'use client';

import { useState, useEffect, useCallback } from 'react';

/* ─── Types ─────────────────────────────────────────────────── */
type PredictionStatus = 'Active' | 'Achieved' | 'OverAchieved' | 'MissedSlightly' | 'Missed' | 'Expired';

interface IndicatorSnapshot {
  rsi: number;
  macdSignal: number;
  bbPosition: number;
  volumeRatio: number;
  momentum10d: number;
  maCrossover: number;
  adx: number;
}

interface Prediction {
  _id: string;
  stockSymbol: string;
  stockName: string;
  exchange: string;
  firstRecommendedDate: string;
  latestRecommendedDate: string;
  recommendationCount: number;
  entryPrice: number;
  targetReturn: number;
  confidenceScore: number;
  status: PredictionStatus;
  bestReturn: number;
  finalReturn?: number;
  evaluationDate?: string;
  modelVersion: string;
  indicatorSnapshot: IndicatorSnapshot;
  expiresAt: string;
}

interface Stats {
  totalEvaluated: number;
  successCount: number;
  successRate: number;
  avgReturn: number;
}

interface PredictionsResponse {
  success: boolean;
  predictions: Prediction[];
  total: number;
  stats: Stats;
  modelVersion: string;
  modelWeights: Record<string, number> | null;
}

/* ─── Helpers ───────────────────────────────────────────────── */
function statusColor(s: PredictionStatus): string {
  switch (s) {
    case 'Active':         return 'var(--info)';
    case 'Achieved':       return 'var(--gain)';
    case 'OverAchieved':   return '#a78bfa';
    case 'MissedSlightly': return '#f59e0b';
    case 'Missed':         return 'var(--loss)';
    case 'Expired':        return 'var(--text-muted)';
  }
}
function statusBg(s: PredictionStatus): string {
  switch (s) {
    case 'Active':         return 'var(--info-bg)';
    case 'Achieved':       return 'var(--gain-bg)';
    case 'OverAchieved':   return 'rgba(167,139,250,0.12)';
    case 'MissedSlightly': return 'rgba(245,158,11,0.10)';
    case 'Missed':         return 'var(--loss-bg)';
    case 'Expired':        return 'var(--bg-raised)';
  }
}
function statusLabel(s: PredictionStatus): string {
  switch (s) {
    case 'OverAchieved':   return '⚡ Over-achieved';
    case 'Achieved':       return '✓ Achieved';
    case 'MissedSlightly': return '~ Slight miss';
    case 'Missed':         return '✗ Missed';
    case 'Expired':        return '⏱ Expired';
    case 'Active':         return '● Active';
  }
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtPrice(n: number) {
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
}
function fmtPct(n: number, sign = true) {
  return `${sign && n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

/* ─── Indicator bar ─────────────────────────────────────────── */
function IndicatorBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-right text-[10px] font-medium shrink-0" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg,var(--brand),#818cf8)' }}
        />
      </div>
      <span className="w-10 text-[10px] font-semibold text-right shrink-0" style={{ color: 'var(--text-lo)' }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

/* ─── Prediction card ───────────────────────────────────────── */
function PredictionCard({ p, rank }: { p: Prediction; rank?: number }) {
  const [expanded, setExpanded] = useState(false);
  const returnVal = p.finalReturn ?? p.bestReturn;
  const returnColor = returnVal >= 0 ? 'var(--gain)' : 'var(--loss)';
  const isActive = p.status === 'Active';

  return (
    <div
      className="card overflow-hidden transition-all duration-300"
      style={{ border: isActive ? '1px solid var(--brand-glow)' : '1px solid var(--border-md)' }}
    >
      {/* Top bar */}
      <div
        className="h-1"
        style={{
          background: isActive
            ? 'linear-gradient(90deg,var(--brand),#818cf8)'
            : `linear-gradient(90deg,${statusColor(p.status)},${statusColor(p.status)}44)`,
        }}
      />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            {rank && (
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0"
                style={{
                  background: 'linear-gradient(135deg,var(--brand),#818cf8)',
                  color: '#fff',
                  boxShadow: '0 3px 10px var(--brand-glow)',
                }}
              >
                #{rank}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold" style={{ color: 'var(--text-hi)' }}>
                  {p.stockSymbol}
                </span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: 'var(--bg-raised)', color: 'var(--text-lo)' }}
                >
                  NSE
                </span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{p.stockName}</p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <span
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold"
              style={{ background: statusBg(p.status), color: statusColor(p.status) }}
            >
              {statusLabel(p.status)}
            </span>
            {p.recommendationCount > 1 && (
              <span className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                ×{p.recommendationCount} recommended
              </span>
            )}
          </div>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-raised)' }}>
            <p className="text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Entry Price</p>
            <p className="text-sm font-bold" style={{ color: 'var(--text-hi)' }}>{fmtPrice(p.entryPrice)}</p>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-raised)' }}>
            <p className="text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
              {isActive ? 'Best Return' : 'Final Return'}
            </p>
            <p className="text-sm font-bold" style={{ color: returnColor }}>
              {fmtPct(returnVal)}
            </p>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-raised)' }}>
            <p className="text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Confidence</p>
            <p className="text-sm font-bold" style={{ color: 'var(--brand)' }}>{p.confidenceScore}%</p>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="mb-4">
          <div className="flex justify-between text-[10px] font-semibold mb-1.5">
            <span style={{ color: 'var(--text-muted)' }}>Confidence Score</span>
            <span style={{ color: 'var(--brand)' }}>{p.confidenceScore}/100</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${p.confidenceScore}%`,
                background: p.confidenceScore >= 70
                  ? 'linear-gradient(90deg,var(--gain),#34d399)'
                  : p.confidenceScore >= 50
                  ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
                  : 'linear-gradient(90deg,var(--loss),#f87171)',
              }}
            />
          </div>
        </div>

        {/* Dates */}
        <div className="flex items-center justify-between text-[11px] mb-4">
          <span style={{ color: 'var(--text-muted)' }}>
            First pick: <strong style={{ color: 'var(--text-lo)' }}>{fmtDate(p.firstRecommendedDate)}</strong>
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            Model: <strong style={{ color: 'var(--brand)' }}>{p.modelVersion}</strong>
          </span>
        </div>

        {/* Expand indicators */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all duration-200"
          style={{
            background: expanded ? 'var(--brand-bg)' : 'var(--bg-sunken)',
            color: expanded ? 'var(--brand)' : 'var(--text-lo)',
            border: expanded ? '1px solid var(--brand-glow)' : '1px solid var(--border-sm)',
          }}
        >
          <svg
            className="w-3 h-3 transition-transform duration-200"
            style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          {expanded ? 'Hide indicators' : 'Show indicators'}
        </button>

        {expanded && (
          <div
            className="mt-3 p-3 rounded-xl space-y-2 animate-fadeIn"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}
          >
            <IndicatorBar label="RSI (14)"     value={p.indicatorSnapshot.rsi}         max={100} />
            <IndicatorBar label="MACD Signal"  value={Math.max(0, p.indicatorSnapshot.macdSignal)} max={5} />
            <IndicatorBar label="BB Position"  value={p.indicatorSnapshot.bbPosition * 100}        max={100} />
            <IndicatorBar label="Vol Ratio"    value={p.indicatorSnapshot.volumeRatio}             max={3} />
            <IndicatorBar label="Momentum 10d" value={Math.max(0, p.indicatorSnapshot.momentum10d)} max={15} />
            <IndicatorBar label="MA Crossover" value={Math.max(0, p.indicatorSnapshot.maCrossover)} max={10} />
            <IndicatorBar label="ADX (14)"     value={p.indicatorSnapshot.adx}         max={60} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Stat card ─────────────────────────────────────────────── */
function StatCard({
  label, value, sub, color = 'var(--brand)', icon,
}: { label: string; value: string; sub?: string; color?: string; icon: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `color-mix(in srgb,${color} 12%,transparent)` }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <p className="text-2xl font-black mb-1" style={{ color: 'var(--text-hi)' }}>{value}</p>
      {sub && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  );
}

/* ─── Filter pills ──────────────────────────────────────────── */
const FILTERS: { key: string; label: string }[] = [
  { key: 'all',          label: 'All' },
  { key: 'Active',       label: 'Active' },
  { key: 'Achieved',     label: 'Achieved' },
  { key: 'OverAchieved', label: 'Over-achieved' },
  { key: 'Missed',       label: 'Missed' },
  { key: 'Expired',      label: 'Expired' },
];

/* ─── Main component ─────────────────────────────────────────── */
export default function StockPredictions() {
  const [data,       setData]       = useState<PredictionsResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState('all');
  const [running,    setRunning]    = useState<'predict' | 'track' | 'recalibrate' | null>(null);
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchPredictions = useCallback(async (status = filter) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/ai-predictions?status=${status}&limit=100`);
      const d   = await res.json();
      if (d.success) setData(d);
    } catch (e: any) {
      showToast(e.message, false);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchPredictions(filter); }, [filter]);

  const handleAction = async (action: 'predict' | 'track' | 'recalibrate') => {
    const ep = action === 'predict' ? '/api/ai-predict' : action === 'track' ? '/api/ai-track' : '/api/ai-recalibrate';
    setRunning(action);
    try {
      const res  = await fetch(ep, { method: 'POST' });
      const body = await res.json();
      if (body.success) {
        const msgs: Record<string, string> = {
          predict:     `Prediction run complete — ${body.count ?? 0} stocks selected`,
          track:       `Tracking updated — ${body.updatedCount ?? 0} predictions refreshed`,
          recalibrate: body.message || 'Recalibration complete',
        };
        showToast(msgs[action], true);
        await fetchPredictions(filter);
      } else {
        showToast(body.error || `${action} failed`, false);
      }
    } catch (e: any) {
      showToast(e.message, false);
    } finally {
      setRunning(null);
    }
  };

  const activePredictions   = data?.predictions.filter((p) => p.status === 'Active')  ?? [];
  const allPredictions      = data?.predictions ?? [];

  return (
    <div className="space-y-6 animate-fadeIn">

      {/* ── Toast ── */}
      {toast && (
        <div
          className="fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold shadow-xl animate-fadeIn"
          style={{
            background: toast.ok ? 'var(--gain-bg)' : 'var(--loss-bg)',
            border: `1px solid ${toast.ok ? 'var(--gain-border)' : 'var(--loss-border)'}`,
            color: toast.ok ? 'var(--gain)' : 'var(--loss)',
          }}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {toast.ok
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            }
          </svg>
          {toast.msg}
        </div>
      )}

      {/* ── Hero header ── */}
      <div
        className="rounded-2xl p-6 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg,rgba(91,94,244,0.18) 0%,rgba(129,140,248,0.08) 100%)',
          border: '1px solid var(--brand-glow)',
        }}
      >
        {/* ambient blob */}
        <div
          className="absolute -right-16 -top-16 w-48 h-48 rounded-full blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle,rgba(91,94,244,0.22) 0%,transparent 70%)' }}
        />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg,var(--brand),#818cf8)',
                boxShadow: '0 6px 20px var(--brand-glow)',
              }}
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h1
                className="text-xl font-black"
                style={{
                  background: 'linear-gradient(135deg,var(--brand) 0%,#818cf8 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                AI Stock Predictions
              </h1>
              <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--text-muted)' }}>
                Daily NSE picks · {data?.modelVersion ?? 'v1.0'} ·{' '}
                {activePredictions.length} active prediction{activePredictions.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              label="Run Predictions"
              loading={running === 'predict'}
              disabled={running !== null}
              onClick={() => handleAction('predict')}
              color="var(--brand)"
              glow="var(--brand-glow)"
              icon={
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
            />
            <ActionButton
              label="Update Tracking"
              loading={running === 'track'}
              disabled={running !== null}
              onClick={() => handleAction('track')}
              color="var(--gain)"
              glow="var(--gain-border)"
              icon={
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              }
            />
            <ActionButton
              label="Recalibrate"
              loading={running === 'recalibrate'}
              disabled={running !== null}
              onClick={() => handleAction('recalibrate')}
              color="#a78bfa"
              glow="rgba(167,139,250,0.30)"
              icon={
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            />
          </div>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Picks"
          value={String(activePredictions.length)}
          sub="Currently tracked"
          color="var(--info)"
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
        />
        <StatCard
          label="Success Rate"
          value={data ? `${data.stats.successRate.toFixed(1)}%` : '—'}
          sub={`${data?.stats.successCount ?? 0} / ${data?.stats.totalEvaluated ?? 0} evaluated`}
          color="var(--gain)"
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <StatCard
          label="Avg Return"
          value={data ? fmtPct(data.stats.avgReturn) : '—'}
          sub="On evaluated predictions"
          color={data && data.stats.avgReturn >= 0 ? 'var(--gain)' : 'var(--loss)'}
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <StatCard
          label="Model Version"
          value={data?.modelVersion ?? 'v1.0'}
          sub="Self-recalibrating weights"
          color="#a78bfa"
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>}
        />
      </div>

      {/* ── Active picks ── */}
      {activePredictions.length > 0 && (
        <div>
          <h2
            className="text-sm font-bold mb-3 flex items-center gap-2"
            style={{ color: 'var(--text-hi)' }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: 'var(--info)', boxShadow: '0 0 6px var(--info)' }}
            />
            Today's Active Picks
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activePredictions.map((p, i) => (
              <PredictionCard key={p._id} p={p} rank={i + 1} />
            ))}
          </div>
        </div>
      )}

      {/* ── Filter + History ── */}
      <div>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-hi)' }}>
            Prediction History
          </h2>
          <div
            className="flex items-center gap-1 p-1 rounded-xl overflow-x-auto"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}
          >
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="px-3 py-1.5 rounded-[9px] text-[11px] font-semibold whitespace-nowrap transition-all duration-150"
                style={
                  filter === f.key
                    ? { background: 'var(--brand)', color: '#fff', boxShadow: '0 2px 8px var(--brand-glow)' }
                    : { color: 'var(--text-lo)' }
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card p-5 space-y-3 animate-pulse">
                <div className="skeleton h-4 w-32 rounded" />
                <div className="skeleton h-3 w-48 rounded" />
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((j) => <div key={j} className="skeleton h-12 rounded-xl" />)}
                </div>
                <div className="skeleton h-2 rounded-full" />
              </div>
            ))}
          </div>
        ) : allPredictions.length === 0 ? (
          <div className="card p-12 text-center">
            <div
              className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-glow)' }}
            >
              <svg className="w-7 h-7" style={{ color: 'var(--brand)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="text-base font-bold mb-2" style={{ color: 'var(--text-hi)' }}>No predictions yet</h3>
            <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
              Click <strong>Run Predictions</strong> to analyse all NSE stocks and generate today's top picks.
            </p>
            <button
              onClick={() => handleAction('predict')}
              disabled={running !== null}
              className="btn btn-primary px-6 py-2.5 text-sm font-semibold"
            >
              {running === 'predict' ? 'Running…' : 'Run Predictions'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {allPredictions.map((p) => (
              <PredictionCard key={p._id} p={p} />
            ))}
          </div>
        )}
      </div>

      {/* ── Model weights viz ── */}
      {data?.modelWeights && (
        <div className="card p-5">
          <h2 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-hi)' }}>
            <svg className="w-4 h-4" style={{ color: '#a78bfa' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Active Model Weights — {data.modelVersion}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(data.modelWeights).map(([key, val]) => {
              const pct = (val as number) * 100;
              const labels: Record<string, string> = {
                rsi: 'RSI', macd: 'MACD', bbPosition: 'Bollinger', volumeRatio: 'Volume',
                momentum10d: 'Momentum', maCrossover: 'MA Cross', adx: 'ADX',
              };
              return (
                <div key={key} className="rounded-xl p-3" style={{ background: 'var(--bg-raised)' }}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-lo)' }}>
                      {labels[key] ?? key}
                    </span>
                    <span className="text-xs font-bold" style={{ color: '#a78bfa' }}>
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, pct / 40 * 100)}%`,
                        background: 'linear-gradient(90deg,#a78bfa,#818cf8)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── How it works ── */}
      <div
        className="rounded-2xl p-5"
        style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}
      >
        <h3 className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>
          How it works
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs" style={{ color: 'var(--text-lo)' }}>
          <div className="flex gap-3 items-start">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black text-white"
              style={{ background: 'linear-gradient(135deg,var(--brand),#818cf8)' }}>1</div>
            <p><strong style={{ color: 'var(--text-hi)' }}>Score</strong> — 7 technical indicators (RSI, MACD, Bollinger, Volume, Momentum, MA cross, ADX) are computed from 90 days of OHLCV data.</p>
          </div>
          <div className="flex gap-3 items-start">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black text-white"
              style={{ background: 'linear-gradient(135deg,#818cf8,#a78bfa)' }}>2</div>
            <p><strong style={{ color: 'var(--text-hi)' }}>Filter</strong> — stocks passing RSI 40–75, ADX &gt; 20 and composite score ≥ 0.55 are ranked. Top 3 are picked daily.</p>
          </div>
          <div className="flex gap-3 items-start">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black text-white"
              style={{ background: 'linear-gradient(135deg,#a78bfa,var(--gain))' }}>3</div>
            <p><strong style={{ color: 'var(--text-hi)' }}>Learn</strong> — weights self-adjust based on which indicators correlated with ≥ 5 % returns over 45-day tracking windows.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Action button helper ──────────────────────────────────── */
function ActionButton({
  label, loading, disabled, onClick, color, glow, icon,
}: {
  label: string; loading: boolean; disabled: boolean;
  onClick: () => void; color: string; glow: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-xs font-semibold transition-all duration-200"
      style={{
        background: disabled && !loading ? 'var(--bg-raised)' : `color-mix(in srgb,${color} 14%,transparent)`,
        border: `1px solid ${disabled && !loading ? 'var(--border-md)' : `color-mix(in srgb,${color} 35%,transparent)`}`,
        color: disabled && !loading ? 'var(--text-muted)' : color,
        boxShadow: loading ? `0 0 12px ${glow}` : 'none',
      }}
    >
      {loading
        ? <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
            style={{ borderColor: color, borderTopColor: 'transparent' }} />
        : icon
      }
      {loading ? 'Running…' : label}
    </button>
  );
}
