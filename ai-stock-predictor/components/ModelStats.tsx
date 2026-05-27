'use client';

interface Weights {
  rsi: number;
  macd: number;
  bbPosition: number;
  volumeRatio: number;
  momentum10d: number;
  maCrossover: number;
  adx: number;
}

interface ModelStatsProps {
  version: string;
  successRate: number;
  totalEvaluated: number;
  weights: Weights;
}

const WEIGHT_LABELS: Record<keyof Weights, string> = {
  rsi: 'RSI',
  macd: 'MACD',
  bbPosition: 'BB Position',
  volumeRatio: 'Volume Ratio',
  momentum10d: '10d Momentum',
  maCrossover: 'MA Crossover',
  adx: 'ADX',
};

function WeightBar({
  label,
  value,
  maxValue = 0.4,
}: {
  label: string;
  value: number;
  maxValue?: number;
}) {
  const percentage = Math.min((value / maxValue) * 100, 100);
  const displayValue = (value * 100).toFixed(1);

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-xs text-gray-300 font-mono">{displayValue}%</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default function ModelStats({
  version,
  successRate,
  totalEvaluated,
  weights,
}: ModelStatsProps) {
  const getSuccessRateColor = (rate: number) => {
    if (rate >= 70) return 'text-emerald-400';
    if (rate >= 50) return 'text-amber-400';
    return 'text-rose-400';
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Model Info</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Version</p>
            <p className="text-white font-semibold font-mono">{version}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Success Rate</p>
            <p className={`text-xl font-bold ${getSuccessRateColor(successRate)}`}>
              {successRate.toFixed(1)}%
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">{totalEvaluated} predictions evaluated</p>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-800" />

      {/* Indicator Weights */}
      <div>
        <h4 className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wider">
          Indicator Weights
        </h4>
        <div className="space-y-3">
          {(Object.keys(weights) as Array<keyof Weights>).map((key) => (
            <WeightBar key={key} label={WEIGHT_LABELS[key]} value={weights[key]} />
          ))}
        </div>
      </div>
    </div>
  );
}
