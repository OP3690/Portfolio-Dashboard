'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import DailyTrackingTable from './DailyTrackingTable';
import PredictionTrades, { BuyModal, SellModal, Trade as PTrade, TradePrediction } from './PredictionTrades';
import PredictionIntelligence from './PredictionIntelligence';

/* ─── Types ──────────────────────────────────────────────────────────────── */
type PredictionStatus = 'Active' | 'Achieved' | 'OverAchieved' | 'MissedSlightly' | 'Missed' | 'Expired';
type SortKey = 'stockSymbol' | 'firstRecommendedDate' | 'recommendationCount' |
               'entryPrice' | 'currentPrice' | 'dailyChange' | 'totalReturn' |
               'daysActive' | 'confidenceScore' | 'status';
type SortDir = 'asc' | 'desc';

interface Tracking {
  currentPrice: number; dailyChange: number; totalReturn: number;
  dayNumber: number; lastTracked: string;
}
interface IndicatorSnapshot {
  rsi: number; macdSignal: number; bbPosition: number;
  volumeRatio: number; momentum10d: number; maCrossover: number; adx: number;
}
interface Prediction {
  _id: string; stockSymbol: string; stockName: string; exchange: string;
  firstRecommendedDate: string; latestRecommendedDate: string;
  recommendationCount: number; entryPrice: number; targetReturn: number;
  confidenceScore: number; status: PredictionStatus; bestReturn: number;
  finalReturn?: number; evaluationDate?: string; modelVersion: string;
  indicatorSnapshot: IndicatorSnapshot; tracking: Tracking | null;
  regime?: string; mcProbability?: number; backtestWinRate?: number;
}
interface Stats { totalEvaluated: number; successCount: number; successRate: number; avgReturn: number; }
interface ApiResponse {
  success: boolean; predictions: Prediction[]; total: number;
  stats: Stats; modelVersion: string; modelWeights: Record<string, number> | null;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function getTradingDays(fromIso: string) {
  const cur = new Date(fromIso); const end = new Date(); let c = 0;
  while (cur <= end) { if (cur.getDay() !== 0 && cur.getDay() !== 6) c++; cur.setDate(cur.getDate() + 1); }
  return Math.max(0, c - 1);
}
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtShort = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
const fmtPrice = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtPct = (n: number, sign = true) => `${sign && n > 0 ? '+' : ''}${n.toFixed(2)}%`;
const pctColor = (n: number) => n > 0 ? 'var(--gain)' : n < 0 ? 'var(--loss)' : 'var(--text-muted)';
const pctBg = (n: number) => n > 0 ? 'rgba(52,211,153,0.10)' : n < 0 ? 'rgba(248,113,113,0.10)' : 'var(--bg-sunken)';

/** Indian compact format: ₹3.72 L / ₹1.05 Cr / ₹45,000 */
function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000)    return `${sign}₹${(abs / 100_000).toFixed(2)} L`;
  if (abs >= 1_000)      return `${sign}₹${(abs / 1_000).toFixed(1)}k`;
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
/** Same but with +/- sign for P&L */
function fmtCompactPnl(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? '+' : '−';
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000)    return `${sign}₹${(abs / 100_000).toFixed(2)} L`;
  if (abs >= 1_000)      return `${sign}₹${(abs / 1_000).toFixed(1)}k`;
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

const STATUS_META: Record<PredictionStatus, { label: string; color: string; bg: string }> = {
  Active:         { label: 'Active',        color: '#38bdf8', bg: 'rgba(56,189,248,0.12)'  },
  Achieved:       { label: 'Achieved',      color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
  OverAchieved:   { label: 'Over-achieved', color: '#a78bfa', bg: 'rgba(167,139,250,0.14)' },
  MissedSlightly: { label: 'Slight miss',   color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
  Missed:         { label: 'Missed',        color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  Expired:        { label: 'Expired',       color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
};
const STATUS_ORDER: Record<PredictionStatus, number> = { Active:0, Achieved:1, OverAchieved:2, MissedSlightly:3, Missed:4, Expired:5 };

const REGIME_META: Record<string, { label: string; color: string; bg: string }> = {
  trending:      { label: '↗ Trending',     color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
  'mean-reverting': { label: '↔ Mean Rev', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'   },
  volatile:      { label: '⚡ Volatile',    color: '#f87171', bg: 'rgba(248,113,113,0.12)'  },
  quiet:         { label: '〰 Quiet',       color: '#94a3b8', bg: 'rgba(148,163,184,0.12)'  },
};

/* ─── Status Badge ───────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: PredictionStatus }) {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap"
      style={{ background: m.bg, color: m.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />{m.label}
    </span>
  );
}

/* ─── Confidence Arc (SVG circle progress) ────────────────────────────────── */
function ConfidenceArc({ score }: { score: number }) {
  const r = 22; const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 75 ? '#34d399' : score >= 55 ? '#fbbf24' : '#f87171';
  return (
    <div className="relative flex items-center justify-center w-14 h-14 shrink-0">
      <svg width="56" height="56" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth="3.5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="3.5"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-black leading-none" style={{ color }}>{score}</span>
        <span className="text-[8px] leading-none mt-0.5" style={{ color: 'var(--text-muted)' }}>conf</span>
      </div>
    </div>
  );
}

/* ─── Indicator Mini Bar ─────────────────────────────────────────────────── */
function IndicatorMiniBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 text-right text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--bg-sunken)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,var(--brand),#818cf8)' }} />
      </div>
      <span className="w-10 text-[10px] font-semibold text-right shrink-0" style={{ color: 'var(--text-lo)' }}>{value.toFixed(1)}</span>
    </div>
  );
}

/* ─── Sort icons ─────────────────────────────────────────────────────────── */
function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
      style={{ opacity: active ? 1 : 0.3, color: active ? 'var(--brand)' : 'currentColor' }}>
      {active && dir === 'asc'
        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />}
    </svg>
  );
}
function Th({ label, sk, current, dir, onSort, right = false, hint }: {
  label: string; sk: SortKey; current: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void; right?: boolean; hint?: string;
}) {
  const active = current === sk;
  return (
    <th title={hint} onClick={() => onSort(sk)}
      className="px-3 py-3 cursor-pointer select-none whitespace-nowrap"
      style={{
        color: active ? 'var(--brand)' : 'var(--text-muted)', fontSize: 10, fontWeight: 700,
        letterSpacing: '0.05em', textTransform: 'uppercase', textAlign: right ? 'right' : 'left',
        background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-md)',
        position: 'sticky', top: 0, zIndex: 2,
      }}>
      <span className={`inline-flex items-center gap-1 ${right ? 'justify-end w-full' : ''}`}>
        {label}<SortIcon active={active} dir={dir} />
      </span>
    </th>
  );
}

/* ─── Today's Pick Card ──────────────────────────────────────────────────── */
function PickCard({
  p, rank, openTrade,
  onBuy, onSell,
}: {
  p: Prediction; rank: number; openTrade: PTrade | null;
  onBuy: () => void; onSell: () => void;
}) {
  const ret       = p.tracking?.totalReturn ?? p.bestReturn;
  const curPrice  = p.tracking?.currentPrice;
  const dayChg    = p.tracking?.dailyChange ?? null;
  const days      = getTradingDays(p.firstRecommendedDate);
  const regime    = p.regime ? REGIME_META[p.regime] ?? null : null;
  const progress  = Math.min(100, (ret / (p.targetReturn || 5)) * 100);
  const rankColors = ['#818cf8', '#34d399', '#fbbf24'];
  const rc = rankColors[rank - 1] ?? 'var(--brand)';

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-md)', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>

      {/* Top accent bar */}
      <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${rc}, transparent)` }} />

      {/* Header */}
      <div className="p-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black text-white shrink-0"
            style={{ background: rc }}>#{rank}</div>
          <div className="min-w-0">
            <p className="text-base font-black leading-tight" style={{ color: 'var(--text-hi)' }}>{p.stockSymbol}</p>
            <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{p.stockName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {regime && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg whitespace-nowrap"
              style={{ background: regime.bg, color: regime.color }}>{regime.label}</span>
          )}
          <ConfidenceArc score={p.confidenceScore} />
        </div>
      </div>

      {/* Price row */}
      <div className="px-4 py-2 grid grid-cols-3 gap-2">
        {[
          { label: 'AI Entry', val: fmtPrice(p.entryPrice), color: 'var(--text-hi)' },
          { label: 'Current',  val: curPrice ? fmtPrice(curPrice) : '—', color: curPrice && curPrice >= p.entryPrice ? 'var(--gain)' : curPrice ? 'var(--loss)' : 'var(--text-muted)' },
          { label: 'Day Chg',  val: dayChg != null ? fmtPct(dayChg) : '—', color: dayChg != null ? pctColor(dayChg) : 'var(--text-muted)' },
        ].map(({ label, val, color }) => (
          <div key={label} className="rounded-xl p-2.5 text-center" style={{ background: 'var(--bg-raised)' }}>
            <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
            <p className="text-xs font-black" style={{ color }}>{val}</p>
          </div>
        ))}
      </div>

      {/* AI Signal metrics */}
      <div className="px-4 py-2 flex items-center gap-2">
        {p.mcProbability != null && (
          <div className="flex-1 rounded-lg px-2 py-1.5" style={{ background: 'var(--bg-raised)' }}>
            <p className="text-[9px] font-bold" style={{ color: 'var(--text-muted)' }}>MC Prob</p>
            <p className="text-[11px] font-black mt-0.5" style={{ color: '#818cf8' }}>{(p.mcProbability * 100).toFixed(0)}%</p>
          </div>
        )}
        {p.backtestWinRate != null && (
          <div className="flex-1 rounded-lg px-2 py-1.5" style={{ background: 'var(--bg-raised)' }}>
            <p className="text-[9px] font-bold" style={{ color: 'var(--text-muted)' }}>Backtest</p>
            <p className="text-[11px] font-black mt-0.5" style={{ color: '#a78bfa' }}>{(p.backtestWinRate * 100).toFixed(0)}%</p>
          </div>
        )}
        <div className="flex-1 rounded-lg px-2 py-1.5" style={{ background: 'var(--bg-raised)' }}>
          <p className="text-[9px] font-bold" style={{ color: 'var(--text-muted)' }}>Recs</p>
          <p className="text-[11px] font-black mt-0.5" style={{ color: p.recommendationCount > 1 ? 'var(--brand)' : 'var(--text-lo)' }}>
            ×{p.recommendationCount}
          </p>
        </div>
        <div className="flex-1 rounded-lg px-2 py-1.5" style={{ background: 'var(--bg-raised)' }}>
          <p className="text-[9px] font-bold" style={{ color: 'var(--text-muted)' }}>Day</p>
          <p className="text-[11px] font-black mt-0.5" style={{ color: 'var(--text-lo)' }}>{days}d</p>
        </div>
      </div>

      {/* Target progress bar */}
      <div className="px-4 pt-1 pb-2">
        <div className="flex items-center justify-between text-[9px] mb-1" style={{ color: 'var(--text-muted)' }}>
          <span>Progress to +{p.targetReturn}% target</span>
          <span style={{ color: pctColor(ret), fontWeight: 700 }}>{fmtPct(ret)}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.max(0, progress)}%`, background: progress >= 100 ? '#34d399' : progress >= 50 ? 'var(--brand)' : '#fbbf24' }} />
        </div>
      </div>

      {/* Holding strip — if user has a position */}
      {openTrade && (
        <div className="mx-4 mb-2 rounded-xl px-3 py-2.5 flex items-center justify-between"
          style={{
            background: openTrade.totalPnL >= 0 ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
            border: `1px solid ${openTrade.totalPnL >= 0 ? 'rgba(52,211,153,0.20)' : 'rgba(248,113,113,0.20)'}`,
          }}>
          <div>
            <p className="text-[9px] font-bold" style={{ color: 'var(--text-muted)' }}>YOUR POSITION</p>
            <p className="text-[11px] font-black mt-0.5" style={{ color: 'var(--text-hi)' }}>
              {openTrade.remainingQuantity} shares @ {fmtPrice(openTrade.buyPrice)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-bold" style={{ color: 'var(--text-muted)' }}>Unrealized P&L</p>
            <p className="text-xs font-black mt-0.5" style={{ color: pctColor(openTrade.unrealizedPnL) }}>
              {fmtCompactPnl(openTrade.unrealizedPnL)}
              <span className="text-[9px] ml-1">({fmtPct(openTrade.unrealizedPnLPct)})</span>
            </p>
          </div>
        </div>
      )}

      {/* CTA buttons */}
      <div className="p-4 pt-2 flex gap-2 mt-auto">
        <button onClick={onBuy}
          className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-150"
          style={{
            background: openTrade ? 'var(--bg-raised)' : 'var(--brand)',
            color: openTrade ? 'var(--brand)' : '#fff',
            border: openTrade ? '1px solid var(--brand)' : 'none',
          }}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          {openTrade ? 'Add to Position' : 'Record Buy'}
        </button>
        {openTrade && (
          <button onClick={onSell}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-150"
            style={{ background: '#f87171', color: '#fff' }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
            </svg>
            Sell {openTrade.remainingQuantity}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Open Positions mini-table ──────────────────────────────────────────── */
function OpenPositions({ trades, onSell }: { trades: PTrade[]; onSell: (t: PTrade) => void }) {
  if (trades.length === 0) return null;
  const totalInvested   = trades.reduce((s, t) => s + t.totalInvested, 0);
  const totalUnrealized = trades.reduce((s, t) => s + t.unrealizedPnL, 0);
  const tdS: React.CSSProperties = { padding: '10px 14px', fontSize: 12, borderBottom: '1px solid var(--border-sm)', whiteSpace: 'nowrap' };
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-sm)' }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
          <h2 className="text-sm font-black" style={{ color: 'var(--text-hi)' }}>My Open Positions</h2>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(52,211,153,0.10)', color: '#34d399' }}>
            {trades.length} active
          </span>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <p className="text-[9px] font-bold" style={{ color: 'var(--text-muted)' }}>INVESTED</p>
            <p className="text-xs font-black" style={{ color: '#818cf8' }}>{fmtCompact(totalInvested)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold" style={{ color: 'var(--text-muted)' }}>UNREALIZED P&L</p>
            <p className="text-xs font-black" style={{ color: pctColor(totalUnrealized) }}>{fmtCompactPnl(totalUnrealized)}</p>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {['Stock', 'Bought', 'Qty Held', 'Avg Buy', 'Current', 'Unrealized P&L', 'Total P&L', ''].map(h => (
                <th key={h} style={{
                  padding: '8px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                  textTransform: 'uppercase', textAlign: h === '' ? 'center' : 'left',
                  color: 'var(--text-muted)', background: 'var(--bg-raised)',
                  borderBottom: '1px solid var(--border-md)', whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trades.map((t, i) => (
              <tr key={t._id} style={{ background: i % 2 ? 'var(--bg-raised)' : 'transparent' }}>
                <td style={tdS}>
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-6 rounded-full shrink-0" style={{ background: '#34d399' }} />
                    <div>
                      <p className="text-xs font-black" style={{ color: 'var(--text-hi)' }}>{t.stockSymbol}</p>
                      <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{t.status === 'partial' ? 'Partial' : 'Full'} position</p>
                    </div>
                  </div>
                </td>
                <td style={tdS}><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{fmtShort(t.buyDate)}</span></td>
                <td style={tdS}><span className="font-bold" style={{ color: 'var(--text-lo)' }}>{t.remainingQuantity}</span></td>
                <td style={tdS}><span style={{ color: 'var(--text-lo)' }}>{fmtPrice(t.buyPrice)}</span></td>
                <td style={tdS}><span className="font-bold" style={{ color: 'var(--text-hi)' }}>{fmtPrice(t.currentPrice)}</span></td>
                <td style={{ ...tdS, background: pctBg(t.unrealizedPnL) }}>
                  <p className="font-bold text-xs" style={{ color: pctColor(t.unrealizedPnL) }}>
                    {t.unrealizedPnL >= 0 ? '+' : ''}₹{Math.abs(t.unrealizedPnL).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-[10px]" style={{ color: pctColor(t.unrealizedPnLPct) }}>{fmtPct(t.unrealizedPnLPct)}</p>
                </td>
                <td style={{ ...tdS, background: pctBg(t.totalPnL) }}>
                  <p className="font-black text-xs" style={{ color: pctColor(t.totalPnL) }}>
                    {t.totalPnL >= 0 ? '+' : ''}₹{Math.abs(t.totalPnL).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-[10px]" style={{ color: pctColor(t.totalPnLPct) }}>{fmtPct(t.totalPnLPct)}</p>
                </td>
                <td style={{ ...tdS, textAlign: 'center' }}>
                  <button onClick={() => onSell(t)}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 mx-auto"
                    style={{ background: '#f87171', color: '#fff' }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
                    </svg>
                    Sell
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Action button ──────────────────────────────────────────────────────── */
function ActionBtn({ label, loading, disabled, onClick, color, icon }: {
  label: string; loading: boolean; disabled: boolean;
  onClick: () => void; color: string; icon: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold transition-all duration-200"
      style={{
        background: disabled && !loading ? 'var(--bg-raised)' : `color-mix(in srgb,${color} 14%,transparent)`,
        border: `1px solid ${disabled && !loading ? 'var(--border-md)' : `color-mix(in srgb,${color} 30%,transparent)`}`,
        color: disabled && !loading ? 'var(--text-muted)' : color,
      }}>
      {loading
        ? <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: color, borderTopColor: 'transparent' }} />
        : icon}
      {loading ? 'Running…' : label}
    </button>
  );
}

/* ─── Filter pills ───────────────────────────────────────────────────────── */
const FILTERS = [
  { key: 'all', label: 'All' }, { key: 'Active', label: 'Active' },
  { key: 'Achieved', label: 'Achieved' }, { key: 'OverAchieved', label: 'Over-achieved' },
  { key: 'MissedSlightly', label: 'Slight miss' }, { key: 'Missed', label: 'Missed' },
  { key: 'Expired', label: 'Expired' },
];

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
  const [allTrades,       setAllTrades]       = useState<PTrade[]>([]);
  const [buyForPred,      setBuyForPred]      = useState<TradePrediction | null>(null);
  const [sellForTrade,    setSellForTrade]    = useState<PTrade | null>(null);
  // Incrementing this tells <PredictionTrades> to re-fetch its own list
  const [tradeRefreshKey, setTradeRefreshKey] = useState(0);

  /* maps predictionId → open trade */
  const openTradesMap = useMemo(() => {
    const m = new Map<string, PTrade>();
    for (const t of allTrades) if (t.status !== 'closed') m.set(t.predictionId, t);
    return m;
  }, [allTrades]);

  const openTrades = useMemo(() => allTrades.filter(t => t.status !== 'closed'), [allTrades]);

  const showToast = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4500); };

  const fetchPredictions = useCallback(async (status = filter) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/ai-predictions?status=${status}&limit=200`);
      const d = await res.json();
      if (d.success) setData(d);
    } catch (e: any) { showToast(e.message, false); }
    finally { setLoading(false); }
  }, [filter]);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch('/api/prediction-trades');
      const d = await res.json();
      if (d.success) setAllTrades(d.trades);
    } catch {}
  }, []);

  /** Refresh both local trade state and the PredictionTrades child component */
  const bumpTrades = useCallback(() => {
    fetchTrades();
    setTradeRefreshKey(k => k + 1);
  }, [fetchTrades]);

  useEffect(() => { fetchPredictions(filter); }, [filter]);
  useEffect(() => { fetchTrades(); }, [fetchTrades]);

  const handleAction = async (action: 'predict' | 'track' | 'recalibrate') => {
    const ep = action === 'predict' ? '/api/ai-predict' : action === 'track' ? '/api/ai-track' : '/api/ai-recalibrate';
    setRunning(action);
    try {
      const res = await fetch(ep, { method: 'POST' });
      const body = await res.json();
      if (body.success) {
        if (action === 'predict') await fetch('/api/ai-track', { method: 'POST' });
        const msgs: Record<string, string> = {
          predict: `${body.count ?? 0} stocks selected · tracking updated`,
          track: `Tracking updated — ${body.updatedCount ?? 0} predictions refreshed`,
          recalibrate: body.message || 'Recalibration complete',
        };
        showToast(msgs[action], true);
        await fetchPredictions(filter);
        await fetchTrades();
      } else showToast(body.error || `${action} failed`, false);
    } catch (e: any) { showToast(e.message, false); }
    finally { setRunning(null); }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = useMemo(() => {
    const rows = [...(data?.predictions ?? [])];
    rows.sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case 'stockSymbol':          av = a.stockSymbol; bv = b.stockSymbol; break;
        case 'firstRecommendedDate': av = new Date(a.firstRecommendedDate).getTime(); bv = new Date(b.firstRecommendedDate).getTime(); break;
        case 'recommendationCount':  av = a.recommendationCount; bv = b.recommendationCount; break;
        case 'entryPrice':           av = a.entryPrice; bv = b.entryPrice; break;
        case 'currentPrice':         av = a.tracking?.currentPrice ?? 0; bv = b.tracking?.currentPrice ?? 0; break;
        case 'dailyChange':          av = a.tracking?.dailyChange ?? 0; bv = b.tracking?.dailyChange ?? 0; break;
        case 'totalReturn':          av = a.tracking?.totalReturn ?? a.bestReturn; bv = b.tracking?.totalReturn ?? b.bestReturn; break;
        case 'daysActive':           av = getTradingDays(a.firstRecommendedDate); bv = getTradingDays(b.firstRecommendedDate); break;
        case 'confidenceScore':      av = a.confidenceScore; bv = b.confidenceScore; break;
        case 'status':               av = STATUS_ORDER[a.status]; bv = STATUS_ORDER[b.status]; break;
        default: av = 0; bv = 0;
      }
      return av < bv ? (sortDir === 'asc' ? -1 : 1) : av > bv ? (sortDir === 'asc' ? 1 : -1) : 0;
    });
    return rows;
  }, [data?.predictions, sortKey, sortDir]);

  const activePredictions = data?.predictions.filter(p => p.status === 'Active') ?? [];

  /* ── Trade analytics numbers ─────────────────────────────────────────────── */
  const tradeStats = useMemo(() => ({
    invested:   allTrades.reduce((s, t) => s + t.totalInvested, 0),
    realized:   allTrades.reduce((s, t) => s + t.realizedPnL, 0),
    unrealized: allTrades.reduce((s, t) => s + t.unrealizedPnL, 0),
    total:      allTrades.reduce((s, t) => s + t.totalPnL, 0),
  }), [allTrades]);

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-5 animate-fadeIn">

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {buyForPred && (
        <BuyModal prediction={buyForPred} onClose={() => setBuyForPred(null)}
          onSuccess={bumpTrades} />
      )}
      {sellForTrade && (
        <SellModal trade={sellForTrade} onClose={() => setSellForTrade(null)}
          onSuccess={bumpTrades} />
      )}

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold shadow-2xl"
          style={{
            background: toast.ok ? 'var(--gain-bg)' : 'var(--loss-bg)',
            border: `1px solid ${toast.ok ? 'var(--gain-border)' : 'var(--loss-border)'}`,
            color: toast.ok ? 'var(--gain)' : 'var(--loss)',
          }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {toast.ok
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />}
          </svg>
          {toast.msg}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          1. HEADER
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl p-5 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,rgba(91,94,244,0.12) 0%,rgba(129,140,248,0.04) 100%)', border: '1px solid var(--brand-glow)' }}>
        <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle,rgba(91,94,244,0.18) 0%,transparent 70%)' }} />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg,var(--brand),#818cf8)', boxShadow: '0 4px 14px var(--brand-glow)' }}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-black"
                style={{ background: 'linear-gradient(135deg,var(--brand),#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                AI Stock Predictions
              </h1>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                NSE · {data?.modelVersion ?? 'v1.0'} · {activePredictions.length} active · auto-runs 5:00 AM IST
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionBtn label="Run Predictions" loading={running === 'predict'} disabled={running !== null}
              onClick={() => handleAction('predict')} color="var(--brand)"
              icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>} />
            <ActionBtn label="Update Prices" loading={running === 'track'} disabled={running !== null}
              onClick={() => handleAction('track')} color="var(--gain)"
              icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>} />
            <ActionBtn label="Recalibrate" loading={running === 'recalibrate'} disabled={running !== null}
              onClick={() => handleAction('recalibrate')} color="#a78bfa"
              icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          2. STATS BAR
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Active Picks',  val: String(activePredictions.length), sub: 'being tracked', color: '#38bdf8' },
          { label: 'Win Rate',      val: data ? `${data.stats.successRate.toFixed(0)}%` : '—', sub: `${data?.stats.successCount ?? 0}/${data?.stats.totalEvaluated ?? 0} evaluated`, color: 'var(--gain)' },
          { label: 'Avg Return',    val: data ? fmtPct(data.stats.avgReturn) : '—', sub: 'on evaluated picks', color: data && data.stats.avgReturn >= 0 ? 'var(--gain)' : 'var(--loss)' },
          { label: 'Invested',      val: allTrades.length ? fmtCompact(tradeStats.invested) : '—', sub: `${allTrades.length} trade${allTrades.length !== 1 ? 's' : ''}`, color: '#818cf8' },
          { label: 'Realized P&L',  val: allTrades.length ? fmtCompactPnl(tradeStats.realized) : '—', sub: 'from closed trades', color: pctColor(tradeStats.realized) },
          { label: 'Unrealized',    val: openTrades.length ? fmtCompactPnl(tradeStats.unrealized) : '—', sub: `${openTrades.length} open position${openTrades.length !== 1 ? 's' : ''}`, color: pctColor(tradeStats.unrealized) },
        ].map(({ label, val, sub, color }) => (
          <div key={label} className="card p-3.5">
            <p className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
            <p className="text-lg font-black leading-tight" style={{ color }}>{val}</p>
            <p className="text-[9px] mt-1 leading-tight" style={{ color: 'var(--text-muted)' }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          2b. PREDICTION INTELLIGENCE — 5% MONTHLY TARGET ENGINE
      ══════════════════════════════════════════════════════════════════════ */}
      <PredictionIntelligence
        predictions={data?.predictions ?? []}
        stats={data?.stats ?? null}
        trades={allTrades}
        monthlyTarget={5}
      />

      {/* ══════════════════════════════════════════════════════════════════════
          3. TODAY'S AI PICKS
      ══════════════════════════════════════════════════════════════════════ */}
      {activePredictions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#38bdf8', boxShadow: '0 0 6px #38bdf8' }} />
            <h2 className="text-sm font-black" style={{ color: 'var(--text-hi)' }}>Today's AI Picks</h2>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>— {activePredictions.length} active · click card to expand details</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {activePredictions.map((p, i) => (
              <PickCard key={p._id} p={p} rank={i + 1}
                openTrade={openTradesMap.get(p._id) ?? null}
                onBuy={() => setBuyForPred({ _id: p._id, stockSymbol: p.stockSymbol, stockName: p.stockName, entryPrice: p.entryPrice, status: p.status })}
                onSell={() => { const t = openTradesMap.get(p._id); if (t) setSellForTrade(t); }} />
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          4. MY OPEN POSITIONS
      ══════════════════════════════════════════════════════════════════════ */}
      <OpenPositions trades={openTrades}
        onSell={t => setSellForTrade(t)} />

      {/* ══════════════════════════════════════════════════════════════════════
          5. PREDICTION HISTORY TABLE
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="card overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4"
          style={{ borderBottom: '1px solid var(--border-sm)' }}>
          <div>
            <h2 className="text-sm font-black" style={{ color: 'var(--text-hi)' }}>Prediction History</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {data?.total ?? 0} prediction{(data?.total ?? 0) !== 1 ? 's' : ''} · click any row to see indicators
            </p>
          </div>
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
          <div className="p-6 space-y-3">{[0,1,2].map(i => <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'var(--bg-raised)' }} />)}</div>
        ) : sorted.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-glow)' }}>
              <svg className="w-6 h-6" style={{ color: 'var(--brand)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-hi)' }}>No predictions yet</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Hit "Run Predictions" to generate today's top picks.</p>
            <button onClick={() => handleAction('predict')} disabled={running !== null}
              className="mt-1 px-5 py-2 rounded-xl text-xs font-bold text-white" style={{ background: 'var(--brand)' }}>
              {running === 'predict' ? 'Running…' : 'Run Predictions'}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 980 }}>
              <thead>
                <tr>
                  <Th label="Stock"        sk="stockSymbol"          current={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="First Rec"    sk="firstRecommendedDate" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="Latest Rec"   sk="firstRecommendedDate" current={sortKey} dir={sortDir} onSort={handleSort} hint="Latest recommendation date" />
                  <Th label="Recs"         sk="recommendationCount"  current={sortKey} dir={sortDir} onSort={handleSort} right hint="Times recommended" />
                  <Th label="Entry ₹"      sk="entryPrice"           current={sortKey} dir={sortDir} onSort={handleSort} right />
                  <Th label="Current ₹"    sk="currentPrice"         current={sortKey} dir={sortDir} onSort={handleSort} right />
                  <Th label="Day Chg"      sk="dailyChange"          current={sortKey} dir={sortDir} onSort={handleSort} right />
                  <Th label="Return"       sk="totalReturn"          current={sortKey} dir={sortDir} onSort={handleSort} right />
                  <Th label="Target"       sk="totalReturn"          current={sortKey} dir={sortDir} onSort={handleSort} right />
                  <Th label="Days"         sk="daysActive"           current={sortKey} dir={sortDir} onSort={handleSort} right />
                  <Th label="Status"       sk="status"               current={sortKey} dir={sortDir} onSort={handleSort} />
                  <th style={{ padding: '10px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-md)', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 2 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, idx) => {
                  const tracking   = p.tracking;
                  const daysActive = getTradingDays(p.firstRecommendedDate);
                  const ret        = tracking?.totalReturn ?? p.bestReturn;
                  const dayChg     = tracking?.dailyChange ?? null;
                  const curPrice   = tracking?.currentPrice ?? null;
                  const isExpanded = expandedId === p._id;
                  const openTrade  = openTradesMap.get(p._id);
                  const isEven     = idx % 2 === 0;

                  return (
                    <>
                      <tr key={p._id} onClick={() => setExpandedId(isExpanded ? null : p._id)}
                        className="cursor-pointer"
                        style={{ background: isExpanded ? 'color-mix(in srgb,var(--brand) 5%,transparent)' : isEven ? 'transparent' : 'color-mix(in srgb,var(--bg-raised) 50%,transparent)', borderBottom: '1px solid var(--border-sm)' }}
                        onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb,var(--brand) 4%,transparent)'; }}
                        onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = isEven ? 'transparent' : 'color-mix(in srgb,var(--bg-raised) 50%,transparent)'; }}>

                        {/* Stock */}
                        <td style={{ padding: '10px 14px' }}>
                          <div className="flex items-center gap-2.5">
                            <div className="w-1 h-8 rounded-full shrink-0" style={{ background: STATUS_META[p.status].color }} />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-black" style={{ color: 'var(--text-hi)' }}>{p.stockSymbol}</p>
                                {openTrade && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>
                                    {openTrade.remainingQuantity} held
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] mt-0.5 max-w-[130px] truncate" style={{ color: 'var(--text-muted)' }}>{p.stockName}</p>
                            </div>
                          </div>
                        </td>

                        {/* First Rec */}
                        <td style={{ padding: '10px 14px' }}>
                          <span className="text-xs" style={{ color: 'var(--text-lo)' }}>{fmtShort(p.firstRecommendedDate)}</span>
                        </td>

                        {/* Latest Rec */}
                        <td style={{ padding: '10px 14px' }}>
                          <span className="text-xs" style={{ color: 'var(--text-lo)' }}>{fmtShort(p.latestRecommendedDate)}</span>
                        </td>

                        {/* Recs */}
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg text-[11px] font-black"
                            style={{ background: p.recommendationCount > 1 ? 'var(--brand-bg)' : 'var(--bg-sunken)', color: p.recommendationCount > 1 ? 'var(--brand)' : 'var(--text-muted)' }}>
                            {p.recommendationCount}
                          </span>
                        </td>

                        {/* Entry */}
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <span className="text-xs font-semibold" style={{ color: 'var(--text-lo)' }}>{fmtPrice(p.entryPrice)}</span>
                        </td>

                        {/* Current */}
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          {curPrice != null
                            ? <span className="text-xs font-bold" style={{ color: curPrice >= p.entryPrice ? 'var(--gain)' : 'var(--loss)' }}>{fmtPrice(curPrice)}</span>
                            : <span style={{ color: 'var(--border-md)', fontSize: 11 }}>—</span>}
                        </td>

                        {/* Day Change */}
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          {dayChg != null
                            ? <span className="text-xs font-bold" style={{ color: pctColor(dayChg) }}>{fmtPct(dayChg)}</span>
                            : <span style={{ color: 'var(--border-md)', fontSize: 11 }}>—</span>}
                        </td>

                        {/* Return */}
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <span className="px-2 py-0.5 rounded-lg text-xs font-black"
                            style={{ background: pctBg(ret), color: pctColor(ret) }}>
                            {fmtPct(ret)}
                          </span>
                        </td>

                        {/* Target */}
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <span className="text-xs font-semibold" style={{ color: '#34d399' }}>+{p.targetReturn}%</span>
                        </td>

                        {/* Days */}
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold"
                            style={{ background: daysActive >= 30 ? 'var(--loss-bg)' : daysActive >= 15 ? 'rgba(251,191,36,0.10)' : 'var(--bg-sunken)', color: daysActive >= 30 ? 'var(--loss)' : daysActive >= 15 ? '#fbbf24' : 'var(--text-muted)' }}>
                            {daysActive}d
                          </span>
                        </td>

                        {/* Status */}
                        <td style={{ padding: '10px 14px' }}><StatusBadge status={p.status} /></td>

                        {/* Actions */}
                        <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5 justify-center">
                            <button
                              onClick={() => setBuyForPred({ _id: p._id, stockSymbol: p.stockSymbol, stockName: p.stockName, entryPrice: p.entryPrice, status: p.status })}
                              className="h-7 px-2.5 rounded-lg text-[10px] font-bold flex items-center gap-1 whitespace-nowrap"
                              style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.22)' }}>
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                              </svg>
                              Buy
                            </button>
                            {openTrade && (
                              <button onClick={() => setSellForTrade(openTrade)}
                                className="h-7 px-2.5 rounded-lg text-[10px] font-bold flex items-center gap-1 whitespace-nowrap"
                                style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.22)' }}
                                title={`${openTrade.remainingQuantity} shares remaining`}>
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
                                </svg>
                                Sell {openTrade.remainingQuantity}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded row */}
                      {isExpanded && (
                        <tr key={`${p._id}-exp`}>
                          <td colSpan={12} style={{ background: 'color-mix(in srgb,var(--brand) 3%,var(--bg-raised))', borderBottom: '1px solid var(--border-md)', padding: '16px 20px' }}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                              {/* Technical indicators */}
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Technical Indicators</p>
                                <div className="space-y-2">
                                  <IndicatorMiniBar label="RSI (14)"     value={p.indicatorSnapshot.rsi} max={100} />
                                  <IndicatorMiniBar label="MACD Signal"  value={Math.max(0, p.indicatorSnapshot.macdSignal)} max={300} />
                                  <IndicatorMiniBar label="BB Position"  value={p.indicatorSnapshot.bbPosition * 100} max={100} />
                                  <IndicatorMiniBar label="Vol Ratio"    value={p.indicatorSnapshot.volumeRatio} max={4} />
                                  <IndicatorMiniBar label="Momentum 10d" value={Math.max(0, p.indicatorSnapshot.momentum10d)} max={20} />
                                  <IndicatorMiniBar label="MA Crossover" value={Math.max(0, p.indicatorSnapshot.maCrossover)} max={25} />
                                  <IndicatorMiniBar label="ADX (14)"     value={p.indicatorSnapshot.adx} max={60} />
                                </div>
                              </div>

                              {/* Prediction details */}
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Prediction Details</p>
                                <div className="space-y-2.5">
                                  {[
                                    ['First Recommended', fmtDate(p.firstRecommendedDate)],
                                    ['Latest Recommended', fmtDate(p.latestRecommendedDate)],
                                    ['Recommendations', `${p.recommendationCount} time${p.recommendationCount !== 1 ? 's' : ''}`],
                                    ['Entry Price', fmtPrice(p.entryPrice)],
                                    ['Target Return', `+${p.targetReturn}%`],
                                    ['Model Version', p.modelVersion],
                                    ...(p.regime ? [['Market Regime', p.regime.replace('-', ' ')]] : []),
                                    ...(p.mcProbability != null ? [['MC Probability', `${(p.mcProbability * 100).toFixed(1)}%`]] : []),
                                    ...(p.backtestWinRate != null ? [['Backtest Win Rate', `${(p.backtestWinRate * 100).toFixed(1)}%`]] : []),
                                  ].map(([k, v]) => (
                                    <div key={k} className="flex justify-between items-center text-xs">
                                      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                                      <span className="font-semibold" style={{ color: 'var(--text-lo)' }}>{v}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Tracking + position */}
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Live Tracking</p>
                                {tracking ? (
                                  <div className="space-y-2.5">
                                    {[
                                      ['Current Price', fmtPrice(tracking.currentPrice)],
                                      ['Daily Change', fmtPct(tracking.dailyChange)],
                                      ['Total Return', fmtPct(tracking.totalReturn)],
                                      ['Trading Day', `Day ${tracking.dayNumber}`],
                                      ['Last Updated', fmtDate(tracking.lastTracked)],
                                    ].map(([k, v]) => (
                                      <div key={k} className="flex justify-between items-center text-xs">
                                        <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                                        <span className="font-semibold" style={{ color: 'var(--text-lo)' }}>{v}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No tracking data yet — click "Update Prices".</p>
                                )}
                                {openTrade && (
                                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-sm)' }}>
                                    <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Your Position</p>
                                    <div className="space-y-2">
                                      {[
                                        ['Bought', fmtDate(openTrade.buyDate)],
                                        ['Avg Buy Price', fmtPrice(openTrade.buyPrice)],
                                        ['Remaining Qty', String(openTrade.remainingQuantity)],
                                        ['Invested', fmtCompact(openTrade.totalInvested)],
                                        ['Unrealized P&L', `${fmtCompactPnl(openTrade.unrealizedPnL)} (${fmtPct(openTrade.unrealizedPnLPct)})`],
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

      {/* ══════════════════════════════════════════════════════════════════════
          6. DAILY PERFORMANCE HEATMAP
      ══════════════════════════════════════════════════════════════════════ */}
      <DailyTrackingTable />

      {/* ══════════════════════════════════════════════════════════════════════
          7. TRADE P&L ANALYTICS
      ══════════════════════════════════════════════════════════════════════ */}
      <PredictionTrades
        predictions={(data?.predictions ?? []).map(p => ({
          _id: p._id, stockSymbol: p.stockSymbol, stockName: p.stockName,
          entryPrice: p.entryPrice, status: p.status,
        }))}
        onBuySuccess={() => { bumpTrades(); fetchPredictions(filter); }}
        refreshKey={tradeRefreshKey}
      />

      {/* ══════════════════════════════════════════════════════════════════════
          8. MODEL WEIGHTS + HOW IT WORKS
      ══════════════════════════════════════════════════════════════════════ */}
      {data?.modelWeights && (
        <div className="card p-5">
          <h2 className="text-sm font-black mb-4 flex items-center gap-2" style={{ color: 'var(--text-hi)' }}>
            <svg className="w-4 h-4" style={{ color: '#a78bfa' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Model Weights — {data.modelVersion}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {Object.entries(data.modelWeights).map(([key, val]) => {
              const pct = (val as number) * 100;
              const labels: Record<string, string> = { rsi: 'RSI', macd: 'MACD', bbPosition: 'Bollinger', volumeRatio: 'Volume', momentum10d: 'Momentum', maCrossover: 'MA Cross', adx: 'ADX' };
              return (
                <div key={key} className="rounded-xl p-3" style={{ background: 'var(--bg-raised)' }}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-semibold" style={{ color: 'var(--text-lo)' }}>{labels[key] ?? key}</span>
                    <span className="text-[11px] font-black" style={{ color: '#a78bfa' }}>{pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-sunken)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct / 40 * 100)}%`, background: 'linear-gradient(90deg,#a78bfa,#818cf8)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4"
        style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
        {[
          { n: 1, c: 'var(--brand)', title: 'Score', body: '4-layer ensemble: technical indicators, advanced signals (Hurst, CMF, ATR), Monte Carlo GBM simulation, and walk-forward backtesting — combined via geometric mean.' },
          { n: 2, c: '#818cf8',      title: 'Filter', body: 'RSI 40–75, ADX > 20, ensemble score ≥ 0.55. Regime-adjusted weights (trending / mean-reverting / volatile / quiet). Top 3 daily.' },
          { n: 3, c: '#a78bfa',      title: 'Learn',  body: 'Bayesian recalibration updates both indicator weights and ensemble layer weights based on which signals correlated with actual outcomes.' },
        ].map(({ n, c, title, body }) => (
          <div key={n} className="flex gap-3 items-start">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white shrink-0" style={{ background: c }}>{n}</div>
            <p className="text-xs" style={{ color: 'var(--text-lo)' }}>
              <strong style={{ color: 'var(--text-hi)' }}>{title} — </strong>{body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
