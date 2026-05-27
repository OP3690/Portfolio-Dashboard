'use client';

interface TrackingEntry {
  _id: string;
  date: string;
  closingPrice: number;
  dailyChange: number;
  totalReturn: number;
  volume: number;
  dayNumber: number;
}

interface TrackingTableProps {
  entries: TrackingEntry[];
  entryPrice: number;
}

export default function TrackingTable({ entries, entryPrice }: TrackingTableProps) {
  if (!entries || entries.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        No tracking data available yet
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-gray-800">
            <th className="pb-3 text-gray-400 font-medium">Day</th>
            <th className="pb-3 text-gray-400 font-medium">Date</th>
            <th className="pb-3 text-gray-400 font-medium text-right">Price</th>
            <th className="pb-3 text-gray-400 font-medium text-right">Daily Chg</th>
            <th className="pb-3 text-gray-400 font-medium text-right">Total Return</th>
            <th className="pb-3 text-gray-400 font-medium text-right">vs Entry</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {entries.map((entry) => {
            const isPositive = entry.totalReturn >= 0;
            const isDailyPositive = entry.dailyChange >= 0;
            const vsEntry = entry.closingPrice - entryPrice;

            return (
              <tr key={entry._id} className="hover:bg-gray-800/30">
                <td className="py-2.5 text-gray-400 font-mono">D{entry.dayNumber}</td>
                <td className="py-2.5 text-gray-300">
                  {new Date(entry.date).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                  })}
                </td>
                <td className="py-2.5 text-gray-100 text-right font-mono">
                  ₹{entry.closingPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td
                  className={`py-2.5 text-right font-mono font-medium ${
                    isDailyPositive ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isDailyPositive ? '+' : ''}{entry.dailyChange.toFixed(2)}%
                </td>
                <td
                  className={`py-2.5 text-right font-mono font-semibold ${
                    isPositive ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isPositive ? '+' : ''}{entry.totalReturn.toFixed(2)}%
                </td>
                <td
                  className={`py-2.5 text-right font-mono text-xs ${
                    vsEntry >= 0 ? 'text-emerald-500' : 'text-rose-500'
                  }`}
                >
                  {vsEntry >= 0 ? '+' : ''}₹{vsEntry.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
