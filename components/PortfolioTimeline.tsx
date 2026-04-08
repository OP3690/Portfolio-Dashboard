'use client';

import { useMemo, useState } from 'react';

/* ─── types ─── */
interface Holding {
  stockName?: string; isin?: string; sectorName?: string;
  investmentAmount?: number; marketValue?: number;
  profitLossTillDate?: number; profitLossTillDatePercent?: number;
  holdingPeriodYears?: number; holdingPeriodMonths?: number;
}
interface Transaction {
  isin: string; transactionDate: Date | string; buySell: string;
  tradePriceAdjusted?: number; tradedQty?: number; tradeValueAdjusted?: number;
}
interface Props {
  holdings: Holding[];
  transactions: Transaction[];
  realizedStocks?: Array<{ isin?: string; stockName?: string }>;
}

/* ─── helpers ─── */
const toDate   = (d: Date | string) => d instanceof Date ? d : new Date(d);
const fmtDate  = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
const fmtAmt   = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_00_00_000) return `${v < 0 ? '-' : ''}₹${(a / 1_00_00_000).toFixed(1)}Cr`;
  if (a >= 1_00_000)    return `${v < 0 ? '-' : ''}₹${(a / 1_00_000).toFixed(1)}L`;
  if (a >= 1_000)       return `${v < 0 ? '-' : ''}₹${(a / 1_000).toFixed(1)}k`;
  return `₹${v.toFixed(0)}`;
};
const holdLabel = (days: number) => {
  if (days < 1)   return '< 1d';
  if (days < 30)  return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}m`;
  const y = Math.floor(days / 365), m = Math.round((days % 365) / 30);
  return m > 0 ? `${y}y ${m}m` : `${y}y`;
};
const plCol  = (v: number) => v >= 0 ? '#4ade80' : '#f87171';
const plSign = (v: number) => v >= 0 ? '+' : '';

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

/* ─── model ─── */
interface Tranche { date: Date; price: number; qty: number; runningAvg: number; runningQty: number; }
interface Cycle {
  no: number; buyDate: Date; sellDate: Date | null; status: 'open' | 'closed';
  plPct: number; plAmt: number; avgBuy: number; sellPrice: number; daysHeld: number; tranches: Tranche[];
}
interface StockRow {
  name: string; isin: string; sector: string; cycles: Cycle[];
  openPct: number | null; openAmt: number | null; bestPct: number; totalPL: number; hasOpen: boolean;
  totalBuys: number;
}
type SortKey = 'name' | 'recent' | 'pl' | 'best' | 'cycles';
type ViewMode = 'current' | 'overall';

/* ═══════════ COMPONENT ═══════════ */
export default function PortfolioTimeline({ holdings, transactions, realizedStocks = [] }: Props) {
  const [sort,     setSort]     = useState<SortKey>('recent');
  const [sortDir,  setSortDir]  = useState<1 | -1>(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search,   setSearch]   = useState('');
  const [view,     setView]     = useState<ViewMode>('current');
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const today = useMemo(() => new Date(), []);

  /* name map */
  const holdingMap = useMemo(() => {
    const m = new Map<string, Holding>();
    holdings.forEach(h => { if (h.isin) m.set(h.isin, h); });
    realizedStocks.forEach(r => { if (r.isin && r.stockName && !m.has(r.isin)) m.set(r.isin, { stockName: r.stockName, isin: r.isin }); });
    return m;
  }, [holdings, realizedStocks]);

  /* build rows */
  const allRows: StockRow[] = useMemo(() => {
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
      let tranches: Tranche[] = [], runQty = 0, runCost = 0;

      sorted.forEach(t => {
        const type = (t.buySell || '').toUpperCase();
        const isBuy  = type.includes('BUY') || type === 'P';
        const isSell = type.includes('SELL') || type === 'S';
        if (!isBuy && !isSell) return;
        const date = toDate(t.transactionDate);
        const price = t.tradePriceAdjusted || 0, qty = Math.abs(t.tradedQty || 1);
        if (isBuy) {
          buyQueue.push({ price, qty });
          runQty += qty; runCost += price * qty;
          tranches.push({ date, price, qty, runningAvg: runQty > 0 ? runCost / runQty : price, runningQty: runQty });
        }
        if (isSell && tranches.length > 0) {
          const { plPct, plAmt, avgCost } = calcSellPL(buyQueue, price, qty);
          dequeue(buyQueue, qty);
          runQty -= qty; runCost = runQty > 0 ? avgCost * runQty : 0;
          if (buyQueue.length === 0) {
            cycles.push({ no: cycles.length + 1, buyDate: tranches[0].date, sellDate: date, status: 'closed', plPct, plAmt, avgBuy: avgCost, sellPrice: price, daysHeld: Math.round((date.getTime() - tranches[0].date.getTime()) / 86400000), tranches: [...tranches] });
            tranches = []; runQty = 0; runCost = 0;
          }
        }
      });
      if (tranches.length > 0) {
        const hd = holdingMap.get(isin);
        cycles.push({ no: cycles.length + 1, buyDate: tranches[0].date, sellDate: null, status: 'open', plPct: hd?.profitLossTillDatePercent ?? 0, plAmt: hd?.profitLossTillDate ?? 0, avgBuy: tranches.at(-1)!.runningAvg, sellPrice: 0, daysHeld: Math.round((today.getTime() - tranches[0].date.getTime()) / 86400000), tranches: [...tranches] });
      }
      if (!cycles.length) return;
      const open = cycles.find(c => c.status === 'open');
      const best = [...cycles].sort((a, b) => b.plPct - a.plPct)[0];
      rows.push({ name, isin, sector, cycles, openPct: open?.plPct ?? null, openAmt: open?.plAmt ?? null, bestPct: best?.plPct ?? 0, totalPL: cycles.reduce((s, c) => s + c.plAmt, 0), hasOpen: !!open, totalBuys: cycles.reduce((s, c) => s + c.tranches.length, 0) });
    });
    return rows;
  }, [transactions, holdingMap, today]);

  /* view filter */
  const viewFiltered = useMemo(() =>
    view === 'current' ? allRows.filter(r => r.hasOpen) : allRows,
  [allRows, view]);

  /* search + sort */
  const applySort = (k: SortKey) => { sort === k ? setSortDir(d => d === 1 ? -1 : 1) : (setSort(k), setSortDir(1)); setPage(1); };
  const filtered = useMemo(() => {
    let r = [...viewFiltered];
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
  }, [viewFiltered, search, sort, sortDir]);

  /* pagination */
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const pageRows   = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggle      = (id: string) => setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const expandAll   = () => setExpanded(new Set(pageRows.map(r => r.isin)));
  const collapseAll = () => setExpanded(new Set());

  /* summary (always from all rows) */
  const openCount   = allRows.filter(r => r.hasOpen).length;
  const closedCount = allRows.reduce((s, r) => s + r.cycles.filter(c => c.status === 'closed').length, 0);
  const winExits    = allRows.reduce((s, r) => s + r.cycles.filter(c => c.status === 'closed' && c.plPct > 0).length, 0);
  const reEntries   = allRows.filter(r => r.cycles.length > 1).length;
  const winRate     = closedCount > 0 ? Math.round((winExits / closedCount) * 100) : 0;

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span style={{ fontSize: 9, marginLeft: 3, opacity: sort === k ? 1 : 0.3 }}>
      {sort === k ? (sortDir === 1 ? '▲' : '▼') : '⇅'}
    </span>
  );

  /* ── page nav ── */
  const PageNav = () => {
    const pageNums: (number | '…')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pageNums.push(i);
    } else {
      pageNums.push(1);
      if (safePage > 3) pageNums.push('…');
      for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) pageNums.push(i);
      if (safePage < totalPages - 2) pageNums.push('…');
      pageNums.push(totalPages);
    }
    return (
      <div className="flex items-center gap-1.5">
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
          className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-30"
          style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)', color: 'var(--text-lo)' }}>‹ Prev</button>
        {pageNums.map((n, i) => n === '…'
          ? <span key={`e${i}`} className="text-lo text-xs px-1">…</span>
          : <button key={n} onClick={() => setPage(n as number)}
              className="w-7 h-7 rounded-lg text-xs font-medium transition-all"
              style={{ background: safePage === n ? 'var(--brand)' : 'var(--bg-card-alt)', border: `1px solid ${safePage === n ? 'var(--brand)' : 'var(--border)'}`, color: safePage === n ? '#fff' : 'var(--text-lo)' }}>
              {n}
            </button>
        )}
        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
          className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-30"
          style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)', color: 'var(--text-lo)' }}>Next ›</button>
      </div>
    );
  };

  if (!allRows.length) return <div className="card p-6 text-center text-lo text-sm">No transaction data available.</div>;

  /* ══ RENDER ══ */
  return (
    <div className="card p-5 space-y-4">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-hi">Trade Cycle Timeline</h3>
          <p className="text-xs text-lo mt-0.5">Buy tranches · hold periods · exit P&L · re-entries · FIFO cost basis</p>
        </div>
        {/* Current / Overall toggle */}
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
          {(['current', 'overall'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => { setView(v); setPage(1); }}
              className="text-xs px-4 py-1.5 rounded-md font-semibold transition-all capitalize"
              style={{ background: view === v ? 'var(--brand)' : 'transparent', color: view === v ? '#fff' : 'var(--text-lo)' }}>
              {v === 'current' ? `Current (${openCount})` : `Overall (${allRows.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Open Positions', value: openCount,     color: '#4ade80',     sub: 'currently holding' },
          { label: 'Exited Trades',  value: closedCount,   color: 'var(--text-hi)', sub: `${winExits} profitable exits` },
          { label: 'Exit Win Rate',  value: `${winRate}%`, color: winRate >= 50 ? '#4ade80' : '#f87171', sub: 'of closed trades' },
          { label: 'Re-Entries',     value: reEntries,     color: '#38bdf8',     sub: 'stocks re-bought' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
            <p className="text-xs text-lo mb-0.5">{s.label}</p>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-lo mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Controls bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search stock or sector…"
            className="text-xs px-3 py-1.5 rounded-lg outline-none"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)', color: 'var(--text-hi)', width: 200 }} />
          {search && (
            <button onClick={() => { setSearch(''); setPage(1); }} className="text-lo text-xs hover:text-hi transition-colors">✕ Clear</button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-lo">Rows:</span>
          {[10, 15, 25, 50].map(n => (
            <button key={n} onClick={() => { setPageSize(n); setPage(1); }}
              className="text-xs w-8 h-7 rounded-md font-medium transition-all"
              style={{ background: pageSize === n ? 'var(--brand)' : 'var(--bg-card-alt)', border: `1px solid ${pageSize === n ? 'var(--brand)' : 'var(--border)'}`, color: pageSize === n ? '#fff' : 'var(--text-lo)' }}>
              {n}
            </button>
          ))}
          <div className="w-px h-5 mx-1" style={{ background: 'var(--border)' }} />
          <button onClick={expandAll}
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)', color: 'var(--text-lo)' }}>⊕ Expand All</button>
          <button onClick={collapseAll}
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)', color: 'var(--text-lo)' }}>⊖ Collapse All</button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>

        {/* thead */}
        <div className="grid items-center text-xs font-semibold text-lo uppercase tracking-wide px-4 py-3"
          style={{ gridTemplateColumns: '32px minmax(140px,1fr) 80px 90px 88px 92px 100px', background: 'var(--bg-card-alt)', borderBottom: '2px solid var(--border)' }}>
          <div />
          <button className="flex items-center text-left gap-0.5 hover:text-hi transition-colors" onClick={() => applySort('name')}>Stock <SortIcon k="name" /></button>
          <button className="flex items-center text-left gap-0.5 hover:text-hi transition-colors" onClick={() => applySort('cycles')}>Cycles <SortIcon k="cycles" /></button>
          <div>Status</div>
          <button className="flex items-center text-left gap-0.5 hover:text-hi transition-colors" onClick={() => applySort('best')}>Best % <SortIcon k="best" /></button>
          <button className="flex items-center text-left gap-0.5 hover:text-hi transition-colors" onClick={() => applySort('pl')}>P&amp;L <SortIcon k="pl" /></button>
          <button className="flex items-center text-left gap-0.5 hover:text-hi transition-colors" onClick={() => applySort('recent')}>Last Buy <SortIcon k="recent" /></button>
        </div>

        {filtered.length === 0 && (
          <div className="py-12 text-center text-lo text-sm">No results for "<span className="text-hi">{search}</span>"</div>
        )}

        {pageRows.map((row, ri) => {
          const isExp   = expanded.has(row.isin);
          const lastBuy = new Date(Math.max(...row.cycles.map(c => c.buyDate.getTime())));
          const isLast  = ri === pageRows.length - 1;
          /* row color coding */
          const rowAccent = row.hasOpen
            ? (row.openPct ?? 0) >= 0 ? 'rgba(74,222,128,0.04)' : 'rgba(248,113,113,0.04)'
            : 'transparent';
          const openBadge = row.hasOpen
            ? { bg: (row.openPct ?? 0) >= 0 ? '#052e16' : '#2d0a0a', color: (row.openPct ?? 0) >= 0 ? '#4ade80' : '#f87171', dot: true }
            : { bg: 'rgba(255,255,255,0.05)', color: 'var(--text-lo)', dot: false };

          return (
            <div key={row.isin}>
              {/* main row */}
              <div
                className="grid items-center px-4 py-3 cursor-pointer transition-all"
                style={{
                  gridTemplateColumns: '32px minmax(140px,1fr) 80px 90px 88px 92px 100px',
                  borderBottom: !isLast || isExp ? '1px solid var(--border)' : 'none',
                  background: isExp ? 'var(--bg-card-alt)' : rowAccent,
                }}
                onClick={() => toggle(row.isin)}>

                {/* chevron */}
                <div className="flex items-center justify-center w-5 h-5 rounded"
                  style={{ background: isExp ? 'var(--brand)' : 'var(--bg-card-alt)', border: '1px solid var(--border)', transition: 'all .15s' }}>
                  <span style={{ fontSize: 8, color: isExp ? '#fff' : 'var(--text-lo)', transform: isExp ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform .15s' }}>▶</span>
                </div>

                {/* stock */}
                <div className="min-w-0 pr-2">
                  <p className="text-sm font-semibold text-hi truncate leading-tight">{row.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {row.sector && <span className="text-lo truncate" style={{ fontSize: 10 }}>{row.sector}</span>}
                    <span className="shrink-0 text-lo" style={{ fontSize: 10 }}>· {row.totalBuys} buy{row.totalBuys !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* cycles */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold text-hi">{row.cycles.length}</span>
                  {row.cycles.length > 1
                    ? <span className="text-xs font-medium" style={{ color: '#38bdf8', fontSize: 9 }}>re-entry</span>
                    : <span style={{ fontSize: 9, color: 'var(--text-lo)' }}>cycle</span>}
                </div>

                {/* status */}
                <div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{ background: openBadge.bg, color: openBadge.color }}>
                    {openBadge.dot && <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ background: openBadge.color }} />}
                    {row.hasOpen ? 'HOLDING' : 'EXITED'}
                  </span>
                </div>

                {/* best % */}
                <div className="text-sm font-bold" style={{ color: plCol(row.bestPct) }}>
                  {plSign(row.bestPct)}{row.bestPct.toFixed(1)}%
                </div>

                {/* total P&L */}
                <div>
                  <p className="text-sm font-bold" style={{ color: plCol(row.totalPL) }}>{plSign(row.totalPL)}{fmtAmt(row.totalPL)}</p>
                  {row.openPct !== null && <p className="text-lo" style={{ fontSize: 10 }}>{plSign(row.openPct)}{row.openPct.toFixed(1)}% now</p>}
                </div>

                {/* last buy */}
                <div className="text-xs text-hi">{fmtDate(lastBuy)}</div>
              </div>

              {/* expanded */}
              {isExp && (
                <div style={{ background: 'rgba(15,20,30,0.85)', borderBottom: !isLast ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                  {row.cycles.map((cycle, ci) => {
                    const cc = cycle.status === 'open'
                      ? (cycle.plPct >= 0 ? '#4ade80' : '#f87171')
                      : (cycle.plPct >= 0 ? '#86efac' : '#fca5a5');
                    const cbg = cycle.status === 'open'
                      ? (cycle.plPct >= 0 ? '#052e16' : '#2d0a0a')
                      : 'rgba(255,255,255,0.08)';

                    return (
                      <div key={ci} style={{ borderBottom: ci < row.cycles.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>

                        {/* cycle header */}
                        <div className="flex flex-wrap items-center gap-2 px-5 py-2.5"
                          style={{ background: 'rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.09)' }}>
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={{ background: cbg, color: cc }}>
                            Cycle {cycle.no}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: cc }}>
                            {cycle.status === 'open' && <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ background: cc }} />}
                            {cycle.status === 'open' ? 'HOLDING' : cycle.plPct >= 0 ? 'SOLD ✓' : 'SOLD ✗'}
                          </span>
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>
                            {fmtDate(cycle.buyDate)} → {cycle.sellDate ? fmtDate(cycle.sellDate) : 'Present'}
                          </span>
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>· {holdLabel(cycle.daysHeld)}</span>
                          {cycle.tranches.length > 1 && (
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#14532d', color: '#86efac', fontSize: 10 }}>
                              {cycle.tranches.length} tranches
                            </span>
                          )}
                          <span className="ml-auto text-sm font-bold" style={{ color: cc }}>
                            {plSign(cycle.plPct)}{cycle.plPct.toFixed(1)}%
                            <span className="text-xs ml-1.5 font-semibold" style={{ color: cc, opacity: 0.85 }}>
                              ({plSign(cycle.plAmt)}{fmtAmt(cycle.plAmt)})
                            </span>
                          </span>
                        </div>

                        {/* tranche table head */}
                        <div className="grid text-xs font-semibold uppercase tracking-wide px-7 py-2"
                          style={{ gridTemplateColumns: '32px 110px 72px 88px 96px 72px 80px', background: 'rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)' }}>
                          <div>#</div>
                          <div>Buy Date</div>
                          <div>Qty</div>
                          <div>Buy Price</div>
                          <div>Running Avg</div>
                          <div>Total Qty</div>
                          <div>Held</div>
                        </div>

                        {/* tranche rows */}
                        {cycle.tranches.map((tr, ti) => {
                          const prev = ti > 0 ? cycle.tranches[ti - 1] : null;
                          const avgDir = prev ? (tr.runningAvg < prev.runningAvg ? 'down' : tr.runningAvg > prev.runningAvg ? 'up' : 'flat') : null;
                          const daysSince = Math.round((today.getTime() - tr.date.getTime()) / 86400000);
                          return (
                            <div key={ti} className="grid items-center px-7 py-2 text-xs"
                              style={{ gridTemplateColumns: '32px 110px 72px 88px 96px 72px 80px', borderBottom: ti < cycle.tranches.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none', background: ti % 2 === 1 ? 'rgba(255,255,255,0.04)' : 'transparent' }}>

                              {/* # */}
                              <div>
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold"
                                  style={{ background: '#14532d', color: '#4ade80', fontSize: 9 }}>{ti + 1}</span>
                              </div>
                              {/* date */}
                              <div className="font-semibold" style={{ color: '#ffffff' }}>{fmtDate(tr.date)}</div>
                              {/* qty */}
                              <div className="font-semibold" style={{ color: '#ffffff' }}>{tr.qty.toLocaleString('en-IN')}</div>
                              {/* buy price */}
                              <div>
                                {tr.price > 0 ? <span className="font-semibold" style={{ color: '#ffffff' }}>₹{tr.price.toFixed(2)}</span> : <span style={{ color: 'rgba(255,255,255,0.4)' }}>–</span>}
                              </div>
                              {/* running avg */}
                              <div>
                                <span className="font-bold" style={{ color: '#38bdf8' }}>₹{tr.runningAvg.toFixed(2)}</span>
                                {avgDir && avgDir !== 'flat' && (
                                  <span className="ml-1 text-xs" style={{ color: avgDir === 'down' ? '#4ade80' : '#f87171', fontSize: 9 }}>
                                    {avgDir === 'down' ? '▼ cheaper' : '▲ costlier'}
                                  </span>
                                )}
                              </div>
                              {/* total qty */}
                              <div className="font-semibold" style={{ color: '#ffffff' }}>{tr.runningQty.toLocaleString('en-IN')}</div>
                              {/* held */}
                              <div style={{ color: 'rgba(255,255,255,0.6)' }}>{holdLabel(daysSince)}</div>
                            </div>
                          );
                        })}

                        {/* cycle summary */}
                        <div className="grid items-center px-7 py-2.5 text-xs"
                          style={{ gridTemplateColumns: '32px 110px 72px 88px 96px 72px 80px', borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)' }}>
                          <div />
                          <div className="font-semibold" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10 }}>
                            {cycle.sellDate ? `Sold ${fmtDate(cycle.sellDate)}` : 'Open position'}
                          </div>
                          <div className="font-bold" style={{ color: '#ffffff' }}>{cycle.tranches.reduce((s, t) => s + t.qty, 0).toLocaleString('en-IN')}</div>
                          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>
                            {cycle.sellPrice > 0 ? `@ ₹${cycle.sellPrice.toFixed(2)}` : '—'}
                          </div>
                          <div className="font-bold" style={{ color: '#38bdf8' }}>₹{cycle.avgBuy.toFixed(2)} avg</div>
                          <div />
                          <div className="font-bold" style={{ color: cc }}>
                            {plSign(cycle.plPct)}{cycle.plPct.toFixed(1)}%
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

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-lo">
            Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of <span className="text-hi font-semibold">{filtered.length}</span> stocks
          </span>
          <PageNav />
        </div>
      )}

      {/* footer */}
      <div className="flex flex-wrap justify-between gap-2 text-xs text-lo px-1">
        <span>{allRows.length} stocks · {allRows.reduce((s, r) => s + r.cycles.length, 0)} cycles · {allRows.reduce((s, r) => s + r.totalBuys, 0)} buy tranches total</span>
        <span>FIFO cost basis · Click row to expand</span>
      </div>
    </div>
  );
}
