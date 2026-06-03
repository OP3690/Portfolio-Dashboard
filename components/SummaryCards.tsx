'use client';

import { useEffect, useRef, useState } from 'react';
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

/* Animated counter */
function useCountUp(target: number, duration = 1100) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const start   = performance.now();
    const animate = (now: number) => {
      const t     = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);
  return value;
}

function MetricCard({
  label, value, isPercent = false, isPositive, icon,
  accentVar, delay = 0, subBadge,
}: {
  label: string;
  value: number;
  isPercent?: boolean;
  isPositive: boolean;
  icon: React.ReactNode;
  accentVar: string;
  delay?: number;
  subBadge?: React.ReactNode;
}) {
  const animated  = useCountUp(Math.abs(value));
  const hasSign   = label !== 'Current Value' && label !== 'Total Invested';
  const sign      = value >= 0 ? '+' : '−';
  const displayVal = isPercent
    ? `${hasSign ? sign : ''}${animated.toFixed(2)}%`
    : hasSign
      ? `${sign}${formatCurrency(animated)}`
      : formatCurrency(animated);

  return (
    <div
      className="animate-fadeIn card relative overflow-hidden cursor-default select-none"
      style={{ animationDelay: `${delay}ms`, padding: '1.25rem' }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform   = 'translateY(-3px)';
        el.style.boxShadow   = 'var(--shadow-lg)';
        el.style.borderColor = `var(${accentVar})`;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform   = 'translateY(0)';
        el.style.boxShadow   = 'var(--shadow-sm)';
        el.style.borderColor = 'var(--border-md)';
      }}
    >
      {/* Ambient corner glow */}
      <div
        className="absolute -top-8 -right-8 w-28 h-28 rounded-full pointer-events-none blur-3xl"
        style={{ background: `var(${accentVar})`, opacity: 0.14 }}
      />

      {/* Header row: label + icon */}
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `color-mix(in srgb, var(${accentVar}) 12%, transparent)`,
            border: `1px solid color-mix(in srgb, var(${accentVar}) 22%, transparent)`,
            color: `var(${accentVar})`,
          }}
        >
          {icon}
        </div>
      </div>

      {/* Value row */}
      <div className="flex items-baseline gap-2 flex-wrap min-h-[2rem]">
        <p
          className="text-2xl font-black tracking-tight metric-value leading-none"
          style={{ color: hasSign ? (isPositive ? 'var(--gain)' : 'var(--loss)') : 'var(--text-hi)' }}
        >
          {displayVal}
        </p>
        {subBadge}
      </div>

      {/* Accent divider */}
      <div
        className="mt-4 h-[2px] rounded-full"
        style={{
          background: `linear-gradient(90deg, var(${accentVar}) 0%, transparent 100%)`,
          opacity: 0.5,
        }}
      />
    </div>
  );
}

export default function SummaryCards({ summary }: SummaryCardsProps) {
  // Clamp display to ±500% — the Newton-Raphson solver already bounds output,
  // but guard here too so any stale cached value never shows 4M%
  const xirr = Math.max(-99.9, Math.min(500, summary.xirr ?? 0));
  const doublingYears = xirr > 0 ? Math.log(2) / Math.log(1 + xirr / 100) : null;

  const DoublingBadge = doublingYears ? (
    <span className="inline-flex items-baseline gap-1.5 leading-none">
      <span className="text-xl font-thin select-none" style={{ color: 'var(--border-lg)' }}>|</span>
      <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-lo)' }}>
        Doubles in:
      </span>
      <span className="text-[15px] font-black" style={{ color: 'var(--info)' }}>
        {doublingYears.toFixed(1)} Yrs
      </span>
    </span>
  ) : null;

  const cards = [
    {
      label: 'Current Value',
      value: summary.currentValue,
      isPercent: false,
      isPositive: true,
      accentVar: '--brand',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'Total Invested',
      value: summary.totalInvested,
      isPercent: false,
      isPositive: true,
      accentVar: '--info',
      subBadge: DoublingBadge,
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      label: 'Total P&L',
      value: summary.totalProfitLoss,
      isPercent: false,
      isPositive: summary.totalProfitLoss >= 0,
      accentVar: summary.totalProfitLoss >= 0 ? '--gain' : '--loss',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d={summary.totalProfitLoss >= 0
              ? 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6'
              : 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6'} />
        </svg>
      ),
    },
    {
      label: 'XIRR',
      value: summary.xirr,
      isPercent: true,
      isPositive: summary.xirr >= 0,
      accentVar: summary.xirr >= 0 ? '--gain' : '--loss',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      label: 'Total Return %',
      value: summary.totalReturnPercent,
      isPercent: true,
      isPositive: summary.totalReturnPercent >= 0,
      accentVar: summary.totalReturnPercent >= 0 ? '--gain' : '--loss',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
      ),
    },
    {
      label: 'Realized P&L',
      value: summary.totalRealizedPL,
      isPercent: false,
      isPositive: summary.totalRealizedPL >= 0,
      accentVar: summary.totalRealizedPL >= 0 ? '--gain' : '--loss',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
      {cards.map((card, i) => (
        <MetricCard key={card.label} {...(card as any)} delay={i * 55} />
      ))}
    </div>
  );
}
