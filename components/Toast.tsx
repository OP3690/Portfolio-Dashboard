'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type, isVisible, onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(() => onClose(), duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  if (!isVisible || typeof window === 'undefined') return null;

  const config = {
    success: { bg: 'var(--gain-bg)',   border: 'var(--gain-border)',   color: 'var(--gain)',  icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    error:   { bg: 'var(--loss-bg)',   border: 'var(--loss-border)',   color: 'var(--loss)',  icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' },
    info:    { bg: 'var(--brand-bg)',  border: 'var(--brand-glow)',    color: 'var(--brand)', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  }[type];

  return createPortal(
    <div className="fixed top-4 right-4 z-50 animate-slideInRight">
      <div className="flex items-start gap-3 px-4 py-3.5 rounded-2xl min-w-[300px] max-w-[480px]"
        style={{
          background: config.bg,
          border: `1px solid ${config.border}`,
          boxShadow: 'var(--shadow-lg)',
          backdropFilter: 'blur(12px)',
        }}>
        <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
          style={{ color: config.color }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={config.icon} />
        </svg>
        <p className="flex-1 text-sm font-medium" style={{ color: 'var(--text-hi)' }}>{message}</p>
        <button onClick={onClose} className="shrink-0 transition-opacity opacity-60 hover:opacity-100"
          style={{ color: 'var(--text-hi)' }} aria-label="Close">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>,
    document.body
  );
}
