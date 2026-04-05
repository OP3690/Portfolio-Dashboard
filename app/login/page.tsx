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

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-page)' }}>

      {/* ─── LEFT PANEL (hero) ─────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-5/12 p-12 relative overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, var(--brand-dark) 0%, #312e81 100%)',
          borderRight: '1px solid var(--border-md)',
        }}>

        {/* Background decorations */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full blur-3xl opacity-25"
            style={{ background: 'var(--brand-light)' }} />
          <div className="absolute bottom-1/3 right-1/4 w-56 h-56 rounded-full blur-3xl opacity-15"
            style={{ background: 'var(--gain)' }} />
          <div className="absolute inset-0 opacity-[0.05]"
            style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        </div>

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-white">Portfolio Dashboard</p>
            <p className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>INVESTMENT ANALYTICS</p>
          </div>
        </div>

        {/* Hero content */}
        <div className="relative z-10 space-y-7">
          <div>
            <h1 className="text-4xl font-black text-white leading-tight">
              Your Complete<br />
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>Portfolio Intelligence</span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Real-time tracking, advanced analytics, and intelligent insights for your investment portfolio.
            </p>
          </div>

          {/* Stat pills */}
          <div className="flex flex-wrap gap-3">
            {STATS.map(s => (
              <div key={s.label} className="px-4 py-2.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
                <p className="text-xs font-bold text-white">{s.value}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Mini chart illustration */}
          <div className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)' }}>
            <div className="flex items-end gap-1.5 h-16">
              {[40, 55, 35, 70, 50, 85, 65, 90, 75, 95, 80, 100].map((h, i) => (
                <div key={i} className="flex-1 rounded-sm"
                  style={{
                    height: `${h}%`,
                    background: i >= 9 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)',
                    boxShadow: i >= 9 ? '0 0 10px rgba(255,255,255,0.4)' : 'none',
                  }} />
              ))}
            </div>
            <div className="mt-2.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white opacity-80" />
              <p className="text-[10px] font-semibold text-white opacity-70">Portfolio trending up</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
            © 2026 Portfolio Dashboard · Secure · Private
          </p>
        </div>
      </div>

      {/* ─── RIGHT PANEL (login form) ─────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm animate-fadeIn">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--brand)', boxShadow: '0 4px 14px var(--brand-glow)' }}>
              <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-hi">Portfolio Dashboard</p>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-black text-hi">Welcome back</h2>
            <p className="text-sm mt-1 text-lo">Sign in to your portfolio</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-bold mb-1.5 uppercase tracking-wider text-lo">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="form-input"
              />
            </div>

            {/* Unauthorized warning */}
            {email && !isAuthorizedEmail && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold"
                style={{ background: 'var(--warn-bg)', border: '1px solid color-mix(in srgb, var(--warn) 30%, transparent)', color: 'var(--warn)' }}>
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                Unauthorized email address
              </div>
            )}

            {/* Password */}
            <div>
              <label className="block text-xs font-bold mb-1.5 uppercase tracking-wider text-lo">
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
                  className="form-input pr-12"
                  style={{ opacity: !isAuthorizedEmail ? 0.5 : 1, cursor: !isAuthorizedEmail ? 'not-allowed' : 'auto' }}
                />
                {isAuthorizedEmail && (
                  <button type="button" tabIndex={-1}
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-lo hover:text-mid transition-colors">
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
                style={{ background: 'var(--loss-bg)', border: '1px solid var(--loss-border)', color: 'var(--loss)' }}>
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
              className="btn w-full py-3.5 text-sm font-black mt-2"
              style={{
                background: loading || !email || !password || !isAuthorizedEmail
                  ? 'var(--bg-raised)'
                  : 'var(--brand)',
                color: loading || !email || !password || !isAuthorizedEmail
                  ? 'var(--text-muted)'
                  : '#fff',
                boxShadow: !loading && email && password && isAuthorizedEmail
                  ? '0 4px 20px var(--brand-glow)'
                  : 'none',
                cursor: loading || !isAuthorizedEmail ? 'not-allowed' : 'pointer',
                border: '1px solid var(--border-md)',
              }}
            >
              {loading
                ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Signing in…</>
                : <>Sign In<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg></>
              }
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-muted">
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
