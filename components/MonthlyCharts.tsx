'use client';

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
  monthlyDividends: Array<{ month: string; amount: number; stockDetails?: Array<{stockName: string; amount: number}> }>;
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
  monthlyDividends,
  monthlyReturns,
  returnStatistics,
}: MonthlyChartsProps) {
  // Guard against undefined/null data
  const safeMonthlyInvestments = monthlyInvestments || [];
  const safeMonthlyDividends = monthlyDividends || [];
  const safeMonthlyReturns = monthlyReturns || [];

  // Don't render charts if there's no data
  if (safeMonthlyInvestments.length === 0 && safeMonthlyDividends.length === 0 && safeMonthlyReturns.length === 0) {
    return (
      <div className="mt-6">
        <div className="bg-white rounded-xl shadow-lg p-6 text-center">
          <p className="text-gray-500">No chart data available. Please upload your portfolio data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Monthly Investments Chart */}
      {safeMonthlyInvestments.length > 0 && (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Month on Month Investments & Withdrawals</h2>
          <div className="flex gap-6 text-right">
            <div>
              <p className="text-sm text-gray-600">Total Invested:</p>
              <p className="text-lg font-semibold text-blue-600">
                {formatCurrency(
                  safeMonthlyInvestments.reduce((sum, item) => sum + (item.investments || 0), 0)
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Withdrawal:</p>
              <p className="text-lg font-semibold text-red-600">
                {formatCurrency(
                  safeMonthlyInvestments.reduce((sum, item) => sum + (item.withdrawals || 0), 0)
                )}
              </p>
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={safeMonthlyInvestments}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`} />
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
            <Bar dataKey="investments" fill="#3b82f6" name="Investments (Buy)" />
            <Bar dataKey="withdrawals" fill="#ef4444" name="Withdrawals (Sell)" />
            <Line 
              type="monotone" 
              dataKey="investments" 
              stroke="#1e40af" 
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
              name="Investments Trend"
              legendType="line"
            />
            <Line 
              type="monotone" 
              dataKey="withdrawals" 
              stroke="#dc2626" 
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
              name="Withdrawals Trend"
              legendType="line"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      )}

      {/* Monthly Dividends Chart */}
      {safeMonthlyDividends.length > 0 && (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Month on Month Dividends Earned</h2>
          <div className="text-right">
            <p className="text-sm text-gray-600">Total Dividend Earned:</p>
            <p className="text-lg font-semibold text-green-600">
              {formatCurrency(
                safeMonthlyDividends.reduce((sum, item) => sum + (item.amount || 0), 0)
              )}
            </p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={safeMonthlyDividends}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`} />
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
            <Bar dataKey="amount" fill="#10b981" name="Dividend Amount" />
            <Line 
              type="monotone" 
              dataKey="amount" 
              stroke="#059669" 
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
              name="Dividends Trend"
              legendType="line"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      )}

      {/* Monthly Returns Chart */}
      {safeMonthlyReturns.length > 0 && (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Month on Month Returns</h2>
          {returnStatistics && (
            <div className="flex gap-6 text-right">
              <div>
                <p className="text-sm text-gray-600">XIRR:</p>
                <p className={`text-lg font-semibold ${
                  returnStatistics.xirr >= 9 ? 'text-green-600' : 
                  returnStatistics.xirr >= 5 ? 'text-yellow-600' : 
                  'text-red-600'
                }`}>
                  {returnStatistics.xirr >= 0 ? '+' : ''}
                  {returnStatistics.xirr.toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">CAGR:</p>
                <p className={`text-lg font-semibold ${
                  returnStatistics.cagr >= 9 ? 'text-green-600' : 
                  returnStatistics.cagr >= 5 ? 'text-yellow-600' : 
                  'text-red-600'
                }`}>
                  {returnStatistics.cagr >= 0 ? '+' : ''}
                  {returnStatistics.cagr.toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Avg. Monthly Return (Overall):</p>
                <p className={`text-lg font-semibold ${
                  returnStatistics.avgReturnOverall.percent >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {returnStatistics.avgReturnOverall.percent >= 0 ? '+' : ''}
                  {returnStatistics.avgReturnOverall.percent.toFixed(2)}% ({returnStatistics.avgReturnOverall.amount >= 0 ? '+' : ''}
                  {formatCurrency(returnStatistics.avgReturnOverall.amount)})
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Avg. Return (Current Year):</p>
                <p className={`text-lg font-semibold ${
                  returnStatistics.avgReturnCurrentYear.percent >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {returnStatistics.avgReturnCurrentYear.percent >= 0 ? '+' : ''}
                  {returnStatistics.avgReturnCurrentYear.percent.toFixed(2)}% ({returnStatistics.avgReturnCurrentYear.amount >= 0 ? '+' : ''}
                  {formatCurrency(returnStatistics.avgReturnCurrentYear.amount)})
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Best Month (Current Year):</p>
                <p className="text-sm text-gray-700 font-medium mb-1">
                  {returnStatistics.bestMonthCurrentYear.month}
                </p>
                <p className={`text-lg font-semibold ${
                  returnStatistics.bestMonthCurrentYear.percent >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {returnStatistics.bestMonthCurrentYear.percent >= 0 ? '+' : ''}
                  {returnStatistics.bestMonthCurrentYear.percent.toFixed(2)}% ({returnStatistics.bestMonthCurrentYear.amount >= 0 ? '+' : ''}
                  {formatCurrency(returnStatistics.bestMonthCurrentYear.amount)})
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Worst Month (Current Year):</p>
                <p className="text-sm text-gray-700 font-medium mb-1">
                  {returnStatistics.worstMonthCurrentYear.month}
                </p>
                <p className={`text-lg font-semibold ${
                  returnStatistics.worstMonthCurrentYear.percent >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {returnStatistics.worstMonthCurrentYear.percent >= 0 ? '+' : ''}
                  {returnStatistics.worstMonthCurrentYear.percent.toFixed(2)}% ({returnStatistics.worstMonthCurrentYear.amount >= 0 ? '+' : ''}
                  {formatCurrency(returnStatistics.worstMonthCurrentYear.amount)})
                </p>
              </div>
            </div>
          )}
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={safeMonthlyReturns}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis 
              yAxisId="left" 
              tickFormatter={(value) => `${value}%`}
              domain={[
                (dataMin: number) => {
                  const min = Math.min(...safeMonthlyReturns.map(r => r.returnPercent));
                  return Math.floor(min / 10) * 10; // Round down to nearest 10
                },
                (dataMax: number) => {
                  const max = Math.max(...safeMonthlyReturns.map(r => r.returnPercent));
                  return Math.ceil(max / 10) * 10; // Round up to nearest 10
                }
              ]}
            />
            <YAxis 
              yAxisId="right" 
              orientation="right" 
              tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
              domain={[
                (dataMin: number) => {
                  const min = Math.min(...safeMonthlyReturns.map(r => r.returnAmount));
                  return Math.floor(min / 10000) * 10000; // Round down to nearest 10k
                },
                (dataMax: number) => {
                  const max = Math.max(...safeMonthlyReturns.map(r => r.returnAmount));
                  return Math.ceil(max / 10000) * 10000; // Round up to nearest 10k
                }
              ]}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                    <p className="font-semibold text-gray-800 mb-2">Month: {label}</p>
                    {payload.map((entry: any, index: number) => {
                      const value = entry.value;
                      const name = entry.name || entry.dataKey;
                      let displayValue = '';
                      let color = 'text-gray-700';
                      
                      if (name === 'Return %' || name === 'returnPercent') {
                        displayValue = `${value.toFixed(2)}%`;
                        color = value >= 0 ? 'text-green-600' : 'text-red-600';
                      } else if (name === 'Return Amount' || name === 'returnAmount') {
                        displayValue = formatCurrency(value);
                        color = value >= 0 ? 'text-green-600' : 'text-red-600';
                      } else {
                        displayValue = String(value);
                      }
                      
                      return (
                        <p key={index} className={`text-sm ${color} font-medium`}>
                          {name}: <span className="font-semibold">{displayValue}</span>
                        </p>
                      );
                    })}
                  </div>
                );
              }}
            />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="returnPercent"
              stroke="#8b5cf6"
              name="Return %"
              strokeWidth={2}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="returnAmount"
              stroke="#f59e0b"
              name="Return Amount"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
}

