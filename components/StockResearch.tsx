'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import SmartAllocation from './SmartAllocation';
import DetailedStockAnalysis from './DetailedStockAnalysis';
import StockIntelligenceBoards from './StockIntelligenceBoards';

// ── Types ────────────────────────────────────────────────────────────────────

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
  volumeSpikes:        { minVolSpike: number; minPriceMove: number; minPrice: number };
  deepPullbacks:       { maxFromHigh: number; minVol: number; minPrice: number };
  capitulated:         { maxFromHigh: number; minVolSpike: number; minPrice: number };
  fiveDayDecliners:    { minDownDays: number; maxReturn: number; minPrice: number };
  fiveDayClimbers:     { minUpDays: number; minReturn: number; minPrice: number };
  tightRangeBreakouts: { maxRange: number; minBoScore: number; minVolSpike: number; minPrice: number };
  quantPredictions:    { minProbability: number; minPredictedReturn: number; minCAGR: number; maxVolatility: number; minMomentum: number; minPrice: number };
}

type SignalKey = keyof FilterState;

const SIGNAL_KEYS: SignalKey[] = [
  'quantPredictions',
  'volumeSpikes',
  'deepPullbacks',
  'capitulated',
  'fiveDayDecliners',
  'fiveDayClimbers',
  'tightRangeBreakouts',
];

const defaultFilters: FilterState = {
  volumeSpikes:        { minVolSpike: 30, minPriceMove: 0.5, minPrice: 30 },
  deepPullbacks:       { maxFromHigh: -50, minVol: 5000, minPrice: 30 },
  capitulated:         { maxFromHigh: -90, minVolSpike: 0, minPrice: 10 },
  fiveDayDecliners:    { minDownDays: 3, maxReturn: -1.5, minPrice: 30 },
  fiveDayClimbers:     { minUpDays: 3, minReturn: 1.5, minPrice: 30 },
  tightRangeBreakouts: { maxRange: 15, minBoScore: 0, minVolSpike: 50, minPrice: 30 },
  quantPredictions:    { minProbability: 0.40, minPredictedReturn: 8, minCAGR: -100, maxVolatility: 100, minMomentum: 0, minPrice: 0 },
};

// ── Session cache ─────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getCached(key: string): any | null {
  try {
    const raw = sessionStorage.getItem(`research_${key}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) { sessionStorage.removeItem(`research_${key}`); return null; }
    return data;
  } catch { return null; }
}

function setCache(key: string, data: any) {
  try { sessionStorage.setItem(`research_${key}`, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtPrice   = (p: number) => `₹${p.toFixed(2)}`;
const fmtPct     = (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`;

// ── Sparkline ─────────────────────────────────────────────────────────────────
const Sparkline = React.memo(({ data }: { data: number[] }) => {
  if (!data || data.length === 0) return <div className="text-xs" style={{ color: 'var(--text-lo)' }}>—</div>;
  const isUp = data[data.length - 1] > data[0];
  const chartData = data.map((value, index) => ({ value, index }));
  return (
    <ResponsiveContainer width="100%" height={36}>
      <LineChart data={chartData}>
        <Line type="monotone" dataKey="value"
          stroke={isUp ? 'var(--gain)' : 'var(--loss)'}
          strokeWidth={2} dot={false} isAnimationActive={false} />
        <Tooltip content={() => null} />
      </LineChart>
    </ResponsiveContainer>
  );
});
Sparkline.displayName = 'Sparkline';

// ── Skeleton row ─────────────────────────────────────────────────────────────
function SkeletonRows({ cols = 8 }: { cols?: number }) {
  return (
    <>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-raised)' }}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="skeleton h-4 rounded" style={{ width: j === 0 ? '80%' : j === cols - 1 ? '60%' : '50%' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── Build URL params for a signal ─────────────────────────────────────────────
function buildParams(signalType: SignalKey, f: FilterState): URLSearchParams {
  const p = new URLSearchParams({ signalType });
  switch (signalType) {
    case 'volumeSpikes':
      p.set('volSpike_minVolSpike', f.volumeSpikes.minVolSpike.toString());
      p.set('volSpike_minPriceMove', f.volumeSpikes.minPriceMove.toString());
      p.set('volSpike_minPrice', f.volumeSpikes.minPrice.toString());
      break;
    case 'deepPullbacks':
      p.set('pullback_maxFromHigh', f.deepPullbacks.maxFromHigh.toString());
      p.set('pullback_minVol', f.deepPullbacks.minVol.toString());
      p.set('pullback_minPrice', f.deepPullbacks.minPrice.toString());
      break;
    case 'capitulated':
      p.set('cap_maxFromHigh', f.capitulated.maxFromHigh.toString());
      p.set('cap_minVolSpike', f.capitulated.minVolSpike.toString());
      p.set('cap_minPrice', f.capitulated.minPrice.toString());
      break;
    case 'fiveDayDecliners':
      p.set('decliner_minDownDays', f.fiveDayDecliners.minDownDays.toString());
      p.set('decliner_maxReturn', f.fiveDayDecliners.maxReturn.toString());
      p.set('decliner_minPrice', f.fiveDayDecliners.minPrice.toString());
      break;
    case 'fiveDayClimbers':
      p.set('climber_minUpDays', f.fiveDayClimbers.minUpDays.toString());
      p.set('climber_minReturn', f.fiveDayClimbers.minReturn.toString());
      p.set('climber_minPrice', f.fiveDayClimbers.minPrice.toString());
      break;
    case 'tightRangeBreakouts':
      p.set('breakout_maxRange', f.tightRangeBreakouts.maxRange.toString());
      p.set('breakout_minBoScore', f.tightRangeBreakouts.minBoScore.toString());
      p.set('breakout_minVolSpike', f.tightRangeBreakouts.minVolSpike.toString());
      p.set('breakout_minPrice', f.tightRangeBreakouts.minPrice.toString());
      break;
    case 'quantPredictions':
      p.set('quant_minProbability', f.quantPredictions.minProbability.toString());
      p.set('quant_minPredictedReturn', f.quantPredictions.minPredictedReturn.toString());
      p.set('quant_minCAGR', f.quantPredictions.minCAGR.toString());
      p.set('quant_maxVolatility', f.quantPredictions.maxVolatility.toString());
      p.set('quant_minMomentum', f.quantPredictions.minMomentum.toString());
      p.set('quant_minPrice', f.quantPredictions.minPrice.toString());
      break;
  }
  return p;
}

// ── Main component ───────────────────────────────────────────────────────────
export default function StockResearch() {
  const [signals, setSignals] = useState<Partial<Record<SignalKey, any[]>>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>(
    Object.fromEntries(SIGNAL_KEYS.map(k => [k, true]))
  );
  const [errorMap, setErrorMap] = useState<Record<string, string | null>>({});
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [activeFilters, setActiveFilters] = useState<FilterState>(defaultFilters);
  const [showFilters, setShowFilters] = useState<Record<string, boolean>>({});

  // Fetch a single signal, with cache
  const fetchSignal = useCallback(async (type: SignalKey, overrideFilters?: FilterState, skipCache = false) => {
    const f = overrideFilters ?? activeFilters;
    const cacheKey = `${type}_${JSON.stringify(f[type])}`;

    if (!skipCache) {
      const cached = getCached(cacheKey);
      if (cached !== null) {
        setSignals(prev => ({ ...prev, [type]: cached }));
        setLoadingMap(prev => ({ ...prev, [type]: false }));
        return;
      }
    }

    setLoadingMap(prev => ({ ...prev, [type]: true }));
    setErrorMap(prev => ({ ...prev, [type]: null }));

    try {
      const res = await fetch(`/api/stock-research?${buildParams(type, f).toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      if (result.success) {
        const payload = result.data?.[type] ?? [];
        setSignals(prev => ({ ...prev, [type]: payload }));
        setCache(cacheKey, payload);
      } else {
        throw new Error(result.error || 'Failed');
      }
    } catch (err: any) {
      setErrorMap(prev => ({ ...prev, [type]: err.message }));
      setSignals(prev => ({ ...prev, [type]: [] }));
    } finally {
      setLoadingMap(prev => ({ ...prev, [type]: false }));
    }
  }, [activeFilters]);

  // Fetch all signals in parallel on mount
  useEffect(() => {
    SIGNAL_KEYS.forEach(type => fetchSignal(type));
  }, []);

  const applyFilters = async (type: SignalKey, newFilters?: FilterState[SignalKey]) => {
    const merged = { ...activeFilters, [type]: newFilters ?? filters[type] };
    setFilters(merged);
    setActiveFilters(merged);
    setShowFilters(prev => ({ ...prev, [type]: false }));
    await fetchSignal(type, merged, true);
  };

  const resetFilters = (type: SignalKey) => {
    const merged = { ...activeFilters, [type]: defaultFilters[type] };
    setFilters(merged);
    setActiveFilters(merged);
    setShowFilters(prev => ({ ...prev, [type]: false }));
    fetchSignal(type, merged, true);
  };

  const isPageLoading = SIGNAL_KEYS.some(k => loadingMap[k]) && Object.keys(signals).length === 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-hi">Stock Research</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-lo)' }}>
          Rules-driven technical analysis • Mathematical models • Trading strategies
          {isPageLoading && <span className="ml-2 inline-flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--brand)' }} /> Loading…</span>}
        </p>
      </div>

      {/* Quant Predictions */}
      <QuantSection
        data={signals.quantPredictions}
        isLoading={!!loadingMap.quantPredictions}
        filters={filters.quantPredictions}
        activeFilters={activeFilters.quantPredictions}
        showFilter={!!showFilters.quantPredictions}
        onToggleFilter={() => setShowFilters(prev => ({ ...prev, quantPredictions: !prev.quantPredictions }))}
        onFilterChange={(field, val) => setFilters(prev => ({ ...prev, quantPredictions: { ...prev.quantPredictions, [field]: val } }))}
        onApply={(vals) => applyFilters('quantPredictions', vals)}
        onReset={() => resetFilters('quantPredictions')}
      />

      {/* Signal cards */}
      {([
        { type: 'volumeSpikes',        title: 'Top 6 Volume Spikes (15D)',              icon: '🔥', sub: 'VolSpike > 30% • Price move > 0.5%',                           badge: 'Unusual Activity' },
        { type: 'deepPullbacks',       title: 'Top 6 Deep Pullbacks (≤ 50% from High)', icon: '📉', sub: '≥ 50% off 52W High • Possible reversal zone',                   badge: '50% Off Peak' },
        { type: 'capitulated',         title: 'Top 6 Capitulated (≤ 90% from High)',    icon: '🛑', sub: '≥ 90% off 52W High • Oversold with volume',                     badge: 'High Risk / Reward' },
        { type: 'fiveDayDecliners',    title: 'Top 6 5-Day Decliners',                  icon: '📉', sub: '3–5 consecutive down days • Return5D < −1.5%',                   badge: 'Selling Pressure' },
        { type: 'fiveDayClimbers',     title: 'Top 6 5-Day Climbers',                   icon: '📈', sub: '3–5 consecutive up days • Return5D > +1.5%',                     badge: 'Momentum' },
        { type: 'tightRangeBreakouts', title: 'Top 6 Tight-Range Breakout Candidates', icon: '🎯', sub: '20D Range < 15% • Breakout above 20D High • VolSpike > 50%',     badge: 'Breakout Setup' },
      ] as const).map(({ type, title, icon, sub, badge }) => (
        <SignalCard
          key={type}
          type={type as SignalKey}
          title={title}
          icon={icon}
          sub={sub}
          badge={badge}
          stocks={signals[type as SignalKey] ?? []}
          isLoading={!!loadingMap[type]}
          error={errorMap[type] ?? null}
          filters={filters[type as SignalKey]}
          activeFilters={activeFilters[type as SignalKey]}
          showFilter={!!showFilters[type]}
          onToggleFilter={() => setShowFilters(prev => ({ ...prev, [type]: !prev[type] }))}
          onFilterChange={(field, val) => setFilters(prev => ({ ...prev, [type]: { ...prev[type as SignalKey], [field]: val } }))}
          onApply={(vals) => applyFilters(type as SignalKey, vals)}
          onReset={() => resetFilters(type as SignalKey)}
        />
      ))}

      {/* Sub-components */}
      <SmartAllocation quantPredictions={signals.quantPredictions} />
      <DetailedStockAnalysis />
      <div className="mt-4"><StockIntelligenceBoards /></div>
    </div>
  );
}

// ── FilterPanel ───────────────────────────────────────────────────────────────
function FilterPanel({
  signalType, filters, activeFilters, onChange, onApplyWithFilters, onReset, isLoading,
}: {
  signalType: SignalKey;
  filters: FilterState[SignalKey];
  activeFilters: FilterState[SignalKey];
  onChange: (field: string, val: number) => void;
  onApplyWithFilters: (vals: FilterState[SignalKey]) => void;
  onReset: () => void;
  isLoading: boolean;
}) {
  const [focused, setFocused] = useState<string | null>(null);
  const [inputVals, setInputVals] = useState<Record<string, string>>({});
  const pendingRef = useRef<Record<string, number>>({});

  const field = (name: string, defaultVal: number, step?: string) => {
    const stored = (filters as any)[name];
    const display = focused === name ? (inputVals[name] ?? '') : stored;
    return {
      value: display,
      step,
      onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
        setFocused(name);
        setInputVals(p => ({ ...p, [name]: '' }));
        e.target.select();
      },
      onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
        setFocused(null);
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) { onChange(name, val); pendingRef.current[name] = val; }
        else pendingRef.current[name] = stored;
        setInputVals(p => { const n = { ...p }; delete n[name]; return n; });
      },
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.currentTarget.blur(); },
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.value === '' || /^-?\d*\.?\d*$/.test(e.target.value))
          setInputVals(p => ({ ...p, [name]: e.target.value }));
      },
    };
  };

  const handleApply = () => {
    if (focused && inputVals[focused] !== undefined) {
      const val = parseFloat(inputVals[focused]);
      if (!isNaN(val)) { onChange(focused, val); pendingRef.current[focused] = val; }
      setFocused(null);
      setInputVals({});
      document.activeElement instanceof HTMLInputElement && (document.activeElement as HTMLInputElement).blur();
    }
    const merged = { ...filters, ...pendingRef.current } as FilterState[SignalKey];
    onApplyWithFilters(merged);
    pendingRef.current = {};
  };

  const inputCls = 'form-input w-full py-1 text-sm';
  const labelCls = 'block text-xs font-medium mb-1';
  const activeCls = 'text-xs mt-0.5';

  return (
    <div className="mt-3 p-4 rounded-xl" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-sm)' }}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {signalType === 'volumeSpikes' && (() => {
          const f = filters as FilterState['volumeSpikes'];
          const a = activeFilters as FilterState['volumeSpikes'];
          return (<>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min Vol Spike (%)</label><input type="number" className={inputCls} {...field('minVolSpike', f.minVolSpike)} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.minVolSpike}</p></div>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min Price Move (%)</label><input type="number" className={inputCls} {...field('minPriceMove', f.minPriceMove, '0.1')} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.minPriceMove}</p></div>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min Price (₹)</label><input type="number" className={inputCls} {...field('minPrice', f.minPrice)} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.minPrice}</p></div>
          </>);
        })()}
        {signalType === 'deepPullbacks' && (() => {
          const f = filters as FilterState['deepPullbacks'];
          const a = activeFilters as FilterState['deepPullbacks'];
          return (<>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Max % from 52W High</label><input type="number" className={inputCls} {...field('maxFromHigh', f.maxFromHigh)} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.maxFromHigh}</p></div>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min Volume</label><input type="number" className={inputCls} {...field('minVol', f.minVol)} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.minVol}</p></div>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min Price (₹)</label><input type="number" className={inputCls} {...field('minPrice', f.minPrice)} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.minPrice}</p></div>
          </>);
        })()}
        {signalType === 'capitulated' && (() => {
          const f = filters as FilterState['capitulated'];
          const a = activeFilters as FilterState['capitulated'];
          return (<>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Max % from 52W High</label><input type="number" className={inputCls} {...field('maxFromHigh', f.maxFromHigh)} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.maxFromHigh}</p></div>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min Vol Spike (%)</label><input type="number" className={inputCls} {...field('minVolSpike', f.minVolSpike)} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.minVolSpike}</p></div>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min Price (₹)</label><input type="number" className={inputCls} {...field('minPrice', f.minPrice)} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.minPrice}</p></div>
          </>);
        })()}
        {signalType === 'fiveDayDecliners' && (() => {
          const f = filters as FilterState['fiveDayDecliners'];
          const a = activeFilters as FilterState['fiveDayDecliners'];
          return (<>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min Down Days</label><input type="number" min="1" max="5" className={inputCls} {...field('minDownDays', f.minDownDays)} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.minDownDays}</p></div>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Max 5D Return (%)</label><input type="number" className={inputCls} {...field('maxReturn', f.maxReturn, '0.1')} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.maxReturn}</p></div>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min Price (₹)</label><input type="number" className={inputCls} {...field('minPrice', f.minPrice)} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.minPrice}</p></div>
          </>);
        })()}
        {signalType === 'fiveDayClimbers' && (() => {
          const f = filters as FilterState['fiveDayClimbers'];
          const a = activeFilters as FilterState['fiveDayClimbers'];
          return (<>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min Up Days</label><input type="number" min="1" max="5" className={inputCls} {...field('minUpDays', f.minUpDays)} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.minUpDays}</p></div>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min 5D Return (%)</label><input type="number" className={inputCls} {...field('minReturn', f.minReturn, '0.1')} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.minReturn}</p></div>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min Price (₹)</label><input type="number" className={inputCls} {...field('minPrice', f.minPrice)} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.minPrice}</p></div>
          </>);
        })()}
        {signalType === 'tightRangeBreakouts' && (() => {
          const f = filters as FilterState['tightRangeBreakouts'];
          const a = activeFilters as FilterState['tightRangeBreakouts'];
          return (<>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Max Range (%)</label><input type="number" className={inputCls} {...field('maxRange', f.maxRange)} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.maxRange}</p></div>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min BO Score</label><input type="number" className={inputCls} {...field('minBoScore', f.minBoScore, '0.1')} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.minBoScore}</p></div>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min Vol Spike (%)</label><input type="number" className={inputCls} {...field('minVolSpike', f.minVolSpike)} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.minVolSpike}</p></div>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min Price (₹)</label><input type="number" className={inputCls} {...field('minPrice', f.minPrice)} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.minPrice}</p></div>
          </>);
        })()}
        {signalType === 'quantPredictions' && (() => {
          const f = filters as FilterState['quantPredictions'];
          const a = activeFilters as FilterState['quantPredictions'];
          return (<>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min Probability (0–1)</label><input type="number" step="0.01" min="0" max="1" className={inputCls} {...field('minProbability', f.minProbability, '0.01')} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {(a.minProbability * 100).toFixed(0)}%</p></div>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min Predicted Return (%)</label><input type="number" step="0.1" className={inputCls} {...field('minPredictedReturn', f.minPredictedReturn, '0.1')} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.minPredictedReturn}%</p></div>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min 3Yr CAGR (%)</label><input type="number" step="0.1" className={inputCls} {...field('minCAGR', f.minCAGR, '0.1')} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.minCAGR}%</p></div>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Max Volatility (%)</label><input type="number" step="0.1" className={inputCls} {...field('maxVolatility', f.maxVolatility, '0.1')} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.maxVolatility}%</p></div>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min 3M Momentum (0–1)</label><input type="number" step="0.01" min="0" max="1" className={inputCls} {...field('minMomentum', f.minMomentum, '0.01')} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: {a.minMomentum.toFixed(2)}</p></div>
            <div><label className={labelCls} style={{ color: 'var(--text-mid)' }}>Min Price (₹)</label><input type="number" className={inputCls} {...field('minPrice', f.minPrice)} /><p className={activeCls} style={{ color: 'var(--text-lo)' }}>Active: ₹{a.minPrice}</p></div>
          </>);
        })()}
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={handleApply} disabled={isLoading}
          className="btn btn-primary text-sm px-4 py-1.5 flex items-center gap-1.5"
          style={{ opacity: isLoading ? 0.6 : 1 }}>
          {isLoading && <span className="inline-block w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: '#fff transparent #fff #fff' }} />}
          Apply
        </button>
        <button onClick={onReset} className="btn btn-ghost text-sm px-4 py-1.5">Reset</button>
      </div>
    </div>
  );
}

// ── SignalCard ─────────────────────────────────────────────────────────────────
function SignalCard({
  type, title, icon, sub, badge, stocks, isLoading, error,
  filters, activeFilters, showFilter, onToggleFilter, onFilterChange, onApply, onReset,
}: {
  type: SignalKey; title: string; icon: string; sub: string; badge: string;
  stocks: StockSignal[]; isLoading: boolean; error: string | null;
  filters: FilterState[SignalKey]; activeFilters: FilterState[SignalKey];
  showFilter: boolean;
  onToggleFilter: () => void;
  onFilterChange: (field: string, val: number) => void;
  onApply: (vals: FilterState[SignalKey]) => void;
  onReset: () => void;
}) {
  return (
    <div className="card overflow-hidden">
      {/* Card header */}
      <div className="flex items-start justify-between px-5 pt-4 pb-3"
        style={{ borderBottom: '1px solid var(--border-sm)', background: 'var(--bg-raised)' }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl leading-none">{icon}</span>
            <h3 className="text-sm font-bold text-hi">{title}</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ background: 'var(--brand-bg)', color: 'var(--brand)' }}>{badge}</span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>{sub}</p>
          {/* Filter toggle */}
          <button onClick={onToggleFilter}
            className="mt-2 text-xs font-medium flex items-center gap-1 transition-colors"
            style={{ color: showFilter ? 'var(--brand)' : 'var(--text-lo)' }}>
            {showFilter ? '▼' : '▶'} Filter Conditions
          </button>
          {showFilter && (
            <FilterPanel
              signalType={type} filters={filters} activeFilters={activeFilters}
              onChange={onFilterChange} onApplyWithFilters={onApply} onReset={onReset}
              isLoading={isLoading}
            />
          )}
        </div>
        {isLoading && (
          <span className="ml-3 mt-0.5 shrink-0 inline-block w-4 h-4 rounded-full border-2 animate-spin"
            style={{ borderColor: 'var(--brand) transparent var(--brand) transparent' }} />
        )}
      </div>

      {/* Table */}
      {error ? (
        <div className="p-6 text-center text-sm" style={{ color: 'var(--loss)' }}>Error: {error}</div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {['Stock', 'Close', '% from 52W High', '5D Return', 'Vol Spike', 'Consistency (5D)', '10D Trend', 'Strategy'].map(h => (
                  <th key={h} className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide ${h === 'Stock' ? 'text-left' : 'text-center'}`}
                    style={{ color: 'var(--text-mid)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && stocks.length === 0 ? (
                <SkeletonRows cols={8} />
              ) : stocks.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-lo)' }}>No stocks match this criteria</td></tr>
              ) : (
                stocks.map((s, i) => (
                  <tr key={s.isin} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-raised)' }}>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="text-sm font-semibold text-hi">{s.stockName}</div>
                      <div className="text-xs" style={{ color: 'var(--text-lo)' }}>{s.symbol || 'N/A'}</div>
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-semibold metric-value text-hi">{fmtPrice(s.close)}</td>
                    <td className="px-4 py-2.5 text-center text-sm font-semibold metric-value"
                      style={{ color: s.percentFrom52WHigh < -50 ? 'var(--loss)' : s.percentFrom52WHigh < -20 ? 'var(--warn)' : 'var(--text-mid)' }}>
                      {fmtPct(s.percentFrom52WHigh)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-semibold metric-value"
                      style={{ color: s.return5D >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                      {fmtPct(s.return5D)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-semibold metric-value"
                      style={{ color: s.volSpike > 100 ? 'var(--warn)' : s.volSpike > 50 ? 'var(--brand)' : 'var(--text-mid)' }}>
                      {fmtPct(s.volSpike)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="px-2 py-0.5 rounded text-xs font-semibold"
                        style={{
                          background: s.upDays >= 4 ? 'color-mix(in srgb, var(--gain) 12%, transparent)' : s.downDays >= 4 ? 'color-mix(in srgb, var(--loss) 12%, transparent)' : 'var(--bg-raised)',
                          color: s.upDays >= 4 ? 'var(--gain)' : s.downDays >= 4 ? 'var(--loss)' : 'var(--text-mid)',
                          border: '1px solid',
                          borderColor: s.upDays >= 4 ? 'color-mix(in srgb, var(--gain) 25%, transparent)' : s.downDays >= 4 ? 'color-mix(in srgb, var(--loss) 25%, transparent)' : 'var(--border-sm)',
                        }}>
                        {s.consistency5D} {s.upDays >= 4 ? '⬆' : s.downDays >= 4 ? '⬇' : '↔'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="w-20 h-9 mx-auto"><Sparkline data={s.sparkline} /></div>
                    </td>
                    <td className="px-4 py-2.5 text-center max-w-[160px]">
                      <div className="px-2 py-1 rounded text-xs" style={{ background: 'var(--brand-bg)', color: 'var(--brand)', border: '1px solid color-mix(in srgb, var(--brand) 20%, transparent)' }}>
                        {s.strategyHint}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Quant Section ─────────────────────────────────────────────────────────────
function QuantSection({
  data, isLoading, filters, activeFilters, showFilter,
  onToggleFilter, onFilterChange, onApply, onReset,
}: {
  data: any[] | undefined; isLoading: boolean;
  filters: FilterState['quantPredictions']; activeFilters: FilterState['quantPredictions'];
  showFilter: boolean;
  onToggleFilter: () => void;
  onFilterChange: (field: string, val: number) => void;
  onApply: (vals: FilterState['quantPredictions']) => void;
  onReset: () => void;
}) {
  const sorted = (data ?? [])
    .sort((a: any, b: any) => (b.exp3MReturn || b.predictedReturn || 0) - (a.exp3MReturn || a.predictedReturn || 0))
    .slice(0, 6);

  const metricColor = (val: number, hi: number, mid: number) =>
    val >= hi ? 'var(--gain)' : val >= mid ? 'var(--warn)' : 'var(--text-mid)';

  const rankBg = (i: number) =>
    i === 0 ? 'linear-gradient(135deg, #f59e0b, #d97706)' :
    i === 1 ? 'linear-gradient(135deg, #9ca3af, #6b7280)' :
    i === 2 ? 'linear-gradient(135deg, #b45309, #92400e)' :
    'var(--bg-raised)';

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border-sm)', background: 'var(--bg-raised)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl">🚀</span>
              <h3 className="text-sm font-bold text-hi">Quantitative Stock Screening Framework</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand)' }}>
                AI-Powered
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
              Top stocks with &gt;{(activeFilters.minProbability * 100).toFixed(0)}% probability of +{activeFilters.minPredictedReturn.toFixed(0)}% 3-month return
              {' '}• Hurst, Kalman, RSRS, Regime Detection, KAMA
            </p>
          </div>
          <button onClick={onToggleFilter}
            className="btn btn-ghost text-xs px-3 py-1.5 shrink-0">
            {showFilter ? '▼' : '⚙'} Filters
          </button>
        </div>
        {showFilter && (
          <FilterPanel
            signalType="quantPredictions" filters={filters} activeFilters={activeFilters}
            onChange={onFilterChange} onApplyWithFilters={onApply} onReset={onReset}
            isLoading={isLoading}
          />
        )}
      </div>

      {/* Table / loading / empty */}
      <div className="relative">
        {isLoading && (data === undefined || data.length === 0) && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  {['Rank', 'Stock', 'Price', 'p12', 'Exp 3M Ret', 'Regime', 'Hurst', 'Kalman SNR', 'RSRS z', 'VolSpike', 'Donchian%', 'KAMA ER', 'VWAP/ATR', 'Filters', 'Action'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-center" style={{ color: 'var(--text-mid)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody><SkeletonRows cols={15} /></tbody>
            </table>
          </div>
        )}

        {!isLoading && data !== undefined && data.length === 0 && (
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-glow)' }}>
              <span className="text-2xl">📊</span>
            </div>
            <p className="font-semibold text-hi mb-1">No stocks match current criteria</p>
            <p className="text-sm mb-4" style={{ color: 'var(--text-lo)' }}>Try relaxing the probability or return thresholds</p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => onApply({ minProbability: 0.30, minPredictedReturn: 6, minCAGR: -100, maxVolatility: 100, minMomentum: 0, minPrice: 0 })}
                className="btn btn-primary text-xs px-4 py-1.5">Try Relaxed Filters</button>
              <button onClick={onReset} className="btn btn-ghost text-xs px-4 py-1.5">Reset to Default</button>
            </div>
          </div>
        )}

        {data !== undefined && data.length > 0 && (
          <div className="tbl-wrap">
            {isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-b-xl"
                style={{ background: 'color-mix(in srgb, var(--bg-surface) 85%, transparent)', backdropFilter: 'blur(2px)' }}>
                <div className="text-center">
                  <div className="w-8 h-8 rounded-full border-2 animate-spin mx-auto mb-2"
                    style={{ borderColor: 'var(--brand) transparent var(--brand) transparent' }} />
                  <p className="text-xs" style={{ color: 'var(--text-mid)' }}>Applying filters…</p>
                </div>
              </div>
            )}
            <table className="tbl">
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, var(--brand) 0%, #7c3aed 100%)' }}>
                  {['Rank', 'Stock', 'Price', 'p12', 'Exp 3M Ret', 'Regime %', 'Hurst', 'Kalman SNR', 'RSRS z', 'VolSpike', 'Donchian%', 'KAMA ER', 'VWAP/ATR', 'Filters', 'Action'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-center" style={{ color: 'rgba(255,255,255,0.9)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((s: any, i: number) => (
                  <tr key={s.isin} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-raised)' }}>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white"
                        style={{ background: rankBg(i) }}>{i + 1}</span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="text-sm font-semibold text-hi">{s.stockName}</div>
                      <div className="text-xs" style={{ color: 'var(--text-lo)' }}>{s.symbol || 'N/A'}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm font-semibold metric-value text-hi">
                      ₹{s.currentPrice?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 'N/A'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="font-bold px-2 py-0.5 rounded text-xs"
                        style={{
                          background: (s.p12||s.probability||0) >= 0.80 ? 'color-mix(in srgb,var(--gain) 12%,transparent)' : (s.p12||s.probability||0) >= 0.60 ? 'color-mix(in srgb,var(--warn) 12%,transparent)' : 'var(--bg-raised)',
                          color: (s.p12||s.probability||0) >= 0.80 ? 'var(--gain)' : (s.p12||s.probability||0) >= 0.60 ? 'var(--warn)' : 'var(--text-mid)',
                        }}>
                        {((s.p12||s.probability||0)*100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm font-semibold metric-value"
                      style={{ color: (s.exp3MReturn||s.predictedReturn||0) >= 15 ? 'var(--gain)' : (s.exp3MReturn||s.predictedReturn||0) >= 10 ? 'var(--warn)' : 'var(--text-mid)' }}>
                      +{(s.exp3MReturn||s.predictedReturn||0).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm metric-value"
                      style={{ color: metricColor((s.regimeBull||0), 0.70, 0.55) }}>
                      {((s.regimeBull||0)*100).toFixed(0)}%
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm metric-value"
                      style={{ color: metricColor((s.hurst||0.5), 0.6, 0.5) }}>
                      {(s.hurst||0.5).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm metric-value"
                      style={{ color: metricColor((s.kalmanSNR||0), 1.5, 1.0) }}>
                      {(s.kalmanSNR||0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm metric-value"
                      style={{ color: metricColor((s.rsrsZ||0), 1.5, 1.0) }}>
                      {(s.rsrsZ||0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm metric-value"
                      style={{ color: metricColor((s.volSpike||s.volumeSpikeRatio||0), 1.5, 1.3) }}>
                      {(s.volSpike||s.volumeSpikeRatio||0).toFixed(2)}x
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm metric-value"
                      style={{ color: metricColor((s.donchianPercent||0), 0.8, 0.6) }}>
                      {((s.donchianPercent||0)*100).toFixed(0)}%
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm metric-value"
                      style={{ color: metricColor((s.kamaER||0), 0.6, 0.4) }}>
                      {(s.kamaER||0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm metric-value"
                      style={{ color: (s.vwapDistATR||0) >= 0.5 ? 'var(--gain)' : (s.vwapDistATR||0) >= 0 ? 'var(--warn)' : 'var(--loss)' }}>
                      {(s.vwapDistATR||0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm">
                      {s.filtersPass
                        ? <span style={{ color: 'var(--gain)' }}>✅</span>
                        : <span style={{ color: 'var(--loss)' }} title={s.filterFlags?.join(', ') || ''}>🚫</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="px-2 py-0.5 rounded text-xs font-semibold"
                        style={{
                          background: (s.action||s.decision||'').includes('Buy') ? 'color-mix(in srgb,var(--gain) 12%,transparent)' : (s.action||s.decision||'').includes('⚠') ? 'color-mix(in srgb,var(--warn) 12%,transparent)' : 'var(--bg-raised)',
                          color: (s.action||s.decision||'').includes('Buy') ? 'var(--gain)' : (s.action||s.decision||'').includes('⚠') ? 'var(--warn)' : 'var(--text-mid)',
                        }}>
                        {s.action || s.decision || 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Methodology footer */}
      {data && data.length > 0 && (
        <div className="px-5 py-3 text-xs" style={{ borderTop: '1px solid var(--border-sm)', color: 'var(--text-lo)' }}>
          <strong className="text-hi">Methodology:</strong> Hurst Exponent, Kalman Filter, RSRS, Markov Switching regime, KAMA Efficiency Ratio, VWAP/ATR.
          Ensemble: Bayesian Logistic + Gradient Boosting predicts P(3M return &gt; +12%).
        </div>
      )}
    </div>
  );
}
