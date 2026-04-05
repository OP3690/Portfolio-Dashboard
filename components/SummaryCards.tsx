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

/* Animated counter hook */
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

function MetricCard({ label, value, isPercent = false, isPositive, icon, accentColor, delay = 0 }: {
  label: string; value: number; isPercent?: boolean; isPositive: boolean;
  icon: React.ReactNode; accentColor: string; delay?: number;
}) {
  const animated = useCountUp(Math.abs(value));
  const hasSign  = label !== 'Current Value' && label !== 'Total Invested';
  const sign     = value >= 0 ? '+' : '−';
  const displayVal = isPercent
    ? `${hasSign ? sign : ''}${animated.toFixed(2)}%`
    : hasSign ? `${sign}${formatCurrency(animated)}` : formatCurrency(animated);
  const numColor = hasSign ? (isPositive ? '#10b981' : '#f43f5e') : '#f0f4ff';

  return (
    <div
      className="animate-fadeIn relative overflow-hidden rounded-2xl p-5 cursor-default select-none"
      style={{
        animationDelay: `${delay}ms`,
        background: 'linear-gradient(145deg, #1a2240 0%, #0f1629 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform   = 'translateY(-3px)';
        el.style.boxShadow   = `0 14px 40px rgba(0,0,0,0.55), 0 0 0 1px ${accentColor}35`;
        el.style.borderColor = `${accentColor}40`;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform   = 'translateY(0)';
        el.style.boxShadow   = '0 4px 24px rgba(0,0,0,0.4)';
        el.style.borderColor = 'rgba(255,255,255,0.07)';
      }}
    >
      {/* Ambient glow */}
      <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full pointer-events-none blur-2xl opacity-20"
        style={{ background: accentColor }} />

      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: '#4b5d78' }}>{label}</p>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${accentColor}15`, border: `1px solid ${accentColor}28` }}>
          <span style={{ color: accentColor }}>{icon}</span>
        </div>
      </div>

      <p className="text-2xl font-black tracking-tight font-mono leading-none" style={{ color: numColor }}>
        {displayVal}
      </p>

      <div className="mt-4 h-[2px] rounded-full"
        style={{ background: `linear-gradient(90deg, ${accentColor}70 0%, transparent 100%)` }} />
    </div>
  );
}

export default function SummaryCards({ summary }: SummaryCardsProps) {
  const cards = [
    {
      label: 'Current Value', value: summary.currentValue, isPercent: false, isPositive: true,
      accentColor: '#3b82f6',
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>,
    },
    {
      label: 'Total Invested', value: summary.totalInvested, isPercent: false, isPositive: true,
      accentColor: '#8b5cf6',
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>,
    },
    {
      label: 'Total P&L', value: summary.totalProfitLoss, isPercent: false,
      isPositive: summary.totalProfitLoss >= 0,
      accentColor: summary.totalProfitLoss >= 0 ? '#10b981' : '#f43f5e',
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d={summary.totalProfitLoss >= 0 ? 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' : 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6'} />
      </svg>,
    },
    {
      label: 'XIRR', value: summary.xirr, isPercent: true,
      isPositive: summary.xirr >= 0,
      accentColor: summary.xirr >= 0 ? '#10b981' : '#f43f5e',
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>,
    },
    {
      label: 'Total Return %', value: summary.totalReturnPercent, isPercent: true,
      isPositive: summary.totalReturnPercent >= 0,
      accentColor: summary.totalReturnPercent >= 0 ? '#10b981' : '#f43f5e',
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>,
    },
    {
      label: 'Realized P&L', value: summary.totalRealizedPL, isPercent: false,
      isPositive: summary.totalRealizedPL >= 0,
      accentColor: summary.totalRealizedPL >= 0 ? '#10b981' : '#f43f5e',
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
      {cards.map((card, i) => (
        <MetricCard key={card.label} {...card} delay={i * 55} />
      ))}
    </div>
  );
}
