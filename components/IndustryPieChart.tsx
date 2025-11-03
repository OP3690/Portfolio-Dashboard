'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatCurrency } from '@/lib/utils';

interface IndustryPieChartProps {
  data: Array<{
    sector: string;
    percentage: number;
    amount: number;
    xirr: number;
    cagr: number;
    overallReturnPercent: number;
    profitLossPercent: number;
    profitLossAmount: number;
  }>;
}

const COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#6366f1',
];

export default function IndustryPieChart({ data }: IndustryPieChartProps) {
  const chartData = data.map((item, index) => ({
    ...item,
    name: item.sector,
    fill: COLORS[index % COLORS.length],
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-800">{data.sector}</p>
          <p className="text-blue-600">
            Amount: {formatCurrency(data.amount)}
          </p>
          <p className="text-gray-600">
            Percentage: {data.percentage.toFixed(2)}%
          </p>
        </div>
      );
    }
    return null;
  };

  const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, sector }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    // Only show label if percentage is >= 3% to avoid clutter
    if (percent < 0.03) return null;

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize={12}
        fontWeight="bold"
      >
        {`${(percent * 100).toFixed(1)}%`}
      </text>
    );
  };

  const renderCustomLegend = (props: any) => {
    const { payload } = props;
    return (
      <div className="flex flex-wrap justify-center gap-3 mt-4">
        {payload.map((entry: any, index: number) => (
          <div key={`legend-${index}`} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-sm text-gray-700">{entry.payload.sector}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">
          Holdings Across Industries
        </h2>
        <h3 className="text-lg font-semibold text-gray-700">Industry Breakdown</h3>
      </div>
      {data.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No data available</p>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left side - Pie Chart */}
          <div className="flex-1 lg:w-1/2">
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={CustomLabel}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="amount"
                  nameKey="sector"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend content={renderCustomLegend} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Right side - Scrollable Table */}
          <div className="flex-1 lg:w-1/2">
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {data.map((item, index) => (
                <div
                  key={item.sector}
                  className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded flex-shrink-0"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-sm font-semibold text-gray-800">{item.sector}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-gray-800 block">
                        {formatCurrency(item.amount)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  
                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-600">XIRR:</span>
                      <span className={`ml-1 font-medium ${
                        item.xirr >= 9 ? 'text-green-600' : 
                        item.xirr >= 5 ? 'text-yellow-600' : 
                        'text-red-600'
                      }`}>
                        {item.xirr >= 0 ? '+' : ''}{item.xirr.toFixed(2)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">CAGR:</span>
                      <span className={`ml-1 font-medium ${
                        item.cagr >= 9 ? 'text-green-600' : 
                        item.cagr >= 5 ? 'text-yellow-600' : 
                        'text-red-600'
                      }`}>
                        {item.cagr >= 0 ? '+' : ''}{item.cagr.toFixed(2)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Overall Return %:</span>
                      <span className={`ml-1 font-medium ${
                        item.overallReturnPercent >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {item.overallReturnPercent >= 0 ? '+' : ''}{item.overallReturnPercent.toFixed(2)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">P/L %:</span>
                      <span className={`ml-1 font-medium ${
                        item.profitLossPercent >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {item.profitLossPercent >= 0 ? '+' : ''}{item.profitLossPercent.toFixed(2)}%
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-600">P/L Amount:</span>
                      <span className={`ml-1 font-medium ${
                        item.profitLossAmount >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {item.profitLossAmount >= 0 ? '+' : ''}{formatCurrency(item.profitLossAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

