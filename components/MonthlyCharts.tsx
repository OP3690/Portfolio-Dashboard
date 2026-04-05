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
        <div className="card p-8 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
            <svg className="w-8 h-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-lo font-medium">No chart data available</p>
          <p className="text-sm text-muted mt-1">Please upload your portfolio data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6" style={{ position: 'relative', zIndex: 1 }}>
      {/* Monthly Investments Chart */}
      {safeMonthlyInvestments.length > 0 && (
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 className="section-title text-base flex items-center gap-2">
            <div className="w-1 h-5 rounded-full" style={{ background: 'var(--brand)' }}></div>
            Month on Month Investments & Withdrawals
          </h2>
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Gross Total Invested', val: safeMonthlyInvestments.reduce((s, i) => s + (i.investments || 0), 0), color: 'var(--brand)' },
              { label: 'Total Withdrawal', val: safeMonthlyInvestments.reduce((s, i) => s + (i.withdrawals || 0), 0), color: 'var(--loss)' },
              ...(monthlyInvestmentAverages ? [
                { label: 'Avg Monthly Investment', val: monthlyInvestmentAverages.avgMonthlyInvestment || 0, color: 'var(--brand)' },
                { label: 'Avg Monthly Withdrawal', val: monthlyInvestmentAverages.avgMonthlyWithdrawal || 0, color: 'var(--loss)' },
              ] : []),
            ].map(({ label, val, color }) => (
              <div key={label} className="px-4 py-2 rounded-xl"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
                <p className="text-xs text-lo font-medium mb-0.5">{label}</p>
                <p className="text-base font-bold metric-value" style={{ color }}>{formatCurrency(val)}</p>
              </div>
            ))}
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
                  <div className="card p-3 max-w-md text-sm">
                    <p className="font-semibold text-hi mb-2">Month: {label}</p>
                    {payload.map((entry: any, index: number) => {
                      const value = entry.value;
                      const name = entry.name || entry.dataKey;

                      // Hide trendlines from tooltip
                      if (name === 'Investments Trend' || name === 'Withdrawals Trend') {
                        return null;
                      }
                      
                      const isInvestment = name === 'Investments (Buy)' || name === 'investments';
                      const details = isInvestment ? investmentDetails : withdrawalDetails;
                      const colorClass = isInvestment ? '' : '';
                      
                      return (
                        <div key={index} className="mb-3 last:mb-0">
                          <p className="text-sm font-medium text-hi mb-1">
                            {name}: <span className="font-semibold">{formatCurrency(value)}</span>
                          </p>
                          {details.length > 0 && (
                            <div className="mt-1 ml-2">
                              <div className="max-h-40 overflow-y-auto">
                                {details.map((detail: any, idx: number) => (
                                  <p key={idx} className="text-xs text-mid py-0.5" style={{ borderBottom: '1px solid var(--border-sm)' }}>
                                    <span className="font-medium text-hi">{detail.stockName}</span>
                                    {' • '}
                                    <span className="text-lo">{detail.qty.toLocaleString()} shares</span>
                                    {' • '}
                                    <span className="text-hi">{formatCurrency(detail.amount)}</span>
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
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 className="section-title text-base flex items-center gap-2">
            <div className="w-1 h-5 rounded-full" style={{ background: 'var(--gain)' }}></div>
            Month on Month Dividends Earned
          </h2>
          <div className="flex flex-wrap gap-3">
            <div className="px-4 py-2 rounded-xl" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
              <p className="text-xs text-lo font-medium mb-0.5">Total Dividend Earned</p>
              <p className="text-base font-bold metric-value" style={{ color: 'var(--gain)' }}>
                {formatCurrency(
                  safeMonthlyDividends.reduce((sum, item) => sum + (item.amount || 0), 0)
                )}
              </p>
            </div>
            {avgMonthlyDividends !== undefined && (
              <div className="px-4 py-2 rounded-xl" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
                <p className="text-xs text-lo font-medium mb-0.5">Avg. Monthly Dividends</p>
                <p className="text-base font-bold metric-value" style={{ color: 'var(--gain)' }}>
                  {formatCurrency(avgMonthlyDividends || 0)}
                </p>
              </div>
            )}
            {medianMonthlyDividendsLast12M !== undefined && (
              <div className="px-4 py-2 rounded-xl" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
                <p className="text-xs text-lo font-medium mb-0.5">Median (Last 12M)</p>
                <p className="text-base font-bold metric-value" style={{ color: 'var(--gain)' }}>
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
                  <div className="card p-3 text-sm">
                    <p className="font-semibold text-hi mb-2">Month: {label}</p>
                    {payload.map((entry: any, index: number) => {
                      const value = entry.value;
                      const name = entry.name || entry.dataKey;
                      
                      // Hide trendline from tooltip
                      if (name === 'Dividends Trend') {
                        return null;
                      }
                      
                      return (
                        <div key={index}>
                          <p className="text-sm text-hi font-medium mb-2">
                            {name}: <span className="font-semibold" style={{ color: 'var(--gain)' }}>{formatCurrency(value)}</span>
                          </p>
                          {stockDetails.length > 0 && (
                            <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border-sm)' }}>
                              <p className="text-xs font-bold text-lo mb-1">By Stock:</p>
                              <div className="max-h-40 overflow-y-auto">
                                {stockDetails.map((stock: any, idx: number) => (
                                  <p key={idx} className="text-xs text-mid py-0.5">
                                    <span className="font-medium text-hi">{stock.stockName}:</span>{' '}
                                    <span style={{ color: 'var(--gain)' }}>{formatCurrency(stock.amount)}</span>
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
      <div className="card p-6">
        <div className="mb-6">
          <h2 className="section-title text-base flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full" style={{ background: 'var(--brand)' }}></div>
            Month on Month Returns
          </h2>
          {returnStatistics && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* XIRR */}
              <div className="card p-4">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">XIRR</p>
                <p className="text-xl font-black metric-value"
                  style={{ color: returnStatistics.xirr >= 9 ? 'var(--gain)' : returnStatistics.xirr >= 5 ? 'var(--warn)' : 'var(--loss)' }}>
                  {returnStatistics.xirr >= 0 ? '+' : ''}{returnStatistics.xirr.toFixed(2)}%
                </p>
              </div>
              {/* CAGR */}
              <div className="card p-4">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">CAGR</p>
                <p className="text-xl font-black metric-value"
                  style={{ color: returnStatistics.cagr >= 9 ? 'var(--gain)' : returnStatistics.cagr >= 5 ? 'var(--warn)' : 'var(--loss)' }}>
                  {returnStatistics.cagr >= 0 ? '+' : ''}{returnStatistics.cagr.toFixed(2)}%
                </p>
              </div>
              {/* Avg Monthly Return */}
              <div className="card p-4">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Avg. Monthly Return</p>
                <p className="text-lg font-black metric-value mb-1"
                  style={{ color: returnStatistics.avgReturnOverall.percent >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                  {returnStatistics.avgReturnOverall.percent >= 0 ? '+' : ''}{returnStatistics.avgReturnOverall.percent.toFixed(2)}%
                </p>
                <p className="text-xs metric-value font-semibold"
                  style={{ color: returnStatistics.avgReturnOverall.amount >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                  {returnStatistics.avgReturnOverall.amount >= 0 ? '+' : ''}{formatCurrency(returnStatistics.avgReturnOverall.amount)}
                </p>
              </div>
              {/* Current Year Avg */}
              <div className="card p-4">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Current Year Avg.</p>
                <p className="text-lg font-black metric-value mb-1"
                  style={{ color: returnStatistics.avgReturnCurrentYear.percent >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                  {returnStatistics.avgReturnCurrentYear.percent >= 0 ? '+' : ''}{returnStatistics.avgReturnCurrentYear.percent.toFixed(2)}%
                </p>
                <p className="text-xs metric-value font-semibold"
                  style={{ color: returnStatistics.avgReturnCurrentYear.amount >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                  {returnStatistics.avgReturnCurrentYear.amount >= 0 ? '+' : ''}{formatCurrency(returnStatistics.avgReturnCurrentYear.amount)}
                </p>
              </div>
              {/* Best Month */}
              <div className="card p-4">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
                  Best Month: <span className="font-bold normal-case" style={{ color: 'var(--gain)' }}>{returnStatistics.bestMonthCurrentYear.month}</span>
                </p>
                <p className="text-lg font-black metric-value mb-1"
                  style={{ color: returnStatistics.bestMonthCurrentYear.percent >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                  {returnStatistics.bestMonthCurrentYear.percent >= 0 ? '+' : ''}{returnStatistics.bestMonthCurrentYear.percent.toFixed(2)}%
                </p>
                <p className="text-xs metric-value font-semibold"
                  style={{ color: returnStatistics.bestMonthCurrentYear.amount >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                  {returnStatistics.bestMonthCurrentYear.amount >= 0 ? '+' : ''}{formatCurrency(returnStatistics.bestMonthCurrentYear.amount)}
                </p>
              </div>
              {/* Worst Month */}
              <div className="card p-4">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
                  Worst Month: <span className="font-bold normal-case" style={{ color: 'var(--loss)' }}>{returnStatistics.worstMonthCurrentYear.month}</span>
                </p>
                <p className="text-lg font-black metric-value mb-1"
                  style={{ color: returnStatistics.worstMonthCurrentYear.percent >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                  {returnStatistics.worstMonthCurrentYear.percent >= 0 ? '+' : ''}{returnStatistics.worstMonthCurrentYear.percent.toFixed(2)}%
                </p>
                <p className="text-xs metric-value font-semibold"
                  style={{ color: returnStatistics.worstMonthCurrentYear.amount >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                  {returnStatistics.worstMonthCurrentYear.amount >= 0 ? '+' : ''}{formatCurrency(returnStatistics.worstMonthCurrentYear.amount)}
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
                    <div className="card p-4 min-w-[200px]">
                      <p className="font-bold text-hi mb-3 text-base pb-2" style={{ borderBottom: '1px solid var(--border-sm)' }}>
                        {label}
                      </p>
                      {payload.map((entry: any, index: number) => {
                        const value = entry.value;
                        const name = entry.name || entry.dataKey;
                        let displayValue = '';
                        let itemColor = 'var(--text-hi)';

                        if (name === 'Return %' || name === 'returnPercent') {
                          displayValue = `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
                          itemColor = value >= 0 ? 'var(--gain)' : 'var(--loss)';
                        } else if (name === 'Return Amount' || name === 'returnAmount') {
                          displayValue = formatCurrency(value);
                          itemColor = value >= 0 ? 'var(--gain)' : 'var(--loss)';
                        } else {
                          displayValue = String(value);
                        }

                        return (
                          <div key={index} className="rounded-lg p-2 mb-2 last:mb-0"
                            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
                            <p className="text-xs font-medium text-lo mb-1">{name}</p>
                            <p className="text-base font-bold metric-value" style={{ color: itemColor }}>
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

