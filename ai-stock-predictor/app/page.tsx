'use client';

import { useState, useEffect, useCallback } from 'react';
import PredictionCard from '@/components/PredictionCard';
import ModelStats from '@/components/ModelStats';

interface TrackingData {
  closingPrice: number;
  totalReturn: number;
  dailyChange: number;
  dayNumber: number;
}

interface Prediction {
  _id: string;
  stockSymbol: string;
  stockName: string;
  entryPrice: number;
  confidenceScore: number;
  status: string;
  bestReturn: number;
  firstRecommendedDate: string;
  recommendationCount: number;
  modelVersion: string;
  indicatorSnapshot: {
    rsi: number;
    macdSignal: number;
    bbPosition: number;
    volumeRatio: number;
    momentum10d: number;
    maCrossover: number;
    adx: number;
  };
  latestTracking?: TrackingData;
}

interface Analytics {
  overall: {
    totalPredictions: number;
    activeCount: number;
    evaluatedCount: number;
    successfulCount: number;
    overallSuccessRate: number;
    avgReturn: number;
  };
  weightHistory: Array<{
    version: string;
    weights: {
      rsi: number;
      macd: number;
      bbPosition: number;
      volumeRatio: number;
      momentum10d: number;
      maCrossover: number;
      adx: number;
    };
    performance: {
      successRate: number;
      totalEvaluated: number;
    };
  }>;
}

type ButtonAction = 'predict' | 'track' | 'recalibrate';

function SortIcon({ direction }: { direction: 'asc' | 'desc' | null }) {
  if (!direction) return <span className="text-gray-600 ml-1">↕</span>;
  return <span className="text-indigo-400 ml-1">{direction === 'asc' ? '↑' : '↓'}</span>;
}

export default function Dashboard() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRunTime, setLastRunTime] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<ButtonAction | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>('firstRecommendedDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [predsRes, analyticsRes] = await Promise.all([
        fetch('/api/predictions?status=Active&limit=50'),
        fetch('/api/analytics'),
      ]);
      const predsData = await predsRes.json();
      const analyticsData = await analyticsRes.json();

      if (predsData.success) setPredictions(predsData.predictions || []);
      if (analyticsData.success) setAnalytics(analyticsData.analytics);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAction = async (action: ButtonAction) => {
    setActionLoading(action);
    setActionMessage(null);

    const endpoints: Record<ButtonAction, string> = {
      predict: '/api/predict',
      track: '/api/track',
      recalibrate: '/api/recalibrate',
    };

    const messages: Record<ButtonAction, string> = {
      predict: 'Prediction run complete!',
      track: 'Tracking updated!',
      recalibrate: 'Model recalibrated!',
    };

    try {
      const res = await fetch(endpoints[action], { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        setActionMessage(messages[action]);
        setLastRunTime(new Date().toLocaleTimeString('en-IN'));
        await fetchData();
      } else {
        setActionMessage(`Error: ${data.error || 'Something went wrong'}`);
      }
    } catch (error) {
      setActionMessage('Network error occurred');
      console.error(error);
    } finally {
      setActionLoading(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedPredictions = [...predictions].sort((a, b) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;

    switch (sortField) {
      case 'stockSymbol':
        aVal = a.stockSymbol;
        bVal = b.stockSymbol;
        break;
      case 'entryPrice':
        aVal = a.entryPrice;
        bVal = b.entryPrice;
        break;
      case 'totalReturn':
        aVal = a.latestTracking?.totalReturn || 0;
        bVal = b.latestTracking?.totalReturn || 0;
        break;
      case 'bestReturn':
        aVal = a.bestReturn;
        bVal = b.bestReturn;
        break;
      case 'dayNumber':
        aVal = a.latestTracking?.dayNumber || 0;
        bVal = b.latestTracking?.dayNumber || 0;
        break;
      case 'confidenceScore':
        aVal = a.confidenceScore;
        bVal = b.confidenceScore;
        break;
      case 'firstRecommendedDate':
        aVal = new Date(a.firstRecommendedDate).getTime();
        bVal = new Date(b.firstRecommendedDate).getTime();
        break;
    }

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortDirection === 'asc'
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  // Top 3 predictions for cards
  const topPredictions = sortedPredictions.slice(0, 3);

  // Active weights from analytics
  const activeWeights = analytics?.weightHistory?.[0]?.weights || {
    rsi: 0.15,
    macd: 0.20,
    bbPosition: 0.10,
    volumeRatio: 0.15,
    momentum10d: 0.20,
    maCrossover: 0.10,
    adx: 0.10,
  };

  const modelVersion = analytics?.weightHistory?.[0]?.version || 'v1.0';
  const successRate = analytics?.overall?.overallSuccessRate || 0;
  const totalEvaluated = analytics?.overall?.evaluatedCount || 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">AI Stock Dashboard</h1>
            <p className="text-gray-400 text-sm mt-1">
              NSE/BSE predictions powered by technical analysis
              {lastRunTime && (
                <span className="ml-2 text-indigo-400">• Last run: {lastRunTime}</span>
              )}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleAction('predict')}
              disabled={actionLoading !== null}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {actionLoading === 'predict' ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Run Predictions
                </>
              )}
            </button>

            <button
              onClick={() => handleAction('track')}
              disabled={actionLoading !== null}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {actionLoading === 'track' ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Update Tracking
                </>
              )}
            </button>

            <button
              onClick={() => handleAction('recalibrate')}
              disabled={actionLoading !== null}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {actionLoading === 'recalibrate' ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Calibrating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  Recalibrate Model
                </>
              )}
            </button>
          </div>
        </div>

        {/* Action feedback message */}
        {actionMessage && (
          <div
            className={`mt-3 px-4 py-2 rounded-lg text-sm ${
              actionMessage.startsWith('Error')
                ? 'bg-rose-900/50 text-rose-300 border border-rose-800'
                : 'bg-emerald-900/50 text-emerald-300 border border-emerald-800'
            }`}
          >
            {actionMessage}
          </div>
        )}
      </div>

      {/* Stats Overview */}
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: 'Active Predictions',
              value: analytics.overall.activeCount,
              color: 'text-indigo-400',
            },
            {
              label: 'Total Evaluated',
              value: analytics.overall.evaluatedCount,
              color: 'text-gray-200',
            },
            {
              label: 'Success Rate',
              value: `${analytics.overall.overallSuccessRate.toFixed(1)}%`,
              color: analytics.overall.overallSuccessRate >= 60 ? 'text-emerald-400' : 'text-rose-400',
            },
            {
              label: 'Avg Return',
              value: `${analytics.overall.avgReturn >= 0 ? '+' : ''}${analytics.overall.avgReturn.toFixed(2)}%`,
              color: analytics.overall.avgReturn >= 0 ? 'text-emerald-400' : 'text-rose-400',
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Top 3 Prediction Cards */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">
              Today&apos;s Top Predictions
              <span className="ml-2 text-sm text-gray-400 font-normal">
                ({topPredictions.length} active)
              </span>
            </h2>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-gray-900 border border-gray-800 rounded-xl p-5 animate-pulse h-80"
                  />
                ))}
              </div>
            ) : topPredictions.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
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
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                <p className="text-gray-400 font-medium">No active predictions</p>
                <p className="text-gray-600 text-sm mt-1">Click &ldquo;Run Predictions&rdquo; to get started</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {topPredictions.map((pred) => (
                  <PredictionCard key={pred._id} prediction={pred} />
                ))}
              </div>
            )}
          </div>

          {/* All Active Predictions Table */}
          {predictions.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">
                All Active Predictions
                <span className="ml-2 text-sm text-gray-400 font-normal">
                  ({predictions.length})
                </span>
              </h2>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 text-left">
                        {[
                          { key: 'stockSymbol', label: 'Stock' },
                          { key: 'entryPrice', label: 'Entry' },
                          { key: null, label: 'Current' },
                          { key: 'totalReturn', label: 'Return %' },
                          { key: 'bestReturn', label: 'Best %' },
                          { key: 'dayNumber', label: 'Days' },
                          { key: 'status', label: 'Status' },
                          { key: 'confidenceScore', label: 'Confidence' },
                        ].map((col) => (
                          <th
                            key={col.label}
                            className={`px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider ${
                              col.key ? 'cursor-pointer hover:text-gray-200 select-none' : ''
                            }`}
                            onClick={() => col.key && handleSort(col.key)}
                          >
                            {col.label}
                            {col.key && (
                              <SortIcon
                                direction={sortField === col.key ? sortDirection : null}
                              />
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {sortedPredictions.map((pred) => {
                        const totalReturn = pred.latestTracking?.totalReturn || 0;
                        const currentPrice = pred.latestTracking?.closingPrice || pred.entryPrice;
                        const dayNumber = pred.latestTracking?.dayNumber || 0;
                        const isPositive = totalReturn >= 0;

                        return (
                          <tr
                            key={pred._id}
                            className="hover:bg-gray-800/40 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium text-white">{pred.stockName}</div>
                              <div className="text-xs text-gray-500 font-mono">
                                {pred.stockSymbol.replace('.NS', '')}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-300 font-mono">
                              ₹{pred.entryPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-gray-300 font-mono">
                              ₹{currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`font-semibold font-mono ${
                                  isPositive ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {isPositive ? '+' : ''}{totalReturn.toFixed(2)}%
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`font-mono ${
                                  pred.bestReturn >= 5 ? 'text-emerald-400' : 'text-gray-300'
                                }`}
                              >
                                {pred.bestReturn >= 0 ? '+' : ''}{pred.bestReturn.toFixed(2)}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-400">{dayNumber}</td>
                            <td className="px-4 py-3">
                              <span className="text-xs bg-indigo-900 text-indigo-300 border border-indigo-700 px-2 py-0.5 rounded-full">
                                {pred.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-16 bg-gray-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      pred.confidenceScore >= 70
                                        ? 'bg-emerald-500'
                                        : pred.confidenceScore >= 50
                                        ? 'bg-amber-500'
                                        : 'bg-rose-500'
                                    }`}
                                    style={{ width: `${pred.confidenceScore}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-400">
                                  {pred.confidenceScore}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <ModelStats
            version={modelVersion}
            successRate={successRate}
            totalEvaluated={totalEvaluated}
            weights={activeWeights}
          />
        </div>
      </div>
    </div>
  );
}
