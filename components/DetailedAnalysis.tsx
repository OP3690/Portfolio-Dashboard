'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { format, subYears, subDays, subWeeks, parseISO } from 'date-fns';

interface Holding {
  stockName: string;
  isin?: string;
  marketValue?: number;
  investmentAmount?: number;
  profitLossTillDatePercent?: number;
  profitLossTillDate?: number;
  holdingPeriodYears?: number;
  holdingPeriodMonths?: number;
  asOnDate?: Date | string;
}

interface OHLCData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  pe?: number;
}

interface DetailedAnalysisProps {
  holdings: Holding[];
}

interface StockAnalytics {
  totalReturn: number;
  totalReturnPercent: number;
  annualizedReturn: number;
  volatility: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  avgVolume: number;
  volumeSpikes: Array<{ date: string; volume: number; spikeRatio: number }>;
  priceHighs: Array<{ date: string; price: number }>;
  priceLows: Array<{ date: string; price: number }>;
  monthlyReturns: Array<{ month: string; return: number; returnPercent: number }>;
}

type PeriodType = '1W' | '15D' | '30D' | '60D' | '90D' | '1Y' | '2Y' | '3Y';

export default function DetailedAnalysis({ holdings }: DetailedAnalysisProps) {
  const [selectedStock, setSelectedStock] = useState<Holding | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('1Y');
  const [ohlcData, setOhlcData] = useState<OHLCData[]>([]);
  const [fullOhlcData, setFullOhlcData] = useState<OHLCData[]>([]); // For monthly returns (always 3 years)
  const [analytics, setAnalytics] = useState<StockAnalytics | null>(null);
  const [loading, setLoading] = useState(false);

  // Get unique stocks for dropdown
  const availableStocks = useMemo(() => {
    return holdings.filter((h, index, self) => 
      index === self.findIndex((t) => t.isin === h.isin || t.stockName === h.stockName)
    );
  }, [holdings]);

  // Set first stock as default
  useEffect(() => {
    if (availableStocks.length > 0 && !selectedStock) {
      setSelectedStock(availableStocks[0]);
    }
  }, [availableStocks, selectedStock]);

  // Get date range based on selected period
  const getDateRange = (period: PeriodType): { fromDate: Date; toDate: Date } => {
    const toDate = new Date();
    let fromDate: Date;
    
    switch (period) {
      case '1W':
        fromDate = subWeeks(toDate, 1);
        break;
      case '15D':
        fromDate = subDays(toDate, 15);
        break;
      case '30D':
        fromDate = subDays(toDate, 30);
        break;
      case '60D':
        fromDate = subDays(toDate, 60);
        break;
      case '90D':
        fromDate = subDays(toDate, 90);
        break;
      case '1Y':
        fromDate = subYears(toDate, 1);
        break;
      case '2Y':
        fromDate = subYears(toDate, 2);
        break;
      case '3Y':
        fromDate = subYears(toDate, 3);
        break;
      default:
        fromDate = subYears(toDate, 1);
    }
    
    return { fromDate, toDate };
  };

  // Fetch full OHLC data (3 years) for monthly returns when stock changes
  useEffect(() => {
    if (selectedStock) {
      fetchFullOHLCData();
    }
  }, [selectedStock]);

  // Fetch filtered OHLC data when stock or period changes
  useEffect(() => {
    if (selectedStock) {
      fetchOHLCData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStock, selectedPeriod]);

  // Fetch full 3 years of data for monthly returns calculation
  const fetchFullOHLCData = async () => {
    if (!selectedStock) return;

    try {
      const isin = selectedStock.isin;
      if (!isin) {
        console.error('No ISIN found for selected stock');
        return;
      }

      // Always fetch 3 years of data for monthly returns
      const toDate = new Date();
      const fromDate = subYears(toDate, 3);

      const response = await fetch(
        `/api/stock-ohlc?isin=${encodeURIComponent(isin)}&fromDate=${format(fromDate, 'yyyy-MM-dd')}&toDate=${format(toDate, 'yyyy-MM-dd')}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch full OHLC data');
      }

      const data = await response.json();
      setFullOhlcData(data.ohlcData || []);
    } catch (error) {
      console.error('Error fetching full OHLC data:', error);
    }
  };

  const fetchOHLCData = async () => {
    if (!selectedStock) return;

    setLoading(true);
    try {
      const isin = selectedStock.isin;
      if (!isin) {
        console.error('No ISIN found for selected stock');
        return;
      }

      // Calculate date range based on selected period
      const { fromDate, toDate } = getDateRange(selectedPeriod);

      const response = await fetch(
        `/api/stock-ohlc?isin=${encodeURIComponent(isin)}&fromDate=${format(fromDate, 'yyyy-MM-dd')}&toDate=${format(toDate, 'yyyy-MM-dd')}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch OHLC data');
      }

      const data = await response.json();
      setOhlcData(data.ohlcData || []);
      calculateAnalytics(data.ohlcData || []);
    } catch (error) {
      console.error('Error fetching OHLC data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateAnalytics = (data: OHLCData[]) => {
    if (data.length === 0) {
      setAnalytics(null);
      return;
    }

    // Get holding data for selected stock to calculate actual investment returns
    const holding = holdings.find(h => 
      (h.isin && selectedStock?.isin && h.isin === selectedStock.isin) ||
      (h.stockName && selectedStock?.stockName && h.stockName === selectedStock.stockName)
    );

    // Sort by date
    const sortedData = [...data].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Use actual investment data if available, otherwise use price movements
    let totalReturn = 0;
    let totalReturnPercent = 0;
    let annualizedReturn = 0;

    if (holding && holding.investmentAmount && holding.investmentAmount > 0) {
      // Calculate from actual investment
      const currentValue = holding.marketValue || 0;
      totalReturn = currentValue - holding.investmentAmount;
      totalReturnPercent = (totalReturn / holding.investmentAmount) * 100;

      // Calculate annualized return based on holding period
      let holdingYears = 0;
      if (holding.holdingPeriodYears !== undefined && holding.holdingPeriodMonths !== undefined) {
        holdingYears = (holding.holdingPeriodYears || 0) + (holding.holdingPeriodMonths || 0) / 12;
      } else if (holding.asOnDate) {
        // Calculate from asOnDate if available
        const startDate = new Date(holding.asOnDate);
        const endDate = new Date();
        holdingYears = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
      } else if (sortedData.length > 0) {
        // Estimate from data range if holding period not available
        const firstDate = new Date(sortedData[0].date);
        const lastDate = new Date();
        holdingYears = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
      }
      
      // Ensure minimum holding period of at least 1 day to avoid division by zero
      holdingYears = Math.max(holdingYears, 1 / 365); // At least 1 day
      
      if (holdingYears > 0 && holding.investmentAmount > 0) {
        const ratio = currentValue / holding.investmentAmount;
        if (ratio > 0) {
          annualizedReturn = (Math.pow(ratio, 1 / holdingYears) - 1) * 100;
        }
      } else if (holding.profitLossTillDatePercent !== undefined && holdingYears > 0) {
        // Fallback: if we have profitLossTillDatePercent, use it to calculate annualized return
        const totalReturnFactor = 1 + (holding.profitLossTillDatePercent / 100);
        annualizedReturn = (Math.pow(totalReturnFactor, 1 / holdingYears) - 1) * 100;
      }
    } else {
      // Fallback to price-based calculation
      const firstPrice = sortedData[0].close;
      const lastPrice = sortedData[sortedData.length - 1].close;
      totalReturn = lastPrice - firstPrice;
      totalReturnPercent = firstPrice > 0 ? (totalReturn / firstPrice) * 100 : 0;

      // Calculate annualized return based on period
      const years = (new Date(sortedData[sortedData.length - 1].date).getTime() - 
                     new Date(sortedData[0].date).getTime()) / (1000 * 60 * 60 * 24 * 365);
      annualizedReturn = years > 0 ? (Math.pow(lastPrice / firstPrice, 1 / years) - 1) * 100 : 0;
    }

    // Get first price for max drawdown calculation (outside if/else block for scope)
    const firstPrice = sortedData.length > 0 ? sortedData[0].close : 0;

    // Calculate volatility (standard deviation of daily returns)
    const returns = sortedData.slice(1).map((d, i) => 
      sortedData[i].close > 0 ? ((d.close - sortedData[i].close) / sortedData[i].close) * 100 : 0
    );
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized volatility

    // Calculate max drawdown
    let maxPrice = firstPrice;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    sortedData.forEach((d) => {
      if (d.close > maxPrice) maxPrice = d.close;
      const drawdown = maxPrice - d.close;
      const drawdownPercent = maxPrice > 0 ? (drawdown / maxPrice) * 100 : 0;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = drawdownPercent;
      }
    });

    // Calculate average volume
    const avgVolume = sortedData.reduce((sum, d) => sum + d.volume, 0) / sortedData.length;

    // Find volume spikes (volume > 2x average)
    const volumeSpikes = sortedData
      .filter((d) => d.volume > avgVolume * 2)
      .map((d) => ({
        date: d.date,
        volume: d.volume,
        spikeRatio: avgVolume > 0 ? d.volume / avgVolume : 0,
      }))
      .sort((a, b) => b.spikeRatio - a.spikeRatio)
      .slice(0, 10); // Top 10 spikes

    // Find price highs and lows
    const sortedByHigh = [...sortedData].sort((a, b) => b.high - a.high);
    const sortedByLow = [...sortedData].sort((a, b) => a.low - b.low);
    const priceHighs = sortedByHigh.slice(0, 5).map((d) => ({ date: d.date, price: d.high }));
    const priceLows = sortedByLow.slice(0, 5).map((d) => ({ date: d.date, price: d.low }));

    // Monthly returns will be calculated separately from fullOhlcData (always 3 years)
    setAnalytics({
      totalReturn,
      totalReturnPercent,
      annualizedReturn,
      volatility,
      maxDrawdown,
      maxDrawdownPercent,
      avgVolume,
      volumeSpikes,
      priceHighs,
      priceLows,
      monthlyReturns: [], // Will be calculated separately
    });
  };

  // Format volume in Lakh or Crore
  const formatVolume = (volume: number): string => {
    const lakh = volume / 100000;
    if (lakh >= 100) {
      const crore = lakh / 100;
      return `${crore.toFixed(2)}Cr`;
    }
    return `${lakh.toFixed(1)}L`;
  };

  // Prepare chart data with moving averages and trends
  const chartData = useMemo(() => {
    const sortedData = [...ohlcData].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Calculate moving averages
    const ma50: number[] = [];
    const ma200: number[] = [];
    const volumeSpikeDates = analytics?.volumeSpikes.map(spike => spike.date) || [];
    const priceHighDates = analytics?.priceHighs.map(high => high.date) || [];
    const priceLowDates = analytics?.priceLows.map(low => low.date) || [];

    sortedData.forEach((d, index) => {
      // 50-day MA
      if (index >= 49) {
        const ma50Sum = sortedData.slice(index - 49, index + 1).reduce((sum, item) => sum + item.close, 0);
        ma50.push(ma50Sum / 50);
      } else {
        ma50.push(NaN);
      }

      // 200-day MA
      if (index >= 199) {
        const ma200Sum = sortedData.slice(index - 199, index + 1).reduce((sum, item) => sum + item.close, 0);
        ma200.push(ma200Sum / 200);
      } else {
        ma200.push(NaN);
      }
    });

    return sortedData.map((d, index) => {
      const isVolumeSpike = volumeSpikeDates.includes(d.date);
      const isPriceHigh = priceHighDates.includes(d.date);
      const isPriceLow = priceLowDates.includes(d.date);
      
      return {
        date: format(parseISO(d.date), 'MMM-yy'),
        fullDate: d.date,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume,
        volumeFormatted: formatVolume(d.volume),
        change: d.close - d.open,
        changePercent: d.open > 0 ? ((d.close - d.open) / d.open) * 100 : 0,
        range: d.high - d.low,
        bodyRange: Math.abs(d.close - d.open),
        ma50: ma50[index] || null,
        ma200: ma200[index] || null,
        isVolumeSpike,
        isPriceHigh,
        isPriceLow,
      };
    });
  }, [ohlcData, analytics]);

  // Calculate monthly returns from full data (always 3 years, independent of period filter)
  const monthlyReturns = useMemo(() => {
    if (fullOhlcData.length === 0) return [];

    const sortedFullData = [...fullOhlcData].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const returns: Array<{ month: string; return: number; returnPercent: number }> = [];
    const monthMap = new Map<string, number[]>();
    
    sortedFullData.forEach((d) => {
      const monthKey = format(parseISO(d.date), 'MMM-yy');
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, []);
      }
      monthMap.get(monthKey)!.push(d.close);
    });

    monthMap.forEach((prices, month) => {
      if (prices.length > 1) {
        const monthReturn = prices[prices.length - 1] - prices[0];
        const monthReturnPercent = prices[0] > 0 ? (monthReturn / prices[0]) * 100 : 0;
        returns.push({
          month,
          return: monthReturn,
          returnPercent: monthReturnPercent,
        });
      }
    });

    return returns;
  }, [fullOhlcData]);

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Detailed Stock Analysis</h3>

      {/* Stock Selection Dropdown */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Stock:
        </label>
        <select
          value={selectedStock?.isin || ''}
          onChange={(e) => {
            const stock = availableStocks.find((s) => s.isin === e.target.value);
            setSelectedStock(stock || null);
          }}
          className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {availableStocks.map((stock) => (
            <option key={stock.isin || stock.stockName} value={stock.isin || stock.stockName}>
              {stock.stockName}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading OHLC data...</div>
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">No OHLC data available for selected stock</div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Analytics Summary Cards */}
          {analytics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="text-sm text-gray-600 mb-1">Total Return</div>
                <div className={`text-xl font-bold ${analytics.totalReturnPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {analytics.totalReturnPercent >= 0 ? '+' : ''}{analytics.totalReturnPercent.toFixed(2)}%
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  ₹{analytics.totalReturn.toFixed(2)}
                </div>
              </div>
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="text-sm text-gray-600 mb-1">Annualized Return</div>
                <div className={`text-xl font-bold ${analytics.annualizedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {analytics.annualizedReturn >= 0 ? '+' : ''}{analytics.annualizedReturn.toFixed(2)}%
                </div>
                <div className="text-xs text-gray-500 mt-1">CAGR (Holding Period)</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <div className="text-sm text-gray-600 mb-1">Volatility</div>
                <div className="text-xl font-bold text-gray-800">
                  {analytics.volatility.toFixed(2)}%
                </div>
                <div className="text-xs text-gray-500 mt-1">Annualized ({selectedPeriod})</div>
              </div>
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <div className="text-sm text-gray-600 mb-1">Max Drawdown</div>
                <div className="text-xl font-bold text-red-600">
                  -{analytics.maxDrawdownPercent.toFixed(2)}%
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  ₹{analytics.maxDrawdown.toFixed(2)}
                </div>
              </div>
            </div>
          )}

          {/* OHLC Chart */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gradient-to-br from-gray-50 to-white shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-4">
              <div>
                <h4 className="text-lg font-bold text-gray-800 mb-1">
                  Price Chart - {selectedStock?.stockName}
                </h4>
                <p className="text-xs text-gray-500">Period: {selectedPeriod}</p>
              </div>
              
              {/* Period Filter Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-gray-600">Period:</span>
                {(['1W', '15D', '30D', '60D', '90D', '1Y', '2Y', '3Y'] as PeriodType[]).map((period) => (
                  <button
                    key={period}
                    onClick={() => setSelectedPeriod(period)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                      selectedPeriod === period
                        ? 'bg-blue-600 text-white shadow-md transform scale-105'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:shadow-sm'
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
              
              {/* Legend for markers */}
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-yellow-400 border-2 border-white shadow-sm"></div>
                  <span className="text-gray-600 font-medium">Volume Spike</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow-sm"></div>
                  <span className="text-gray-600 font-medium">Price High</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-sm"></div>
                  <span className="text-gray-600 font-medium">Price Low</span>
                </div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={550}>
              <ComposedChart 
                data={chartData}
                margin={{ top: 10, right: 20, bottom: 60, left: 10 }}
              >
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke="#e5e7eb" 
                  strokeOpacity={0.5}
                  vertical={false}
                />
                <XAxis 
                  dataKey="date" 
                  stroke="#6b7280"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={{ stroke: '#9ca3af' }}
                  axisLine={{ stroke: '#d1d5db' }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  yAxisId="price"
                  stroke="#6b7280"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={{ stroke: '#9ca3af' }}
                  axisLine={{ stroke: '#d1d5db' }}
                  label={{ 
                    value: 'Price (₹)', 
                    angle: -90, 
                    position: 'insideLeft',
                    style: { textAnchor: 'middle', fill: '#374151', fontSize: 12, fontWeight: 600 }
                  }}
                  domain={['auto', 'auto']}
                />
                <YAxis 
                  yAxisId="volume"
                  orientation="right"
                  stroke="#9ca3af"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={{ stroke: '#9ca3af' }}
                  axisLine={{ stroke: '#d1d5db' }}
                  tickFormatter={(value) => formatVolume(value)}
                  label={{ 
                    value: 'Volume (L/Cr)', 
                    angle: 90, 
                    position: 'insideRight',
                    style: { textAnchor: 'middle', fill: '#6b7280', fontSize: 12, fontWeight: 600 }
                  }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      
                      // Find detailed information for volume spikes and price extremes
                      const spikeInfo = analytics?.volumeSpikes.find(s => s.date === data.fullDate);
                      const highInfo = analytics?.priceHighs.find(h => h.date === data.fullDate);
                      const lowInfo = analytics?.priceLows.find(l => l.date === data.fullDate);
                      
                      return (
                        <div className="bg-gray-900 text-white p-3 rounded-lg shadow-lg text-sm max-w-xs">
                          <div className="font-semibold mb-2 border-b border-gray-700 pb-2">
                            {format(parseISO(data.fullDate), 'MMM dd, yyyy')}
                          </div>
                          <div className="space-y-2">
                            {/* OHLC Data */}
                            <div className="space-y-1">
                              <div className="font-medium text-gray-300 mb-1">Price Data:</div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <div>Open: <span className="font-semibold">₹{data.open.toFixed(2)}</span></div>
                                <div>High: <span className="font-semibold text-green-400">₹{data.high.toFixed(2)}</span></div>
                                <div>Low: <span className="font-semibold text-red-400">₹{data.low.toFixed(2)}</span></div>
                                <div>Close: <span className="font-semibold">₹{data.close.toFixed(2)}</span></div>
                              </div>
                              <div className={`pt-1 border-t border-gray-700 mt-1 ${data.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                Change: {data.change >= 0 ? '+' : ''}{data.changePercent.toFixed(2)}%
                              </div>
                            </div>
                            
                            {/* Volume Information */}
                            <div className="border-t border-gray-700 pt-2">
                              <div className="flex items-center justify-between">
                                <span className="text-gray-300">Volume:</span>
                                <span className="font-semibold">{data.volumeFormatted || formatVolume(data.volume)}</span>
                              </div>
                              {spikeInfo && (
                                <div className="mt-2 p-2 bg-yellow-900/30 rounded border border-yellow-400/50">
                                  <div className="flex items-center gap-2 text-yellow-400 font-semibold mb-1">
                                    <span>⚠️</span>
                                    <span>Volume Spike</span>
                                  </div>
                                  <div className="text-xs space-y-1 text-yellow-300">
                                    <div>Volume: <span className="font-bold">{formatVolume(spikeInfo.volume)}</span></div>
                                    <div>{spikeInfo.spikeRatio.toFixed(1)}x average volume</div>
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            {/* Moving Averages */}
                            {(data.ma50 || data.ma200) && (
                              <div className="border-t border-gray-700 pt-2 space-y-1">
                                <div className="text-gray-300 text-xs">Moving Averages:</div>
                                {data.ma50 && <div className="text-xs">MA 50: <span className="font-semibold">₹{data.ma50.toFixed(2)}</span></div>}
                                {data.ma200 && <div className="text-xs">MA 200: <span className="font-semibold">₹{data.ma200.toFixed(2)}</span></div>}
                              </div>
                            )}
                            
                            {/* Price High Information */}
                            {highInfo && (
                              <div className="border-t border-gray-700 pt-2 p-2 bg-green-900/30 rounded border border-green-400/50">
                                <div className="flex items-center gap-2 text-green-400 font-semibold mb-1">
                                  <span>📈</span>
                                  <span>Price High</span>
                                </div>
                                <div className="text-xs text-green-300">
                                  High Price: <span className="font-bold">₹{highInfo.price.toFixed(2)}</span>
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                  One of the top 5 highs in the period
                                </div>
                              </div>
                            )}
                            
                            {/* Price Low Information */}
                            {lowInfo && (
                              <div className="border-t border-gray-700 pt-2 p-2 bg-red-900/30 rounded border border-red-400/50">
                                <div className="flex items-center gap-2 text-red-400 font-semibold mb-1">
                                  <span>📉</span>
                                  <span>Price Low</span>
                                </div>
                                <div className="text-xs text-red-300">
                                  Low Price: <span className="font-bold">₹{lowInfo.price.toFixed(2)}</span>
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                  One of the top 5 lows in the period
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                {/* Price line with custom dots for events */}
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="close"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  activeDot={{ r: 5, stroke: '#1e40af', strokeWidth: 2 }}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (!payload) return null;
                    
                    const spikeInfo = analytics?.volumeSpikes.find(s => s.date === payload.fullDate);
                    const highInfo = analytics?.priceHighs.find(h => h.date === payload.fullDate);
                    const lowInfo = analytics?.priceLows.find(l => l.date === payload.fullDate);
                    
                    // Volume spike marker (yellow) with label
                    if (payload.isVolumeSpike && spikeInfo) {
                      return (
                        <g key={`vol-marker-${cx}`}>
                          <circle
                            cx={cx}
                            cy={cy}
                            r={8}
                            fill="#fbbf24"
                            stroke="#ffffff"
                            strokeWidth={2}
                          />
                          <text
                            x={cx}
                            y={cy - 15}
                            fill="#fbbf24"
                            fontSize={10}
                            fontWeight="bold"
                            textAnchor="middle"
                            className="pointer-events-none"
                          >
                            Vol
                          </text>
                          <text
                            x={cx}
                            y={cy - 25}
                            fill="#fbbf24"
                            fontSize={9}
                            textAnchor="middle"
                            className="pointer-events-none"
                          >
                            {formatVolume(spikeInfo.volume)}
                          </text>
                        </g>
                      );
                    }
                    // Price high marker (green) with label
                    if (payload.isPriceHigh && highInfo) {
                      return (
                        <g key={`high-marker-${cx}`}>
                          <circle
                            cx={cx}
                            cy={cy - 20}
                            r={7}
                            fill="#10b981"
                            stroke="#ffffff"
                            strokeWidth={2}
                          />
                          <text
                            x={cx}
                            y={cy - 35}
                            fill="#10b981"
                            fontSize={10}
                            fontWeight="bold"
                            textAnchor="middle"
                            className="pointer-events-none"
                          >
                            High
                          </text>
                          <text
                            x={cx}
                            y={cy - 45}
                            fill="#10b981"
                            fontSize={9}
                            textAnchor="middle"
                            className="pointer-events-none"
                          >
                            ₹{highInfo.price.toFixed(0)}
                          </text>
                        </g>
                      );
                    }
                    // Price low marker (red) with label
                    if (payload.isPriceLow && lowInfo) {
                      return (
                        <g key={`low-marker-${cx}`}>
                          <circle
                            cx={cx}
                            cy={cy + 20}
                            r={7}
                            fill="#ef4444"
                            stroke="#ffffff"
                            strokeWidth={2}
                          />
                          <text
                            x={cx}
                            y={cy + 35}
                            fill="#ef4444"
                            fontSize={10}
                            fontWeight="bold"
                            textAnchor="middle"
                            className="pointer-events-none"
                          >
                            Low
                          </text>
                          <text
                            x={cx}
                            y={cy + 45}
                            fill="#ef4444"
                            fontSize={9}
                            textAnchor="middle"
                            className="pointer-events-none"
                          >
                            ₹{lowInfo.price.toFixed(0)}
                          </text>
                        </g>
                      );
                    }
                    return null;
                  }}
                  activeDot={{ r: 6 }}
                  name="Close Price"
                />
                {/* Moving Average 50 */}
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="ma50"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  dot={false}
                  name="MA 50"
                  connectNulls={false}
                />
                {/* Moving Average 200 */}
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="ma200"
                  stroke="#8b5cf6"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  dot={false}
                  name="MA 200"
                  connectNulls={false}
                />
                {/* Volume bars */}
                <Bar
                  yAxisId="volume"
                  dataKey="volume"
                  fill="#9ca3af"
                  opacity={0.3}
                  name="Volume"
                />
                {/* Vertical reference lines for volume spikes */}
                {chartData.filter(entry => entry.isVolumeSpike).map((entry, index) => (
                  <ReferenceLine
                    key={`vol-spike-line-${index}`}
                    x={entry.date}
                    stroke="#fbbf24"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    strokeOpacity={0.3}
                  />
                ))}
                {/* Vertical reference lines for price highs */}
                {chartData.filter(entry => entry.isPriceHigh).map((entry, index) => (
                  <ReferenceLine
                    key={`price-high-line-${index}`}
                    x={entry.date}
                    stroke="#10b981"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    strokeOpacity={0.3}
                  />
                ))}
                {/* Vertical reference lines for price lows */}
                {chartData.filter(entry => entry.isPriceLow).map((entry, index) => (
                  <ReferenceLine
                    key={`price-low-line-${index}`}
                    x={entry.date}
                    stroke="#ef4444"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    strokeOpacity={0.3}
                  />
                ))}
                {/* Reference line for starting price */}
                <ReferenceLine yAxisId="price" y={chartData[0]?.open} stroke="#6b7280" strokeDasharray="2 2" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>


          {/* Monthly Returns Chart */}
          {monthlyReturns.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="text-md font-semibold text-gray-800 mb-4">Monthly Returns</h4>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={monthlyReturns}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="month" 
                    stroke="#6b7280"
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis 
                    stroke="#6b7280"
                    tick={{ fontSize: 12 }}
                    label={{ value: 'Return %', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-gray-900 text-white p-3 rounded-lg shadow-lg text-sm">
                            <div className="font-semibold mb-2">{data.month}</div>
                            <div className={`${data.returnPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              Return: {data.returnPercent >= 0 ? '+' : ''}{data.returnPercent.toFixed(2)}%
                            </div>
                            <div className="text-gray-400 text-xs mt-1">
                              Amount: ₹{data.return.toFixed(2)}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                  <Bar dataKey="returnPercent" name="Monthly Return %">
                    {monthlyReturns.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.returnPercent >= 0 ? '#10b981' : '#ef4444'} 
                      />
                    ))}
                  </Bar>
                  <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="2 2" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

