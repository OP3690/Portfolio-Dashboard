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

export default function HoldingsTable({ holdings }: HoldingsTableProps) {
  // Log holdings received for debugging
  useEffect(() => {
    console.log('HoldingsTable: Received', holdings.length, 'holdings');
  }, [holdings]);
  
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [selectedStock, setSelectedStock] = useState<string>('all');
  const [selectedHoldingPeriod, setSelectedHoldingPeriod] = useState<string>('all');
  const rowsPerPage = 10;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Get unique sectors from holdings
  const uniqueSectors = [...new Set(holdings.map(h => h.sectorName))].sort();

  // Get unique stock names from holdings
  const uniqueStocks = [...new Set(holdings.map(h => h.stockName))].sort();

  // Calculate total months for a holding
  const getTotalMonths = (holding: typeof holdings[0]): number => {
    const years = holding.holdingPeriodYears || 0;
    const months = holding.holdingPeriodMonths || 0;
    return years * 12 + months;
  };

  // Get holding period range category
  const getHoldingPeriodCategory = (holding: typeof holdings[0]): string => {
    const totalMonths = getTotalMonths(holding);
    
    if (totalMonths < 6) return 'lessThan6M';
    if (totalMonths >= 6 && totalMonths < 12) return '6Mto1Year';
    if (totalMonths >= 12 && totalMonths < 18) return '1YearTo1_5Year';
    if (totalMonths >= 18 && totalMonths < 24) return '1_5YearTo2Year';
    if (totalMonths >= 24 && totalMonths < 36) return '2YearTo3Year';
    if (totalMonths >= 36 && totalMonths < 60) return '3YearTo5Year';
    if (totalMonths >= 60) return 'moreThan5Years';
    return 'unknown';
  };

  // Filter holdings by selected sector, stock, and holding period
  const filteredHoldings = holdings.filter(h => {
    const sectorMatch = selectedSector === 'all' || h.sectorName === selectedSector;
    const stockMatch = selectedStock === 'all' || h.stockName === selectedStock;
    const holdingPeriodMatch = selectedHoldingPeriod === 'all' || getHoldingPeriodCategory(h) === selectedHoldingPeriod;
    return sectorMatch && stockMatch && holdingPeriodMatch;
  });

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Clear all filters
  const handleClearFilters = () => {
    setSelectedSector('all');
    setSelectedStock('all');
    setSelectedHoldingPeriod('all');
  };

  // Check if any filter is active
  const hasActiveFilters = selectedSector !== 'all' || selectedStock !== 'all' || selectedHoldingPeriod !== 'all';

  // Pagination calculations - based on filtered holdings
  const totalPages = Math.ceil(filteredHoldings.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;

  const sortedHoldings = [...filteredHoldings].sort((a, b) => {
    if (!sortConfig) return 0;
    
    const aValue = (a as any)[sortConfig.key];
    const bValue = (b as any)[sortConfig.key];
    
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  // Apply pagination to sorted holdings
  const paginatedHoldings = sortedHoldings.slice(startIndex, endIndex);
  
  // Reset to page 1 when filter changes or when total pages changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSector, selectedStock, selectedHoldingPeriod]);

  // Reset to page 1 when current page is out of bounds
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  // Get the most recent date from holdings (asOnDate or lastUpdated)
  const getLastRefreshedDate = (): string => {
    if (holdings.length === 0) return '';
    
    const dates: Date[] = [];
    holdings.forEach(h => {
      if (h.asOnDate) {
        dates.push(new Date(h.asOnDate));
      }
      if (h.lastUpdated) {
        dates.push(new Date(h.lastUpdated));
      }
    });
    
    if (dates.length === 0) return '';
    
    const latestDate = new Date(Math.max(...dates.map(d => d.getTime())));
    
    // Format as "DD MMM YYYY, HH:MM AM/PM"
    const options: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    };
    
    return latestDate.toLocaleString('en-US', options);
  };

  const lastRefreshed = getLastRefreshedDate();

  const handleRefresh = async () => {
    if (holdings.length === 0) return;
    
    setIsRefreshing(true);
    setRefreshMessage(null);
    
    try {
      // Set timeout to prevent infinite loading (15 minutes for initial 5-year fetches)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout after 15 minutes. The process may still be running in the background.')), 15 * 60 * 1000)
      );
      
      // Use the same refreshLatest logic - fetches last 3 days for stocks with 5-year data
      // Also refresh ALL stocks (not just holdings) to ensure latest stock date is updated
      const fetchPromise = fetch('/api/fetch-historical-data?refreshAllStocks=true', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshLatest: true, // Refresh last 3 days including today for stocks with 5-year data
        }),
      });
      
      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Use the message from API which now includes details about refreshed vs fetched stocks
        const message = data.message || `Successfully processed ${data.stocksProcessed || 0} stocks (${data.totalRecords || 0} records).`;
        
        setRefreshMessage({ 
          type: 'success', 
          text: message
        });
        // Refresh the page after 2 seconds to show updated data
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setRefreshMessage({ type: 'error', text: data.error || 'Failed to refresh stock data' });
        setIsRefreshing(false);
      }
    } catch (error: any) {
      console.error('Error refreshing stock data:', error);
      setRefreshMessage({ 
        type: 'error', 
        text: error.message || 'Error refreshing stock data. Please try again.' 
      });
      setIsRefreshing(false);
      // Clear message after 5 seconds
      setTimeout(() => {
        setRefreshMessage(null);
      }, 5000);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">Holdings Details</h2>
        <div className="flex items-center gap-4">
          {lastRefreshed && (
            <div className="text-sm text-gray-500">
              Last refreshed: <span className="font-medium text-gray-700">{lastRefreshed}</span>
            </div>
          )}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || holdings.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {isRefreshing ? 'Refreshing...' : 'Refresh Stock Data'}
          </button>
        </div>
      </div>
      
      {/* Filters */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label htmlFor="sector-filter" className="text-sm font-medium text-gray-700">
            Filter by Sector:
          </label>
          <select
            id="sector-filter"
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value)}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            <option value="all">All Sectors ({holdings.length})</option>
            {uniqueSectors.map((sector) => {
              const count = holdings.filter(h => h.sectorName === sector).length;
              return (
                <option key={sector} value={sector}>
                  {sector} ({count})
                </option>
              );
            })}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="stock-filter" className="text-sm font-medium text-gray-700">
            Filter by Stock:
          </label>
          <select
            id="stock-filter"
            value={selectedStock}
            onChange={(e) => setSelectedStock(e.target.value)}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white min-w-[200px]"
          >
            <option value="all">All Stocks ({holdings.length})</option>
            {uniqueStocks.map((stock) => {
              const count = holdings.filter(h => h.stockName === stock).length;
              return (
                <option key={stock} value={stock}>
                  {stock} ({count})
                </option>
              );
            })}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="holding-period-filter" className="text-sm font-medium text-gray-700">
            Filter by Holding Period:
          </label>
          <select
            id="holding-period-filter"
            value={selectedHoldingPeriod}
            onChange={(e) => setSelectedHoldingPeriod(e.target.value)}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white min-w-[180px]"
          >
            <option value="all">All Periods ({holdings.length})</option>
            <option value="lessThan6M">
              Less than 6M ({holdings.filter(h => getHoldingPeriodCategory(h) === 'lessThan6M').length})
            </option>
            <option value="6Mto1Year">
              6M to 1 Year ({holdings.filter(h => getHoldingPeriodCategory(h) === '6Mto1Year').length})
            </option>
            <option value="1YearTo1_5Year">
              1 Year to 1.5 Year ({holdings.filter(h => getHoldingPeriodCategory(h) === '1YearTo1_5Year').length})
            </option>
            <option value="1_5YearTo2Year">
              1.5 Year to 2 Year ({holdings.filter(h => getHoldingPeriodCategory(h) === '1_5YearTo2Year').length})
            </option>
            <option value="2YearTo3Year">
              2 Year to 3 Year ({holdings.filter(h => getHoldingPeriodCategory(h) === '2YearTo3Year').length})
            </option>
            <option value="3YearTo5Year">
              3 Year to 5 Year ({holdings.filter(h => getHoldingPeriodCategory(h) === '3YearTo5Year').length})
            </option>
            <option value="moreThan5Years">
              More than 5 Years ({holdings.filter(h => getHoldingPeriodCategory(h) === 'moreThan5Years').length})
            </option>
          </select>
        </div>
        {hasActiveFilters && (
          <>
            <span className="text-sm text-gray-600">
              Showing {filteredHoldings.length} of {holdings.length} holdings
            </span>
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 hover:border-red-300 transition-colors"
              title="Clear all filters"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Clear Filters
            </button>
          </>
        )}
      </div>
      {refreshMessage && (
        <div
          className={`mb-4 p-3 rounded-md text-sm ${
            refreshMessage.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {refreshMessage.text}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th
                onClick={() => handleSort('stockName')}
                className="text-left py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
              >
                Stock Name
              </th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Sector</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Qty</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Avg Cost</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Current Price</th>
              <th
                onClick={() => handleSort('marketValue')}
                className="text-right py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
              >
                Current Value
              </th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Invested</th>
              <th
                onClick={() => handleSort('profitLossTillDatePercent')}
                className="text-right py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
              >
                P/L %
              </th>
              <th
                onClick={() => handleSort('profitLossTillDate')}
                className="text-right py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
              >
                P/L Amount
              </th>
              <th
                onClick={() => handleSort('xirr')}
                className="text-right py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
              >
                XIRR
              </th>
              <th
                onClick={() => handleSort('cagr')}
                className="text-right py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
              >
                CAGR
              </th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">
                Holding Period
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedHoldings.map((holding) => (
              <tr key={holding.isin} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4">
                  <div className="font-medium text-gray-800">{holding.stockName}</div>
                  <div className="text-xs text-gray-500">{holding.isin}</div>
                </td>
                <td className="py-3 px-4 text-gray-600 text-sm">{holding.sectorName}</td>
                <td className="py-3 px-4 text-right text-gray-700">{holding.openQty}</td>
                <td className="py-3 px-4 text-right text-gray-700">
                  {formatCurrency(holding.avgCost || 0)}
                </td>
                <td className="py-3 px-4 text-right text-gray-700">
                  {formatCurrency(holding.marketPrice || 0)}
                </td>
                <td className="py-3 px-4 text-right font-medium text-gray-800">
                  {formatCurrency(holding.marketValue)}
                </td>
                <td className="py-3 px-4 text-right text-gray-700">
                  {formatCurrency(holding.investmentAmount || 0)}
                </td>
                <td
                  className={`py-3 px-4 text-right font-semibold ${
                    holding.profitLossTillDatePercent >= 0
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {holding.profitLossTillDatePercent >= 0 ? '+' : ''}
                  {holding.profitLossTillDatePercent.toFixed(2)}%
                </td>
                <td
                  className={`py-3 px-4 text-right font-semibold ${
                    holding.profitLossTillDate >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {formatCurrency(holding.profitLossTillDate)}
                </td>
                <td className={`py-3 px-4 text-right font-semibold ${
                  (holding.xirr || 0) >= 9 ? 'text-green-600' : 
                  (holding.xirr || 0) >= 5 ? 'text-yellow-600' : 
                  'text-red-600'
                }`}>
                  {holding.xirr !== undefined ? `${holding.xirr >= 0 ? '+' : ''}${holding.xirr.toFixed(2)}%` : 'N/A'}
                </td>
                <td className={`py-3 px-4 text-right font-semibold ${
                  (holding.cagr || 0) >= 9 ? 'text-green-600' : 
                  (holding.cagr || 0) >= 5 ? 'text-yellow-600' : 
                  'text-red-600'
                }`}>
                  {holding.cagr !== undefined ? `${holding.cagr >= 0 ? '+' : ''}${holding.cagr.toFixed(2)}%` : 'N/A'}
                </td>
                <td className="py-3 px-4 text-right text-gray-700">
                  {holding.holdingPeriodYears !== undefined && holding.holdingPeriodMonths !== undefined
                    ? `${holding.holdingPeriodYears}Y ${holding.holdingPeriodMonths}M`
                    : 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {filteredHoldings.length > 0 && (
        <div className="flex items-center justify-between mt-4 px-4 py-3 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            Showing {startIndex + 1} to {Math.min(endIndex, filteredHoldings.length)} of {filteredHoldings.length} holdings
            {selectedSector !== 'all' && ` (filtered from ${holdings.length} total)`}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                // Show first page, last page, current page, and pages around current
                if (
                  page === 1 ||
                  page === totalPages ||
                  (page >= currentPage - 1 && page <= currentPage + 1)
                ) {
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                        currentPage === page
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  );
                } else if (
                  page === currentPage - 2 ||
                  page === currentPage + 2
                ) {
                  return (
                    <span key={page} className="px-2 text-gray-400">
                      ...
                    </span>
                  );
                }
                return null;
              })}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
      
      {holdings.length === 0 && (
        <p className="text-center text-gray-500 py-8">No holdings data available</p>
      )}
    </div>
  );
}

