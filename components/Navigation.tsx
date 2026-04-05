'use client';

import { useState, useRef, useEffect } from 'react';
import Toast from './Toast';
import ThemeToggle from './ThemeToggle';

interface NavigationProps {
  onUploadSuccess?: () => void;
  activeTab?: 'dashboard' | 'stock-analytics' | 'stock-research';
  onTabChange?: (tab: 'dashboard' | 'stock-analytics' | 'stock-research') => void;
}

const TABS = [
  {
    key: 'dashboard'       as const,
    label: 'Dashboard',
    icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-3a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z" /></svg>,
  },
  {
    key: 'stock-analytics' as const,
    label: 'Analytics',
    icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  },
  {
    key: 'stock-research'  as const,
    label: 'Research',
    icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" /></svg>,
  },
];

export default function Navigation({ onUploadSuccess, activeTab = 'dashboard', onTabChange }: NavigationProps) {
  const [uploading,       setUploading]       = useState(false);
  const [uploadType,      setUploadType]      = useState<'holdings' | 'stockMaster'>('holdings');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [fetchingData,    setFetchingData]    = useState(false);
  const [toast,           setToast]           = useState<{ message: string; type: 'success' | 'error' | 'info'; isVisible: boolean } | null>(null);
  const [selectedFile,    setSelectedFile]    = useState<File | null>(null);
  const [isDragging,      setIsDragging]      = useState(false);
  const [latestStockDate, setLatestStockDate] = useState<string | null>(null);
  const [mobileOpen,      setMobileOpen]      = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type, isVisible: true });
    setTimeout(() => setToast(p => p ? { ...p, isVisible: false } : null), 5000);
  };

  const fetchLatestDate = async () => {
    try {
      const r = await fetch('/api/latest-stock-date');
      const d = await r.json();
      if (d.success && d.formattedDate) setLatestStockDate(d.formattedDate);
    } catch {}
  };

  useEffect(() => { fetchLatestDate(); }, []);

  const handleRefresh = async () => {
    setFetchingData(true);
    try {
      const r = await fetch('/api/fetch-historical-data?refreshAllStocks=true', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshLatest: true }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (d.success) {
        await fetchLatestDate();
        showToast(`${d.message || `Refreshed ${d.stocksProcessed || 0} stocks`}. Reloading…`, 'success');
        setTimeout(() => onUploadSuccess ? onUploadSuccess() : window.location.reload(), 2000);
      } else throw new Error(d.error || 'Refresh failed');
    } catch (e: any) {
      showToast(e.message || 'Refresh failed', 'error');
    } finally { setFetchingData(false); }
  };

  const validateFile = (f: File) => {
    const ext = '.' + f.name.split('.').pop()?.toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) return 'Upload an Excel file (.xlsx / .xls)';
    if (f.size > 50 * 1024 * 1024) return 'File exceeds 50 MB limit';
    return null;
  };

  const processUpload = async (file: File) => {
    const err = validateFile(file);
    if (err) { showToast(err, 'error'); setSelectedFile(null); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file); form.append('fileType', uploadType);
      const r = await fetch('/api/upload', { method: 'POST', body: form });
      const d = await r.json();
      if (d.success) {
        showToast(d.count ? `${d.message} (${d.count} records)` : d.message || 'Upload successful!', 'success');
        setSelectedFile(null);
        setTimeout(() => { setShowUploadModal(false); onUploadSuccess?.(); }, 1500);
      } else showToast(d.error || 'Upload failed', 'error');
    } catch (e: any) {
      showToast(e.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const closeModal = () => {
    if (uploading) return;
    setShowUploadModal(false); setSelectedFile(null); setIsDragging(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fmtSize = (b: number) => {
    const u = ['B','KB','MB','GB'];
    const i = Math.floor(Math.log(Math.max(b,1)) / Math.log(1024));
    return `${(b / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
  };

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} isVisible={toast.isVisible} onClose={() => setToast(p => p ? { ...p, isVisible: false } : null)} />}

      {/* ── NAV BAR ─────────────────────── */}
      <nav className="sticky top-0 z-40"
        style={{
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-md)',
          boxShadow: 'var(--shadow-xs)',
        }}>
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 gap-4">

            {/* LOGO */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)', boxShadow: '0 4px 12px rgba(99,102,241,0.35)' }}>
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold leading-none" style={{ color: 'var(--text-hi)' }}>Portfolio</p>
                <p className="text-[10px] font-semibold leading-none mt-0.5 gradient-text">DASHBOARD</p>
              </div>
            </div>

            {/* TABS — desktop */}
            <div className="hidden md:flex items-center gap-0.5 p-1 rounded-xl"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)' }}>
              {TABS.map(tab => {
                const active = activeTab === tab.key;
                return (
                  <button key={tab.key} onClick={() => onTabChange?.(tab.key)}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 no-select"
                    style={active
                      ? { background: 'var(--brand)', color: '#fff', boxShadow: '0 4px 12px var(--brand-glow)' }
                      : { color: 'var(--text-lo)' }}>
                    {tab.icon}
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* RIGHT ACTIONS */}
            <div className="flex items-center gap-1.5">
              {/* Date pill */}
              {latestStockDate && (
                <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                  style={{ background: 'var(--gain-bg)', border: '1px solid var(--gain-border)', color: 'var(--gain)' }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'var(--gain)', boxShadow: '0 0 5px var(--gain)' }} />
                  {latestStockDate}
                </div>
              )}

              <ThemeToggle />

              {/* Refresh */}
              <button onClick={handleRefresh} disabled={fetchingData} title="Refresh stock data"
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors btn"
                style={{ background: 'var(--gain-bg)', border: '1px solid var(--gain-border)', color: 'var(--gain)' }}>
                {fetchingData
                  ? <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--gain)', borderTopColor: 'transparent' }} />
                  : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
              </button>

              {/* Upload */}
              <button onClick={() => setShowUploadModal(true)} title="Upload Excel"
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                style={{ background: 'var(--info-bg)', border: '1px solid rgba(2,132,199,0.2)', color: 'var(--info)' }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              </button>

              {/* Mobile hamburger */}
              <button className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-md)', color: 'var(--text-lo)' }}
                onClick={() => setMobileOpen(o => !o)}>
                {mobileOpen
                  ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>}
              </button>

              {/* Logout */}
              <button
                onClick={() => { localStorage.removeItem('authToken'); localStorage.removeItem('userEmail'); window.location.href = '/login'; }}
                className="hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold transition-colors"
                style={{ background: 'var(--loss-bg)', border: '1px solid var(--loss-border)', color: 'var(--loss)' }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                Logout
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          {mobileOpen && (
            <div className="md:hidden py-2 border-t" style={{ borderColor: 'var(--border-md)' }}>
              {TABS.map(tab => (
                <button key={tab.key} onClick={() => { onTabChange?.(tab.key); setMobileOpen(false); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-left mb-0.5"
                  style={activeTab === tab.key
                    ? { background: 'var(--brand-bg)', color: 'var(--brand)' }
                    : { color: 'var(--text-mid)' }}>
                  {tab.icon} {tab.label}
                </button>
              ))}
              <button onClick={() => { localStorage.removeItem('authToken'); localStorage.removeItem('userEmail'); window.location.href = '/login'; }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-semibold mt-1"
                style={{ color: 'var(--loss)', background: 'var(--loss-bg)' }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                Logout
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* ── UPLOAD MODAL ── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
          onClick={closeModal}>
          <div className="w-full max-w-md rounded-2xl p-6 animate-scaleIn"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-md)', boxShadow: 'var(--shadow-xl)' }}
            onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,#0284c7,#22d3ee)' }}>
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold" style={{ color: 'var(--text-hi)' }}>Upload File</h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Excel .xlsx / .xls · max 50 MB</p>
                </div>
              </div>
              <button onClick={closeModal} className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ color: 'var(--text-muted)', background: 'var(--bg-raised)' }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-lo)' }}>File Type</label>
              <select value={uploadType} onChange={e => { setUploadType(e.target.value as any); setSelectedFile(null); }}
                disabled={uploading} className="form-input">
                <option value="holdings">Portfolio Holdings</option>
                <option value="stockMaster">Stock Master (NSE/BSE)</option>
              </select>
            </div>

            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
              onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) setSelectedFile(f); }}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className="rounded-xl p-6 text-center cursor-pointer mb-5 transition-all duration-200"
              style={{
                border: `2px dashed ${isDragging ? 'var(--brand)' : selectedFile ? 'var(--gain)' : 'var(--border-lg)'}`,
                background: isDragging ? 'var(--brand-bg)' : selectedFile ? 'var(--gain-bg)' : 'var(--bg-raised)',
              }}>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls"
                onChange={e => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); }}
                disabled={uploading} className="hidden" />
              {selectedFile ? (
                <div className="space-y-2">
                  <div className="w-11 h-11 rounded-xl mx-auto flex items-center justify-center" style={{ background: 'var(--gain-bg)' }}>
                    <svg className="w-5 h-5" style={{ color: 'var(--gain)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>{selectedFile.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtSize(selectedFile.size)}</p>
                  <button onClick={e => { e.stopPropagation(); setSelectedFile(null); }} className="text-xs font-semibold" style={{ color: 'var(--loss)' }}>Remove</button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-11 h-11 rounded-xl mx-auto flex items-center justify-center" style={{ background: 'var(--info-bg)' }}>
                    <svg className="w-5 h-5" style={{ color: 'var(--info)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-lo)' }}>
                    <span className="font-semibold" style={{ color: 'var(--brand)' }}>Click to upload</span> or drag & drop
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={closeModal} disabled={uploading} className="flex-1 py-2.5 rounded-xl text-sm font-semibold btn btn-ghost">Cancel</button>
              <button onClick={() => selectedFile && processUpload(selectedFile)}
                disabled={!selectedFile || uploading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 btn"
                style={{
                  background: !selectedFile || uploading ? 'var(--bg-sunken)' : 'linear-gradient(135deg,#0284c7,#6366f1)',
                  color: !selectedFile || uploading ? 'var(--text-muted)' : '#fff',
                  boxShadow: selectedFile && !uploading ? '0 4px 14px rgba(99,102,241,0.3)' : 'none',
                }}>
                {uploading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Uploading…</> : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
