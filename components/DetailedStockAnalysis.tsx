'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, ComposedChart
} from 'recharts';

interface Stock {
  isin: string;
  stockName: string;
  symbol: string;
  sector: string;
}

interface ChartDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  trendline: number | null;
  atr: number | null;
  stochasticK: number | null;
  stochasticD: number | null;
  adx: number | null;
  plusDI: number | null;
  minusDI: number | null;
  support: number | null;
  resistance: number | null;
}

interface Alert {
  type: 'success' | 'warning' | 'danger' | 'info';
  icon: string;
  title: string;
  message: string;
  severity: 'high' | 'medium' | 'low';
}

export default function DetailedStockAnalysis() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Stock[]>([]);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [corporateData, setCorporateData] = useState<any>(null);
  const [loadingCorporate, setLoadingCorporate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(1095); // Default 3 years
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Calculate dynamic Y-axis domain based on price range with symmetric padding
  const getPriceDomain = (chartData: ChartDataPoint[]) => {
    if (!chartData || chartData.length === 0) return [0, 100];
    
    const allPrices: number[] = [];
    chartData.forEach(point => {
      if (point.high !== null && !isNaN(point.high)) allPrices.push(point.high);
      if (point.low !== null && !isNaN(point.low)) allPrices.push(point.low);
      if (point.close !== null && !isNaN(point.close)) allPrices.push(point.close);
      if (point.open !== null && !isNaN(point.open)) allPrices.push(point.open);
      
      // Include moving averages and Bollinger Bands
      if (point.ma20 !== null && !isNaN(point.ma20)) allPrices.push(point.ma20);
      if (point.ma50 !== null && !isNaN(point.ma50)) allPrices.push(point.ma50);
      if (point.ma200 !== null && !isNaN(point.ma200)) allPrices.push(point.ma200);
      if (point.bbUpper !== null && !isNaN(point.bbUpper)) allPrices.push(point.bbUpper);
      if (point.bbLower !== null && !isNaN(point.bbLower)) allPrices.push(point.bbLower);
    });
    
    if (allPrices.length === 0) return [0, 100];
    
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const priceRange = maxPrice - minPrice;
    
    // Round to nice numbers that stay close to the actual padded values
    const roundToNiceNumber = (value: number, roundUp: boolean = false) => {
      if (value <= 0) return 0;
      
      // Determine appropriate rounding step based on value magnitude
      let step;
      if (value >= 1000) {
        step = 100; // Round to nearest 100 for large values (₹1000+)
      } else if (value >= 500) {
        step = 50; // Round to nearest 50 for medium-large values
      } else if (value >= 100) {
        step = 10; // Round to nearest 10 for medium values
      } else if (value >= 10) {
        step = 5; // Round to nearest 5 for smaller values
      } else {
        step = 1; // Round to nearest 1 for very small values
      }
      
      if (roundUp) {
        return Math.ceil(value / step) * step;
      } else {
        return Math.floor(value / step) * step;
      }
    };
    
    // Calculate the data center first
    const dataCenter = (minPrice + maxPrice) / 2;
    
    // Start with symmetric padding (8% padding)
    const padding = priceRange * 0.08;
    const targetMin = minPrice - padding;
    const targetMax = maxPrice + padding;
    
    // Round conservatively - don't round too far from the target
    let roundedMin = roundToNiceNumber(targetMin, false);
    let roundedMax = roundToNiceNumber(targetMax, true);
    
    // Ensure minimum is not below 0
    if (roundedMin < 0) {
      roundedMin = 0;
    }
    
    // Check if rounding made the range too wide
    const roundedRange = roundedMax - roundedMin;
    const maxAllowedRange = priceRange * 1.20; // Max 20% more than actual range
    
    if (roundedRange > maxAllowedRange) {
      // Recalculate with tighter padding (5%)
      const tighterPadding = priceRange * 0.05;
      const tighterMin = minPrice - tighterPadding;
      const tighterMax = maxPrice + tighterPadding;
      roundedMin = roundToNiceNumber(tighterMin, false);
      roundedMax = roundToNiceNumber(tighterMax, true);
      if (roundedMin < 0) roundedMin = 0;
    }
    
    // Final symmetry check: ensure roughly equal space above and below data center
    const rangeAbove = roundedMax - dataCenter;
    const rangeBelow = dataCenter - roundedMin;
    const symmetryRatio = rangeAbove / (rangeBelow || 1);
    
    // If asymmetry is too large, adjust to be more symmetric
    if (symmetryRatio > 1.3) {
      // Too much space above, reduce max to match bottom padding
      const desiredMax = dataCenter + rangeBelow * 1.1; // Slight bias (10%) to avoid cutting data
      roundedMax = roundToNiceNumber(desiredMax, true);
    } else if (symmetryRatio < 0.77) {
      // Too much space below, increase min (but not below 0)
      const desiredMin = dataCenter - rangeAbove * 1.1;
      roundedMin = Math.max(0, roundToNiceNumber(desiredMin, false));
    }
    
    // Final validation: ensure we didn't create an unnecessarily wide range
    const finalRange = roundedMax - roundedMin;
    if (finalRange > priceRange * 1.25) {
      // If still too wide, use minimal padding
      const minimalPadding = priceRange * 0.03; // Just 3% padding
      roundedMin = roundToNiceNumber(minPrice - minimalPadding, false);
      roundedMax = roundToNiceNumber(maxPrice + minimalPadding, true);
      if (roundedMin < 0) roundedMin = 0;
    }
    
    return [roundedMin, roundedMax];
  };

  // Search stocks
  useEffect(() => {
    if (searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch('/api/stock-analysis-detail', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ searchTerm }),
        });

        const result = await response.json();
        if (result.success) {
          setSearchResults(result.stocks);
        }
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  // Fetch analysis data
  const fetchAnalysis = async (isin: string, periodDays: number = 1095) => { // Default 3 years
    setLoading(true);
    setError(null);

    try {
      console.log(`🔍 Fetching analysis for ISIN: ${isin}, days: ${periodDays}`);
      const response = await fetch(`/api/stock-analysis-detail?isin=${isin}&days=${periodDays}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ API Error (${response.status}):`, errorText);
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      console.log(`📊 Analysis API Response:`, {
        success: result.success,
        dataPoints: result.data?.summary?.dataPoints || 0,
        error: result.error
      });

      if (result.success) {
        setAnalysisData(result.data);
        setSelectedStock(result.data.stock);
        console.log(`✅ Analysis data loaded: ${result.data.summary?.dataPoints || 0} data points`);
        
        // Fetch corporate data
        if (result.data.stock.isin) {
          fetchCorporateData(result.data.stock.isin);
        }
      } else {
        const errorMsg = result.error || 'Failed to fetch analysis';
        console.error(`❌ Analysis failed:`, errorMsg);
        setError(errorMsg);
      }
    } catch (err: any) {
      console.error(`❌ Exception fetching analysis:`, err);
      setError(err.message || 'Failed to fetch analysis');
    } finally {
      setLoading(false);
    }
  };

  // Fetch corporate data
  const fetchCorporateData = async (isin: string) => {
    setLoadingCorporate(true);
    try {
      const response = await fetch(`/api/corporate-data?isin=${isin}`);
      const result = await response.json();
      if (result.success) {
        setCorporateData(result.data);
      }
    } catch (err: any) {
      console.error('Error fetching corporate data:', err);
    } finally {
      setLoadingCorporate(false);
    }
  };

  const handleStockSelect = (stock: Stock) => {
    setSelectedStock(stock);
    setSearchTerm('');
    setSearchResults([]);
    fetchAnalysis(stock.isin, days);
  };

  const handlePeriodChange = (newDays: number) => {
    setDays(newDays);
    if (selectedStock) {
      fetchAnalysis(selectedStock.isin, newDays);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Format volume in K, L, Cr format
  const formatVolume = (volume: number): string => {
    if (volume >= 10000000) {
      // Crores (Cr)
      return (volume / 10000000).toFixed(2) + ' Cr';
    } else if (volume >= 100000) {
      // Lakhs (L)
      return (volume / 100000).toFixed(2) + ' L';
    } else if (volume >= 1000) {
      // Thousands (K)
      return (volume / 1000).toFixed(2) + ' K';
    }
    return volume.toLocaleString('en-IN');
  };

  // Calculate average and median volume
  const calculateVolumeStats = (chartData: ChartDataPoint[]) => {
    const volumes = chartData
      .map(d => d.volume)
      .filter(v => v !== null && !isNaN(v) && v > 0);
    
    if (volumes.length === 0) {
      return { average: 0, median: 0 };
    }

    const average = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
    
    const sorted = [...volumes].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

    return { average, median };
  };

  // Custom tooltip for OHLC chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload;
      return (
        <div className="bg-white p-4 border-2 border-indigo-200 rounded-xl shadow-2xl min-w-[200px]">
          <p className="font-bold text-lg mb-3 text-gray-800 border-b pb-2">{formatDate(label)}</p>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 font-medium">Open:</span>
              <span className="font-bold text-blue-600">{data?.open ? formatCurrency(data.open) : 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 font-medium">High:</span>
              <span className="font-bold text-green-600">{data?.high ? formatCurrency(data.high) : 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 font-medium">Low:</span>
              <span className="font-bold text-red-600">{data?.low ? formatCurrency(data.low) : 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center border-t pt-2 mt-2">
              <span className="text-gray-600 font-medium">Close:</span>
              <span className="font-bold text-gray-800">{data?.close ? formatCurrency(data.close) : 'N/A'}</span>
            </div>
            {data?.volume && (
              <div className="flex justify-between items-center text-xs text-gray-500 pt-1">
                <span>Volume:</span>
                <span className="font-medium">{formatVolume(data.volume)}</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom candlestick shape component
  const CandlestickShape = (props: any) => {
    const { x, y, width, payload } = props;
    const { open, high, low, close } = payload;
    const isBullish = close >= open;
    const bodyTop = isBullish ? close : open;
    const bodyBottom = isBullish ? open : close;
    const bodyHeight = Math.abs(close - open);
    const scale = props.height / (props.yAxis.domain[1] - props.yAxis.domain[0]);
    
    // Calculate pixel positions
    const highY = y - (high - props.yAxis.domain[1]) * scale;
    const lowY = y - (low - props.yAxis.domain[1]) * scale;
    const bodyTopY = y - (bodyTop - props.yAxis.domain[1]) * scale;
    const bodyBottomY = y - (bodyBottom - props.yAxis.domain[1]) * scale;
    
    const bodyHeightPx = Math.abs(bodyTopY - bodyBottomY) || 1;
    const wickX = x + width / 2;
    
    return (
      <g>
        {/* Wick */}
        <line
          x1={wickX}
          y1={highY}
          x2={wickX}
          y2={lowY}
          stroke={isBullish ? '#10b981' : '#ef4444'}
          strokeWidth={1.5}
        />
        {/* Body */}
        <rect
          x={x}
          y={bodyTopY}
          width={width}
          height={bodyHeightPx}
          fill={isBullish ? '#10b981' : '#ef4444'}
          stroke={isBullish ? '#059669' : '#dc2626'}
          strokeWidth={1}
          opacity={0.8}
        />
      </g>
    );
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'success': return 'bg-green-50 border-green-200 text-green-800';
      case 'warning': return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'danger': return 'bg-red-50 border-red-200 text-red-800';
      case 'info': return 'bg-blue-50 border-blue-200 text-blue-800';
      default: return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  return (
    <div className="mb-8 bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 rounded-xl p-6 border-2 border-gray-200 shadow-lg">
      <div className="mb-6">
        <h3 className="text-2xl font-bold text-gray-800 mb-2 flex items-center gap-2">
          📊 Detailed Stock Analysis
        </h3>
        <p className="text-gray-600 text-sm">
          Comprehensive technical analysis with OHLC charts, MACD, RSI, and algorithm-based alerts
        </p>
      </div>

      {/* Stock Search */}
      <div className="bg-white rounded-lg p-4 mb-6 border border-gray-200 shadow-sm">
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search Stock (Name, Symbol, or ISIN)
          </label>
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Type to search from 2000+ stocks..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          
          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {searchResults.map((stock) => (
                <button
                  key={stock.isin}
                  onClick={() => handleStockSelect(stock)}
                  className="w-full text-left px-4 py-3 hover:bg-indigo-50 border-b border-gray-100 last:border-b-0"
                >
                  <div className="font-medium text-gray-900">{stock.stockName}</div>
                  <div className="text-sm text-gray-500">
                    {stock.symbol} • {stock.sector} • {stock.isin}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Analyzing stock data...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {analysisData && !loading && (
        <div className="space-y-6">
          {/* Stock Info Header */}
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-xl font-bold text-gray-800">{analysisData.stock.stockName}</h4>
                <p className="text-sm text-gray-600">{analysisData.stock.symbol} • {analysisData.stock.sector} • {analysisData.stock.isin}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-indigo-600">
                  {formatCurrency(analysisData.stock.currentPrice)}
                </div>
                <div className="text-sm text-gray-500">Current Price</div>
              </div>
            </div>

            {/* Period Selector */}
            <div className="flex gap-2">
              {[30, 90, 180, 365].map((period) => (
                <button
                  key={period}
                  onClick={() => handlePeriodChange(period)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    days === period
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {period === 30 ? '1M' : period === 90 ? '3M' : period === 180 ? '6M' : '1Y'}
                </button>
              ))}
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Volatility</div>
              <div className="text-2xl font-bold text-gray-800">
                {analysisData.metrics.volatility != null ? `${analysisData.metrics.volatility.toFixed(2)}%` : 'N/A'}
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Total Return</div>
              <div className={`text-2xl font-bold ${analysisData.metrics.totalReturn != null && analysisData.metrics.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {analysisData.metrics.totalReturn != null ? (
                  <>
                    {analysisData.metrics.totalReturn >= 0 ? '+' : ''}{analysisData.metrics.totalReturn.toFixed(2)}%
                  </>
                ) : 'N/A'}
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Trend Strength (R²)</div>
              <div className="text-2xl font-bold text-gray-800">
                {analysisData.metrics.trendlineR2 != null ? analysisData.metrics.trendlineR2.toFixed(3) : 'N/A'}
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">ATR</div>
              <div className="text-2xl font-bold text-gray-800">
                {analysisData.indicators.atr !== null ? formatCurrency(analysisData.indicators.atr) : 'N/A'}
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">ADX</div>
              <div className={`text-2xl font-bold ${
                analysisData.indicators.adx > 25 ? 'text-green-600' : 
                analysisData.indicators.adx > 20 ? 'text-yellow-600' : 'text-gray-600'
              }`}>
                {analysisData.indicators.adx !== null ? analysisData.indicators.adx.toFixed(1) : 'N/A'}
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Data Points</div>
              <div className="text-2xl font-bold text-gray-800">{analysisData.summary.dataPoints}</div>
            </div>
          </div>

          {/* Fibonacci Retracements */}
          {analysisData.fibonacci && (
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              <h4 className="text-lg font-semibold text-gray-800 mb-3">📐 Fibonacci Retracement Levels</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center p-2 bg-red-50 rounded">
                  <div className="text-xs text-gray-600">0% (High)</div>
                  <div className="font-bold text-red-600">{formatCurrency(analysisData.fibonacci.level0)}</div>
                </div>
                <div className="text-center p-2 bg-yellow-50 rounded">
                  <div className="text-xs text-gray-600">23.6%</div>
                  <div className="font-bold text-yellow-600">{formatCurrency(analysisData.fibonacci.level236)}</div>
                </div>
                <div className="text-center p-2 bg-orange-50 rounded">
                  <div className="text-xs text-gray-600">38.2%</div>
                  <div className="font-bold text-orange-600">{formatCurrency(analysisData.fibonacci.level382)}</div>
                </div>
                <div className="text-center p-2 bg-blue-50 rounded">
                  <div className="text-xs text-gray-600">50%</div>
                  <div className="font-bold text-blue-600">{formatCurrency(analysisData.fibonacci.level50)}</div>
                </div>
                <div className="text-center p-2 bg-indigo-50 rounded">
                  <div className="text-xs text-gray-600">61.8%</div>
                  <div className="font-bold text-indigo-600">{formatCurrency(analysisData.fibonacci.level618)}</div>
                </div>
                <div className="text-center p-2 bg-purple-50 rounded">
                  <div className="text-xs text-gray-600">78.6%</div>
                  <div className="font-bold text-purple-600">{formatCurrency(analysisData.fibonacci.level786)}</div>
                </div>
                <div className="text-center p-2 bg-green-50 rounded">
                  <div className="text-xs text-gray-600">100% (Low)</div>
                  <div className="font-bold text-green-600">{formatCurrency(analysisData.fibonacci.level100)}</div>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded">
                  <div className="text-xs text-gray-600">Current Price</div>
                  <div className="font-bold text-gray-800">{formatCurrency(analysisData.stock.currentPrice)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Support & Resistance Levels */}
          {analysisData.supportResistance && (
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              <h4 className="text-lg font-semibold text-gray-800 mb-3">🎯 Support & Resistance Levels</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-green-700 mb-2">Support Levels (Bottom → Top)</div>
                  <div className="space-y-1">
                    {analysisData.supportResistance.currentSupport
                      .sort((a: number, b: number) => a - b)
                      .map((level: number, idx: number) => (
                        <div key={idx} className="flex justify-between items-center p-2 bg-green-50 rounded">
                          <span className="text-sm text-gray-700">S{idx + 1}</span>
                          <span className="font-bold text-green-700">{formatCurrency(level)}</span>
                          <span className={`text-xs ${analysisData.stock.currentPrice > level ? 'text-green-600' : 'text-red-600'}`}>
                            {((analysisData.stock.currentPrice - level) / level * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-red-700 mb-2">Resistance Levels (Bottom → Top)</div>
                  <div className="space-y-1">
                    {analysisData.supportResistance.currentResistance
                      .sort((a: number, b: number) => a - b)
                      .map((level: number, idx: number) => (
                        <div key={idx} className="flex justify-between items-center p-2 bg-red-50 rounded">
                          <span className="text-sm text-gray-700">R{idx + 1}</span>
                          <span className="font-bold text-red-700">{formatCurrency(level)}</span>
                          <span className={`text-xs ${analysisData.stock.currentPrice < level ? 'text-green-600' : 'text-red-600'}`}>
                            {((level - analysisData.stock.currentPrice) / analysisData.stock.currentPrice * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Corporate Data Section */}
          {corporateData && (
            <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
              <h4 className="text-xl font-bold text-gray-800 mb-4">📊 Corporate Information</h4>
              
              {/* Announcements */}
              {corporateData.announcements && corporateData.announcements.length > 0 && (
                <div className="mb-6">
                  <h5 className="text-lg font-semibold text-gray-700 mb-3">📢 Announcements</h5>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold text-gray-700">Subject</th>
                          <th className="px-4 py-2 text-left font-semibold text-gray-700">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {corporateData.announcements.slice(0, 10).map((ann: any, idx: number) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-800">{ann.subject}</td>
                            <td className="px-4 py-2 text-gray-600">{formatDate(new Date(ann.date).toISOString())}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Corporate Actions */}
              {corporateData.corporateActions && corporateData.corporateActions.length > 0 && (
                <div className="mb-6">
                  <h5 className="text-lg font-semibold text-gray-700 mb-3">⚡ Corporate Actions</h5>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold text-gray-700">Subject</th>
                          <th className="px-4 py-2 text-left font-semibold text-gray-700">Date</th>
                          <th className="px-4 py-2 text-left font-semibold text-gray-700">Ex-Date</th>
                          <th className="px-4 py-2 text-left font-semibold text-gray-700">Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {corporateData.corporateActions.slice(0, 10).map((action: any, idx: number) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-800">{action.subject}</td>
                            <td className="px-4 py-2 text-gray-600">{formatDate(new Date(action.date).toISOString())}</td>
                            <td className="px-4 py-2 text-gray-600">{action.exDate ? formatDate(new Date(action.exDate).toISOString()) : 'N/A'}</td>
                            <td className="px-4 py-2">
                              {action.actionType && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                                  {action.actionType}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Board Meetings */}
              {corporateData.boardMeetings && corporateData.boardMeetings.length > 0 && (
                <div className="mb-6">
                  <h5 className="text-lg font-semibold text-gray-700 mb-3">🏢 Board Meetings</h5>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold text-gray-700">Subject</th>
                          <th className="px-4 py-2 text-left font-semibold text-gray-700">Date</th>
                          <th className="px-4 py-2 text-left font-semibold text-gray-700">Purpose</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {corporateData.boardMeetings.slice(0, 10).map((meeting: any, idx: number) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-800">{meeting.subject}</td>
                            <td className="px-4 py-2 text-gray-600">{formatDate(new Date(meeting.date).toISOString())}</td>
                            <td className="px-4 py-2 text-gray-600">{meeting.purpose || 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Financial Results */}
              {corporateData.financialResults && corporateData.financialResults.length > 0 && (
                <div className="mb-6">
                  <h5 className="text-lg font-semibold text-gray-700 mb-3">💰 Financial Results (Amount in Lakhs)</h5>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold text-gray-700">Quarter Ended</th>
                          <th className="px-4 py-2 text-right font-semibold text-gray-700">Total Income</th>
                          <th className="px-4 py-2 text-right font-semibold text-gray-700">Net Profit/Loss</th>
                          <th className="px-4 py-2 text-right font-semibold text-gray-700">EPS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {corporateData.financialResults.slice(0, 10).map((result: any, idx: number) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-800">{formatDate(new Date(result.quarterEnded).toISOString())}</td>
                            <td className="px-4 py-2 text-right text-gray-800">{result.totalIncome ? result.totalIncome.toLocaleString('en-IN') : 'N/A'}</td>
                            <td className={`px-4 py-2 text-right font-semibold ${result.netProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {result.netProfitLoss ? result.netProfitLoss.toLocaleString('en-IN') : 'N/A'}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-800">{result.earningsPerShare ? result.earningsPerShare.toFixed(2) : 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Shareholding Patterns */}
              {corporateData.shareholdingPatterns && corporateData.shareholdingPatterns.length > 0 && (
                <div className="mb-6">
                  <h5 className="text-lg font-semibold text-gray-700 mb-3">📈 Shareholding Patterns (in %)</h5>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold text-gray-700">Period Ended</th>
                          <th className="px-4 py-2 text-right font-semibold text-gray-700">Promoter & Promoter Group</th>
                          <th className="px-4 py-2 text-right font-semibold text-gray-700">Public</th>
                          <th className="px-4 py-2 text-right font-semibold text-gray-700">Employee Trusts</th>
                          <th className="px-4 py-2 text-right font-semibold text-gray-700">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {corporateData.shareholdingPatterns.slice(0, 10).map((pattern: any, idx: number) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-800">{formatDate(new Date(pattern.periodEnded).toISOString())}</td>
                            <td className="px-4 py-2 text-right text-gray-800">{pattern.promoterAndPromoterGroup ? pattern.promoterAndPromoterGroup.toFixed(2) + '%' : 'N/A'}</td>
                            <td className="px-4 py-2 text-right text-gray-800">{pattern.public ? pattern.public.toFixed(2) + '%' : 'N/A'}</td>
                            <td className="px-4 py-2 text-right text-gray-800">{pattern.sharesHeldByEmployeeTrusts ? pattern.sharesHeldByEmployeeTrusts.toFixed(2) + '%' : 'N/A'}</td>
                            <td className="px-4 py-2 text-right font-semibold text-gray-800">{pattern.total ? pattern.total.toFixed(2) + '%' : 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {loadingCorporate && (
                <div className="text-center py-4 text-gray-500">Loading corporate data...</div>
              )}

              {!loadingCorporate && (!corporateData.announcements || corporateData.announcements.length === 0) &&
               (!corporateData.corporateActions || corporateData.corporateActions.length === 0) &&
               (!corporateData.boardMeetings || corporateData.boardMeetings.length === 0) &&
               (!corporateData.financialResults || corporateData.financialResults.length === 0) &&
               (!corporateData.shareholdingPatterns || corporateData.shareholdingPatterns.length === 0) && (
                <div className="text-center py-4 text-gray-500">
                  No corporate data available for this stock.
                </div>
              )}
            </div>
          )}

          {/* Alerts */}
          {analysisData.alerts && analysisData.alerts.length > 0 && (
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              <h4 className="text-lg font-semibold text-gray-800 mb-3">🚨 Algorithm Flags & Alerts</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {analysisData.alerts.map((alert: Alert, idx: number) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border ${getAlertColor(alert.type)}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xl">{alert.icon}</span>
                      <div className="flex-1">
                        <div className="font-semibold mb-1">{alert.title}</div>
                        <div className="text-sm opacity-90">{alert.message}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* OHLC Chart with Trendlines */}
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl p-6 border-2 border-gray-200 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <span className="text-2xl">📈</span>
                OHLC Chart with Moving Averages & Trendline
              </h4>
              <div className="text-xs text-gray-500">
                Interactive Chart • Hover for Details
              </div>
            </div>
            <ResponsiveContainer width="100%" height={500}>
              <ComposedChart 
                data={analysisData.chartData}
                margin={{ top: 10, right: 30, left: 0, bottom: 10 }}
              >
                <defs>
                  <linearGradient id="bbGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fef3c7" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#fef3c7" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getDate()}/${date.getMonth() + 1}`;
                  }}
                  stroke="#9ca3af"
                  style={{ fontSize: '11px' }}
                />
                <YAxis 
                  yAxisId="price"
                  orientation="right"
                  domain={analysisData.chartData ? getPriceDomain(analysisData.chartData) : [0, 100]}
                  tick={{ fontSize: 12, fill: '#4b5563', fontWeight: 500 }}
                  tickFormatter={(value) => `₹${value.toFixed(0)}`}
                  stroke="#9ca3af"
                  width={70}
                  allowDataOverflow={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="line"
                  iconSize={12}
                  formatter={(value) => <span style={{ fontSize: '12px', color: '#4b5563' }}>{value}</span>}
                />
                
                {/* Bollinger Bands - Enhanced */}
                <Area
                  yAxisId="price"
                  type="monotone"
                  dataKey="bbUpper"
                  fill="url(#bbGradient)"
                  stroke="none"
                  name="BB Upper"
                />
                <Area
                  yAxisId="price"
                  type="monotone"
                  dataKey="bbLower"
                  fill="url(#bbGradient)"
                  stroke="none"
                  name="BB Lower"
                />
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="bbMiddle"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  name="BB Middle (20 MA)"
                  strokeOpacity={0.7}
                />
                
                {/* Moving Averages - Enhanced */}
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="ma200"
                  stroke="#8b5cf6"
                  strokeWidth={2.5}
                  dot={false}
                  name="MA 200"
                  strokeOpacity={0.8}
                />
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="ma50"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={false}
                  name="MA 50"
                  strokeOpacity={0.8}
                />
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="ma20"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  dot={false}
                  name="MA 20"
                  strokeOpacity={0.8}
                />
                
                {/* Trendline - Enhanced */}
                <Line
                  yAxisId="price"
                  type="linear"
                  dataKey="trendline"
                  stroke="#ef4444"
                  strokeWidth={3}
                  strokeDasharray="8 4"
                  dot={false}
                  name="Trendline (Linear Regression)"
                  strokeOpacity={0.9}
                />
                
                {/* Support/Resistance Lines - Enhanced */}
                {analysisData.chartData.map((point: ChartDataPoint, idx: number) => {
                  if (point.support !== null && idx % 5 === 0) {
                    return (
                      <ReferenceLine
                        key={`support-${idx}`}
                        yAxisId="price"
                        y={point.support}
                        stroke="#10b981"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        opacity={0.4}
                        label={{ value: 'S', position: 'right', fill: '#10b981', fontSize: 10 }}
                      />
                    );
                  }
                  return null;
                })}
                {analysisData.chartData.map((point: ChartDataPoint, idx: number) => {
                  if (point.resistance !== null && idx % 5 === 0) {
                    return (
                      <ReferenceLine
                        key={`resistance-${idx}`}
                        yAxisId="price"
                        y={point.resistance}
                        stroke="#ef4444"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        opacity={0.4}
                        label={{ value: 'R', position: 'right', fill: '#ef4444', fontSize: 10 }}
                      />
                    );
                  }
                  return null;
                })}
                
                {/* Fibonacci Levels - Enhanced */}
                {analysisData.fibonacci && (
                  <>
                    <ReferenceLine 
                      yAxisId="price" 
                      y={analysisData.fibonacci.level236} 
                      stroke="#fbbf24" 
                      strokeDasharray="3 3" 
                      strokeWidth={1.2} 
                      opacity={0.5}
                      label={{ value: '23.6%', position: 'right', fill: '#fbbf24', fontSize: 9 }}
                    />
                    <ReferenceLine 
                      yAxisId="price" 
                      y={analysisData.fibonacci.level382} 
                      stroke="#f97316" 
                      strokeDasharray="3 3" 
                      strokeWidth={1.2} 
                      opacity={0.5}
                      label={{ value: '38.2%', position: 'right', fill: '#f97316', fontSize: 9 }}
                    />
                    <ReferenceLine 
                      yAxisId="price" 
                      y={analysisData.fibonacci.level50} 
                      stroke="#3b82f6" 
                      strokeDasharray="3 3" 
                      strokeWidth={1.5} 
                      opacity={0.6}
                      label={{ value: '50%', position: 'right', fill: '#3b82f6', fontSize: 9, fontWeight: 'bold' }}
                    />
                    <ReferenceLine 
                      yAxisId="price" 
                      y={analysisData.fibonacci.level618} 
                      stroke="#6366f1" 
                      strokeDasharray="3 3" 
                      strokeWidth={1.2} 
                      opacity={0.5}
                      label={{ value: '61.8%', position: 'right', fill: '#6366f1', fontSize: 9 }}
                    />
                    <ReferenceLine 
                      yAxisId="price" 
                      y={analysisData.fibonacci.level786} 
                      stroke="#a855f7" 
                      strokeDasharray="3 3" 
                      strokeWidth={1.2} 
                      opacity={0.5}
                      label={{ value: '78.6%', position: 'right', fill: '#a855f7', fontSize: 9 }}
                    />
                  </>
                )}
                
                {/* OHLC - Enhanced Close Line as Primary */}
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="close"
                  stroke="#1f2937"
                  strokeWidth={3}
                  dot={false}
                  name="Close Price"
                  strokeOpacity={0.9}
                  activeDot={{ r: 6, fill: '#1f2937', stroke: '#fff', strokeWidth: 2 }}
                />
                
                {/* High/Low Range Area */}
                <Area
                  yAxisId="price"
                  type="monotone"
                  dataKey="high"
                  stroke="none"
                  fill="none"
                  name=""
                />
                <Area
                  yAxisId="price"
                  type="monotone"
                  dataKey="low"
                  stroke="none"
                  fill="none"
                  name=""
                />
                
                {/* High/Low Lines - Subtle */}
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="high"
                  stroke="#059669"
                  strokeWidth={1.5}
                  dot={false}
                  name="High"
                  strokeOpacity={0.4}
                />
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="low"
                  stroke="#dc2626"
                  strokeWidth={1.5}
                  dot={false}
                  name="Low"
                  strokeOpacity={0.4}
                />
              </ComposedChart>
            </ResponsiveContainer>
            
            {/* Chart Legend Info */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-800"></div>
                  <span>Close Price (Primary)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5 bg-blue-500"></div>
                  <span>MA 20 (Short-term)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5 bg-green-500"></div>
                  <span>MA 50 (Medium-term)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5 bg-purple-500"></div>
                  <span>MA 200 (Long-term)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5 border-dashed border-red-500 border"></div>
                  <span>Trendline</span>
                </div>
              </div>
            </div>
          </div>

          {/* Volume Chart */}
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">📊 Volume</h4>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={(() => {
                const stats = calculateVolumeStats(analysisData.chartData);
                return analysisData.chartData.map((d: ChartDataPoint) => ({
                  ...d,
                  avgVolume: stats.average,
                  medianVolume: stats.median
                }));
              })()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getDate()}/${date.getMonth() + 1}`;
                  }}
                  stroke="#9ca3af"
                />
                <YAxis 
                  tick={{ fontSize: 11, fill: '#4b5563' }}
                  tickFormatter={(value: number) => formatVolume(value)}
                  stroke="#9ca3af"
                />
                <Tooltip 
                  formatter={(value: number, name: string) => {
                    if (name === 'Volume' || name.includes('Volume')) {
                      return formatVolume(value);
                    }
                    return value;
                  }}
                  labelFormatter={(label) => formatDate(label)}
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '2px solid #e5e7eb', 
                    borderRadius: '8px',
                    padding: '8px'
                  }}
                />
                <Legend />
                <Bar 
                  dataKey="volume" 
                  fill="#6366f1" 
                  name="Volume"
                  opacity={0.8}
                />
                <Line
                  type="monotone"
                  dataKey="avgVolume"
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name={`Avg Volume (${formatVolume(calculateVolumeStats(analysisData.chartData).average)})`}
                  strokeOpacity={0.8}
                />
                <Line
                  type="monotone"
                  dataKey="medianVolume"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  dot={false}
                  name={`Median Volume (${formatVolume(calculateVolumeStats(analysisData.chartData).median)})`}
                  strokeOpacity={0.8}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* MACD Chart */}
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">📉 MACD (Moving Average Convergence Divergence)</h4>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={analysisData.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getDate()}/${date.getMonth() + 1}`;
                  }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(value: number) => value !== null ? value.toFixed(2) : 'N/A'}
                  labelFormatter={(label) => formatDate(label)}
                />
                <Legend />
                <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
                <Bar dataKey="macdHistogram" fill="#f59e0b" name="Histogram" />
                <Line
                  type="monotone"
                  dataKey="macd"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="MACD"
                />
                <Line
                  type="monotone"
                  dataKey="macdSignal"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  name="Signal"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* RSI Chart */}
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">📊 RSI (Relative Strength Index)</h4>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analysisData.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getDate()}/${date.getMonth() + 1}`;
                  }}
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(value: number) => value !== null ? value.toFixed(2) : 'N/A'}
                  labelFormatter={(label) => formatDate(label)}
                />
                <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" label="Overbought" />
                <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" label="Oversold" />
                <Line
                  type="monotone"
                  dataKey="rsi"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                  name="RSI (14)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Stochastic Oscillator Chart */}
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">📈 Stochastic Oscillator</h4>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analysisData.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getDate()}/${date.getMonth() + 1}`;
                  }}
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(value: number) => value !== null ? value.toFixed(2) : 'N/A'}
                  labelFormatter={(label) => formatDate(label)}
                />
                <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="3 3" label="Overbought" />
                <ReferenceLine y={20} stroke="#10b981" strokeDasharray="3 3" label="Oversold" />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="stochasticK"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="%K (14)"
                />
                <Line
                  type="monotone"
                  dataKey="stochasticD"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  name="%D (3)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ADX Chart */}
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">💪 ADX (Average Directional Index) & DI</h4>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={analysisData.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getDate()}/${date.getMonth() + 1}`;
                  }}
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} yAxisId="left" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} yAxisId="right" orientation="right" />
                <Tooltip 
                  formatter={(value: number) => value !== null ? value.toFixed(2) : 'N/A'}
                  labelFormatter={(label) => formatDate(label)}
                />
                <ReferenceLine y={25} yAxisId="left" stroke="#10b981" strokeDasharray="3 3" label="Strong Trend" />
                <ReferenceLine y={20} yAxisId="left" stroke="#f59e0b" strokeDasharray="3 3" label="Weak Trend" />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="adx"
                  stroke="#8b5cf6"
                  strokeWidth={3}
                  dot={false}
                  name="ADX (14)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="plusDI"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  name="+DI"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="minusDI"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  name="-DI"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Current Indicators Summary */}
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">📋 Current Indicator Values</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <div>
                <div className="text-sm text-gray-600 mb-1">RSI (14)</div>
                <div className={`text-xl font-bold ${
                  analysisData.indicators.rsi > 70 ? 'text-red-600' :
                  analysisData.indicators.rsi < 30 ? 'text-green-600' :
                  'text-gray-800'
                }`}>
                  {analysisData.indicators.rsi !== null ? analysisData.indicators.rsi.toFixed(2) : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">MACD</div>
                <div className="text-xl font-bold text-gray-800">
                  {analysisData.indicators.macd !== null ? analysisData.indicators.macd.toFixed(2) : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Signal</div>
                <div className="text-xl font-bold text-gray-800">
                  {analysisData.indicators.macdSignal !== null ? analysisData.indicators.macdSignal.toFixed(2) : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Stochastic %K</div>
                <div className={`text-xl font-bold ${
                  analysisData.indicators.stochasticK > 80 ? 'text-red-600' :
                  analysisData.indicators.stochasticK < 20 ? 'text-green-600' :
                  'text-gray-800'
                }`}>
                  {analysisData.indicators.stochasticK !== null ? analysisData.indicators.stochasticK.toFixed(2) : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Stochastic %D</div>
                <div className={`text-xl font-bold ${
                  analysisData.indicators.stochasticD > 80 ? 'text-red-600' :
                  analysisData.indicators.stochasticD < 20 ? 'text-green-600' :
                  'text-gray-800'
                }`}>
                  {analysisData.indicators.stochasticD !== null ? analysisData.indicators.stochasticD.toFixed(2) : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">ADX</div>
                <div className={`text-xl font-bold ${
                  analysisData.indicators.adx > 25 ? 'text-green-600' : 
                  analysisData.indicators.adx > 20 ? 'text-yellow-600' : 
                  'text-gray-600'
                }`}>
                  {analysisData.indicators.adx !== null ? analysisData.indicators.adx.toFixed(2) : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">+DI</div>
                <div className="text-xl font-bold text-green-600">
                  {analysisData.indicators.plusDI !== null ? analysisData.indicators.plusDI.toFixed(2) : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">-DI</div>
                <div className="text-xl font-bold text-red-600">
                  {analysisData.indicators.minusDI !== null ? analysisData.indicators.minusDI.toFixed(2) : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">MA 20</div>
                <div className="text-xl font-bold text-gray-800">
                  {analysisData.indicators.ma20 !== null ? formatCurrency(analysisData.indicators.ma20) : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">MA 50</div>
                <div className="text-xl font-bold text-gray-800">
                  {analysisData.indicators.ma50 !== null ? formatCurrency(analysisData.indicators.ma50) : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">MA 200</div>
                <div className="text-xl font-bold text-gray-800">
                  {analysisData.indicators.ma200 !== null ? formatCurrency(analysisData.indicators.ma200) : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Price vs MA20</div>
                <div className={`text-xl font-bold ${
                  analysisData.stock.currentPrice > (analysisData.indicators.ma20 || 0) ? 'text-green-600' : 'text-red-600'
                }`}>
                  {analysisData.indicators.ma20 !== null 
                    ? `${((analysisData.stock.currentPrice - analysisData.indicators.ma20) / analysisData.indicators.ma20 * 100).toFixed(2)}%`
                    : 'N/A'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!analysisData && !loading && !error && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <div className="text-6xl mb-4">🔍</div>
          <h4 className="text-lg font-semibold text-gray-800 mb-2">Search for a Stock</h4>
          <p className="text-gray-600">Type in the search box above to find and analyze any stock from 2000+ available stocks</p>
        </div>
      )}
    </div>
  );
}

