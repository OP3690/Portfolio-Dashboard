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

  // Check authentication on mount
  useEffect(() => {
    checkAuthentication();
  }, []);

  const checkAuthentication = async () => {
    try {
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        router.push('/login');
        return;
      }

      // Verify token with backend
      const authResponse = await fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`);
      const authData = await authResponse.json();

      if (!authData.authenticated) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userEmail');
        router.push('/login');
        return;
      }

      // Authenticated, proceed to load dashboard immediately
      setAuthLoading(false);
      fetchDashboardData();
    } catch (err) {
      console.error('Auth check error:', err);
      localStorage.removeItem('authToken');
      localStorage.removeItem('userEmail');
      router.push('/login');
    }
  };

  useEffect(() => {
    if (!authLoading) {
      console.log('Dashboard component mounted, fetching data...');
      fetchDashboardData();
    }
  }, [authLoading]);

  const fetchDashboardData = async () => {
    try {
      console.log('Starting fetch...');
      setLoading(true);
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
      setLoading(false);
      console.log('Loading set to false');
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
          monthlyDividends={dashboardData.monthlyDividends}
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
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Navigation 
          onUploadSuccess={fetchDashboardData} 
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Navigation 
          onUploadSuccess={fetchDashboardData} 
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-red-600 mb-4">Error: {error}</p>
            <button
              onClick={fetchDashboardData}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Retry
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navigation 
        onUploadSuccess={fetchDashboardData} 
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      
      <div className="container mx-auto px-4 py-8">
        {renderContent()}
      </div>
    </div>
  );
}
