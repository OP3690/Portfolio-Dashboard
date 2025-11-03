'use client';

import { formatCurrency } from '@/lib/utils';

interface SummaryCardsProps {
  summary: {
    currentValue: number;
    totalInvested: number;
    totalProfitLoss: number;
    totalRealizedPL: number;
    totalReturn: number;
    totalReturnPercent: number;
    xirr: number;
  };
}

export default function SummaryCards({ summary }: SummaryCardsProps) {
  const cards = [
    {
      title: 'Current Value',
      value: summary.currentValue,
      color: 'bg-blue-500',
      icon: '💰',
    },
    {
      title: 'Total Invested',
      value: summary.totalInvested,
      color: 'bg-gray-500',
      icon: '📊',
    },
    {
      title: 'Total Profit/Loss',
      value: summary.totalProfitLoss,
      color: summary.totalProfitLoss >= 0 ? 'bg-green-500' : 'bg-red-500',
      icon: '📈',
    },
    {
      title: 'XIRR',
      value: summary.xirr,
      isPercent: true,
      color: summary.xirr >= 0 ? 'bg-green-500' : 'bg-red-500',
      icon: '🎯',
    },
    {
      title: 'Total Return %',
      value: summary.totalReturnPercent,
      isPercent: true,
      color: summary.totalReturnPercent >= 0 ? 'bg-green-500' : 'bg-red-500',
      icon: '📉',
    },
    {
      title: 'Realized P&L',
      value: summary.totalRealizedPL,
      color: summary.totalRealizedPL >= 0 ? 'bg-green-500' : 'bg-red-500',
      icon: '✅',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {cards.map((card, index) => (
        <div
          key={index}
          className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium mb-1">{card.title}</p>
              <p className={`text-2xl font-bold ${
                card.value >= 0 ? 'text-gray-800' : 'text-red-600'
              }`}>
                {card.isPercent 
                  ? `${card.value.toFixed(2)}%`
                  : formatCurrency(card.value)
                }
              </p>
            </div>
            <div className={`${card.color} rounded-full w-12 h-12 flex items-center justify-center text-2xl`}>
              {card.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

