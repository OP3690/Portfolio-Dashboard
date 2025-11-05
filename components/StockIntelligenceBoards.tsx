'use client';

import { useState, useEffect } from 'react';

interface FinancialResult {
  isin: string;
  symbol: string;
  stockName: string;
  lastQuarterEnded: Date;
  expectedDate: Date;
  daysUntil: number;
  lastTotalIncome?: number;
  lastNetProfit?: number;
  lastEPS?: number;
  currentPrice?: number | null;
  qnqGrowth?: string | null;
}

interface PromoterHoldingChange {
  isin: string;
  symbol: string;
  stockName: string;
  currentHolding: number;
  previousHolding: number;
  change: number;
  changePercent: number;
  currentDate: Date;
  previousDate: Date;
  daysAgo: number;
  currentPrice?: number | null;
}

export default function StockIntelligenceBoards() {
  const [financialResults, setFinancialResults] = useState<{
    [key: number]: FinancialResult[];
  }>({});
  const [allFinancialResults, setAllFinancialResults] = useState<{
    [key: number]: FinancialResult[];
  }>({});
  const [promoterIncreasing, setPromoterIncreasing] = useState<{
    [key: number]: PromoterHoldingChange[];
  }>({});
  const [allPromoterIncreasing, setAllPromoterIncreasing] = useState<{
    [key: number]: PromoterHoldingChange[];
  }>({});
  const [promoterDecreasing, setPromoterDecreasing] = useState<{
    [key: number]: PromoterHoldingChange[];
  }>({});
  const [allPromoterDecreasing, setAllPromoterDecreasing] = useState<{
    [key: number]: PromoterHoldingChange[];
  }>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'results' | 'increasing' | 'decreasing'>('results');
  
  // Days Until filter state
  const [daysUntilFilter, setDaysUntilFilter] = useState<'all' | '1-5' | '6-10' | '11-15' | '15-30' | '30+'>('all');
  
  // Change % filter state for promoter holdings
  const [changePercentFilter, setChangePercentFilter] = useState<{
    [key: string]: 'all' | '0-1' | '1-2' | '2-5' | '5-10' | '10+';
  }>({
    increasing: 'all',
    decreasing: 'all',
  });
  
  // Client-side pagination for filtered results
  const [filteredPage, setFilteredPage] = useState(1);
  const [holdingFilteredPage, setHoldingFilteredPage] = useState<{
    [key: string]: number;
  }>({});
  const itemsPerPage = 10;
  
  // Pagination state for each period
  const [pagination, setPagination] = useState<{
    [key: string]: { page: number; totalPages: number; totalCount: number };
  }>({});

  useEffect(() => {
    fetchAllData();
  }, []);

  const [loadingPages, setLoadingPages] = useState<{ [key: string]: boolean }>({});

  const fetchFinancialResults = async (days: number, page: number = 1, fetchAll: boolean = false) => {
    const loadingKey = `results-${days}-${page}`;
    setLoadingPages(prev => ({ ...prev, [loadingKey]: true }));
    
    try {
      // Fetch all results if fetchAll is true, otherwise use pagination
      const limit = fetchAll ? 10000 : 10;
      const response = await fetch(`/api/financial-results-calendar?days=${days}&page=${page}&limit=${limit}`);
      const result = await response.json();
      if (result.success) {
        if (fetchAll) {
          // Store all results
          setAllFinancialResults(prev => ({
            ...prev,
            [days]: result.results || [],
          }));
          setPagination(prev => ({
            ...prev,
            [`results-${days}`]: {
              page: 1,
              totalPages: 1,
              totalCount: result.count || result.results?.length || 0,
            },
          }));
        } else {
          // Store paginated results
          setFinancialResults(prev => ({
            ...prev,
            [days]: result.results || [],
          }));
          setPagination(prev => ({
            ...prev,
            [`results-${days}`]: {
              page: result.page || 1,
              totalPages: result.totalPages || 1,
              totalCount: result.count || 0,
            },
          }));
        }
      }
    } catch (error) {
      console.error(`Error fetching ${days}-day results:`, error);
      if (fetchAll) {
        setAllFinancialResults(prev => ({
          ...prev,
          [days]: [],
        }));
      } else {
        setFinancialResults(prev => ({
          ...prev,
          [days]: [],
        }));
      }
    } finally {
      setLoadingPages(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  const fetchPromoterHoldingChanges = async (type: 'increasing' | 'decreasing', days: number, page: number = 1, fetchAll: boolean = false) => {
    try {
      // Fetch all results if fetchAll is true, otherwise use pagination
      const limit = fetchAll ? 10000 : 10;
      const response = await fetch(`/api/promoter-holding-changes?type=${type}&days=${days}&page=${page}&limit=${limit}`);
      const result = await response.json();
      if (result.success) {
        const results = result.results || result.changes || [];
        if (fetchAll) {
          // Store all results
          if (type === 'increasing') {
            setAllPromoterIncreasing(prev => ({
              ...prev,
              [days]: results,
            }));
          } else {
            setAllPromoterDecreasing(prev => ({
              ...prev,
              [days]: results,
            }));
          }
          setPagination(prev => ({
            ...prev,
            [`${type}-${days}`]: {
              page: 1,
              totalPages: 1,
              totalCount: result.count || results.length || 0,
            },
          }));
        } else {
          // Store paginated results
          if (type === 'increasing') {
            setPromoterIncreasing(prev => ({
              ...prev,
              [days]: results,
            }));
          } else {
            setPromoterDecreasing(prev => ({
              ...prev,
              [days]: results,
            }));
          }
          setPagination(prev => ({
            ...prev,
            [`${type}-${days}`]: {
              page: result.page || 1,
              totalPages: result.totalPages || 1,
              totalCount: result.count || 0,
            },
          }));
        }
      }
    } catch (error) {
      console.error(`Error fetching ${days}-day ${type} holdings:`, error);
      if (fetchAll) {
        if (type === 'increasing') {
          setAllPromoterIncreasing(prev => ({
            ...prev,
            [days]: [],
          }));
        } else {
          setAllPromoterDecreasing(prev => ({
            ...prev,
            [days]: [],
          }));
        }
      } else {
        if (type === 'increasing') {
          setPromoterIncreasing(prev => ({
            ...prev,
            [days]: [],
          }));
        } else {
          setPromoterDecreasing(prev => ({
            ...prev,
            [days]: [],
          }));
        }
      }
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Fetch ALL financial results for 365 days (not paginated) to enable client-side filtering
      await fetchFinancialResults(365, 1, true);

      // Fetch ALL promoter holding changes for 7 days (which will include all available data) to enable client-side filtering
      await fetchPromoterHoldingChanges('increasing', 30, 1, true); // Use 30 days to get all available data
      await fetchPromoterHoldingChanges('decreasing', 30, 1, true); // Use 30 days to get all available data
    } catch (error) {
      console.error('Error fetching intelligence data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatNumber = (value: number, decimals: number = 2) => {
    return value.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        <span className="ml-3 text-gray-600">Loading intelligence data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex space-x-4 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('results')}
            className={`px-4 py-2 font-semibold transition-colors ${
              activeTab === 'results'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            📅 Financial Results Calendar
          </button>
          <button
            onClick={() => setActiveTab('increasing')}
            className={`px-4 py-2 font-semibold transition-colors ${
              activeTab === 'increasing'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            📈 Promoter Holding Increasing
          </button>
          <button
            onClick={() => setActiveTab('decreasing')}
            className={`px-4 py-2 font-semibold transition-colors ${
              activeTab === 'decreasing'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            📉 Promoter Holding Decreasing
          </button>
        </div>
      </div>

      {/* Financial Results Calendar */}
      {activeTab === 'results' && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-800">📅 Upcoming Financial Results</h2>
          
          {/* Next 30 Days - Shows all upcoming results */}
          {[365].map((days) => {
            // Get all results from the store
            const allResults = allFinancialResults[days] || [];
            
            // Filter results based on daysUntilFilter
            const filteredResults = allResults.filter((result) => {
              const daysUntil = result.daysUntil;
              switch (daysUntilFilter) {
                case '1-5':
                  return daysUntil >= 1 && daysUntil <= 5;
                case '6-10':
                  return daysUntil >= 6 && daysUntil <= 10;
                case '11-15':
                  return daysUntil >= 11 && daysUntil <= 15;
                case '15-30':
                  return daysUntil >= 15 && daysUntil <= 30;
                case '30+':
                  return daysUntil > 30;
                case 'all':
                default:
                  return true;
              }
            });
            
            // Client-side pagination for filtered results
            const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
            const startIndex = (filteredPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const paginatedFilteredResults = filteredResults.slice(startIndex, endIndex);
            
            // Reset to page 1 when filter changes
            const handleFilterChange = (newFilter: typeof daysUntilFilter) => {
              setDaysUntilFilter(newFilter);
              setFilteredPage(1);
            };
            
            return (
            <div key={days} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4">
                <h3 className="text-xl font-bold text-white">
                  Next 30 Days & More ({allResults.length || 0} stocks)
                </h3>
              </div>
              
              {/* Days Until Filter Buttons */}
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleFilterChange('all')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      daysUntilFilter === 'all'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => handleFilterChange('1-5')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      daysUntilFilter === '1-5'
                        ? 'bg-red-600 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    1 to 5 Days
                  </button>
                  <button
                    onClick={() => handleFilterChange('6-10')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      daysUntilFilter === '6-10'
                        ? 'bg-orange-600 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    6 to 10 Days
                  </button>
                  <button
                    onClick={() => handleFilterChange('11-15')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      daysUntilFilter === '11-15'
                        ? 'bg-yellow-600 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    11 to 15 Days
                  </button>
                  <button
                    onClick={() => handleFilterChange('15-30')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      daysUntilFilter === '15-30'
                        ? 'bg-green-600 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    15 to 30 Days
                  </button>
                  <button
                    onClick={() => handleFilterChange('30+')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      daysUntilFilter === '30+'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    30+ Days
                  </button>
                </div>
                <div className="mt-2 text-sm text-gray-600">
                  {daysUntilFilter === 'all' 
                    ? `Showing ${allResults.length} results`
                    : `Showing ${filteredResults.length} of ${allResults.length} results (filtered)`
                  }
                </div>
              </div>
              
              {allResults.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Stock</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Expected Date</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Days Until</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Last Quarter</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">QnQ Growth</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Last Income (Lakhs)</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Last Net Profit (Lakhs)</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Last EPS</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Current Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {loadingPages[`results-${days}-1`] ? (
                          <tr>
                            <td colSpan={9} className="px-4 py-8 text-center">
                              <div className="flex items-center justify-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                                <span className="ml-3 text-gray-600">Loading...</span>
                              </div>
                            </td>
                          </tr>
                        ) : paginatedFilteredResults.length > 0 ? (
                          paginatedFilteredResults.map((result, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="font-semibold text-gray-900">{result.stockName}</div>
                                <div className="text-sm text-gray-500">{result.symbol} • {result.isin}</div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-800">{formatDate(result.expectedDate)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`px-2 py-1 rounded text-sm font-semibold ${
                                result.daysUntil <= 7 ? 'bg-red-100 text-red-800' :
                                result.daysUntil <= 15 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-green-100 text-green-800'
                              }`}>
                                {result.daysUntil} days
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-600">{formatDate(result.lastQuarterEnded)}</td>
                            <td className="px-4 py-3 text-right text-sm">
                              {result.qnqGrowth ? (
                                <div className="flex items-center justify-end">
                                  <div className="flex items-center gap-1 font-mono text-xs font-semibold">
                                    {result.qnqGrowth.split(' → ').map((growth, idx) => {
                                      // Parse growth value
                                      const isPositive = growth.startsWith('+') || (growth !== '∞' && growth !== '-∞' && !growth.startsWith('-'));
                                      const isNegative = growth.startsWith('-') || growth === '-∞';
                                      const isInfinity = growth === '∞' || growth === '-∞';
                                      
                                      return (
                                        <span key={idx}>
                                          {idx > 0 && <span className="text-gray-400 mx-0.5">→</span>}
                                          <span className={`px-1.5 py-0.5 rounded ${
                                            isInfinity ? 'text-gray-600' :
                                            isPositive ? 'text-green-700 bg-green-50' :
                                            isNegative ? 'text-red-700 bg-red-50' :
                                            'text-gray-600'
                                          }`}>
                                            {growth}
                                          </span>
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-400">N/A</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-800">
                              {result.lastTotalIncome ? formatNumber(result.lastTotalIncome) : 'N/A'}
                            </td>
                            <td className={`px-4 py-3 text-right text-sm font-semibold ${
                              result.lastNetProfit && result.lastNetProfit >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {result.lastNetProfit ? formatNumber(result.lastNetProfit) : 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-800">
                              {result.lastEPS ? formatNumber(result.lastEPS, 2) : 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-indigo-600">
                              {result.currentPrice ? formatCurrency(result.currentPrice) : 'N/A'}
                            </td>
                          </tr>
                        ))
                        ) : (
                          <tr>
                            <td colSpan={9} className="px-4 py-8 text-center">
                              <div className="text-gray-500">No results found for the selected filter.</div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Client-side Pagination for Filtered Results */}
                  {totalPages > 1 && (
                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                      <div className="text-sm text-gray-700">
                        Showing {startIndex + 1} to {Math.min(endIndex, filteredResults.length)} of {filteredResults.length} results
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setFilteredPage(prev => Math.max(1, prev - 1))}
                          disabled={filteredPage <= 1}
                          className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        <div className="text-sm text-gray-700">
                          Page {filteredPage} of {totalPages}
                        </div>
                        <button
                          onClick={() => setFilteredPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={filteredPage >= totalPages}
                          className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="px-6 py-8 text-center">
                  <div className="text-gray-500 mb-2">No financial results scheduled in the next {days} days.</div>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* Promoter Holding Increasing */}
      {activeTab === 'increasing' && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-800">📈 Promoter & Promoter Group Holding - Increasing</h2>
          
          {(() => {
            // Use 30 days to get all available data (stored as "Last 7 Days & More")
            const days = 30;
            // Get all results from the store
            const allResults = allPromoterIncreasing[days] || [];
            
            // Filter results based on changePercentFilter
            const filteredResults = allResults.filter((change) => {
              const changePercent = Math.abs(change.changePercent);
              const filter = changePercentFilter.increasing;
              
              switch (filter) {
                case '0-1':
                  return changePercent >= 0 && changePercent < 1;
                case '1-2':
                  return changePercent >= 1 && changePercent < 2;
                case '2-5':
                  return changePercent >= 2 && changePercent < 5;
                case '5-10':
                  return changePercent >= 5 && changePercent < 10;
                case '10+':
                  return changePercent >= 10;
                case 'all':
                default:
                  return true;
              }
            });
            
            // Client-side pagination for filtered results
            const pageKey = `increasing-${days}`;
            const currentPage = holdingFilteredPage[pageKey] || 1;
            const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const paginatedFilteredResults = filteredResults.slice(startIndex, endIndex);
            
            // Reset to page 1 when filter changes
            const handleFilterChange = (newFilter: typeof changePercentFilter.increasing) => {
              setChangePercentFilter(prev => ({
                ...prev,
                increasing: newFilter,
              }));
              setHoldingFilteredPage(prev => ({
                ...prev,
                [pageKey]: 1,
              }));
            };
            
            return (
            <div key={days} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4">
                <h3 className="text-xl font-bold text-white">
                  Last 7 Days & More ({allResults.length || 0} stocks)
                </h3>
              </div>
              
              {/* Change % Filter Buttons */}
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleFilterChange('all')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      changePercentFilter.increasing === 'all'
                        ? 'bg-green-600 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => handleFilterChange('0-1')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      changePercentFilter.increasing === '0-1'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    0 to 1%
                  </button>
                  <button
                    onClick={() => handleFilterChange('1-2')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      changePercentFilter.increasing === '1-2'
                        ? 'bg-cyan-600 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    1 to 2%
                  </button>
                  <button
                    onClick={() => handleFilterChange('2-5')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      changePercentFilter.increasing === '2-5'
                        ? 'bg-teal-600 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    2 to 5%
                  </button>
                  <button
                    onClick={() => handleFilterChange('5-10')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      changePercentFilter.increasing === '5-10'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    5 to 10%
                  </button>
                  <button
                    onClick={() => handleFilterChange('10+')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      changePercentFilter.increasing === '10+'
                        ? 'bg-green-700 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    10%+
                  </button>
                </div>
                <div className="mt-2 text-sm text-gray-600">
                  {changePercentFilter.increasing === 'all' 
                    ? `Showing ${allResults.length} results`
                    : `Showing ${filteredResults.length} of ${allResults.length} results (filtered)`
                  }
                </div>
              </div>
              
              {allResults.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Stock</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Current Holding %</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Previous Holding %</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Change %</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Change % Points</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Current Date</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Current Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {paginatedFilteredResults.length > 0 ? (
                          paginatedFilteredResults.map((change, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="font-semibold text-gray-900">{change.stockName}</div>
                                <div className="text-sm text-gray-500">{change.symbol} • {change.isin}</div>
                              </td>
                              <td className="px-4 py-3 text-right text-sm font-semibold text-green-600">
                                {formatNumber(change.currentHolding, 2)}%
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-gray-600">
                                {formatNumber(change.previousHolding, 2)}%
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm font-semibold">
                                  +{formatNumber(change.changePercent, 2)}%
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-sm font-semibold text-green-600">
                                +{formatNumber(change.change, 2)} pp
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">{formatDate(change.currentDate)}</td>
                              <td className="px-4 py-3 text-right text-sm font-semibold text-indigo-600">
                                {change.currentPrice ? formatCurrency(change.currentPrice) : 'N/A'}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center">
                              <div className="text-gray-500">No results found for the selected filter.</div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Client-side Pagination for Filtered Results */}
                  {filteredResults.length > itemsPerPage && (
                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                      <div className="text-sm text-gray-700">
                        Showing {startIndex + 1} to {Math.min(endIndex, filteredResults.length)} of {filteredResults.length} results
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setHoldingFilteredPage(prev => ({
                            ...prev,
                            [pageKey]: Math.max(1, (prev[pageKey] || 1) - 1),
                          }))}
                          disabled={currentPage <= 1}
                          className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        <div className="text-sm text-gray-700">
                          Page {currentPage} of {totalPages}
                        </div>
                        <button
                          onClick={() => setHoldingFilteredPage(prev => ({
                            ...prev,
                            [pageKey]: Math.min(totalPages, (prev[pageKey] || 1) + 1),
                          }))}
                          disabled={currentPage >= totalPages}
                          className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="px-6 py-8 text-center">
                  <div className="text-gray-500 mb-2">No stocks with increasing promoter holding in the last 7 days.</div>
                </div>
              )}
            </div>
            );
          })()}
        </div>
      )}

      {/* Promoter Holding Decreasing */}
      {activeTab === 'decreasing' && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-800">📉 Promoter & Promoter Group Holding - Decreasing</h2>
          
          {(() => {
            // Use 30 days to get all available data (stored as "Last 7 Days & More")
            const days = 30;
            // Get all results from the store
            const allResults = allPromoterDecreasing[days] || [];
            
            // Filter results based on changePercentFilter
            const filteredResults = allResults.filter((change) => {
              const changePercent = Math.abs(change.changePercent);
              const filter = changePercentFilter.decreasing;
              
              switch (filter) {
                case '0-1':
                  return changePercent >= 0 && changePercent < 1;
                case '1-2':
                  return changePercent >= 1 && changePercent < 2;
                case '2-5':
                  return changePercent >= 2 && changePercent < 5;
                case '5-10':
                  return changePercent >= 5 && changePercent < 10;
                case '10+':
                  return changePercent >= 10;
                case 'all':
                default:
                  return true;
              }
            });
            
            // Client-side pagination for filtered results
            const pageKey = `decreasing-${days}`;
            const currentPage = holdingFilteredPage[pageKey] || 1;
            const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const paginatedFilteredResults = filteredResults.slice(startIndex, endIndex);
            
            // Reset to page 1 when filter changes
            const handleFilterChange = (newFilter: typeof changePercentFilter.decreasing) => {
              setChangePercentFilter(prev => ({
                ...prev,
                decreasing: newFilter,
              }));
              setHoldingFilteredPage(prev => ({
                ...prev,
                [pageKey]: 1,
              }));
            };
            
            return (
            <div key={days} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-red-500 to-rose-600 px-6 py-4">
                <h3 className="text-xl font-bold text-white">
                  Last 7 Days & More ({allResults.length || 0} stocks)
                </h3>
              </div>
              
              {/* Change % Filter Buttons */}
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleFilterChange('all')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      changePercentFilter.decreasing === 'all'
                        ? 'bg-red-600 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => handleFilterChange('0-1')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      changePercentFilter.decreasing === '0-1'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    0 to 1%
                  </button>
                  <button
                    onClick={() => handleFilterChange('1-2')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      changePercentFilter.decreasing === '1-2'
                        ? 'bg-cyan-600 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    1 to 2%
                  </button>
                  <button
                    onClick={() => handleFilterChange('2-5')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      changePercentFilter.decreasing === '2-5'
                        ? 'bg-orange-600 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    2 to 5%
                  </button>
                  <button
                    onClick={() => handleFilterChange('5-10')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      changePercentFilter.decreasing === '5-10'
                        ? 'bg-rose-600 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    5 to 10%
                  </button>
                  <button
                    onClick={() => handleFilterChange('10+')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      changePercentFilter.decreasing === '10+'
                        ? 'bg-red-700 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    10%+
                  </button>
                </div>
                <div className="mt-2 text-sm text-gray-600">
                  {changePercentFilter.decreasing === 'all' 
                    ? `Showing ${allResults.length} results`
                    : `Showing ${filteredResults.length} of ${allResults.length} results (filtered)`
                  }
                </div>
              </div>
              
              {allResults.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Stock</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Current Holding %</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Previous Holding %</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Change %</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Change % Points</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Current Date</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Current Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {paginatedFilteredResults.length > 0 ? (
                          paginatedFilteredResults.map((change, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="font-semibold text-gray-900">{change.stockName}</div>
                                <div className="text-sm text-gray-500">{change.symbol} • {change.isin}</div>
                              </td>
                              <td className="px-4 py-3 text-right text-sm font-semibold text-red-600">
                                {formatNumber(change.currentHolding, 2)}%
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-gray-600">
                                {formatNumber(change.previousHolding, 2)}%
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-sm font-semibold">
                                  {formatNumber(change.changePercent, 2)}%
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-sm font-semibold text-red-600">
                                {formatNumber(change.change, 2)} pp
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">{formatDate(change.currentDate)}</td>
                              <td className="px-4 py-3 text-right text-sm font-semibold text-indigo-600">
                                {change.currentPrice ? formatCurrency(change.currentPrice) : 'N/A'}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center">
                              <div className="text-gray-500">No results found for the selected filter.</div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Client-side Pagination for Filtered Results */}
                  {filteredResults.length > itemsPerPage && (
                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                      <div className="text-sm text-gray-700">
                        Showing {startIndex + 1} to {Math.min(endIndex, filteredResults.length)} of {filteredResults.length} results
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setHoldingFilteredPage(prev => ({
                            ...prev,
                            [pageKey]: Math.max(1, (prev[pageKey] || 1) - 1),
                          }))}
                          disabled={currentPage <= 1}
                          className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        <div className="text-sm text-gray-700">
                          Page {currentPage} of {totalPages}
                        </div>
                        <button
                          onClick={() => setHoldingFilteredPage(prev => ({
                            ...prev,
                            [pageKey]: Math.min(totalPages, (prev[pageKey] || 1) + 1),
                          }))}
                          disabled={currentPage >= totalPages}
                          className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="px-6 py-8 text-center">
                  <div className="text-gray-500 mb-2">No stocks with decreasing promoter holding in the last 7 days.</div>
                </div>
              )}
            </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

