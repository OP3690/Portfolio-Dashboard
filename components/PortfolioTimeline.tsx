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

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

function fmtAmt(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
  if (a >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (a >= 1_000)       return `₹${(v / 1_000).toFixed(1)}k`;
  return `₹${v.toFixed(0)}`;
}

/* ─── segment colours ─── */
function segColor(pct: number, open: boolean) {
  if (open) {
    if (pct >= 20)  return { fill: '#166534', stroke: '#4ade80', text: '#4ade80', label: '#052e16' };
    if (pct >= 0)   return { fill: '#14532d', stroke: '#86efac', text: '#86efac', label: '#052e16' };
    if (pct >= -10) return { fill: '#7f1d1d', stroke: '#fca5a5', text: '#fca5a5', label: '#2d0a0a' };
    return               { fill: '#450a0a', stroke: '#f87171',  text: '#f87171',  label: '#2d0a0a' };
  }
  // closed
  if (pct >= 20)  return { fill: '#1a3a28', stroke: '#22c55e', text: '#22c55e', label: '#052e16' };
  if (pct >= 0)   return { fill: '#1a2d1c', stroke: '#4ade80', text: '#4ade80', label: '#052e16' };
  if (pct >= -10) return { fill: '#3a1a1a', stroke: '#f87171', text: '#f87171', label: '#2d0a0a' };
  return               { fill: '#2d0a0a', stroke: '#ef4444', text: '#ef4444', label: '#2d0a0a' };
}

/* ─── FIFO P&L per sell ─── */
interface BuyLot { price: number; qty: number }

function calcSellPL(queue: BuyLot[], sellPrice: number, sellQty: number): { plPct: number; plAmt: number; avgCost: number } {
  let remaining = sellQty;
  let totalCost = 0;
  let totalQty  = 0;
  const temp = queue.map(b => ({ ...b }));

  while (remaining > 0 && temp.length > 0) {
    const lot = temp[0];
    const take = Math.min(lot.qty, remaining);
    totalCost += take * lot.price;
    totalQty  += take;
    remaining -= take;
    lot.qty   -= take;
    if (lot.qty <= 0) temp.shift();
  }

  const avgCost = totalQty > 0 ? totalCost / totalQty : sellPrice;
  const plAmt   = (sellPrice - avgCost) * sellQty;
  const plPct   = avgCost > 0 ? ((sellPrice - avgCost) / avgCost) * 100 : 0;
  return { plPct, plAmt, avgCost };
}

/* mutate queue after sell */
function dequeueQty(queue: BuyLot[], qty: number) {
  let remaining = qty;
  while (remaining > 0 && queue.length > 0) {
    const lot = queue[0];
    const take = Math.min(lot.qty, remaining);
    lot.qty   -= take;
    remaining -= take;
    if (lot.qty <= 0) queue.shift();
  }
}

/* ─── build per-stock segments ─── */
interface Segment {
  buyDate:  Date;
  sellDate: Date | null;  // null = still open
  status:   'open' | 'closed';
  plPct:    number;       // realised P&L% if closed, current % if open
  plAmt:    number;
  avgBuy:   number;
  sellPrice?: number;
  buyCount: number;       // accumulation buys within this segment
  buyDates: Date[];       // all buy dates within segment
}

interface StockRow {
  name:     string;
  isin:     string;
  sector:   string;
  segments: Segment[];
  totalBuys:  number;
  totalSells: number;
}

/* ─── main ─── */
export default function PortfolioTimeline({ holdings, transactions }: Props) {
  const [sort,    setSort]    = useState<'name' | 'recent' | 'pl'>('recent');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const today = useMemo(() => new Date(), []);

  /* Build holding lookup by ISIN */
  const holdingMap = useMemo(() => {
    const m = new Map<string, Holding>();
    holdings.forEach(h => { if (h.isin) m.set(h.isin, h); });
    return m;
  }, [holdings]);

  /* Build stock rows from transactions */
  const stockRows: StockRow[] = useMemo(() => {
    // Group transactions by ISIN
    const txByIsin = new Map<string, Transaction[]>();
    transactions.forEach(t => {
      if (!t.isin) return;
      if (!txByIsin.has(t.isin)) txByIsin.set(t.isin, []);
      txByIsin.get(t.isin)!.push(t);
    });

    const rows: StockRow[] = [];

    txByIsin.forEach((txs, isin) => {
      // Sort by date
      const sorted = [...txs]
        .filter(t => t.transactionDate)
        .sort((a, b) => toDate(a.transactionDate).getTime() - toDate(b.transactionDate).getTime());

      const holding = holdingMap.get(isin);
      const name    = holding?.stockName || sorted[0]?.buySell || isin;
      const sector  = holding?.sectorName || '';

      const segments: Segment[] = [];
      const buyQueue: BuyLot[]  = [];
      let segBuyDates: Date[]   = [];
      let segBuyCount = 0;
      let segAvgBuySum = 0;
      let segAvgBuyQty = 0;
      let totalBuys    = 0;
      let totalSells   = 0;

      sorted.forEach(t => {
        const type   = (t.buySell || '').toUpperCase();
        const isBuy  = type.includes('BUY') || type === 'P';
        const isSell = type.includes('SELL') || type === 'S';
        if (!isBuy && !isSell) return;

        const date  = toDate(t.transactionDate);
        const price = t.tradePriceAdjusted || 0;
        const qty   = Math.abs(t.tradedQty || 1);

        if (isBuy) {
          totalBuys++;
          buyQueue.push({ price, qty });
          segBuyDates.push(date);
          segBuyCount++;
          segAvgBuySum += price * qty;
          segAvgBuyQty += qty;
        }

        if (isSell && segBuyDates.length > 0) {
          totalSells++;
          const { plPct, plAmt, avgCost } = calcSellPL(buyQueue, price, qty);
          dequeueQty(buyQueue, qty);

          // If buy queue is now empty → close the segment
          if (buyQueue.length === 0) {
            segments.push({
              buyDate:   segBuyDates[0],
              sellDate:  date,
              status:    'closed',
              plPct,
              plAmt,
              avgBuy:    avgCost,
              sellPrice: price,
              buyCount:  segBuyCount,
              buyDates:  [...segBuyDates],
            });
            segBuyDates  = [];
            segBuyCount  = 0;
            segAvgBuySum = 0;
            segAvgBuyQty = 0;
          }
        }
      });

      // Open segment (still holding)
      if (buyQueue.length > 0 || segBuyDates.length > 0) {
        const h = holdingMap.get(isin);
        const currentPct = h?.profitLossTillDatePercent ?? 0;
        const currentPl  = h?.profitLossTillDate ?? 0;
        const avgBuy     = segAvgBuyQty > 0 ? segAvgBuySum / segAvgBuyQty : 0;

        if (segBuyDates.length > 0) {
          segments.push({
            buyDate:  segBuyDates[0],
            sellDate: null,
            status:   'open',
            plPct:    currentPct,
            plAmt:    currentPl,
            avgBuy,
            buyCount: segBuyCount,
            buyDates: [...segBuyDates],
          });
        }
      }

      if (segments.length > 0) {
        rows.push({ name, isin, sector, segments, totalBuys, totalSells });
      }
    });

    return rows;
  }, [transactions, holdingMap, today]);

  /* Sort */
  const sorted = useMemo(() => {
    const r = [...stockRows];
    if (sort === 'name')   return r.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'recent') return r.sort((a, b) => {
      const aLast = a.segments.at(-1)?.buyDate.getTime() ?? 0;
      const bLast = b.segments.at(-1)?.buyDate.getTime() ?? 0;
      return bLast - aLast;
    });
    // by best current P&L
    return r.sort((a, b) => {
      const aOpen = a.segments.find(s => s.status === 'open');
      const bOpen = b.segments.find(s => s.status === 'open');
      return (bOpen?.plPct ?? -999) - (aOpen?.plPct ?? -999);
    });
  }, [stockRows, sort]);

  /* Timeline span */
  const allDates = stockRows.flatMap(r => r.segments.map(s => s.buyDate.getTime()));
  const minTs = allDates.length ? Math.min(...allDates) : today.getTime() - 365 * 24 * 3600 * 1000;
  const span  = today.getTime() - minTs || 1;

  /* Year markers */
  const years = useMemo(() => {
    const list: { year: number; pct: number }[] = [];
    const startY = new Date(minTs).getFullYear();
    const endY   = today.getFullYear();
    for (let y = startY + 1; y <= endY; y++) {
      const ts = new Date(y, 0, 1).getTime();
      if (ts > minTs && ts < today.getTime()) {
        list.push({ year: y, pct: ((ts - minTs) / span) * 100 });
      }
    }
    return list;
  }, [minTs, span, today]);

  /* Summary */
  const openCount   = stockRows.filter(r => r.segments.some(s => s.status === 'open')).length;
  const closedCount = stockRows.reduce((s, r) => s + r.segments.filter(x => x.status === 'closed').length, 0);
  const profitExits = stockRows.reduce((s, r) => s + r.segments.filter(x => x.status === 'closed' && x.plPct > 0).length, 0);
  const exitWinRate = closedCount > 0 ? ((profitExits / closedCount) * 100).toFixed(0) : '–';
  const multiTrades = stockRows.filter(r => r.segments.length > 1).length;

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
            Every buy → hold → exit cycle per stock · Re-entries shown · Current open positions
          </p>
        </div>
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-card-alt)' }}>
          {([
            { k: 'recent', l: 'Recent' },
            { k: 'name',   l: 'A–Z' },
            { k: 'pl',     l: 'Best P&L' },
          ] as const).map(({ k, l }) => (
            <button key={k} onClick={() => setSort(k)}
              className="text-xs px-3 py-1 rounded-md font-medium transition-all"
              style={{
                background: sort === k ? 'var(--brand)' : 'transparent',
                color: sort === k ? '#fff' : 'var(--text-lo)',
              }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Open Positions',  value: openCount,    sub: 'currently holding',        color: '#4ade80' },
          { label: 'Closed Cycles',   value: closedCount,  sub: 'fully exited trades',       color: 'var(--text-hi)' },
          { label: 'Exit Win Rate',   value: `${exitWinRate}%`, sub: `${profitExits} profitable exits`, color: parseInt(exitWinRate) >= 50 ? '#4ade80' : '#f87171' },
          { label: 'Re-Entries',      value: multiTrades,  sub: 'stocks traded 2+ times',   color: '#38bdf8' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            <p className="text-xs text-lo mb-1">{s.label}</p>
            <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-lo mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-4 text-xs text-lo">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#166534', border: '1px solid #4ade80' }} />
          Open – Profit
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#450a0a', border: '1px solid #f87171' }} />
          Open – Loss
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#1a3a28', border: '1px solid #22c55e', opacity: 0.6 }} />
          Exited – Profit
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#2d0a0a', border: '1px solid #ef4444', opacity: 0.6 }} />
          Exited – Loss
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#4ade80' }} /> BUY
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#f87171', border: '2px solid #f87171' }} /> SELL
        </span>
      </div>

      {/* ── Timeline ── */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: 580 }}>

          {/* Year header ticks */}
          <div className="relative h-5 mb-1" style={{ marginLeft: 152, marginRight: 8 }}>
            {years.map(y => (
              <div key={y.year} className="absolute flex flex-col items-center"
                style={{ left: `${y.pct}%`, transform: 'translateX(-50%)' }}>
                <span className="text-lo font-semibold" style={{ fontSize: 9 }}>{y.year}</span>
              </div>
            ))}
          </div>

          {/* Stock rows */}
          <div className="space-y-3">
            {sorted.map(stock => (
              <div key={stock.isin}
                className="flex items-center gap-3"
                onMouseEnter={() => setHoverId(stock.isin)}
                onMouseLeave={() => setHoverId(null)}>

                {/* Stock name */}
                <div className="shrink-0 text-right" style={{ width: 148 }}>
                  <p className="text-xs font-semibold truncate"
                    style={{ color: hoverId === stock.isin ? 'var(--text-hi)' : 'var(--text-mid)' }}>
                    {stock.name}
                  </p>
                  {stock.sector && (
                    <p className="text-lo truncate" style={{ fontSize: 9 }}>{stock.sector}</p>
                  )}
                </div>

                {/* Timeline track */}
                <div className="flex-1 relative" style={{ height: 36 }}>
                  {/* Track background */}
                  <div className="absolute inset-y-0 left-0 right-0"
                    style={{ top: 14, bottom: 14, background: 'var(--bg-card-alt)', borderRadius: 99, border: '1px solid var(--border)' }} />

                  {/* Year divider lines */}
                  {years.map(y => (
                    <div key={y.year} className="absolute"
                      style={{ left: `${y.pct}%`, top: 10, bottom: 10, width: 1, background: 'var(--border)', opacity: 0.5 }} />
                  ))}

                  {/* Segments */}
                  {stock.segments.map((seg, si) => {
                    const col       = segColor(seg.plPct, seg.status === 'open');
                    const startPct  = ((seg.buyDate.getTime() - minTs) / span) * 100;
                    const endTs     = seg.sellDate ? seg.sellDate.getTime() : today.getTime();
                    const widthPct  = Math.max(((endTs - seg.buyDate.getTime()) / span) * 100, 0.8);
                    const isOpen    = seg.status === 'open';
                    const sign      = seg.plPct >= 0 ? '+' : '';
                    const uid       = `${stock.isin}-${si}`;

                    return (
                      <div key={si} className="absolute group/seg" style={{ left: `${startPct}%`, width: `${widthPct}%`, top: 8, bottom: 8 }}>
                        {/* Bar */}
                        <div className="absolute inset-0 rounded-md transition-all"
                          style={{
                            background: col.fill,
                            border: `1px solid ${col.stroke}`,
                            opacity: hoverId === stock.isin ? 1 : 0.8,
                            boxShadow: hoverId === stock.isin ? `0 0 6px ${col.stroke}55` : 'none',
                          }} />

                        {/* % label inside bar (if wide enough) */}
                        {widthPct > 8 && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
                            style={{ fontSize: 9 }}>
                            <span className="font-bold" style={{ color: col.text }}>
                              {sign}{seg.plPct.toFixed(1)}%
                            </span>
                          </div>
                        )}

                        {/* BUY marker(s) – show all accumulation dots */}
                        {seg.buyDates.map((bd, bdi) => {
                          const dotPct = ((bd.getTime() - seg.buyDate.getTime()) / Math.max(endTs - seg.buyDate.getTime(), 1)) * 100;
                          return (
                            <div key={bdi}
                              title={`BUY ${fmtDate(bd)}`}
                              className="absolute rounded-full"
                              style={{
                                left:   `${bdi === 0 ? -5 : Math.max(dotPct - 3, 2)}%`,
                                top:    '50%', transform: 'translateY(-50%)',
                                width:  bdi === 0 ? 10 : 7, height: bdi === 0 ? 10 : 7,
                                background: '#4ade80',
                                border:     '1.5px solid #052e16',
                                zIndex: 10,
                                boxShadow: '0 0 4px #4ade8088',
                              }} />
                          );
                        })}

                        {/* SELL marker */}
                        {!isOpen && seg.sellDate && (
                          <div title={`SELL ${fmtDate(seg.sellDate)} · ${sign}${seg.plPct.toFixed(1)}%`}
                            className="absolute rounded-full"
                            style={{
                              right: -5, top: '50%', transform: 'translateY(-50%)',
                              width: 10, height: 10,
                              background: seg.plPct >= 0 ? '#22c55e' : '#ef4444',
                              border: '2px solid #0a0a0a',
                              zIndex: 10,
                              boxShadow: `0 0 5px ${seg.plPct >= 0 ? '#22c55e88' : '#ef444488'}`,
                            }} />
                        )}

                        {/* "OPEN" end marker */}
                        {isOpen && (
                          <div className="absolute rounded-full"
                            style={{
                              right: -3, top: '50%', transform: 'translateY(-50%)',
                              width: 8, height: 8,
                              background: col.stroke,
                              border: '2px dashed #0a0a0a',
                              zIndex: 10,
                            }} />
                        )}

                        {/* Hover tooltip */}
                        {hoverId === stock.isin && (
                          <div className="absolute z-50 rounded-xl shadow-2xl text-xs hidden group-hover/seg:block"
                            style={{
                              top: 42,
                              left: '50%',
                              transform: 'translateX(-50%)',
                              background: 'var(--bg-card)',
                              border: `1px solid ${col.stroke}66`,
                              minWidth: 200,
                              padding: '10px 12px',
                              pointerEvents: 'none',
                            }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-hi">{stock.name}</span>
                              <span className="px-1.5 py-0.5 rounded text-xs font-bold"
                                style={{ background: col.label, color: col.text }}>
                                {isOpen ? 'HOLDING' : 'EXITED'}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1" style={{ borderTop: `1px solid ${col.stroke}33`, paddingTop: 6 }}>
                              <span className="text-lo">Bought</span>
                              <span className="font-semibold text-hi">{fmtDate(seg.buyDate)}</span>
                              {seg.sellDate && (
                                <>
                                  <span className="text-lo">Sold</span>
                                  <span className="font-semibold text-hi">{fmtDate(seg.sellDate)}</span>
                                </>
                              )}
                              {!seg.sellDate && (
                                <>
                                  <span className="text-lo">Since</span>
                                  <span className="font-semibold text-hi">{fmtDate(seg.buyDate)}</span>
                                </>
                              )}
                              {seg.avgBuy > 0 && (
                                <>
                                  <span className="text-lo">Avg Buy</span>
                                  <span className="font-semibold text-hi">₹{seg.avgBuy.toFixed(1)}</span>
                                </>
                              )}
                              {seg.sellPrice && (
                                <>
                                  <span className="text-lo">Sell Price</span>
                                  <span className="font-semibold text-hi">₹{seg.sellPrice.toFixed(1)}</span>
                                </>
                              )}
                              <span className="text-lo">P&L</span>
                              <span className="font-bold" style={{ color: col.text }}>
                                {sign}{seg.plPct.toFixed(1)}%
                                {seg.plAmt !== 0 && ` (${seg.plAmt >= 0 ? '+' : ''}${fmtAmt(seg.plAmt)})`}
                              </span>
                              {seg.buyCount > 1 && (
                                <>
                                  <span className="text-lo">Accumulations</span>
                                  <span className="font-semibold text-hi">{seg.buyCount}× buys</span>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom axis line */}
          <div className="relative mt-3" style={{ marginLeft: 152 }}>
            <div className="w-full" style={{ height: 1, background: 'var(--border)' }} />
            {years.map(y => (
              <div key={y.year} className="absolute" style={{ left: `${y.pct}%`, top: 1, width: 1, height: 5, background: 'var(--border)' }} />
            ))}
            <div className="absolute right-0 top-2 text-lo" style={{ fontSize: 9 }}>Today</div>
          </div>
        </div>
      </div>
    </div>
  );
}
