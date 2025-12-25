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
          className="group bg-white dark:bg-slate-800 rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 p-6 border border-gray-100 dark:border-slate-700 hover:scale-[1.02] hover:-translate-y-1"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-2 uppercase tracking-wide">
                {card.title}
              </p>
              <p className={`text-3xl font-bold transition-colors ${
                card.value >= 0 
                  ? 'text-gray-900 dark:text-white' 
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {card.isPercent 
                  ? `${card.value >= 0 ? '+' : ''}${card.value.toFixed(2)}%`
                  : formatCurrency(card.value)
                }
              </p>
            </div>
            <div className={`${card.color} rounded-2xl w-14 h-14 flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
              {card.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

