'use client';

import { useState, useRef, useEffect } from 'react';
import Toast from './Toast';

interface NavigationProps {
  onUploadSuccess?: () => void;
  activeTab?: 'dashboard' | 'stock-analytics' | 'stock-research';
  onTabChange?: (tab: 'dashboard' | 'stock-analytics' | 'stock-research') => void;
}

export default function Navigation({ onUploadSuccess, activeTab = 'dashboard', onTabChange }: NavigationProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState<'holdings' | 'stockMaster'>('holdings');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; isVisible: boolean } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [latestStockDate, setLatestStockDate] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch latest stock date on component mount and after refresh
  const fetchLatestStockDate = async () => {
    try {
      const response = await fetch('/api/latest-stock-date');
      const data = await response.json();
      if (data.success && data.formattedDate) {
        setLatestStockDate(data.formattedDate);
      }
    } catch (error) {
      console.error('Error fetching latest stock date:', error);
    }
  };

  useEffect(() => {
    fetchLatestStockDate();
  }, []);

  // Refresh latest date after successful data refresh
  useEffect(() => {
    if (toast?.type === 'success' && toast.message.includes('refreshed')) {
      // Refresh the date after a short delay to allow database update
      setTimeout(() => {
        fetchLatestStockDate();
      }, 2000);
    }
  }, [toast]);

  const handleRefreshStockData = async () => {
    setFetchingData(true);
    
    try {
      // Trigger full data refresh (fetches last 3 days for ALL stocks)
      const response = await fetch('/api/fetch-historical-data?refreshAllStocks=true', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshLatest: true, // Refresh last 3 days including today
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Refresh the latest stock date
        await fetchLatestStockDate();
        
        // Show success message
        const message = data.message || `Successfully refreshed ${data.stocksProcessed || 0} stocks.`;
        setToast({
          message: `${message} Refreshing dashboard...`,
          type: 'success',
          isVisible: true,
        });
        
        // Trigger parent component refresh if callback exists
        if (onUploadSuccess) {
          setTimeout(() => {
            onUploadSuccess();
          }, 1000);
        } else {
          // Reload the page to show updated data
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        }
        
        // Auto-hide toast after 5 seconds
        setTimeout(() => {
          setToast(prev => prev ? { ...prev, isVisible: false } : null);
        }, 5000);
      } else {
        throw new Error(data.error || 'Failed to refresh stock data');
      }
      
      setFetchingData(false);
    } catch (error: any) {
      console.error('Refresh error:', error);
      setToast({
        message: error.message || 'Failed to refresh dashboard. Please try again.',
        type: 'error',
        isVisible: true,
      });
      setFetchingData(false);
      setTimeout(() => {
        setToast(prev => prev ? { ...prev, isVisible: false } : null);
      }, 5000);
    }
  };

  const validateFile = (file: File): string | null => {
    // Check file extension
    const validExtensions = ['.xlsx', '.xls'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!validExtensions.includes(fileExtension)) {
      return 'Invalid file type. Please upload an Excel file (.xlsx, .xls)';
    }

    // Check file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return `File size exceeds 50MB limit. Current size: ${(file.size / 1024 / 1024).toFixed(2)}MB`;
    }

    return null;
  };

  const processFileUpload = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setToast({ type: 'error', message: validationError, isVisible: true });
      setTimeout(() => {
        setToast(prev => prev ? { ...prev, isVisible: false } : null);
      }, 5000);
      setSelectedFile(null);
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileType', uploadType);
      

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      // Log parsing details for debugging
      if (data.parsingDetails) {
        console.log('=== UPLOAD PARSING DETAILS ===');
        console.log('Holdings parsed:', data.parsingDetails.holdingsParsed);
        console.log('Holdings from Excel:', data.parsingDetails.holdingsFromExcel);
        console.log('Holdings in database:', data.parsingDetails.holdingsInDatabase);
        // Log Ola Electric verification
        if (data.parsingDetails.olaElectricFound) {
          console.log('🔍 OLA ELECTRIC VERIFICATION:');
          console.log('  - In parsed realized P&L:', data.parsingDetails.olaElectricFound.inParsedRealizedPL);
          console.log('  - Count in parsed realized P&L:', data.parsingDetails.olaElectricFound.countInParsedRealizedPL);
          console.log('  - In database:', data.parsingDetails.olaElectricFound.inDatabase);
        }
        console.log('All ISINs:', data.parsingDetails.allIsins);
        if (data.parsingDetails.currentHoldingsIsins) {
          console.log('Current Holdings ISINs:', data.parsingDetails.currentHoldingsIsins);
        }
        if (data.parsingDetails.databaseIsins) {
          console.log('Database ISINs:', data.parsingDetails.databaseIsins);
        }
        console.log('==============================');
      }

      if (data.success) {
        const detailedMessage = data.count 
          ? `${data.message || 'File uploaded successfully!'} (${data.count} records processed)`
          : data.message || 'File uploaded successfully!';
        setToast({ type: 'success', message: detailedMessage, isVisible: true });
        setSelectedFile(null);
        if (onUploadSuccess) {
          setTimeout(() => {
            setShowUploadModal(false);
            onUploadSuccess();
          }, 1500);
        } else {
          setTimeout(() => {
            setShowUploadModal(false);
          }, 2000);
        }
        // Auto-hide toast after 5 seconds
        setTimeout(() => {
          setToast(prev => prev ? { ...prev, isVisible: false } : null);
        }, 5000);
      } else {
        setToast({ type: 'error', message: data.error || 'Upload failed', isVisible: true });
        setTimeout(() => {
          setToast(prev => prev ? { ...prev, isVisible: false } : null);
        }, 5000);
      }
    } catch (error: any) {
      setToast({ type: 'error', message: error.message || 'Upload failed. Please try again.', isVisible: true });
      setTimeout(() => {
        setToast(prev => prev ? { ...prev, isVisible: false } : null);
      }, 5000);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      processFileUpload(selectedFile);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleCloseModal = () => {
    if (!uploading) {
      setShowUploadModal(false);
      setSelectedFile(null);
      setIsDragging(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Close on ESC key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !uploading) {
      handleCloseModal();
    }
  };

  return (
    <>
      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={() => setToast(prev => prev ? { ...prev, isVisible: false } : null)}
          duration={5000}
        />
      )}
      
      <nav className="sticky top-0 z-40 bg-white bg-opacity-95 backdrop-blur-lg shadow-md border-b border-gray-200">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
                  Portfolio Dashboard
                </h1>
              </div>
              {/* Tabs */}
              <div className="flex items-center gap-1 border-l border-gray-300 pl-6 ml-2">
                <button
                  onClick={() => onTabChange?.('dashboard')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activeTab === 'dashboard'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => onTabChange?.('stock-analytics')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activeTab === 'stock-analytics'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Stock Analytics
                </button>
                <button
                  onClick={() => onTabChange?.('stock-research')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activeTab === 'stock-research'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Stock Research
                </button>
                <button
                  onClick={() => window.location.href = '/db-stats'}
                  className="px-4 py-2 text-sm font-medium rounded-lg transition-colors text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  title="Database Statistics"
                >
                  DB Stats
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {latestStockDate && (
                <div className="text-sm text-gray-600 font-medium">
                  Latest Stock Date: <span className="text-gray-900 font-semibold">{latestStockDate}</span>
                </div>
              )}
              <button
                onClick={handleRefreshStockData}
                disabled={fetchingData}
                className="p-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all shadow-md hover:shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                title="Refresh Dashboard: Reload latest data from database. Daily cron job runs at 7:00 PM IST to fetch new data."
              >
                {fetchingData ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => setShowUploadModal(true)}
                className="p-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center"
                title="Upload Excel File"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem('authToken');
                  localStorage.removeItem('userEmail');
                  window.location.href = '/login';
                }}
                className="px-3 sm:px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all shadow-md hover:shadow-lg text-sm sm:text-base flex items-center gap-2 whitespace-nowrap"
                title="Logout"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="hidden sm:inline">Logout</span>
                <span className="sm:hidden">Out</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Upload Modal */}
      {showUploadModal && (
        <div 
          className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
          }}
          onClick={handleCloseModal}
          onKeyDown={handleKeyDown}
        >
          <div 
            className="bg-white bg-opacity-85 backdrop-blur-2xl rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4 border border-white border-opacity-70"
            style={{
              backdropFilter: 'blur(40px) saturate(180%)',
              WebkitBackdropFilter: 'blur(40px) saturate(180%)',
              boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Upload File</h2>
                <p className="text-sm text-gray-500 mt-1">Upload your portfolio Excel file or stock master data</p>
              </div>
              <button
                onClick={handleCloseModal}
                disabled={uploading}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                File Type <span className="text-red-500">*</span>
              </label>
              <select
                value={uploadType}
                onChange={(e) => {
                  setUploadType(e.target.value as 'holdings' | 'stockMaster');
                  setSelectedFile(null);
                }}
                disabled={uploading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="holdings">Portfolio Holdings (Holding_equity_open.xlsx)</option>
                <option value="stockMaster">Stock Master (NSE_BSE_Active_Scripts_with_ISIN.xlsx)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {uploadType === 'holdings' 
                  ? 'Upload your portfolio holdings, transactions, and P/L data'
                  : 'Upload the master list of stocks with ISIN numbers'}
              </p>
            </div>

            {/* Drag and Drop Area */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select File <span className="text-red-500">*</span>
              </label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50'
                    : selectedFile
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
                } ${uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                onClick={() => !uploading && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileInputChange}
                  disabled={uploading}
                  className="hidden"
                />
                {selectedFile ? (
                  <div className="space-y-2">
                    <svg className="w-12 h-12 mx-auto text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{selectedFile.name}</p>
                      <p className="text-xs text-gray-500 mt-1">{formatFileSize(selectedFile.size)}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      disabled={uploading}
                      className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      Remove file
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <svg className="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <div>
                      <p className="text-sm text-gray-600">
                        <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Excel (.xlsx, .xls) files • Max 50MB</p>
                    </div>
                  </div>
                )}
              </div>
            </div>


            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCloseModal}
                disabled={uploading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {uploading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span>Upload</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

