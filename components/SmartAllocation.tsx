'use client';

import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

// CSS to hide number input spinners
const numberInputStyles = `
  input[type="number"]::-webkit-inner-spin-button,
  input[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  input[type="number"] {
    -moz-appearance: textfield;
  }
`;

interface Allocation {
  rank: number;
  stockName: string;
  symbol: string;
  isin: string;
  exp3MReturn: number;
  volatility: number;
  weight: number;
  amount: number;
  projectedValue: number;
  projectedReturn: number;
  confidence: string;
  confidenceIcon: string;
  p12: number;
  regimeBull: number;
}

interface SmartAllocationProps {
  quantPredictions?: any[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function SmartAllocation({ quantPredictions }: SmartAllocationProps) {
  const [investmentAmount, setInvestmentAmount] = useState<number>(100000);
  const [strategy, setStrategy] = useState<'aggressive' | 'balanced' | 'defensive'>('balanced');
  const [loading, setLoading] = useState(false);
  const [allocationData, setAllocationData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCalculate = async () => {
    if (!investmentAmount || investmentAmount <= 0) {
      setError('Please enter a valid investment amount');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/smart-allocation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          investmentAmount,
          strategy,
          quantPredictions: quantPredictions || [],
        }),
      });

      const result = await response.json();

      if (result.success) {
        setAllocationData(result.data);
      } else {
        setError(result.error || 'Failed to generate allocation');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to calculate allocation');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const chartData = allocationData?.allocations?.map((alloc: Allocation) => ({
    name: alloc.stockName,
    value: alloc.weight,
    amount: alloc.amount,
  })) || [];

  return (
    <div className="mb-8 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-xl p-6 border-2 border-indigo-200 shadow-lg">
      <style dangerouslySetInnerHTML={{ __html: numberInputStyles }} />
        <div className="mb-6">
          <h3 className="text-2xl font-bold text-gray-800 mb-2 flex items-center gap-2">
            🧠 Smart Allocation Advisor
          </h3>
          <p className="text-gray-600 text-sm">
            AI-Optimized Portfolio for Next 3 Months • Maximizes expected return with controlled risk
          </p>
        </div>

      {/* Input Section */}
      <div className="bg-white rounded-lg p-6 mb-6 border border-indigo-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Investment Amount (₹)
            </label>
            <input
              type="number"
              value={investmentAmount}
              onChange={(e) => setInvestmentAmount(parseFloat(e.target.value) || 0)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="100000"
              min="1000"
              step="1000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Strategy
            </label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as any)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="aggressive">🚀 Aggressive</option>
              <option value="balanced">⚖️ Balanced</option>
              <option value="defensive">🛡️ Defensive</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCalculate}
              disabled={loading}
              className="w-full px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '⏳ Calculating...' : '💹 Generate Allocation'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Allocation Results */}
      {allocationData && (
        <div className="space-y-6">
          {/* Portfolio Summary */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg p-6 text-white">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm opacity-90 mb-1">Total Investment</div>
                <div className="text-2xl font-bold">{formatCurrency(allocationData.portfolio.totalAmount)}</div>
              </div>
              <div>
                <div className="text-sm opacity-90 mb-1">Projected Value</div>
                <div className="text-2xl font-bold">{formatCurrency(allocationData.portfolio.totalProjectedValue)}</div>
              </div>
              <div>
                <div className="text-sm opacity-90 mb-1">Expected Return</div>
                <div className="text-2xl font-bold">+{allocationData.portfolio.totalProjectedReturn.toFixed(2)}%</div>
              </div>
              <div>
                <div className="text-sm opacity-90 mb-1">Avg Volatility</div>
                <div className="text-2xl font-bold">{allocationData.portfolio.avgVolatility.toFixed(1)}%</div>
              </div>
            </div>
          </div>

          {/* Chart and Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Donut Chart */}
            <div className="bg-white rounded-lg p-6 border border-indigo-200 shadow-sm">
              <h4 className="text-lg font-semibold text-gray-800 mb-4">Allocation Distribution</h4>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(props: any) => {
                      const percent = props.percent || 0;
                      const name = props.name || '';
                      return `${name}: ${(percent * 100).toFixed(0)}%`;
                    }}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {chartData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => `${value.toFixed(1)}%`}
                    labelFormatter={(label) => label}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Allocation Table */}
            <div className="bg-white rounded-lg p-6 border border-indigo-200 shadow-sm">
              <h4 className="text-lg font-semibold text-gray-800 mb-4">Optimal Allocation</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rank
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Stock
                      </th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Weight
                      </th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Invest ₹
                      </th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Projected ₹
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Confidence
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {allocationData.allocations.map((alloc: Allocation) => (
                      <tr key={alloc.isin} className="hover:bg-gray-50">
                        <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {alloc.rank}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{alloc.stockName}</div>
                          <div className="text-xs text-gray-500">
                            Exp: {alloc.exp3MReturn.toFixed(1)}% • Vol: {alloc.volatility.toFixed(1)}%
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                          {alloc.weight.toFixed(1)}%
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                          {formatCurrency(alloc.amount)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-right text-green-600 font-medium">
                          {formatCurrency(alloc.projectedValue)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-center">
                          <span className="text-sm" title={`P(>12%): ${(alloc.p12 * 100).toFixed(0)}%, Regime: ${alloc.regimeBull.toFixed(0)}%`}>
                            {alloc.confidenceIcon} {alloc.confidence}
                          </span>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-semibold">
                      <td colSpan={2} className="px-3 py-3 text-sm text-gray-900">
                        Total Portfolio
                      </td>
                      <td className="px-3 py-3 text-sm text-right text-gray-900">100%</td>
                      <td className="px-3 py-3 text-sm text-right text-gray-900">
                        {formatCurrency(allocationData.portfolio.totalAmount)}
                      </td>
                      <td className="px-3 py-3 text-sm text-right text-green-600">
                        {formatCurrency(allocationData.portfolio.totalProjectedValue)}
                      </td>
                      <td className="px-3 py-3 text-sm text-center text-gray-900">
                        +{allocationData.portfolio.totalProjectedReturn.toFixed(2)}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Detailed Metrics Table */}
          <div className="bg-white rounded-lg p-6 border border-indigo-200 shadow-sm">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">Detailed Metrics</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Stock
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Exp 3M Ret %
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Volatility %
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      P(&gt;12%) %
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Regime (Bull %) %
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Weight %
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {allocationData.allocations.map((alloc: Allocation) => (
                    <tr key={alloc.isin} className="hover:bg-gray-50">
                      <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {alloc.stockName}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                        {alloc.exp3MReturn.toFixed(2)}%
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                        {alloc.volatility.toFixed(2)}%
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                        {(alloc.p12 * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                        {alloc.regimeBull.toFixed(1)}%
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-right text-indigo-600 font-semibold">
                        {alloc.weight.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

