'use client';

import { useState, useEffect, useRef } from 'react';

/* ─── Types ──────────────────────────────────────────────────────────────── */
type PredictionStatus = 'Active' | 'Achieved' | 'OverAchieved' | 'MissedSlightly' | 'Missed' | 'Expired';

interface DailyCell {
  dailyChange:  number;
  totalReturn:  number;
  closingPrice: number;
  dayNumber:    number;
  synthetic:    boolean; // true = Day-0 entry
}

interface PredictionRow {
  _id:                  string;
  stockSymbol:          string;
  stockName:            string;
  firstRecommendedDate: string;
  entryPrice:           number;
  recommendationCount:  number;
  targetReturn:         number;
  status:               PredictionStatus;
  currentReturn:        number;
  confidenceScore:      number;
  regime:               string | null;
  mcProbability:        number | null;
  backtestWinRate:      number | null;
  dailyMap:             Record<string, DailyCell>;
}

interface TrackingHistoryResponse {
  success:      boolean;
  predictions:  PredictionRow[];
  tradingDates: string[];   // YYYY-MM-DD array, ordered ascending
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const STATUS_META: Record<PredictionStatus, { label: string; color: string; bg: string }> = {
  Active:         { label: 'Active',        color: '#38bdf8', bg: 'rgba(56,189,248,0.12)'  },
  Achieved:       { label: 'Achieved',      color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
  OverAchieved:   { label: 'Over-achieved', color: '#a78bfa', bg: 'rgba(167,139,250,0.14)' },
  MissedSlightly: { label: 'Slight miss',   color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
  Missed:         { label: 'Missed',        color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  Expired:        { label: 'Expired',       color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
};

function fmtShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function fmtDayOfWeek(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' });
}

function fmtPrice(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function fmtPct(n: number, sign = true): string {
  return `${sign && n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

/** Cell background colour based on daily % change */
function cellBg(pct: number, synthetic: boolean): string {
  if (synthetic) return 'transparent';           // Day-0: no colour
  if (Math.abs(pct) < 0.05) return 'transparent'; // near-zero: neutral
  if (pct > 0) {
    if (pct >= 3)   return 'rgba(52,211,153,0.28)';
    if (pct >= 1.5) return 'rgba(52,211,153,0.16)';
    return             'rgba(52,211,153,0.09)';
  }
  if (pct <= -3)   return 'rgba(248,113,113,0.28)';
  if (pct <= -1.5) return 'rgba(248,113,113,0.16)';
  return               'rgba(248,113,113,0.09)';
}

function cellColor(pct: number, synthetic: boolean): string {
  if (synthetic) return 'var(--text-muted)';
  if (pct > 0)   return '#34d399';
  if (pct < 0)   return '#f87171';
  return               'var(--text-lo)';
}

/* ─── Sparkline mini ─────────────────────────────────────────────────────── */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 64, H = 20, pad = 2;
  const min  = Math.min(...values);
  const max  = Math.max(...values);
  const rng  = max - min || 1;
  const pts  = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (W - pad * 2),
    H - pad - ((v - min) / rng) * (H - pad * 2),
  ]);
  const d    = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  const color = last >= 0 ? '#34d399' : '#f87171';
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ─── Legend chip ────────────────────────────────────────────────────────── */
function LegendChip({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold"
      style={{ background: bg, color }}>
      {label}
    </span>
  );
}

/* ─── Status badge ───────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: PredictionStatus }) {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold whitespace-nowrap"
      style={{ background: m.bg, color: m.color }}>
      <span className="w-1 h-1 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════════*/
export default function DailyTrackingTable() {
  const [data,    setData]    = useState<TrackingHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/ai-tracking-history?status=${filter}`);
        const d   = await res.json();
        if (d.success) setData(d);
      } catch {}
      finally { setLoading(false); }
    })();
  }, [filter]);

  if (loading) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="skeleton h-5 w-48 rounded" />
          <div className="skeleton h-5 w-24 rounded" />
        </div>
        <div className="overflow-x-auto">
          <div className="space-y-2">
            {[0,1,2].map(i => <div key={i} className="skeleton h-10 rounded animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.predictions.length === 0) {
    return (
      <div className="card p-8 text-center">
        <div className="w-11 h-11 rounded-xl mx-auto mb-3 flex items-center justify-center"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
          <svg className="w-5 h-5" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-hi)' }}>No tracking data yet</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Run Predictions then click Update Tracking to populate daily data.
        </p>
      </div>
    );
  }

  const { predictions, tradingDates } = data;

  // Only show dates that have at least one data point across all predictions
  const activeDates = tradingDates.filter(dateStr =>
    predictions.some(p => p.dailyMap[dateStr])
  );

  const STICKY_W = 300; // px width of the frozen left section

  return (
    <div className="card overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 pt-4 pb-3"
        style={{ borderBottom: '1px solid var(--border-sm)' }}>
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text-hi)' }}>
            <svg className="w-4 h-4" style={{ color: 'var(--brand)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Daily Performance Tracker
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {predictions.length} prediction{predictions.length !== 1 ? 's' : ''} · {activeDates.length} trading days · hover any cell for detail
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-1.5">
          <LegendChip color="#34d399" bg="rgba(52,211,153,0.18)"  label="≥+3%"  />
          <LegendChip color="#34d399" bg="rgba(52,211,153,0.10)"  label="+1.5–3%"/>
          <LegendChip color="#34d399" bg="rgba(52,211,153,0.06)"  label="0–1.5%" />
          <LegendChip color="#f87171" bg="rgba(248,113,113,0.06)" label="0–−1.5%"/>
          <LegendChip color="#f87171" bg="rgba(248,113,113,0.10)" label="−1.5–3%"/>
          <LegendChip color="#f87171" bg="rgba(248,113,113,0.18)" label="≤−3%"  />
        </div>
      </div>

      {/* ── Filter pills ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto"
        style={{ borderBottom: '1px solid var(--border-sm)' }}>
        {['all','Active','Achieved','OverAchieved','MissedSlightly','Missed','Expired'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all"
            style={filter === f
              ? { background: 'var(--brand)', color: '#fff', boxShadow: '0 2px 6px var(--brand-glow)' }
              : { color: 'var(--text-lo)', background: 'transparent' }}>
            {f === 'all' ? 'All' : f === 'OverAchieved' ? 'Over-achieved' : f === 'MissedSlightly' ? 'Slight miss' : f}
          </button>
        ))}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div ref={tableRef} className="overflow-x-auto" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: STICKY_W + activeDates.length * 72 + 200 }}>

          {/* ── HEADER ROW ─────────────────────────────────────────────── */}
          <thead>
            <tr>
              {/* ── Sticky: Stock ── */}
              <th rowSpan={2} style={{
                ...stickyLeft(0), ...thStyle,
                minWidth: 160, width: 160,
                borderRight: '2px solid var(--border-md)',
                zIndex: 5,
              }}>
                Stock
              </th>
              {/* ── Sticky: First Rec ── */}
              <th rowSpan={2} style={{ ...stickyLeft(160), ...thStyle, minWidth: 82, width: 82 }}>
                First Rec
              </th>
              {/* ── Sticky: Entry ── */}
              <th rowSpan={2} style={{ ...stickyLeft(242), ...thStyle, minWidth: 82, width: 82, borderRight: '2px solid var(--border-md)' }}>
                Entry
              </th>

              {/* ── Recs ── */}
              <th rowSpan={2} style={{ ...thStyle, minWidth: 50, textAlign: 'center' }}>Recs</th>
              <th rowSpan={2} style={{ ...thStyle, minWidth: 56, textAlign: 'center' }}>Target</th>

              {/* ── Date columns group header ── */}
              {activeDates.length > 0 && (
                <th
                  colSpan={activeDates.length}
                  style={{
                    ...thStyle,
                    textAlign: 'center',
                    borderBottom: '1px solid var(--border-sm)',
                    background: 'var(--bg-raised)',
                    letterSpacing: '0.06em',
                    color: 'var(--brand)',
                  }}
                >
                  Daily % Change  (from previous trading day)
                </th>
              )}

              {/* ── Sparkline + Return + Status ── */}
              <th rowSpan={2} style={{ ...thStyle, minWidth: 70, textAlign: 'center' }}>Trend</th>
              <th rowSpan={2} style={{ ...thStyle, minWidth: 90, textAlign: 'right' }}>Total Return</th>
              <th rowSpan={2} style={{ ...thStyle, minWidth: 110 }}>Status</th>
            </tr>

            {/* ── Date sub-headers ── */}
            <tr>
              {activeDates.map(dateStr => (
                <th key={dateStr} style={{
                  ...thStyle,
                  minWidth: 68, width: 68,
                  textAlign: 'center',
                  padding: '4px 2px',
                  borderLeft: '1px solid var(--border-sm)',
                }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>
                    {fmtDayOfWeek(dateStr)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-lo)', fontWeight: 800 }}>
                    {fmtShortDate(dateStr)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* ── BODY ───────────────────────────────────────────────────── */}
          <tbody>
            {predictions.map((row, rowIdx) => {
              const recDateStr = new Date(row.firstRecommendedDate).toISOString().slice(0, 10);
              const isEven     = rowIdx % 2 === 0;

              // Build cumulative total-return series for sparkline
              const sparkValues = activeDates
                .filter(d => d >= recDateStr && row.dailyMap[d])
                .map(d => row.dailyMap[d].totalReturn);

              return (
                <tr key={row._id}
                  style={{ background: isEven ? 'transparent' : 'color-mix(in srgb,var(--bg-raised) 40%,transparent)', borderBottom: '1px solid var(--border-sm)' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--brand-bg)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = isEven ? 'transparent' : 'color-mix(in srgb,var(--bg-raised) 40%,transparent)'}
                >
                  {/* Stock */}
                  <td style={{ ...stickyLeft(0), ...tdStyle, borderRight: '2px solid var(--border-md)', background: 'var(--bg-surface)' }}>
                    <div className="flex items-center gap-2">
                      <div className="w-0.5 h-7 rounded-full shrink-0" style={{ background: STATUS_META[row.status].color }} />
                      <div>
                        <p className="text-xs font-black" style={{ color: 'var(--text-hi)' }}>{row.stockSymbol}</p>
                        <p className="text-[9px] truncate max-w-[120px]" style={{ color: 'var(--text-muted)' }}>{row.stockName}</p>
                      </div>
                    </div>
                  </td>

                  {/* First Rec */}
                  <td style={{ ...stickyLeft(160), ...tdStyle, background: 'var(--bg-surface)' }}>
                    <span className="text-[11px]" style={{ color: 'var(--text-lo)' }}>
                      {fmtShortDate(new Date(row.firstRecommendedDate).toISOString().slice(0, 10))}
                    </span>
                  </td>

                  {/* Entry Price */}
                  <td style={{ ...stickyLeft(242), ...tdStyle, borderRight: '2px solid var(--border-md)', background: 'var(--bg-surface)' }}>
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--text-lo)' }}>
                      {fmtPrice(row.entryPrice)}
                    </span>
                  </td>

                  {/* Recs */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-black"
                      style={{
                        background: row.recommendationCount > 1 ? 'var(--brand-bg)' : 'var(--bg-raised)',
                        color: row.recommendationCount > 1 ? 'var(--brand)' : 'var(--text-muted)',
                      }}>
                      {row.recommendationCount}
                    </span>
                  </td>

                  {/* Target */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span className="text-[11px] font-bold" style={{ color: '#34d399' }}>
                      +{row.targetReturn}%
                    </span>
                  </td>

                  {/* ── Date cells ─────────────────────────────────────── */}
                  {activeDates.map(dateStr => {
                    const cell = row.dailyMap[dateStr];
                    // Before recommendation: greyed dash
                    if (dateStr < recDateStr) {
                      return (
                        <td key={dateStr} style={{ ...tdStyle, textAlign: 'center', borderLeft: '1px solid var(--border-sm)' }}>
                          <span style={{ color: 'var(--border-md)', fontSize: 11 }}>—</span>
                        </td>
                      );
                    }
                    // No data (holiday / not tracked yet)
                    if (!cell) {
                      return (
                        <td key={dateStr} style={{ ...tdStyle, textAlign: 'center', borderLeft: '1px solid var(--border-sm)' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>·</span>
                        </td>
                      );
                    }
                    // Day-0 entry (recommendation date)
                    if (cell.synthetic) {
                      return (
                        <td key={dateStr} style={{ ...tdStyle, textAlign: 'center', borderLeft: '1px solid var(--border-sm)' }}>
                          <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>0%</span>
                        </td>
                      );
                    }
                    // Normal tracking cell
                    const dc = cell.dailyChange;
                    return (
                      <td key={dateStr}
                        style={{
                          ...tdStyle,
                          textAlign:   'center',
                          borderLeft:  '1px solid var(--border-sm)',
                          background:  cellBg(dc, false),
                          cursor:      'default',
                          position:    'relative',
                        }}
                        title={`${row.stockSymbol} · ${fmtShortDate(dateStr)}\nDaily: ${fmtPct(dc)}\nTotal: ${fmtPct(cell.totalReturn)}\nClose: ${fmtPrice(cell.closingPrice)}`}
                      >
                        <span className="text-[11px] font-bold" style={{ color: cellColor(dc, false) }}>
                          {fmtPct(dc)}
                        </span>
                      </td>
                    );
                  })}

                  {/* Sparkline */}
                  <td style={{ ...tdStyle, textAlign: 'center', padding: '4px 8px' }}>
                    <Sparkline values={sparkValues} />
                  </td>

                  {/* Total Return */}
                  <td style={{ ...tdStyle, textAlign: 'right', paddingRight: 10 }}>
                    <span
                      className="inline-block px-2 py-0.5 rounded-lg text-xs font-black"
                      style={{
                        background: row.currentReturn > 0 ? 'rgba(52,211,153,0.12)'
                                  : row.currentReturn < 0 ? 'rgba(248,113,113,0.12)'
                                  : 'var(--bg-raised)',
                        color: row.currentReturn > 0 ? '#34d399'
                             : row.currentReturn < 0 ? '#f87171'
                             : 'var(--text-lo)',
                      }}
                    >
                      {fmtPct(row.currentReturn)}
                    </span>
                  </td>

                  {/* Status */}
                  <td style={{ ...tdStyle, paddingLeft: 8 }}>
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2"
        style={{ borderTop: '1px solid var(--border-sm)' }}>
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          Predictions auto-archive after 45 trading days · Daily cells = % change from previous close · Hover for price detail
        </p>
        <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <span>·&nbsp;&nbsp;Trading days only (Mon–Fri)</span>
          <span>·&nbsp;&nbsp;{activeDates.length} days shown</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Shared styles ──────────────────────────────────────────────────────── */
const thStyle: React.CSSProperties = {
  padding:       '8px 6px',
  fontSize:      10,
  fontWeight:    700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color:         'var(--text-muted)',
  background:    'var(--bg-raised)',
  position:      'sticky',
  top:           0,
  zIndex:        3,
  borderBottom:  '1px solid var(--border-md)',
  whiteSpace:    'nowrap',
  userSelect:    'none',
};

const tdStyle: React.CSSProperties = {
  padding:     '7px 6px',
  fontSize:    11,
  whiteSpace:  'nowrap',
  verticalAlign: 'middle',
};

function stickyLeft(left: number): React.CSSProperties {
  return { position: 'sticky', left, zIndex: 2, background: 'var(--bg-surface)' };
}
