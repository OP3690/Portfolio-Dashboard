'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  
  const AUTHORIZED_EMAIL = 'omprakashutaha@gmail.com';
  const isAuthorizedEmail = email.toLowerCase().trim() === AUTHORIZED_EMAIL.toLowerCase();

  // Check if already authenticated
  useEffect(() => {
    let isMounted = true;
    let redirectTimeout: NodeJS.Timeout;
    
    const checkAuth = async () => {
      const token = localStorage.getItem('authToken');
      if (token) {
        try {
          const controller = new AbortController();
          redirectTimeout = setTimeout(() => controller.abort(), 3000); // 3 second timeout
          
          const response = await fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`, {
            signal: controller.signal,
            cache: 'no-store'
          });
          clearTimeout(redirectTimeout);
          
          if (response.ok) {
            const data = await response.json();
            if (data.authenticated && isMounted) {
              // Use window.location for hard redirect to prevent loops
              window.location.href = '/';
              return;
            }
          }
        } catch (err: any) {
          clearTimeout(redirectTimeout);
          // If it's an abort error, token might be invalid - clear it
          if (err.name === 'AbortError') {
            localStorage.removeItem('authToken');
            localStorage.removeItem('userEmail');
          }
          // Not authenticated, continue to login page
        }
      }
      if (isMounted) {
        setCheckingAuth(false);
      }
    };
    
    checkAuth();
    
    return () => {
      isMounted = false;
      if (redirectTimeout) clearTimeout(redirectTimeout);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Check authorization
    if (!isAuthorizedEmail) {
      setError('You are not authorized');
      return;
    }
    
    // Client-side validation
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    
    if (!password || password.length < 3) {
      setError('Password must be at least 3 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Store auth token in localStorage
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('userEmail', email);
        
        // Small delay for better UX
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Redirect to dashboard
        router.push('/');
      } else {
        setError(data.error || 'Invalid email or password. Please try again.');
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center relative overflow-hidden">
        {/* Animated grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0a0a0a_1px,transparent_1px),linear-gradient(to_bottom,#0a0a0a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]"></div>
        <div className="text-center relative z-10">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-2 border-cyan-500/20 border-t-cyan-500 mx-auto"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 bg-cyan-500 rounded-full animate-pulse"></div>
            </div>
          </div>
          <p className="mt-6 text-cyan-400 font-mono font-medium text-sm tracking-wider">[VERIFYING_AUTHENTICATION]...</p>
          <div className="mt-2 flex items-center justify-center gap-1">
            <span className="text-green-500 font-mono text-xs">$</span>
            <span className="text-gray-400 font-mono text-xs animate-pulse">████████████</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Animated grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1a1a1a_1px,transparent_1px),linear-gradient(to_bottom,#1a1a1a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]"></div>
      
      {/* Glowing orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      
      <div className="max-w-md w-full relative z-10 animate-in fade-in duration-500">
        {/* Logo and Title */}
        <div className="text-center mb-10">
          <div className="relative inline-block mb-6">
            <div className="absolute inset-0 bg-cyan-500 rounded-lg blur-xl opacity-50 animate-pulse"></div>
            <div className="relative w-20 h-20 bg-gradient-to-br from-cyan-500 via-green-500 to-emerald-500 rounded-lg flex items-center justify-center shadow-2xl shadow-cyan-500/50 transform hover:scale-105 transition-transform duration-300 border-2 border-cyan-400/50">
              <svg className="w-10 h-10 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
          <div className="mb-2">
            <h1 className="text-4xl font-bold font-mono bg-gradient-to-r from-cyan-400 via-green-400 to-emerald-400 bg-clip-text text-transparent mb-2 tracking-tight">
              PORTFOLIO_ANALYSIS
            </h1>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="text-green-500 font-mono text-xs">$</span>
              <span className="text-cyan-400 font-mono text-xs">STOCK_MARKET_TERMINAL</span>
            </div>
          </div>
          <p className="text-gray-400 font-mono text-sm mt-4">[ACCESS_GRANTED] Welcome back, trader</p>
        </div>

        {/* Login Form */}
        <div className="bg-gray-900/90 backdrop-blur-xl rounded-lg shadow-2xl p-8 border-2 border-cyan-500/20 relative overflow-hidden">
          {/* Terminal-style top bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-green-500 to-emerald-500"></div>
          
          {/* Scanline effect */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent animate-pulse"></div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            {/* Email Field */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-mono font-semibold text-cyan-400 mb-2">
                <span className="text-green-500">$</span> EMAIL_ADDRESS
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-cyan-500 font-mono text-sm">&gt;</span>
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  required
                  className={`w-full pl-8 pr-4 py-3.5 border-2 rounded font-mono text-sm transition-all duration-200 outline-none bg-black/50 text-cyan-400 placeholder-gray-600 ${
                    error && !email
                      ? 'border-red-500/50 bg-red-900/20'
                      : emailFocused
                      ? 'border-cyan-500 bg-cyan-900/20 shadow-lg shadow-cyan-500/20'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                  placeholder="user@domain.com"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Authorization Message */}
            {email && !isAuthorizedEmail && (
              <div className="bg-yellow-900/30 border-l-4 border-yellow-500 text-yellow-400 px-4 py-3 rounded font-mono text-sm flex items-start space-x-3 animate-in slide-in-from-top duration-300">
                <span className="text-yellow-500">⚠</span>
                <p className="font-medium">[ACCESS_DENIED] Unauthorized user detected</p>
              </div>
            )}

            {/* Password Field */}
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-mono font-semibold text-cyan-400 mb-2">
                <span className="text-green-500">$</span> PASSWORD
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-cyan-500 font-mono text-sm">&gt;</span>
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  required
                  disabled={!isAuthorizedEmail}
                  className={`w-full pl-8 pr-12 py-3.5 border-2 rounded font-mono text-sm transition-all duration-200 outline-none bg-black/50 text-cyan-400 placeholder-gray-600 ${
                    !isAuthorizedEmail
                      ? 'border-gray-700 bg-gray-900/50 cursor-not-allowed opacity-60'
                      : error && !password
                      ? 'border-red-500/50 bg-red-900/20'
                      : passwordFocused
                      ? 'border-cyan-500 bg-cyan-900/20 shadow-lg shadow-cyan-500/20'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                  placeholder={isAuthorizedEmail ? "••••••••" : "[NOT_AUTHORIZED]"}
                  autoComplete="current-password"
                />
                {isAuthorizedEmail && (
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-cyan-500 hover:text-cyan-400 transition-colors"
                    tabIndex={-1}
                  >
                    <span className="font-mono text-xs">{showPassword ? '[SHOW]' : '[HIDE]'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-900/30 border-l-4 border-red-500 text-red-400 px-4 py-3 rounded font-mono text-sm flex items-start space-x-3 animate-in slide-in-from-top duration-300">
                <span className="text-red-500">✗</span>
                <p className="font-medium">[ERROR] {error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !email || !password || !isAuthorizedEmail}
              className="w-full bg-gradient-to-r from-cyan-600 via-green-600 to-emerald-600 text-black py-4 rounded font-mono font-bold text-sm hover:from-cyan-500 hover:via-green-500 hover:to-emerald-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/50 hover:shadow-xl hover:shadow-cyan-500/70 transform hover:scale-[1.02] disabled:transform-none relative overflow-hidden"
            >
              <span className="relative z-10 flex items-center justify-center">
                {loading ? (
                  <>
                    <span className="animate-pulse mr-2">[</span>
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full mr-2"></span>
                    <span>PROCESSING]</span>
                  </>
                ) : (
                  <>
                    <span>[EXECUTE_LOGIN]</span>
                    <span className="ml-2">→</span>
                  </>
                )}
              </span>
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-800 relative z-10">
            <div className="flex items-center justify-center space-x-2 text-xs text-gray-500 font-mono">
              <span className="text-green-500">[SECURED]</span>
              <span className="text-gray-600">|</span>
              <span>ENCRYPTED_CONNECTION</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

