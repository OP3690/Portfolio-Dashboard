'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/* ── animated counter hook ─────────────────────────────── */
function useCountUp(target: number, duration = 1400, start = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf: number;
    const startTime = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * ease));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return val;
}

/* ── sparkline bars data ────────────────────────────────── */
const BARS = [38, 52, 44, 61, 49, 72, 58, 80, 67, 88, 76, 95];
const MINI_BARS_1 = [55, 42, 68, 50, 74, 63];
const MINI_BARS_2 = [40, 60, 35, 72, 55, 82];

/* ── feature list ───────────────────────────────────────── */
const FEATURES = [
  {
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    title: 'Live Portfolio Tracking',
    desc: 'Real-time P&L, XIRR, CAGR across all holdings',
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: 'Deep Analytics',
    desc: 'Sortino ratio, drawdown, sector heatmaps & risk metrics',
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Tax Intelligence',
    desc: 'LTCG / STCG planning with FY2024-25 tax rules',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [heroReady,    setHeroReady]    = useState(false);
  const [focusField,   setFocusField]   = useState<'email' | 'password' | null>(null);

  const AUTHORIZED_EMAIL  = 'omprakashutaha@gmail.com';
  const isAuthorizedEmail = email.toLowerCase().trim() === AUTHORIZED_EMAIL.toLowerCase();

  const totalVal  = useCountUp(4821650, 1600, heroReady);
  const gainVal   = useCountUp(3127840, 1800, heroReady);
  const gainPct   = useCountUp(185,     1800, heroReady);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;
    const checkAuth = async () => {
      const token = localStorage.getItem('authToken');
      if (token) {
        try {
          const ctrl = new AbortController();
          timer      = setTimeout(() => ctrl.abort(), 3000);
          const res  = await fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`, { signal: ctrl.signal, cache: 'no-store' });
          clearTimeout(timer);
          if (res.ok) {
            const data = await res.json();
            if (data.authenticated && mounted) { window.location.href = '/'; return; }
          }
        } catch (e: any) {
          clearTimeout(timer);
          if (e.name === 'AbortError') { localStorage.removeItem('authToken'); localStorage.removeItem('userEmail'); }
        }
      }
      if (mounted) {
        setCheckingAuth(false);
        setTimeout(() => setHeroReady(true), 200);
      }
    };
    checkAuth();
    return () => { mounted = false; clearTimeout(timer); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isAuthorizedEmail) { setError('You are not authorized to access this dashboard.'); return; }
    if (!email.includes('@')) { setError('Enter a valid email address.'); return; }
    if (password.length < 3)  { setError('Password must be at least 3 characters.'); return; }
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('userEmail', email);
        await new Promise(r => setTimeout(r, 300));
        router.push('/');
      } else setError(data.error || 'Invalid credentials. Please try again.');
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number) => {
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
    if (n >= 100000)   return `₹${(n / 100000).toFixed(2)}L`;
    return `₹${n.toLocaleString('en-IN')}`;
  };

  /* Loading screen */
  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-page)' }}>
        <div className="text-center space-y-4">
          <div className="relative w-14 h-14 mx-auto">
            <div className="absolute inset-0 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--brand) transparent transparent transparent' }} />
            <div className="absolute inset-2 rounded-full" style={{ background: 'var(--brand-bg)' }} />
          </div>
          <p className="text-sm font-semibold text-lo">Verifying session…</p>
        </div>
      </div>
    );
  }

  const canSubmit = !loading && !!email && !!password && isAuthorizedEmail;

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-page)' }}>

      {/* ══════════════════════════════════════════════════
          LEFT PANEL — hero / brand
      ══════════════════════════════════════════════════ */}
      <div className="hidden lg:flex flex-col w-[52%] relative overflow-hidden"
        style={{ background: 'linear-gradient(150deg,#1e1b4b 0%,#312e81 40%,#1e3a5f 100%)' }}>

        {/* ── Ambient blobs ── */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full blur-[100px] opacity-30"
            style={{ background: '#818cf8' }} />
          <div className="absolute top-1/2 -right-20 w-72 h-72 rounded-full blur-[80px] opacity-20"
            style={{ background: '#34d399' }} />
          <div className="absolute bottom-0 left-1/3 w-60 h-60 rounded-full blur-[90px] opacity-20"
            style={{ background: '#a78bfa' }} />
          {/* Dot grid */}
          <div className="absolute inset-0 opacity-[0.06]"
            style={{ backgroundImage: 'radial-gradient(circle,#fff 1px,transparent 1px)', backgroundSize: '28px 28px' }} />
        </div>

        {/* ── Top bar ── */}
        <div className="relative z-10 flex items-center gap-3 px-10 pt-10">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.25)', boxShadow: '0 4px 20px rgba(91,94,244,0.4)' }}>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">Portfolio Dashboard</p>
            <p className="text-[10px] font-semibold tracking-widest" style={{ color: 'rgba(255,255,255,0.45)' }}>INVESTMENT ANALYTICS</p>
          </div>
        </div>

        {/* ── Main hero content ── */}
        <div className="relative z-10 flex-1 flex flex-col justify-center px-10 py-8 space-y-8">

          {/* Headline */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.6)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Private · Secure · Real-time
            </div>
            <h1 className="text-5xl font-black leading-[1.1] text-white">
              Your Complete<br />
              <span style={{ background: 'linear-gradient(90deg,#a5b4fc,#6ee7b7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Portfolio Intelligence
              </span>
            </h1>
            <p className="text-sm leading-relaxed max-w-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Advanced analytics, risk intelligence, and deep insights — all in one place for your investment portfolio.
            </p>
          </div>

          {/* Floating portfolio card */}
          <div className="rounded-2xl p-5 relative overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.13)',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
              transform: heroReady ? 'translateY(0)' : 'translateY(16px)',
              opacity: heroReady ? 1 : 0,
              transition: 'all 0.7s cubic-bezier(0.22,1,0.36,1)',
            }}>
            {/* card glow */}
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-30"
              style={{ background: '#34d399' }} />

            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'rgba(255,255,255,0.45)' }}>Total Portfolio Value</p>
                <p className="text-3xl font-black text-white mt-0.5 tabular-nums">{fmt(totalVal)}</p>
              </div>
              <div className="px-2.5 py-1 rounded-lg text-xs font-bold" style={{ background: 'rgba(52,211,153,0.2)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.3)' }}>
                +{gainPct}%
              </div>
            </div>

            <div className="flex items-baseline gap-1.5 mb-4">
              <span className="text-sm font-bold" style={{ color: '#6ee7b7' }}>+{fmt(gainVal)}</span>
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>total return</span>
            </div>

            {/* Sparkline */}
            <div className="flex items-end gap-1 h-10">
              {BARS.map((h, i) => (
                <div key={i} className="flex-1 rounded-sm"
                  style={{
                    height: `${h}%`,
                    background: i >= 9 ? 'rgba(110,231,183,0.9)' : 'rgba(255,255,255,0.18)',
                    boxShadow: i >= 9 ? '0 0 8px rgba(110,231,183,0.5)' : 'none',
                    transform: heroReady ? 'scaleY(1)' : 'scaleY(0)',
                    transformOrigin: 'bottom',
                    transition: `transform ${0.4 + i * 0.04}s cubic-bezier(0.22,1,0.36,1) ${heroReady ? 0.3 + i * 0.03 : 0}s`,
                  }} />
              ))}
            </div>
          </div>

          {/* Mini metric cards row */}
          <div className="grid grid-cols-2 gap-3"
            style={{
              transform: heroReady ? 'translateY(0)' : 'translateY(20px)',
              opacity: heroReady ? 1 : 0,
              transition: 'all 0.8s cubic-bezier(0.22,1,0.36,1) 0.2s',
            }}>
            {/* Card A — Today's momentum */}
            <div className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <p className="text-[9px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Win Rate</p>
              <div className="flex items-center gap-1 mb-2">
                <span className="text-lg font-black text-white">73%</span>
                <span className="text-[9px]" style={{ color: '#6ee7b7' }}>↑ Consistent</span>
              </div>
              <div className="flex items-end gap-0.5 h-5">
                {MINI_BARS_1.map((h, i) => (
                  <div key={i} className="flex-1 rounded-[2px]"
                    style={{ height: `${h}%`, background: i === 5 ? '#6ee7b7' : 'rgba(255,255,255,0.2)' }} />
                ))}
              </div>
            </div>
            {/* Card B — Sectors */}
            <div className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <p className="text-[9px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Risk Score</p>
              <div className="flex items-center gap-1 mb-2">
                <span className="text-lg font-black text-white">76</span>
                <span className="text-[9px]" style={{ color: '#a5b4fc' }}>/ 100 Healthy</span>
              </div>
              <div className="flex items-end gap-0.5 h-5">
                {MINI_BARS_2.map((h, i) => (
                  <div key={i} className="flex-1 rounded-[2px]"
                    style={{ height: `${h}%`, background: i === 5 ? '#a5b4fc' : 'rgba(255,255,255,0.2)' }} />
                ))}
              </div>
            </div>
          </div>

          {/* Feature list */}
          <div className="space-y-3"
            style={{
              transform: heroReady ? 'translateY(0)' : 'translateY(20px)',
              opacity: heroReady ? 1 : 0,
              transition: 'all 0.9s cubic-bezier(0.22,1,0.36,1) 0.3s',
            }}>
            {FEATURES.map((f, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: 'rgba(165,180,252,0.15)', color: '#a5b4fc' }}>
                  {f.icon}
                </div>
                <div>
                  <p className="text-xs font-bold text-white leading-tight">{f.title}</p>
                  <p className="text-[10px] leading-relaxed mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div className="relative z-10 px-10 pb-8">
          <div className="flex items-center gap-4">
            {['256-bit Encrypted', 'Private Access', 'No Data Sharing'].map(t => (
              <div key={t} className="flex items-center gap-1.5">
                <svg className="w-3 h-3" style={{ color: '#6ee7b7' }} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          RIGHT PANEL — login form
      ══════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 relative"
        style={{ background: 'var(--bg-page)' }}>

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 mb-10 self-start">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--brand)', boxShadow: '0 4px 16px var(--brand-glow)' }}>
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-hi)' }}>Portfolio Dashboard</p>
        </div>

        <div className="w-full max-w-[400px] animate-fadeIn">

          {/* ── Form card ── */}
          <div className="rounded-3xl p-8"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-md)',
              boxShadow: 'var(--shadow-xl)',
            }}>

            {/* Header */}
            <div className="mb-7">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-glow)' }}>
                <svg className="w-6 h-6" style={{ color: 'var(--brand)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h2 className="text-2xl font-black" style={{ color: 'var(--text-hi)' }}>Welcome back</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-lo)' }}>Sign in to your investment dashboard</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Email field */}
              <div>
                <label className="block text-xs font-bold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: focusField === 'email' ? 'var(--brand)' : 'var(--text-muted)', transition: 'color .15s' }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                    onFocus={() => setFocusField('email')}
                    onBlur={() => setFocusField(null)}
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="form-input pl-10"
                    style={{
                      outline: 'none',
                      boxShadow: focusField === 'email' ? '0 0 0 3px var(--brand-bg), 0 0 0 1px var(--brand)' : 'none',
                      borderColor: focusField === 'email' ? 'var(--brand)' : undefined,
                      transition: 'box-shadow .15s, border-color .15s',
                    }}
                  />
                </div>
              </div>

              {/* Unauthorized email warning */}
              {email && !isAuthorizedEmail && (
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold"
                  style={{ background: 'var(--warn-bg)', border: '1px solid color-mix(in srgb,var(--warn) 30%,transparent)', color: 'var(--warn)' }}>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  Unauthorized email address
                </div>
              )}

              {/* Password field */}
              <div>
                <label className="block text-xs font-bold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Password
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: focusField === 'password' ? 'var(--brand)' : 'var(--text-muted)', transition: 'color .15s' }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                    onFocus={() => setFocusField('password')}
                    onBlur={() => setFocusField(null)}
                    required
                    disabled={!isAuthorizedEmail}
                    autoComplete="current-password"
                    placeholder={isAuthorizedEmail ? '••••••••' : 'Enter email first'}
                    className="form-input pl-10 pr-11"
                    style={{
                      opacity: !isAuthorizedEmail ? 0.5 : 1,
                      cursor: !isAuthorizedEmail ? 'not-allowed' : 'auto',
                      outline: 'none',
                      boxShadow: focusField === 'password' ? '0 0 0 3px var(--brand-bg), 0 0 0 1px var(--brand)' : 'none',
                      borderColor: focusField === 'password' ? 'var(--brand)' : undefined,
                      transition: 'box-shadow .15s, border-color .15s',
                    }}
                  />
                  {isAuthorizedEmail && (
                    <button type="button" tabIndex={-1}
                      onClick={() => setShowPassword(s => !s)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-mid)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                      {showPassword
                        ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      }
                    </button>
                  )}
                </div>
              </div>

              {/* Error banner */}
              {error && (
                <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold"
                  style={{ background: 'var(--loss-bg)', border: '1px solid var(--loss-border)', color: 'var(--loss)' }}>
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full py-3.5 rounded-2xl text-sm font-black flex items-center justify-center gap-2 mt-2"
                style={{
                  background: canSubmit
                    ? 'linear-gradient(135deg,var(--brand),var(--brand-dark))'
                    : 'var(--bg-raised)',
                  color: canSubmit ? '#fff' : 'var(--text-muted)',
                  boxShadow: canSubmit ? '0 4px 24px var(--brand-glow), 0 1px 0 rgba(255,255,255,0.15) inset' : 'none',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  border: canSubmit ? 'none' : '1px solid var(--border-md)',
                  transition: 'all .2s ease',
                  transform: canSubmit ? 'translateY(0)' : undefined,
                }}>
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign In
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Security footer */}
          <div className="mt-5 flex items-center justify-center gap-5">
            {[
              { icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', label: 'Secured' },
              { icon: 'M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207', label: 'Private' },
              { icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', label: 'Encrypted' },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                </svg>
                <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
