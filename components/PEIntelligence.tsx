'use client';

import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';

interface PEIntelligenceData {
  stockName: string;
  isin: string;
  sector: string;
  currentPrice: number;
  stockPE: number | null;
  sectorPE: number | null;
  relativeValuation: number | null;
  valuationGap: number | null;
  eps: number | null;
  pegRatio: number | null;
  peSignal: string;
  peColor: string;
  peVolatility: number | null;
  expectedUpside: number | null;
  targetPrice: number | null;
  sectorPeers: string[];
  pdSectorInd: string | null;
  industry: string | null;
  isFNOSec: boolean;
}

interface SectorSummary {
  sector: string;
  avgSectorPE: number;
  avgGap: number;
  holdingsCount: number;
  topUndervalued: string | null;
  topOvervalued: string | null;
  observation: string;
}

export default function PEIntelligence({ clientId = '994826' }: { clientId?: string }) {
  const [data, setData] = useState<PEIntelligenceData[]>([]);
  const [sectorSummary, setSectorSummary] = useState<SectorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPEIntelligence();
  }, [clientId]);

  const fetchPEIntelligence = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/pe-intelligence?clientId=${clientId}`);
      const result = await response.json();
      
      if (result.success) {
        setData(result.data || []);
        setSectorSummary(result.sectorSummary || []);
      } else {
        setError(result.error || 'Failed to fetch PE intelligence data');
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching PE intelligence data');
    } finally {
      setLoading(false);
    }
  };

  const getSignalBadge = (signal: string, color: string) => {
    const colorClasses: { [key: string]: string } = {
      green: 'bg-green-100 text-green-800 border-green-300',
      yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      red: 'bg-red-100 text-red-800 border-red-300',
      gray: 'bg-gray-100 text-gray-800 border-gray-300',
    };

    const icons: { [key: string]: string } = {
      Undervalued: '🟢',
      'Fairly Valued': '⚖️',
      Overvalued: '🔴',
      Neutral: '⚪',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${colorClasses[color] || colorClasses.gray}`}>
        {icons[signal] || '⚪'} {signal}
      </span>
    );
  };

  const getRelativeValuationColor = (val: number | null) => {
    if (val === null) return 'text-gray-500';
    if (val < -10) return 'text-green-600 font-semibold';
    if (val > 10) return 'text-red-600 font-semibold';
    return 'text-yellow-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading PE Intelligence...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error: {error}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-gray-600">No PE data available for holdings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">📊 PE Intelligence & Analytics Dashboard</h2>
        <p className="text-blue-100">
          Analyze valuation efficiency and opportunity gaps between Stock PE and Sector PE
        </p>
      </div>

      {/* PE Intelligence Matrix Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">PE Intelligence Matrix</h3>
          <p className="text-sm text-gray-600 mt-1">
            Compare stock valuations against sector benchmarks
          </p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Stock
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Sector
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Current Price
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Sector PE
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Stock PE
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Rel. Valuation %
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  EPS
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Expected Upside
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Valuation Signal
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Sector Peers
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.map((stock, index) => (
                <tr key={stock.isin} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{stock.stockName}</div>
                    <div className="text-xs text-gray-500">{stock.isin}</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{stock.sector}</div>
                    {stock.industry && (
                      <div className="text-xs text-gray-500">{stock.industry}</div>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                    ₹{stock.currentPrice.toFixed(2)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                    {stock.sectorPE?.toFixed(2) || 'N/A'}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">
                    {stock.stockPE?.toFixed(2) || 'N/A'}
                  </td>
                  <td className={`px-4 py-4 whitespace-nowrap text-right text-sm font-semibold ${getRelativeValuationColor(stock.relativeValuation)}`}>
                    {stock.relativeValuation !== null && stock.relativeValuation !== undefined
                      ? `${stock.relativeValuation > 0 ? '+' : ''}${stock.relativeValuation.toFixed(2)}%`
                      : 'N/A'}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                    {stock.eps ? `₹${stock.eps.toFixed(2)}` : 'N/A'}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm">
                    {stock.expectedUpside !== null && stock.expectedUpside !== undefined ? (
                      <span className={stock.expectedUpside > 0 ? 'text-green-600 font-semibold' : stock.expectedUpside === 0 ? 'text-gray-500' : 'text-red-600'}>
                        {stock.expectedUpside > 0 ? '+' : ''}{stock.expectedUpside.toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-gray-400">N/A</span>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-center">
                    {getSignalBadge(stock.peSignal, stock.peColor)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-xs text-gray-600">
                      {stock.sectorPeers.length > 0 ? (
                        stock.sectorPeers.map((peer, i) => (
                          <div key={i} className="mb-1">
                            • {peer}
                          </div>
                        ))
                      ) : (
                        <span className="text-gray-400">No peers</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sector Summary */}
      {sectorSummary.length > 0 && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800">Sector Intelligence Summary</h3>
            <p className="text-sm text-gray-600 mt-1">
              AI-generated insights by sector
            </p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Sector
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Avg Sector PE
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Avg Gap %
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Top Undervalued
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Top Overvalued
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    AI Observation
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sectorSummary.map((sector, index) => (
                  <tr key={sector.sector} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{sector.sector}</div>
                      <div className="text-xs text-gray-500">{sector.holdingsCount} holdings</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {sector.avgSectorPE.toFixed(2)}
                    </td>
                    <td className={`px-4 py-4 whitespace-nowrap text-right text-sm font-semibold ${getRelativeValuationColor(sector.avgGap)}`}>
                      {sector.avgGap > 0 ? '+' : ''}{sector.avgGap.toFixed(2)}%
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-green-700">
                      {sector.topUndervalued || 'N/A'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-red-700">
                      {sector.topOvervalued || 'N/A'}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      {sector.observation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">📖 Understanding the Metrics</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-800">
          <div>
            <p><strong>Relative Valuation %:</strong> How much the stock PE deviates from sector PE. Negative = undervalued, Positive = overvalued.</p>
            <p className="mt-2"><strong>EPS:</strong> Earnings per share = Price / PE</p>
            <p className="mt-2"><strong>Expected Upside:</strong> Potential gain if stock PE reaches sector PE (only shown for undervalued stocks)</p>
          </div>
          <div>
            <p><strong>🟢 Undervalued:</strong> Stock PE is &gt;10% below sector PE - potential buying opportunity</p>
            <p className="mt-2"><strong>⚖️ Fairly Valued:</strong> Stock PE is within ±10% of sector PE - stable</p>
            <p className="mt-2"><strong>🔴 Overvalued:</strong> Stock PE is &gt;10% above sector PE - caution</p>
          </div>
        </div>
      </div>
    </div>
  );
}

