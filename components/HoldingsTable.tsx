'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils';

interface HoldingsTableProps {
  holdings: Array<{
    stockName: string;
    sectorName: string;
    isin: string;
    openQty: number;
    marketPrice: number;
    marketValue: number;
    investmentAmount: number;
    avgCost?: number;
    profitLossTillDate: number;
    profitLossTillDatePercent: number;
    asOnDate?: Date | string;
    lastUpdated?: Date | string;
    xirr?: number;
    cagr?: number;
    holdingPeriodYears?: number;
    holdingPeriodMonths?: number;
  }>;
}

const SORT_ICON = (active: boolean, dir: 'asc' | 'desc') => (
  <svg className="w-3 h-3 inline ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"
    style={{ opacity: active ? 1 : 0.3, color: active ? 'var(--gain)' : 'inherit' }}>
    {!active || dir === 'asc'
      ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />}
  </svg>
);

export default function HoldingsTable({ holdings }: HoldingsTableProps) {
  useEffect(() => { console.log('HoldingsTable:', holdings.length, 'holdings'); }, [holdings]);

  const [sortConfig,            setSortConfig]            = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [currentPage,           setCurrentPage]           = useState(1);
  const [selectedSector,        setSelectedSector]        = useState('all');
  const [selectedStock,         setSelectedStock]         = useState('all');
  const [selectedHoldingPeriod, setSelectedHoldingPeriod] = useState('all');
  const [showClosed,            setShowClosed]            = useState(false);
  const [isRefreshing,          setIsRefreshing]          = useState(false);
  const [refreshMessage,        setRefreshMessage]        = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const rowsPerPage = 10;

  // Split into active vs closed
  const activeHoldings = holdings.filter(h => (h.openQty || 0) > 0);
  const closedCount    = holdings.length - activeHoldings.length;
  const baseHoldings   = showClosed ? holdings : activeHoldings;

  const uniqueSectors = [...new Set(baseHoldings.map(h => h.sectorName))].sort();
  const uniqueStocks  = [...new Set(baseHoldings.map(h => h.stockName))].sort();

  const getTotalMonths = (h: typeof holdings[0]) => (h.holdingPeriodYears || 0) * 12 + (h.holdingPeriodMonths || 0);

  const getPeriodCategory = (h: typeof holdings[0]) => {
    const m = getTotalMonths(h);
    if (m < 6)  return 'lessThan6M';
    if (m < 12) return '6Mto1Year';
    if (m < 18) return '1YearTo1_5Year';
    if (m < 24) return '1_5YearTo2Year';
    if (m < 36) return '2YearTo3Year';
    if (m < 60) return '3YearTo5Year';
    return 'moreThan5Years';
  };

  const filteredHoldings = baseHoldings.filter(h =>
    (selectedSector === 'all' || h.sectorName === selectedSector) &&
    (selectedStock  === 'all' || h.stockName  === selectedStock)  &&
    (selectedHoldingPeriod === 'all' || getPeriodCategory(h) === selectedHoldingPeriod)
  );

  const handleSort = (key: string) => {
    setSortConfig(prev =>
      prev?.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );
  };

  const sortedHoldings = [...filteredHoldings].sort((a, b) => {
    if (!sortConfig) return 0;
    const av = (a as any)[sortConfig.key], bv = (b as any)[sortConfig.key];
    return sortConfig.direction === 'asc' ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
  });

  const totalPages        = Math.ceil(filteredHoldings.length / rowsPerPage);
  const startIndex        = (currentPage - 1) * rowsPerPage;
  const paginatedHoldings = sortedHoldings.slice(startIndex, startIndex + rowsPerPage);
  const hasActiveFilters  = selectedSector !== 'all' || selectedStock !== 'all' || selectedHoldingPeriod !== 'all';

  useEffect(() => { setCurrentPage(1); }, [selectedSector, selectedStock, selectedHoldingPeriod, showClosed]);
  useEffect(() => { if (currentPage > totalPages && totalPages > 0) setCurrentPage(1); }, [totalPages, currentPage]);

  const getLastRefreshedDate = () => {
    const dates = holdings.flatMap(h => [h.asOnDate, h.lastUpdated].filter(Boolean).map(d => new Date(d!)));
    if (!dates.length) return '';
    return new Date(Math.max(...dates.map(d => d.getTime()))).toLocaleString('en-US', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
    });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true); setRefreshMessage(null);
    try {
      const timeoutP = new Promise((_, r) => setTimeout(() => r(new Error('Timeout after 15 min')), 15 * 60 * 1000));
      const fetchP   = fetch('/api/fetch-historical-data?refreshAllStocks=true', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshLatest: true }),
      });
      const res  = await Promise.race([fetchP, timeoutP]) as Response;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setRefreshMessage({ type: 'success', text: data.message || `Processed ${data.stocksProcessed || 0} stocks.` });
        setTimeout(() => window.location.reload(), 2000);
      } else throw new Error(data.error || 'Refresh failed');
    } catch (e: any) {
      setRefreshMessage({ type: 'error', text: e.message || 'Error refreshing. Try again.' });
      setIsRefreshing(false);
      setTimeout(() => setRefreshMessage(null), 5000);
    }
  };

  const TH = ({ label, sortKey, align = 'right' }: { label: string; sortKey?: string; align?: 'left' | 'right' }) => (
    <th
      onClick={() => sortKey && handleSort(sortKey)}
      className={`px-4 py-3 text-${align} text-[10px] font-bold uppercase tracking-widest whitespace-nowrap select-none`}
      style={{
        color: sortConfig?.key === sortKey ? 'var(--gain)' : 'var(--text-mid)',
        cursor: sortKey ? 'pointer' : 'default',
        background: 'var(--bg-raised)',
        borderBottom: '1px solid var(--border-sm)',
      }}
    >
      {label}
      {sortKey && SORT_ICON(sortConfig?.key === sortKey, sortConfig?.direction || 'asc')}
    </th>
  );

  const pctCell = (v: number) => (
    <span className="font-mono font-semibold text-xs"
      style={{ color: v >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
      {v >= 0 ? '+' : ''}{v.toFixed(2)}%
    </span>
  );

  const numCell = (v: number) => (
    <span className="font-mono font-semibold text-xs"
      style={{ color: v >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
      {v >= 0 ? '+' : ''}{formatCurrency(v)}
    </span>
  );

  return (
    <div className="card overflow-hidden animate-fadeIn">

      {/* Header */}
      <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3"
        style={{ borderBottom: '1px solid var(--border-sm)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--brand-bg)', border: '1px solid color-mix(in srgb, var(--brand) 30%, transparent)' }}>
            <svg className="w-4 h-4" style={{ color: 'var(--brand)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-hi">Holdings</h2>
            <p className="text-[10px] text-lo">
              {filteredHoldings.length} stocks{hasActiveFilters ? ` (filtered from ${baseHoldings.length})` : ''}
              {getLastRefreshedDate() && ` · ${getLastRefreshedDate()}`}
            </p>
          </div>
        </div>

        <button onClick={handleRefresh} disabled={isRefreshing || !holdings.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
          style={{
            background: isRefreshing ? 'var(--bg-raised)' : 'color-mix(in srgb, var(--gain) 10%, transparent)',
            border: `1px solid ${isRefreshing ? 'var(--border-sm)' : 'color-mix(in srgb, var(--gain) 30%, transparent)'}`,
            color: isRefreshing ? 'var(--text-lo)' : 'var(--gain)',
            cursor: isRefreshing ? 'not-allowed' : 'pointer',
          }}>
          <svg className={`w-4 h-4 flex-shrink-0 ${isRefreshing ? 'animate-spin' : ''}`}
            viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd"
              d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" />
          </svg>
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Filters */}
      <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border-sm)' }}>
        {/* Three equal-width selects */}
        <div className="grid grid-cols-3 gap-3">
          {/* Sector */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-lo)' }}>
              Sector
            </label>
            <select value={selectedSector} onChange={e => setSelectedSector(e.target.value)} className="form-input text-xs py-1.5 w-full">
              <option value="all">All ({baseHoldings.length})</option>
              {uniqueSectors.map(s => (
                <option key={s} value={s}>{s} ({baseHoldings.filter(h => h.sectorName === s).length})</option>
              ))}
            </select>
          </div>

          {/* Stock */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-lo)' }}>
              Stock
            </label>
            <select value={selectedStock} onChange={e => setSelectedStock(e.target.value)} className="form-input text-xs py-1.5 w-full">
              <option value="all">All ({baseHoldings.length})</option>
              {uniqueStocks.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Holding Period */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-lo)' }}>
              Holding Period
            </label>
            <select value={selectedHoldingPeriod} onChange={e => setSelectedHoldingPeriod(e.target.value)} className="form-input text-xs py-1.5 w-full">
              <option value="all">All Periods</option>
              <option value="lessThan6M">{'< 6 Months'} ({baseHoldings.filter(h => getPeriodCategory(h) === 'lessThan6M').length})</option>
              <option value="6Mto1Year">6M – 1Y ({baseHoldings.filter(h => getPeriodCategory(h) === '6Mto1Year').length})</option>
              <option value="1YearTo1_5Year">1Y – 1.5Y ({baseHoldings.filter(h => getPeriodCategory(h) === '1YearTo1_5Year').length})</option>
              <option value="1_5YearTo2Year">1.5Y – 2Y ({baseHoldings.filter(h => getPeriodCategory(h) === '1_5YearTo2Year').length})</option>
              <option value="2YearTo3Year">2Y – 3Y ({baseHoldings.filter(h => getPeriodCategory(h) === '2YearTo3Year').length})</option>
              <option value="3YearTo5Year">3Y – 5Y ({baseHoldings.filter(h => getPeriodCategory(h) === '3YearTo5Year').length})</option>
              <option value="moreThan5Years">{'> 5 Years'} ({baseHoldings.filter(h => getPeriodCategory(h) === 'moreThan5Years').length})</option>
            </select>
          </div>
        </div>

        {/* Action pills row */}
        {(closedCount > 0 || hasActiveFilters) && (
          <div className="flex items-center gap-2 mt-3">
            {closedCount > 0 && (
              <button
                onClick={() => setShowClosed(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all"
                style={{
                  background: showClosed ? 'color-mix(in srgb, var(--warn) 12%, transparent)' : 'var(--bg-raised)',
                  border: `1px solid ${showClosed ? 'color-mix(in srgb, var(--warn) 30%, transparent)' : 'var(--border-sm)'}`,
                  color: showClosed ? 'var(--warn)' : 'var(--text-mid)',
                }}>
                <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                  <path d={showClosed
                    ? 'M10 12a2 2 0 100-4 2 2 0 000 4zM.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10z'
                    : 'M13.477 14.89A6 6 0 015.11 6.524L13.477 14.89zm1.414 1.414L5.11 6.524a8 8 0 1010.664 10.664zM12.89 5.11A6 6 0 016.524 13.477L12.89 5.11zm1.414-1.414L5.11 6.524'
                  }/>
                </svg>
                {showClosed ? `Hide closed (${closedCount})` : `Show closed (${closedCount})`}
              </button>
            )}
            {hasActiveFilters && (
              <button
                onClick={() => { setSelectedSector('all'); setSelectedStock('all'); setSelectedHoldingPeriod('all'); }}
                className="flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold transition-all"
                style={{
                  background: 'color-mix(in srgb, var(--loss) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--loss) 25%, transparent)',
                  color: 'var(--loss)',
                }}>
                <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
                </svg>
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Refresh message */}
      {refreshMessage && (
        <div className="px-5 py-2.5 text-xs font-semibold"
          style={{
            background: refreshMessage.type === 'success'
              ? 'color-mix(in srgb, var(--gain) 8%, transparent)'
              : 'color-mix(in srgb, var(--loss) 8%, transparent)',
            color: refreshMessage.type === 'success' ? 'var(--gain)' : 'var(--loss)',
            borderBottom: '1px solid var(--border-sm)',
          }}>
          {refreshMessage.text}
        </div>
      )}

      {/* Table */}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <TH label="Stock"    sortKey="stockName"                align="left" />
              <TH label="Sector"                                      align="left" />
              <TH label="Qty"      sortKey="openQty" />
              <TH label="Avg Cost" sortKey="avgCost" />
              <TH label="Price"    sortKey="marketPrice" />
              <TH label="Mkt Value" sortKey="marketValue" />
              <TH label="Invested" sortKey="investmentAmount" />
              <TH label="P/L %"    sortKey="profitLossTillDatePercent" />
              <TH label="P/L ₹"    sortKey="profitLossTillDate" />
              <TH label="XIRR"     sortKey="xirr" />
              <TH label="CAGR"     sortKey="cagr" />
              <TH label="Period" />
            </tr>
          </thead>
          <tbody>
            {paginatedHoldings.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-10 text-center text-sm text-lo">
                  No holdings match your filters
                </td>
              </tr>
            ) : paginatedHoldings.map((h, idx) => (
              <tr key={h.isin}
                style={{
                  borderBottom: '1px solid var(--border-sm)',
                  background: idx % 2 === 0 ? 'transparent' : 'var(--bg-raised)',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLTableRowElement).style.background =
                    'color-mix(in srgb, var(--gain) 5%, transparent)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLTableRowElement).style.background =
                    idx % 2 === 0 ? 'transparent' : 'var(--bg-raised)';
                }}
              >
                <td className="px-4 py-3">
                  <p className="text-xs font-bold text-hi">{h.stockName}</p>
                  <p className="text-[10px] mt-0.5 text-lo">{h.isin}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-md"
                    style={{ background: 'var(--bg-raised)', color: 'var(--text-mid)', border: '1px solid var(--border-sm)' }}>
                    {h.sectorName}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-xs font-mono text-hi">{h.openQty}</td>
                <td className="px-4 py-3 text-right text-xs font-mono text-mid">{formatCurrency(h.avgCost || 0)}</td>
                <td className="px-4 py-3 text-right text-xs font-mono text-hi">{formatCurrency(h.marketPrice || 0)}</td>
                <td className="px-4 py-3 text-right text-xs font-mono font-semibold text-hi">{formatCurrency(h.marketValue)}</td>
                <td className="px-4 py-3 text-right text-xs font-mono text-mid">{formatCurrency(h.investmentAmount || 0)}</td>
                <td className="px-4 py-3 text-right">{pctCell(h.profitLossTillDatePercent)}</td>
                <td className="px-4 py-3 text-right">{numCell(h.profitLossTillDate)}</td>
                <td className="px-4 py-3 text-right">
                  {h.xirr !== undefined
                    ? <span className="font-mono text-xs font-semibold"
                        style={{ color: h.xirr >= 9 ? 'var(--gain)' : h.xirr >= 5 ? 'var(--warn)' : 'var(--loss)' }}>
                        {h.xirr >= 0 ? '+' : ''}{h.xirr.toFixed(2)}%
                      </span>
                    : <span className="text-xs text-lo">N/A</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  {h.cagr !== undefined
                    ? <span className="font-mono text-xs font-semibold"
                        style={{ color: h.cagr >= 9 ? 'var(--gain)' : h.cagr >= 5 ? 'var(--warn)' : 'var(--loss)' }}>
                        {h.cagr >= 0 ? '+' : ''}{h.cagr.toFixed(2)}%
                      </span>
                    : <span className="text-xs text-lo">N/A</span>}
                </td>
                <td className="px-4 py-3 text-right text-xs font-mono text-mid">
                  {h.holdingPeriodYears !== undefined && h.holdingPeriodMonths !== undefined
                    ? `${h.holdingPeriodYears}Y ${h.holdingPeriodMonths}M`
                    : 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filteredHoldings.length > 0 && (
        <div className="flex items-center justify-between px-5 py-3"
          style={{ borderTop: '1px solid var(--border-sm)' }}>
          <p className="text-xs text-lo">
            {startIndex + 1}–{Math.min(startIndex + rowsPerPage, filteredHoldings.length)} of {filteredHoldings.length}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: 'var(--bg-raised)',
                border: '1px solid var(--border-sm)',
                color: currentPage === 1 ? 'var(--text-lo)' : 'var(--text-mid)',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                opacity: currentPage === 1 ? 0.5 : 1,
              }}>
              ←
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
              if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                return (
                  <button key={page} onClick={() => setCurrentPage(page)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: currentPage === page ? 'var(--brand)' : 'var(--bg-raised)',
                      border: '1px solid ' + (currentPage === page ? 'transparent' : 'var(--border-sm)'),
                      color: currentPage === page ? '#fff' : 'var(--text-mid)',
                      boxShadow: currentPage === page ? '0 2px 8px color-mix(in srgb, var(--brand) 35%, transparent)' : 'none',
                    }}>
                    {page}
                  </button>
                );
              }
              if (page === currentPage - 2 || page === currentPage + 2) {
                return <span key={page} className="text-xs text-lo">…</span>;
              }
              return null;
            })}
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: 'var(--bg-raised)',
                border: '1px solid var(--border-sm)',
                color: currentPage === totalPages ? 'var(--text-lo)' : 'var(--text-mid)',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                opacity: currentPage === totalPages ? 0.5 : 1,
              }}>
              →
            </button>
          </div>
        </div>
      )}

      {holdings.length === 0 && (
        <div className="py-10 text-center">
          <p className="text-sm text-lo">No holdings data available</p>
        </div>
      )}
    </div>
  );
}
