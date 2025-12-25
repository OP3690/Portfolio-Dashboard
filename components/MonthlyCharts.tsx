'use client';

import { useEffect, useState, useRef } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';

interface MonthlyChartsProps {
  monthlyInvestments: Array<{ 
    month: string; 
    investments: number; 
    withdrawals: number;
    investmentDetails?: Array<{stockName: string; qty: number; amount: number}>;
    withdrawalDetails?: Array<{stockName: string; qty: number; amount: number}>;
  }>;
  monthlyInvestmentAverages?: {
    avgMonthlyInvestment: number;
    avgMonthlyWithdrawal: number;
    netCashflow: number;
  };
  monthlyDividends: Array<{ month: string; amount: number; stockDetails?: Array<{stockName: string; amount: number}> }>;
  avgMonthlyDividends?: number;
  medianMonthlyDividendsLast12M?: number;
  monthlyReturns: Array<{ month: string; returnPercent: number; returnAmount: number }>;
  returnStatistics?: {
    xirr: number;
    cagr: number;
    avgReturnOverall: { percent: number; amount: number };
    avgReturnCurrentYear: { percent: number; amount: number };
    bestMonthCurrentYear: { month: string; percent: number; amount: number };
    worstMonthCurrentYear: { month: string; percent: number; amount: number };
  };
}

export default function MonthlyCharts({
  monthlyInvestments,
  monthlyInvestmentAverages,
  monthlyDividends,
  avgMonthlyDividends,
  medianMonthlyDividendsLast12M,
  monthlyReturns,
  returnStatistics,
}: MonthlyChartsProps) {
  // Guard against undefined/null data and ensure proper data structure
  const safeMonthlyInvestments = (monthlyInvestments || []).map(item => ({
    ...item,
    investments: Number(item.investments || 0),
    withdrawals: Number(item.withdrawals || 0),
  }));
  const safeMonthlyDividends = (monthlyDividends || []).map(item => ({
    ...item,
    amount: Number(item.amount || 0),
  }));
  const safeMonthlyReturns = (monthlyReturns || []).map(item => ({
    ...item,
    returnPercent: Number(item.returnPercent || 0),
    returnAmount: Number(item.returnAmount || 0),
  }));
  
  // Background animation state
  const [animationFrame, setAnimationFrame] = useState(0);
  const animationRef = useRef<number>();
  const isVisibleRef = useRef(true);

  // Continuous background animation
  useEffect(() => {
    const animate = () => {
      setAnimationFrame(prev => prev + 1);
      animationRef.current = requestAnimationFrame(animate);
    };
    
    // Start animation loop
    animationRef.current = requestAnimationFrame(animate);
    
    // Keep running even when tab is not visible
    document.addEventListener('visibilitychange', () => {
      isVisibleRef.current = !document.hidden;
    });

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);
  
  // Debug: Log data to console to verify it's being passed
  useEffect(() => {
    console.log('📊 MonthlyCharts - Data received:');
    console.log('  - monthlyInvestments:', safeMonthlyInvestments.length, 'items');
    if (safeMonthlyInvestments.length > 0) {
      console.log('  - Sample investment data:', JSON.stringify(safeMonthlyInvestments[0], null, 2));
      console.log('  - First item investments value:', safeMonthlyInvestments[0].investments, typeof safeMonthlyInvestments[0].investments);
      console.log('  - First item withdrawals value:', safeMonthlyInvestments[0].withdrawals, typeof safeMonthlyInvestments[0].withdrawals);
      console.log('  - All investments values:', safeMonthlyInvestments.map((item: any) => ({ month: item.month, investments: item.investments, withdrawals: item.withdrawals })));
    }
    console.log('  - monthlyDividends:', safeMonthlyDividends.length, 'items');
    if (safeMonthlyDividends.length > 0) {
      console.log('  - Sample dividend data:', JSON.stringify(safeMonthlyDividends[0], null, 2));
      console.log('  - First item amount value:', safeMonthlyDividends[0].amount, typeof safeMonthlyDividends[0].amount);
      console.log('  - All dividend values:', safeMonthlyDividends.map((item: any) => ({ month: item.month, amount: item.amount })));
    }
    console.log('  - monthlyReturns:', safeMonthlyReturns.length, 'items');
    if (safeMonthlyReturns.length > 0) {
      console.log('  - Sample returns data:', JSON.stringify(safeMonthlyReturns[0], null, 2));
    }
  }, [safeMonthlyInvestments, safeMonthlyDividends, safeMonthlyReturns]);

  // Don't render charts if there's no data
  if (safeMonthlyInvestments.length === 0 && safeMonthlyDividends.length === 0 && safeMonthlyReturns.length === 0) {
    return (
      <div className="mt-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 text-center border border-gray-100 dark:border-slate-700">
          <div className="w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">No chart data available</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Please upload your portfolio data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6" style={{ position: 'relative', zIndex: 1 }}>
      {/* Monthly Investments Chart */}
      {safeMonthlyInvestments.length > 0 && (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 p-6 border border-gray-100 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full"></div>
            Month on Month Investments & Withdrawals
          </h2>
          <div className="flex flex-wrap gap-4 sm:gap-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-2 rounded-xl border border-blue-200 dark:border-blue-800">
              <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1">Gross Total Invested</p>
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {formatCurrency(
                  safeMonthlyInvestments.reduce((sum, item) => sum + (item.investments || 0), 0)
                )}
              </p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-xl border border-red-200 dark:border-red-800">
              <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1">Total Withdrawal</p>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">
                {formatCurrency(
                  safeMonthlyInvestments.reduce((sum, item) => sum + (item.withdrawals || 0), 0)
                )}
              </p>
            </div>
            {monthlyInvestmentAverages && (
              <>
                <div className="bg-indigo-50 dark:bg-indigo-900/20 px-4 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800">
                  <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1">Monthly Avg. Investment</p>
                  <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                    {formatCurrency(monthlyInvestmentAverages.avgMonthlyInvestment || 0)}
                  </p>
                </div>
                <div className="bg-rose-50 dark:bg-rose-900/20 px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-800">
                  <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1">Monthly Avg. Withdrawal</p>
                  <p className="text-lg font-bold text-rose-600 dark:text-rose-400">
                    {formatCurrency(monthlyInvestmentAverages.avgMonthlyWithdrawal || 0)}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
        <div style={{ position: 'relative', zIndex: 10, width: '100%', height: '300px' }}>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart 
              data={safeMonthlyInvestments}
              syncId="dashboard-charts"
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="month" 
              tick={{ fill: '#6b7280', fontSize: 12 }}
              stroke="#9ca3af"
            />
            <YAxis 
              tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
              tick={{ fill: '#6b7280', fontSize: 12 }}
              stroke="#9ca3af"
            />
            <Tooltip 
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                
                // Find the current month's data point to get stock details
                const currentMonthData = safeMonthlyInvestments.find(r => r.month === label);
                const investmentDetails = currentMonthData?.investmentDetails || [];
                const withdrawalDetails = currentMonthData?.withdrawalDetails || [];
                
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-md">
                    <p className="font-semibold text-gray-800 mb-2">Month: {label}</p>
                    {payload.map((entry: any, index: number) => {
                      const value = entry.value;
                      const name = entry.name || entry.dataKey;
                      
                      // Hide trendlines from tooltip
                      if (name === 'Investments Trend' || name === 'Withdrawals Trend') {
                        return null;
                      }
                      
                      const isInvestment = name === 'Investments (Buy)' || name === 'investments';
                      const details = isInvestment ? investmentDetails : withdrawalDetails;
                      const colorClass = isInvestment ? 'text-blue-600' : 'text-red-600';
                      
                      return (
                        <div key={index} className="mb-3 last:mb-0">
                          <p className={`text-sm font-medium mb-1 ${colorClass}`}>
                            {name}: <span className="font-semibold">{formatCurrency(value)}</span>
                          </p>
                          {details.length > 0 && (
                            <div className="mt-1 ml-2">
                              <div className="max-h-40 overflow-y-auto">
                                {details.map((detail: any, idx: number) => (
                                  <p key={idx} className="text-xs text-gray-700 py-0.5 border-b border-gray-100 last:border-0">
                                    <span className="font-medium">{detail.stockName}</span>
                                    {' • '}
                                    <span className="text-gray-600">{detail.qty.toLocaleString()} shares</span>
                                    {' • '}
                                    <span className={colorClass}>{formatCurrency(detail.amount)}</span>
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              }}
              filterNull={true}
            />
            <Legend />
            <Bar 
              dataKey="investments" 
              fill="#3b82f6" 
              name="Investments (Buy)"
              isAnimationActive={false}
              radius={[4, 4, 0, 0]}
              stroke="#2563eb"
              strokeWidth={1}
            />
            <Bar 
              dataKey="withdrawals" 
              fill="#ef4444" 
              name="Withdrawals (Sell)"
              isAnimationActive={false}
              radius={[4, 4, 0, 0]}
              stroke="#dc2626"
              strokeWidth={1}
            />
            <Line 
              type="monotone" 
              dataKey="investments" 
              stroke="#2563eb" 
              strokeWidth={2}
              dot={{ fill: '#2563eb', r: 3 }}
              strokeDasharray="5 5"
              name="Investments Trend"
              legendType="line"
              isAnimationActive={false}
            />
            <Line 
              type="monotone" 
              dataKey="withdrawals" 
              stroke="#dc2626" 
              strokeWidth={2}
              dot={{ fill: '#dc2626', r: 3 }}
              strokeDasharray="5 5"
              name="Withdrawals Trend"
              legendType="line"
              isAnimationActive={false}
            />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

      {/* Monthly Dividends Chart */}
      {safeMonthlyDividends.length > 0 && (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 p-6 border border-gray-100 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-green-500 to-emerald-600 rounded-full"></div>
            Month on Month Dividends Earned
          </h2>
          <div className="flex flex-wrap gap-4 sm:gap-6">
            <div className="bg-green-50 dark:bg-green-900/20 px-4 py-2 rounded-xl border border-green-200 dark:border-green-800">
              <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1">Total Dividend Earned</p>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">
                {formatCurrency(
                  safeMonthlyDividends.reduce((sum, item) => sum + (item.amount || 0), 0)
                )}
              </p>
            </div>
            {avgMonthlyDividends !== undefined && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800">
                <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1">Avg. Monthly Dividends</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(avgMonthlyDividends || 0)}
                </p>
              </div>
            )}
            {medianMonthlyDividendsLast12M !== undefined && (
              <div className="bg-teal-50 dark:bg-teal-900/20 px-4 py-2 rounded-xl border border-teal-200 dark:border-teal-800">
                <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1">Median (Last 12M)</p>
                <p className="text-lg font-bold text-teal-600 dark:text-teal-400">
                  {formatCurrency(medianMonthlyDividendsLast12M || 0)}
                </p>
              </div>
            )}
          </div>
        </div>
        <div style={{ position: 'relative', zIndex: 10, width: '100%', height: '300px' }}>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart 
              data={safeMonthlyDividends}
              syncId="dashboard-charts"
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="month"
              tick={{ fill: '#6b7280', fontSize: 12 }}
              stroke="#9ca3af"
            />
            <YAxis 
              tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
              tick={{ fill: '#6b7280', fontSize: 12 }}
              stroke="#9ca3af"
            />
            <Tooltip 
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                
                // Find the current month's data point to get stock details
                const currentMonthData = safeMonthlyDividends.find(r => r.month === label);
                const stockDetails = currentMonthData?.stockDetails || [];
                
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                    <p className="font-semibold text-gray-800 mb-2">Month: {label}</p>
                    {payload.map((entry: any, index: number) => {
                      const value = entry.value;
                      const name = entry.name || entry.dataKey;
                      
                      // Hide trendline from tooltip
                      if (name === 'Dividends Trend') {
                        return null;
                      }
                      
                      return (
                        <div key={index}>
                          <p className="text-sm text-gray-700 font-medium mb-2">
                            {name}: <span className="font-semibold text-green-600">{formatCurrency(value)}</span>
                          </p>
                          {stockDetails.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              <p className="text-xs font-semibold text-gray-600 mb-1">By Stock:</p>
                              <div className="max-h-40 overflow-y-auto">
                                {stockDetails.map((stock: any, idx: number) => (
                                  <p key={idx} className="text-xs text-gray-700 py-0.5">
                                    <span className="font-medium">{stock.stockName}:</span>{' '}
                                    <span className="text-green-600">{formatCurrency(stock.amount)}</span>
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              }}
              filterNull={true}
            />
            <Legend />
            <Bar 
              dataKey="amount" 
              fill="#10b981" 
              name="Dividend Amount"
              isAnimationActive={false}
              radius={[4, 4, 0, 0]}
              stroke="#059669"
              strokeWidth={1}
            />
            <Line 
              type="monotone" 
              dataKey="amount" 
              stroke="#059669" 
              strokeWidth={2}
              dot={{ fill: '#059669', r: 3 }}
              strokeDasharray="5 5"
              name="Dividends Trend"
              legendType="line"
              isAnimationActive={false}
            />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

      {/* Monthly Returns Chart */}
      {safeMonthlyReturns.length > 0 && (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 p-6 border border-gray-100 dark:border-slate-700">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3 mb-4">
            <div className="w-1 h-8 bg-gradient-to-b from-purple-500 to-pink-600 rounded-full"></div>
            Month on Month Returns
          </h2>
          {returnStatistics && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* XIRR Card */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-200 dark:border-slate-700">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">XIRR</p>
                <p className={`text-2xl font-bold ${
                  returnStatistics.xirr >= 9 ? 'text-green-600 dark:text-green-400' : 
                  returnStatistics.xirr >= 5 ? 'text-yellow-600 dark:text-yellow-400' : 
                  'text-red-600 dark:text-red-400'
                }`}>
                  {returnStatistics.xirr >= 0 ? '+' : ''}
                  {returnStatistics.xirr.toFixed(2)}%
                </p>
              </div>

              {/* CAGR Card */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-200 dark:border-slate-700">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">CAGR</p>
                <p className={`text-2xl font-bold ${
                  returnStatistics.cagr >= 9 ? 'text-green-600 dark:text-green-400' : 
                  returnStatistics.cagr >= 5 ? 'text-yellow-600 dark:text-yellow-400' : 
                  'text-red-600 dark:text-red-400'
                }`}>
                  {returnStatistics.cagr >= 0 ? '+' : ''}
                  {returnStatistics.cagr.toFixed(2)}%
                </p>
              </div>

              {/* Avg. Monthly Return Card */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-200 dark:border-slate-700">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Avg. Monthly Return</p>
                <p className={`text-xl font-bold mb-1 ${
                  returnStatistics.avgReturnOverall.percent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {returnStatistics.avgReturnOverall.percent >= 0 ? '+' : ''}
                  {returnStatistics.avgReturnOverall.percent.toFixed(2)}%
                </p>
                <p className={`text-sm font-medium ${
                  returnStatistics.avgReturnOverall.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {returnStatistics.avgReturnOverall.amount >= 0 ? '+' : ''}
                  {formatCurrency(returnStatistics.avgReturnOverall.amount)}
                </p>
              </div>

              {/* Current Year Avg. Card */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-200 dark:border-slate-700">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Current Year Avg.</p>
                <p className={`text-xl font-bold mb-1 ${
                  returnStatistics.avgReturnCurrentYear.percent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {returnStatistics.avgReturnCurrentYear.percent >= 0 ? '+' : ''}
                  {returnStatistics.avgReturnCurrentYear.percent.toFixed(2)}%
                </p>
                <p className={`text-sm font-medium ${
                  returnStatistics.avgReturnCurrentYear.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {returnStatistics.avgReturnCurrentYear.amount >= 0 ? '+' : ''}
                  {formatCurrency(returnStatistics.avgReturnCurrentYear.amount)}
                </p>
              </div>

              {/* Best Month Card */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-200 dark:border-slate-700">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">
                  Best Month: <span className="text-green-600 dark:text-green-400 font-bold normal-case">{returnStatistics.bestMonthCurrentYear.month}</span>
                </p>
                <p className={`text-xl font-bold mb-1 ${
                  returnStatistics.bestMonthCurrentYear.percent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {returnStatistics.bestMonthCurrentYear.percent >= 0 ? '+' : ''}
                  {returnStatistics.bestMonthCurrentYear.percent.toFixed(2)}%
                </p>
                <p className={`text-sm font-medium ${
                  returnStatistics.bestMonthCurrentYear.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {returnStatistics.bestMonthCurrentYear.amount >= 0 ? '+' : ''}
                  {formatCurrency(returnStatistics.bestMonthCurrentYear.amount)}
                </p>
              </div>

              {/* Worst Month Card */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-200 dark:border-slate-700">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">
                  Worst Month: <span className="text-red-600 dark:text-red-400 font-bold normal-case">{returnStatistics.worstMonthCurrentYear.month}</span>
                </p>
                <p className={`text-xl font-bold mb-1 ${
                  returnStatistics.worstMonthCurrentYear.percent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {returnStatistics.worstMonthCurrentYear.percent >= 0 ? '+' : ''}
                  {returnStatistics.worstMonthCurrentYear.percent.toFixed(2)}%
                </p>
                <p className={`text-sm font-medium ${
                  returnStatistics.worstMonthCurrentYear.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {returnStatistics.worstMonthCurrentYear.amount >= 0 ? '+' : ''}
                  {formatCurrency(returnStatistics.worstMonthCurrentYear.amount)}
                </p>
              </div>
            </div>
          )}
        </div>
        <div style={{ position: 'relative', zIndex: 10, width: '100%', height: '400px', backgroundColor: '#f9fafb' }}>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart 
              data={safeMonthlyReturns}
              syncId="dashboard-charts"
              margin={{ top: 20, right: 40, left: 20, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
              <XAxis 
                dataKey="month"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                stroke="#9ca3af"
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis 
                yAxisId="left" 
                tickFormatter={(value) => `${value}%`}
                tick={{ fill: '#8b5cf6', fontSize: 11, fontWeight: 600 }}
                stroke="#8b5cf6"
                label={{ value: 'Return %', angle: -90, position: 'insideLeft', fill: '#8b5cf6', fontSize: 12, fontWeight: 600 }}
                domain={[
                  (dataMin: number) => {
                    const min = Math.min(...safeMonthlyReturns.map(r => r.returnPercent));
                    return Math.floor(min / 10) * 10 - 5; // Round down to nearest 10, add padding
                  },
                  (dataMax: number) => {
                    const max = Math.max(...safeMonthlyReturns.map(r => r.returnPercent));
                    return Math.ceil(max / 10) * 10 + 5; // Round up to nearest 10, add padding
                  }
                ]}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right" 
                tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
                tick={{ fill: '#f59e0b', fontSize: 11, fontWeight: 600 }}
                stroke="#f59e0b"
                label={{ value: 'Return Amount', angle: 90, position: 'insideRight', fill: '#f59e0b', fontSize: 12, fontWeight: 600 }}
                domain={[
                  (dataMin: number) => {
                    const min = Math.min(...safeMonthlyReturns.map(r => r.returnAmount));
                    return Math.floor(min / 10000) * 10000 - 10000; // Round down to nearest 10k, add padding
                  },
                  (dataMax: number) => {
                    const max = Math.max(...safeMonthlyReturns.map(r => r.returnAmount));
                    return Math.ceil(max / 10000) * 10000 + 10000; // Round up to nearest 10k, add padding
                  }
                ]}
              />
              <ReferenceLine yAxisId="left" y={0} stroke="#9ca3af" strokeDasharray="2 2" strokeWidth={1.5} />
              <ReferenceLine yAxisId="right" y={0} stroke="#9ca3af" strokeDasharray="2 2" strokeWidth={1.5} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null;
                  
                  return (
                    <div className="bg-white dark:bg-slate-800 border-2 border-gray-300 dark:border-slate-600 rounded-xl shadow-2xl p-4 min-w-[200px]">
                      <p className="font-bold text-gray-900 dark:text-white mb-3 text-base border-b border-gray-200 dark:border-slate-700 pb-2">
                        {label}
                      </p>
                      {payload.map((entry: any, index: number) => {
                        const value = entry.value;
                        const name = entry.name || entry.dataKey;
                        let displayValue = '';
                        let color = 'text-gray-700 dark:text-gray-300';
                        let bgColor = 'bg-gray-50 dark:bg-slate-700';
                        
                        if (name === 'Return %' || name === 'returnPercent') {
                          displayValue = `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
                          color = value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
                          bgColor = value >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20';
                        } else if (name === 'Return Amount' || name === 'returnAmount') {
                          displayValue = formatCurrency(value);
                          color = value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
                          bgColor = value >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20';
                        } else {
                          displayValue = String(value);
                        }
                        
                        return (
                          <div key={index} className={`${bgColor} rounded-lg p-2 mb-2 last:mb-0`}>
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{name}</p>
                            <p className={`text-base font-bold ${color}`}>
                              {displayValue}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  );
                }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="line"
                formatter={(value) => <span className="text-sm font-semibold">{value}</span>}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="returnPercent"
                stroke="#8b5cf6"
                name="Return %"
                strokeWidth={3}
                dot={{ fill: '#8b5cf6', r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                activeDot={{ r: 7, strokeWidth: 2, stroke: '#ffffff' }}
                isAnimationActive={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="returnAmount"
                stroke="#f59e0b"
                name="Return Amount"
                strokeWidth={3}
                dot={{ fill: '#f59e0b', r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                activeDot={{ r: 7, strokeWidth: 2, stroke: '#ffffff' }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}
    </div>
  );
}

