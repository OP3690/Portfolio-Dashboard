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

export default function Dashboard() {
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'stock-analytics' | 'stock-research'>('dashboard');
  const [redirecting, setRedirecting] = useState(false); // Prevent multiple redirects

  // Check authentication on mount (only once)
  useEffect(() => {
    checkAuthentication();
  }, []); // Empty dependency array - only run once on mount

  const checkAuthentication = async () => {
    // Prevent multiple redirects
    if (redirecting) return;
    
    try {
      // Check if we're in browser environment
      if (typeof window === 'undefined') {
        setAuthLoading(false);
        return;
      }

      const token = localStorage.getItem('authToken');
      
      if (!token) {
        setAuthLoading(false);
        if (!redirecting) {
          setRedirecting(true);
          window.location.href = '/login';
        }
        return;
      }

      // Verify token with backend (with timeout)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      try {
        const authResponse = await fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`, {
          signal: controller.signal,
          cache: 'no-store'
        });
        clearTimeout(timeoutId);

        if (!authResponse.ok) {
          throw new Error('Auth verification failed');
        }

        const authData = await authResponse.json();

        if (!authData.authenticated) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('userEmail');
          setAuthLoading(false);
          if (!redirecting) {
            setRedirecting(true);
            window.location.href = '/login';
          }
          return;
        }

        // Authenticated, proceed to load dashboard immediately
        setAuthLoading(false);
        fetchDashboardData();
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        // Only redirect if it's not an abort error (timeout)
        if (fetchError.name !== 'AbortError') {
          console.error('Auth check error:', fetchError);
          localStorage.removeItem('authToken');
          localStorage.removeItem('userEmail');
        }
        setAuthLoading(false);
        if (!redirecting && !token) {
          setRedirecting(true);
          window.location.href = '/login';
        }
      }
    } catch (err) {
      console.error('Auth check error:', err);
      const token = localStorage.getItem('authToken');
      if (!token && !redirecting) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userEmail');
        setAuthLoading(false);
        setRedirecting(true);
        window.location.href = '/login';
      } else {
        setAuthLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!authLoading && !dashboardData) {
      console.log('Dashboard component mounted, fetching data...');
      fetchDashboardData();
    }
  }, [authLoading]); // Only fetch once when auth completes, not on every authLoading change

  // Background data refresh - runs every 30 seconds (only when authenticated)
  useEffect(() => {
    if (authLoading) return; // Don't start interval if still checking auth
    
    // Start interval only once when auth is complete
    const intervalId = setInterval(() => {
      // Silently refresh data in background (don't show loading state)
      fetchDashboardData(false).catch(err => {
        console.log('Background refresh failed:', err);
      });
    }, 30000); // 30 seconds

    return () => clearInterval(intervalId);
  }, [authLoading]); // Only depend on authLoading, not dashboardData

  const fetchDashboardData = async (showLoading: boolean = true) => {
    try {
      console.log('Starting fetch...');
      if (showLoading) {
        setLoading(true);
      }
      setError(null);
      
      const response = await fetch('/api/dashboard?clientId=994826', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(120000), // 120 second timeout (2 minutes)
      });
      
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        // Try to get error details from response
        let errorDetails = '';
        try {
          const errorData = await response.json();
          console.error('Server error response:', errorData);
          errorDetails = errorData.error || `HTTP error! status: ${response.status}`;
          if (errorData.details) {
            console.error('Server error details:', errorData.details);
          }
        } catch (e) {
          errorDetails = `HTTP error! status: ${response.status}`;
        }
        throw new Error(errorDetails);
      }
      
      const data = await response.json();
      console.log('Data received:', data.success ? 'Success' : 'Failed');
      
      if (data.success) {
        // Log holdings received from API
        console.log('Dashboard API Response - Holdings count:', data.data.holdings?.length || 0);
        console.log('Dashboard API Response - Realized Stocks count:', data.data.realizedStocks?.length || 0);
        setDashboardData(data.data);
        console.log('Dashboard data set successfully');
      } else {
        setError(data.error || 'Failed to load dashboard data');
      }
    } catch (err: any) {
      console.error('Dashboard fetch error:', err);
      setError(err.message || 'Failed to fetch dashboard data');
    } finally {
      if (showLoading) {
        setLoading(false);
        console.log('Loading set to false');
      }
    }
  };

  const renderContent = () => {
    if (activeTab === 'stock-analytics') {
      return (
        <StockAnalytics 
          holdings={dashboardData?.holdings || []} 
          transactions={dashboardData?.transactions || []} 
        />
      );
    }

    if (activeTab === 'stock-research') {
      return <StockResearch />;
    }

    // Dashboard tab content
    return (
      <>
        {/* Summary Section */}
        <SummaryCards summary={dashboardData.summary} />

        {/* Top Performers Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <TopPerformers 
            title="Top 3 High Performing Stocks" 
            performers={dashboardData.topPerformers}
            isPositive={true}
          />
          <TopPerformers 
            title="Top 3 Worst Performing Stocks" 
            performers={dashboardData.worstPerformers}
            isPositive={false}
          />
        </div>

        {/* Monthly Charts Section */}
        <MonthlyCharts 
          monthlyInvestments={dashboardData.monthlyInvestments}
          monthlyInvestmentAverages={dashboardData.monthlyInvestmentAverages}
          monthlyDividends={dashboardData.monthlyDividends}
          avgMonthlyDividends={dashboardData.avgMonthlyDividends}
          medianMonthlyDividendsLast12M={dashboardData.medianMonthlyDividendsLast12M}
          monthlyReturns={dashboardData.monthlyReturns}
          returnStatistics={dashboardData.returnStatistics}
        />

        {/* Industry Distribution */}
        <div className="mt-6">
          <IndustryPieChart data={dashboardData.industryDistribution} />
        </div>

        {/* Holdings Table */}
        <div className="mt-6">
          <HoldingsTable holdings={dashboardData.holdings} />
        </div>

        {/* Realized Stocks Table */}
        {dashboardData.realizedStocks && dashboardData.realizedStocks.length > 0 && (
          <div className="mt-6">
            <RealizedStocksTable 
              realizedStocks={dashboardData.realizedStocks} 
              onRefresh={fetchDashboardData}
            />
          </div>
        )}
      </>
    );
  };

  // Show loading during authentication check
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400 mx-auto"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 bg-blue-600 dark:bg-blue-400 rounded-full animate-pulse"></div>
            </div>
          </div>
          <p className="mt-6 text-gray-600 dark:text-gray-300 text-lg font-medium">Verifying authentication...</p>
          <p className="mt-2 text-gray-400 dark:text-gray-500 text-sm">Please wait</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        <Navigation 
          onUploadSuccess={fetchDashboardData} 
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)]">
          <div className="text-center">
            <div className="relative inline-block">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-8 w-8 bg-blue-600 dark:bg-blue-400 rounded-full animate-pulse"></div>
              </div>
            </div>
            <p className="mt-6 text-gray-600 dark:text-gray-300 text-lg font-medium">Loading dashboard...</p>
            <p className="mt-2 text-gray-400 dark:text-gray-500 text-sm">Fetching your portfolio data</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        <Navigation 
          onUploadSuccess={fetchDashboardData} 
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)]">
          <div className="text-center bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 max-w-md mx-4 border border-red-200 dark:border-red-900">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Oops! Something went wrong</h3>
            <p className="text-red-600 dark:text-red-400 mb-6 text-sm">{error}</p>
            <button
              onClick={() => fetchDashboardData()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Navigation 
          onUploadSuccess={fetchDashboardData} 
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <div className="container mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">No Data Available</h2>
            <p className="text-gray-600 mb-6">
              Upload your portfolio Excel file to get started.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <Navigation 
        onUploadSuccess={fetchDashboardData} 
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="animate-fadeIn">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
