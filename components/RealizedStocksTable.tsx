'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils';

interface RealizedStocksTableProps {
  realizedStocks: Array<{
    stockName: string;
    sectorName: string;
    isin: string;
    qtySold: number;
    avgCost: number;
    avgSoldPrice: number;
    totalInvested: number;
    lastSoldDate: Date | string;
    currentPrice: number;
    currentValue: number;
    realizedPL: number;
    unrealizedPL: number;
    totalPL: number;
    totalPLPercent: number;
    xirr: number;
    cagr: number;
    holdingPeriodYears: number;
    holdingPeriodMonths: number;
    holdingPeriodDays: number;
  }>;
  onRefresh?: () => void;
}

export default function RealizedStocksTable({ realizedStocks, onRefresh }: RealizedStocksTableProps) {
  // Calculate summary statistics
  const totalInvested = realizedStocks.reduce((sum, stock) => sum + (stock.totalInvested || 0), 0);
  const totalRealizedPL = realizedStocks.reduce((sum, stock) => sum + (stock.realizedPL || 0), 0);
  const totalRealizedPLPercent = totalInvested > 0 ? (totalRealizedPL / totalInvested) * 100 : 0;
  const totalUnrealizedPL = realizedStocks
    .filter(stock => stock.currentPrice > 0) // Only count stocks with current price
    .reduce((sum, stock) => sum + (stock.unrealizedPL || 0), 0);
  const totalUnrealizedPLPercent = totalInvested > 0 ? (totalUnrealizedPL / totalInvested) * 100 : 0;
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [selectedStock, setSelectedStock] = useState<string>('all');
  const [selectedHoldingPeriod, setSelectedHoldingPeriod] = useState<string>('all');
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [fetchMessage, setFetchMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const rowsPerPage = 10;

  // Get unique sectors from realized stocks
  const uniqueSectors = [...new Set(realizedStocks.map(s => s.sectorName))].sort();

  // Get unique stock names from realized stocks
  const uniqueStocks = [...new Set(realizedStocks.map(s => s.stockName))].sort();

  // Calculate total months for a realized stock
  const getTotalMonths = (stock: typeof realizedStocks[0]): number => {
    const years = stock.holdingPeriodYears || 0;
    const months = stock.holdingPeriodMonths || 0;
    return years * 12 + months;
  };

  // Get holding period range category
  const getHoldingPeriodCategory = (stock: typeof realizedStocks[0]): string => {
    const totalMonths = getTotalMonths(stock);
    
    if (totalMonths < 6) return 'lessThan6M';
    if (totalMonths >= 6 && totalMonths < 12) return '6Mto1Year';
    if (totalMonths >= 12 && totalMonths < 18) return '1YearTo1_5Year';
    if (totalMonths >= 18 && totalMonths < 24) return '1_5YearTo2Year';
    if (totalMonths >= 24 && totalMonths < 36) return '2YearTo3Year';
    if (totalMonths >= 36 && totalMonths < 60) return '3YearTo5Year';
    if (totalMonths >= 60) return 'moreThan5Years';
    return 'unknown';
  };

  // Filter realized stocks by selected sector, stock, and holding period
  const filteredStocks = realizedStocks.filter(s => {
    const sectorMatch = selectedSector === 'all' || s.sectorName === selectedSector;
    const stockMatch = selectedStock === 'all' || s.stockName === selectedStock;
    const holdingPeriodMatch = selectedHoldingPeriod === 'all' || getHoldingPeriodCategory(s) === selectedHoldingPeriod;
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

  // Pagination calculations - based on filtered stocks
  const totalPages = Math.ceil(filteredStocks.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;

  const sortedStocks = [...filteredStocks].sort((a, b) => {
    if (!sortConfig) return 0;
    
    const aValue = (a as any)[sortConfig.key];
    const bValue = (b as any)[sortConfig.key];
    
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  // Apply pagination to sorted stocks
  const paginatedStocks = sortedStocks.slice(startIndex, endIndex);
  
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

  // Format last sold date
  const formatDate = (date: Date | string): string => {
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return 'N/A';
    }
  };

  const handleFetchPrices = async () => {
    setFetchingPrices(true);
    setFetchMessage(null);
    
    try {
      // Get ISINs of realized stocks that don't have current prices
      const isinsToFetch = realizedStocks
        .filter(s => s.currentPrice === 0)
        .map(s => s.isin);
      
      if (isinsToFetch.length === 0) {
        setFetchMessage({ type: 'success', text: 'All stocks already have current prices!' });
        setFetchingPrices(false);
        return;
      }
      
      setFetchMessage({ 
        type: 'success', 
        text: `Fetching prices for ${isinsToFetch.length} stocks... This may take a few minutes.` 
      });
      
      // Use AbortController with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout
      
      try {
        const response = await fetch('/api/fetch-historical-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            isins: isinsToFetch,
          }),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to fetch prices');
        }
        
        const data = await response.json();
        setFetchMessage({ 
          type: 'success', 
          text: `Successfully fetched prices for ${data.stocksProcessed || isinsToFetch.length} stocks! Refreshing...` 
        });
        
        // Reload the page after a short delay to show updated prices
        setTimeout(() => {
          if (onRefresh) {
            onRefresh();
          } else {
            window.location.reload();
          }
        }, 2000);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Request timed out. Please try fetching fewer stocks at a time.');
        }
        throw fetchError;
      }
    } catch (error: any) {
      console.error('Error fetching prices:', error);
      setFetchMessage({ 
        type: 'error', 
        text: error.message || 'Failed to fetch stock prices. Please try again.' 
      });
    } finally {
      setFetchingPrices(false);
    }
  };

  if (realizedStocks.length === 0) {
    return null; // Don't show the section if there are no realized stocks
  }

  const stocksWithoutPrices = realizedStocks.filter(s => s.currentPrice === 0).length;

  return (
    <div className="bg-white rounded-xl shadow-lg p-4 mt-6">
      <div className="mb-3">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-gray-800">Realized Stocks (What They'd Be Worth Today)</h2>
            {stocksWithoutPrices > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  {stocksWithoutPrices} stock(s) missing prices
                </span>
                <button
                  onClick={handleFetchPrices}
                  disabled={fetchingPrices}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  {fetchingPrices ? 'Fetching...' : 'Fetch Current Prices'}
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <div className="text-gray-700">
              <span className="font-semibold">Invested Value:</span>{' '}
              <span className="text-gray-800">{formatCurrency(totalInvested)}</span>
            </div>
            <div className={totalRealizedPL >= 0 ? 'text-green-600' : 'text-red-600'}>
              <span className="font-semibold">Realized P/L:</span>{' '}
              <span>{formatCurrency(totalRealizedPL)}</span>
              <span className="ml-1">
                ({totalRealizedPL >= 0 ? '+' : ''}{totalRealizedPLPercent.toFixed(2)}%)
              </span>
            </div>
            <div className={totalUnrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'}>
              <span className="font-semibold">Unrealized P/L (If Held):</span>{' '}
              <span>{formatCurrency(totalUnrealizedPL)}</span>
              <span className="ml-1">
                ({totalUnrealizedPL >= 0 ? '+' : ''}{totalUnrealizedPLPercent.toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>
      </div>
      
      {fetchMessage && (
        <div className={`mb-3 p-2.5 rounded-md text-sm ${
          fetchMessage.type === 'success' 
            ? 'bg-green-100 text-green-800 border border-green-200' 
            : 'bg-red-100 text-red-800 border border-red-200'
        }`}>
          {fetchMessage.text}
        </div>
      )}
      
      {/* Filters */}
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label htmlFor="realized-sector-filter" className="text-sm font-medium text-gray-700">
            Filter by Sector:
          </label>
          <select
            id="realized-sector-filter"
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            <option value="all">All Sectors ({realizedStocks.length})</option>
            {uniqueSectors.map((sector) => {
              const count = realizedStocks.filter(s => s.sectorName === sector).length;
              return (
                <option key={sector} value={sector}>
                  {sector} ({count})
                </option>
              );
            })}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="realized-stock-filter" className="text-sm font-medium text-gray-700">
            Filter by Stock:
          </label>
          <select
            id="realized-stock-filter"
            value={selectedStock}
            onChange={(e) => setSelectedStock(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white min-w-[200px]"
          >
            <option value="all">All Stocks ({realizedStocks.length})</option>
            {uniqueStocks.map((stock) => {
              const count = realizedStocks.filter(s => s.stockName === stock).length;
              return (
                <option key={stock} value={stock}>
                  {stock} ({count})
                </option>
              );
            })}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="realized-holding-period-filter" className="text-sm font-medium text-gray-700">
            Filter by Holding Period:
          </label>
          <select
            id="realized-holding-period-filter"
            value={selectedHoldingPeriod}
            onChange={(e) => setSelectedHoldingPeriod(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white min-w-[180px]"
          >
            <option value="all">All Periods ({realizedStocks.length})</option>
            <option value="lessThan6M">
              Less than 6M ({realizedStocks.filter(s => getHoldingPeriodCategory(s) === 'lessThan6M').length})
            </option>
            <option value="6Mto1Year">
              6M to 1 Year ({realizedStocks.filter(s => getHoldingPeriodCategory(s) === '6Mto1Year').length})
            </option>
            <option value="1YearTo1_5Year">
              1 Year to 1.5 Year ({realizedStocks.filter(s => getHoldingPeriodCategory(s) === '1YearTo1_5Year').length})
            </option>
            <option value="1_5YearTo2Year">
              1.5 Year to 2 Year ({realizedStocks.filter(s => getHoldingPeriodCategory(s) === '1_5YearTo2Year').length})
            </option>
            <option value="2YearTo3Year">
              2 Year to 3 Year ({realizedStocks.filter(s => getHoldingPeriodCategory(s) === '2YearTo3Year').length})
            </option>
            <option value="3YearTo5Year">
              3 Year to 5 Year ({realizedStocks.filter(s => getHoldingPeriodCategory(s) === '3YearTo5Year').length})
            </option>
            <option value="moreThan5Years">
              More than 5 Years ({realizedStocks.filter(s => getHoldingPeriodCategory(s) === 'moreThan5Years').length})
            </option>
          </select>
        </div>
        {hasActiveFilters && (
          <>
            <span className="text-sm text-gray-600">
              Showing {filteredStocks.length} of {realizedStocks.length} stocks
            </span>
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 hover:border-red-300 transition-colors"
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
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th
                onClick={() => handleSort('stockName')}
                className="text-left py-2.5 px-3 text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
              >
                Stock Name
              </th>
              <th className="text-left py-2.5 px-3 text-sm font-semibold text-gray-700">Sector</th>
              <th className="text-right py-2.5 px-3 text-sm font-semibold text-gray-700">Qty Sold</th>
              <th className="text-right py-2.5 px-3 text-sm font-semibold text-gray-700">Avg Cost</th>
              <th className="text-right py-2.5 px-3 text-sm font-semibold text-gray-700">Avg Sold Price</th>
              <th className="text-right py-2.5 px-3 text-sm font-semibold text-gray-700">Current Price</th>
              <th className="text-right py-2.5 px-3 text-sm font-semibold text-gray-700">Current Value</th>
              <th className="text-right py-2.5 px-3 text-sm font-semibold text-gray-700">Invested</th>
              <th
                onClick={() => handleSort('realizedPL')}
                className="text-right py-2.5 px-3 text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
              >
                Realized P/L
              </th>
              <th
                onClick={() => handleSort('unrealizedPL')}
                className="text-right py-2.5 px-3 text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
              >
                Unrealized P/L (If Held)
              </th>
              <th
                onClick={() => handleSort('totalPLPercent')}
                className="text-right py-2.5 px-3 text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
              >
                Realized P/L %
              </th>
              <th className="text-right py-2.5 px-3 text-sm font-semibold text-gray-700">Last Sold Date</th>
              <th className="text-right py-2.5 px-3 text-sm font-semibold text-gray-700">Holding Period</th>
            </tr>
          </thead>
          <tbody>
            {paginatedStocks.map((stock) => (
              <tr key={stock.isin} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3">
                  <div className="font-medium text-gray-800 text-sm">{stock.stockName}</div>
                  <div className="text-xs text-gray-500">{stock.isin}</div>
                </td>
                <td className="py-2 px-3 text-gray-600 text-sm">{stock.sectorName}</td>
                <td className="py-2 px-3 text-right text-gray-700 text-sm">{stock.qtySold}</td>
                <td className="py-2 px-3 text-right text-gray-700 text-sm">
                  {formatCurrency(stock.avgCost)}
                </td>
                <td className="py-2 px-3 text-right text-gray-700 font-medium text-sm">
                  {formatCurrency(stock.avgSoldPrice || 0)}
                </td>
                <td className="py-2 px-3 text-right text-gray-700 text-sm">
                  {stock.currentPrice > 0 ? formatCurrency(stock.currentPrice) : 'N/A'}
                </td>
                <td className="py-2 px-3 text-right font-medium text-gray-800 text-sm">
                  {stock.currentValue > 0 ? formatCurrency(stock.currentValue) : 'N/A'}
                </td>
                <td className="py-2 px-3 text-right text-gray-700 text-sm">
                  {formatCurrency(stock.totalInvested)}
                </td>
                <td
                  className={`py-2 px-3 text-right font-semibold text-sm ${
                    stock.realizedPL >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {formatCurrency(stock.realizedPL)}
                </td>
                <td
                  className={`py-2 px-3 text-right font-semibold text-sm ${
                    stock.currentPrice > 0 
                      ? (stock.unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600')
                      : 'text-gray-400'
                  }`}
                >
                  {stock.currentPrice > 0 ? (
                    <div className="flex flex-col items-end">
                      <div>{formatCurrency(stock.unrealizedPL)}</div>
                      {stock.totalInvested > 0 && (
                        <div className="text-xs font-normal">
                          ({stock.unrealizedPL >= 0 ? '+' : ''}
                          {((stock.unrealizedPL / stock.totalInvested) * 100).toFixed(2)}%)
                        </div>
                      )}
                    </div>
                  ) : 'N/A'}
                </td>
                <td
                  className={`py-2 px-3 text-right font-semibold text-sm ${
                    stock.totalPLPercent >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {stock.totalPLPercent >= 0 ? '+' : ''}
                  {stock.totalPLPercent.toFixed(2)}%
                </td>
                <td className="py-2 px-3 text-right text-gray-700 text-sm">
                  {formatDate(stock.lastSoldDate)}
                </td>
                <td className="py-2 px-3 text-right text-gray-700 text-sm">
                  {stock.holdingPeriodYears === 0 && stock.holdingPeriodMonths === 0
                    ? `${stock.holdingPeriodDays}D`
                    : `${stock.holdingPeriodYears}Y ${stock.holdingPeriodMonths}M`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {filteredStocks.length > 0 && (
        <div className="flex items-center justify-between mt-4 px-4 py-3 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            Showing {startIndex + 1} to {Math.min(endIndex, filteredStocks.length)} of {filteredStocks.length} stocks
            {hasActiveFilters && ` (filtered from ${realizedStocks.length} total)`}
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
    </div>
  );
}

