'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import DailyTrackingTable from './DailyTrackingTable';

/* ─── Types ──────────────────────────────────────────────────────────────── */
type PredictionStatus = 'Active' | 'Achieved' | 'OverAchieved' | 'MissedSlightly' | 'Missed' | 'Expired';
type SortKey = 'stockSymbol' | 'firstRecommendedDate' | 'recommendationCount' |
               'entryPrice' | 'currentPrice' | 'dailyChange' | 'totalReturn' |
               'daysActive' | 'confidenceScore' | 'status';
type SortDir = 'asc' | 'desc';

interface Tracking {
  currentPrice: number;
  dailyChange:  number;
  totalReturn:  number;
  dayNumber:    number;
  lastTracked:  string;
}

interface IndicatorSnapshot {
  rsi: number; macdSignal: number; bbPosition: number;
  volumeRatio: number; momentum10d: number; maCrossover: number; adx: number;
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
  tracking: Tracking | null;
}

interface Stats { totalEvaluated: number; successCount: number; successRate: number; avgReturn: number; }

interface ApiResponse {
  success: boolean;
  predictions: Prediction[];
  total: number;
  stats: Stats;
  modelVersion: string;
  modelWeights: Record<string, number> | null;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function getTradingDays(fromIso: string): number {
  const start = new Date(fromIso);
  const end   = new Date();
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(0, count - 1);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
function fmtPrice(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function fmtPct(n: number, forceSign = true) {
  const sign = forceSign && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}
function pctColor(n: number) { return n > 0 ? 'var(--gain)' : n < 0 ? 'var(--loss)' : 'var(--text-lo)'; }

const STATUS_META: Record<PredictionStatus, { label: string; color: string; bg: string; dot: string }> = {
  Active:         { label: 'Active',         color: '#38bdf8', bg: 'rgba(56,189,248,0.10)',  dot: '#38bdf8' },
  Achieved:       { label: 'Achieved',       color: '#34d399', bg: 'rgba(52,211,153,0.10)',  dot: '#34d399' },
  OverAchieved:   { label: 'Over-achieved',  color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', dot: '#a78bfa' },
  MissedSlightly: { label: 'Slight miss',    color: '#fbbf24', bg: 'rgba(251,191,36,0.10)',  dot: '#fbbf24' },
  Missed:         { label: 'Missed',         color: '#f87171', bg: 'rgba(248,113,113,0.10)', dot: '#f87171' },
  Expired:        { label: 'Expired',        color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', dot: '#94a3b8' },
};

const STATUS_ORDER: Record<PredictionStatus, number> = {
  Active: 0, Achieved: 1, OverAchieved: 2, MissedSlightly: 3, Missed: 4, Expired: 5,
};

/* ─── Status Badge ───────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: PredictionStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap"
      style={{ background: m.bg, color: m.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: m.dot }} />
      {m.label}
    </span>
  );
}

/* ─── Sort icon ──────────────────────────────────────────────────────────── */
function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
      style={{ opacity: active ? 1 : 0.35, color: active ? 'var(--brand)' : 'currentColor' }}>
      {active && dir === 'asc'
        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
      }
    </svg>
  );
}

/* ─── Th helper ──────────────────────────────────────────────────────────── */
function Th({
  label, sortKey, current, dir, onSort, right = false, hint,
}: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void; right?: boolean; hint?: string;
}) {
  const active = current === sortKey;
  return (
    <th
      title={hint}
      onClick={() => onSort(sortKey)}
      className="px-3 py-3 text-left cursor-pointer select-none whitespace-nowrap group"
      style={{
        color: active ? 'var(--brand)' : 'var(--text-muted)',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        textAlign: right ? 'right' : 'left',
        background: 'var(--bg-raised)',
        borderBottom: '1px solid var(--border-md)',
        position: 'sticky',
        top: 0,
        zIndex: 2,
      }}
    >
      <span className={`flex items-center gap-1.5 ${right ? 'justify-end' : ''}`}>
        {label}
        <SortIcon active={active} dir={dir} />
      </span>
    </th>
  );
}

/* ─── Active pick highlight card ─────────────────────────────────────────── */
function ActiveCard({ p, rank }: { p: Prediction; rank: number }) {
  const tracking = p.tracking;
  const ret = tracking?.totalReturn ?? p.bestReturn;
  return (
    <div
      className="rounded-2xl p-4 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg,rgba(91,94,244,0.10) 0%,rgba(129,140,248,0.05) 100%)',
        border: '1px solid var(--brand-glow)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl"
        style={{ background: 'linear-gradient(90deg,var(--brand),#818cf8)' }}
      />
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black text-white shrink-0"
            style={{ background: 'linear-gradient(135deg,var(--brand),#818cf8)' }}
          >
            #{rank}
          </div>
          <div>
            <p className="text-sm font-black" style={{ color: 'var(--text-hi)' }}>{p.stockSymbol}</p>
            <p className="text-[10px] mt-0.5 font-medium" style={{ color: 'var(--text-muted)' }}>{p.stockName}</p>
          </div>
        </div>
        <div
          className="text-[11px] font-bold px-2 py-1 rounded-lg"
          style={{ background: 'rgba(56,189,248,0.10)', color: '#38bdf8' }}
        >
          {p.confidenceScore}% conf
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl p-2 text-center" style={{ background: 'var(--bg-raised)' }}>
          <p className="text-[9px] font-semibold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Entry</p>
          <p className="text-xs font-bold" style={{ color: 'var(--text-hi)' }}>{fmtPrice(p.entryPrice)}</p>
        </div>
        <div className="rounded-xl p-2 text-center" style={{ background: 'var(--bg-raised)' }}>
          <p className="text-[9px] font-semibold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>
            {tracking ? 'Current' : 'Best'}
          </p>
          <p className="text-xs font-bold" style={{ color: 'var(--text-hi)' }}>
            {tracking ? fmtPrice(tracking.currentPrice) : '—'}
          </p>
        </div>
        <div className="rounded-xl p-2 text-center" style={{ background: 'var(--bg-raised)' }}>
          <p className="text-[9px] font-semibold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Return</p>
          <p className="text-xs font-bold" style={{ color: pctColor(ret) }}>{fmtPct(ret)}</p>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-[10px] mb-1">
          <span style={{ color: 'var(--text-muted)' }}>Confidence</span>
          <span style={{ color: 'var(--brand)' }}>{p.confidenceScore}/100</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${p.confidenceScore}%`,
              background: p.confidenceScore >= 70
                ? 'linear-gradient(90deg,#34d399,var(--gain))'
                : p.confidenceScore >= 50
                ? 'linear-gradient(90deg,#fbbf24,#f59e0b)'
                : 'linear-gradient(90deg,#f87171,var(--loss))',
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Stat Card ──────────────────────────────────────────────────────────── */
function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color: string; icon: React.ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `color-mix(in srgb,${color} 12%,transparent)`, color }}>
          {icon}
        </div>
      </div>
      <p className="text-xl font-black" style={{ color: 'var(--text-hi)' }}>{value}</p>
      {sub && <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  );
}

/* ─── Action Button ──────────────────────────────────────────────────────── */
function ActionBtn({ label, loading, disabled, onClick, color, icon }: {
  label: string; loading: boolean; disabled: boolean;
  onClick: () => void; color: string; icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      className="flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-xs font-semibold transition-all duration-200"
      style={{
        background:  disabled && !loading ? 'var(--bg-raised)' : `color-mix(in srgb,${color} 14%,transparent)`,
        border:      `1px solid ${disabled && !loading ? 'var(--border-md)' : `color-mix(in srgb,${color} 30%,transparent)`}`,
        color:       disabled && !loading ? 'var(--text-muted)' : color,
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

/* ─── Filter pills ───────────────────────────────────────────────────────── */
const FILTERS = [
  { key: 'all',          label: 'All'           },
  { key: 'Active',       label: 'Active'        },
  { key: 'Achieved',     label: 'Achieved'      },
  { key: 'OverAchieved', label: 'Over-achieved' },
  { key: 'MissedSlightly', label: 'Slight miss' },
  { key: 'Missed',       label: 'Missed'        },
  { key: 'Expired',      label: 'Expired'       },
];

/* ─── Indicator mini bar ─────────────────────────────────────────────────── */
function IndicatorMiniBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 text-right text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--bg-sunken)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,var(--brand),#818cf8)' }} />
      </div>
      <span className="w-10 text-[10px] font-semibold text-right shrink-0" style={{ color: 'var(--text-lo)' }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════════*/
export default function StockPredictions() {
  const [data,        setData]        = useState<ApiResponse | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState('all');
  const [running,     setRunning]     = useState<'predict' | 'track' | 'recalibrate' | null>(null);
  const [toast,       setToast]       = useState<{ msg: string; ok: boolean } | null>(null);
  const [sortKey,     setSortKey]     = useState<SortKey>('firstRecommendedDate');
  const [sortDir,     setSortDir]     = useState<SortDir>('desc');
  const [expandedId,  setExpandedId]  = useState<string | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4500);
  };

  const fetchPredictions = useCallback(async (status = filter) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/ai-predictions?status=${status}&limit=200`);
      const d   = await res.json();
      if (d.success) setData(d);
    } catch (e: any) { showToast(e.message, false); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchPredictions(filter); }, [filter]);

  const handleAction = async (action: 'predict' | 'track' | 'recalibrate') => {
    const ep = action === 'predict' ? '/api/ai-predict' : action === 'track' ? '/api/ai-track' : '/api/ai-recalibrate';
    setRunning(action);
    try {
      const res  = await fetch(ep, { method: 'POST' });
      const body = await res.json();
      if (body.success) {
        // After running predictions, auto-run tracking so today's prices appear immediately
        if (action === 'predict') {
          await fetch('/api/ai-track', { method: 'POST' });
        }
        const msgs: Record<string, string> = {
          predict:     `Prediction run complete — ${body.count ?? 0} stocks selected · tracking updated`,
          track:       `Tracking updated — ${body.updatedCount ?? 0} predictions refreshed`,
          recalibrate: body.message || 'Recalibration complete',
        };
        showToast(msgs[action], true);
        await fetchPredictions(filter);
      } else showToast(body.error || `${action} failed`, false);
    } catch (e: any) { showToast(e.message, false); }
    finally { setRunning(null); }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  /* ── Sorted predictions ────────────────────────────────────────────────── */
  const sorted = useMemo(() => {
    const rows = [...(data?.predictions ?? [])];
    rows.sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case 'stockSymbol':           av = a.stockSymbol;          bv = b.stockSymbol; break;
        case 'firstRecommendedDate':  av = new Date(a.firstRecommendedDate).getTime(); bv = new Date(b.firstRecommendedDate).getTime(); break;
        case 'recommendationCount':   av = a.recommendationCount;  bv = b.recommendationCount; break;
        case 'entryPrice':            av = a.entryPrice;           bv = b.entryPrice; break;
        case 'currentPrice':          av = a.tracking?.currentPrice ?? 0; bv = b.tracking?.currentPrice ?? 0; break;
        case 'dailyChange':           av = a.tracking?.dailyChange  ?? 0; bv = b.tracking?.dailyChange  ?? 0; break;
        case 'totalReturn':           av = a.tracking?.totalReturn  ?? a.bestReturn; bv = b.tracking?.totalReturn ?? b.bestReturn; break;
        case 'daysActive':            av = getTradingDays(a.firstRecommendedDate); bv = getTradingDays(b.firstRecommendedDate); break;
        case 'confidenceScore':       av = a.confidenceScore;      bv = b.confidenceScore; break;
        case 'status':                av = STATUS_ORDER[a.status]; bv = STATUS_ORDER[b.status]; break;
        default: av = 0; bv = 0;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });
    return rows;
  }, [data?.predictions, sortKey, sortDir]);

  const activePredictions = data?.predictions.filter(p => p.status === 'Active') ?? [];

  /* ── Render ──────────────────────────────────────────────────────────────*/
  return (
    <div className="space-y-5 animate-fadeIn">

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold shadow-2xl animate-fadeIn"
          style={{
            background: toast.ok ? 'var(--gain-bg)' : 'var(--loss-bg)',
            border: `1px solid ${toast.ok ? 'var(--gain-border)' : 'var(--loss-border)'}`,
            color:  toast.ok ? 'var(--gain)' : 'var(--loss)',
          }}>
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {toast.ok
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            }
          </svg>
          {toast.msg}
        </div>
      )}

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-5 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg,rgba(91,94,244,0.15) 0%,rgba(129,140,248,0.06) 100%)',
          border: '1px solid var(--brand-glow)',
        }}>
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle,rgba(91,94,244,0.20) 0%,transparent 70%)' }} />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg,var(--brand),#818cf8)', boxShadow: '0 4px 16px var(--brand-glow)' }}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-black" style={{
                background: 'linear-gradient(135deg,var(--brand) 0%,#818cf8 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                AI Stock Predictions
              </h1>
              <p className="text-[11px] mt-0.5 font-medium" style={{ color: 'var(--text-muted)' }}>
                Daily NSE picks · Model {data?.modelVersion ?? 'v1.0'} ·{' '}
                {activePredictions.length} active · target +5% in 3 trading days
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ActionBtn label="Run Predictions" loading={running === 'predict'} disabled={running !== null}
              onClick={() => handleAction('predict')} color="var(--brand)"
              icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>} />
            <ActionBtn label="Update Tracking" loading={running === 'track'} disabled={running !== null}
              onClick={() => handleAction('track')} color="var(--gain)"
              icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>} />
            <ActionBtn label="Recalibrate" loading={running === 'recalibrate'} disabled={running !== null}
              onClick={() => handleAction('recalibrate')} color="#a78bfa"
              icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>} />
          </div>
        </div>
      </div>

      {/* ── Stats row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Picks" value={String(activePredictions.length)} sub="Currently tracked"
          color="#38bdf8"
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>} />
        <StatCard label="Success Rate" value={data ? `${data.stats.successRate.toFixed(1)}%` : '—'}
          sub={`${data?.stats.successCount ?? 0} / ${data?.stats.totalEvaluated ?? 0} evaluated`}
          color="var(--gain)"
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard label="Avg Return" value={data ? fmtPct(data.stats.avgReturn) : '—'}
          sub="On evaluated predictions"
          color={data && data.stats.avgReturn >= 0 ? 'var(--gain)' : 'var(--loss)'}
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard label="Model" value={data?.modelVersion ?? 'v1.0'} sub="Self-recalibrating weights"
          color="#a78bfa"
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>} />
      </div>

      {/* ── Today's Active Picks ─────────────────────────────────────────── */}
      {activePredictions.length > 0 && (
        <div>
          <h2 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text-hi)' }}>
            <span className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: '#38bdf8', boxShadow: '0 0 6px #38bdf8' }} />
            Today's Active Picks
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {activePredictions.map((p, i) => <ActiveCard key={p._id} p={p} rank={i + 1} />)}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          PREDICTION HISTORY TABLE
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="card overflow-hidden">

        {/* Table header bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4"
          style={{ borderBottom: '1px solid var(--border-sm)' }}>
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-hi)' }}>Prediction History</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {data?.total ?? 0} prediction{(data?.total ?? 0) !== 1 ? 's' : ''} · click any row to expand indicators
            </p>
          </div>

          {/* Filter pills */}
          <div className="flex items-center gap-1 p-1 rounded-xl overflow-x-auto shrink-0"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className="px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all duration-150"
                style={filter === f.key
                  ? { background: 'var(--brand)', color: '#fff', boxShadow: '0 2px 8px var(--brand-glow)' }
                  : { color: 'var(--text-lo)' }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            {[0,1,2].map(i => <div key={i} className="skeleton h-12 rounded-xl animate-pulse" />)}
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
              style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-glow)' }}>
              <svg className="w-6 h-6" style={{ color: 'var(--brand)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-hi)' }}>No predictions yet</p>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Click Run Predictions to generate today's top picks.</p>
            <button onClick={() => handleAction('predict')} disabled={running !== null}
              className="btn btn-primary px-5 py-2 text-sm font-semibold">
              {running === 'predict' ? 'Running…' : 'Run Predictions'}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <Th label="Stock"             sortKey="stockSymbol"          current={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="First Rec"         sortKey="firstRecommendedDate" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="Latest Rec"        sortKey="firstRecommendedDate" current={sortKey} dir={sortDir} onSort={handleSort} hint="Latest recommendation date" />
                  <Th label="Recs"              sortKey="recommendationCount"  current={sortKey} dir={sortDir} onSort={handleSort} right hint="Times recommended" />
                  <Th label="Entry"             sortKey="entryPrice"           current={sortKey} dir={sortDir} onSort={handleSort} right />
                  <Th label="Current"           sortKey="currentPrice"         current={sortKey} dir={sortDir} onSort={handleSort} right />
                  <Th label="Day Chg"           sortKey="dailyChange"          current={sortKey} dir={sortDir} onSort={handleSort} right />
                  <Th label="Total Return"      sortKey="totalReturn"          current={sortKey} dir={sortDir} onSort={handleSort} right />
                  <Th label="Target"            sortKey="totalReturn"          current={sortKey} dir={sortDir} onSort={handleSort} right hint="Target return" />
                  <Th label="Days Active"       sortKey="daysActive"           current={sortKey} dir={sortDir} onSort={handleSort} right />
                  <Th label="Status"            sortKey="status"               current={sortKey} dir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, idx) => {
                  const tracking   = p.tracking;
                  const daysActive = getTradingDays(p.firstRecommendedDate);
                  const ret        = tracking?.totalReturn ?? p.bestReturn;
                  const dayChange  = tracking?.dailyChange ?? null;
                  const curPrice   = tracking?.currentPrice ?? null;
                  const isExpanded = expandedId === p._id;
                  const isEven     = idx % 2 === 0;

                  return (
                    <>
                      <tr
                        key={p._id}
                        onClick={() => setExpandedId(isExpanded ? null : p._id)}
                        className="cursor-pointer transition-colors duration-150"
                        style={{
                          background: isEven ? 'transparent' : 'var(--bg-raised)',
                          borderBottom: '1px solid var(--border-sm)',
                        }}
                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--brand-bg)'}
                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = isEven ? 'transparent' : 'var(--bg-raised)'}
                      >
                        {/* Stock */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-1 h-8 rounded-full shrink-0"
                              style={{ background: STATUS_META[p.status].color }} />
                            <div>
                              <p className="text-sm font-bold" style={{ color: 'var(--text-hi)' }}>
                                {p.stockSymbol}
                              </p>
                              <p className="text-[10px] mt-0.5 max-w-[120px] truncate" style={{ color: 'var(--text-muted)' }}>
                                {p.stockName}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* First Recommended */}
                        <td className="px-3 py-3">
                          <span className="text-xs" style={{ color: 'var(--text-lo)' }}>
                            {fmtShortDate(p.firstRecommendedDate)}
                          </span>
                        </td>

                        {/* Latest Recommended */}
                        <td className="px-3 py-3">
                          <span className="text-xs" style={{ color: 'var(--text-lo)' }}>
                            {fmtShortDate(p.latestRecommendedDate)}
                          </span>
                        </td>

                        {/* Rec Count */}
                        <td className="px-3 py-3 text-right">
                          <span
                            className="inline-flex items-center justify-center w-6 h-6 rounded-lg text-[11px] font-bold"
                            style={{
                              background: p.recommendationCount > 1 ? 'var(--brand-bg)' : 'var(--bg-sunken)',
                              color: p.recommendationCount > 1 ? 'var(--brand)' : 'var(--text-muted)',
                            }}
                          >
                            {p.recommendationCount}
                          </span>
                        </td>

                        {/* Entry Price */}
                        <td className="px-3 py-3 text-right">
                          <span className="text-xs font-semibold" style={{ color: 'var(--text-lo)' }}>
                            {fmtPrice(p.entryPrice)}
                          </span>
                        </td>

                        {/* Current Price */}
                        <td className="px-3 py-3 text-right">
                          {curPrice != null ? (
                            <span className="text-xs font-semibold" style={{ color: 'var(--text-hi)' }}>
                              {fmtPrice(curPrice)}
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>

                        {/* Daily Change */}
                        <td className="px-3 py-3 text-right">
                          {dayChange != null ? (
                            <span className="text-xs font-bold" style={{ color: pctColor(dayChange) }}>
                              {fmtPct(dayChange)}
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>

                        {/* Total Return */}
                        <td className="px-3 py-3 text-right">
                          <span
                            className="inline-block px-2 py-0.5 rounded-lg text-xs font-bold"
                            style={{
                              background: ret > 0 ? 'var(--gain-bg)' : ret < 0 ? 'var(--loss-bg)' : 'var(--bg-sunken)',
                              color: pctColor(ret),
                            }}
                          >
                            {fmtPct(ret)}
                          </span>
                        </td>

                        {/* Target Return */}
                        <td className="px-3 py-3 text-right">
                          <span className="text-xs font-semibold" style={{ color: '#34d399' }}>
                            +{p.targetReturn}%
                          </span>
                        </td>

                        {/* Days Active */}
                        <td className="px-3 py-3 text-right">
                          <span
                            className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-[11px] font-bold"
                            style={{
                              background: daysActive >= 30 ? 'var(--loss-bg)' : daysActive >= 15 ? 'rgba(251,191,36,0.10)' : 'var(--bg-sunken)',
                              color: daysActive >= 30 ? 'var(--loss)' : daysActive >= 15 ? '#fbbf24' : 'var(--text-lo)',
                            }}
                          >
                            {daysActive}d
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3">
                          <StatusBadge status={p.status} />
                        </td>
                      </tr>

                      {/* Expanded indicator row */}
                      {isExpanded && (
                        <tr key={`${p._id}-exp`} style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-md)' }}>
                          <td colSpan={11} className="px-6 py-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                              {/* Indicators */}
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider mb-2.5"
                                  style={{ color: 'var(--text-muted)' }}>Technical Indicators</p>
                                <div className="space-y-2">
                                  <IndicatorMiniBar label="RSI (14)"     value={p.indicatorSnapshot.rsi}         max={100} />
                                  <IndicatorMiniBar label="MACD Signal"  value={Math.max(0, p.indicatorSnapshot.macdSignal)} max={300} />
                                  <IndicatorMiniBar label="BB Position"  value={p.indicatorSnapshot.bbPosition * 100}        max={100} />
                                  <IndicatorMiniBar label="Vol Ratio"    value={p.indicatorSnapshot.volumeRatio}             max={4} />
                                  <IndicatorMiniBar label="Momentum 10d" value={Math.max(0, p.indicatorSnapshot.momentum10d)} max={20} />
                                  <IndicatorMiniBar label="MA Crossover" value={Math.max(0, p.indicatorSnapshot.maCrossover)} max={25} />
                                  <IndicatorMiniBar label="ADX (14)"     value={p.indicatorSnapshot.adx}         max={60} />
                                </div>
                              </div>

                              {/* Metadata */}
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider mb-2.5"
                                  style={{ color: 'var(--text-muted)' }}>Prediction Details</p>
                                <div className="space-y-2">
                                  {[
                                    ['Model Version', p.modelVersion],
                                    ['Exchange', p.exchange],
                                    ['First Pick', fmtDate(p.firstRecommendedDate)],
                                    ['Latest Pick', fmtDate(p.latestRecommendedDate)],
                                    ['Times Recommended', String(p.recommendationCount)],
                                    ['Confidence Score', `${p.confidenceScore} / 100`],
                                    ['Best Return', fmtPct(p.bestReturn)],
                                    ...(p.finalReturn != null ? [['Final Return', fmtPct(p.finalReturn)]] : []),
                                    ...(p.evaluationDate ? [['Evaluated', fmtDate(p.evaluationDate)]] : []),
                                  ].map(([k, v]) => (
                                    <div key={k} className="flex justify-between items-center text-xs">
                                      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                                      <span className="font-semibold" style={{ color: 'var(--text-lo)' }}>{v}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Tracking info */}
                              {tracking && (
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider mb-2.5"
                                    style={{ color: 'var(--text-muted)' }}>Latest Tracking</p>
                                  <div className="space-y-2">
                                    {[
                                      ['Last Tracked', fmtDate(tracking.lastTracked)],
                                      ['Current Price', fmtPrice(tracking.currentPrice)],
                                      ['Daily Change', fmtPct(tracking.dailyChange)],
                                      ['Total Return', fmtPct(tracking.totalReturn)],
                                      ['Trading Days', `Day ${tracking.dayNumber}`],
                                    ].map(([k, v]) => (
                                      <div key={k} className="flex justify-between items-center text-xs">
                                        <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                                        <span className="font-semibold" style={{ color: 'var(--text-lo)' }}>{v}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Daily Performance Tracking Table ─────────────────────────────── */}
      <DailyTrackingTable />

      {/* ── Model Weights ────────────────────────────────────────────────── */}
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
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {Object.entries(data.modelWeights).map(([key, val]) => {
              const pct = (val as number) * 100;
              const labels: Record<string, string> = {
                rsi: 'RSI', macd: 'MACD', bbPosition: 'Bollinger',
                volumeRatio: 'Volume', momentum10d: 'Momentum', maCrossover: 'MA Cross', adx: 'ADX',
              };
              return (
                <div key={key} className="rounded-xl p-3" style={{ background: 'var(--bg-raised)' }}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-semibold" style={{ color: 'var(--text-lo)' }}>
                      {labels[key] ?? key}
                    </span>
                    <span className="text-[11px] font-black" style={{ color: '#a78bfa' }}>
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
                    <div className="h-full rounded-full"
                      style={{ width: `${Math.min(100, pct / 40 * 100)}%`, background: 'linear-gradient(90deg,#a78bfa,#818cf8)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4"
        style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
        {[
          { n: 1, c: 'var(--brand)', title: 'Score', body: '7 technical indicators (RSI, MACD, Bollinger, Volume, Momentum, MA cross, ADX) computed from 90-day OHLCV data.' },
          { n: 2, c: '#818cf8',      title: 'Filter', body: 'Stocks with RSI 40–75, ADX > 20, composite score ≥ 0.55 are ranked. Top 3 are picked daily.' },
          { n: 3, c: '#a78bfa',      title: 'Learn',  body: 'Weights self-adjust based on which indicators correlated with ≥5% returns over 45-day tracking windows.' },
        ].map(({ n, c, title, body }) => (
          <div key={n} className="flex gap-3 items-start">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white shrink-0"
              style={{ background: c }}>
              {n}
            </div>
            <p className="text-xs" style={{ color: 'var(--text-lo)' }}>
              <strong style={{ color: 'var(--text-hi)' }}>{title} — </strong>{body}
            </p>
          </div>
        ))}
      </div>

    </div>
  );
}
