'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';

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

interface StockSignal {
  isin: string;
  stockName: string;
  symbol?: string;
  sector: string;
  close: number;
  percentFrom52WHigh: number;
  return5D: number;
  volSpike: number;
  vol15DAvgRatio: number;
  consistency5D: string;
  upDays: number;
  downDays: number;
  sparkline: number[];
  score: number;
  strategyHint: string;
  rsi?: number;
  bo20Score?: number;
  range20D?: number;
}

interface FilterState {
  volumeSpikes: { minVolSpike: number; minPriceMove: number; minPrice: number };
  deepPullbacks: { maxFromHigh: number; minVol: number; minPrice: number };
  capitulated: { maxFromHigh: number; minVolSpike: number; minPrice: number };
  fiveDayDecliners: { minDownDays: number; maxReturn: number; minPrice: number };
  fiveDayClimbers: { minUpDays: number; minReturn: number; minPrice: number };
  tightRangeBreakouts: { maxRange: number; minBoScore: number; minVolSpike: number; minPrice: number };
}

const defaultFilters: FilterState = {
  volumeSpikes: { minVolSpike: 30, minPriceMove: 0.5, minPrice: 30 },
  deepPullbacks: { maxFromHigh: -50, minVol: 5000, minPrice: 30 },
  capitulated: { maxFromHigh: -90, minVolSpike: 0, minPrice: 10 },
  fiveDayDecliners: { minDownDays: 3, maxReturn: -1.5, minPrice: 30 },
  fiveDayClimbers: { minUpDays: 3, minReturn: 1.5, minPrice: 30 },
  tightRangeBreakouts: { maxRange: 15, minBoScore: 0, minVolSpike: 50, minPrice: 30 },
};

export default function StockResearch() {
  const [loading, setLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState<{ [key: string]: boolean }>({});
  const [data, setData] = useState<{
    volumeSpikes: StockSignal[];
    deepPullbacks: StockSignal[];
    capitulated: StockSignal[];
    fiveDayDecliners: StockSignal[];
    fiveDayClimbers: StockSignal[];
    tightRangeBreakouts: StockSignal[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [activeFilters, setActiveFilters] = useState<FilterState>(defaultFilters);
  const [showFilters, setShowFilters] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    fetchResearchData();
  }, []);

  const fetchResearchData = async (signalType?: string, customFilters?: Partial<FilterState>) => {
    try {
      if (signalType) {
        setSectionLoading(prev => ({ ...prev, [signalType]: true }));
      } else {
        setLoading(true);
      }
      setError(null);
      
      const params = new URLSearchParams();
      if (signalType) {
        params.append('signalType', signalType);
      }
      
      // Use customFilters if provided, otherwise use activeFilters or defaultFilters
      let filtersToUse: Partial<FilterState> = {};
      if (customFilters) {
        filtersToUse = customFilters;
      } else if (signalType && activeFilters[signalType as keyof FilterState]) {
        filtersToUse = { [signalType]: activeFilters[signalType as keyof FilterState] } as Partial<FilterState>;
      } else if (!signalType) {
        filtersToUse = activeFilters;
      }
      
      // Add filter parameters
      if (signalType === 'volumeSpikes' || !signalType) {
        const volSpikeFilters = filtersToUse.volumeSpikes || activeFilters.volumeSpikes || defaultFilters.volumeSpikes;
        params.append('volSpike_minVolSpike', volSpikeFilters.minVolSpike.toString());
        params.append('volSpike_minPriceMove', volSpikeFilters.minPriceMove.toString());
        params.append('volSpike_minPrice', volSpikeFilters.minPrice.toString());
      }
      
      if (signalType === 'deepPullbacks' || !signalType) {
        const pullbackFilters = filtersToUse.deepPullbacks || activeFilters.deepPullbacks || defaultFilters.deepPullbacks;
        params.append('pullback_maxFromHigh', pullbackFilters.maxFromHigh.toString());
        params.append('pullback_minVol', pullbackFilters.minVol.toString());
        params.append('pullback_minPrice', pullbackFilters.minPrice.toString());
      }
      
      if (signalType === 'capitulated' || !signalType) {
        const capFilters = filtersToUse.capitulated || activeFilters.capitulated || defaultFilters.capitulated;
        params.append('cap_maxFromHigh', capFilters.maxFromHigh.toString());
        params.append('cap_minVolSpike', capFilters.minVolSpike.toString());
        params.append('cap_minPrice', capFilters.minPrice.toString());
      }
      
      if (signalType === 'fiveDayDecliners' || !signalType) {
        const declinerFilters = filtersToUse.fiveDayDecliners || activeFilters.fiveDayDecliners || defaultFilters.fiveDayDecliners;
        params.append('decliner_minDownDays', declinerFilters.minDownDays.toString());
        params.append('decliner_maxReturn', declinerFilters.maxReturn.toString());
        params.append('decliner_minPrice', declinerFilters.minPrice.toString());
      }
      
      if (signalType === 'fiveDayClimbers' || !signalType) {
        const climberFilters = filtersToUse.fiveDayClimbers || activeFilters.fiveDayClimbers || defaultFilters.fiveDayClimbers;
        params.append('climber_minUpDays', climberFilters.minUpDays.toString());
        params.append('climber_minReturn', climberFilters.minReturn.toString());
        params.append('climber_minPrice', climberFilters.minPrice.toString());
      }
      
      if (signalType === 'tightRangeBreakouts' || !signalType) {
        const breakoutFilters = filtersToUse.tightRangeBreakouts || activeFilters.tightRangeBreakouts || defaultFilters.tightRangeBreakouts;
        params.append('breakout_maxRange', breakoutFilters.maxRange.toString());
        params.append('breakout_minBoScore', breakoutFilters.minBoScore.toString());
        params.append('breakout_minVolSpike', breakoutFilters.minVolSpike.toString());
        params.append('breakout_minPrice', breakoutFilters.minPrice.toString());
      }
      
      const response = await fetch(`/api/stock-research?${params.toString()}`);
      const result = await response.json();
      
      if (result.success) {
        if (signalType) {
          // Update only the specific signal type
          setData(prev => prev ? { ...prev, [signalType]: result.data[signalType] || [] } : null);
        } else {
          setData(result.data);
          if (result.filters) {
            setActiveFilters(result.filters);
          }
        }
      } else {
        setError(result.error || 'Failed to fetch stock research data');
      }
    } catch (err: any) {
      console.error('Fetch error:', err);
      setError(err.message || 'Failed to fetch stock research data');
    } finally {
      if (signalType) {
        setSectionLoading(prev => ({ ...prev, [signalType]: false }));
      } else {
        setLoading(false);
      }
    }
  };

  const applyFilters = async (signalType: keyof FilterState, filterValues?: FilterState[keyof FilterState]) => {
    // Use provided filter values if available, otherwise get from state
    const filtersToApply = filterValues || filters[signalType];
    
    // Update active filters and hide filter panel immediately
    setActiveFilters(prev => ({ ...prev, [signalType]: filtersToApply }));
    setShowFilters(prev => ({ ...prev, [signalType]: false }));
    
    // Fetch with the current filter values immediately - no delays
    await fetchResearchData(signalType, { [signalType]: filtersToApply } as Partial<FilterState>);
  };

  const resetFilters = (signalType: keyof FilterState) => {
    setFilters(prev => ({ ...prev, [signalType]: defaultFilters[signalType] }));
    setActiveFilters(prev => ({ ...prev, [signalType]: defaultFilters[signalType] }));
    setShowFilters(prev => ({ ...prev, [signalType]: false }));
    fetchResearchData(signalType, { [signalType]: defaultFilters[signalType] } as Partial<FilterState>);
  };

  const formatPrice = (price: number) => {
    return `₹${price.toFixed(2)}`;
  };

  const formatPercent = (percent: number) => {
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
  };

  // Sparkline component
  const Sparkline = ({ data }: { data: number[] }) => {
    if (!data || data.length === 0) return <div className="text-xs text-gray-400">No data</div>;
    
    const chartData = data.map((val, idx) => ({ value: val, index: idx }));
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const isUptrend = data[data.length - 1] > data[0];
    
    return (
      <ResponsiveContainer width="100%" height={40}>
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={isUptrend ? '#10b981' : '#ef4444'}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Tooltip content={() => null} />
        </LineChart>
      </ResponsiveContainer>
    );
  };

  const FilterPanel = ({ 
    signalType, 
    filters, 
    activeFilters, 
    onChange, 
    onApply, 
    onReset,
    onApplyWithFilters
  }: { 
    signalType: keyof FilterState;
    filters: FilterState[keyof FilterState];
    activeFilters: FilterState[keyof FilterState];
    onChange: (signalType: keyof FilterState, field: string, value: number) => void;
    onApply: () => void;
    onReset: () => void;
    onApplyWithFilters?: (filterValues: FilterState[keyof FilterState]) => void;
  }) => {
    const isVisible = showFilters[signalType];
    const [focusedField, setFocusedField] = useState<string | null>(null);
    const [inputValues, setInputValues] = useState<{ [key: string]: string }>({});
    
    // Save pending input value to filters
    const savePendingInput = (fieldName: string, defaultValue: number) => {
      if (focusedField === fieldName && inputValues[fieldName] !== undefined) {
        const inputVal = inputValues[fieldName].trim();
        const val = inputVal === '' ? null : parseFloat(inputVal);
        if (val !== null && !isNaN(val)) {
          onChange(signalType, fieldName, val);
        } else {
          onChange(signalType, fieldName, defaultValue);
        }
        setInputValues(prev => {
          const newVals = { ...prev };
          delete newVals[fieldName];
          return newVals;
        });
        setFocusedField(null);
      }
    };
    
    // Helper function to create input props
    const getInputProps = (fieldName: string, fieldValue: number, step?: string) => {
      const displayValue = focusedField === fieldName 
        ? (inputValues[fieldName] ?? '') 
        : fieldValue;
      
      return {
        value: displayValue,
        onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
          setFocusedField(fieldName);
          setInputValues(prev => ({ ...prev, [fieldName]: '' }));
          e.target.select();
        },
        onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
          setFocusedField(null);
          const inputVal = e.target.value.trim();
          const val = inputVal === '' ? null : parseFloat(inputVal);
          if (val !== null && !isNaN(val)) {
            onChange(signalType, fieldName, val);
          } else {
            // Restore original value if invalid or empty
            onChange(signalType, fieldName, fieldValue);
          }
          setInputValues(prev => {
            const newVals = { ...prev };
            delete newVals[fieldName];
            return newVals;
          });
        },
        onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
          // Save on Enter key
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        },
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          const newValue = e.target.value;
          // Allow empty string, negative sign, decimal point, and numbers
          if (newValue === '' || /^-?\d*\.?\d*$/.test(newValue)) {
            setInputValues(prev => ({ ...prev, [fieldName]: newValue }));
          }
        },
        ...(step && { step })
      };
    };
    
    // Wrap onApply to save pending inputs first
    const handleApply = () => {
      // Build the final filter values to apply with any pending input values
      let finalFilters = { ...filters };
      
      // Save any pending input values
      if (focusedField && inputValues[focusedField] !== undefined) {
        const inputVal = inputValues[focusedField].trim();
        const val = inputVal === '' ? null : parseFloat(inputVal);
        if (val !== null && !isNaN(val)) {
          finalFilters = { ...filters, [focusedField]: val };
          // Save to parent state immediately
          onChange(signalType, focusedField, val);
        }
        // Clear the focused field state
        setFocusedField(null);
        setInputValues(prev => {
          const newVals = { ...prev };
          delete newVals[focusedField];
          return newVals;
        });
      }
      
      // Force blur on any focused input
      const activeElement = document.activeElement;
      if (activeElement && activeElement instanceof HTMLInputElement) {
        activeElement.blur();
      }
      
      // Apply filters immediately with the final filter values
      // Use onApplyWithFilters if provided (preferred for immediate application with values)
      if (onApplyWithFilters) {
        onApplyWithFilters(finalFilters);
      } else {
        // Fallback: call regular onApply, which will trigger applyFilters in parent
        // The parent will read the latest filters state which was updated via onChange
        onApply();
      }
    };
    
    return (
      <div className="mt-2">
        <button
          onClick={() => setShowFilters(prev => ({ ...prev, [signalType]: !prev[signalType] }))}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
        >
          {isVisible ? '▼' : '▶'} Filter Conditions
        </button>
        
        {isVisible && (
          <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <style dangerouslySetInnerHTML={{ __html: numberInputStyles }} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {signalType === 'volumeSpikes' && (() => {
                const volFilters = filters as FilterState['volumeSpikes'];
                const volActiveFilters = activeFilters as FilterState['volumeSpikes'];
                return (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Vol Spike (%)</label>
                      <input
                        type="number"
                        {...getInputProps('minVolSpike', volFilters.minVolSpike)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {volActiveFilters.minVolSpike}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Price Move (%)</label>
                      <input
                        type="number"
                        {...getInputProps('minPriceMove', volFilters.minPriceMove, '0.1')}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {volActiveFilters.minPriceMove}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Price (₹)</label>
                      <input
                        type="number"
                        {...getInputProps('minPrice', volFilters.minPrice)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    />
                    <p className="text-xs text-gray-500 mt-1">Active: {volActiveFilters.minPrice}</p>
                  </div>
                  </>
                );
              })()}
              
              {signalType === 'deepPullbacks' && (() => {
                const pullbackFilters = filters as FilterState['deepPullbacks'];
                const pullbackActiveFilters = activeFilters as FilterState['deepPullbacks'];
                return (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Max % from 52W High</label>
                      <input
                        type="number"
                        {...getInputProps('maxFromHigh', pullbackFilters.maxFromHigh)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {pullbackActiveFilters.maxFromHigh}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Volume</label>
                      <input
                        type="number"
                        {...getInputProps('minVol', pullbackFilters.minVol)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {pullbackActiveFilters.minVol}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Price (₹)</label>
                      <input
                        type="number"
                        {...getInputProps('minPrice', pullbackFilters.minPrice)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {pullbackActiveFilters.minPrice}</p>
                    </div>
                  </>
                );
              })()}
              
              {signalType === 'capitulated' && (() => {
                const capFilters = filters as FilterState['capitulated'];
                const capActiveFilters = activeFilters as FilterState['capitulated'];
                return (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Max % from 52W High</label>
                      <input
                        type="number"
                        {...getInputProps('maxFromHigh', capFilters.maxFromHigh)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {capActiveFilters.maxFromHigh}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Vol Spike (%)</label>
                      <input
                        type="number"
                        {...getInputProps('minVolSpike', capFilters.minVolSpike)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {capActiveFilters.minVolSpike}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Price (₹)</label>
                      <input
                        type="number"
                        {...getInputProps('minPrice', capFilters.minPrice)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {capActiveFilters.minPrice}</p>
                    </div>
                  </>
                );
              })()}
              
              {signalType === 'fiveDayDecliners' && (() => {
                const declinerFilters = filters as FilterState['fiveDayDecliners'];
                const declinerActiveFilters = activeFilters as FilterState['fiveDayDecliners'];
                return (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Down Days</label>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        {...getInputProps('minDownDays', declinerFilters.minDownDays)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {declinerActiveFilters.minDownDays}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Max 5D Return (%)</label>
                      <input
                        type="number"
                        {...getInputProps('maxReturn', declinerFilters.maxReturn, '0.1')}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {declinerActiveFilters.maxReturn}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Price (₹)</label>
                      <input
                        type="number"
                        {...getInputProps('minPrice', declinerFilters.minPrice)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {declinerActiveFilters.minPrice}</p>
                    </div>
                  </>
                );
              })()}
              
              {signalType === 'fiveDayClimbers' && (() => {
                const climberFilters = filters as FilterState['fiveDayClimbers'];
                const climberActiveFilters = activeFilters as FilterState['fiveDayClimbers'];
                return (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Up Days</label>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        {...getInputProps('minUpDays', climberFilters.minUpDays)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {climberActiveFilters.minUpDays}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min 5D Return (%)</label>
                      <input
                        type="number"
                        {...getInputProps('minReturn', climberFilters.minReturn, '0.1')}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {climberActiveFilters.minReturn}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Price (₹)</label>
                      <input
                        type="number"
                        {...getInputProps('minPrice', climberFilters.minPrice)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {climberActiveFilters.minPrice}</p>
                    </div>
                  </>
                );
              })()}
              
              {signalType === 'tightRangeBreakouts' && (() => {
                const breakoutFilters = filters as FilterState['tightRangeBreakouts'];
                const breakoutActiveFilters = activeFilters as FilterState['tightRangeBreakouts'];
                return (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Max Range (%)</label>
                      <input
                        type="number"
                        {...getInputProps('maxRange', breakoutFilters.maxRange)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {breakoutActiveFilters.maxRange}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min BO Score</label>
                      <input
                        type="number"
                        {...getInputProps('minBoScore', breakoutFilters.minBoScore, '0.1')}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {breakoutActiveFilters.minBoScore}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Vol Spike (%)</label>
                      <input
                        type="number"
                        {...getInputProps('minVolSpike', breakoutFilters.minVolSpike)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {breakoutActiveFilters.minVolSpike}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Price (₹)</label>
                      <input
                        type="number"
                        {...getInputProps('minPrice', breakoutFilters.minPrice)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {breakoutActiveFilters.minPrice}</p>
                    </div>
                  </>
                );
              })()}
            </div>
            
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleApply}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
              >
                Apply
              </button>
              <button
                onClick={onReset}
                className="px-4 py-2 bg-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-400"
              >
                Reset to Default
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const SignalCard = ({ 
    title, 
    icon, 
    subtitle, 
    stocks,
    marketingLabel,
    signalType,
    isLoading = false
  }: { 
    title: string; 
    icon: string;
    subtitle: string;
    stocks: StockSignal[];
    marketingLabel?: string;
    signalType: keyof FilterState;
    isLoading?: boolean;
  }) => {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{icon}</span>
                <div>
                  <h3 className="text-lg font-bold text-gray-800">{title}</h3>
                  <p className="text-xs text-gray-600 mt-0.5">{subtitle}</p>
                </div>
              </div>
              <div className="mt-2">
                <FilterPanel
                  signalType={signalType}
                  filters={filters[signalType]}
                  activeFilters={activeFilters[signalType]}
                  onChange={(st, field, value) => {
                    setFilters(prev => ({
                      ...prev,
                      [st]: { ...prev[st], [field]: value }
                    }));
                  }}
                  onApply={() => applyFilters(signalType)}
                  onApplyWithFilters={(filterValues) => applyFilters(signalType, filterValues)}
                  onReset={() => resetFilters(signalType)}
                />
              </div>
            </div>
            {marketingLabel && (
              <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full ml-4">
                {marketingLabel}
              </span>
            )}
          </div>
        </div>
        
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-sm text-gray-600">Applying filters...</p>
          </div>
        ) : stocks.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-sm">No stocks found in this category</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Name</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Last Close</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">% from 52W High</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">5D Return</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">15D Vol vs Avg</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Consistency (5D)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">10D Trend</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Strategy Hint</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stocks.map((stock, idx) => (
                  <tr key={stock.isin} className={idx % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 hover:bg-blue-50'}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">{stock.stockName}</div>
                      <div className="text-xs text-gray-500">{stock.symbol || 'N/A'}</div>
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">
                      {formatPrice(stock.close)}
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      <span className={`font-semibold ${stock.percentFrom52WHigh < -50 ? 'text-red-600' : stock.percentFrom52WHigh < -20 ? 'text-orange-600' : 'text-gray-600'}`}>
                        {formatPercent(stock.percentFrom52WHigh)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      <span className={`font-semibold ${stock.return5D >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPercent(stock.return5D)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      <span className={`font-semibold ${stock.volSpike > 100 ? 'text-orange-600' : stock.volSpike > 50 ? 'text-yellow-600' : 'text-gray-600'}`}>
                        {formatPercent(stock.volSpike)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-700">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        stock.upDays >= 4 ? 'bg-green-100 text-green-800' :
                        stock.downDays >= 4 ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {stock.consistency5D} {stock.upDays >= 4 ? '⬆️' : stock.downDays >= 4 ? '⬇️' : '↔️'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="w-24 h-10 mx-auto">
                        <Sparkline data={stock.sparkline} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-600 max-w-xs">
                      <div className="px-2 py-1 bg-blue-50 rounded border border-blue-200">
                        {stock.strategyHint}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Analyzing OHLCV data with mathematical models...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error: {error}</p>
          <button
            onClick={() => fetchResearchData()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-gray-600">No data available. Please ensure stock master data is uploaded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-gray-800 mb-2">Stock Research Dashboard</h2>
        <p className="text-gray-600 text-sm">
          Rules-driven technical analysis powered by OHLCV data • Mathematical models • Trading strategies
        </p>
      </div>

      {/* Hero Row - Today's Signals */}
      <div className="mb-8">
        <h3 className="text-xl font-semibold text-gray-700 mb-4">📊 Today's Signals</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-orange-50 to-red-50 p-4 rounded-lg border border-orange-200">
            <div className="text-sm font-semibold text-orange-800 mb-1">Volume Spikes</div>
            <div className="text-2xl font-bold text-orange-600">{data.volumeSpikes.length}</div>
            <div className="text-xs text-orange-600 mt-1">Unusual Activity</div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
            <div className="text-sm font-semibold text-blue-800 mb-1">Deep Pullbacks</div>
            <div className="text-2xl font-bold text-blue-600">{data.deepPullbacks.length}</div>
            <div className="text-xs text-blue-600 mt-1">50% Off Peak</div>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-pink-50 p-4 rounded-lg border border-red-200">
            <div className="text-sm font-semibold text-red-800 mb-1">Capitulated</div>
            <div className="text-2xl font-bold text-red-600">{data.capitulated.length}</div>
            <div className="text-xs text-red-600 mt-1">90% Down</div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-violet-50 p-4 rounded-lg border border-purple-200">
            <div className="text-sm font-semibold text-purple-800 mb-1">5D Decliners</div>
            <div className="text-2xl font-bold text-purple-600">{data.fiveDayDecliners.length}</div>
            <div className="text-xs text-purple-600 mt-1">Selling Pressure</div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
            <div className="text-sm font-semibold text-green-800 mb-1">5D Climbers</div>
            <div className="text-2xl font-bold text-green-600">{data.fiveDayClimbers.length}</div>
            <div className="text-xs text-green-600 mt-1">Momentum Up</div>
          </div>
          <div className="bg-gradient-to-br from-yellow-50 to-amber-50 p-4 rounded-lg border border-yellow-200">
            <div className="text-sm font-semibold text-yellow-800 mb-1">Tight Range BO</div>
            <div className="text-2xl font-bold text-yellow-600">{data.tightRangeBreakouts.length}</div>
            <div className="text-xs text-yellow-600 mt-1">Breakout Watch</div>
          </div>
        </div>
      </div>

      {/* Signal Cards */}
      <SignalCard
        title="🔥 Top 6 Volume Spikes (15D)"
        icon="🔥"
        subtitle="VolSpike > 50% • Price movement > 1% • Score = 0.7×VolSpike + 0.3×PriceMove"
        stocks={data.volumeSpikes}
        marketingLabel="Unusual Activity — 15D Volume Surges"
        signalType="volumeSpikes"
        isLoading={sectionLoading.volumeSpikes}
      />

      <SignalCard
        title="📉 Top 6 Deep Pullbacks (≤ 50% from 52W High)"
        icon="📉"
        subtitle="%FromHigh ≤ -50% • Ranked by ShortTermOversold Index (lower = better)"
        stocks={data.deepPullbacks}
        marketingLabel="50% Off Their Peak — Possible Reversal Zone"
        signalType="deepPullbacks"
        isLoading={sectionLoading.deepPullbacks}
      />

      <SignalCard
        title="🛑 Top 6 Capitulated (≤ 90% from 52W High)"
        icon="🛑"
        subtitle="%FromHigh ≤ -90% • VolSpike > 0 • Score = 0.6×VolSpike + 0.4×5DReturn"
        stocks={data.capitulated}
        marketingLabel="High-Risk, High-Reward — 90% Down, Waking Up"
        signalType="capitulated"
        isLoading={sectionLoading.capitulated}
      />

      <SignalCard
        title="📉 Top 6 5-Day Decliners"
        icon="📉"
        subtitle="5 consecutive down days (or 4/5) • Return5D < -2% • Score = 0.6×Drop + 0.4×Vol"
        stocks={data.fiveDayDecliners}
        marketingLabel="5-Day Selling Pressure — Watch for Breakdown / Short Setups"
        signalType="fiveDayDecliners"
        isLoading={sectionLoading.fiveDayDecliners}
      />

      <SignalCard
        title="📈 Top 6 5-Day Climbers"
        icon="📈"
        subtitle="5 consecutive up days (or 4/5) • Return5D > 2% • Score = 0.5×Gain + 0.3×Vol + 0.2×BullBody"
        stocks={data.fiveDayClimbers}
        marketingLabel="Momentum-on-the-Move — 5-Day Climbers"
        signalType="fiveDayClimbers"
        isLoading={sectionLoading.fiveDayClimbers}
      />

      {data.tightRangeBreakouts.length > 0 && (
        <SignalCard
          title="🎯 Top 6 Tight-Range Breakout Candidates"
          icon="🎯"
          subtitle="20D Range < 15% • Breakout above 20D High • VolSpike > 50%"
          stocks={data.tightRangeBreakouts}
          marketingLabel="Tight Range + Breakout → Potential Explosive Move"
          signalType="tightRangeBreakouts"
          isLoading={sectionLoading.tightRangeBreakouts}
        />
      )}
    </div>
  );
}
