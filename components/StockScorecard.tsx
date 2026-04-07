'use client';

import { useMemo, useState } from 'react';
import { formatCurrency } from '@/lib/utils';

/* ─── Types ─────────────────────────────────────────────── */
interface Holding {
  stockName: string;
  isin?: string;
  marketValue: number;
  investmentAmount: number;
  profitLossTillDate: number;
  profitLossTillDatePercent: number;
  sectorName?: string;
  xirr?: number;
  cagr?: number;
  holdingPeriodYears?: number;
  holdingPeriodMonths?: number;
}
interface Transaction {
  isin?: string;
  stockName?: string;
  buySell: string;
  tradeValueAdjusted?: number;
  transactionDate: Date | string;
}
interface Props {
  holdings: Holding[];
  transactions: Transaction[];
}

/* ─── Score helpers ─────────────────────────────────────── */
function scoreReturn(pct: number): number {
  if (pct >= 50)  return 35;
  if (pct >= 30)  return 32;
  if (pct >= 20)  return 28;
  if (pct >= 10)  return 23;
  if (pct >= 5)   return 18;
  if (pct >= 0)   return 13;
  if (pct >= -5)  return 8;
  if (pct >= -15) return 4;
  return 0;
}
function scoreXIRR(x: number): number {
  if (x >= 35)  return 28;
  if (x >= 25)  return 25;
  if (x >= 18)  return 22;
  if (x >= 12)  return 17;
  if (x >= 8)   return 12;
  if (x >= 0)   return 6;
  if (x >= -10) return 2;
  return 0;
}
function scoreHolding(months: number): number {
  if (months >= 36) return 15;
  if (months >= 24) return 13;
  if (months >= 12) return 10;
  if (months >= 6)  return 7;
  if (months >= 3)  return 4;
  return 2;
}
function scoreDividend(amount: number, invested: number): number {
  if (!invested || !amount) return 0;
  const yield_ = (amount / invested) * 100;
  if (yield_ >= 4)  return 12;
  if (yield_ >= 2)  return 9;
  if (yield_ >= 1)  return 6;
  if (amount > 0)   return 3;
  return 0;
}
function scoreWeight(weight: number, ret: number): number {
  // High weight + high return = 10, high weight + loss = 2, hidden gem = 7
  if (weight >= 8  && ret >= 10) return 10;
  if (weight >= 5  && ret >= 5)  return 8;
  if (weight < 5   && ret >= 15) return 7;   // hidden gem
  if (weight >= 8  && ret < 0)   return 2;
  if (weight >= 5  && ret < 0)   return 3;
  return 5;
}

function compositeScore(ret: number, xirr: number, holdM: number, divAmt: number, invested: number, weight: number): number {
  return Math.round(
    scoreReturn(ret) +
    scoreXIRR(xirr) +
    scoreHolding(holdM) +
    scoreDividend(divAmt, invested) +
    scoreWeight(weight, ret)
  );
}

/* Action badge config */
function action(score: number, ret: number): { label: string; color: string; bg: string; emoji: string } {
  if (score >= 78 || (ret >= 30 && score >= 65))
    return { label: 'Star',   emoji: '🌟', color: '#10b981', bg: 'rgba(16,185,129,0.13)'  };
  if (score >= 62)
    return { label: 'Hold',   emoji: '✅', color: '#4ade80', bg: 'rgba(74,222,128,0.10)'   };
  if (score >= 48)
    return { label: 'Watch',  emoji: '👀', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'   };
  if (score >= 35)
    return { label: 'Review', emoji: '⚠️', color: '#fb923c', bg: 'rgba(251,146,60,0.12)'   };
  return     { label: 'Exit',   emoji: '🔴', color: '#f43f5e', bg: 'rgba(244,63,94,0.11)'   };
}

function scoreColor(s: number): string {
  if (s >= 78) return '#10b981';
  if (s >= 62) return '#4ade80';
  if (s >= 48) return '#fbbf24';
  if (s >= 35) return '#fb923c';
  return '#f43f5e';
}

function abbrev(name: string, max = 20): string {
  const s = name.replace(/\s+(LIMITED|LTD\.?|INDUSTRIES|ENTERPRISES|CORP\.?|INC\.?|PVT\.?|PRIVATE)\.?\s*$/i, '').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
function holdStr(m: number): string {
  if (!m) return '< 1m';
  return m >= 12 ? `${Math.floor(m / 12)}y ${m % 12}m` : `${m}m`;
}

type SortKey = 'score' | 'ret' | 'xirr' | 'weight' | 'holdM' | 'div' | 'plAbs';
type SortDir = 'asc' | 'desc';
type ActionFilter = 'all' | 'Star' | 'Hold' | 'Watch' | 'Review' | 'Exit';

/* ─── Component ─────────────────────────────────────────── */
export default function StockScorecard({ holdings, transactions }: Props) {
  const [sortKey, setSortKey]       = useState<SortKey>('score');
  const [sortDir, setSortDir]       = useState<SortDir>('desc');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [search, setSearch]         = useState('');

  /* Per-stock dividend totals from transactions */
  const divByIsin = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach(t => {
      if (!t.isin) return;
      const u = (t.buySell || '').toUpperCase();
      if (u.includes('DIVIDEND') || u === 'DIV') {
        map.set(t.isin, (map.get(t.isin) || 0) + Math.abs(t.tradeValueAdjusted || 0));
      }
    });
    return map;
  }, [transactions]);

  /* Build scored rows */
  const rows = useMemo(() => {
    const totalMV = holdings.reduce((s, h) => s + (h.marketValue || 0), 0);
    return holdings.map(h => {
      const ret    = h.profitLossTillDatePercent ?? 0;
      const xirr   = h.xirr ?? 0;
      const holdM  = (h.holdingPeriodYears ?? 0) * 12 + (h.holdingPeriodMonths ?? 0);
      const weight = totalMV > 0 ? (h.marketValue / totalMV) * 100 : 0;
      const div    = divByIsin.get(h.isin || '') ?? 0;
      const inv    = h.investmentAmount ?? (h.marketValue - h.profitLossTillDate);
      const score  = compositeScore(ret, xirr, holdM, div, inv, weight);
      const act    = action(score, ret);
      return { ...h, ret, xirr, holdM, weight, div, inv, score, act, plAbs: h.profitLossTillDate ?? 0 };
    });
  }, [holdings, divByIsin]);

  /* Summary counts */
  const summary = useMemo(() => {
    const counts: Record<string, number> = { Star: 0, Hold: 0, Watch: 0, Review: 0, Exit: 0 };
    rows.forEach(r => counts[r.act.label]++);
    return counts;
  }, [rows]);

  /* Filter + sort */
  const displayed = useMemo(() => {
    let list = rows;
    if (actionFilter !== 'all') list = list.filter(r => r.act.label === actionFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.stockName.toLowerCase().includes(q) || (r.sectorName || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const av = a[sortKey as keyof typeof a] as number;
      const bv = b[sortKey as keyof typeof b] as number;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  }, [rows, sortKey, sortDir, actionFilter, search]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(k); setSortDir('desc'); }
  }

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className="ml-0.5 opacity-60 text-[9px]">
      {sortKey === k ? (sortDir === 'desc' ? '▼' : '▲') : '⇅'}
    </span>
  );

  if (!rows.length) return null;

  const actions: ActionFilter[] = ['all', 'Star', 'Hold', 'Watch', 'Review', 'Exit'];
  const actionEmoji: Record<string, string> = { Star: '🌟', Hold: '✅', Watch: '👀', Review: '⚠️', Exit: '🔴' };
  const actionColor: Record<string, string> = { Star: '#10b981', Hold: '#4ade80', Watch: '#fbbf24', Review: '#fb923c', Exit: '#f43f5e' };

  return (
    <div className="card animate-fadeIn overflow-hidden">

      {/* ── Header ── */}
      <div className="px-6 pt-5 pb-4"
        style={{ borderBottom: '1px solid var(--border-sm)', background: 'linear-gradient(135deg,rgba(99,102,241,0.05) 0%,rgba(251,191,36,0.03) 100%)' }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-1 h-6 rounded-full flex-shrink-0"
                style={{ background: 'linear-gradient(180deg,#818cf8 0%,#fbbf24 100%)' }} />
              <h2 className="text-[15px] font-black tracking-tight" style={{ color: 'var(--text-hi)' }}>
                Stock Intelligence Scorecard
              </h2>
              <span className="hidden sm:inline text-[10px] font-bold px-2 py-0.5 rounded-full border"
                style={{ background: 'rgba(251,191,36,0.12)', borderColor: 'rgba(251,191,36,0.3)', color: '#fbbf24' }}>
                AI-Scored
              </span>
            </div>
            <p className="text-[11px] ml-3.5" style={{ color: 'var(--text-lo)' }}>
              Composite score (0–100) from XIRR · Return · Holding period · Dividends · Portfolio weight
            </p>
          </div>
          {/* Search */}
          <input
            type="text" placeholder="Search stock or sector…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-[12px] outline-none w-48"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)', color: 'var(--text-hi)' }}
          />
        </div>
      </div>

      <div className="px-6 pt-4 pb-6">

        {/* ── Action filter + summary pills ── */}
        <div className="flex flex-wrap gap-2 mb-5">
          {actions.map(a => {
            const isAll = a === 'all';
            const count = isAll ? rows.length : summary[a];
            const color = isAll ? 'var(--brand)' : actionColor[a];
            const active = actionFilter === a;
            return (
              <button key={a} onClick={() => setActionFilter(a)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all"
                style={{
                  background: active ? `${color}18` : 'var(--bg-raised)',
                  border:     `1px solid ${active ? color : 'var(--border-sm)'}`,
                  color:      active ? color : 'var(--text-lo)',
                }}>
                {!isAll && <span>{actionEmoji[a]}</span>}
                {isAll ? 'All Stocks' : a}
                <span className="font-black">{count}</span>
              </button>
            );
          })}
        </div>

        {/* ── Score guide ── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
          {[
            { label: '🌟 Star',   range: '78–100', color: '#10b981', tip: 'Exceptional — keep & consider adding' },
            { label: '✅ Hold',   range: '62–77',  color: '#4ade80', tip: 'Solid performer — maintain position' },
            { label: '👀 Watch',  range: '48–61',  color: '#fbbf24', tip: 'Average — track closely' },
            { label: '⚠️ Review', range: '35–47',  color: '#fb923c', tip: 'Underperforming — evaluate exit' },
            { label: '🔴 Exit',   range: '0–34',   color: '#f43f5e', tip: 'Drag on portfolio — consider selling' },
          ].map(({ label, range, color, tip }) => (
            <div key={label} className="rounded-xl px-3 py-2.5"
              style={{ background: `${color}0e`, border: `1px solid ${color}28` }}>
              <p className="text-[11px] font-bold" style={{ color }}>{label}</p>
              <p className="text-[10px] font-black mb-0.5" style={{ color }}>{range}</p>
              <p className="text-[9px] leading-snug" style={{ color: 'var(--text-lo)' }}>{tip}</p>
            </div>
          ))}
        </div>

        {/* ── Table ── */}
        <div className="overflow-x-auto rounded-2xl" style={{ border: '1px solid var(--border-sm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
            <thead>
              <tr style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-sm)' }}>
                {[
                  { label: '#',        k: null,       w: 36  },
                  { label: 'Stock',    k: null,       w: 180 },
                  { label: 'Score',    k: 'score',    w: 120 },
                  { label: 'Action',   k: null,       w: 80  },
                  { label: 'Return',   k: 'ret',      w: 80  },
                  { label: 'XIRR',     k: 'xirr',     w: 72  },
                  { label: 'Held',     k: 'holdM',    w: 68  },
                  { label: 'Weight',   k: 'weight',   w: 68  },
                  { label: 'P&L ₹',    k: 'plAbs',    w: 90  },
                  { label: 'Dividend', k: 'div',      w: 84  },
                ].map(({ label, k, w }) => (
                  <th key={label}
                    className="text-left"
                    style={{ width: w, padding: '10px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-lo)', cursor: k ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap' }}
                    onClick={() => k && toggleSort(k as SortKey)}>
                    {label}{k && <SortIcon k={k as SortKey} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((row, i) => {
                const isPos = row.ret >= 0;
                const sc    = row.score;
                return (
                  <tr key={row.stockName}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid var(--border-sm)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-raised)')}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)')}>

                    {/* Rank */}
                    <td style={{ padding: '10px 12px', fontSize: 11, fontWeight: 800, color: 'var(--text-lo)', textAlign: 'center' }}>
                      {i + 1}
                    </td>

                    {/* Stock */}
                    <td style={{ padding: '10px 12px' }}>
                      <p className="text-[12px] font-bold leading-tight" style={{ color: 'var(--text-hi)' }}>
                        {abbrev(row.stockName)}
                      </p>
                      {row.sectorName && (
                        <p className="text-[9px] mt-0.5 font-medium" style={{ color: 'var(--text-lo)' }}>
                          {row.sectorName}
                        </p>
                      )}
                    </td>

                    {/* Score bar */}
                    <td style={{ padding: '10px 12px' }}>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-black w-7 text-right flex-shrink-0"
                          style={{ color: scoreColor(sc) }}>{sc}</span>
                        <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: 'var(--bg-raised)' }}>
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${sc}%`, background: scoreColor(sc), opacity: 0.85 }} />
                        </div>
                      </div>
                    </td>

                    {/* Action badge */}
                    <td style={{ padding: '10px 12px' }}>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                        style={{ background: row.act.bg, color: row.act.color }}>
                        {row.act.emoji} {row.act.label}
                      </span>
                    </td>

                    {/* Return % */}
                    <td style={{ padding: '10px 12px' }}>
                      <span className="text-[12px] font-bold"
                        style={{ color: isPos ? 'var(--gain)' : 'var(--loss)' }}>
                        {isPos ? '+' : ''}{row.ret.toFixed(1)}%
                      </span>
                    </td>

                    {/* XIRR */}
                    <td style={{ padding: '10px 12px' }}>
                      <span className="text-[12px] font-semibold"
                        style={{ color: row.xirr >= 12 ? 'var(--gain)' : row.xirr >= 0 ? 'var(--warn)' : 'var(--loss)' }}>
                        {row.xirr ? `${row.xirr >= 0 ? '+' : ''}${row.xirr.toFixed(1)}%` : '—'}
                      </span>
                    </td>

                    {/* Holding period */}
                    <td style={{ padding: '10px 12px' }}>
                      <span className="text-[11px]" style={{ color: 'var(--text-hi)' }}>
                        {holdStr(row.holdM)}
                      </span>
                    </td>

                    {/* Portfolio weight */}
                    <td style={{ padding: '10px 12px' }}>
                      <span className="text-[11px] font-semibold" style={{ color: 'var(--text-hi)' }}>
                        {row.weight.toFixed(1)}%
                      </span>
                    </td>

                    {/* P&L ₹ */}
                    <td style={{ padding: '10px 12px' }}>
                      <span className="text-[11px] font-semibold"
                        style={{ color: row.plAbs >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                        {row.plAbs >= 0 ? '+' : ''}{formatCurrency(row.plAbs)}
                      </span>
                    </td>

                    {/* Dividend */}
                    <td style={{ padding: '10px 12px' }}>
                      <span className="text-[11px]" style={{ color: row.div > 0 ? '#fbbf24' : 'var(--text-lo)' }}>
                        {row.div > 0 ? formatCurrency(row.div) : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Footer totals */}
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border-md)', background: 'var(--bg-raised)' }}>
                <td colSpan={2} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 800, color: 'var(--text-lo)' }}>
                  {displayed.length} stocks
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span className="text-[11px] font-bold" style={{ color: 'var(--text-lo)' }}>
                    Avg: {displayed.length ? Math.round(displayed.reduce((s,r) => s + r.score, 0) / displayed.length) : '—'}
                  </span>
                </td>
                <td />
                <td style={{ padding: '10px 12px' }}>
                  <span className="text-[11px] font-bold" style={{ color: 'var(--text-lo)' }}>
                    {displayed.length ? `${(displayed.reduce((s,r) => s + r.ret, 0) / displayed.length).toFixed(1)}%` : '—'} avg
                  </span>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span className="text-[11px] font-bold" style={{ color: 'var(--text-lo)' }}>
                    {(() => {
                      const v = displayed.filter(r => r.xirr).map(r => r.xirr);
                      return v.length ? `${(v.reduce((s,x) => s+x, 0) / v.length).toFixed(1)}%` : '—';
                    })()} avg
                  </span>
                </td>
                <td colSpan={2} />
                <td style={{ padding: '10px 12px' }}>
                  <span className="text-[11px] font-bold" style={{ color: displayed.reduce((s,r) => s + r.plAbs, 0) >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                    {formatCurrency(displayed.reduce((s,r) => s + r.plAbs, 0))}
                  </span>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span className="text-[11px] font-bold" style={{ color: '#fbbf24' }}>
                    {formatCurrency(displayed.reduce((s,r) => s + r.div, 0))}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Insight callout ── */}
        {(summary['Exit'] > 0 || summary['Star'] > 0) && (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {summary['Star'] > 0 && (
              <div className="rounded-2xl px-4 py-3 flex items-start gap-3"
                style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
                  style={{ background: 'rgba(16,185,129,0.15)' }}>🌟</div>
                <div>
                  <p className="text-[12px] font-bold mb-0.5" style={{ color: '#10b981' }}>
                    {summary['Star']} Star Performer{summary['Star'] > 1 ? 's' : ''}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-lo)' }}>
                    {rows.filter(r => r.act.label === 'Star').slice(0,3).map(r => abbrev(r.stockName, 14)).join(', ')} — exceptional XIRR and returns. Consider adding to these positions.
                  </p>
                </div>
              </div>
            )}
            {summary['Exit'] > 0 && (
              <div className="rounded-2xl px-4 py-3 flex items-start gap-3"
                style={{ background: 'rgba(244,63,94,0.07)', border: '1px solid rgba(244,63,94,0.2)' }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
                  style={{ background: 'rgba(244,63,94,0.15)' }}>🔴</div>
                <div>
                  <p className="text-[12px] font-bold mb-0.5" style={{ color: '#f43f5e' }}>
                    {summary['Exit']} Exit Candidate{summary['Exit'] > 1 ? 's' : ''}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-lo)' }}>
                    {rows.filter(r => r.act.label === 'Exit').slice(0,3).map(r => abbrev(r.stockName, 14)).join(', ')} — dragging portfolio returns. Review and consider exiting.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
