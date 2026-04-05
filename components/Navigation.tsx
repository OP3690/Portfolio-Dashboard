'use client';

import { useState, useRef, useEffect } from 'react';
import Toast from './Toast';

interface NavigationProps {
  onUploadSuccess?: () => void;
  activeTab?: 'dashboard' | 'stock-analytics' | 'stock-research';
  onTabChange?: (tab: 'dashboard' | 'stock-analytics' | 'stock-research') => void;
}

const TABS: { key: 'dashboard' | 'stock-analytics' | 'stock-research'; label: string }[] = [
  { key: 'dashboard',       label: 'Dashboard'  },
  { key: 'stock-analytics', label: 'Analytics'  },
  { key: 'stock-research',  label: 'Research'   },
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
  const [mobileMenuOpen,  setMobileMenuOpen]  = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type, isVisible: true });
    setTimeout(() => setToast(prev => prev ? { ...prev, isVisible: false } : null), 5000);
  };

  const fetchLatestStockDate = async () => {
    try {
      const res  = await fetch('/api/latest-stock-date');
      const data = await res.json();
      if (data.success && data.formattedDate) setLatestStockDate(data.formattedDate);
    } catch {}
  };

  useEffect(() => { fetchLatestStockDate(); }, []);

  useEffect(() => {
    if (toast?.type === 'success' && toast.message.includes('refreshed')) {
      setTimeout(fetchLatestStockDate, 2000);
    }
  }, [toast]);

  const handleRefreshStockData = async () => {
    setFetchingData(true);
    try {
      const res = await fetch('/api/fetch-historical-data?refreshAllStocks=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshLatest: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        await fetchLatestStockDate();
        showToast(`${data.message || `Refreshed ${data.stocksProcessed || 0} stocks.`} Reloading…`, 'success');
        setTimeout(() => onUploadSuccess ? onUploadSuccess() : window.location.reload(), 2000);
      } else throw new Error(data.error || 'Refresh failed');
    } catch (e: any) {
      showToast(e.message || 'Refresh failed', 'error');
    } finally {
      setFetchingData(false);
    }
  };

  const validateFile = (file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) return 'Upload an Excel file (.xlsx / .xls)';
    if (file.size > 50 * 1024 * 1024)     return 'File exceeds 50 MB limit';
    return null;
  };

  const processFileUpload = async (file: File) => {
    const err = validateFile(file);
    if (err) { showToast(err, 'error'); setSelectedFile(null); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('fileType', uploadType);
      const res  = await fetch('/api/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (data.success) {
        showToast(data.count ? `${data.message} (${data.count} records)` : data.message || 'Upload successful!', 'success');
        setSelectedFile(null);
        setTimeout(() => { setShowUploadModal(false); onUploadSuccess?.(); }, 1500);
      } else showToast(data.error || 'Upload failed', 'error');
    } catch (e: any) {
      showToast(e.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleCloseModal = () => {
    if (uploading) return;
    setShowUploadModal(false); setSelectedFile(null); setIsDragging(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fmtSize = (b: number) => {
    if (!b) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return `${(b / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
  };

  return (
    <>
      {toast && (
        <Toast message={toast.message} type={toast.type} isVisible={toast.isVisible}
          onClose={() => setToast(prev => prev ? { ...prev, isVisible: false } : null)} duration={5000} />
      )}

      {/* NAV BAR */}
      <nav className="sticky top-0 z-40"
        style={{
          background: 'rgba(10,15,30,0.88)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 4px 32px rgba(0,0,0,0.5)',
        }}>
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">

            {/* LOGO */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#10b981 0%,#3b82f6 100%)', boxShadow: '0 0 20px rgba(16,185,129,0.3)' }}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-white leading-none">Portfolio</p>
                <p className="text-[10px] font-semibold leading-none mt-0.5" style={{ color: '#10b981' }}>DASHBOARD</p>
              </div>
            </div>

            {/* TABS desktop */}
            <div className="hidden md:flex items-center gap-1 p-1 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {TABS.map(tab => (
                <button key={tab.key} onClick={() => onTabChange?.(tab.key)}
                  className="px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200"
                  style={activeTab === tab.key
                    ? { background: '#10b981', color: '#fff', boxShadow: '0 4px 14px rgba(16,185,129,0.4)' }
                    : { color: '#64748b' }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* RIGHT ACTIONS */}
            <div className="flex items-center gap-2">
              {latestStockDate && (
                <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" style={{ boxShadow: '0 0 6px #10b981' }} />
                  {latestStockDate}
                </div>
              )}

              {/* Refresh */}
              <button onClick={handleRefreshStockData} disabled={fetchingData} title="Refresh stock data"
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' }}>
                {fetchingData
                  ? <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                  : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>}
              </button>

              {/* Upload */}
              <button onClick={() => setShowUploadModal(true)} title="Upload Excel"
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)', color: '#60a5fa' }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </button>

              {/* Mobile hamburger */}
              <button className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}
                onClick={() => setMobileMenuOpen(o => !o)}>
                {mobileMenuOpen
                  ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>}
              </button>

              {/* Logout desktop */}
              <button
                onClick={() => { localStorage.removeItem('authToken'); localStorage.removeItem('userEmail'); window.location.href = '/login'; }}
                className="hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.18)', color: '#f87171' }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          </div>

          {/* Mobile dropdown */}
          {mobileMenuOpen && (
            <div className="md:hidden py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <div className="flex flex-col gap-1">
                {TABS.map(tab => (
                  <button key={tab.key} onClick={() => { onTabChange?.(tab.key); setMobileMenuOpen(false); }}
                    className="px-4 py-3 rounded-xl text-sm font-semibold text-left"
                    style={activeTab === tab.key
                      ? { background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }
                      : { color: '#94a3b8' }}>
                    {tab.label}
                  </button>
                ))}
                <button
                  onClick={() => { localStorage.removeItem('authToken'); localStorage.removeItem('userEmail'); window.location.href = '/login'; }}
                  className="px-4 py-3 rounded-xl text-sm font-semibold text-left mt-1"
                  style={{ color: '#f87171', background: 'rgba(244,63,94,0.06)' }}>
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* UPLOAD MODAL */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}
          onClick={handleCloseModal}>
          <div className="w-full max-w-md rounded-2xl p-6 animate-fadeIn"
            style={{ background: '#0f1629', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 80px rgba(0,0,0,0.75)' }}
            onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Upload Portfolio File</h2>
                  <p className="text-xs mt-0.5" style={{ color: '#4b5d78' }}>Excel .xlsx / .xls · max 50 MB</p>
                </div>
              </div>
              <button onClick={handleCloseModal} disabled={uploading}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ color: '#4b5d78', background: 'rgba(255,255,255,0.04)' }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#64748b' }}>File Type</label>
              <select value={uploadType} onChange={e => { setUploadType(e.target.value as 'holdings' | 'stockMaster'); setSelectedFile(null); }}
                disabled={uploading}
                className="w-full px-3 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: '#161e35', border: '1px solid rgba(255,255,255,0.1)', color: '#f0f4ff', outline: 'none' }}>
                <option value="holdings">Portfolio Holdings</option>
                <option value="stockMaster">Stock Master (NSE/BSE)</option>
              </select>
            </div>

            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
              onDrop={handleDrop}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className="rounded-xl p-6 text-center cursor-pointer mb-5 transition-all duration-200"
              style={{
                border: `2px dashed ${isDragging ? '#10b981' : selectedFile ? '#10b981' : 'rgba(255,255,255,0.1)'}`,
                background: isDragging ? 'rgba(16,185,129,0.05)' : selectedFile ? 'rgba(16,185,129,0.03)' : 'rgba(255,255,255,0.02)',
              }}>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls"
                onChange={e => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); }}
                disabled={uploading} className="hidden" />
              {selectedFile ? (
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center"
                    style={{ background: 'rgba(16,185,129,0.12)' }}>
                    <svg className="w-6 h-6" style={{ color: '#10b981' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-white">{selectedFile.name}</p>
                  <p className="text-xs" style={{ color: '#4b5d78' }}>{fmtSize(selectedFile.size)}</p>
                  <button onClick={e => { e.stopPropagation(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="text-xs font-medium" style={{ color: '#f87171' }}>Remove</button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center"
                    style={{ background: 'rgba(59,130,246,0.1)' }}>
                    <svg className="w-6 h-6" style={{ color: '#60a5fa' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-sm" style={{ color: '#64748b' }}>
                    <span className="font-semibold" style={{ color: '#60a5fa' }}>Click to upload</span> or drag & drop
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={handleCloseModal} disabled={uploading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }}>
                Cancel
              </button>
              <button onClick={() => selectedFile && processFileUpload(selectedFile)}
                disabled={!selectedFile || uploading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                style={{
                  background: !selectedFile || uploading ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,#3b82f6,#6366f1)',
                  color: !selectedFile || uploading ? '#334155' : '#fff',
                  boxShadow: selectedFile && !uploading ? '0 4px 16px rgba(59,130,246,0.3)' : 'none',
                }}>
                {uploading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Uploading…</>
                  : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
