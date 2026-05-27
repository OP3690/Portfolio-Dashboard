'use client';

import { useState, useEffect } from 'react';

interface AnalyticsData {
  overall: {
    totalPredictions: number;
    activeCount: number;
    evaluatedCount: number;
    successfulCount: number;
    overallSuccessRate: number;
    avgReturn: number;
  };
  trends: {
    last30: { total: number; successful: number; successRate: number; avgReturn: number };
    last60: { total: number; successful: number; successRate: number; avgReturn: number };
    last90: { total: number; successful: number; successRate: number; avgReturn: number };
  };
  statusCounts: {
    Active: number;
    Achieved: number;
    OverAchieved: number;
    MissedSlightly: number;
    Missed: number;
    Expired: number;
  };
  avgReturnByStatus: {
    Achieved: number;
    OverAchieved: number;
    MissedSlightly: number;
    Missed: number;
  };
  weightHistory: Array<{
    version: string;
    date: string;
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
      totalEvaluated: number;
      successRate: number;
      avgReturn: number;
    };
    isActive: boolean;
  }>;
  indicatorPerformance: Record<
    string,
    { avgForSuccess: number; avgForFailure: number }
  >;
}

function DonutChart({
  data,
}: {
  data: Array<{ label: string; value: number; color: string }>;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        No data yet
      </div>
    );
  }

  const size = 160;
  const center = size / 2;
  const radius = 60;
  const innerRadius = 36;

  let cumulativeAngle = -Math.PI / 2;
  const segments = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const angle = (d.value / total) * 2 * Math.PI;
      const startAngle = cumulativeAngle;
      cumulativeAngle += angle;
      const endAngle = cumulativeAngle;

      const x1 = center + radius * Math.cos(startAngle);
      const y1 = center + radius * Math.sin(startAngle);
      const x2 = center + radius * Math.cos(endAngle);
      const y2 = center + radius * Math.sin(endAngle);

      const ix1 = center + innerRadius * Math.cos(startAngle);
      const iy1 = center + innerRadius * Math.sin(startAngle);
      const ix2 = center + innerRadius * Math.cos(endAngle);
      const iy2 = center + innerRadius * Math.sin(endAngle);

      const largeArc = angle > Math.PI ? 1 : 0;

      const path = [
        `M ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${ix2} ${iy2}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1}`,
        'Z',
      ].join(' ');

      return { ...d, path };
    });

  const successRate =
    total > 0
      ? (((data.find((d) => d.label === 'Achieved')?.value || 0) +
          (data.find((d) => d.label === 'OverAchieved')?.value || 0)) /
          total) *
        100
      : 0;

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width={size} height={size}>
          {segments.map((seg, i) => (
            <path
              key={i}
              d={seg.path}
              fill={seg.color}
              stroke="#111827"
              strokeWidth="2"
            />
          ))}
          {/* Center text */}
          <text x={center} y={center - 6} textAnchor="middle" fill="#fff" fontSize="18" fontWeight="bold">
            {successRate.toFixed(0)}%
          </text>
          <text x={center} y={center + 12} textAnchor="middle" fill="#6b7280" fontSize="10">
            success
          </text>
        </svg>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-3">
        {data.filter((d) => d.value > 0).map((d) => (
          <div key={d.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="text-xs text-gray-400">{d.label} ({d.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({
  data,
}: {
  data: Array<{ label: string; value: number; color: string }>;
}) {
  const maxVal = Math.max(...data.map((d) => Math.abs(d.value)), 0.1);
  const height = 120;
  const barWidth = 32;
  const gap = 12;
  const totalWidth = data.length * (barWidth + gap);

  return (
    <svg width={totalWidth} height={height + 40} className="overflow-visible">
      {data.map((d, i) => {
        const barHeight = (Math.abs(d.value) / maxVal) * (height * 0.85);
        const isPositive = d.value >= 0;
        const x = i * (barWidth + gap);
        const y = isPositive ? height - barHeight : height;

        return (
          <g key={d.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              fill={d.color}
              rx="3"
            />
            {/* Value label */}
            <text
              x={x + barWidth / 2}
              y={isPositive ? y - 4 : y + barHeight + 14}
              textAnchor="middle"
              fill={d.color}
              fontSize="10"
              fontWeight="bold"
            >
              {d.value >= 0 ? '+' : ''}{d.value.toFixed(1)}%
            </text>
            {/* Category label */}
            <text
              x={x + barWidth / 2}
              y={height + 20}
              textAnchor="middle"
              fill="#9ca3af"
              fontSize="9"
            >
              {d.label.length > 8 ? d.label.slice(0, 8) : d.label}
            </text>
          </g>
        );
      })}
      {/* Zero line */}
      <line
        x1="0"
        y1={height}
        x2={totalWidth}
        y2={height}
        stroke="#374151"
        strokeWidth="1"
      />
    </svg>
  );
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await fetch('/api/analytics');
        const data = await res.json();
        if (data.success) setAnalytics(data.analytics);
      } catch (error) {
        console.error('Error fetching analytics:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12 text-gray-400">Failed to load analytics</div>
      </div>
    );
  }

  const donutData = [
    { label: 'OverAchieved', value: analytics.statusCounts.OverAchieved, color: '#22c55e' },
    { label: 'Achieved', value: analytics.statusCounts.Achieved, color: '#10b981' },
    { label: 'MissedSlightly', value: analytics.statusCounts.MissedSlightly, color: '#f59e0b' },
    { label: 'Missed', value: analytics.statusCounts.Missed, color: '#f87171' },
    { label: 'Expired', value: analytics.statusCounts.Expired, color: '#4b5563' },
    { label: 'Active', value: analytics.statusCounts.Active, color: '#6366f1' },
  ];

  const returnBarData = [
    {
      label: 'OverAchieved',
      value: analytics.avgReturnByStatus.OverAchieved,
      color: '#22c55e',
    },
    {
      label: 'Achieved',
      value: analytics.avgReturnByStatus.Achieved,
      color: '#10b981',
    },
    {
      label: 'MissedSlightly',
      value: analytics.avgReturnByStatus.MissedSlightly,
      color: '#f59e0b',
    },
    {
      label: 'Missed',
      value: analytics.avgReturnByStatus.Missed,
      color: '#f87171',
    },
  ];

  const INDICATOR_LABELS: Record<string, string> = {
    rsi: 'RSI',
    macdSignal: 'MACD Signal',
    bbPosition: 'BB Position',
    volumeRatio: 'Volume Ratio',
    momentum10d: '10d Momentum',
    maCrossover: 'MA Crossover',
    adx: 'ADX',
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Model Analytics</h1>
        <p className="text-gray-400 text-sm mt-1">
          Performance statistics and indicator analysis
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {[
          { label: 'Total', value: analytics.overall.totalPredictions, color: 'text-gray-200' },
          { label: 'Active', value: analytics.overall.activeCount, color: 'text-indigo-400' },
          {
            label: 'Success Rate',
            value: `${analytics.overall.overallSuccessRate.toFixed(1)}%`,
            color:
              analytics.overall.overallSuccessRate >= 60 ? 'text-emerald-400' : 'text-rose-400',
          },
          {
            label: 'Avg Return',
            value: `${analytics.overall.avgReturn >= 0 ? '+' : ''}${analytics.overall.avgReturn.toFixed(2)}%`,
            color: analytics.overall.avgReturn >= 0 ? 'text-emerald-400' : 'text-rose-400',
          },
          { label: 'Achieved', value: analytics.statusCounts.Achieved + analytics.statusCounts.OverAchieved, color: 'text-emerald-400' },
          { label: 'Missed', value: analytics.statusCounts.Missed + analytics.statusCounts.Expired, color: 'text-rose-400' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center"
          >
            <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Donut Chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">Prediction Outcomes</h2>
          <DonutChart data={donutData} />
        </div>

        {/* Return Distribution Bar Chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">Avg Return by Category</h2>
          <div className="overflow-x-auto">
            <BarChart data={returnBarData} />
          </div>
        </div>

        {/* Period Trends */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">Performance Trends</h2>
          <div className="space-y-4">
            {[
              { label: 'Last 30 Days', data: analytics.trends.last30 },
              { label: 'Last 60 Days', data: analytics.trends.last60 },
              { label: 'Last 90 Days', data: analytics.trends.last90 },
            ].map(({ label, data }) => (
              <div key={label} className="bg-gray-800 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-300">{label}</span>
                  <span className="text-xs text-gray-500">{data.total} predictions</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">Success Rate</span>
                      <span
                        className={
                          data.successRate >= 60 ? 'text-emerald-400' : 'text-rose-400'
                        }
                      >
                        {data.successRate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${data.successRate}%` }}
                      />
                    </div>
                  </div>
                  <span
                    className={`text-sm font-semibold font-mono ${
                      data.avgReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {data.avgReturn >= 0 ? '+' : ''}{data.avgReturn.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Indicator Performance */}
      {Object.keys(analytics.indicatorPerformance).length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
          <h2 className="text-base font-semibold text-white mb-4">Indicator Performance Analysis</h2>
          <p className="text-xs text-gray-500 mb-4">
            Average indicator value for successful vs failed predictions
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="pb-3 text-gray-400 font-medium text-xs uppercase tracking-wider">
                    Indicator
                  </th>
                  <th className="pb-3 text-gray-400 font-medium text-xs uppercase tracking-wider text-right">
                    Avg for Success
                  </th>
                  <th className="pb-3 text-gray-400 font-medium text-xs uppercase tracking-wider text-right">
                    Avg for Failure
                  </th>
                  <th className="pb-3 text-gray-400 font-medium text-xs uppercase tracking-wider text-right">
                    Effectiveness
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {Object.entries(analytics.indicatorPerformance).map(([key, perf]) => {
                  const effectiveness = perf.avgForSuccess - perf.avgForFailure;
                  return (
                    <tr key={key} className="hover:bg-gray-800/30">
                      <td className="py-3 text-gray-200 font-medium">
                        {INDICATOR_LABELS[key] || key}
                      </td>
                      <td className="py-3 text-right text-emerald-400 font-mono">
                        {perf.avgForSuccess.toFixed(3)}
                      </td>
                      <td className="py-3 text-right text-rose-400 font-mono">
                        {perf.avgForFailure.toFixed(3)}
                      </td>
                      <td className="py-3 text-right">
                        <span
                          className={`font-mono text-sm ${
                            effectiveness > 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {effectiveness >= 0 ? '+' : ''}{effectiveness.toFixed(3)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Weight History */}
      {analytics.weightHistory.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">Model Weight History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="pb-3 text-gray-400 font-medium text-xs uppercase tracking-wider">
                    Version
                  </th>
                  <th className="pb-3 text-gray-400 font-medium text-xs uppercase tracking-wider">
                    Date
                  </th>
                  <th className="pb-3 text-gray-400 font-medium text-xs uppercase tracking-wider text-right">
                    RSI
                  </th>
                  <th className="pb-3 text-gray-400 font-medium text-xs uppercase tracking-wider text-right">
                    MACD
                  </th>
                  <th className="pb-3 text-gray-400 font-medium text-xs uppercase tracking-wider text-right">
                    BB Pos
                  </th>
                  <th className="pb-3 text-gray-400 font-medium text-xs uppercase tracking-wider text-right">
                    Vol
                  </th>
                  <th className="pb-3 text-gray-400 font-medium text-xs uppercase tracking-wider text-right">
                    Mom
                  </th>
                  <th className="pb-3 text-gray-400 font-medium text-xs uppercase tracking-wider text-right">
                    MA
                  </th>
                  <th className="pb-3 text-gray-400 font-medium text-xs uppercase tracking-wider text-right">
                    ADX
                  </th>
                  <th className="pb-3 text-gray-400 font-medium text-xs uppercase tracking-wider text-right">
                    Success %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {analytics.weightHistory.map((w) => (
                  <tr
                    key={w.version}
                    className={`hover:bg-gray-800/30 ${w.isActive ? 'bg-indigo-900/10' : ''}`}
                  >
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-white">{w.version}</span>
                        {w.isActive && (
                          <span className="text-xs bg-indigo-800 text-indigo-300 px-1.5 py-0.5 rounded">
                            Active
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-gray-400 text-xs">
                      {new Date(w.date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    {[
                      w.weights.rsi,
                      w.weights.macd,
                      w.weights.bbPosition,
                      w.weights.volumeRatio,
                      w.weights.momentum10d,
                      w.weights.maCrossover,
                      w.weights.adx,
                    ].map((val, i) => (
                      <td key={i} className="py-3 text-right text-gray-300 font-mono text-xs">
                        {(val * 100).toFixed(1)}%
                      </td>
                    ))}
                    <td className="py-3 text-right">
                      <span
                        className={`font-mono text-sm ${
                          w.performance.successRate >= 60 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {w.performance.successRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {analytics.weightHistory.length === 0 && analytics.overall.evaluatedCount === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
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
          <p className="text-gray-400">No analytics data yet</p>
          <p className="text-gray-600 text-sm mt-1">
            Run predictions and track them for 30+ days to see analytics
          </p>
        </div>
      )}
    </div>
  );
}
