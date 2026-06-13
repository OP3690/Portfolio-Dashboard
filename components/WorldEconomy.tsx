'use client';

import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, ReferenceLine,
} from 'recharts';

// ── Types ────────────────────────────────────────────────────────────────────
interface CountryData {
  code: string;
  name: string;
  gdp: number | null;
  gdpYear: string | null;
  gdpGrowth: number | null;
  inflation: number | null;
  unemployment: number | null;
  gdpPerCapita: number | null;
  fdi: number | null;
  exports: number | null;
  govDebt: number | null;
  growthTrend: { year: string; value: number }[];
}

interface WorldData {
  gdp: number | null;
  gdpGrowth: number | null;
  inflation: number | null;
  unemployment: number | null;
  gdpYear: string | null;
}

interface ApiResponse {
  success: boolean;
  world: WorldData;
  countries: CountryData[];
  gdpRanking: CountryData[];
  indiaRank: number;
  globalGrowthTrend: any[];
  updatedAt: string;
}

// ── Constants ────────────────────────────────────────────────────────────────
const FLAGS: Record<string, string> = {
  IN: '🇮🇳', US: '🇺🇸', CN: '🇨🇳', JP: '🇯🇵', DE: '🇩🇪',
  GB: '🇬🇧', FR: '🇫🇷', BR: '🇧🇷', KR: '🇰🇷', ZA: '🇿🇦',
};

const LINE_COLORS: Record<string, string> = {
  IN: '#f97316', US: '#3b82f6', CN: '#ef4444', JP: '#8b5cf6',
  DE: '#eab308', GB: '#06b6d4', FR: '#10b981', BR: '#f43f5e',
  KR: '#a78bfa', ZA: '#fb923c',
};

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtGDP(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  return `$${(v / 1e6).toFixed(0)}M`;
}

function fmtPct(v: number | null, digits = 2): string {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

function fmtCap(v: number | null): string {
  if (v == null) return '—';
  return `$${Math.round(v).toLocaleString()}`;
}

function growthColor(v: number | null): string {
  if (v == null) return 'var(--text-muted)';
  if (v >= 5)  return '#22c55e';
  if (v >= 2)  return '#86efac';
  if (v >= 0)  return '#fbbf24';
  return '#f87171';
}

function inflColor(v: number | null): string {
  if (v == null) return 'var(--text-muted)';
  if (v <= 2)  return '#22c55e';
  if (v <= 4)  return '#fbbf24';
  if (v <= 7)  return '#fb923c';
  return '#f87171';
}

// ── Mini sparkline ────────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: { year: string; value: number }[]; color: string }) {
  if (!data || data.length < 2) return <div className="h-8" />;
  const vals = data.map(d => d.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const W = 80; const H = 32;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((d.value - min) / range) * H;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts.split(' ').at(-1)?.split(',')[0]} cy={pts.split(' ').at(-1)?.split(',')[1]} r={2.5} fill={color} />
    </svg>
  );
}

// ── Country Card ─────────────────────────────────────────────────────────────
function EconomyCard({ c, rank }: { c: CountryData; rank: number }) {
  const isIndia = c.code === 'IN';
  const gc = growthColor(c.gdpGrowth);

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5"
      style={{
        background:  isIndia ? 'linear-gradient(135deg,rgba(249,115,22,0.12),rgba(249,115,22,0.04))' : 'var(--bg-surface)',
        border:      isIndia ? '1.5px solid rgba(249,115,22,0.35)' : '1px solid var(--border-sm)',
        boxShadow:   isIndia ? '0 0 20px rgba(249,115,22,0.10)' : 'var(--shadow-sm)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl leading-none">{FLAGS[c.code] ?? '🌐'}</span>
          <div>
            <p className="text-[11px] font-bold leading-none" style={{ color: 'var(--text-hi)' }}>{c.name}</p>
            <p className="text-[9px] mt-0.5 font-semibold" style={{ color: 'var(--text-muted)' }}>#{rank} by GDP</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>GDP</p>
          <p className="text-sm font-black" style={{ color: 'var(--text-hi)' }}>{fmtGDP(c.gdp)}</p>
        </div>
      </div>

      {/* Key metrics row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl p-2 text-center" style={{ background: 'var(--bg-raised)' }}>
          <p className="text-[9px] font-semibold mb-0.5" style={{ color: 'var(--text-muted)' }}>GROWTH</p>
          <p className="text-xs font-black" style={{ color: gc }}>{fmtPct(c.gdpGrowth)}</p>
        </div>
        <div className="rounded-xl p-2 text-center" style={{ background: 'var(--bg-raised)' }}>
          <p className="text-[9px] font-semibold mb-0.5" style={{ color: 'var(--text-muted)' }}>INFLATION</p>
          <p className="text-xs font-black" style={{ color: inflColor(c.inflation) }}>{fmtPct(c.inflation)}</p>
        </div>
        <div className="rounded-xl p-2 text-center" style={{ background: 'var(--bg-raised)' }}>
          <p className="text-[9px] font-semibold mb-0.5" style={{ color: 'var(--text-muted)' }}>UNEMPL.</p>
          <p className="text-xs font-black" style={{ color: 'var(--text-hi)' }}>{c.unemployment != null ? `${c.unemployment.toFixed(1)}%` : '—'}</p>
        </div>
      </div>

      {/* Bottom row: GDP per capita + sparkline */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[9px] font-semibold" style={{ color: 'var(--text-muted)' }}>GDP / CAPITA</p>
          <p className="text-[11px] font-bold" style={{ color: 'var(--text-hi)' }}>{fmtCap(c.gdpPerCapita)}</p>
        </div>
        <Sparkline data={c.growthTrend} color={LINE_COLORS[c.code] ?? '#94a3b8'} />
      </div>
    </div>
  );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl p-3 text-xs" style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-md)',
      boxShadow: 'var(--shadow-xl)', minWidth: 160,
    }}>
      <p className="font-bold mb-2" style={{ color: 'var(--text-hi)' }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-1">
          <span className="flex items-center gap-1" style={{ color: p.color }}>
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold" style={{ color: p.value >= 0 ? '#22c55e' : '#f87171' }}>
            {p.value != null ? `${p.value > 0 ? '+' : ''}${p.value.toFixed(2)}%` : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Pulse Stat Card ──────────────────────────────────────────────────────────
function PulseStat({ label, value, sub, color = 'var(--brand)', icon }: {
  label: string; value: string; sub?: string; color?: string; icon: React.ReactNode;
}) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}22`, color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-lg font-black mt-0.5 leading-none" style={{ color: 'var(--text-hi)' }}>{value}</p>
        {sub && <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function WorldEconomy() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'gdp' | 'growth' | 'inflation'>('gdp');

  useEffect(() => {
    fetch('/api/world-economy')
      .then(r => r.json())
      .then(d => { if (d.success) setData(d); else setError(d.error || 'Failed to load'); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="card h-20" />)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => <div key={i} className="card h-40" />)}
        </div>
        <div className="card h-64" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm" style={{ color: 'var(--loss)' }}>Failed to load World Economy data: {error}</p>
      </div>
    );
  }

  const { world, countries, gdpRanking, indiaRank, globalGrowthTrend } = data;

  // Fastest growing among our set
  const fastest = [...countries].filter(c => c.gdpGrowth != null).sort((a, b) => (b.gdpGrowth ?? 0) - (a.gdpGrowth ?? 0))[0];
  const india   = countries.find(c => c.code === 'IN');

  // GDP bar chart data
  const gdpBarData = gdpRanking.map(c => ({
    name: c.name.replace('United States', 'USA').replace('United Kingdom', 'UK').replace('Korea, Rep.', 'Korea'),
    gdp:  c.gdp ? +(c.gdp / 1e12).toFixed(2) : 0,
    code: c.code,
    highlight: c.code === 'IN',
  }));

  // Growth bar chart data (latest year)
  const growthBarData = [...countries]
    .filter(c => c.gdpGrowth != null)
    .sort((a, b) => (b.gdpGrowth ?? 0) - (a.gdpGrowth ?? 0))
    .map(c => ({
      name: c.name.replace('United States', 'USA').replace('United Kingdom', 'UK').replace('Korea, Rep.', 'Korea'),
      growth: +(c.gdpGrowth ?? 0).toFixed(2),
      code: c.code,
    }));

  // Inflation bar chart
  const inflBarData = [...countries]
    .filter(c => c.inflation != null)
    .sort((a, b) => (a.inflation ?? 0) - (b.inflation ?? 0))
    .map(c => ({
      name: c.name.replace('United States', 'USA').replace('United Kingdom', 'UK').replace('Korea, Rep.', 'Korea'),
      inflation: +(c.inflation ?? 0).toFixed(2),
      code: c.code,
    }));

  return (
    <div className="space-y-6 animate-fadeIn">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-black flex items-center gap-2" style={{ color: 'var(--text-hi)' }}>
            🌍 World Economy
          </h1>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            World Bank Open Data · {world.gdpYear ?? '2024'} · 10 major economies
          </p>
        </div>
        <div className="text-[10px] px-2 py-1 rounded-full font-semibold"
          style={{ background: 'var(--gain-bg)', color: 'var(--gain)', border: '1px solid var(--gain-border)' }}>
          Live via World Bank API
        </div>
      </div>

      {/* ── Global Pulse Stats ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PulseStat
          label="World GDP"
          value={fmtGDP(world.gdp)}
          sub={`As of ${world.gdpYear ?? '2024'}`}
          color="#5b5ef4"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <PulseStat
          label="Global Growth"
          value={fmtPct(world.gdpGrowth)}
          sub="World GDP growth rate"
          color={growthColor(world.gdpGrowth)}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
        />
        <PulseStat
          label="World Inflation"
          value={fmtPct(world.inflation)}
          sub="Consumer price index"
          color={inflColor(world.inflation)}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <PulseStat
          label="India Rank"
          value={`#${indiaRank} Economy`}
          sub={`GDP ${fmtGDP(india?.gdp ?? null)} · Growing ${fmtPct(india?.gdpGrowth ?? null)}`}
          color="#f97316"
          icon={<span className="text-2xl">🇮🇳</span>}
        />
      </div>

      {/* ── Country Cards Grid ───────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-bold mb-3 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Economic Snapshot — Major Economies
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {gdpRanking.map((c, i) => (
            <EconomyCard key={c.code} c={c} rank={i + 1} />
          ))}
        </div>
      </div>

      {/* ── Chart Section ────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        {/* Tab selector */}
        <div className="flex items-center gap-0 p-4 pb-0">
          <h2 className="text-sm font-bold mr-4" style={{ color: 'var(--text-hi)' }}>Economy Rankings</h2>
          {(['gdp', 'growth', 'inflation'] as const).map(v => (
            <button
              key={v}
              onClick={() => setActiveView(v)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg mr-1 transition-all"
              style={
                activeView === v
                  ? { background: 'var(--brand)', color: '#fff' }
                  : { color: 'var(--text-muted)', background: 'var(--bg-raised)' }
              }
            >
              {v === 'gdp' ? 'GDP Size' : v === 'growth' ? 'GDP Growth' : 'Inflation'}
            </button>
          ))}
        </div>

        <div className="p-4" style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            {activeView === 'gdp' ? (
              <BarChart data={gdpBarData} layout="vertical" margin={{ left: 60, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-sm)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  tickFormatter={v => `$${v}T`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={55} />
                <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}T`, 'GDP']}
                  contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-md)', borderRadius: 12, fontSize: 11 }} />
                <Bar dataKey="gdp" radius={[0, 6, 6, 0]}>
                  {gdpBarData.map((entry, i) => (
                    <rect key={i} fill={entry.highlight ? '#f97316' : '#5b5ef4'} />
                  ))}
                </Bar>
              </BarChart>
            ) : activeView === 'growth' ? (
              <BarChart data={growthBarData} layout="vertical" margin={{ left: 60, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-sm)" horizontal={false} />
                <ReferenceLine x={0} stroke="var(--border-md)" />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={55} />
                <Tooltip formatter={(v: number) => [`${v > 0 ? '+' : ''}${v}%`, 'GDP Growth']}
                  contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-md)', borderRadius: 12, fontSize: 11 }} />
                <Bar dataKey="growth" radius={[0, 6, 6, 0]}
                  fill="url(#growthGrad)"
                />
                <defs>
                  <linearGradient id="growthGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#22c55e" />
                    <stop offset="100%" stopColor="#86efac" />
                  </linearGradient>
                </defs>
              </BarChart>
            ) : (
              <BarChart data={inflBarData} layout="vertical" margin={{ left: 60, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-sm)" horizontal={false} />
                <ReferenceLine x={2} stroke="#22c55e" strokeDasharray="4 4" label={{ value: '2% target', fontSize: 9, fill: '#22c55e' }} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={55} />
                <Tooltip formatter={(v: number) => [`${v}%`, 'Inflation']}
                  contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-md)', borderRadius: 12, fontSize: 11 }} />
                <Bar dataKey="inflation" radius={[0, 6, 6, 0]} fill="url(#inflGrad)" />
                <defs>
                  <linearGradient id="inflGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#fbbf24" />
                    <stop offset="100%" stopColor="#f87171" />
                  </linearGradient>
                </defs>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── GDP Growth Trend ─────────────────────────────────────────────────── */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-hi)' }}>GDP Growth Trends</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Annual GDP growth rate (%) — last 6 years</p>
          </div>
        </div>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={globalGrowthTrend} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-sm)" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={v => `${v}%`} />
              <ReferenceLine y={0} stroke="var(--border-md)" strokeWidth={1.5} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {Object.entries(LINE_COLORS).map(([code, color]) => (
                <Line
                  key={code}
                  type="monotone"
                  dataKey={code}
                  name={countries.find(c => c.code === code)?.name.replace('United States', 'USA').replace('United Kingdom', 'UK').replace('Korea, Rep.', 'Korea') ?? code}
                  stroke={color}
                  strokeWidth={code === 'IN' ? 2.5 : 1.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── India Spotlight ──────────────────────────────────────────────────── */}
      {india && (
        <div className="rounded-2xl p-5" style={{
          background: 'linear-gradient(135deg,rgba(249,115,22,0.10),rgba(91,94,244,0.06))',
          border: '1.5px solid rgba(249,115,22,0.25)',
        }}>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">🇮🇳</span>
            <div>
              <h2 className="text-sm font-black" style={{ color: 'var(--text-hi)' }}>India Spotlight</h2>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                #{indiaRank} largest economy · Fastest growing major economy {fastest?.code === 'IN' ? '🏆' : ''}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'GDP',           value: fmtGDP(india.gdp),                   color: '#f97316', sub: india.gdpYear ?? '' },
              { label: 'GDP Growth',    value: fmtPct(india.gdpGrowth),              color: growthColor(india.gdpGrowth), sub: 'Annual rate' },
              { label: 'Inflation',     value: fmtPct(india.inflation),              color: inflColor(india.inflation), sub: 'CPI' },
              { label: 'GDP / Capita',  value: fmtCap(india.gdpPerCapita),           color: '#8b5cf6', sub: 'Current USD' },
              { label: 'Unemployment',  value: india.unemployment != null ? `${india.unemployment.toFixed(2)}%` : '—', color: '#06b6d4', sub: 'ILO estimate' },
              { label: 'Exports % GDP', value: india.exports != null ? `${india.exports.toFixed(1)}%` : '—', color: '#10b981', sub: 'Trade openness' },
              { label: 'FDI % GDP',     value: india.fdi != null ? `${india.fdi.toFixed(2)}%` : '—', color: '#eab308', sub: 'Net inflows' },
              { label: 'Gov. Debt',     value: india.govDebt != null ? `${india.govDebt.toFixed(1)}%` : '—', color: '#f43f5e', sub: '% of GDP' },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-sm)' }}>
                <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                <p className="text-sm font-black" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.sub}</p>
              </div>
            ))}
          </div>

          {/* India vs peers comparison bar */}
          <div className="mt-4">
            <p className="text-[10px] font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>India vs Peers — GDP Growth Rate (%)</p>
            <div className="space-y-1.5">
              {gdpRanking
                .filter(c => c.gdpGrowth != null)
                .sort((a, b) => (b.gdpGrowth ?? 0) - (a.gdpGrowth ?? 0))
                .map(c => {
                  const maxGrowth = 10;
                  const width = Math.max(0, ((c.gdpGrowth ?? 0) / maxGrowth) * 100);
                  return (
                    <div key={c.code} className="flex items-center gap-2">
                      <span className="text-sm w-5 shrink-0">{FLAGS[c.code]}</span>
                      <span className="text-[10px] w-14 shrink-0 font-semibold"
                        style={{ color: c.code === 'IN' ? '#f97316' : 'var(--text-muted)' }}>
                        {c.name.split(' ')[0]}
                      </span>
                      <div className="flex-1 rounded-full h-2" style={{ background: 'var(--bg-raised)' }}>
                        <div
                          className="h-2 rounded-full transition-all duration-700"
                          style={{
                            width: `${width}%`,
                            background: c.code === 'IN'
                              ? 'linear-gradient(90deg,#f97316,#fb923c)'
                              : LINE_COLORS[c.code] ?? 'var(--brand)',
                            opacity: c.code === 'IN' ? 1 : 0.6,
                          }}
                        />
                      </div>
                      <span className="text-[10px] w-10 text-right font-bold shrink-0"
                        style={{ color: growthColor(c.gdpGrowth) }}>
                        {fmtPct(c.gdpGrowth)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ── Data Source Footer ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--text-muted)' }}>
        <span>Source: World Bank Open Data API (api.worldbank.org) · Indicators: GDP, CPI, Unemployment, FDI, Exports, Gov. Debt</span>
        <span>Cached 24h · {data.updatedAt ? new Date(data.updatedAt).toLocaleDateString() : ''}</span>
      </div>
    </div>
  );
}
