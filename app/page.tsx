'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import SummaryCards from '@/components/SummaryCards';
import TopPerformers from '@/components/TopPerformers';
import MonthlyCharts from '@/components/MonthlyCharts';
import HoldingsTable from '@/components/HoldingsTable';
import RealizedStocksTable from '@/components/RealizedStocksTable';
import IndustryPieChart from '@/components/IndustryPieChart';
import StockAnalytics from '@/components/StockAnalytics';
import StockResearch from '@/components/StockResearch';
import PortfolioGrowthChart from '@/components/PortfolioGrowthChart';
import StockPLContribution from '@/components/StockPLContribution';
import PortfolioTreemap from '@/components/PortfolioTreemap';
import PortfolioQuadrant from '@/components/PortfolioQuadrant';
import MonthlyHeatmap from '@/components/MonthlyHeatmap';
import WealthBreakdown from '@/components/WealthBreakdown';
import SectorPerformance from '@/components/SectorPerformance';
import DrawdownAnalysis from '@/components/DrawdownAnalysis';

/* Skeleton block */
function Skeleton({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`skeleton ${className}`} style={style} />
  );
}

/* Full-page loading skeleton matching dashboard layout */
function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="flex items-start justify-between mb-4">
              <Skeleton style={{ width: 80, height: 10, borderRadius: 6 }} />
              <Skeleton style={{ width: 32, height: 32, borderRadius: 10 }} />
            </div>
            <Skeleton style={{ width: '70%', height: 28, borderRadius: 8 }} />
            <Skeleton className="mt-4" style={{ height: 2, borderRadius: 99 }} />
          </div>
        ))}
      </div>

      {/* Performers row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1].map(i => (
          <div key={i} className="card p-5">
            <Skeleton style={{ width: 180, height: 14, borderRadius: 6, marginBottom: 20 }} />
            {[0, 1, 2].map(j => (
              <div key={j} className="flex items-center gap-3 mb-3">
                <Skeleton style={{ width: 32, height: 32, borderRadius: 8 }} />
                <div className="flex-1 space-y-2">
                  <Skeleton style={{ height: 10, borderRadius: 6 }} />
                  <Skeleton style={{ height: 4, borderRadius: 99 }} />
                  <Skeleton style={{ width: '60%', height: 8, borderRadius: 6 }} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Chart placeholder */}
      <div className="card p-5" style={{ height: 260 }}>
        <Skeleton style={{ width: 140, height: 14, borderRadius: 6, marginBottom: 20 }} />
        <div className="flex items-end gap-2 h-36">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="flex-1" style={{ height: `${30 + Math.random() * 70}%`, borderRadius: 6 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* Full-page spinner */
function FullPageSpinner({ message = 'Loading…', sub = '' }: { message?: string; sub?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-page)' }}>
      <div className="text-center space-y-4">
        <div className="relative w-14 h-14 mx-auto">
          <div className="absolute inset-0 rounded-full border-2 animate-spin"
            style={{ borderColor: 'var(--brand) transparent transparent transparent' }} />
          <div className="absolute inset-2 rounded-full" style={{ background: 'var(--brand-bg)' }} />
        </div>
        <p className="text-sm font-semibold text-hi">{message}</p>
        {sub && <p className="text-xs text-lo">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const router      = useRouter();
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [authLoading,setAuthLoading]= useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [activeTab,  setActiveTab]  = useState<'dashboard' | 'stock-analytics' | 'stock-research'>('dashboard');
  const [redirecting,setRedirecting]= useState(false);

  useEffect(() => { checkAuthentication(); }, []);

  const checkAuthentication = async () => {
    if (redirecting) return;
    try {
      if (typeof window === 'undefined') { setAuthLoading(false); return; }
      const token = localStorage.getItem('authToken');
      if (!token) {
        setAuthLoading(false);
        if (!redirecting) { setRedirecting(true); window.location.href = '/login'; }
        return;
      }
      const ctrl    = new AbortController();
      const timerId = setTimeout(() => ctrl.abort(), 5000);
      try {
        const res  = await fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`, { signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(timerId);
        if (!res.ok) throw new Error('Auth failed');
        const data = await res.json();
        if (!data.authenticated) {
          localStorage.removeItem('authToken'); localStorage.removeItem('userEmail');
          setAuthLoading(false);
          if (!redirecting) { setRedirecting(true); window.location.href = '/login'; }
          return;
        }
        setAuthLoading(false);
        fetchDashboardData();
      } catch (e: any) {
        clearTimeout(timerId);
        if (e.name !== 'AbortError') { localStorage.removeItem('authToken'); localStorage.removeItem('userEmail'); }
        setAuthLoading(false);
        if (!redirecting && !localStorage.getItem('authToken')) { setRedirecting(true); window.location.href = '/login'; }
      }
    } catch (e) {
      const token = localStorage.getItem('authToken');
      if (!token && !redirecting) {
        localStorage.removeItem('authToken'); localStorage.removeItem('userEmail');
        setAuthLoading(false); setRedirecting(true); window.location.href = '/login';
      } else setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !dashboardData) fetchDashboardData();
  }, [authLoading]);

  // Silent background refresh every 30s
  useEffect(() => {
    if (authLoading) return;
    const id = setInterval(() => fetchDashboardData(false).catch(() => {}), 30000);
    return () => clearInterval(id);
  }, [authLoading]);

  const fetchDashboardData = async (showLoading = true) => {
    try {
      if (showLoading) { setLoading(true); setError(null); }
      const res = await fetch('/api/dashboard?clientId=994826', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const d = await res.json(); msg = d.error || msg; } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      if (data.success) setDashboardData(data.data);
      else setError(data.error || 'Failed to load dashboard data');
    } catch (e: any) {
      setError(e.message || 'Failed to fetch dashboard data');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const renderContent = () => {
    if (activeTab === 'stock-analytics') {
      // Analytics should only consider active (currently held) stocks
      const activeHoldings = (dashboardData?.holdings || []).filter((h: any) => (h.openQty || 0) > 0);
      return <StockAnalytics holdings={activeHoldings} transactions={dashboardData?.transactions || []} realizedStocks={dashboardData?.realizedStocks || []} />;
    }
    if (activeTab === 'stock-research') {
      return <StockResearch />;
    }
    return (
      <div className="space-y-5 animate-fadeIn">
        {/* Summary cards */}
        <SummaryCards summary={dashboardData.summary} />

        {/* Top / Worst performers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <TopPerformers title="Top 3 Gainers"  performers={dashboardData.topPerformers}   isPositive={true}  />
          <TopPerformers title="Top 3 Laggards" performers={dashboardData.worstPerformers} isPositive={false} />
        </div>

        {/* Portfolio Wealth Journey */}
        <PortfolioGrowthChart
          monthlyInvestments={dashboardData.monthlyInvestments || []}
          monthlyReturns={dashboardData.monthlyReturns || []}
          currentValue={dashboardData.summary?.currentValue ?? 0}
          totalInvested={dashboardData.summary?.totalInvested ?? 0}
          totalPL={dashboardData.summary?.totalProfitLoss ?? 0}
        />

        {/* Monthly charts */}
        <MonthlyCharts
          monthlyInvestments={dashboardData.monthlyInvestments}
          monthlyInvestmentAverages={dashboardData.monthlyInvestmentAverages}
          monthlyDividends={dashboardData.monthlyDividends}
          avgMonthlyDividends={dashboardData.avgMonthlyDividends}
          avgMonthlyDividendsLast12M={dashboardData.avgMonthlyDividendsLast12M}
          medianMonthlyDividendsLast12M={dashboardData.medianMonthlyDividendsLast12M}
          monthlyReturns={dashboardData.monthlyReturns}
          returnStatistics={dashboardData.returnStatistics}
        />

        {/* Industry pie */}
        <IndustryPieChart data={dashboardData.industryDistribution} />

        {/* Stock P&L contribution */}
        <StockPLContribution holdings={(dashboardData.holdings || []).filter((h: any) => (h.openQty || 0) > 0)} />

        {/* Portfolio Concentration Treemap */}
        <PortfolioTreemap holdings={(dashboardData.holdings || []).filter((h: any) => (h.openQty || 0) > 0)} />

        {/* Portfolio Quadrant Matrix */}
        <PortfolioQuadrant holdings={(dashboardData.holdings || []).filter((h: any) => (h.openQty || 0) > 0)} />

        {/* Sector Performance Breakdown */}
        <SectorPerformance
          holdings={(dashboardData.holdings || []).filter((h: any) => (h.openQty || 0) > 0)}
        />

        {/* Portfolio Drawdown & Risk Analysis */}
        {(dashboardData.monthlyReturns?.length ?? 0) >= 3 && (
          <DrawdownAnalysis
            monthlyReturns={dashboardData.monthlyReturns || []}
            currentValue={dashboardData.summary?.currentValue ?? 0}
          />
        )}

        {/* Complete Wealth Breakdown */}
        <WealthBreakdown
          summary={dashboardData.summary || {}}
          realizedStocks={dashboardData.realizedStocks || []}
          monthlyDividends={dashboardData.monthlyDividends || []}
        />

        {/* Monthly Performance Heatmap */}
        <MonthlyHeatmap
          monthlyReturns={dashboardData.monthlyReturns || []}
          monthlyDividends={dashboardData.monthlyDividends || []}
          monthlyInvestments={dashboardData.monthlyInvestments || []}
        />

        {/* Holdings table */}
        <HoldingsTable holdings={dashboardData.holdings} />

        {/* Realized stocks */}
        {dashboardData.realizedStocks?.length > 0 && (
          <RealizedStocksTable realizedStocks={dashboardData.realizedStocks} onRefresh={fetchDashboardData} />
        )}
      </div>
    );
  };

  /* Auth loading */
  if (authLoading) return <FullPageSpinner message="Verifying session…" sub="Please wait" />;

  /* Data loading — show skeleton with nav */
  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
        <Navigation onUploadSuccess={fetchDashboardData} activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <DashboardSkeleton />
        </div>
      </div>
    );
  }

  /* Error */
  if (error) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
        <Navigation onUploadSuccess={fetchDashboardData} activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)] p-4">
          <div className="card p-8 max-w-md w-full text-center">
            <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'var(--loss-bg)', border: '1px solid var(--loss-border)' }}>
              <svg className="w-7 h-7" style={{ color: 'var(--loss)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-hi mb-2">Something went wrong</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--loss)' }}>{error}</p>
            <button onClick={() => fetchDashboardData()} className="btn btn-primary px-6 py-2.5">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* No data */
  if (!dashboardData) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
        <Navigation onUploadSuccess={fetchDashboardData} activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)] p-4">
          <div className="card p-8 max-w-md w-full text-center">
            <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-glow)' }}>
              <svg className="w-7 h-7" style={{ color: 'var(--brand)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-hi mb-2">No Portfolio Data</h3>
            <p className="text-sm mb-2 text-lo">Upload your portfolio Excel file to get started.</p>
          </div>
        </div>
      </div>
    );
  }

  /* Main dashboard */
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
      <Navigation onUploadSuccess={fetchDashboardData} activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {renderContent()}
      </div>
    </div>
  );
}
