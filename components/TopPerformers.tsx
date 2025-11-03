'use client';

import { formatCurrency } from '@/lib/utils';

interface TopPerformersProps {
  title: string;
  performers: Array<{
    stockName: string;
    isin: string;
    profitLossPercent: number;
    profitLoss: number;
    marketValue: number;
  }>;
  isPositive: boolean;
}

export default function TopPerformers({ title, performers, isPositive }: TopPerformersProps) {
  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">{title}</h2>
      {performers.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No data available</p>
      ) : (
        <div className="space-y-4">
          {performers.map((performer, index) => (
            <div
              key={performer.isin}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${
                  isPositive ? 'bg-green-500' : 'bg-red-500'
                }`}>
                  {index + 1}
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{performer.stockName}</p>
                  <p className="text-sm text-gray-500">Value: {formatCurrency(performer.marketValue)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-bold ${
                  performer.profitLossPercent >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {performer.profitLossPercent >= 0 ? '+' : ''}
                  {performer.profitLossPercent.toFixed(2)}%
                </p>
                <p className={`text-sm ${
                  performer.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatCurrency(performer.profitLoss)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

