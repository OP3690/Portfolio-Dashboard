'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface CollectionStat {
  name: string;
  count?: number;
  size?: number;
  storageSize?: number;
  totalIndexSize?: number;
  avgObjSize?: number;
  nindexes?: number;
  sizeFormatted?: string;
  storageSizeFormatted?: string;
  totalIndexSizeFormatted?: string;
  error?: string;
}

interface DatabaseStats {
  success: boolean;
  database: {
    name: string;
    collections: number;
    dataSize: number;
    dataSizeFormatted: string;
    storageSize: number;
    storageSizeFormatted: string;
    indexSize: number;
    indexSizeFormatted: string;
    totalSize: number;
    totalSizeFormatted: string;
    objects: number;
    avgObjSize: number;
    fileSize?: number;
    fileSizeFormatted?: string;
  };
  collections: CollectionStat[];
  summary: {
    totalCollections: number;
    totalDocuments: number;
    totalDataSize: number;
    totalDataSizeFormatted: string;
    totalStorageSize: number;
    totalStorageSizeFormatted: string;
    totalIndexSize: number;
    totalIndexSizeFormatted: string;
  };
  limits: {
    freeTierStorage: number;
    freeTierStorageFormatted: string;
    usagePercent: string;
  };
  error?: string;
}

export default function DatabaseStatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/db-stats');
      const data = await response.json();
      
      if (data.success) {
        setStats(data);
      } else {
        setError(data.error || 'Failed to fetch database statistics');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch database statistics');
    } finally {
      setLoading(false);
    }
  };

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return 'bg-red-500';
    if (percent >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading database statistics...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">Error: {error}</p>
            <button
              onClick={fetchStats}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const usagePercent = parseFloat(stats.limits.usagePercent);

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Database Statistics</h1>
            <p className="text-gray-600 mt-1">MongoDB Space Usage & Collection Details</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={fetchStats}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Back to Dashboard
            </button>
          </div>
        </div>

        {/* Database Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Storage</p>
                <p className="text-2xl font-bold text-gray-900">{stats.database.storageSizeFormatted}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Documents</p>
                <p className="text-2xl font-bold text-gray-900">{stats.summary.totalDocuments.toLocaleString()}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Collections</p>
                <p className="text-2xl font-bold text-gray-900">{stats.summary.totalCollections}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Index Size</p>
                <p className="text-2xl font-bold text-gray-900">{stats.database.indexSizeFormatted}</p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Storage Usage Progress Bar */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-900">Storage Usage</h2>
            <span className="text-sm text-gray-600">
              {stats.database.storageSizeFormatted} / {stats.limits.freeTierStorageFormatted}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
            <div
              className={`h-4 rounded-full ${getUsageColor(usagePercent)} transition-all duration-300`}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            ></div>
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${usagePercent >= 90 ? 'text-red-600' : usagePercent >= 70 ? 'text-yellow-600' : 'text-green-600'}`}>
              {usagePercent.toFixed(2)}% Used
            </span>
            <span className="text-xs text-gray-500">
              {((stats.limits.freeTierStorage - stats.database.storageSize) / (1024 * 1024)).toFixed(2)} MB Remaining
            </span>
          </div>
        </div>

        {/* Database Details */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Database Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600">Database Name</p>
              <p className="text-base font-medium text-gray-900">{stats.database.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Data Size</p>
              <p className="text-base font-medium text-gray-900">{stats.database.dataSizeFormatted}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Size</p>
              <p className="text-base font-medium text-gray-900">{stats.database.totalSizeFormatted}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Objects</p>
              <p className="text-base font-medium text-gray-900">{stats.database.objects.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Average Object Size</p>
              <p className="text-base font-medium text-gray-900">
                {stats.database.avgObjSize ? `${(stats.database.avgObjSize / 1024).toFixed(2)} KB` : 'N/A'}
              </p>
            </div>
            {stats.database.fileSizeFormatted && (
              <div>
                <p className="text-sm text-gray-600">File Size</p>
                <p className="text-base font-medium text-gray-900">{stats.database.fileSizeFormatted}</p>
              </div>
            )}
          </div>
        </div>

        {/* Collections Table */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Collection Details</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Collection Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Documents
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Storage Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Index Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Indexes
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stats.collections.map((collection, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900">{collection.name}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">
                        {collection.count !== undefined ? collection.count.toLocaleString() : 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{collection.sizeFormatted || 'N/A'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{collection.storageSizeFormatted || 'N/A'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{collection.totalIndexSizeFormatted || 'N/A'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{collection.nindexes !== undefined ? collection.nindexes : 'N/A'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Total Collections</p>
              <p className="text-xl font-bold text-gray-900">{stats.summary.totalCollections}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Total Documents</p>
              <p className="text-xl font-bold text-gray-900">{stats.summary.totalDocuments.toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Total Storage</p>
              <p className="text-xl font-bold text-gray-900">{stats.summary.totalStorageSizeFormatted}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

