'use client';

interface TrackingData {
  closingPrice: number;
  totalReturn: number;
  dailyChange: number;
  dayNumber: number;
}

interface Prediction {
  _id: string;
  stockSymbol: string;
  stockName: string;
  entryPrice: number;
  confidenceScore: number;
  status: string;
  bestReturn: number;
  firstRecommendedDate: string;
  recommendationCount: number;
  indicatorSnapshot: {
    rsi: number;
    macdSignal: number;
    bbPosition: number;
    volumeRatio: number;
    momentum10d: number;
    maCrossover: number;
    adx: number;
  };
  latestTracking?: TrackingData;
}

interface PredictionCardProps {
  prediction: Prediction;
}

function ConfidenceGauge({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (score / 100) * circumference * 0.75; // 270 degree arc

  const getColor = (score: number) => {
    if (score >= 70) return '#10b981'; // emerald-500
    if (score >= 50) return '#f59e0b'; // amber-500
    return '#ef4444'; // red-500
  };

  return (
    <div className="relative w-20 h-20 flex items-center justify-center">
      <svg className="w-20 h-20 -rotate-[135deg]" viewBox="0 0 100 100">
        {/* Background arc */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#1f2937"
          strokeWidth="8"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeLinecap="round"
        />
        {/* Score arc */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={getColor(score)}
          strokeWidth="8"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-lg font-bold text-white">{score}</span>
        <span className="text-xs text-gray-400">Score</span>
      </div>
    </div>
  );
}

function Sparkline({ returns }: { returns: number[] }) {
  if (!returns || returns.length < 2) {
    return <div className="h-10 flex items-center text-xs text-gray-500">No data</div>;
  }

  const min = Math.min(...returns, 0);
  const max = Math.max(...returns, 0);
  const range = max - min || 1;
  const width = 120;
  const height = 40;

  const points = returns.map((val, i) => {
    const x = (i / (returns.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  });

  const polyline = points.join(' ');
  const lastReturn = returns[returns.length - 1];
  const color = lastReturn >= 0 ? '#10b981' : '#f87171';

  // Fill area
  const areaPoints = `0,${height} ${polyline} ${width},${height}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`sparkline-fill-${returns.length}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {/* Zero line */}
      {min < 0 && max > 0 && (
        <line
          x1="0"
          y1={height - ((-min) / range) * height}
          x2={width}
          y2={height - ((-min) / range) * height}
          stroke="#374151"
          strokeWidth="1"
          strokeDasharray="3,3"
        />
      )}
      {/* Fill area */}
      <polygon
        points={areaPoints}
        fill={`url(#sparkline-fill-${returns.length})`}
      />
      {/* Line */}
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Active: 'bg-indigo-900 text-indigo-300 border border-indigo-700',
    Achieved: 'bg-emerald-900 text-emerald-300 border border-emerald-700',
    OverAchieved: 'bg-green-900 text-green-300 border border-green-700',
    MissedSlightly: 'bg-amber-900 text-amber-300 border border-amber-700',
    Missed: 'bg-rose-900 text-rose-300 border border-rose-700',
    Expired: 'bg-gray-800 text-gray-400 border border-gray-700',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] || styles.Active}`}>
      {status}
    </span>
  );
}

export default function PredictionCard({ prediction }: PredictionCardProps) {
  const currentPrice = prediction.latestTracking?.closingPrice || prediction.entryPrice;
  const totalReturn = prediction.latestTracking?.totalReturn || 0;
  const dayNumber = prediction.latestTracking?.dayNumber || 0;
  const isPositive = totalReturn >= 0;

  // Mock sparkline data from returns over time (simplified)
  const sparklineData = totalReturn !== 0
    ? Array.from({ length: Math.max(2, dayNumber) }, (_, i) => {
        // Simulate a path toward current return
        const progress = (i + 1) / Math.max(2, dayNumber);
        const noise = (Math.random() - 0.5) * 1.5;
        return totalReturn * progress + noise;
      })
    : [0, 0];

  const daysAgo = Math.floor(
    (Date.now() - new Date(prediction.firstRecommendedDate).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-semibold text-base truncate">{prediction.stockName}</h3>
            {prediction.recommendationCount > 1 && (
              <span className="text-xs bg-indigo-800 text-indigo-300 px-1.5 py-0.5 rounded font-medium">
                x{prediction.recommendationCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-mono bg-gray-800 text-gray-300 px-2 py-0.5 rounded">
              {prediction.stockSymbol.replace('.NS', '')}
            </span>
            <span className="text-xs text-gray-500">NSE</span>
          </div>
        </div>
        <StatusBadge status={prediction.status} />
      </div>

      {/* Price Section */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1">Entry Price</p>
          <p className="text-white font-semibold text-sm">
            ₹{prediction.entryPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1">Current Price</p>
          <p className="text-white font-semibold text-sm">
            ₹{currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Return & Gauge Row */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`text-2xl font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}
            >
              {isPositive ? '+' : ''}{totalReturn.toFixed(2)}%
            </span>
            <span className={`text-lg ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
              {isPositive ? '↑' : '↓'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Best: {prediction.bestReturn >= 0 ? '+' : ''}{prediction.bestReturn.toFixed(2)}%
          </p>
          <p className="text-xs text-gray-500">
            Day {dayNumber} • {daysAgo}d ago
          </p>
        </div>
        <ConfidenceGauge score={prediction.confidenceScore} />
      </div>

      {/* Sparkline */}
      <div className="mb-3">
        <p className="text-xs text-gray-500 mb-1">Return Trajectory</p>
        <Sparkline returns={sparklineData} />
      </div>

      {/* Indicator Mini Summary */}
      <div className="grid grid-cols-3 gap-2 text-center border-t border-gray-800 pt-3">
        <div>
          <p className="text-xs text-gray-500">RSI</p>
          <p
            className={`text-sm font-medium ${
              prediction.indicatorSnapshot.rsi > 70
                ? 'text-rose-400'
                : prediction.indicatorSnapshot.rsi < 30
                ? 'text-emerald-400'
                : 'text-gray-300'
            }`}
          >
            {prediction.indicatorSnapshot.rsi.toFixed(1)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">ADX</p>
          <p
            className={`text-sm font-medium ${
              prediction.indicatorSnapshot.adx > 25 ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {prediction.indicatorSnapshot.adx.toFixed(1)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Vol Ratio</p>
          <p
            className={`text-sm font-medium ${
              prediction.indicatorSnapshot.volumeRatio > 1.5
                ? 'text-emerald-400'
                : 'text-gray-300'
            }`}
          >
            {prediction.indicatorSnapshot.volumeRatio.toFixed(2)}x
          </p>
        </div>
      </div>
    </div>
  );
}
