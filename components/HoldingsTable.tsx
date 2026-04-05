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
    style={{ opacity: active ? 1 : 0.3, color: active ? '#10b981' : 'inherit' }}>
    {!active || dir === 'asc'
      ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />}
  </svg>
);

export default function HoldingsTable({ holdings }: HoldingsTableProps) {
  useEffect(() => { console.log('HoldingsTable:', holdings.length, 'holdings'); }, [holdings]);

  const [sortConfig,           setSortConfig]           = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [currentPage,          setCurrentPage]          = useState(1);
  const [selectedSector,       setSelectedSector]       = useState('all');
  const [selectedStock,        setSelectedStock]        = useState('all');
  const [selectedHoldingPeriod,setSelectedHoldingPeriod]= useState('all');
  const [isRefreshing,         setIsRefreshing]         = useState(false);
  const [refreshMessage,       setRefreshMessage]       = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const rowsPerPage = 10;

  const uniqueSectors = [...new Set(holdings.map(h => h.sectorName))].sort();
  const uniqueStocks  = [...new Set(holdings.map(h => h.stockName))].sort();

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

  const filteredHoldings = holdings.filter(h =>
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

  const totalPages       = Math.ceil(filteredHoldings.length / rowsPerPage);
  const startIndex       = (currentPage - 1) * rowsPerPage;
  const paginatedHoldings= sortedHoldings.slice(startIndex, startIndex + rowsPerPage);
  const hasActiveFilters = selectedSector !== 'all' || selectedStock !== 'all' || selectedHoldingPeriod !== 'all';

  useEffect(() => { setCurrentPage(1); }, [selectedSector, selectedStock, selectedHoldingPeriod]);
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
        color: sortConfig?.key === sortKey ? '#10b981' : '#4b5d78',
        cursor: sortKey ? 'pointer' : 'default',
        background: '#0f1629',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {label}
      {sortKey && SORT_ICON(sortConfig?.key === sortKey, sortConfig?.direction || 'asc')}
    </th>
  );

  const numCell = (v: number, showSign = true) => (
    <span className="font-mono font-semibold text-xs" style={{ color: !showSign ? '#f0f4ff' : v >= 0 ? '#10b981' : '#f43f5e' }}>
      {showSign && v >= 0 ? '+' : ''}{v >= 0 || !showSign ? '' : ''}
      {showSign ? (v >= 0 ? `+${formatCurrency(v)}` : formatCurrency(v)) : formatCurrency(v)}
    </span>
  );

  const pctCell = (v: number) => (
    <span className="font-mono font-semibold text-xs" style={{ color: v >= 0 ? '#10b981' : '#f43f5e' }}>
      {v >= 0 ? '+' : ''}{v.toFixed(2)}%
    </span>
  );

  const selectStyle: React.CSSProperties = {
    background: '#161e35',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#f0f4ff',
    outline: 'none',
    borderRadius: 10,
    padding: '6px 10px',
    fontSize: '0.8rem',
    fontWeight: 500,
  };

  return (
    <div className="rounded-2xl overflow-hidden animate-fadeIn"
      style={{ background: '#0f1629', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>

      {/* Header */}
      <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)' }}>
            <svg className="w-4 h-4" style={{ color: '#60a5fa' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Holdings</h2>
            <p className="text-[10px]" style={{ color: '#4b5d78' }}>
              {filteredHoldings.length} stocks{hasActiveFilters ? ` (filtered from ${holdings.length})` : ''}
              {getLastRefreshedDate() && ` · ${getLastRefreshedDate()}`}
            </p>
          </div>
        </div>

        <button onClick={handleRefresh} disabled={isRefreshing || !holdings.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
          style={{
            background: isRefreshing ? 'rgba(255,255,255,0.04)' : 'rgba(16,185,129,0.1)',
            border: `1px solid ${isRefreshing ? 'rgba(255,255,255,0.08)' : 'rgba(16,185,129,0.2)'}`,
            color: isRefreshing ? '#4b5d78' : '#10b981',
            cursor: isRefreshing ? 'not-allowed' : 'pointer',
          }}>
          <svg className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Filters */}
      <div className="px-5 py-3 flex flex-wrap gap-2 items-center"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <select value={selectedSector} onChange={e => setSelectedSector(e.target.value)} style={selectStyle}>
          <option value="all">All Sectors ({holdings.length})</option>
          {uniqueSectors.map(s => (
            <option key={s} value={s}>{s} ({holdings.filter(h => h.sectorName === s).length})</option>
          ))}
        </select>
        <select value={selectedStock} onChange={e => setSelectedStock(e.target.value)} style={{ ...selectStyle, minWidth: 160 }}>
          <option value="all">All Stocks ({holdings.length})</option>
          {uniqueStocks.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={selectedHoldingPeriod} onChange={e => setSelectedHoldingPeriod(e.target.value)} style={{ ...selectStyle, minWidth: 150 }}>
          <option value="all">All Periods</option>
          <option value="lessThan6M">{'< 6 Months'} ({holdings.filter(h => getPeriodCategory(h) === 'lessThan6M').length})</option>
          <option value="6Mto1Year">6M – 1Y ({holdings.filter(h => getPeriodCategory(h) === '6Mto1Year').length})</option>
          <option value="1YearTo1_5Year">1 – 1.5Y ({holdings.filter(h => getPeriodCategory(h) === '1YearTo1_5Year').length})</option>
          <option value="1_5YearTo2Year">1.5 – 2Y ({holdings.filter(h => getPeriodCategory(h) === '1_5YearTo2Year').length})</option>
          <option value="2YearTo3Year">2 – 3Y ({holdings.filter(h => getPeriodCategory(h) === '2YearTo3Year').length})</option>
          <option value="3YearTo5Year">3 – 5Y ({holdings.filter(h => getPeriodCategory(h) === '3YearTo5Year').length})</option>
          <option value="moreThan5Years">{'> 5 Years'} ({holdings.filter(h => getPeriodCategory(h) === 'moreThan5Years').length})</option>
        </select>
        {hasActiveFilters && (
          <button onClick={() => { setSelectedSector('all'); setSelectedStock('all'); setSelectedHoldingPeriod('all'); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', color: '#f87171' }}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear
          </button>
        )}
      </div>

      {/* Refresh message */}
      {refreshMessage && (
        <div className="px-5 py-2.5 text-xs font-semibold"
          style={{
            background: refreshMessage.type === 'success' ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)',
            color: refreshMessage.type === 'success' ? '#10b981' : '#f43f5e',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}>
          {refreshMessage.text}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <TH label="Stock" sortKey="stockName" align="left" />
              <TH label="Sector" align="left" />
              <TH label="Qty" sortKey="openQty" />
              <TH label="Avg Cost" sortKey="avgCost" />
              <TH label="Price" sortKey="marketPrice" />
              <TH label="Mkt Value" sortKey="marketValue" />
              <TH label="Invested" sortKey="investmentAmount" />
              <TH label="P/L %" sortKey="profitLossTillDatePercent" />
              <TH label="P/L ₹" sortKey="profitLossTillDate" />
              <TH label="XIRR" sortKey="xirr" />
              <TH label="CAGR" sortKey="cagr" />
              <TH label="Period" />
            </tr>
          </thead>
          <tbody>
            {paginatedHoldings.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-10 text-center text-sm" style={{ color: '#4b5d78' }}>
                  No holdings match your filters
                </td>
              </tr>
            ) : paginatedHoldings.map((h, idx) => (
              <tr key={h.isin}
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(16,185,129,0.05)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'; }}
              >
                <td className="px-4 py-3">
                  <p className="text-xs font-bold text-white">{h.stockName}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: '#4b5d78' }}>{h.isin}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-md"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>
                    {h.sectorName}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-xs font-mono" style={{ color: '#f0f4ff' }}>{h.openQty}</td>
                <td className="px-4 py-3 text-right text-xs font-mono" style={{ color: '#94a3b8' }}>{formatCurrency(h.avgCost || 0)}</td>
                <td className="px-4 py-3 text-right text-xs font-mono" style={{ color: '#f0f4ff' }}>{formatCurrency(h.marketPrice || 0)}</td>
                <td className="px-4 py-3 text-right text-xs font-mono font-semibold" style={{ color: '#f0f4ff' }}>{formatCurrency(h.marketValue)}</td>
                <td className="px-4 py-3 text-right text-xs font-mono" style={{ color: '#94a3b8' }}>{formatCurrency(h.investmentAmount || 0)}</td>
                <td className="px-4 py-3 text-right">{pctCell(h.profitLossTillDatePercent)}</td>
                <td className="px-4 py-3 text-right">{numCell(h.profitLossTillDate)}</td>
                <td className="px-4 py-3 text-right">
                  {h.xirr !== undefined
                    ? <span className="font-mono text-xs font-semibold"
                        style={{ color: h.xirr >= 9 ? '#10b981' : h.xirr >= 5 ? '#f59e0b' : '#f43f5e' }}>
                        {h.xirr >= 0 ? '+' : ''}{h.xirr.toFixed(2)}%
                      </span>
                    : <span className="text-xs" style={{ color: '#4b5d78' }}>N/A</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  {h.cagr !== undefined
                    ? <span className="font-mono text-xs font-semibold"
                        style={{ color: h.cagr >= 9 ? '#10b981' : h.cagr >= 5 ? '#f59e0b' : '#f43f5e' }}>
                        {h.cagr >= 0 ? '+' : ''}{h.cagr.toFixed(2)}%
                      </span>
                    : <span className="text-xs" style={{ color: '#4b5d78' }}>N/A</span>}
                </td>
                <td className="px-4 py-3 text-right text-xs font-mono" style={{ color: '#94a3b8' }}>
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
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs" style={{ color: '#4b5d78' }}>
            {startIndex + 1}–{Math.min(startIndex + rowsPerPage, filteredHoldings.length)} of {filteredHoldings.length}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: currentPage === 1 ? '#334155' : '#94a3b8', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}>
              ←
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
              if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                return (
                  <button key={page} onClick={() => setCurrentPage(page)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: currentPage === page ? '#10b981' : 'rgba(255,255,255,0.05)',
                      border: '1px solid ' + (currentPage === page ? 'transparent' : 'rgba(255,255,255,0.08)'),
                      color: currentPage === page ? '#fff' : '#94a3b8',
                      boxShadow: currentPage === page ? '0 4px 10px rgba(16,185,129,0.35)' : 'none',
                    }}>
                    {page}
                  </button>
                );
              }
              if (page === currentPage - 2 || page === currentPage + 2) {
                return <span key={page} className="text-xs" style={{ color: '#4b5d78' }}>…</span>;
              }
              return null;
            })}
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: currentPage === totalPages ? '#334155' : '#94a3b8', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}>
              →
            </button>
          </div>
        </div>
      )}

      {holdings.length === 0 && (
        <div className="py-10 text-center">
          <p className="text-sm" style={{ color: '#4b5d78' }}>No holdings data available</p>
        </div>
      )}
    </div>
  );
}
