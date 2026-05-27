'use client';

import { useState, useEffect, useCallback } from 'react';

interface Prediction {
  _id: string;
  stockSymbol: string;
  stockName: string;
  entryPrice: number;
  finalReturn?: number;
  bestReturn: number;
  status: string;
  firstRecommendedDate: string;
  evaluationDate?: string;
  recommendationCount: number;
  confidenceScore: number;
}

type StatusFilter = 'All' | 'Achieved' | 'OverAchieved' | 'MissedSlightly' | 'Missed' | 'Expired';

const STATUS_TABS: StatusFilter[] = [
  'All',
  'Achieved',
  'OverAchieved',
  'MissedSlightly',
  'Missed',
  'Expired',
];

const STATUS_STYLES: Record<string, string> = {
  Achieved: 'bg-emerald-900 text-emerald-300 border border-emerald-700',
  OverAchieved: 'bg-green-900 text-green-300 border border-green-700',
  MissedSlightly: 'bg-amber-900 text-amber-300 border border-amber-700',
  Missed: 'bg-rose-900 text-rose-300 border border-rose-700',
  Expired: 'bg-gray-800 text-gray-400 border border-gray-700',
  Active: 'bg-indigo-900 text-indigo-300 border border-indigo-700',
};

const ROW_STYLES: Record<string, string> = {
  Achieved: 'hover:bg-emerald-900/10',
  OverAchieved: 'hover:bg-green-900/10',
  MissedSlightly: 'hover:bg-amber-900/10',
  Missed: 'hover:bg-rose-900/10',
  Expired: 'hover:bg-gray-800/20',
  Active: 'hover:bg-indigo-900/10',
};

export default function HistoryPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('All');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchPredictions = useCallback(async () => {
    try {
      setLoading(true);
      const statusParam = activeFilter !== 'All' ? `&status=${activeFilter}` : '';
      const res = await fetch(`/api/predictions?limit=20&page=${page}${statusParam}`);
      const data = await res.json();

      if (data.success) {
        setPredictions(data.predictions || []);
        setTotalPages(data.pagination.pages);
        setTotal(data.pagination.total);
      }
    } catch (error) {
      console.error('Error fetching predictions:', error);
    } finally {
      setLoading(false);
    }
  }, [activeFilter, page]);

  useEffect(() => {
    fetchPredictions();
  }, [fetchPredictions]);

  useEffect(() => {
    setPage(1);
  }, [activeFilter]);

  const getDaysDiff = (start: string, end?: string) => {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    const diff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Prediction History</h1>
        <p className="text-gray-400 text-sm mt-1">
          All past and active predictions with outcomes
        </p>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-800 pb-4">
        {STATUS_TABS.map((status) => (
          <button
            key={status}
            onClick={() => setActiveFilter(status)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeFilter === status
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {status}
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-500 self-center">{total} total</span>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Loading predictions...</p>
          </div>
        ) : predictions.length === 0 ? (
          <div className="p-12 text-center">
            <svg
              className="w-12 h-12 text-gray-700 mx-auto mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="text-gray-400">No predictions found</p>
            {activeFilter !== 'All' && (
              <p className="text-gray-600 text-sm mt-1">
                Try changing the filter or run some predictions first
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider">
                    Stock
                  </th>
                  <th className="px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider">
                    First Recommended
                  </th>
                  <th className="px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider text-right">
                    Entry Price
                  </th>
                  <th className="px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider text-right">
                    Final Return
                  </th>
                  <th className="px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider text-right">
                    Best Return
                  </th>
                  <th className="px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider text-right">
                    Days
                  </th>
                  <th className="px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider text-center">
                    Rec Count
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {predictions.map((pred) => {
                  const finalReturn = pred.finalReturn ?? 0;
                  const isPositive = finalReturn >= 0;
                  const isBestPositive = pred.bestReturn >= 0;
                  const daysTracked = getDaysDiff(
                    pred.firstRecommendedDate,
                    pred.evaluationDate
                  );

                  return (
                    <tr
                      key={pred._id}
                      className={`transition-colors ${ROW_STYLES[pred.status] || ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{pred.stockName}</div>
                        <div className="text-xs text-gray-500 font-mono">
                          {pred.stockSymbol.replace('.NS', '')}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-xs">
                        {new Date(pred.firstRecommendedDate).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3 text-gray-300 font-mono text-right">
                        ₹{pred.entryPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {pred.finalReturn !== undefined ? (
                          <span
                            className={`font-semibold font-mono ${
                              isPositive ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isPositive ? '+' : ''}{finalReturn.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-mono text-sm ${
                            isBestPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isBestPositive ? '+' : ''}{pred.bestReturn.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            STATUS_STYLES[pred.status] || STATUS_STYLES.Active
                          }`}
                        >
                          {pred.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-right">{daysTracked}</td>
                      <td className="px-4 py-3 text-center">
                        {pred.recommendationCount > 1 ? (
                          <span className="text-xs bg-indigo-800 text-indigo-300 px-2 py-0.5 rounded-full">
                            x{pred.recommendationCount}
                          </span>
                        ) : (
                          <span className="text-gray-600">1</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            Previous
          </button>
          <span className="text-gray-400 text-sm">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
