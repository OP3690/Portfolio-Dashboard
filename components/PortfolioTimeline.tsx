'use client';

import { useMemo, useState } from 'react';

/* ─── types ─── */
interface Holding {
  stockName?: string;
  isin?: string;
  sectorName?: string;
  investmentAmount?: number;
  marketValue?: number;
  profitLossTillDate?: number;
  profitLossTillDatePercent?: number;
  holdingPeriodYears?: number;
  holdingPeriodMonths?: number;
}

interface Transaction {
  isin: string;
  transactionDate: Date | string;
  buySell: string;
  tradePriceAdjusted?: number;
  tradedQty?: number;
  tradeValueAdjusted?: number;
}

interface Props {
  holdings: Holding[];
  transactions: Transaction[];
}

/* ─── helpers ─── */
function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

function fmtFull(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtAmt(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
  if (a >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (a >= 1_000)       return `₹${(v / 1_000).toFixed(1)}k`;
  return `₹${v.toFixed(0)}`;
}

function holdLabel(days: number): string {
  if (days < 30)   return `${days}d`;
  if (days < 365)  return `${Math.round(days / 30)}m`;
  const y = Math.floor(days / 365);
  const m = Math.round((days % 365) / 30);
  return m > 0 ? `${y}y ${m}m` : `${y}y`;
}

/* ─── palette ─── */
function palette(pct: number, open: boolean) {
  if (open) {
    if (pct >= 30) return { bg: '#052e16', border: '#22c55e', text: '#4ade80',  badge: '#14532d', badgeText: '#4ade80'  };
    if (pct >= 0)  return { bg: '#0a1f10', border: '#4ade80', text: '#86efac',  badge: '#14532d', badgeText: '#86efac'  };
    if (pct >= -15)return { bg: '#2d0a0a', border: '#f87171', text: '#fca5a5',  badge: '#7f1d1d', badgeText: '#fca5a5'  };
    return              { bg: '#1a0505', border: '#ef4444', text: '#f87171',  badge: '#450a0a', badgeText: '#f87171'  };
  }
  // closed
  if (pct >= 30) return { bg: '#052e1699', border: '#22c55e88', text: '#4ade80',  badge: '#14532d', badgeText: '#4ade80'  };
  if (pct >= 0)  return { bg: '#0a1f1099', border: '#4ade8066', text: '#86efac',  badge: '#14532d', badgeText: '#86efac'  };
  if (pct >= -15)return { bg: '#2d0a0a99', border: '#f8717166', text: '#fca5a5',  badge: '#7f1d1d', badgeText: '#fca5a5'  };
  return              { bg: '#1a050599', border: '#ef444466', text: '#f87171',  badge: '#450a0a', badgeText: '#f87171'  };
}

/* ─── FIFO helpers ─── */
interface BuyLot { price: number; qty: number }

function calcSellPL(queue: BuyLot[], sellPrice: number, sellQty: number) {
  let rem = sellQty, cost = 0, qty = 0;
  const tmp = queue.map(b => ({ ...b }));
  while (rem > 0 && tmp.length) {
    const lot = tmp[0];
    const take = Math.min(lot.qty, rem);
    cost += take * lot.price; qty += take; rem -= take; lot.qty -= take;
    if (lot.qty <= 0) tmp.shift();
  }
  const avg = qty > 0 ? cost / qty : sellPrice;
  return { plPct: avg > 0 ? ((sellPrice - avg) / avg) * 100 : 0, plAmt: (sellPrice - avg) * sellQty, avgCost: avg };
}

function dequeue(queue: BuyLot[], qty: number) {
  let rem = qty;
  while (rem > 0 && queue.length) {
    const take = Math.min(queue[0].qty, rem);
    queue[0].qty -= take; rem -= take;
    if (queue[0].qty <= 0) queue.shift();
  }
}

/* ─── segment type ─── */
interface Segment {
  buyDate:   Date;
  sellDate:  Date | null;
  status:    'open' | 'closed';
  plPct:     number;
  plAmt:     number;
  avgBuy:    number;
  sellPrice: number;
  buyCount:  number;
  buyDates:  Date[];
  daysHeld:  number;
}

interface StockRow {
  name:     string;
  isin:     string;
  sector:   string;
  segments: Segment[];
}

/* ═══════════════════════════════════════════════
   MAIN
═══════════════════════════════════════════════ */
export default function PortfolioTimeline({ holdings, transactions }: Props) {
  const [sort,   setSort]   = useState<'recent' | 'name' | 'pl' | 'hold'>('recent');
  const [expand, setExpand] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);

  const holdingMap = useMemo(() => {
    const m = new Map<string, Holding>();
    holdings.forEach(h => { if (h.isin) m.set(h.isin, h); });
    return m;
  }, [holdings]);

  /* ── Build rows ── */
  const stockRows: StockRow[] = useMemo(() => {
    const txByIsin = new Map<string, Transaction[]>();
    transactions.forEach(t => {
      if (!t.isin) return;
      if (!txByIsin.has(t.isin)) txByIsin.set(t.isin, []);
      txByIsin.get(t.isin)!.push(t);
    });

    const rows: StockRow[] = [];

    txByIsin.forEach((txs, isin) => {
      const sorted = [...txs]
        .filter(t => t.transactionDate)
        .sort((a, b) => toDate(a.transactionDate).getTime() - toDate(b.transactionDate).getTime());

      const holding = holdingMap.get(isin);
      const name    = holding?.stockName || isin;
      const sector  = holding?.sectorName || '';

      const segments: Segment[] = [];
      const buyQueue: BuyLot[]  = [];
      let segBuyDates: Date[]   = [];
      let segBuyCount = 0;
      let segAvgSum   = 0;
      let segAvgQty   = 0;

      sorted.forEach(t => {
        const type   = (t.buySell || '').toUpperCase();
        const isBuy  = type.includes('BUY') || type === 'P';
        const isSell = type.includes('SELL') || type === 'S';
        if (!isBuy && !isSell) return;

        const date  = toDate(t.transactionDate);
        const price = t.tradePriceAdjusted || 0;
        const qty   = Math.abs(t.tradedQty || 1);

        if (isBuy) {
          buyQueue.push({ price, qty });
          segBuyDates.push(date);
          segBuyCount++;
          segAvgSum += price * qty;
          segAvgQty += qty;
        }

        if (isSell && segBuyDates.length > 0) {
          const { plPct, plAmt, avgCost } = calcSellPL(buyQueue, price, qty);
          dequeue(buyQueue, qty);

          if (buyQueue.length === 0) {
            const sellDate = date;
            segments.push({
              buyDate:   segBuyDates[0],
              sellDate,
              status:    'closed',
              plPct, plAmt,
              avgBuy:    avgCost,
              sellPrice: price,
              buyCount:  segBuyCount,
              buyDates:  [...segBuyDates],
              daysHeld:  Math.round((sellDate.getTime() - segBuyDates[0].getTime()) / 86400000),
            });
            segBuyDates = []; segBuyCount = 0; segAvgSum = 0; segAvgQty = 0;
          }
        }
      });

      // open segment
      if (segBuyDates.length > 0) {
        const h = holdingMap.get(isin);
        segments.push({
          buyDate:   segBuyDates[0],
          sellDate:  null,
          status:    'open',
          plPct:     h?.profitLossTillDatePercent ?? 0,
          plAmt:     h?.profitLossTillDate ?? 0,
          avgBuy:    segAvgQty > 0 ? segAvgSum / segAvgQty : 0,
          sellPrice: 0,
          buyCount:  segBuyCount,
          buyDates:  [...segBuyDates],
          daysHeld:  Math.round((today.getTime() - segBuyDates[0].getTime()) / 86400000),
        });
      }

      if (segments.length > 0) rows.push({ name, isin, sector, segments });
    });

    return rows;
  }, [transactions, holdingMap, today]);

  /* ── Sort ── */
  const sorted = useMemo(() => {
    const r = [...stockRows];
    if (sort === 'name')   return r.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'hold')   return r.sort((a, b) => {
      const aMax = Math.max(...a.segments.map(s => s.daysHeld));
      const bMax = Math.max(...b.segments.map(s => s.daysHeld));
      return bMax - aMax;
    });
    if (sort === 'pl')     return r.sort((a, b) => {
      const aOpen = a.segments.find(s => s.status === 'open')?.plPct ?? -9999;
      const bOpen = b.segments.find(s => s.status === 'open')?.plPct ?? -9999;
      return bOpen - aOpen;
    });
    // recent — last buy date
    return r.sort((a, b) => {
      const aLast = Math.max(...a.segments.map(s => s.buyDate.getTime()));
      const bLast = Math.max(...b.segments.map(s => s.buyDate.getTime()));
      return bLast - aLast;
    });
  }, [stockRows, sort]);

  /* ── Summary ── */
  const openCount    = stockRows.filter(r => r.segments.some(s => s.status === 'open')).length;
  const closedCount  = stockRows.reduce((s, r) => s + r.segments.filter(x => x.status === 'closed').length, 0);
  const winExits     = stockRows.reduce((s, r) => s + r.segments.filter(x => x.status === 'closed' && x.plPct > 0).length, 0);
  const reEntries    = stockRows.filter(r => r.segments.length > 1).length;
  const winRate      = closedCount > 0 ? Math.round((winExits / closedCount) * 100) : 0;

  if (!sorted.length) {
    return <div className="card p-6 text-center text-lo text-sm">No transaction data available.</div>;
  }

  return (
    <div className="card p-5 space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-hi">Trade Cycle Timeline</h3>
          <p className="text-xs text-lo mt-0.5">
            Buy → Hold → Exit per stock · Re-entries &amp; accumulations shown
          </p>
        </div>
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-card-alt)' }}>
          {([
            { k: 'recent', l: 'Recent'   },
            { k: 'pl',     l: 'Best P&L' },
            { k: 'hold',   l: 'Longest'  },
            { k: 'name',   l: 'A–Z'      },
          ] as const).map(({ k, l }) => (
            <button key={k} onClick={() => setSort(k)}
              className="text-xs px-3 py-1 rounded-md font-medium transition-all"
              style={{
                background: sort === k ? 'var(--brand)' : 'transparent',
                color:      sort === k ? '#fff' : 'var(--text-lo)',
              }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Open Positions', value: openCount,             color: '#4ade80', sub: 'currently holding'         },
          { label: 'Exited Trades',  value: closedCount,           color: 'var(--text-hi)', sub: `${winExits} profitable exits` },
          { label: 'Exit Win Rate',  value: `${winRate}%`,         color: winRate >= 50 ? '#4ade80' : '#f87171', sub: 'closed trades' },
          { label: 'Re-Entries',     value: reEntries,             color: '#38bdf8', sub: 'stocks bought again'       },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            <p className="text-xs text-lo mb-1">{s.label}</p>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-lo mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Rows ── */}
      <div className="space-y-2">
        {sorted.map(stock => {
          const isExpanded = expand === stock.isin;
          const openSeg    = stock.segments.find(s => s.status === 'open');

          return (
            <div key={stock.isin}
              className="rounded-xl overflow-hidden transition-all"
              style={{ border: '1px solid var(--border)', background: 'var(--bg-card-alt)' }}>

              {/* ── Stock header row ── */}
              <button
                className="w-full flex items-center justify-between px-4 py-3 gap-3 text-left"
                onClick={() => setExpand(isExpanded ? null : stock.isin)}>

                <div className="flex items-center gap-3 min-w-0">
                  {/* Expand chevron */}
                  <span className="text-lo transition-transform shrink-0"
                    style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: 12 }}>
                    ▶
                  </span>

                  {/* Name + sector */}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-hi truncate">{stock.name}</p>
                    {stock.sector && <p className="text-lo truncate" style={{ fontSize: 10 }}>{stock.sector}</p>}
                  </div>

                  {/* Cycle count badge */}
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'var(--bg-card)', color: 'var(--text-lo)', border: '1px solid var(--border)' }}>
                    {stock.segments.length} cycle{stock.segments.length > 1 ? 's' : ''}
                  </span>
                </div>

                {/* Mini cycle pills preview (collapsed) */}
                {!isExpanded && (
                  <div className="flex items-center gap-1.5 shrink-0 overflow-hidden">
                    {stock.segments.map((seg, si) => {
                      const pal  = palette(seg.plPct, seg.status === 'open');
                      const sign = seg.plPct >= 0 ? '+' : '';
                      return (
                        <div key={si} className="flex items-center gap-1">
                          {si > 0 && <span className="text-lo" style={{ fontSize: 10 }}>→</span>}
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                            style={{ background: pal.badge, color: pal.text, border: `1px solid ${pal.border}` }}>
                            {sign}{seg.plPct.toFixed(1)}%
                            {seg.status === 'open' && ' ●'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Current P&L if open (collapsed view) */}
                {!isExpanded && openSeg && (
                  <div className="shrink-0 text-right ml-2">
                    <p className="text-sm font-bold" style={{ color: openSeg.plPct >= 0 ? '#4ade80' : '#f87171' }}>
                      {openSeg.plPct >= 0 ? '+' : ''}{openSeg.plPct.toFixed(1)}%
                    </p>
                    <p className="text-xs text-lo">{fmtAmt(openSeg.plAmt)}</p>
                  </div>
                )}
              </button>

              {/* ── Expanded: full cycle cards ── */}
              {isExpanded && (
                <div className="px-4 pb-4">
                  <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
                    {stock.segments.map((seg, si) => {
                      const pal      = palette(seg.plPct, seg.status === 'open');
                      const sign     = seg.plPct >= 0 ? '+' : '';
                      const isOpen   = seg.status === 'open';
                      // width proportional to hold duration (min 140px)
                      const maxDays  = Math.max(...stock.segments.map(s => s.daysHeld), 1);
                      const flexVal  = Math.max(seg.daysHeld / maxDays, 0.3);

                      return (
                        <div key={si} className="flex items-center gap-0 shrink-0" style={{ flex: flexVal, minWidth: 150 }}>

                          {/* Arrow connector between cycles */}
                          {si > 0 && (
                            <div className="flex flex-col items-center shrink-0 px-3">
                              <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
                              <span style={{ fontSize: 16, color: 'var(--text-mid)', lineHeight: 1 }}>→</span>
                              <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
                            </div>
                          )}

                          {/* Cycle card */}
                          <div className="flex-1 rounded-xl overflow-hidden"
                            style={{ border: `1px solid ${pal.border}`, background: pal.bg }}>

                            {/* Top: BUY info */}
                            <div className="px-3 pt-3 pb-2" style={{ borderBottom: `1px solid ${pal.border}55` }}>
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                                <span className="text-xs font-bold" style={{ color: '#4ade80', letterSpacing: '0.05em' }}>BUY</span>
                                {seg.buyCount > 1 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                                    style={{ background: '#166534', color: '#bbf7d0', fontSize: 9 }}>
                                    ×{seg.buyCount} adds
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-bold mt-1" style={{ color: '#ffffff' }}>{fmtShort(seg.buyDate)}</p>
                              <p className="mt-0.5" style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>{fmtFull(seg.buyDate)}</p>
                              {seg.avgBuy > 0 && (
                                <p className="mt-0.5 font-medium" style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>
                                  Avg ₹{seg.avgBuy.toFixed(1)}
                                </p>
                              )}
                            </div>

                            {/* Middle: P&L */}
                            <div className="px-3 py-3 text-center">
                              <p className="font-bold leading-none" style={{ color: pal.text, fontSize: 24 }}>
                                {sign}{seg.plPct.toFixed(1)}%
                              </p>
                              <p className="font-semibold mt-1" style={{ color: pal.text, fontSize: 13 }}>
                                {seg.plAmt >= 0 ? '+' : ''}{fmtAmt(seg.plAmt)}
                              </p>
                              <p className="font-medium mt-1.5" style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
                                {holdLabel(seg.daysHeld)} held
                              </p>

                              {/* Duration bar */}
                              <div className="mt-2 rounded-full overflow-hidden" style={{ height: 3, background: 'rgba(255,255,255,0.12)' }}>
                                <div className="h-full rounded-full"
                                  style={{ width: `${Math.min((seg.daysHeld / Math.max(...stock.segments.map(s => s.daysHeld), 1)) * 100, 100)}%`, background: pal.border }} />
                              </div>
                            </div>

                            {/* Bottom: SELL or OPEN */}
                            <div className="px-3 pb-3 pt-2" style={{ borderTop: `1px solid ${pal.border}55` }}>
                              {isOpen ? (
                                <>
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full shrink-0 animate-pulse"
                                      style={{ background: pal.text }} />
                                    <span className="text-xs font-bold" style={{ color: pal.text, letterSpacing: '0.05em' }}>HOLDING</span>
                                  </div>
                                  <p className="font-medium mt-1" style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>
                                    Since {fmtShort(seg.buyDate)}
                                  </p>
                                  <p className="font-medium mt-0.5" style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>Open position</p>
                                </>
                              ) : (
                                <>
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full shrink-0"
                                      style={{ background: seg.plPct >= 0 ? '#22c55e' : '#ef4444' }} />
                                    <span className="text-xs font-bold"
                                      style={{ color: seg.plPct >= 0 ? '#4ade80' : '#f87171', letterSpacing: '0.05em' }}>
                                      SOLD {seg.plPct >= 0 ? '✓' : '✗'}
                                    </span>
                                  </div>
                                  <p className="font-bold mt-1" style={{ fontSize: 12, color: '#ffffff' }}>
                                    {seg.sellDate ? fmtShort(seg.sellDate) : '–'}
                                  </p>
                                  <p className="mt-0.5" style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>
                                    {seg.sellDate ? fmtFull(seg.sellDate) : '–'}
                                  </p>
                                  {seg.sellPrice > 0 && (
                                    <p className="font-medium mt-0.5" style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>
                                      @ ₹{seg.sellPrice.toFixed(1)}
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-4 text-xs text-lo pt-1">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          BUY entry
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          SOLD (profit)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          SOLD (loss)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          HOLDING now
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-lo">→</span>
          Re-entry after exit
        </span>
      </div>
    </div>
  );
}
