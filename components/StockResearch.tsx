'use client';

import { useState, useEffect, useRef } from 'react';
import React from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import SmartAllocation from './SmartAllocation';
import DetailedStockAnalysis from './DetailedStockAnalysis';
import StockIntelligenceBoards from './StockIntelligenceBoards';

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
  quantPredictions: { minProbability: number; minPredictedReturn: number; minCAGR: number; maxVolatility: number; minMomentum: number; minPrice: number };
}

const defaultFilters: FilterState = {
  volumeSpikes: { minVolSpike: 30, minPriceMove: 0.5, minPrice: 30 },
  deepPullbacks: { maxFromHigh: -50, minVol: 5000, minPrice: 30 },
  capitulated: { maxFromHigh: -90, minVolSpike: 0, minPrice: 10 },
  fiveDayDecliners: { minDownDays: 3, maxReturn: -1.5, minPrice: 30 },
  fiveDayClimbers: { minUpDays: 3, minReturn: 1.5, minPrice: 30 },
  tightRangeBreakouts: { maxRange: 15, minBoScore: 0, minVolSpike: 50, minPrice: 30 },
  quantPredictions: { minProbability: 0.40, minPredictedReturn: 8, minCAGR: -100, maxVolatility: 100, minMomentum: 0, minPrice: 0 },
};

export default function StockResearch() {
  const [loading, setLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState<{ [key: string]: boolean }>({});
  const [data, setData] = useState<{
    quantPredictions?: any[];
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
      
      if (signalType === 'quantPredictions' || !signalType) {
        const quantFilters = filtersToUse.quantPredictions || activeFilters.quantPredictions || defaultFilters.quantPredictions;
        params.append('quant_minProbability', quantFilters.minProbability.toString());
        params.append('quant_minPredictedReturn', quantFilters.minPredictedReturn.toString());
        params.append('quant_minCAGR', quantFilters.minCAGR.toString());
        params.append('quant_maxVolatility', quantFilters.maxVolatility.toString());
        params.append('quant_minMomentum', quantFilters.minMomentum.toString());
        params.append('quant_minPrice', quantFilters.minPrice.toString());
      }
      
      const response = await fetch(`/api/stock-research?${params.toString()}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, ${errorText}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        if (signalType) {
          // Update only the specific signal type
          setData(prev => prev ? { ...prev, [signalType]: result.data[signalType] || [] } : null);
        } else {
          console.log('📊 Stock Research Data Received:', {
            quantPredictions: result.data?.quantPredictions?.length || 0,
            volumeSpikes: result.data?.volumeSpikes?.length || 0,
            deepPullbacks: result.data?.deepPullbacks?.length || 0,
            allKeys: Object.keys(result.data || {})
          });
          if (result.data?.quantPredictions) {
            console.log('🔍 Quant Predictions Sample:', result.data.quantPredictions.slice(0, 2));
          }
          setData(result.data);
          if (result.filters) {
            // Merge with defaults to ensure all filter types are present
            setActiveFilters(prev => ({
              ...defaultFilters,
              ...result.filters,
            }));
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
    try {
      // Use provided filter values if available, otherwise get from state
      const filtersToApply = filterValues || filters[signalType];
      
      console.log(`Applying filters for ${signalType}:`, filtersToApply);
      
      // Update both filters and activeFilters state
      setFilters(prev => ({ ...prev, [signalType]: filtersToApply }));
      setActiveFilters(prev => ({ ...prev, [signalType]: filtersToApply }));
      setShowFilters(prev => ({ ...prev, [signalType]: false }));
      
      // Fetch with the current filter values immediately - fetchResearchData will handle loading state
      await fetchResearchData(signalType, { [signalType]: filtersToApply } as Partial<FilterState>);
    } catch (error) {
      console.error('Error applying filters:', error);
      setError('Failed to apply filters. Please try again.');
    }
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
    const buttonRef = useRef<HTMLButtonElement>(null);
    
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
        {signalType !== 'quantPredictions' && (
          <button
            ref={buttonRef}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              
              // Store current scroll position and the button's position
              const scrollY = window.scrollY;
              const scrollX = window.scrollX;
              const buttonRect = buttonRef.current?.getBoundingClientRect();
              const buttonTop = buttonRect ? buttonRect.top + scrollY : scrollY;
              
              // Toggle filter visibility
              setShowFilters(prev => ({ ...prev, [signalType]: !prev[signalType] }));
              
              // Restore scroll position after state update using multiple strategies
              requestAnimationFrame(() => {
                window.scrollTo({
                  left: scrollX,
                  top: scrollY,
                  behavior: 'auto'
                });
                // Also try to maintain button position if possible
                if (buttonRef.current && buttonTop !== scrollY) {
                  const newButtonRect = buttonRef.current.getBoundingClientRect();
                  const newButtonTop = newButtonRect.top + window.scrollY;
                  if (Math.abs(newButtonTop - buttonTop) > 10) {
                    window.scrollTo({
                      left: scrollX,
                      top: scrollY + (buttonTop - newButtonTop),
                      behavior: 'auto'
                    });
                  }
                }
              });
              
              // Double check after a short delay
              setTimeout(() => {
                window.scrollTo({
                  left: scrollX,
                  top: scrollY,
                  behavior: 'auto'
                });
              }, 10);
            }}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
            type="button"
          >
            {isVisible ? '▼' : '▶'} Filter Conditions
          </button>
        )}
        
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
              
              {signalType === 'quantPredictions' && (() => {
                const quantFilters = (filters as FilterState['quantPredictions']) || defaultFilters.quantPredictions;
                const quantActiveFilters = (activeFilters as FilterState['quantPredictions']) || defaultFilters.quantPredictions;
                return (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Probability (0-1)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        {...getInputProps('minProbability', quantFilters?.minProbability ?? 0.40, '0.01')}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {((quantActiveFilters?.minProbability ?? 0.40) * 100).toFixed(0)}%</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Predicted Return (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        {...getInputProps('minPredictedReturn', quantFilters?.minPredictedReturn ?? 8, '0.1')}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {quantActiveFilters?.minPredictedReturn ?? 8}%</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min 3Yr CAGR (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        {...getInputProps('minCAGR', quantFilters?.minCAGR ?? -100, '0.1')}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {quantActiveFilters?.minCAGR ?? -100}%</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Max Volatility (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        {...getInputProps('maxVolatility', quantFilters?.maxVolatility ?? 100, '0.1')}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {quantActiveFilters?.maxVolatility ?? 100}%</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min 3M Momentum (0-1)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        {...getInputProps('minMomentum', quantFilters?.minMomentum ?? 0, '0.01')}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: {(quantActiveFilters?.minMomentum ?? 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Price (₹)</label>
                      <input
                        type="number"
                        {...getInputProps('minPrice', quantFilters?.minPrice ?? 0)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">Active: ₹{quantActiveFilters?.minPrice ?? 0}</p>
                    </div>
                  </>
                );
              })()}
            </div>
            
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleApply}
                disabled={sectionLoading[signalType] || loading}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {(sectionLoading[signalType] || (signalType === 'quantPredictions' && loading)) ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    <span>Applying...</span>
                  </>
                ) : (
                  'Apply'
                )}
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

  // Show loading state but still render the quant section structure
  if (!data) {
    return (
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Stock Research Dashboard</h2>
          <p className="text-gray-600 text-sm">
            Rules-driven technical analysis powered by OHLCV data • Mathematical models • Trading strategies
          </p>
        </div>

        {/* Quantitative Prediction Dashboard - Show loading state */}
        <div className="mb-8 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-xl p-8 border-2 border-indigo-200 shadow-xl">
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 mb-4">
              <span className="text-4xl">🔍</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">🚀 Quantitative Stock Screening Framework</h3>
            <p className="text-gray-600 mb-4">Loading advanced quantitative analysis...</p>
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          </div>
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

      {/* Quantitative Prediction Dashboard - Top Section - Always Show First */}
      {data && data.quantPredictions !== undefined ? (
        data.quantPredictions.length > 0 ? (
        <div className="mb-8 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-xl p-6 border-2 border-indigo-200 shadow-lg">
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-2xl font-bold text-gray-800 mb-1 flex items-center gap-2">
                  🚀 Quantitative Stock Screening Framework
                </h3>
                <p className="text-gray-600 text-sm">
                  Top 6 Stocks with &gt;{((activeFilters.quantPredictions?.minProbability ?? defaultFilters.quantPredictions.minProbability) * 100).toFixed(0)}% Probability of +{(activeFilters.quantPredictions?.minPredictedReturn ?? defaultFilters.quantPredictions.minPredictedReturn).toFixed(0)}% 3-Month Return • Based on 1-3 Year OHLC + Volume Data
                </p>
              </div>
              <button
                onClick={() => setShowFilters(prev => ({ ...prev, quantPredictions: !prev.quantPredictions }))}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                {showFilters.quantPredictions ? '▼' : '►'} Filter Criteria
              </button>
            </div>
            {showFilters.quantPredictions && (
              <div className="mt-4 p-4 bg-white rounded-lg border border-indigo-200 shadow-sm">
                <FilterPanel
                  signalType="quantPredictions"
                  filters={filters.quantPredictions}
                  activeFilters={activeFilters.quantPredictions}
                  onChange={(st, field, value) => {
                    setFilters(prev => ({
                      ...prev,
                      [st]: { ...prev[st], [field]: value }
                    }));
                  }}
                  onApply={() => applyFilters('quantPredictions')}
                  onApplyWithFilters={(filterValues) => applyFilters('quantPredictions', filterValues)}
                  onReset={() => resetFilters('quantPredictions')}
                />
              </div>
            )}
          </div>
          
          <div className="relative overflow-x-auto min-h-[400px]">
            {/* Loading Overlay */}
            {(loading || sectionLoading.quantPredictions) && (
              <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-50 flex items-center justify-center rounded-lg">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                  <p className="text-sm font-medium text-gray-700">Applying filters and analyzing stocks...</p>
                  <p className="text-xs text-gray-500 mt-2">This may take a few moments</p>
                </div>
              </div>
            )}
            
            <table className="min-w-full bg-white rounded-lg shadow-md overflow-hidden">
              <thead className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider">Rank</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider">Stock</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider">Px (₹)</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider">p12</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider">Exp 3M Ret %</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider">Regime (Bull %)</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider">Hurst</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider">Kalman SNR</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider">RSRS z</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider">VolSpike (15/63)</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider">Donchian% (63)</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider">KAMA ER</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider">VWAP Dist / ATR</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider">Filters Pass</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.quantPredictions
                  .sort((a: any, b: any) => (b.exp3MReturn || b.predictedReturn || 0) - (a.exp3MReturn || a.predictedReturn || 0))
                  .slice(0, 6)
                  .map((stock: any, idx: number) => (
                  <tr 
                    key={stock.isin} 
                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50 transition-colors`}
                  >
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center justify-center">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                          idx === 0 ? 'bg-gradient-to-r from-yellow-400 to-orange-400 text-white' :
                          idx === 1 ? 'bg-gradient-to-r from-gray-300 to-gray-400 text-white' :
                          idx === 2 ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white' :
                          'bg-gray-200 text-gray-700'
                        }`}>
                          {idx + 1}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">{stock.stockName}</div>
                      <div className="text-xs text-gray-500">{stock.symbol || 'N/A'}</div>
                    </td>
                    <td className="px-3 py-3 text-center text-sm font-semibold text-gray-900">
                      ₹{stock.currentPrice?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 'N/A'}
                    </td>
                    <td className="px-3 py-3 text-center text-sm">
                      <span className={`font-bold px-2 py-1 rounded ${
                        (stock.p12 || stock.probability || 0) >= 0.80 ? 'bg-green-100 text-green-800' :
                        (stock.p12 || stock.probability || 0) >= 0.70 ? 'bg-yellow-100 text-yellow-800' :
                        (stock.p12 || stock.probability || 0) >= 0.60 ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {((stock.p12 || stock.probability || 0) * 100)?.toFixed(0) || 'N/A'}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-sm">
                      <span className={`font-bold ${
                        (stock.exp3MReturn || stock.predictedReturn || 0) >= 15 ? 'text-green-600' :
                        (stock.exp3MReturn || stock.predictedReturn || 0) >= 10 ? 'text-yellow-600' :
                        'text-gray-600'
                      }`}>
                        +{(stock.exp3MReturn || stock.predictedReturn || 0)?.toFixed(1) || 'N/A'}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-sm">
                      <span className={`font-medium ${
                        (stock.regimeBull || 0) >= 0.70 ? 'text-green-600' :
                        (stock.regimeBull || 0) >= 0.55 ? 'text-yellow-600' :
                        'text-gray-600'
                      }`}>
                        {((stock.regimeBull || 0) * 100)?.toFixed(0) || 'N/A'}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-sm">
                      <span className={`font-medium ${
                        (stock.hurst || 0.5) >= 0.6 ? 'text-green-600' :
                        (stock.hurst || 0.5) >= 0.5 ? 'text-yellow-600' :
                        'text-gray-600'
                      }`}>
                        {(stock.hurst || 0.5)?.toFixed(2) || '0.50'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-sm">
                      <span className={`font-medium ${
                        (stock.kalmanSNR || 0) >= 1.5 ? 'text-green-600' :
                        (stock.kalmanSNR || 0) >= 1.0 ? 'text-yellow-600' :
                        'text-gray-600'
                      }`}>
                        {(stock.kalmanSNR || 0)?.toFixed(2) || 'N/A'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-sm">
                      <span className={`font-medium ${
                        (stock.rsrsZ || 0) >= 1.5 ? 'text-green-600' :
                        (stock.rsrsZ || 0) >= 1.0 ? 'text-yellow-600' :
                        'text-gray-600'
                      }`}>
                        {(stock.rsrsZ || 0)?.toFixed(2) || 'N/A'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-sm">
                      <span className={`font-medium ${
                        (stock.volSpike || stock.volumeSpikeRatio || 0) >= 1.5 ? 'text-green-600' :
                        (stock.volSpike || stock.volumeSpikeRatio || 0) >= 1.3 ? 'text-yellow-600' :
                        'text-gray-600'
                      }`}>
                        {(stock.volSpike || stock.volumeSpikeRatio || 0)?.toFixed(2) || 'N/A'}x
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-sm">
                      <span className={`font-medium ${
                        (stock.donchianPercent || 0) >= 0.8 ? 'text-green-600' :
                        (stock.donchianPercent || 0) >= 0.6 ? 'text-yellow-600' :
                        'text-gray-600'
                      }`}>
                        {((stock.donchianPercent || 0) * 100)?.toFixed(0) || 'N/A'}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-sm">
                      <span className={`font-medium ${
                        (stock.kamaER || 0) >= 0.6 ? 'text-green-600' :
                        (stock.kamaER || 0) >= 0.4 ? 'text-yellow-600' :
                        'text-gray-600'
                      }`}>
                        {(stock.kamaER || 0)?.toFixed(2) || 'N/A'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-sm">
                      <span className={`font-medium ${
                        (stock.vwapDistATR || 0) >= 0.5 ? 'text-green-600' :
                        (stock.vwapDistATR || 0) >= 0 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {(stock.vwapDistATR || 0)?.toFixed(2) || 'N/A'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-sm">
                      {stock.filtersPass ? (
                        <span className="text-green-600 font-bold">✅</span>
                      ) : (
                        <span className="text-red-600 font-bold" title={stock.filterFlags?.join(', ') || ''}>🚫</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center text-sm font-semibold">
                      <span className={`px-2 py-1 rounded text-xs ${
                        (stock.action || stock.decision || '').includes('✅ Buy') ? 'bg-green-100 text-green-800' :
                        (stock.action || stock.decision || '').includes('⚠️') ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {stock.action || stock.decision || 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 p-4 bg-white/80 rounded-lg border border-indigo-200">
            <p className="text-xs text-gray-600">
              <strong>Methodology:</strong> Advanced quantitative framework using OHLCV data only. Features include: Hurst Exponent (trend persistence), Kalman Filter (trend smoothing), RSRS (breakout strength), Markov Switching (regime detection), KAMA Efficiency Ratio, and more. Combined Bayesian Logistic + Gradient Boosting ensemble predicts P(3-month return &gt; +12%). Execution filters ensure quality: Regime Guard, Trend Quality, Energy, and Risk checks.
            </p>
          </div>
        </div>
        ) : (
          <div className="mb-8 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-xl p-8 border-2 border-indigo-200 shadow-xl">
          <div className="text-center">
            {/* Icon and Title */}
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 mb-4">
                <span className="text-4xl">🔍</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2 flex items-center justify-center gap-2">
                🚀 Quantitative Stock Screening Framework
              </h3>
              <p className="text-gray-600 text-base">
                Advanced AI-powered stock screening with institutional-grade metrics
              </p>
            </div>

            {/* Empty State Message */}
            <div className="bg-white/80 rounded-lg p-6 mb-6 border border-indigo-200 shadow-sm">
              <div className="flex items-start justify-center gap-3 mb-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <span className="text-2xl">📊</span>
                </div>
                <div className="text-left flex-1">
                  <h4 className="font-semibold text-gray-800 mb-2">No stocks found matching current criteria</h4>
                  <p className="text-sm text-gray-600 mb-3">
                    The quantitative model couldn't find stocks that meet your current filter thresholds. This could mean:
                  </p>
                  <ul className="text-sm text-gray-600 space-y-1 ml-4 list-disc">
                    <li>Market conditions are challenging</li>
                    <li>Filters are too strict</li>
                    <li>Stocks need more historical data</li>
                  </ul>
                </div>
              </div>

              {/* Current Filter Display */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 mb-4 border border-indigo-100">
                <p className="text-xs font-semibold text-indigo-800 mb-2 uppercase tracking-wide">Current Filter Settings</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div className="bg-white rounded px-3 py-2 border border-indigo-200">
                    <span className="text-gray-600">Probability:</span>
                    <span className="font-semibold text-indigo-700 ml-2">
                      ≥ {((activeFilters.quantPredictions?.minProbability ?? defaultFilters.quantPredictions.minProbability) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="bg-white rounded px-3 py-2 border border-indigo-200">
                    <span className="text-gray-600">Expected Return:</span>
                    <span className="font-semibold text-indigo-700 ml-2">
                      ≥ {(activeFilters.quantPredictions?.minPredictedReturn ?? defaultFilters.quantPredictions.minPredictedReturn).toFixed(0)}%
                    </span>
                  </div>
                  <div className="bg-white rounded px-3 py-2 border border-indigo-200">
                    <span className="text-gray-600">Min Price:</span>
                    <span className="font-semibold text-indigo-700 ml-2">
                      ₹{(activeFilters.quantPredictions?.minPrice ?? defaultFilters.quantPredictions.minPrice).toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Action Buttons */}
              <div className="flex flex-wrap gap-3 justify-center">
                <button
                  onClick={async (e) => {
                    e.preventDefault();
                    const newFilters = {
                      minProbability: 0.30,
                      minPredictedReturn: 6,
                      minCAGR: -100,
                      maxVolatility: 100,
                      minMomentum: 0,
                      minPrice: 0
                    };
                    console.log('🎯 Applying relaxed filters:', newFilters);
                    await applyFilters('quantPredictions', newFilters);
                  }}
                  disabled={loading || sectionLoading.quantPredictions}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-medium rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-2"
                >
                  {(loading || sectionLoading.quantPredictions) ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <span>Loading...</span>
                    </>
                  ) : (
                    '🎯 Try Relaxed Filters'
                  )}
                </button>
                <button
                  onClick={async (e) => {
                    e.preventDefault();
                    const newFilters = {
                      minProbability: 0.20,
                      minPredictedReturn: 5,
                      minCAGR: -100,
                      maxVolatility: 100,
                      minMomentum: 0,
                      minPrice: 0
                    };
                    console.log('🔓 Applying very relaxed filters:', newFilters);
                    await applyFilters('quantPredictions', newFilters);
                  }}
                  disabled={loading || sectionLoading.quantPredictions}
                  className="px-5 py-2.5 bg-white text-indigo-600 text-sm font-medium rounded-lg border-2 border-indigo-300 hover:bg-indigo-50 transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {(loading || sectionLoading.quantPredictions) ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-600 border-t-transparent"></div>
                      <span>Loading...</span>
                    </>
                  ) : (
                    '🔓 Very Relaxed Filters'
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setShowFilters(prev => ({ ...prev, quantPredictions: !prev.quantPredictions }));
                  }}
                  className="px-5 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg border-2 border-gray-300 hover:bg-gray-50 transition-all shadow-sm hover:shadow-md"
                >
                  {showFilters.quantPredictions ? '▼' : '⚙️'} Customize Filters
                </button>
              </div>
            </div>

            {/* Advanced Filter Panel */}
            {showFilters.quantPredictions && (
              <div className="mt-6 bg-white rounded-lg p-6 border-2 border-indigo-200 shadow-lg animate-in fade-in duration-300">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-semibold text-gray-800">Advanced Filter Configuration</h4>
                  <button
                    onClick={() => setShowFilters(prev => ({ ...prev, quantPredictions: false }))}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
                <FilterPanel
                  signalType="quantPredictions"
                  filters={filters.quantPredictions}
                  activeFilters={activeFilters.quantPredictions}
                  onChange={(st, field, value) => {
                    setFilters(prev => ({
                      ...prev,
                      [st]: { ...prev[st], [field]: value }
                    }));
                  }}
                  onApply={() => applyFilters('quantPredictions')}
                  onApplyWithFilters={(filterValues) => applyFilters('quantPredictions', filterValues)}
                  onReset={() => resetFilters('quantPredictions')}
                />
              </div>
            )}

            {/* Info Section */}
            <div className="mt-6 pt-6 border-t border-indigo-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="bg-white/60 rounded-lg p-4 border border-indigo-100">
                  <div className="text-2xl mb-2">📈</div>
                  <div className="font-semibold text-gray-800 mb-1">Advanced Metrics</div>
                  <div className="text-gray-600 text-xs">Hurst, Kalman Filter, RSRS, Regime Detection</div>
                </div>
                <div className="bg-white/60 rounded-lg p-4 border border-indigo-100">
                  <div className="text-2xl mb-2">🤖</div>
                  <div className="font-semibold text-gray-800 mb-1">AI-Powered</div>
                  <div className="text-gray-600 text-xs">Bayesian Logistic + Gradient Boosting Ensemble</div>
                </div>
                <div className="bg-white/60 rounded-lg p-4 border border-indigo-100">
                  <div className="text-2xl mb-2">✅</div>
                  <div className="font-semibold text-gray-800 mb-1">Quality Filters</div>
                  <div className="text-gray-600 text-xs">Regime Guard, Trend Quality, Energy Checks</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        )
      ) : null}

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

      {/* Smart Allocation Advisor */}
      <SmartAllocation quantPredictions={data.quantPredictions} />

      {/* Detailed Stock Analysis */}
      <DetailedStockAnalysis />

      {/* Stock Intelligence Boards */}
      <div className="mt-8">
        <StockIntelligenceBoards />
      </div>
    </div>
  );
}
