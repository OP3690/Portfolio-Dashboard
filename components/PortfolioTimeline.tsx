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
  realizedStocks?: Array<{ isin?: string; stockName?: string }>;
}

/* ─── helpers ─── */
function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

function fmtAmt(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
  if (a >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (a >= 1_000)       return `₹${(v / 1_000).toFixed(1)}k`;
  return `₹${v.toFixed(0)}`;
}

function holdLabel(days: number): string {
  if (days < 30)  return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}m`;
  const y = Math.floor(days / 365);
  const m = Math.round((days % 365) / 30);
  return m > 0 ? `${y}y ${m}m` : `${y}y`;
}

/* ─── FIFO ─── */
interface BuyLot { price: number; qty: number }

function calcSellPL(queue: BuyLot[], sellPrice: number, sellQty: number) {
  let rem = sellQty, cost = 0, qty = 0;
  const tmp = queue.map(b => ({ ...b }));
  while (rem > 0 && tmp.length) {
    const lot = tmp[0], take = Math.min(lot.qty, rem);
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

/* ─── segment / row types ─── */
interface Segment {
  cycleNo:   number;
  buyDate:   Date;
  sellDate:  Date | null;
  status:    'open' | 'closed';
  plPct:     number;
  plAmt:     number;
  avgBuy:    number;
  sellPrice: number;
  buyCount:  number;
  daysHeld:  number;
}

interface StockRow {
  name:        string;
  isin:        string;
  sector:      string;
  segments:    Segment[];
  totalCycles: number;
  openPct:     number | null;   // current open return
  openAmt:     number | null;
  bestPct:     number;
  totalPL:     number;
  hasOpen:     boolean;
}

type SortKey = 'name' | 'recent' | 'pl' | 'best' | 'cycles';

/* ─── colour helpers ─── */
function plColor(v: number) { return v >= 0 ? '#4ade80' : '#f87171'; }
function statusBadge(status: 'open' | 'closed', plPct: number) {
  if (status === 'open')
    return { bg: plPct >= 0 ? '#052e16' : '#2d0a0a', color: plPct >= 0 ? '#4ade80' : '#f87171', label: '● HOLDING' };
  return plPct >= 0
    ? { bg: '#052e16', color: '#86efac', label: 'SOLD ✓' }
    : { bg: '#2d0a0a', color: '#fca5a5', label: 'SOLD ✗' };
}

/* ═══════════════════════ MAIN ═══════════════════════ */
export default function PortfolioTimeline({ holdings, transactions, realizedStocks = [] }: Props) {
  const [sort,      setSort]      = useState<SortKey>('recent');
  const [sortDir,   setSortDir]   = useState<1 | -1>(1);
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set());
  const [search,    setSearch]    = useState('');

  const today = useMemo(() => new Date(), []);

  /* name map: active + realized */
  const holdingMap = useMemo(() => {
    const m = new Map<string, Holding>();
    holdings.forEach(h => { if (h.isin) m.set(h.isin, h); });
    realizedStocks.forEach(r => {
      if (r.isin && r.stockName && !m.has(r.isin))
        m.set(r.isin, { stockName: r.stockName, isin: r.isin });
    });
    return m;
  }, [holdings, realizedStocks]);

  /* ── build rows ── */
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

      const h      = holdingMap.get(isin);
      const name   = h?.stockName || isin;
      const sector = h?.sectorName || '';

      const segments: Segment[] = [];
      const buyQueue: BuyLot[]  = [];
      let segBuyDates: Date[]   = [];
      let segBuyCount = 0, segAvgSum = 0, segAvgQty = 0;

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
          segBuyCount++; segAvgSum += price * qty; segAvgQty += qty;
        }

        if (isSell && segBuyDates.length > 0) {
          const { plPct, plAmt, avgCost } = calcSellPL(buyQueue, price, qty);
          dequeue(buyQueue, qty);
          if (buyQueue.length === 0) {
            const sellDate = date;
            segments.push({
              cycleNo:   segments.length + 1,
              buyDate:   segBuyDates[0], sellDate,
              status:    'closed', plPct, plAmt,
              avgBuy:    avgCost, sellPrice: price,
              buyCount:  segBuyCount,
              daysHeld:  Math.round((sellDate.getTime() - segBuyDates[0].getTime()) / 86400000),
            });
            segBuyDates = []; segBuyCount = 0; segAvgSum = 0; segAvgQty = 0;
          }
        }
      });

      // open segment
      if (segBuyDates.length > 0) {
        const hd = holdingMap.get(isin);
        segments.push({
          cycleNo:   segments.length + 1,
          buyDate:   segBuyDates[0], sellDate: null,
          status:    'open',
          plPct:     hd?.profitLossTillDatePercent ?? 0,
          plAmt:     hd?.profitLossTillDate ?? 0,
          avgBuy:    segAvgQty > 0 ? segAvgSum / segAvgQty : 0,
          sellPrice: 0,
          buyCount:  segBuyCount,
          daysHeld:  Math.round((today.getTime() - segBuyDates[0].getTime()) / 86400000),
        });
      }

      if (!segments.length) return;

      const openSeg  = segments.find(s => s.status === 'open');
      const bestSeg  = [...segments].sort((a, b) => b.plPct - a.plPct)[0];
      const totalPL  = segments.reduce((s, x) => s + x.plAmt, 0);

      rows.push({
        name, isin, sector, segments,
        totalCycles: segments.length,
        openPct:     openSeg?.plPct ?? null,
        openAmt:     openSeg?.plAmt ?? null,
        bestPct:     bestSeg?.plPct ?? 0,
        totalPL,
        hasOpen:     !!openSeg,
      });
    });

    return rows;
  }, [transactions, holdingMap, today]);

  /* ── sort + filter ── */
  const applySort = (key: SortKey) => {
    if (sort === key) setSortDir(d => d === 1 ? -1 : 1);
    else { setSort(key); setSortDir(1); }
  };

  const displayed = useMemo(() => {
    let r = [...stockRows];
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(x => x.name.toLowerCase().includes(q) || x.sector.toLowerCase().includes(q));
    }
    r.sort((a, b) => {
      let v = 0;
      if (sort === 'name')   v = a.name.localeCompare(b.name);
      if (sort === 'recent') v = Math.max(...b.segments.map(s => s.buyDate.getTime())) - Math.max(...a.segments.map(s => s.buyDate.getTime()));
      if (sort === 'pl')     v = b.totalPL - a.totalPL;
      if (sort === 'best')   v = b.bestPct - a.bestPct;
      if (sort === 'cycles') v = b.totalCycles - a.totalCycles;
      return v * sortDir;
    });
    return r;
  }, [stockRows, sort, sortDir, search]);

  const toggleExpand = (isin: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(isin) ? next.delete(isin) : next.add(isin);
      return next;
    });
  };

  const expandAll   = () => setExpanded(new Set(displayed.map(r => r.isin)));
  const collapseAll = () => setExpanded(new Set());

  /* ── summary ── */
  const openCount   = stockRows.filter(r => r.hasOpen).length;
  const closedCount = stockRows.reduce((s, r) => s + r.segments.filter(x => x.status === 'closed').length, 0);
  const winExits    = stockRows.reduce((s, r) => s + r.segments.filter(x => x.status === 'closed' && x.plPct > 0).length, 0);
  const reEntries   = stockRows.filter(r => r.totalCycles > 1).length;
  const winRate     = closedCount > 0 ? Math.round((winExits / closedCount) * 100) : 0;

  /* ── sort indicator ── */
  const SortIcon = ({ k }: { k: SortKey }) => (
    <span style={{ opacity: sort === k ? 1 : 0.3, fontSize: 10, marginLeft: 3 }}>
      {sort === k ? (sortDir === 1 ? '▲' : '▼') : '⇅'}
    </span>
  );

  if (!displayed.length && !search)
    return <div className="card p-6 text-center text-lo text-sm">No transaction data available.</div>;

  return (
    <div className="card p-5 space-y-4">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-hi">Trade Cycle Timeline</h3>
          <p className="text-xs text-lo mt-0.5">
            Every buy → hold → exit cycle · FIFO P&L · Re-entries tracked
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search stock / sector…"
            className="text-xs px-3 py-1.5 rounded-lg outline-none"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)', color: 'var(--text-hi)', width: 180 }}
          />
          <button onClick={expandAll}
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)', color: 'var(--text-lo)' }}>
            Expand All
          </button>
          <button onClick={collapseAll}
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)', color: 'var(--text-lo)' }}>
            Collapse All
          </button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Open Positions', value: openCount,        color: '#4ade80', sub: 'currently holding'          },
          { label: 'Exited Trades',  value: closedCount,      color: 'var(--text-hi)', sub: `${winExits} profitable exits` },
          { label: 'Exit Win Rate',  value: `${winRate}%`,    color: winRate >= 50 ? '#4ade80' : '#f87171', sub: 'closed trades' },
          { label: 'Re-Entries',     value: reEntries,        color: '#38bdf8', sub: 'stocks bought again'        },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            <p className="text-xs text-lo mb-1">{s.label}</p>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-lo mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Table ── */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {/* Table head */}
        <div className="grid text-xs font-semibold text-lo uppercase tracking-wide px-4 py-2.5"
          style={{
            gridTemplateColumns: '28px 1fr 100px 72px 80px 90px 90px 90px',
            background: 'var(--bg-card-alt)',
            borderBottom: '1px solid var(--border)',
          }}>
          <div />
          <button className="text-left flex items-center gap-0.5" onClick={() => applySort('name')}>
            Stock <SortIcon k="name" />
          </button>
          <div>Sector</div>
          <button className="text-left flex items-center gap-0.5" onClick={() => applySort('cycles')}>
            Cycles <SortIcon k="cycles" />
          </button>
          <div>Status</div>
          <button className="text-left flex items-center gap-0.5" onClick={() => applySort('best')}>
            Best % <SortIcon k="best" />
          </button>
          <button className="text-left flex items-center gap-0.5" onClick={() => applySort('pl')}>
            Total P&L <SortIcon k="pl" />
          </button>
          <button className="text-left flex items-center gap-0.5" onClick={() => applySort('recent')}>
            Last Buy <SortIcon k="recent" />
          </button>
        </div>

        {/* Table body */}
        {displayed.length === 0 && (
          <div className="py-8 text-center text-lo text-sm">No results for "{search}"</div>
        )}

        {displayed.map((row, ri) => {
          const isExpanded = expanded.has(row.isin);
          const lastBuy    = new Date(Math.max(...row.segments.map(s => s.buyDate.getTime())));
          const openBadge  = row.hasOpen
            ? { bg: (row.openPct ?? 0) >= 0 ? '#052e16' : '#2d0a0a', color: (row.openPct ?? 0) >= 0 ? '#4ade80' : '#f87171', label: '● HOLDING' }
            : { bg: '#1e1e2e', color: 'var(--text-lo)', label: 'EXITED' };

          return (
            <div key={row.isin}>
              {/* ── Main row ── */}
              <div
                className="grid items-center px-4 py-3 cursor-pointer transition-colors"
                style={{
                  gridTemplateColumns: '28px 1fr 100px 72px 80px 90px 90px 90px',
                  borderBottom: isExpanded ? '1px solid var(--border)' : ri < displayed.length - 1 ? '1px solid var(--border)' : 'none',
                  background: isExpanded ? 'var(--bg-card-alt)' : 'transparent',
                }}
                onClick={() => toggleExpand(row.isin)}>

                {/* Chevron */}
                <span style={{
                  fontSize: 10, color: 'var(--text-lo)',
                  transform: isExpanded ? 'rotate(90deg)' : 'none',
                  display: 'inline-block', transition: 'transform 0.15s',
                }}>▶</span>

                {/* Stock name */}
                <div>
                  <p className="text-sm font-semibold text-hi truncate">{row.name}</p>
                  {row.sector && <p className="text-lo truncate" style={{ fontSize: 10 }}>{row.sector}</p>}
                </div>

                {/* Sector pill */}
                <div>
                  {row.sector
                    ? <span className="text-xs px-2 py-0.5 rounded-full truncate block max-w-full"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-lo)', fontSize: 10 }}>
                        {row.sector}
                      </span>
                    : <span className="text-lo" style={{ fontSize: 11 }}>–</span>}
                </div>

                {/* Cycles */}
                <div>
                  <span className="text-sm font-bold text-hi">{row.totalCycles}</span>
                  {row.totalCycles > 1 && (
                    <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full"
                      style={{ background: '#1e3a5f', color: '#38bdf8', fontSize: 9 }}>
                      re-entry
                    </span>
                  )}
                </div>

                {/* Status */}
                <div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: openBadge.bg, color: openBadge.color, whiteSpace: 'nowrap' }}>
                    {openBadge.label}
                  </span>
                </div>

                {/* Best % */}
                <div>
                  <span className="text-sm font-bold" style={{ color: plColor(row.bestPct) }}>
                    {row.bestPct >= 0 ? '+' : ''}{row.bestPct.toFixed(1)}%
                  </span>
                </div>

                {/* Total P&L */}
                <div>
                  <span className="text-sm font-bold" style={{ color: plColor(row.totalPL) }}>
                    {row.totalPL >= 0 ? '+' : ''}{fmtAmt(row.totalPL)}
                  </span>
                  {row.openAmt !== null && (
                    <p className="text-lo" style={{ fontSize: 10 }}>
                      {(row.openPct ?? 0) >= 0 ? '+' : ''}{(row.openPct ?? 0).toFixed(1)}% open
                    </p>
                  )}
                </div>

                {/* Last buy */}
                <div>
                  <span className="text-xs text-hi">{fmtShort(lastBuy)}</span>
                </div>
              </div>

              {/* ── Expanded: cycle sub-table ── */}
              {isExpanded && (
                <div style={{ borderBottom: ri < displayed.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  {/* Sub-table header */}
                  <div className="grid px-8 py-2 text-xs font-semibold text-lo uppercase tracking-wide"
                    style={{
                      gridTemplateColumns: '40px 1fr 1fr 90px 80px 88px 90px',
                      background: 'rgba(255,255,255,0.02)',
                      borderBottom: '1px solid var(--border)',
                    }}>
                    <div>No.</div>
                    <div>Buy Date</div>
                    <div>Sell Date</div>
                    <div>Hold Period</div>
                    <div>Avg Buy</div>
                    <div>Return %</div>
                    <div>P&L</div>
                  </div>

                  {/* Sub-rows */}
                  {row.segments.map((seg, si) => {
                    const badge = statusBadge(seg.status, seg.plPct);
                    const isLast = si === row.segments.length - 1;
                    return (
                      <div key={si}
                        className="grid items-center px-8 py-2.5 text-xs"
                        style={{
                          gridTemplateColumns: '40px 1fr 1fr 90px 80px 88px 90px',
                          borderBottom: !isLast ? '1px dashed var(--border)' : 'none',
                          background: seg.status === 'open' ? 'rgba(74,222,128,0.04)' : 'transparent',
                        }}>

                        {/* Cycle no. */}
                        <div>
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ background: 'var(--bg-card-alt)', color: 'var(--text-lo)', border: '1px solid var(--border)' }}>
                            {seg.cycleNo}
                          </span>
                        </div>

                        {/* Buy date */}
                        <div>
                          <p className="font-semibold text-hi">{fmtShort(seg.buyDate)}</p>
                          {seg.buyCount > 1 && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full mt-0.5 inline-block"
                              style={{ background: '#14532d', color: '#86efac', fontSize: 9 }}>
                              ×{seg.buyCount} buys
                            </span>
                          )}
                        </div>

                        {/* Sell date */}
                        <div>
                          {seg.sellDate
                            ? <p className="font-semibold text-hi">{fmtShort(seg.sellDate)}</p>
                            : <span className="text-xs px-2 py-0.5 rounded-full font-semibold animate-pulse"
                                style={{ background: badge.bg, color: badge.color }}>
                                ● Open
                              </span>}
                        </div>

                        {/* Hold period */}
                        <div>
                          <span className="font-semibold text-hi">{holdLabel(seg.daysHeld)}</span>
                        </div>

                        {/* Avg buy price */}
                        <div>
                          <span className="text-hi">{seg.avgBuy > 0 ? `₹${seg.avgBuy.toFixed(1)}` : '–'}</span>
                        </div>

                        {/* Return % + status badge */}
                        <div className="space-y-1">
                          <p className="font-bold" style={{ color: plColor(seg.plPct) }}>
                            {seg.plPct >= 0 ? '+' : ''}{seg.plPct.toFixed(1)}%
                          </p>
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                            style={{ background: badge.bg, color: badge.color, fontSize: 9 }}>
                            {badge.label}
                          </span>
                        </div>

                        {/* P&L */}
                        <div>
                          <span className="font-bold" style={{ color: plColor(seg.plAmt) }}>
                            {seg.plAmt >= 0 ? '+' : ''}{fmtAmt(seg.plAmt)}
                          </span>
                          {seg.sellPrice > 0 && (
                            <p className="text-lo mt-0.5" style={{ fontSize: 10 }}>
                              @ ₹{seg.sellPrice.toFixed(1)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between text-xs text-lo px-1">
        <span>{displayed.length} stock{displayed.length !== 1 ? 's' : ''} · {stockRows.reduce((s, r) => s + r.totalCycles, 0)} total cycles</span>
        <span>Click any row to expand · FIFO cost basis</span>
      </div>
    </div>
  );
}
