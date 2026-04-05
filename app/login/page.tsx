'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const STATS = [
  { label: 'Portfolio Tracking',  value: 'Real-time' },
  { label: 'Analytics',           value: 'Advanced'  },
  { label: 'Data Refresh',        value: 'Daily'     },
];

export default function LoginPage() {
  const router = useRouter();
  const [email,         setEmail]         = useState('');
  const [password,      setPassword]      = useState('');
  const [showPassword,  setShowPassword]  = useState(false);
  const [error,         setError]         = useState('');
  const [loading,       setLoading]       = useState(false);
  const [checkingAuth,  setCheckingAuth]  = useState(true);

  const AUTHORIZED_EMAIL  = 'omprakashutaha@gmail.com';
  const isAuthorizedEmail = email.toLowerCase().trim() === AUTHORIZED_EMAIL.toLowerCase();

  useEffect(() => {
    let mounted     = true;
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
      if (mounted) setCheckingAuth(false);
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

  /* Loading screen while checking auth */
  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0f1e' }}>
        <div className="text-center space-y-4">
          <div className="relative w-14 h-14 mx-auto">
            <div className="absolute inset-0 rounded-full border-2 border-t-emerald-400 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            <div className="absolute inset-2 rounded-full" style={{ background: 'rgba(16,185,129,0.15)' }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: '#4b5d78' }}>Verifying session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#0a0f1e' }}>

      {/* ─── LEFT PANEL (hero) ─────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f1629 0%, #0a0f1e 100%)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>

        {/* Background decoration */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full blur-3xl opacity-15" style={{ background: '#10b981' }} />
          <div className="absolute bottom-1/3 right-1/4 w-48 h-48 rounded-full blur-3xl opacity-10" style={{ background: '#3b82f6' }} />
          {/* Grid dots */}
          <div className="absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        </div>

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#10b981,#3b82f6)', boxShadow: '0 0 24px rgba(16,185,129,0.35)' }}>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-white">Portfolio Dashboard</p>
            <p className="text-[10px] font-semibold" style={{ color: '#10b981' }}>INVESTMENT ANALYTICS</p>
          </div>
        </div>

        {/* Hero content */}
        <div className="relative z-10 space-y-6">
          <div>
            <h1 className="text-4xl font-black text-white leading-tight">
              Your Complete<br />
              <span style={{ background: 'linear-gradient(135deg,#10b981,#3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                Portfolio Intelligence
              </span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: '#64748b' }}>
              Real-time tracking, advanced analytics, and intelligent insights for your investment portfolio.
            </p>
          </div>

          {/* Stat pills */}
          <div className="flex flex-wrap gap-3">
            {STATS.map(s => (
              <div key={s.label} className="px-4 py-2 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-xs font-semibold text-white">{s.value}</p>
                <p className="text-[10px]" style={{ color: '#4b5d78' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Mini chart illustration */}
          <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-end gap-1.5 h-16">
              {[40, 55, 35, 70, 50, 85, 65, 90, 75, 95, 80, 100].map((h, i) => (
                <div key={i} className="flex-1 rounded-sm transition-all duration-500"
                  style={{
                    height: `${h}%`,
                    background: i >= 9 ? 'linear-gradient(180deg,#10b981,#059669)' : 'rgba(16,185,129,0.25)',
                    boxShadow: i >= 9 ? '0 0 8px rgba(16,185,129,0.5)' : 'none',
                  }} />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px #10b981' }} />
              <p className="text-[10px] font-semibold" style={{ color: '#10b981' }}>Portfolio trending up</p>
            </div>
          </div>
        </div>

        {/* Footer text */}
        <div className="relative z-10">
          <p className="text-xs" style={{ color: '#1e293b' }}>
            © 2026 Portfolio Dashboard · Secure · Private
          </p>
        </div>
      </div>

      {/* ─── RIGHT PANEL (login form) ─────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm animate-fadeIn">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#10b981,#3b82f6)' }}>
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-white">Portfolio Dashboard</p>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-black text-white">Welcome back</h2>
            <p className="text-sm mt-1" style={{ color: '#4b5d78' }}>Sign in to your portfolio</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-bold mb-1.5 uppercase tracking-wider" style={{ color: '#4b5d78' }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 outline-none"
                style={{
                  background: '#161e35',
                  border: `1px solid ${error && !email ? '#f43f5e' : 'rgba(255,255,255,0.1)'}`,
                  color: '#f0f4ff',
                }}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#10b981'; (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(16,185,129,0.12)'; }}
                onBlur={e  => { (e.target as HTMLInputElement).style.borderColor = error && !email ? '#f43f5e' : 'rgba(255,255,255,0.1)'; (e.target as HTMLInputElement).style.boxShadow = 'none'; }}
              />
            </div>

            {/* Unauthorized warning */}
            {email && !isAuthorizedEmail && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}>
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                Unauthorized email address
              </div>
            )}

            {/* Password */}
            <div>
              <label className="block text-xs font-bold mb-1.5 uppercase tracking-wider" style={{ color: '#4b5d78' }}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  required
                  disabled={!isAuthorizedEmail}
                  autoComplete="current-password"
                  placeholder={isAuthorizedEmail ? '••••••••' : 'Enter email first'}
                  className="w-full px-4 py-3 pr-12 rounded-xl text-sm font-medium transition-all duration-200 outline-none"
                  style={{
                    background: !isAuthorizedEmail ? 'rgba(255,255,255,0.02)' : '#161e35',
                    border: `1px solid ${error && !password ? '#f43f5e' : 'rgba(255,255,255,0.1)'}`,
                    color: !isAuthorizedEmail ? '#334155' : '#f0f4ff',
                    cursor: !isAuthorizedEmail ? 'not-allowed' : 'auto',
                  }}
                  onFocus={e => { if (isAuthorizedEmail) { (e.target as HTMLInputElement).style.borderColor = '#10b981'; (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(16,185,129,0.12)'; } }}
                  onBlur={e  => { (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.1)'; (e.target as HTMLInputElement).style.boxShadow = 'none'; }}
                />
                {isAuthorizedEmail && (
                  <button type="button" tabIndex={-1}
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: '#4b5d78' }}>
                    {showPassword
                      ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    }
                  </button>
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: '#f43f5e' }}>
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email || !password || !isAuthorizedEmail}
              className="w-full py-3.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all duration-200 mt-2"
              style={{
                background: loading || !email || !password || !isAuthorizedEmail
                  ? 'rgba(255,255,255,0.04)'
                  : 'linear-gradient(135deg,#10b981,#059669)',
                color: loading || !email || !password || !isAuthorizedEmail ? '#334155' : '#fff',
                boxShadow: !loading && email && password && isAuthorizedEmail
                  ? '0 4px 20px rgba(16,185,129,0.4)'
                  : 'none',
                cursor: loading || !isAuthorizedEmail ? 'not-allowed' : 'pointer',
              }}
            >
              {loading
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Signing in…</>
                : <>Sign In<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg></>
              }
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 flex items-center justify-center gap-2 text-xs" style={{ color: '#1e293b' }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Secured · Private · Encrypted
          </div>
        </div>
      </div>
    </div>
  );
}
