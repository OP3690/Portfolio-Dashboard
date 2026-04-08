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
const toDate  = (d: Date | string) => d instanceof Date ? d : new Date(d);
const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
const fmtAmt  = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
  if (a >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (a >= 1_000)       return `₹${(v / 1_000).toFixed(1)}k`;
  return `₹${v.toFixed(0)}`;
};
const holdLabel = (days: number) => {
  if (days < 30)  return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}m`;
  const y = Math.floor(days / 365), m = Math.round((days % 365) / 30);
  return m > 0 ? `${y}y ${m}m` : `${y}y`;
};
const plCol = (v: number) => v >= 0 ? '#4ade80' : '#f87171';

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

/* ─── data model ─── */
interface Tranche {
  date:       Date;
  price:      number;
  qty:        number;
  runningAvg: number;   // avg cost after this buy
  runningQty: number;   // total qty held after this buy
}
interface Cycle {
  no:         number;
  buyDate:    Date;
  sellDate:   Date | null;
  status:     'open' | 'closed';
  plPct:      number;
  plAmt:      number;
  avgBuy:     number;
  sellPrice:  number;
  daysHeld:   number;
  tranches:   Tranche[];  // every individual BUY within this cycle
}
interface StockRow {
  name: string; isin: string; sector: string;
  cycles:     Cycle[];
  openPct:    number | null;
  openAmt:    number | null;
  bestPct:    number;
  totalPL:    number;
  hasOpen:    boolean;
}
type SortKey = 'name' | 'recent' | 'pl' | 'best' | 'cycles';

/* ═══════════ MAIN ═══════════ */
export default function PortfolioTimeline({ holdings, transactions, realizedStocks = [] }: Props) {
  const [sort,    setSort]    = useState<SortKey>('recent');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search,  setSearch]  = useState('');
  const today = useMemo(() => new Date(), []);

  /* name map */
  const holdingMap = useMemo(() => {
    const m = new Map<string, Holding>();
    holdings.forEach(h => { if (h.isin) m.set(h.isin, h); });
    realizedStocks.forEach(r => { if (r.isin && r.stockName && !m.has(r.isin)) m.set(r.isin, { stockName: r.stockName, isin: r.isin }); });
    return m;
  }, [holdings, realizedStocks]);

  /* build rows */
  const stockRows: StockRow[] = useMemo(() => {
    const txByIsin = new Map<string, Transaction[]>();
    transactions.forEach(t => {
      if (!t.isin) return;
      if (!txByIsin.has(t.isin)) txByIsin.set(t.isin, []);
      txByIsin.get(t.isin)!.push(t);
    });

    const rows: StockRow[] = [];

    txByIsin.forEach((txs, isin) => {
      const sorted = [...txs].filter(t => t.transactionDate)
        .sort((a, b) => toDate(a.transactionDate).getTime() - toDate(b.transactionDate).getTime());

      const h = holdingMap.get(isin);
      const name = h?.stockName || isin, sector = h?.sectorName || '';

      const cycles: Cycle[] = [];
      const buyQueue: BuyLot[] = [];
      let tranches: Tranche[] = [];
      let runQty = 0, runCost = 0;

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
          runQty  += qty;
          runCost += price * qty;
          tranches.push({ date, price, qty, runningAvg: runQty > 0 ? runCost / runQty : price, runningQty: runQty });
        }

        if (isSell && tranches.length > 0) {
          const { plPct, plAmt, avgCost } = calcSellPL(buyQueue, price, qty);
          dequeue(buyQueue, qty);
          runQty  -= qty;
          runCost  = runQty > 0 ? avgCost * runQty : 0;   // recalculate after sell

          if (buyQueue.length === 0) {
            const sellDate = date;
            cycles.push({
              no:       cycles.length + 1,
              buyDate:  tranches[0].date, sellDate,
              status:   'closed', plPct, plAmt,
              avgBuy:   avgCost, sellPrice: price,
              daysHeld: Math.round((sellDate.getTime() - tranches[0].date.getTime()) / 86400000),
              tranches: [...tranches],
            });
            tranches = []; runQty = 0; runCost = 0;
          }
        }
      });

      /* open cycle */
      if (tranches.length > 0) {
        const hd = holdingMap.get(isin);
        cycles.push({
          no:       cycles.length + 1,
          buyDate:  tranches[0].date, sellDate: null,
          status:   'open',
          plPct:    hd?.profitLossTillDatePercent ?? 0,
          plAmt:    hd?.profitLossTillDate ?? 0,
          avgBuy:   tranches.at(-1)!.runningAvg,
          sellPrice: 0,
          daysHeld: Math.round((today.getTime() - tranches[0].date.getTime()) / 86400000),
          tranches: [...tranches],
        });
      }

      if (!cycles.length) return;
      const openCycle = cycles.find(c => c.status === 'open');
      const bestCycle = [...cycles].sort((a, b) => b.plPct - a.plPct)[0];
      rows.push({
        name, isin, sector, cycles,
        openPct: openCycle?.plPct ?? null,
        openAmt: openCycle?.plAmt ?? null,
        bestPct: bestCycle?.plPct ?? 0,
        totalPL: cycles.reduce((s, c) => s + c.plAmt, 0),
        hasOpen: !!openCycle,
      });
    });
    return rows;
  }, [transactions, holdingMap, today]);

  /* sort + filter */
  const applySort = (k: SortKey) => { sort === k ? setSortDir(d => (d === 1 ? -1 : 1)) : (setSort(k), setSortDir(1)); };
  const displayed = useMemo(() => {
    let r = [...stockRows];
    if (search.trim()) { const q = search.toLowerCase(); r = r.filter(x => x.name.toLowerCase().includes(q) || x.sector.toLowerCase().includes(q)); }
    r.sort((a, b) => {
      let v = 0;
      if (sort === 'name')   v = a.name.localeCompare(b.name);
      if (sort === 'recent') v = Math.max(...b.cycles.map(c => c.buyDate.getTime())) - Math.max(...a.cycles.map(c => c.buyDate.getTime()));
      if (sort === 'pl')     v = b.totalPL - a.totalPL;
      if (sort === 'best')   v = b.bestPct - a.bestPct;
      if (sort === 'cycles') v = b.cycles.length - a.cycles.length;
      return v * sortDir;
    });
    return r;
  }, [stockRows, sort, sortDir, search]);

  const toggle      = (id: string) => setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const expandAll   = () => setExpanded(new Set(displayed.map(r => r.isin)));
  const collapseAll = () => setExpanded(new Set());

  /* summary */
  const openCount   = stockRows.filter(r => r.hasOpen).length;
  const closedCount = stockRows.reduce((s, r) => s + r.cycles.filter(c => c.status === 'closed').length, 0);
  const winExits    = stockRows.reduce((s, r) => s + r.cycles.filter(c => c.status === 'closed' && c.plPct > 0).length, 0);
  const reEntries   = stockRows.filter(r => r.cycles.length > 1).length;
  const winRate     = closedCount > 0 ? Math.round((winExits / closedCount) * 100) : 0;

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span style={{ opacity: sort === k ? 1 : 0.3, fontSize: 9, marginLeft: 2 }}>
      {sort === k ? (sortDir === 1 ? '▲' : '▼') : '⇅'}
    </span>
  );

  if (!stockRows.length) return <div className="card p-6 text-center text-lo text-sm">No transaction data available.</div>;

  return (
    <div className="card p-5 space-y-4">

      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-hi">Trade Cycle Timeline</h3>
          <p className="text-xs text-lo mt-0.5">Every buy tranche · hold period · exit P&L · re-entries</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search stock / sector…"
            className="text-xs px-3 py-1.5 rounded-lg outline-none"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)', color: 'var(--text-hi)', width: 190 }} />
          <button onClick={expandAll} className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)', color: 'var(--text-lo)' }}>Expand All</button>
          <button onClick={collapseAll} className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)', color: 'var(--text-lo)' }}>Collapse All</button>
        </div>
      </div>

      {/* summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Open Positions', value: openCount,     color: '#4ade80',     sub: 'currently holding' },
          { label: 'Exited Trades',  value: closedCount,   color: 'var(--text-hi)', sub: `${winExits} profitable exits` },
          { label: 'Exit Win Rate',  value: `${winRate}%`, color: winRate >= 50 ? '#4ade80' : '#f87171', sub: 'of closed trades' },
          { label: 'Re-Entries',     value: reEntries,     color: '#38bdf8',     sub: 'stocks bought again' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            <p className="text-xs text-lo mb-1">{s.label}</p>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-lo mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>

        {/* head */}
        <div className="grid text-xs font-semibold text-lo uppercase tracking-wide px-4 py-2.5"
          style={{ gridTemplateColumns: '28px 1fr 90px 70px 80px 84px 90px 90px', background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)' }}>
          <div />
          {[
            { k: 'name',   l: 'Stock'     },
            { k: null,     l: 'Sector'    },
            { k: 'cycles', l: 'Cycles'   },
            { k: null,     l: 'Status'   },
            { k: 'best',   l: 'Best %'   },
            { k: 'pl',     l: 'Total P&L' },
            { k: 'recent', l: 'Last Buy'  },
          ].map(({ k, l }) => k
            ? <button key={l} className="text-left flex items-center" onClick={() => applySort(k as SortKey)}>{l}<SortIcon k={k as SortKey} /></button>
            : <div key={l}>{l}</div>
          )}
        </div>

        {displayed.length === 0 && <div className="py-8 text-center text-lo text-sm">No results for "{search}"</div>}

        {displayed.map((row, ri) => {
          const isExp   = expanded.has(row.isin);
          const lastBuy = new Date(Math.max(...row.cycles.map(c => c.buyDate.getTime())));
          const openBadge = row.hasOpen
            ? { bg: (row.openPct ?? 0) >= 0 ? '#052e16' : '#2d0a0a', color: (row.openPct ?? 0) >= 0 ? '#4ade80' : '#f87171', label: '● HOLDING' }
            : { bg: 'var(--bg-card)',  color: 'var(--text-lo)', label: 'EXITED' };

          return (
            <div key={row.isin}>

              {/* main row */}
              <div className="grid items-center px-4 py-3 cursor-pointer transition-colors hover:bg-white/[0.02]"
                style={{
                  gridTemplateColumns: '28px 1fr 90px 70px 80px 84px 90px 90px',
                  borderBottom: isExp || ri < displayed.length - 1 ? '1px solid var(--border)' : 'none',
                  background: isExp ? 'rgba(255,255,255,0.03)' : 'transparent',
                }}
                onClick={() => toggle(row.isin)}>

                <span style={{ fontSize: 10, color: 'var(--text-lo)', transform: isExp ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform .15s' }}>▶</span>

                <div>
                  <p className="text-sm font-semibold text-hi truncate">{row.name}</p>
                  {row.sector && <p className="text-lo truncate" style={{ fontSize: 10 }}>{row.sector}</p>}
                </div>

                <div>
                  {row.sector
                    ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-lo)', fontSize: 10 }}>{row.sector}</span>
                    : <span className="text-lo" style={{ fontSize: 11 }}>–</span>}
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-sm font-bold text-hi">{row.cycles.length}</span>
                  {row.cycles.length > 1 && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#1e3a5f', color: '#38bdf8', fontSize: 9 }}>re-entry</span>}
                </div>

                <div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: openBadge.bg, color: openBadge.color }}>
                    {openBadge.label}
                  </span>
                </div>

                <div>
                  <span className="text-sm font-bold" style={{ color: plCol(row.bestPct) }}>
                    {row.bestPct >= 0 ? '+' : ''}{row.bestPct.toFixed(1)}%
                  </span>
                </div>

                <div>
                  <span className="text-sm font-bold" style={{ color: plCol(row.totalPL) }}>{row.totalPL >= 0 ? '+' : ''}{fmtAmt(row.totalPL)}</span>
                  {row.openPct !== null && <p className="text-lo" style={{ fontSize: 10 }}>{row.openPct >= 0 ? '+' : ''}{row.openPct.toFixed(1)}% open</p>}
                </div>

                <div><span className="text-xs text-hi">{fmtDate(lastBuy)}</span></div>
              </div>

              {/* expanded detail */}
              {isExp && (
                <div style={{ borderBottom: ri < displayed.length - 1 ? '1px solid var(--border)' : 'none', background: 'rgba(0,0,0,0.15)' }}>
                  {row.cycles.map((cycle, ci) => {
                    const cycleColor = cycle.status === 'open'
                      ? (cycle.plPct >= 0 ? '#4ade80' : '#f87171')
                      : (cycle.plPct >= 0 ? '#86efac' : '#fca5a5');
                    const cycleBg = cycle.status === 'open'
                      ? (cycle.plPct >= 0 ? '#052e16' : '#2d0a0a')
                      : (cycle.plPct >= 0 ? '#052e1688' : '#2d0a0a88');

                    return (
                      <div key={ci} style={{ borderBottom: ci < row.cycles.length - 1 ? '1px solid var(--border)' : 'none' }}>

                        {/* cycle header bar */}
                        <div className="flex flex-wrap items-center gap-3 px-6 py-2"
                          style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: cycleBg, color: cycleColor }}>
                            Cycle {cycle.no}
                          </span>
                          <span className="text-xs font-semibold" style={{ color: cycleColor }}>
                            {cycle.status === 'open' ? '● HOLDING' : `SOLD ${cycle.plPct >= 0 ? '✓' : '✗'}`}
                          </span>
                          <span className="text-xs text-lo">
                            {fmtDate(cycle.buyDate)} → {cycle.sellDate ? fmtDate(cycle.sellDate) : 'Present'}
                          </span>
                          <span className="text-xs text-lo">· {holdLabel(cycle.daysHeld)} held</span>
                          <span className="text-xs font-bold ml-auto" style={{ color: cycleColor }}>
                            {cycle.plPct >= 0 ? '+' : ''}{cycle.plPct.toFixed(1)}% &nbsp;({cycle.plAmt >= 0 ? '+' : ''}{fmtAmt(cycle.plAmt)})
                          </span>
                        </div>

                        {/* tranche sub-table header */}
                        <div className="grid text-xs font-semibold text-lo uppercase tracking-wide px-8 py-2"
                          style={{ gridTemplateColumns: '36px 110px 70px 80px 90px 90px 1fr', background: 'rgba(255,255,255,0.015)', borderBottom: '1px dashed var(--border)' }}>
                          <div>#</div>
                          <div>Buy Date</div>
                          <div>Qty</div>
                          <div>Buy Price</div>
                          <div>Avg Cost</div>
                          <div>Total Qty</div>
                          <div>Held Since</div>
                        </div>

                        {/* tranche rows */}
                        {cycle.tranches.map((tr, ti) => {
                          const daysSince = Math.round((today.getTime() - tr.date.getTime()) / 86400000);
                          return (
                            <div key={ti}
                              className="grid items-center px-8 py-2 text-xs"
                              style={{
                                gridTemplateColumns: '36px 110px 70px 80px 90px 90px 1fr',
                                borderBottom: ti < cycle.tranches.length - 1 ? '1px dashed rgba(255,255,255,0.05)' : 'none',
                                background: ti % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent',
                              }}>
                              {/* tranche # */}
                              <div>
                                <span className="w-5 h-5 rounded-full flex items-center justify-center font-bold"
                                  style={{ background: '#14532d', color: '#4ade80', fontSize: 9 }}>
                                  {ti + 1}
                                </span>
                              </div>
                              {/* date */}
                              <div className="font-semibold text-hi">{fmtDate(tr.date)}</div>
                              {/* qty */}
                              <div className="font-semibold text-hi">{tr.qty.toLocaleString('en-IN')}</div>
                              {/* buy price */}
                              <div>
                                {tr.price > 0
                                  ? <span className="font-semibold text-hi">₹{tr.price.toFixed(2)}</span>
                                  : <span className="text-lo">–</span>}
                              </div>
                              {/* running avg cost */}
                              <div>
                                <span className="font-semibold" style={{ color: '#38bdf8' }}>₹{tr.runningAvg.toFixed(2)}</span>
                                {ti > 0 && (
                                  <p style={{ fontSize: 9, color: tr.runningAvg < cycle.tranches[ti - 1].runningAvg ? '#4ade80' : '#f87171' }}>
                                    {tr.runningAvg < cycle.tranches[ti - 1].runningAvg ? '▼ cost ↓' : '▲ cost ↑'}
                                  </p>
                                )}
                              </div>
                              {/* running total qty */}
                              <div className="font-semibold text-hi">{tr.runningQty.toLocaleString('en-IN')}</div>
                              {/* held since */}
                              <div className="text-lo">{holdLabel(daysSince)}</div>
                            </div>
                          );
                        })}

                        {/* cycle summary footer */}
                        <div className="grid items-center px-8 py-2 text-xs font-semibold"
                          style={{
                            gridTemplateColumns: '36px 110px 70px 80px 90px 90px 1fr',
                            borderTop: '1px solid var(--border)',
                            background: 'rgba(255,255,255,0.03)',
                          }}>
                          <div />
                          <div style={{ color: 'var(--text-lo)' }}>
                            {cycle.sellDate ? `Sold ${fmtDate(cycle.sellDate)}` : 'Still holding'}
                          </div>
                          <div style={{ color: cycleColor }}>
                            {cycle.tranches.reduce((s, t) => s + t.qty, 0).toLocaleString('en-IN')} total
                          </div>
                          <div style={{ color: 'var(--text-lo)' }}>
                            {cycle.sellPrice > 0 ? `@ ₹${cycle.sellPrice.toFixed(2)}` : '–'}
                          </div>
                          <div style={{ color: '#38bdf8' }}>₹{cycle.avgBuy.toFixed(2)} avg</div>
                          <div />
                          <div style={{ color: cycleColor }}>
                            {cycle.plPct >= 0 ? '+' : ''}{cycle.plPct.toFixed(1)}% &nbsp; {cycle.plAmt >= 0 ? '+' : ''}{fmtAmt(cycle.plAmt)}
                          </div>
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

      <div className="flex justify-between text-xs text-lo px-1">
        <span>{displayed.length} stock{displayed.length !== 1 ? 's' : ''} · {stockRows.reduce((s, r) => s + r.cycles.length, 0)} cycles · {stockRows.reduce((s, r) => s + r.cycles.reduce((x, c) => x + c.tranches.length, 0), 0)} buy tranches</span>
        <span>Click row to expand · FIFO cost basis · Avg cost updates per tranche</span>
      </div>
    </div>
  );
}
